import { createProgram, createTexture } from './gl.js';
import { glassShader } from './glass-shader.js';
import { createSnapshot } from './page-snapshot.js';

// Draws glass over a live page. A see-through canvas sits on top of the page and
// draws only the glass (plus its shadow). Inside the glass it bends a copy of
// what the page shows right there (page-snapshot.js), so outside it you see the
// real thing. The copy of the scrolling page lives in a ring texture: scrolling
// only paints and uploads the strip that comes into view, and anything that
// changes (a spring, a fade, a drifting logo) only repaints its own rows, and
// only as wide as the glasses can see.
//
// The caller owns the loop and the shapes. attach() points it at a page (the
// same one, or a page in a frame), resize() at the canvas's size, and draw()
// paints one frame: shapes in CSS px of the canvas, which covers the view, its
// top `offset` px below the view's (0 unless it's held inside the page), with
//   x, y        center          hw, hh   half width and height
//   radius      corner radius   smooth   corner exponent (2 round, 5 Apple)
//   k           effect scale (the shape next to the one the look was tuned on)
//   scale, appear, burst        entrance (1, 1, 0 at rest)
// and a look (glass/opus.js has the keys). `extra` adds GLSL (glass-shader.js);
// `uniforms(gl, U, look)` sets the extra pieces' uniforms each frame.
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = p => p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
// Overshoots past 1 before settling; a bigger kick overshoots more (1.7 is about 10%).
const easeOutBack = (p, kick = 1.70158) => 1 + (kick + 1) * (p - 1) ** 3 + kick * (p - 1) ** 2;

// A shape `t` seconds into its entrance. Bubble: a small drop, then a boom out
// to the full shape (it bursts past full size, about 20%, settles, and becomes
// the rounded rectangle on the way). Fade: a quick fade and a slight grow.
export function entering(shape, kind, t) {
  let { hw, hh, radius, smooth } = shape, scale = 1, appear = 1, burst = 0;
  if (kind === 'bubble' && t < 1.4) {
    const r0 = Math.min(hw, hh), hold = .4;
    const drop = .38 * (1 - (1 - clamp01(t / hold)) ** 3);
    const boom = easeOutBack(clamp01((t - hold) / .32), 2.4);
    const grow = mix(drop, 1, boom), morph = easeInOut(clamp01((t - hold - .05) / .35));
    hw = mix(r0, hw, morph) * grow; hh = mix(r0, hh, morph) * grow;
    radius = mix(r0, radius, morph) * grow;
    smooth = mix(2, smooth, morph);
    scale = Math.max(grow, .01);
    appear = clamp01(t / .06);
    burst = Math.sin(Math.PI * clamp01((t - hold) / .8));
  } else if (kind === 'fade' && t < .6) {
    const e = easeInOut(clamp01(t / .5));
    appear = e; scale = .96 + .04 * e;
    hw *= scale; hh *= scale; radius *= scale;
  }
  return { ...shape, hw, hh, radius, smooth, scale, appear, burst };
}

export function createGlassRenderer(canvas, { extra = {}, uniforms } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const { U } = createProgram(gl, glassShader(extra));
  const ringTexture = createTexture(gl, 0), fixedTexture = createTexture(gl, 1), liveTexture = createTexture(gl, 2);
  gl.uniform1i(U.uScrollTex, 0);
  gl.uniform1i(U.uFixedTex, 1);
  gl.uniform1i(U.uLiveTex, 2);
  const snapshot = createSnapshot(() => { dirty = true; });
  const strip = document.createElement('canvas'), part = document.createElement('canvas'), fixedCanvas = document.createElement('canvas'), liveCanvas = document.createElement('canvas');
  // The page copies are drawn in memory, not on the GPU, and go up as raw pixels:
  // reading a GPU canvas back to upload it made the page wait for the GPU (a few
  // ms whenever anything under the glass moved).
  for (const copy of [strip, part, fixedCanvas, liveCanvas]) copy.getContext('2d', { willReadFrequently: true });
  // Rows v0..v1 of the page (device px) are in the ring, at row % rows. Stale
  // spans changed since they were painted; they're repainted once the glass needs them.
  const ring = { w: 0, rows: 0, v0: 0, v1: 0 };
  let stale = [], clip = null;
  // The live layer (the rover) is copied at CSS resolution: it redraws every
  // frame, and a full Retina copy would cost several ms each time.
  let fixedBlock = null, fixedDirty = true, liveDirty = true, liveOn = 0;

  // Style changes (springs, fades) only repaint the rows of the elements that
  // changed; anything else (a project opening, an image loading) repaints it all.
  const changed = new Set(), animating = new Set();
  let lastRects = new WeakMap(), fixedParents = new WeakMap();
  let dpr = 1, dirty = true, doc = null, win = null, observer = null, ignored = [], unhook = () => {};
  // The canvas's top on the page and in the view (CSS px), set each frame.
  let canvasTop = 0, offset = 0;

  // Points the glass at a page: make its WebGL canvases keep their last frame
  // (the rover renders on demand, so a copy would otherwise come back blank) and
  // note every draw, then listen for anything that changes what it shows.
  // `ignore`: elements whose changes don't matter (the glass's own canvas).
  // `skip(record)`: mutation records to leave out (true = ignore it).
  function attach(nextWin, nextDoc, { ignore = [], skip } = {}) {
    unhook();
    win = nextWin; doc = nextDoc; ignored = ignore; dirty = true;
    changed.clear(); animating.clear(); lastRects = new WeakMap(); fixedParents = new WeakMap();
    const proto = win.HTMLCanvasElement.prototype, getContext = proto.getContext;
    proto.getContext = function (type, options) {
      const context = getContext.call(this, type, /webgl/.test(type) && this !== canvas ? { ...options, preserveDrawingBuffer: true } : options);
      if (context && /webgl/.test(type) && this !== canvas && !context.__glassWatched) {
        context.__glassWatched = true;
        for (const name of ['drawArrays', 'drawElements', 'clear']) {
          const draw = context[name];
          context[name] = function (...args) { liveDirty = true; return draw.apply(this, args); };
        }
      }
      return context;
    };
    const mark = () => { dirty = true; };
    // Script animations (element.animate, as vFlow uses) fire no events, so count them in and out here.
    const animate = win.Element.prototype.animate, running = new Map();
    win.Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      running.set(this, (running.get(this) ?? 0) + 1);
      animating.add(this);
      const done = () => {
        const left = running.get(this) - 1;
        if (left > 0) { running.set(this, left); return; }
        running.delete(this); animating.delete(this); changed.add(this);
      };
      animation.finished.then(done, done);
      return animation;
    };
    // Scrolling itself needs nothing: the ring catches up with the new rows.
    observer?.disconnect();
    observer = new win.MutationObserver(records => {
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || ignored.some(element => element === target || element.contains(target)) || skip?.(record)) continue;
        if (record.type === 'attributes' && record.attributeName === 'style' && target !== doc.documentElement) changed.add(target);
        else dirty = true;
      }
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const listeners = [[win, 'resize', mark], [doc, 'load', mark, true]];
    // Transitions and CSS animations change what's drawn without any mutation.
    for (const [run, ...ends] of [['transitionrun', 'transitionend', 'transitioncancel'], ['animationstart', 'animationend', 'animationcancel']]) {
      listeners.push([doc, run, event => animating.add(event.target), true]);
      for (const end of ends) listeners.push([doc, end, event => { animating.delete(event.target); changed.add(event.target); }, true]);
    }
    for (const [target, type, listener, capture] of listeners) target.addEventListener(type, listener, capture);
    doc.fonts?.addEventListener('loadingdone', mark);
    unhook = () => {
      proto.getContext = getContext; win.Element.prototype.animate = animate;
      for (const [target, type, listener, capture] of listeners) target.removeEventListener(type, listener, capture);
      doc.fonts?.removeEventListener('loadingdone', mark);
    };
  }

  function resize(width, height, ratio) {
    dpr = ratio;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    dirty = true;
  }

  // One frame. `time` (s) drives the slow corner sway.
  function draw(shapes, look, time, viewOffset = 0) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    shapes = shapes.filter(item => item.appear > 0);
    if (!doc?.body || !shapes.length) return;
    const cssH = canvas.height / dpr;
    offset = viewOffset; canvasTop = win.scrollY + offset;

    // Copy only the area the glasses can show (device px), on a 64px grid so small moves reuse it.
    const snap = (v, up) => (up ? Math.ceil : Math.floor)(v / 64) * 64;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const padOf = item => (40 + look.wall * 2 * Math.max(item.k, 1) + (look.echoOn ? look.echoGap * item.k * (look.echoes + .4) + 6 : 0) + (look.shadow > 0 ? 110 : 0)) * dpr;
    for (const item of shapes) {
      const pad = padOf(item);
      x0 = Math.min(x0, snap((item.x - item.hw) * dpr - pad)); y0 = Math.min(y0, snap((item.y - item.hh) * dpr - pad));
      x1 = Math.max(x1, snap((item.x + item.hw) * dpr + pad, true)); y1 = Math.max(y1, snap((item.y + item.hh) * dpr + pad, true));
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(canvas.width, x1); y1 = Math.min(canvas.height, y1);
    if (x1 <= x0 || y1 <= y0) return;
    if (dirty) { dirty = false; ring.v1 = ring.v0; fixedDirty = liveDirty = true; changed.clear(); stale = []; clip = null; }
    // A glass that moved sideways can reach columns the ring skipped: fill them in.
    if (clip && ring.v1 > ring.v0) {
      if (x0 < clip[0]) paintRows(ring.v0, ring.v1, x0, clip[0]);
      if (x1 > clip[1]) paintRows(ring.v0, ring.v1, clip[1], x1);
      clip = [Math.min(clip[0], x0), Math.max(clip[1], x1)];
    }
    updateRing(x0, y0, x1, y1);
    refreshChanged(x0, y0, x1, y1);
    const block = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, offset };
    if (!fixedBlock || ['x', 'y', 'w', 'h', 'offset'].some(key => fixedBlock[key] !== block[key])) { fixedBlock = block; fixedDirty = liveDirty = true; }
    // The fixed layer is copied where it sits in the view.
    const inView = { ...block, y: block.y + Math.round(offset * dpr) };
    if (fixedDirty) {
      fixedDirty = false;
      snapshot.fixed(fixedCanvas, doc, inView, dpr);
      fixedTexture.image(fixedCanvas, false);
    }
    if (liveDirty) {
      liveDirty = false;
      const css = { x: Math.floor(inView.x / dpr), y: Math.floor(inView.y / dpr), w: Math.ceil(block.w / dpr), h: Math.ceil(block.h / dpr) };
      const z = snapshot.fixed(liveCanvas, doc, css, 1, true);
      // The About text sits at z-index 1, so a rover at 0 or below is behind it.
      liveOn = z === null ? 0 : z <= 0 ? 1 : 2;
      if (liveOn) liveTexture.image(liveCanvas, false);
    }

    // The page's own background, so dark and light handling follow what's really there.
    const bodyStyle = win.getComputedStyle(doc.body);
    const fill = /rgba?\([^)]*,\s*0\)$/.test(bodyStyle.backgroundColor) ? win.getComputedStyle(doc.documentElement).backgroundColor : bodyStyle.backgroundColor;
    const bg = (fill.match(/[\d.]+/g) ?? [249, 248, 246]).slice(0, 3).map(v => v / 255);
    const lum = bg[0] * .299 + bg[1] * .587 + bg[2] * .114;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform4f(U.uRing, ring.w, ring.rows, Math.round(canvasTop * dpr), 0);
    gl.uniform4f(U.uFixed, fixedBlock.x, fixedBlock.y, fixedBlock.w, fixedBlock.h);
    gl.uniform1f(U.uLiveOn, liveOn);
    gl.uniform1f(U.uEdgePow, look.edgePower ?? 2.4);
    gl.uniform1f(U.uRimBand, look.rimBand ?? 0);
    gl.uniform1f(U.uBulgeRing, look.bulgeRing ? 1 : 0);
    gl.uniform1f(U.uBulgeSoft, look.bulgeSoft ?? 1);
    // The site's header and footer bars blur what's under them; the copy does too.
    const headerElement = doc.querySelector('.site-header'), footerElement = doc.querySelector('.site-footer');
    const reach = (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--blur-reach')) || 22) * dpr;
    const header = headerElement?.getBoundingClientRect(), footer = footerElement?.getBoundingClientRect();
    const footerOpacity = footerElement ? parseFloat(win.getComputedStyle(footerElement).opacity) : 0;
    gl.uniform4f(U.uHeader, header ? (header.top - offset) * dpr : 0, header ? header.height * dpr : 0, reach, 0);
    gl.uniform4f(U.uFooter, footer ? (footer.top - offset) * dpr : 0, footer ? (footer.bottom - offset) * dpr : 0, reach, footerOpacity);
    gl.uniform3fv(U.uBg, bg);
    gl.uniform1f(U.uDark, 1 - Math.min(Math.max((lum - .3) / .3, 0), 1));
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uZoom, look.zoom);
    gl.uniform1f(U.uFold, look.fold);
    gl.uniform1f(U.uProfile, { lab: 1, smoothstep: 2 }[look.profile] ?? 0);
    gl.uniform1f(U.uRimGlow, look.rimGlow);
    gl.uniform1f(U.uWarp, Math.min(look.warp, .3));
    gl.uniform1f(U.uChroma, look.chroma);
    gl.uniform1f(U.uVivid, look.vivid);
    gl.uniform1f(U.uReach, look.reach ?? 0);
    gl.uniform1f(U.uSharp, look.sharpLogo ? 1 : 0);
    gl.uniform1f(U.uStreak, look.streak ?? 0);
    gl.uniform1f(U.uStreakThin, look.streakThin ?? .8);
    gl.uniform1f(U.uRimLight, look.rimLight);
    gl.uniform1f(U.uBevelShade, look.bevelShade);
    gl.uniform1f(U.uShine, look.shine);
    gl.uniform1f(U.uBulge, look.bulge);
    gl.uniform1f(U.uWallLight, look.wallLight);
    gl.uniform1f(U.uDeep, look.deep);
    gl.uniform1f(U.uInner, look.inner);
    gl.uniform1f(U.uShadow, look.shadow);
    gl.uniform1f(U.uCorners, { all: 0, film: 1, flip: -1, diagonal: 2, tight: 3 }[look.corners] ?? 0);
    gl.uniform1f(U.uFocus, look.cornerFocus);
    gl.uniform1f(U.uQuiet, look.quiet);
    gl.uniform1f(U.uSway, look.cornerSway);
    gl.uniform1f(U.uAngle, look.cornerAngle * Math.PI / 180);
    uniforms?.(gl, U, look);
    // Premultiplied glass over a clear canvas: each glass blends over the ones before it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Each glass only shades its own box (plus its shadow), not the whole canvas.
    gl.enable(gl.SCISSOR_TEST);
    for (const item of shapes) {
      const pad = padOf(item), left = Math.max(0, Math.floor((item.x - item.hw) * dpr - pad)), right = Math.min(canvas.width, Math.ceil((item.x + item.hw) * dpr + pad));
      const bottom = Math.max(0, Math.floor((cssH - item.y - item.hh) * dpr - pad)), top = Math.min(canvas.height, Math.ceil((cssH - item.y + item.hh) * dpr + pad));
      if (right <= left || top <= bottom) continue;
      gl.scissor(left, bottom, right - left, top - bottom);
      // Effect sizes follow the glass: its size next to the tuned one, and the bubble growing in.
      const size = item.scale * item.k, short = Math.min(item.hw, item.hh);
      gl.uniform1f(U.uScale, size);
      gl.uniform1f(U.uAppear, item.appear);
      gl.uniform2f(U.uC, item.x * dpr, (cssH - item.y) * dpr);
      gl.uniform2f(U.uHalf, item.hw * dpr, item.hh * dpr);
      gl.uniform1f(U.uRadius, Math.max(1, Math.min(item.radius, short) * dpr));
      gl.uniform1f(U.uSmooth, item.smooth);
      gl.uniform1f(U.uBezel, look.bezel * short * dpr);
      gl.uniform1f(U.uRefr, look.refraction * size * dpr);
      gl.uniform1f(U.uRimWidth, look.rimWidth * size * dpr);
      gl.uniform1f(U.uBulgeR, (look.bulgeWidth ? look.bulgeWidth * size : look.bulgeDepth * short) * dpr);
      gl.uniform1f(U.uWall, Math.min(look.wall * size, short * .3) * dpr);
      gl.uniform1f(U.uInnerW, look.innerWidth * size * dpr);
      item.uniforms?.(gl, U, size, short, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  // Keeps page rows y0..y1 of the current view (plus some slack) in the ring,
  // painting only rows that aren't there yet. The ring holds a screen and a bit.
  function updateRing(x0, y0, x1, y1) {
    // Rows come in only as wide as the glasses can show (see refreshChanged).
    const fill = (a, b) => { paintRows(a, b, x0, x1); narrow(x0, x1); };
    const slack = Math.round(160 * dpr), rows = canvas.height + 2 * slack;
    if (ring.w !== canvas.width || ring.rows !== rows) {
      Object.assign(ring, { w: canvas.width, rows, v0: 0, v1: 0 });
      clip = null;
      ringTexture.data(ring.w, ring.rows, null, true);
    }
    const sy = Math.round(canvasTop * dpr), top = sy + y0, bottom = sy + y1;
    if (top >= ring.v0 && bottom <= ring.v1) return;
    if (ring.v1 <= ring.v0 || bottom + slack <= ring.v0 || top - slack >= ring.v1) {
      ring.v0 = top - slack; ring.v1 = bottom + slack;
      clip = null;
      fill(ring.v0, ring.v1);
      return;
    }
    // While scrolling, top up a little ahead each frame instead of a big chunk now and then.
    const lead = Math.round(48 * dpr);
    if (top < ring.v0) {
      fill(top - lead, ring.v0);
      ring.v0 = top - lead; ring.v1 = Math.min(ring.v1, ring.v0 + rows);
    }
    if (bottom > ring.v1) {
      fill(ring.v1, bottom + lead);
      ring.v1 = bottom + lead; ring.v0 = Math.max(ring.v0, ring.v1 - rows);
    }
  }
  // Marks the rows that changed elements cover now and covered last time, then
  // repaints the stale rows the glass can see (y0..y1 of the view, device px).
  // Only the columns the glasses can show (x0..x1) are repainted: a logo strip
  // that moves every frame then costs its slice under the glass, not a band
  // the whole page wide. `clip` remembers that the ring is only good there.
  function refreshChanged(x0, y0, x1, y1) {
    const spans = [...stale], sy = win.scrollY, sx = win.scrollX;
    const grid = (v, up) => (up ? Math.ceil : Math.floor)(v / 64) * 64;
    for (const element of [...changed, ...animating]) {
      if (!element.isConnected) continue;
      if (isFixed(element)) { fixedDirty = liveDirty = true; continue; }
      const r = element.getBoundingClientRect(), before = lastRects.get(element);
      const now = [r.top + sy, r.bottom + sy, r.left + sx, r.right + sx];
      lastRects.set(element, now);
      // First sighting: its old spot is unknown, so allow for a short slide.
      const margin = before ? 4 : Math.max(48, (now[1] - now[0]) / 2);
      const a = Math.max(ring.v0, Math.floor((Math.min(now[0], before?.[0] ?? now[0]) - margin) * dpr));
      const b = Math.min(ring.v1, Math.ceil((Math.max(now[1], before?.[1] ?? now[1]) + margin) * dpr));
      const left = Math.max(0, grid((Math.min(now[2], before?.[2] ?? now[2]) - sx - margin) * dpr));
      const right = Math.min(ring.w, grid((Math.max(now[3], before?.[3] ?? now[3]) - sx + margin) * dpr, true));
      if (b > a && right > left) spans.push([a, b, left, right]);
    }
    changed.clear();
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1]) Object.assign(last, [last[0], Math.max(last[1], span[1]), Math.min(last[2], span[2]), Math.max(last[3], span[3])]);
      else merged.push([...span]);
    }
    const top = Math.round(canvasTop * dpr) + y0, bottom = Math.round(canvasTop * dpr) + y1;
    stale = [];
    for (const [a, b, left, right] of merged) {
      const c = Math.max(a, top), d = Math.min(b, bottom), l = Math.max(left, x0), r = Math.min(right, x1);
      if (d > c && r > l) paintRows(c, d, l, r);
      if (l > left || r < right) narrow(x0, x1);
      if (a < Math.min(b, top)) stale.push([a, Math.min(b, top), left, right]);
      if (Math.max(a, bottom) < b) stale.push([Math.max(a, bottom), b, left, right]);
    }
    // Rows that left the ring don't need repainting later.
    stale = stale.map(([a, b, l, r]) => [Math.max(a, ring.v0), Math.min(b, ring.v1), l, r]).filter(([a, b]) => b > a);
  }
  // The ring is only good from x0 to x1 now (device px).
  function narrow(x0, x1) {
    if (x0 > 0 || x1 < ring.w) clip = clip ? [Math.max(clip[0], x0), Math.min(clip[1], x1)] : [x0, x1];
  }
  function isFixed(element) {
    let value = fixedParents.get(element);
    if (value === undefined) {
      value = false;
      for (let node = element; node && node !== doc.documentElement; node = node.parentElement) {
        const position = win.getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') { value = true; break; }
      }
      fixedParents.set(element, value);
    }
    return value;
  }
  function paintRows(a, b, left = 0, right = ring.w) {
    const target = left > 0 || right < ring.w ? part : strip;
    for (let y = a; y < b;) {
      const offset = ((y % ring.rows) + ring.rows) % ring.rows, n = Math.min(b - y, ring.rows - offset);
      snapshot.scroll(target, doc, { x: left, y, w: right - left, h: n }, dpr);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ringTexture.texture);
      const pixels = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, left, offset, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      y += n;
    }
  }

  return {
    attach, resize, draw,
    // Something changed that the page itself doesn't report (its colors, say): copy it all again.
    invalidate() { dirty = true; },
    detach() { unhook(); observer?.disconnect(); observer = null; doc = win = null; }
  };
}
