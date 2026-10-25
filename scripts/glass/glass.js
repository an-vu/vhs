import { createGlassRenderer, entering, entranceGrown } from './glass-renderer.js';
import { opus } from './opus.js';

// Glass on any page. Mark an element with data-glass and a glass sits on it,
// following it as the page scrolls and moves; everything else is the page as
// usual, and clicks go straight through. data-glass="circle" (the default) is a
// circle as big as the element's short side; data-glass="rect" fits the
// element's box with its own corner radius.
//
// A glass grows in (the look's entrance) once it's fully in view, after its
// element's data-glass-delay (seconds, 0 by default). While it grows, the
// element gets a 'glassgrow' event each frame: detail.grow is the glass's size
// (0 before it starts, a little over 1 as it bursts past full size, then 1),
// detail.time how far into its entrance it is (seconds, below 0 while it waits),
// and detail.done is true on the last one, once it's full size.
//
//   createGlass (from this file, scripts/glass/glass.js):
//   createGlass();                       // Opus, every [data-glass] on the page
//   createGlass({ look, selector, zIndex });
//
// The look's lengths are px on a glass with a 200 px short side (`reference`);
// a glass of another size scales them. Without WebGL it returns null and the
// page stays as it is. It only runs while a glass is on screen, and does
// nothing inside a frame marked data-glass-host (a tool drawing its own glass).
export function createGlass({ look = opus, selector = '[data-glass]', zIndex = 4, reference = 200 } = {}) {
  // A page shown inside a glass tool (the Glass Lab's frame, data-glass-host)
  // already has glass drawn over it.
  if (window.frameElement?.hasAttribute('data-glass-host')) return null;
  // The canvas rides in the page, not fixed to the screen: a phone scrolls the
  // page apart from its scripts, so a fixed canvas could only catch up after each
  // step (the glass lagged and stuck). Each frame it moves to the view and draws
  // there, and between frames it scrolls with the page, glass and all.
  const canvas = document.createElement('canvas');
  canvas.className = 'glass-layer';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-glass-ignore', '');
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: String(zIndex) });
  document.body.append(canvas);
  const renderer = createGlassRenderer(canvas);
  if (!renderer) { canvas.remove(); return null; }
  renderer.attach(window, document, { ignore: [canvas] });

  // Glasses near the view are drawn; each one's entrance starts once it's fully in view.
  const starts = new Map(), grown = new Set(), onScreen = new Set();
  let targets = [], raf = 0, last = 0, clock = 0;
  const watcher = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    }
    start();
  }, { rootMargin: '120px' });
  function scan() {
    watcher.disconnect();
    targets = [...document.querySelectorAll(selector)];
    targets.forEach(target => watcher.observe(target));
    start();
  }

  function shapeOf(target) {
    const box = target.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    let hw, hh, radius, smooth;
    if (target.dataset.glass === 'rect') {
      hw = box.width / 2; hh = box.height / 2;
      radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || look.roundness * Math.min(hw, hh);
      smooth = look.smoothness;
    } else {
      hw = hh = radius = Math.min(box.width, box.height) / 2;
      smooth = 2;
    }
    // Fully in view (or filling it, for a glass taller than the view).
    if (!starts.has(target) && Math.min(box.bottom, innerHeight) - Math.max(box.top, 0) >= Math.min(box.height, innerHeight) - 1) {
      starts.set(target, clock + (parseFloat(target.dataset.glassDelay) || 0));
    }
    const t = starts.has(target) ? clock - starts.get(target) : -1;
    const shape = entering({ x, y, hw, hh, radius, smooth, k: Math.min(hw, hh) / reference }, look.entrance, t);
    if (!grown.has(target)) {
      const done = t >= entranceGrown(look.entrance);
      if (done) grown.add(target);
      target.dispatchEvent(new CustomEvent('glassgrow', { detail: { grow: shape.appear * shape.scale, time: t, done } }));
    }
    return shape;
  }

  // The view's size in CSS px, set on the canvas too: a phone's 100vh is the
  // tallest view (toolbar hidden), so with the toolbar showing the canvas was
  // stretched and the glass drawn lower the further down the screen it sat.
  let width = 0, height = 0;
  function resize() {
    width = document.documentElement.clientWidth; height = innerHeight;
    Object.assign(canvas.style, { width: `${width}px`, height: `${height}px` });
    renderer.resize(width, height, Math.min(devicePixelRatio || 1, 2));
    start();
  }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now; clock += dt;
    if (innerHeight !== height || document.documentElement.clientWidth !== width) resize();
    const shapes = targets.filter(target => onScreen.has(target)).map(shapeOf).filter(Boolean);
    // Kept inside the page (past its ends while it bounces), so it never makes the page longer.
    const end = document.body.getBoundingClientRect().bottom + scrollY;
    const top = Math.min(Math.max(scrollY, 0), Math.max(0, end - height)), offset = top - scrollY;
    canvas.style.transform = `translate(${scrollX}px, ${top}px)`;
    renderer.draw(shapes.map(shape => ({ ...shape, y: shape.y - offset })), look, clock, offset);
    start();
  }
  function start() {
    if (raf) return;
    if (!onScreen.size || document.hidden) { last = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', start);
  resize();
  scan();

  return {
    // Looks for [data-glass] elements again (after adding or removing some).
    refresh: scan,
    destroy() {
      cancelAnimationFrame(raf); raf = 0;
      watcher.disconnect();
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      renderer.detach();
      canvas.remove();
    }
  };
}
