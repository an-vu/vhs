import { createPageMenu } from '../shared/page-menu.js';

// Work: the project's title moves into the header as it scrolls up, so the header
// reads "vHuman / Work › / Year Five ›", like a large title folding into the bar.
// It starts as the title reaches the header's blur and lands as the title's top
// would reach the top of the screen, so it follows the scroll both ways. On the
// way, the title shrinks to the header's size and its letters close up to the
// header's spacing; a longer title ("vHuman, Year Five") drops its first part
// ("vHuman, ") in the first half, so the short name lands. In the header the name
// opens a menu of the other projects (page-menu.js); picking one switches to it
// like the logo row. Where the three parts don't fit on one line (most phones with
// a long name), the header's words shrink to fit as the name comes in; the header
// itself keeps its height. Reduce motion: the name just appears once the title is
// half under the header. A scroll that ends near where the title has landed and
// the project's first picture starts just below the header settles there (the
// reading position, below). Returns the header's menus (page-menu.js).
export function dockProjectTitle({ panels, labels, ids, select }) {
  const header = document.querySelector('.site-header');
  const bar = header?.querySelector('.header-inner');
  const heading = bar?.querySelector('.page-heading');
  if (!heading) return createPageMenu();
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // " / Year Five ›" after the heading (out of it, so the page's heading stays
  // "vHuman / Work"), and its menu: every project but the one on show.
  const crumb = document.createElement('span');
  crumb.className = 'project-crumb is-flying';
  crumb.setAttribute('data-nosnippet', '');
  crumb.inert = true;
  const slash = Object.assign(document.createElement('span'), { className: 'crumb-slash', textContent: ' / ' });
  const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'page-menu-toggle project-toggle' });
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'project-menu');
  crumb.append(slash, toggle);
  heading.after(crumb);
  const menu = Object.assign(document.createElement('nav'), { className: 'page-menu', id: 'project-menu' });
  menu.setAttribute('aria-label', 'Projects');
  menu.setAttribute('data-nosnippet', '');
  const items = labels.map((label, i) => {
    const item = Object.assign(document.createElement('a'), { href: `#${ids[i]}`, textContent: label });
    item.addEventListener('click', event => { event.preventDefault(); select(i); });
    menu.append(item);
    return item;
  });
  bar.append(menu);
  const menus = createPageMenu();

  // The title in flight: a copy over everything (the real one hides meanwhile).
  const flight = document.createElement('div');
  flight.className = 'title-flight';
  flight.setAttribute('aria-hidden', 'true');
  const lead = document.createElement('span'), name = document.createElement('span');
  flight.append(lead, name);
  document.body.append(flight);

  const textRect = (node, from = 0) => {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, node.length);
    return range.getBoundingClientRect();
  };
  let title = null, tagline = null, index = -1, base = 0, fit = 0, full = 0, reach = 0;
  let titleSize = 0, titleSpacing = 0, headerSpacing = 0, last = -1, frame = 0;
  // Measured once (measure()), so a frame reads only the scroll: the line where
  // the fold starts (the blur), where the name sets off and lands (its left edge
  // and middle), where the name sits inside the flight at the title's size and at
  // the header's, and the scroll positions where things start and finish.
  let top = 0, from = null, land = null, inTitle = null, inHeader = null;
  let foldStart = 0, foldEnd = 1, leaveStart = 0, leaveEnd = 1, reader = Infinity, stops = false;
  // A spot on the page, from the layout (an entrance's rise doesn't move it).
  const pageTop = element => { let y = 0; for (let e = element; e; e = e.offsetParent) y += e.offsetTop; return y; };

  // The project on show: its title, its short name in the crumb and the flight,
  // and the menu without it.
  function project() {
    const i = panels.findIndex(panel => !panel.hidden);
    const next = panels[i]?.querySelector('.project-title') ?? null;
    if (next === title && i === index) return;
    title?.classList.remove('is-docked');
    tagline?.style.removeProperty('--leaving');
    title = next;
    tagline = panels[i]?.querySelector('.project-tagline') ?? null;
    index = i;
    if (!title) return;
    const text = title.textContent.trim(), label = labels[i];
    lead.textContent = text.endsWith(label) ? text.slice(0, text.length - label.length) : '';
    name.textContent = toggle.textContent = label;
    items.forEach((item, j) => { item.hidden = j === i; });
    measure();
  }
  function measure() {
    if (!title) return;
    // The header at its own size: the crumb's full width, and the size the
    // header's words take when all three parts must fit on one line.
    header.style.removeProperty('--brand-size');
    crumb.style.setProperty('--crumb-width', 'none');
    const style = getComputedStyle(root);
    base = parseFloat(style.getPropertyValue('--brand-size'));
    reach = parseFloat(style.getPropertyValue('--blur-reach')) || 0;
    stops = style.getPropertyValue('--reader-stop').trim() !== '0';
    full = crumb.getBoundingClientRect().width;
    const needed = heading.getBoundingClientRect().width + full;
    fit = Math.min(base, base * (bar.clientWidth - 8) / needed);
    // Where the name lands: its place once the header has made all its room.
    if (fit < base) header.style.setProperty('--brand-size', `${fit}px`);
    const landed = textRect(toggle.firstChild);
    land = { left: landed.left, middle: (landed.top + landed.bottom) / 2 };
    const said = getComputedStyle(heading);
    headerSpacing = parseFloat(said.letterSpacing) / parseFloat(said.fontSize);
    const words = heading.getBoundingClientRect().bottom;
    const titleStyle = getComputedStyle(title);
    titleSize = parseFloat(titleStyle.fontSize);
    titleSpacing = parseFloat(titleStyle.letterSpacing) / titleSize || 0;
    Object.assign(flight.style, { fontFamily: titleStyle.fontFamily, fontWeight: titleStyle.fontWeight, color: titleStyle.color });
    // Where the name sets off: its place in the title, as the title's top meets the blur.
    top = header.getBoundingClientRect().bottom + reach;
    const box = title.getBoundingClientRect(), at = textRect(title.firstChild, lead.textContent.length);
    from = { left: at.left, middle: (at.top + at.bottom) / 2 - box.top + top };
    // Where the name sits inside the flight, at both ends.
    const inside = (size, spacing) => {
      Object.assign(flight.style, { fontSize: `${size}px`, letterSpacing: `${spacing}em`, transform: 'none' });
      const r = textRect(name.firstChild);
      return { left: r.left, middle: (r.top + r.bottom) / 2 };
    };
    inTitle = inside(titleSize, titleSpacing);
    inHeader = inside(fit, headerSpacing);
    // The reading position: the project's first picture (or its "Image coming
    // soon" box) just below the header's blur, sharp, with the title in the
    // header and the tagline gone. The gallery's picture sits inside its stage
    // (vflow.css), so it's measured from the stage.
    const first = tagline?.nextElementSibling;
    const stage = first?.querySelector('.vflow-stage'), card = stage?.querySelector('.vflow-card');
    const picture = stage && card ? pageTop(stage) + (stage.offsetHeight - card.offsetHeight) / 2 : first ? pageTop(first) : Infinity;
    reader = Math.round(picture - top - 8);
    // The fold runs from the title reaching the blur to the reading position, so
    // it lands there (Year Five: about 100 px of scroll on a phone, 150 on a
    // computer); if a page is laid out
    // so there's no room for that, it runs 1.6 times the blur's line instead.
    foldStart = pageTop(title) - top;
    foldEnd = reader - foldStart >= 40 ? reader : foldStart + top * 1.6;
    // The tagline ("Home improvement.") leaves from 40 px before it reaches the
    // blur until it reaches the bottom of the header's words, gone by the reading
    // position at the latest (whether that fades it: --tagline-fade, work.css).
    if (tagline) {
      leaveStart = pageTop(tagline) - top - 40;
      leaveEnd = Math.max(leaveStart + 1, Math.min(pageTop(tagline) - words, foldEnd));
    }
    stops = stops && foldEnd === reader && reader < root.scrollHeight - innerHeight;
    snap(stops, picture);
    last = -1;
    update();
  }
  // Each frame: from the scroll alone (no layout reads), set everything. Tied
  // straight to the scroll, so it never lags the finger (Nov 10: a spring that
  // glided after it lagged, then jumped), at an even pace (an ease made it hang,
  // then rush), so the name moves on one straight line.
  function update() {
    frame = 0;
    if (!title) return;
    const y = scrollY;
    tagline?.style.setProperty('--leaving', Math.min(1, Math.max(0, (y - leaveStart) / (leaveEnd - leaveStart))).toFixed(3));
    const p = Math.min(1, Math.max(0, (y - foldStart) / (foldEnd - foldStart)));
    const e = reduced.matches ? (p >= .5 ? 1 : 0) : p;
    if (e === last) return;
    last = e;
    // The header makes room ahead of the name (done by 60% of the way), so the
    // name never lands on "Work".
    const room = Math.min(1, e / .6);
    const size = base + (fit - base) * room;
    if (fit < base && e > 0) header.style.setProperty('--brand-size', `${size}px`);
    else header.style.removeProperty('--brand-size');
    crumb.style.setProperty('--crumb-width', `${full * size / base * room}px`);
    slash.style.opacity = room;
    const docked = e >= 1, flying = e > 0 && !docked;
    crumb.classList.toggle('is-flying', !docked);
    // Only when it changes: setting it at all counts as a change to the page, and
    // the logo row's glass copies the page again for anything but a style change
    // (glass-renderer.js), which on phones made the fold stutter (Nov 10).
    if (crumb.inert === docked) crumb.inert = !docked;
    title.classList.toggle('is-docked', e > 0);
    // The project's own menu closes once its name starts to leave; another open
    // menu follows the header recentring.
    if (!docked && toggle.getAttribute('aria-expanded') === 'true') menus.close();
    else menus.place();
    flight.classList.toggle('is-flying', flying);
    if (!flying) return;
    // The name's left edge and middle travel from where it set off to where it
    // lands while its size and spacing change by the same amount; the flight is
    // placed so the name is exactly there. The size is the real font size, not a
    // scaled picture (which read bolder).
    const mix = (a, b) => a + (b - a) * e;
    flight.style.fontSize = `${mix(titleSize, fit)}px`;
    flight.style.letterSpacing = `${mix(titleSpacing, headerSpacing)}em`;
    lead.style.opacity = Math.max(0, 1 - e * 2);
    const x = mix(from.left, land.left) - mix(inTitle.left, inHeader.left);
    const y2 = mix(from.middle, land.middle) - mix(inTitle.middle, inHeader.middle);
    flight.style.transform = `translate(${x}px, ${y2}px)`;
  }

  // The reading position's catch, a detent (Nov 11, An: free scrolling, but "that
  // feeling when things go into place... like cạch", "the pause, the snap... not
  // the pixel"): the browser's own snapping, gentle mode, switched on only within
  // NEAR px of the reading position while scrolling down. A scroll that ends that
  // close settles the last bit into place, a flick slows into it
  // (scroll-snap-stop), and anywhere else scrolling stays free (always on, Safari
  // pulled from hundreds of px away: "tiny scroll boom it right there"). Once it has
  // caught, it lets go, so the next scroll down is free; it's ready again once
  // you've gone back up above it. Never going up. (Nov 10: a stop made in code
  // felt like hitting a bumper.) A switch: --reader-stop in work.css.
  // 48 at first, then 24 (An, Nov 11: "anything less than 48px?"), settled at 36 ("36px?").
  const NEAR = 36;
  const snapAt = Object.assign(document.createElement('div'), { className: 'reader-snap-point' });
  snapAt.setAttribute('aria-hidden', 'true');
  document.body.append(snapAt);
  let armed = true, lastY = scrollY, down = false;
  function snap(on, picture) {
    if (on) {
      // The point sits on the picture's top; the page's scroll-padding keeps it 8
      // px below the blur, which puts the resting place exactly on the reading position.
      root.style.setProperty('--reader-top', `${top + 8}px`);
      snapAt.style.top = `${picture}px`;
    }
    watch();
  }
  function watch() {
    const y = scrollY;
    if (y !== lastY) { down = y > lastY; root.classList.toggle('is-scrolling-down', down); }
    if (y < reader - NEAR * 2) armed = true;
    else if (armed && Math.abs(y - reader) < 1) armed = false;
    // On only coming down into it; once on, it stays on while it settles (a settle
    // can move up a little).
    if (!stops || !armed || Math.abs(y - reader) > NEAR) root.classList.remove('reader-snap');
    else if (down) root.classList.add('reader-snap');
    lastY = y;
  }

  const soon = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', () => { watch(); soon(); }, { passive: true });
  addEventListener('resize', measure);
  reduced.addEventListener('change', () => { last = -1; soon(); });
  document.fonts?.ready.then(measure);
  // Switching projects shows another panel (work.js arrive()); a gallery taking
  // its place, or anything else changing the panel's size, moves the reading
  // position.
  const shown = new MutationObserver(project);
  const resized = new ResizeObserver(() => measure());
  panels.forEach(panel => {
    shown.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    resized.observe(panel);
  });
  project();
  return menus;
}
