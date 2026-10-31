import { startProgram, createTexture } from './gl.js';
import { glassShader, pageShader } from './glass-shader.js';
import { createSnapshot } from './page-snapshot.js';

// Draws glass over a live page. A see-through canvas sits on top of the page and
// draws only the glass (plus its shadow). Inside the glass it bends a copy of
// what the page shows right there (page-snapshot.js), so outside it you see the
// real thing. The copy of the scrolling page lives in a ring texture: scrolling
// only paints and uploads the strip that comes into view, and anything that
// changes (a spring, a fade, a drifting logo) only repaints its own rows, and
// only as wide as the glasses can see.
//
// A logo strip ([data-glass-marquee]) moves every frame. Its logos are pictures
// (page-snapshot.js), so the copy keeps the page under them once and lays the
// logos over it in memory each frame (marquee() below): reading a fresh copy back
// every frame cost a 2016 MacBook Pro half its processor time.
//
// Each frame the page as the glasses see it (the copy, the header and footer
// glass, what sits in those bars) is drawn once into a texture for the area they
// can show (pageShader()), so the glass's many samples per pixel are one lookup
// each. Its shaders are built in the background where the browser can (gl.js):
// ready() says when it can draw, and draw() draws nothing until then.
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

// How long each entrance takes, in seconds (the bubble's burst of light ends at
// 1.2 s), and when its shape is full size (the bubble's at .8 s).
export const entranceLength = kind => ({ bubble: 1.2, fade: .6 })[kind] ?? 0;
export const entranceGrown = kind => ({ bubble: .8, fade: .6 })[kind] ?? 0;

// A shape `t` seconds into its entrance (before 0 it isn't there yet). Bubble: a
// small drop, then a boom out to the full shape (it bursts past full size, about
// 20%, settles, and becomes the rounded rectangle on the way). Fade: a quick fade
// and a slight grow.
export function entering(shape, kind, t) {
  let { hw, hh, radius, smooth } = shape, scale = 1, appear = 1, burst = 0;
  if (kind === 'bubble' && t < entranceLength(kind)) {
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
  } else if (kind === 'fade' && t < entranceLength(kind)) {
    const e = easeInOut(clamp01(t / .5));
    appear = e; scale = .96 + .04 * e;
    hw *= scale; hh *= scale; radius *= scale;
  }
  return { ...shape, hw, hh, radius, smooth, scale, appear, burst };
}

export function createGlassRenderer(canvas, { extra = {}, uniforms } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const builds = [startProgram(gl, pageShader()), startProgram(gl, glassShader(extra))];
  let U = null, P = null, pageProgram = null, glassProgram = null, failed = false;
  const ringTexture = createTexture(gl, 0), fixedTexture = createTexture(gl, 1), liveTexture = createTexture(gl, 2), pageTexture = createTexture(gl, 3);
  const pageTarget = gl.createFramebuffer();
  let pageSize = '';
  function ready() {
    if (U || failed) return !!U;
    if (!builds.every(build => build.ready())) return false;
    try {
      ({ program: pageProgram, U: P } = builds[0].finish());
      gl.uniform1i(P.uScrollTex, 0);
      gl.uniform1i(P.uFixedTex, 1);
      gl.uniform1i(P.uLiveTex, 2);
      ({ program: glassProgram, U } = builds[1].finish());
      gl.uniform1i(U.uPageTex, 3);
    } catch (error) { failed = true; U = null; console.warn('Glass shader unavailable:', error); return false; }
    return true;
  }
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
  let fixedBlock = null, fixedDirty = true, liveDirty = true, liveOn = 0, fixedShown = false;
  // The logo strip: its box (page device px, its own clip), whether its logos
  // moved, the page under them (`under`, a region of the ring as painted without
  // them), and this frame's logos (null until asked for). `fast` turns off for
  // good if the strip holds anything that isn't a logo picture.
  const band = { element: null, box: null, moved: false, under: null, ops: null, fast: true, checked: false };

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
    Object.assign(band, { element: null, box: null, moved: false, under: null, ops: null, fast: true, checked: false });
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
        // A logo coming into the strip is laid over like its moves (marquee()).
        if (band.element && band.element !== target && band.element.contains(target)) { band.moved = true; continue; }
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
    if (!doc?.body || !shapes.length || !ready()) return;
    const cssH = canvas.height / dpr;
    offset = viewOffset; canvasTop = win.scrollY + offset;

    // Copy only the area the glasses can show (device px), on a 64px grid so small
    // moves reuse it. The shadow around a glass tints the page without bending it,
    // so it needs no copy: only the glass's own box and how far its edge reaches.
    const snap = (v, up) => (up ? Math.ceil : Math.floor)(v / 64) * 64;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // The edge's reach grows with a big glass (the Glass Lab's), and a lens that
    // shrinks the page (zoom below 1) looks a little past its own edge.
    const reachOf = item => ((40 + look.wall * 2) * Math.max(item.k, 1) + Math.max(item.hw, item.hh) * Math.max(0, 1 / look.zoom - 1)
      + (look.echoOn ? look.echoGap * item.k * (look.echoes + .4) + 6 : 0)) * dpr;
    const padOf = item => reachOf(item) + (look.shadow > 0 ? 110 * dpr : 0);
    for (const item of shapes) {
      const pad = reachOf(item);
      x0 = Math.min(x0, snap((item.x - item.hw) * dpr - pad)); y0 = Math.min(y0, snap((item.y - item.hh) * dpr - pad));
      x1 = Math.max(x1, snap((item.x + item.hw) * dpr + pad, true)); y1 = Math.max(y1, snap((item.y + item.hh) * dpr + pad, true));
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(canvas.width, x1); y1 = Math.min(canvas.height, y1);
    if (x1 <= x0 || y1 <= y0) return;
    if (dirty) {
      dirty = false; ring.v1 = ring.v0; fixedDirty = liveDirty = true; changed.clear(); stale = []; clip = null;
      band.element = band.fast ? doc.querySelector('[data-glass-marquee]') : null;
      band.under = null; band.checked = false;
    }
    band.ops = null;
    band.box = band.element?.isConnected ? boxOf(band.element) : null;
    if (band.box && !band.checked) {
      band.checked = true;
      if (!logos()) { band.fast = false; band.element = band.box = null; dirty = true; }
    }
    // A glass that moved sideways can reach columns the ring skipped: fill them in.
    if (clip && ring.v1 > ring.v0) {
      if (x0 < clip[0]) paintRows(ring.v0, ring.v1, x0, clip[0]);
      if (x1 > clip[1]) paintRows(ring.v0, ring.v1, clip[1], x1);
      clip = [Math.min(clip[0], x0), Math.max(clip[1], x1)];
    }
    updateRing(x0, y0, x1, y1);
    refreshChanged(x0, y0, x1, y1);
    if (band.moved) { band.moved = false; marquee(x0, x1); }
    const block = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, offset };
    if (!fixedBlock || ['x', 'y', 'w', 'h', 'offset'].some(key => fixedBlock[key] !== block[key])) { fixedBlock = block; fixedDirty = liveDirty = true; }
    // The fixed layer (the header and footer) is copied where it sits in the view,
    // only while the copy reaches them: elsewhere it would be empty, and copying it
    // again each time the glass scrolled 64 px made scrolling stutter.
    const inView = { ...block, y: block.y + Math.round(offset * dpr) };
    const headerElement = doc.querySelector('.site-header'), footerElement = doc.querySelector('.site-footer');
    const reach = (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--blur-reach')) || 22) * dpr;
    const header = headerElement?.getBoundingClientRect(), footer = footerElement?.getBoundingClientRect();
    const footerOpacity = footerElement ? parseFloat(win.getComputedStyle(footerElement).opacity) : 0;
    // The header's blur stretches down behind its open menu.
    const headerBottom = Math.max(header?.bottom ?? -Infinity, headerElement?.querySelector('.header-blur')?.getBoundingClientRect().bottom ?? -Infinity);
    const reaches = (top, bottom) => inView.y < bottom * dpr + reach && inView.y + inView.h > top * dpr - reach;
    const bars = (header && reaches(header.top, headerBottom)) || (footer && footerOpacity > 0 && reaches(footer.top, footer.bottom));
    if (fixedDirty && bars) {
      fixedDirty = false; fixedShown = true;
      snapshot.fixed(fixedCanvas, doc, inView, dpr);
      fixedTexture.image(fixedCanvas, false);
    } else if (!bars && fixedShown) {
      fixedShown = false; fixedDirty = true;
      fixedTexture.data(1, 1, new Uint8Array(4), true);
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
    // The page under the glasses, into pageTexture (pageShader()).
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, pageTexture.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pageTarget);
    if (pageSize !== `${block.w}x${block.h}`) {
      pageSize = `${block.w}x${block.h}`;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, block.w, block.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pageTexture.texture, 0);
    }
    gl.viewport(0, 0, block.w, block.h);
    gl.disable(gl.BLEND);
    gl.useProgram(pageProgram);
    gl.uniform2f(P.uRes, canvas.width, canvas.height);
    gl.uniform4f(P.uBlock, block.x, block.y, block.w, block.h);
    gl.uniform4f(P.uRing, ring.w, ring.rows, Math.round(canvasTop * dpr), 0);
    gl.uniform4f(P.uFixed, fixedBlock.x, fixedBlock.y, fixedBlock.w, fixedBlock.h);
    gl.uniform1f(P.uLiveOn, liveOn);
    // The site's header and footer bars blur what's under them; the copy does too.
    gl.uniform4f(P.uHeader, header ? (header.top - offset) * dpr : 0, header ? header.height * dpr : 0, reach, 0);
    gl.uniform4f(P.uFooter, footer ? (footer.top - offset) * dpr : 0, footer ? (footer.bottom - offset) * dpr : 0, reach, footerOpacity);
    gl.uniform3fv(P.uBg, bg);
    gl.uniform1f(P.uDpr, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(glassProgram);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform4f(U.uBlock, block.x, block.y, block.w, block.h);
    gl.uniform1f(U.uEdgePow, look.edgePower ?? 2.4);
    gl.uniform1f(U.uRimBand, look.rimBand ?? 0);
    gl.uniform1f(U.uBulgeRing, look.bulgeRing ? 1 : 0);
    gl.uniform1f(U.uBulgeSoft, look.bulgeSoft ?? 1);
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
      // The strip's logos are laid over the copy after this (marquee()).
      if (band.element && band.element !== element && band.element.contains(element)) { band.moved = true; continue; }
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
      snapshot.scroll(target, doc, { x: left, y, w: right - left, h: n }, dpr, band.box ? band.element : null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ringTexture.texture);
      const pixels = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      if (band.box) underStrip(pixels, { x: left, y, w: target.width, h: target.height });
      gl.texSubImage2D(gl.TEXTURE_2D, 0, left, offset, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      y += n;
    }
  }

  // The logo strip. Its box: device columns of the view and rows of the page, the
  // strip's own edges (it clips its logos).
  function boxOf(element) {
    const r = element.getBoundingClientRect(), sy = win.scrollY;
    return [Math.floor(r.left * dpr), Math.floor((r.top + sy) * dpr), Math.ceil(r.right * dpr), Math.ceil((r.bottom + sy) * dpr)];
  }
  // This frame's logos (page-snapshot.js strip()), null if they can't be laid over.
  function logos() {
    const [x0, y0, x1, y1] = band.box;
    return band.ops ??= snapshot.strip(doc, band.element, { x: x0 / dpr, y: y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr });
  }
  // A freshly painted block of the ring (straight RGBA, painted without the
  // strip): keeps the part under the strip as the page under the logos, then lays
  // the logos over it.
  function underStrip(pixels, block) {
    const box = band.box, u = band.under;
    const x0 = Math.max(block.x, box[0]), x1 = Math.min(block.x + block.w, box[2]);
    const y0 = Math.max(block.y, box[1]), y1 = Math.min(block.y + block.h, box[3]);
    if (x1 <= x0 || y1 <= y0) return;
    if (u) {
      const ux0 = Math.max(x0, u.x), ux1 = Math.min(x1, u.x + u.w), uy0 = Math.max(y0, u.y), uy1 = Math.min(y1, u.y + u.h);
      for (let y = uy0; y < uy1 && ux1 > ux0; y++) {
        const from = ((y - block.y) * block.w + (ux0 - block.x)) * 4;
        u.data.set(pixels.subarray(from, from + (ux1 - ux0) * 4), ((y - u.y) * u.w + (ux0 - u.x)) * 4);
      }
    }
    const ops = logos();
    if (ops) snapshot.overlay(pixels, block, ops, dpr, box);
  }
  // The strip's logos moved: lay them over the kept page under them, where the
  // glasses can see (columns x0..x1) and the ring holds rows, and upload just that.
  // The first time, or once that area changes, it's painted from the page.
  function marquee(x0, x1) {
    const box = band.box;
    if (!box) return;
    const x = Math.max(box[0], x0, 0), right = Math.min(box[2], x1, ring.w), y = Math.max(box[1], ring.v0), bottom = Math.min(box[3], ring.v1);
    if (right <= x || bottom <= y) return;
    const u = band.under, w = right - x, h = bottom - y;
    if (!u || u.x !== x || u.y !== y || u.w !== w || u.h !== h) {
      band.under = { x, y, w, h, data: new Uint8ClampedArray(w * h * 4) };
      paintRows(y, bottom, x, right);
      return;
    }
    const ops = logos();
    if (!ops) { band.fast = false; dirty = true; return; }
    const pixels = u.data.slice();
    snapshot.overlay(pixels, u, ops, dpr, box);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ringTexture.texture);
    for (let row = 0; row < h;) {
      const offset = (((y + row) % ring.rows) + ring.rows) % ring.rows, n = Math.min(h - row, ring.rows - offset);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, offset, w, n, gl.RGBA, gl.UNSIGNED_BYTE, pixels.subarray(row * w * 4, (row + n) * w * 4));
      row += n;
    }
  }

  return {
    attach, resize, draw, ready,
    // Whether the next frame has anything new to copy (glass.js draws less often
    // when it hasn't and nothing moves).
    busy: () => dirty || changed.size > 0 || animating.size > 0 || stale.length > 0 || band.moved || (liveDirty && liveOn > 0),
    failed: () => failed,
    // Something changed that the page itself doesn't report (its colors, say): copy it all again.
    invalidate() { dirty = true; },
    detach() { unhook(); observer?.disconnect(); observer = null; doc = win = null; }
  };
}
