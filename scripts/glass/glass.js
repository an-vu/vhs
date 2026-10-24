import { createGlassRenderer, entering } from './glass-renderer.js';
import { opus } from './opus.js';

// Glass on any page. Mark an element with data-glass and a glass sits on it,
// following it as the page scrolls and moves; everything else is the page as
// usual, and clicks go straight through. data-glass="circle" (the default) is a
// circle as big as the element's short side; data-glass="rect" fits the
// element's box with its own corner radius.
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
  const canvas = document.createElement('canvas');
  canvas.className = 'glass-layer';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-glass-ignore', '');
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(zIndex) });
  document.body.append(canvas);
  const renderer = createGlassRenderer(canvas);
  if (!renderer) { canvas.remove(); return null; }
  renderer.attach(window, document, { ignore: [canvas] });

  // Each glass grows in (the look's entrance) the first time it comes into view.
  const seen = new Map(), onScreen = new Set();
  let targets = [], raf = 0, last = 0, clock = 0;
  const watcher = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { onScreen.add(entry.target); if (!seen.has(entry.target)) seen.set(entry.target, clock); }
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
    const shape = { x, y, hw, hh, radius, smooth, k: Math.min(hw, hh) / reference };
    return entering(shape, look.entrance, clock - seen.get(target));
  }

  function resize() {
    renderer.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2));
    start();
  }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
    last = now; clock += dt;
    renderer.draw(targets.filter(target => onScreen.has(target)).map(shapeOf).filter(Boolean), look, clock);
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
