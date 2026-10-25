import { StudioMotion } from '../shared/motion.js';
import { StudioPageScroll } from '../shared/page-scroll.js';
import { createLogoStrip } from './logo-strip.js';

// The Work page: a row of project logos as tabs. Picking one slides the row
// (vFlow's motion) so it sits in the middle, under the glass, names each one, and
// shows its panel below.
// Like the site's lists, things rise in with the entrance spring as they come into
// view, and the footer appears at the bottom. #project links pick a project.
(() => {
  const M = StudioMotion;
  const content = document.querySelector('.work-content');
  if (!content) return;
  const flow = content.querySelector('.project-flow');
  const track = flow.querySelector('.project-flow-track');
  const tabs = [...track.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  StudioPageScroll(content);

  // Entrance: queued elements fade and rise in with the site's spring, in DOM order,
  // as each comes into view.
  let items = [];
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const item of items) {
      if (!item.spring) continue;
      moving = M.step(item.spring, dt) || moving;
      M.paintEntrance([item.element], [item.spring]);
    }
    return moving;
  }, () => !reduced.matches);
  let startDelay = M.entranceDelay(0);
  const observer = new IntersectionObserver(entries => {
    if (reduced.matches) return;
    const visible = new Set(entries.filter(entry => entry.isIntersecting).map(entry => entry.target));
    let delay = Math.max(startDelay, ...items.map(item => item.spring ? item.spring.delay + .09 : 0));
    for (const item of items) {
      if (item.spring || !visible.has(item.element)) continue;
      item.spring = M.spring(0, 1, delay);
      delay += .09;
      observer.unobserve(item.element);
    }
    loop.wake();
  });
  function queue(elements, delay) {
    startDelay = delay;
    if (reduced.matches) return;
    for (const element of elements) {
      element.style.opacity = 0;
      items.push({ element, spring: null });
      observer.observe(element);
    }
  }
  function forget(elements) {
    items = items.filter(item => {
      if (!elements.includes(item.element)) return true;
      observer.unobserve(item.element);
      item.element.removeAttribute('style');
      return false;
    });
  }

  // The row moves like vFlow: one continuous position that eases to the target
  // over a second (vFlow's curve). It has ends, in the page's order (Year Five
  // first, on the left). A new pick takes over from wherever the row is, so a
  // tap mid-slide counts. The glass circle and the logos are the indicator, so
  // there are no dots.
  const count = tabs.length, DURATION = 1000;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const clampIndex = value => Math.max(0, Math.min(count - 1, value));
  // The glass circle in the middle is a lens (work.css): logos are small outside
  // it and big inside, with a copy of each in .project-lens for the inside:
  // vHuman grey outside, ink inside.
  const lens = Object.assign(document.createElement('div'), { className: 'project-lens' });
  lens.dataset.glassCircle = 'inside';
  lens.setAttribute('aria-hidden', 'true');
  const copies = tabs.map(tab => {
    const copy = document.createElement('span');
    copy.append(tab.firstElementChild.cloneNode(true));
    return copy;
  });
  lens.append(...copies);
  track.dataset.glassCircle = 'outside';
  flow.append(lens);
  // The docks' sizes (work.css).
  const dockScale = () => parseFloat(getComputedStyle(flow).getPropertyValue('--dock-scale')) || 1;
  const dockSize = () => parseFloat(getComputedStyle(flow).getPropertyValue('--dock-size')) || 1;
  let current = Math.max(0, panels.findIndex(panel => !panel.hidden));
  let position = current, journey = null, motion = 0;
  const labels = [...flow.querySelectorAll('.project-labels > span')];
  // One even 40 px gap (times --dock-size): from the glass's edge to the next
  // logo, and between the logos outside it; a slide moves a logo across the glass
  // and on at that spacing. At most four logos show on each side (the fifth fades
  // out as it arrives), and fewer where the text column is narrower: a logo past
  // the column's edge fades out over half a step (--edge, work.css).
  const GAP = 40, SIDE = 4;
  function spacing() {
    const size = tabs[0].firstElementChild.offsetWidth * .618 / dockScale();
    const glass = parseFloat(getComputedStyle(flow).getPropertyValue('--circle')) || 67;
    const gap = GAP * dockSize();
    return { step: size + gap, first: glass + gap + size / 2 };
  }
  function paint() {
    const middle = flow.clientWidth / 2, half = content.clientWidth / 2;
    const { step, first } = spacing();
    const at = t => Math.sign(t) * (Math.abs(t) <= 1 ? Math.abs(t) * first : first + (Math.abs(t) - 1) * step);
    tabs.forEach((tab, i) => {
      const offset = at(i - position), x = (middle + offset).toFixed(1);
      const edge = Math.max(0, Math.min(1, (half + step / 2 - Math.abs(offset)) / (step / 2), SIDE + 1 - Math.abs(i - position))).toFixed(3);
      tab.style.transform = copies[i].style.transform = `translate(${x}px, -50%) translateX(-50%)`;
      tab.style.setProperty('--edge', edge);
      if (labels[i]) { labels[i].style.transform = `translateX(${x}px) translateX(-50%)`; labels[i].style.setProperty('--edge', edge); }
    });
  }
  // A logo's name shows only while a mouse points at it (or it's focused), under it (work.css).
  // A touch shows nothing as the finger lands: on an iPhone, a tap that makes
  // something appear counts as a hover, and Safari holds its click back (a second
  // tap was needed to pick a project). Touch wakes the row once the finger lifts.
  const mouse = event => event.pointerType === 'mouse';
  tabs.forEach((tab, i) => {
    const show = on => labels[i]?.classList.toggle('is-shown', on);
    tab.addEventListener('pointerenter', event => { if (mouse(event)) show(true); });
    tab.addEventListener('pointerleave', () => show(false));
    tab.addEventListener('focus', () => show(tab.matches(':focus-visible')));
    tab.addEventListener('blur', () => show(false));
  });

  // At rest (a second after the pointer leaves) the row hides everything but the
  // selected logo in its glass, so it doesn't distract from the page; pointing at
  // the row, touching it or tabbing into it brings it back (work.css).
  const REST = 1000;
  let restTimer = 0, pointing = false;
  function wake() {
    flow.classList.remove('is-resting');
    clearTimeout(restTimer);
    restTimer = setTimeout(rest, REST);
  }
  function rest() {
    // Keyboard focus keeps it up; the focus a click leaves on a logo doesn't.
    if (pointing || journey || flow.querySelector(':focus-visible')) { restTimer = setTimeout(rest, REST); return; }
    flow.classList.add('is-resting');
  }
  flow.addEventListener('pointerenter', event => { if (mouse(event)) { pointing = true; wake(); } });
  flow.addEventListener('pointerleave', event => { if (mouse(event)) { pointing = false; wake(); } });
  flow.addEventListener('pointerup', event => { if (!mouse(event)) wake(); });
  flow.addEventListener('focusin', wake);
  flow.addEventListener('focusout', wake);
  function travel(now) {
    motion = 0;
    const t = Math.min(1, (now - journey.start) / journey.duration);
    position = journey.from + (journey.to - journey.from) * journey.curve(t);
    if (t >= 1) { position = journey.to; journey = null; }
    paint();
    if (journey) motion = requestAnimationFrame(travel);
  }
  function glide(to, duration = DURATION, curve = ease) {
    cancelAnimationFrame(motion);
    if (reduced.matches) { journey = null; position = to; paint(); return; }
    journey = { from: position, to, start: performance.now(), duration, curve };
    motion = requestAnimationFrame(travel);
  }
  function select(i, { focus = false, first = false, duration, curve } = {}) {
    if (i === current && !first) return;
    const previous = panels[current];
    current = i;
    tabs.forEach((tab, j) => {
      tab.setAttribute('aria-selected', String(j === i));
      tab.tabIndex = j === i ? 0 : -1;
      labels[j]?.classList.toggle('is-selected', j === i);
    });
    wake();
    if (first) { position = i; paint(); }
    else glide(i, duration, curve);
    panels.forEach((panel, j) => { panel.hidden = j !== i; });
    if (focus) tabs[i].focus();
    if (first) return;
    history.replaceState(null, '', `#${panels[i].id}`);
    forget([...previous.children]);
    queue([...panels[i].children], .04);
    // The page got longer or shorter: the footer and the bottom bounce start over
    // (page-scroll listens for toggles inside the content).
    panels[i].dispatchEvent(new Event('toggle'));
    if (flow.getBoundingClientRect().top < 0) flow.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'instant' : 'smooth' });
  }
  let suppressClick = false;
  tabs.forEach((tab, i) => tab.addEventListener('click', () => { if (!suppressClick) select(i); }));
  track.addEventListener('keydown', event => {
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: count - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(clampIndex(next), { focus: true });
  });
  // Drag or swipe the row sideways: it follows the finger (pulling back past the
  // ends), then coasts on at the swipe's speed and stops on the project nearest
  // to where a phone's list would stop (iOS's deceleration), so a fast swipe
  // crosses several projects and a slow one steps to the next. Taking hold
  // stops a glide where it is.
  const easeOut = t => 1 - (1 - t) ** 3;
  let drag = null;
  flow.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, from: position, moves: [] };
  });
  flow.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.horizontal) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) <= 10 || Math.abs(dx) <= Math.abs(dy)) return;
      drag.horizontal = suppressClick = true;
      flow.setPointerCapture(event.pointerId);
      cancelAnimationFrame(motion); journey = null;
      Object.assign(drag, { x: event.clientX, from: position });
    }
    let to = drag.from - (event.clientX - drag.x) / spacing().step;
    if (to < 0) to *= .35;
    else if (to > count - 1) to = count - 1 + (to - count + 1) * .35;
    position = to;
    paint();
    wake();
    drag.moves.push([event.timeStamp, event.clientX]);
    while (drag.moves.length > 2 && event.timeStamp - drag.moves[0][0] > 100) drag.moves.shift();
  });
  function release(time) {
    // Speed over the last tenth of a second (projects per ms); none if the finger stopped.
    const moves = drag.moves.filter(([t]) => time - t < 100);
    let speed = 0;
    if (moves.length > 1 && moves.at(-1)[0] > moves[0][0]) speed = -(moves.at(-1)[1] - moves[0][1]) / (moves.at(-1)[0] - moves[0][0]) / spacing().step;
    const target = clampIndex(Math.round(position + speed * .998 / (1 - .998)));
    const distance = Math.abs(target - position);
    // An ease-out leaves at three times its average speed: match the finger's.
    const duration = Math.sign(speed) === Math.sign(target - position) && Math.abs(speed) > 1e-4
      ? Math.min(1200, Math.max(300, 3 * distance / Math.abs(speed)))
      : Math.min(600, 300 + 200 * distance);
    if (target === current) glide(current, duration, easeOut);
    else select(target, { duration, curve: easeOut });
  }
  flow.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.horizontal) release(event.timeStamp);
    drag = null;
  });
  flow.addEventListener('pointercancel', event => {
    if (drag?.horizontal) { drag.moves = []; release(event.timeStamp); }
    drag = null;
  });
  const linked = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return -1; }
    return panels.findIndex(panel => panel.id === id);
  };
  // A #project link picks that project but keeps the page at the top: the panel
  // shares the project's id, so the browser would otherwise jump down to it.
  const toTop = () => scrollTo({ top: 0, behavior: 'instant' });
  if (linked() >= 0) {
    toTop();
    addEventListener('load', toTop, { once: true });
  }
  select(linked() >= 0 ? linked() : current, { first: true });
  addEventListener('hashchange', () => { if (linked() >= 0) { toTop(); select(linked()); } });
  new ResizeObserver(paint).observe(flow);
  queue([flow, ...panels[current].children], M.entranceDelay(0));
  reduced.addEventListener('change', () => { forget(items.map(item => item.element)); });

  // The logo strip at the end of the page drifts right to left through seven
  // spots, in a random order (see logo-strip.js), its logos one glass apart (its
  // circle's width), where the project row's first neighbours sit too. It's
  // outside the content, so the bottom bounce and the entrances leave it alone.
  // Resting the pointer on its glass (or a finger) eases it to a crawl, so the
  // logo there can be read and the glass looked at.
  const strip = document.querySelector('.work-clients-strip');
  const logos = createLogoStrip(strip, [...document.querySelectorAll('.work-clients-list li')].map(li => ({
    logo: li.dataset.logo, fit: li.dataset.fit.split(' ').map(Number)
  })), new URL('../../images/logos/', import.meta.url));
  const SPEED = .3, CRAWL = SPEED / 10; // spots per second
  let scroll = 0, speed = SPEED, last = 0, frame = 0, visible = true, held = false;
  // The strip's glass circle radius (work.css).
  const radius = () => parseFloat(getComputedStyle(strip).getPropertyValue('--circle')) || 67;
  const place = () => logos.paint(scroll, 2 * radius());
  function drift(now) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    speed += ((held ? CRAWL : SPEED) - speed) * Math.min(1, dt * 6);
    scroll += speed * dt;
    place();
    run();
  }
  // On the glass: inside the middle circle.
  function onGlass(event) {
    const box = strip.getBoundingClientRect();
    return Math.hypot(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2)) <= radius();
  }
  strip.addEventListener('pointermove', event => { held = onGlass(event); });
  strip.addEventListener('pointerdown', event => { held = onGlass(event); });
  strip.addEventListener('pointerleave', () => { held = false; });
  strip.addEventListener('pointerup', event => { if (!mouse(event)) held = false; });
  function run() {
    if (frame) return;
    if (!visible || document.hidden || reduced.matches) { last = 0; return; }
    frame = requestAnimationFrame(drift);
  }
  new ResizeObserver(place).observe(strip);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; run(); }).observe(strip);
  document.addEventListener('visibilitychange', run);
  reduced.addEventListener('change', run);
  place();
  run();
})();

// The glass over the selected project and the logo strip (scripts/glass): loaded
// after the page, and only where WebGL works; without it the page stays as is.
import('../glass/glass.js').then(({ createGlass }) => createGlass())
  .catch(error => console.warn('Glass unavailable:', error));

// Galleries upgrade to vFlow; without it they stay as plain images.
const galleries = [...document.querySelectorAll('.work-content .project-gallery')];
if (galleries.length) import('../vflow/vflow.js').then(({ createVFlow }) => {
  galleries.forEach(container => {
    const images = [...container.querySelectorAll('figure')].map(figure => {
      const image = figure.querySelector('img');
      const sources = [...figure.querySelectorAll('picture > source')].map(source => ({
        type: source.type, srcset: source.getAttribute('srcset'), sizes: source.getAttribute('sizes')
      }));
      return { src: image?.getAttribute('src'), alt: image?.alt || '', sources,
        caption: figure.querySelector('figcaption')?.textContent || '' };
    });
    const title = container.closest('.project-panel').querySelector('.project-title').textContent;
    // Inside the same container, so its entrance and place in the panel carry over.
    try { container.replaceChildren(createVFlow(images, title)); }
    catch (error) { console.warn('Gallery kept as static images:', error); }
  });
}).catch(error => console.warn('Gallery enhancement unavailable:', error));
