// The logo strip at the end of the Work page (the Glass Lab's Icon tab uses it
// too). Logos drift right to left through seven spots, five in view: one fades in
// from the 7th spot to the 6th, passes the middle, and fades out from the 2nd to
// the 1st, one glass apart (the spacing comes from the caller).
//
// The order is random, new on every load: each round shows every logo once in a
// fresh shuffle, and a logo never comes back within fourteen in a row, across
// rounds too, so the seven spots never repeat one and none of them is in the next
// seven.
//
// The circle in the middle (the glass in the Glass Lab) is a lens: inside it a
// logo is big and in its brand colors, outside it small and flat in the row's
// grade color (light parts cut out, so a shield or a seal keeps its inside). Two
// layers, each cut to its side of the circle, so a logo crossing the edge is half
// one, half the other. Dark brand colors use --logo-ink, so a dark page can
// lighten them.
const SPOTS = 7, GAP = 2 * SPOTS;
const NS = 'http://www.w3.org/2000/svg';
const clamp = value => Math.max(0, Math.min(1, value));

// `items`: [{ logo, fit: [width, height] }], the logo's box in --logo-unit (see
// work.css), from its farthest point. `folder`: where the SVGs are.
export function createLogoStrip(strip, items, folder) {
  const slot = () => {
    const element = Object.assign(document.createElement('span'), { className: 'client-slot' });
    element.append(Object.assign(document.createElement('span'), { className: 'client-logo' }));
    return element;
  };
  const flat = Array.from({ length: SPOTS }, slot), colored = Array.from({ length: SPOTS }, slot);
  const layer = (className, side, slots) => {
    const element = Object.assign(document.createElement('div'), { className });
    element.dataset.glassCircle = side;
    element.append(...slots);
    return element;
  };
  strip.replaceChildren(...(items.length ? [layer('client-flats', 'outside', flat), layer('client-colors', 'inside', colored)] : []));

  const svgs = new Map();
  function load(item) {
    if (!svgs.has(item.logo)) svgs.set(item.logo, fetch(new URL(`${item.logo}.svg`, folder))
      .then(response => response.ok ? response.text() : Promise.reject(response.status))
      .then(text => copies(text, item.logo))
      .catch(error => { console.warn(`Logo ${item.logo} unavailable:`, error); return null; }));
    return svgs.get(item.logo);
  }

  // The running order: a shuffled round at a time, skipping anything shown in the
  // last GAP - 1 places.
  let order = [], first = 0, bag = [];
  function next() {
    if (!bag.length) bag = items.slice();
    const recent = new Set(order.slice(-(GAP - 1)));
    const choices = bag.filter(item => !recent.has(item));
    const pool = choices.length ? choices : bag;
    const item = pool[Math.floor(Math.random() * pool.length)];
    bag.splice(bag.indexOf(item), 1);
    return item;
  }
  function at(n) {
    while (first + order.length <= n) order.push(next());
    if (order.length > 4 * GAP) { order.splice(0, GAP); first += GAP; }
    return order[n - first];
  }

  // `scroll`: spots passed so far (it only grows); `step`: px between spots.
  // Where the strip is too narrow for the fades at the 2nd and 6th spots (a
  // phone), a logo also fades out before it reaches the edge, not cut off by it.
  function paint(scroll, step) {
    if (!items.length) return;
    const middle = strip.clientWidth / 2, base = Math.floor(scroll), fraction = scroll - base;
    for (let k = 0; k < SPOTS; k++) {
      const n = base + k, item = at(n);
      const offset = k - 3 - fraction, d = Math.abs(offset);
      // Gone just as the widest logo (a quarter step each side of its middle) would touch it.
      const edge = clamp((middle - d * step - .26 * step) / (.35 * step));
      const transform = `translateX(${(middle + offset * step).toFixed(1)}px) translateX(-50%)`, opacity = Math.min(clamp(3 - d), edge).toFixed(3);
      for (const [element, kind] of [[flat[n % SPOTS], 'mono'], [colored[n % SPOTS], 'color']]) {
        if (element.dataset.logo !== item.logo) show(element, item, kind);
        element.style.transform = transform;
        element.style.opacity = opacity;
      }
      const element = flat[n % SPOTS];
      element.style.setProperty('--a', clamp(1 - d).toFixed(3));
      element.style.setProperty('--b', clamp(2 - d).toFixed(3));
    }
  }
  function show(element, item, kind) {
    element.dataset.logo = item.logo;
    const logo = element.firstChild;
    logo.replaceChildren();
    logo.style.width = `calc(var(--logo-unit) * ${item.fit[0]})`;
    logo.style.height = `calc(var(--logo-unit) * ${item.fit[1]})`;
    load(item).then(pair => {
      if (pair && element.dataset.logo === item.logo) logo.replaceChildren(pair[kind].cloneNode(true));
    });
  }
  items.slice(0, SPOTS + 1).forEach(load);
  return { paint };
}

// The brand-color copy, and the flat one: the logo becomes a mask (light parts
// clear, everything else solid) over a rect in currentColor. Its ids get a prefix
// so both copies can sit on one page.
function copies(text, name) {
  const parse = source => new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  const color = parse(text);
  color.setAttribute('data-color', '');
  color.setAttribute('aria-hidden', 'true');
  const prefixed = text
    .replace(/(\sid=")([^"]+)"/g, '$1mono-$2"')
    .replace(/url\(#([^)]+)\)/g, 'url(#mono-$1)')
    .replace(/(href=")#([^"]+)"/g, '$1#mono-$2"');
  const mono = parse(prefixed);
  const [x, y, width, height] = mono.getAttribute('viewBox').split(/[\s,]+/);
  const make = (tag, attributes) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const area = { x, y, width, height };
  // Alpha × 3 − luminance × 3: white parts go clear, colors and dark parts stay solid.
  const filter = make('filter', { id: `mono-${name}-filter`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', ...area });
  filter.append(make('feColorMatrix', { type: 'matrix', values: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -.6378 -2.1456 -.2166 3 0' }));
  const mask = make('mask', { id: `mono-${name}-mask`, maskUnits: 'userSpaceOnUse', ...area });
  const group = make('g', { filter: `url(#mono-${name}-filter)` });
  group.append(...mono.childNodes);
  mask.append(group);
  const defs = make('defs', {});
  defs.append(filter, mask);
  mono.append(defs, make('rect', { ...area, fill: 'currentColor', mask: `url(#mono-${name}-mask)` }));
  // Inside the mask dark brand colors must stay dark, whatever the page sets.
  mono.style.setProperty('--logo-ink', '#000');
  mono.setAttribute('aria-hidden', 'true');
  return { color, mono };
}
