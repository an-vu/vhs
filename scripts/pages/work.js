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
  // A project's link is its panel's id without "panel-" (#kobachi picks
  // #panel-kobachi), so no element has it and the browser never jumps down to a
  // panel. It goes on the page's clean address (/work, also when opened as /work.html).
  const link = panel => panel.id.replace(/^panel-/, '');
  const page = location.pathname.replace(/\.html$/, '');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  StudioPageScroll(content);

  // Entrance: queued elements fade and rise in with the site's spring, in DOM order,
  // as each comes into view. `shown` once the first view looks still (its springs'
  // last fraction of a pixel aside).
  let items = [], shown = reduced.matches;
  const still = s => s.delay <= 0 && Math.abs(s.target - s.value) < .02 && Math.abs(s.velocity) < .5;
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const item of items) {
      if (!item.spring) continue;
      moving = M.step(item.spring, dt) || moving;
      M.paintEntrance([item.element], [item.spring]);
    }
    if (!shown && pending < 0 && items.every(item => item.seen && (!item.spring || still(item.spring)))) { shown = true; firstRest(); }
    return moving;
  }, () => !reduced.matches);
  let startDelay = M.entranceDelay(0);
  // Starts the queued elements in `visible` rising, each .09 s after the last.
  function begin(visible) {
    let delay = Math.max(startDelay, ...items.map(item => item.spring ? item.spring.delay + .09 : 0));
    for (const item of items) {
      if (!visible.has(item.element)) continue;
      item.seen = true;
      if (item.spring) continue;
      item.spring = M.spring(0, 1, delay);
      delay += .09;
      observer.unobserve(item.element);
    }
    loop.wake();
  }
  const observer = new IntersectionObserver(entries => {
    if (reduced.matches) return;
    for (const item of items) if (entries.some(entry => entry.target === item.element)) item.seen = true;
    begin(new Set(entries.filter(entry => entry.isIntersecting).map(entry => entry.target)));
  });
  function queue(elements, delay) {
    startDelay = delay;
    if (reduced.matches) return;
    for (const element of elements) {
      element.style.opacity = 0;
      items.push({ element, spring: null, seen: false });
      observer.observe(element);
    }
    // What's on screen already starts now, without waiting for the browser to say
    // so: after a swipe an iPhone can be late, and the text stayed blank till then.
    // The rest rises as it scrolls in.
    const onScreen = new Set(elements.filter(element => {
      const box = element.getBoundingClientRect();
      return box.height > 0 && box.bottom > 0 && box.top < innerHeight;
    }));
    if (onScreen.size) begin(onScreen);
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
  // At the very end of each project, the ones either side of it by name
  // ("‹ Reality Check", "Kobachi ›"), so the next one is a click away from the
  // bottom of the page. Picking one works like its logo in the row; the keyboard
  // lands on that logo.
  panels.forEach((panel, i) => {
    const steps = Object.assign(document.createElement('nav'), { className: 'project-steps' });
    steps.setAttribute('aria-label', 'More projects');
    for (const [j, side] of [[i - 1, 'previous'], [i + 1, 'next']]) {
      if (!panels[j]) continue;
      const step = Object.assign(document.createElement('a'), { className: `project-step is-${side}`, href: `#${link(panels[j])}` });
      const arrow = Object.assign(document.createElement('span'), { textContent: side === 'previous' ? '‹\u00a0' : '\u00a0›' });
      arrow.setAttribute('aria-hidden', 'true');
      step.append(labels[j].textContent);
      if (side === 'previous') step.prepend(arrow); else step.append(arrow);
      step.addEventListener('click', event => {
        event.preventDefault();
        select(j);
        tabs[j].focus({ preventScroll: true });
      });
      steps.append(step);
    }
    panel.append(steps);
  });
  // One even 40 px gap (times --dock-size): from the glass's edge to the next
  // logo, and between the logos outside it; a slide moves a logo across the glass
  // and on at that spacing. At most four logos show on each side (the fifth fades
  // out as it arrives), and fewer where the text column is narrower: a logo past
  // the column's edge fades out over half a step (--edge, work.css).
  // On a phone the row is tighter for room, so three things change there: the
  // gaps are 24 px, so two logos fit on each side; the row fades softly into the
  // text column's edges instead (a mask, work.css: nothing shows past them); and
  // the logo next to the glass eases into and out of the extra room the glass
  // takes (a quarter sine), so the row slides as one piece.
  const GAP = 40, PHONE_GAP = 24, SIDE = 4;
  const phone = matchMedia('(max-width: 760px)');
  function spacing() {
    const size = tabs[0].firstElementChild.offsetWidth * .618 / dockScale();
    const glass = parseFloat(getComputedStyle(flow).getPropertyValue('--circle')) || 67;
    const gap = phone.matches ? PHONE_GAP : GAP * dockSize();
    return { size, step: size + gap, first: glass + gap + size / 2 };
  }
  let inset = -1, unit = 0;
  function paint() {
    const middle = flow.clientWidth / 2, half = content.clientWidth / 2;
    // Where the text column starts, for the phone's edge fade (work.css).
    if (phone.matches && middle - half !== inset) flow.style.setProperty('--column-inset', `${(inset = middle - half)}px`);
    const { size, step, first } = spacing();
    if (phone.matches && Math.abs(step - unit) > .5) { unit = step; scroller.style.setProperty('--slot', `${step}px`); syncScroller(); }
    const room = d => d >= 1 ? 1 : Math.sin(d * Math.PI / 2);
    const at = phone.matches
      ? t => t * step + Math.sign(t) * (first - step) * room(Math.abs(t))
      : t => Math.sign(t) * (Math.abs(t) <= 1 ? Math.abs(t) * first : first + (Math.abs(t) - 1) * step);
    tabs.forEach((tab, i) => {
      const offset = at(i - position), x = (middle + offset).toFixed(1);
      const edge = (phone.matches
        ? Math.abs(offset) - size / 2 < half ? 1 : 0
        : Math.max(0, Math.min(1, (half + step / 2 - Math.abs(offset)) / (step / 2), SIDE + 1 - Math.abs(i - position)))).toFixed(3);
      tab.style.transform = copies[i].style.transform = `translate(${x}px, -50%) translateX(-50%)`;
      tab.style.setProperty('--edge', edge);
      // A name never shows in the glass: it fades out as its logo moves in. On a
      // phone only the two logos beside the glass show theirs (the row is too tight
      // for more): a name fades out as its logo moves on past that spot.
      const d = Math.abs(i - position), clear = Math.max(0, Math.min(1, (d - .5) / .5));
      const beside = phone.matches ? Math.max(0, Math.min(1, (1.6 - d) / .4)) : 1;
      if (labels[i]) { labels[i].style.transform = `translateX(${x}px) translateX(-50%)`; labels[i].style.setProperty('--edge', Math.min(edge, clear, beside).toFixed(3)); }
    });
    leave();
    arrive();
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

  // At rest (.7 s after a touch, .4 s after the mouse leaves, a second after the
  // keyboard) the row hides
  // everything but the selected logo in its glass, so it doesn't distract from the
  // page; pointing at the row, touching it or tabbing into it brings it back
  // (work.css). The first rest waits for the page to rise in and the glass to
  // bubble in (it grows in with the row), then a tad more.
  const REST = 1000, TOUCH = 700, LEAVE = 400, FIRST_HOLD = 200;
  let restTimer = 0, pointing = false, glassIn = false, touch = false;
  function wake(delay = touch ? TOUCH : REST) {
    flow.classList.remove('is-resting');
    clearTimeout(restTimer);
    restTimer = setTimeout(() => rest(delay), delay);
  }
  function rest(delay = REST) {
    if (!glassIn || !shown) return;
    // Keyboard focus keeps it up; the focus a click leaves on a logo doesn't.
    if (pointing || journey || flow.querySelector(':focus-visible')) { restTimer = setTimeout(() => rest(delay), delay); return; }
    flow.classList.add('is-resting');
  }
  function firstRest() {
    if (!glassIn || !shown) return;
    clearTimeout(restTimer);
    restTimer = setTimeout(() => rest(), FIRST_HOLD);
  }
  flow.addEventListener('pointerdown', event => { touch = !mouse(event); }, true);
  flow.addEventListener('pointerenter', event => { if (mouse(event)) { pointing = true; wake(); } });
  flow.addEventListener('pointerleave', event => { if (mouse(event)) { pointing = false; wake(LEAVE); } });
  flow.addEventListener('pointerup', event => { if (!mouse(event)) wake(); });
  flow.addEventListener('focusin', () => wake());
  flow.addEventListener('focusout', () => wake());
  function travel(now) {
    motion = 0;
    const t = Math.min(1, (now - journey.start) / journey.duration);
    position = journey.from + (journey.to - journey.from) * journey.curve(t);
    if (t >= 1) { position = journey.to; journey = null; syncScroller(); }
    paint();
    if (journey) motion = requestAnimationFrame(travel);
  }
  function glide(to, duration = DURATION, curve = ease) {
    cancelAnimationFrame(motion);
    if (reduced.matches) { journey = null; position = to; paint(); syncScroller(); return; }
    journey = { from: position, to, start: performance.now(), duration, curve };
    motion = requestAnimationFrame(travel);
  }
  // A project's text comes in once its logo is in the glass: the row has brought
  // it within ENTER of the middle (paint() checks) and its glass is TEXT_AFTER
  // seconds into its bubble (below): the text then lands on the bubble's pop, as it
  // bursts out to full size, so the logo and the text land together. Switching,
  // the text on show fades out quickly first; a far jump waits for its logo, and a
  // swipe that has already brought it there shows it straight away. On the first
  // load the row is already there, so the text waits for the bubble.
  const ENTER = .5, TEXT_AFTER = .22, FADE_OUT = 200;
  let pending = -1, glassTime = -Infinity, left = false;
  // Fades the text on show out (or back in).
  function fade(panel, out) {
    if (!out) { if (panel.style.opacity) panel.style.removeProperty('opacity'); return; }
    if (reduced.matches || panel.style.opacity === '0') return;
    Object.assign(panel.style, { transition: `opacity ${FADE_OUT}ms cubic-bezier(.4, 0, 1, 1)`, opacity: 0 });
  }
  function bring(i) {
    const open = panels.find(panel => !panel.hidden);
    pending = open === panels[i] ? -1 : i;
    fade(open, pending >= 0);
  }
  // Dragged or swiped, the row hasn't picked a project yet (it does once it stops),
  // so the text on show fades once its logo is halfway out of the glass, and stays
  // out, even if the row passes back over it, until the row lands (`left`): then
  // the project it lands on brings its text in, the same one too.
  function leave() {
    if (pending >= 0 || left) return;
    const open = panels.find(panel => !panel.hidden);
    if (open && Math.abs(position - panels.indexOf(open)) > ENTER) { fade(open, true); left = true; }
  }
  function arrive() {
    if (pending < 0 || Math.abs(position - pending) > ENTER || !(reduced.matches || glassTime >= TEXT_AFTER)) return;
    const panel = panels[pending], opened = panel.hidden;
    pending = -1;
    left = false;
    panels.forEach(other => {
      other.hidden = other !== panel;
      other.style.removeProperty('opacity');
      other.style.removeProperty('transition');
    });
    forget(panels.flatMap(other => [...other.children]));
    queue([...panel.children], 0);
    // The page got longer or shorter: the footer and the bottom bounce start over
    // (page-scroll listens for toggles inside the content).
    if (opened) panel.dispatchEvent(new Event('toggle'));
  }
  function select(i, { focus = false, first = false, settled = false, duration, curve } = {}) {
    if (i === current && !first) return;
    current = i;
    tabs.forEach((tab, j) => {
      tab.setAttribute('aria-selected', String(j === i));
      tab.tabIndex = j === i ? 0 : -1;
      labels[j]?.classList.toggle('is-selected', j === i);
    });
    wake();
    if (first) {
      panels.forEach((panel, j) => { panel.hidden = j !== i; });
      // Its text waits for the glass (arrive()), out of sight till then.
      if (!reduced.matches) [...panels[i].children].forEach(child => { child.style.opacity = 0; });
      pending = i;
    } else {
      history.replaceState(null, '', `${page}#${link(panels[i])}`);
      bring(i);
    }
    if (first || settled) { position = i; paint(); syncScroller(); }
    else glide(i, duration, curve);
    if (focus) tabs[i].focus();
    if (first) return;
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
  // stops a glide where it is. While it's held and moving, every name shows
  // (work.css); they fade once it lets go. Only once it moves, so a plain tap
  // still shows nothing (see above).
  const easeOut = t => 1 - (1 - t) ** 3;
  let drag = null;
  flow.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || (phone.matches && event.pointerType !== 'mouse')) return;
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
      flow.classList.add('is-dragging');
      cancelAnimationFrame(motion); journey = null;
      Object.assign(drag, { x: event.clientX, from: position });
      flow.setPointerCapture(event.pointerId);
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
    flow.classList.remove('is-dragging');
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
    if (target === current) { if (left) pending = current; glide(current, duration, easeOut); }
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
  // On a phone a finger moves the row through an invisible native scroller with
  // one stopping point per project (work.css): the phone's own momentum and snap,
  // as in its alarm wheels and lists. A small flick stops on the next project, a
  // harder one carries further, and it brakes and settles into place itself; the
  // row just follows where it is. A tap on it picks the logo under the finger.
  const scroller = Object.assign(document.createElement('div'), { className: 'project-scroller' });
  scroller.setAttribute('aria-hidden', 'true');
  scroller.append(Object.assign(document.createElement('div'), { className: 'project-scroller-stops' }));
  scroller.firstChild.append(...tabs.map(() => document.createElement('span')));
  flow.append(scroller);
  let ignoreScroll = 0, settleTimer = 0;
  // Puts the scroller on the row's project without its scroll counting as a finger.
  function syncScroller() {
    if (!phone.matches || !unit || journey) return;
    const left = Math.round(Math.max(0, Math.min(count - 1, Math.round(position))) * unit);
    if (Math.abs(scroller.scrollLeft - left) < 1) return;
    ignoreScroll = performance.now() + 150;
    scroller.scrollLeft = left;
  }
  function settle() {
    clearTimeout(settleTimer);
    flow.classList.remove('is-dragging');
    const i = clampIndex(Math.round(scroller.scrollLeft / unit));
    if (i !== current) select(i, { settled: true });
    else { position = i; if (left) pending = i; paint(); }
  }
  scroller.addEventListener('scroll', () => {
    if (!unit || performance.now() < ignoreScroll) return;
    cancelAnimationFrame(motion); journey = null;
    position = scroller.scrollLeft / unit;
    paint();
    wake();
    flow.classList.add('is-dragging');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 140);
  }, { passive: true });
  scroller.addEventListener('scrollend', () => { if (performance.now() >= ignoreScroll) settle(); });
  scroller.addEventListener('click', event => {
    const hit = tabs.findIndex(tab => {
      const box = tab.getBoundingClientRect();
      return parseFloat(tab.style.getPropertyValue('--edge')) > .05 && event.clientX >= box.left && event.clientX <= box.right;
    });
    if (hit >= 0) select(hit);
  });

  const linked = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return -1; }
    return panels.findIndex(panel => link(panel) === id);
  };
  select(linked() >= 0 ? linked() : current, { first: true });
  flow.classList.add('is-placed');
  if (location.pathname !== page) history.replaceState(null, '', page + location.search + location.hash);
  addEventListener('hashchange', () => { if (linked() >= 0) select(linked()); });
  new ResizeObserver(paint).observe(flow);
  queue([flow], M.entranceDelay(0));
  reduced.addEventListener('change', () => { forget(items.map(item => item.element)); });

  // The line under each project's text asks about it: an email to the studio with
  // the subject filled in. Clicking also copies the address and shows it in the
  // link's place, for a computer with no mail app set up (the email opens nothing
  // there). Year Five's asks to see what's new, and answers; the answer stays.
  for (const link of content.querySelectorAll('.project-link a[href^="mailto:"]')) {
    link.addEventListener('click', () => {
      const address = decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
      navigator.clipboard?.writeText(address).catch(() => {});
      link.textContent = address;
    });
  }
  const egg = content.querySelector('.project-egg');
  egg?.addEventListener('click', () => {
    egg.textContent = egg.dataset.answer;
    egg.classList.add('is-answered');
  }, { once: true });

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

  // The glass over the selected project and the logo strip (scripts/glass): loaded
  // after the page, and only where WebGL works; without it the page stays as is.
  // The project glass bubbles in with the row, a hair after it starts rising in;
  // the strip's waits a moment once in view (data-glass-delay, work.html). Each
  // lens opens with its glass (--lens-grow, work.css): the big, colored logos
  // inside the circle grow in with the bubble, not before it.
  const hosts = [...document.querySelectorAll('.glass-spot[data-glass]')].map(spot => spot.parentElement);
  const open = (host, grow) => {
    const value = grow.toFixed(3);
    if (host.style.getPropertyValue('--lens-grow') !== value) host.style.setProperty('--lens-grow', value);
  };
  const glassDone = () => { glassIn = true; firstRest(); };
  hosts.forEach(host => {
    open(host, 0);
    host.querySelector('.glass-spot').addEventListener('glassgrow', ({ detail }) => {
      open(host, detail.grow);
      if (host !== flow) return;
      glassTime = detail.time;
      arrive();
      if (detail.done) glassDone();
    });
  });
  const GLASS_LAG = .05;
  import('../glass/glass.js').then(({ createGlass }) => {
    const row = items.find(item => item.element === flow)?.spring;
    flow.querySelector('.glass-spot').dataset.glassDelay = (Math.max(0, row ? row.delay : startDelay) + GLASS_LAG).toFixed(2);
    return createGlass();
  })
    .catch(error => { console.warn('Glass unavailable:', error); return null; })
    .then(glass => { if (!glass) { hosts.forEach(host => open(host, 1)); glassTime = Infinity; arrive(); glassDone(); } });
})();

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
