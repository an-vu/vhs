import { dotSettings } from './dissolve-dots.js';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// The entrance owns only its word and bubbles. The homepage owns navigation,
// layout, and the real WebGL model, including the final particle formation.
export function createDissolveEntrance(brand, onComplete = () => {}, options = {}, onDuration, hooks = {}) {
  const timing = { ...createDissolveEntrance.defaults, ...options };
  const dots = dotSettings(options.dotSettings);
  const dotsOnly = !!hooks.dotsOnly;
  // Repeat the same sample when tuning appearance, so random regeneration
  // does not obscure the effect of a slider/number change.
  let randomState = hooks.randomSeed;
  const random = randomState === undefined ? Math.random : () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const largeCount = Math.round(dots.count * dots.largePercent / 100);
  const mediumEnd = Math.min(dots.count, largeCount + Math.round(dots.count * dots.mediumPercent / 100));
  const host = brand.parentElement, canvas = document.createElement('canvas');
  canvas.className = 'dissolve-particles'; canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  host.prepend(canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(.0001, random()))) * Math.cos(random() * Math.PI * 2);
  const seeds = Array.from({ length: dots.count }, (_, i) => ({
    x: random(), y: random(), z: random(), phase: random() * Math.PI * 2,
    driftX: gaussian(), driftY: gaussian(), size: random(), spread: random(),
    color: 0
  }));
  seeds.forEach((seed, i) => {
    seed.radius = i < largeCount ? dots.largeMin + seed.size * (dots.largeMax - dots.largeMin)
      : i < mediumEnd ? dots.mediumMin + seed.size * (dots.mediumMax - dots.mediumMin)
      : dots.smallMin + seed.size ** dots.smallBias * (dots.smallMax - dots.smallMin);
    // Keep most dots crisp and opaque. Depth effects favor small dots;
    // large soft dots are occasional accents, no longer two guaranteed giants.
    const small = seed.radius <= dots.smallThreshold;
    seed.soft = random() < (small ? dots.smallBlur : dots.largeBlur) / 100;
    // Both the chance and strength of transparency taper with size. Most
    // dots remain fully solid, including small ones; large translucent dots
    // are rare and retain more opacity than their smaller counterparts.
    const sizeDepth = Math.sqrt(clamp((seed.radius - dots.smallMin) / Math.max(.01, dots.largeMax - dots.smallMin)));
    const translucent = random() < (dots.largeTransparent + (dots.smallTransparent - dots.largeTransparent) * (1 - sizeDepth) ** 2) / 100;
    const minOpacity = (dots.smallOpacityMin + (dots.largeOpacityMin - dots.smallOpacityMin) * sizeDepth) / 100;
    const maxOpacity = (dots.smallOpacityMax + (dots.largeOpacityMax - dots.smallOpacityMax) * sizeDepth) / 100;
    seed.opacity = translucent ? minOpacity + random() * (maxOpacity - minOpacity) : 1;
    // Larger soft dots have a smaller solid core and a wider feathered edge.
    seed.softCore = (dots.smallCore + (dots.largeCore - dots.smallCore) * clamp(seed.radius / dots.largeMax)) / 100;
  });
  // Light gray occupies the smallest dots; shuffle gray and ink across the rest.
  const lightCount = Math.round(dots.count * dots.lightGray / 100);
  const grayCount = Math.min(dots.count - lightCount, Math.round(dots.count * dots.gray / 100));
  const ranked = [...seeds].sort((a, b) => a.radius - b.radius);
  ranked.slice(0, lightCount).forEach(seed => { seed.color = 1; });
  const rest = ranked.slice(lightCount);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  rest.forEach((seed, i) => { seed.color = i < grayCount ? 0 : 2; });
  // Optional palette overrides apply to the actual size population, not the
  // blur cutoff. Unchecked groups keep the original overall color allocation.
  for (const [size, start, end] of [['large', 0, largeCount], ['medium', largeCount, mediumEnd], ['small', mediumEnd, dots.count]]) {
    if (!dots[size + 'Colors']) continue;
    const group = seeds.slice(start, end).sort((a, b) => a.radius - b.radius);
    const total = dots[size + 'Gray'] + dots[size + 'Black'] + dots[size + 'LightGray'];
    if (!total) continue;
    const light = Math.round(group.length * dots[size + 'LightGray'] / total);
    const gray = Math.min(group.length - light, Math.round(group.length * dots[size + 'Gray'] / total));
    group.slice(0, light).forEach(seed => { seed.color = 1; });
    const remaining = group.slice(light);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    remaining.forEach((seed, i) => { seed.color = i < gray ? 0 : 2; });
  }
  let width, height, fontSize, word = [], ink, colors, mask;
  let frame = 0, last = null, elapsed = 0, started = false, disposed = false, transferred = false;
  let hovering = false, hoverAt = null, advanced = false;
  let formationDelayAt = null, onFormationReady = null;
  const bubbles = new Float32Array(dots.count * 4);
  function resize() {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(brand);
    const palette = getComputedStyle(document.documentElement);
    ink = palette.getPropertyValue('--fg').trim() || '#30302E';
    colors = [palette.getPropertyValue('--nav-fg').trim() || '#62625E',
      palette.getPropertyValue('--light-gray').trim() || '#C7C6C4', ink];
    fontSize = parseFloat(style.fontSize);
    mask = document.createElement('canvas'); mask.width = Math.ceil(width); mask.height = Math.ceil(height);
    const context = mask.getContext('2d');
    context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing;
    context.textAlign = 'center'; context.textBaseline = 'alphabetic'; context.fillStyle = ink;
    const bounds = brand.getBoundingClientRect(), hostBounds = host.getBoundingClientRect();
    const metrics = context.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent ?? fontSize * .8;
    const descent = metrics.fontBoundingBoxDescent ?? fontSize * .2;
    context.fillText('vHuman', bounds.left - hostBounds.left + bounds.width / 2,
      bounds.top - hostBounds.top + (bounds.height + ascent - descent) / 2);
    const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
    word = [];
    for (let y = 0; y < mask.height; y += 2) for (let x = 0; x < mask.width; x += 2) {
      if (pixels[(y * mask.width + x) * 4 + 3] > 100) word.push([x, y]);
    }
    if (!word.length) word.push([width / 2, height / 2]);
  }
  function advance() {
    if (!started || disposed || advanced || dotsOnly) return;
    advanced = true; hooks.onAdvance?.();
  }
  function draw(dt) {
    elapsed += dt * 1000;
    const dissolveAt = timing.blank + timing.fade + timing.hold;
    const progress = clamp((elapsed - dissolveAt) / Math.max(1, timing.dissolve));
    const inflated = ease(progress / .14);
    const flightTime = dotsOnly ? Math.min(elapsed, dissolveAt + timing.dissolve * 1.5) : elapsed;
    const flight = Math.max(0, ((flightTime - dissolveAt) / Math.max(1, timing.dissolve) - .14) / .86);
    const released = 1 - Math.exp(-dots.burst * flight) + flight * dots.flight;
    ctx.clearRect(0, 0, width, height);
    // Keep the visible word as native text, like the other entrances. The
    // low-resolution canvas mask is only for sampling particle origins.
    if (!advanced) brand.style.opacity = reduced.matches ? 1 : progress === 0
      ? ease((elapsed - timing.blank) / Math.max(1, timing.fade))
      : 1 - ease((progress - .06) / .18);
    seeds.forEach((seed, i) => {
      const letter = word[Math.floor(seed.x * word.length)];
      const wide = seed.spread < dots.widePercent / 100;
      const cloudX = wide ? width * (.02 + seed.y * .96) : letter[0] + seed.driftX * width * dots.spreadX / 100;
      const cloudY = wide ? height * (.02 + seed.z * .96) : letter[1] + seed.driftY * height * dots.spreadY / 100 - fontSize * dots.upward / 100;
      const x = letter[0] + (cloudX - letter[0]) * released + Math.sin(elapsed * .00045 * dots.driftSpeed + seed.phase) * dots.driftX * released;
      const y = letter[1] + (cloudY - letter[1]) * released + Math.cos(elapsed * .00035 * dots.driftSpeed + seed.phase) * dots.driftY * released - Math.sin(Math.min(1, released) * Math.PI) * (8 + seed.z * 24);
      const base = seed.radius * Math.min(1, Math.min(width, height) / 600);
      const size = base * (.2 + .8 * inflated) * (i < largeCount ? .4 + .6 * Math.min(1, released) : 1);
      const alpha = inflated * seed.opacity;
      bubbles.set([x / width * 2 - 1, 1 - y / height * 2, size * 2, alpha], i * 4);
      if (alpha <= 0 || (reduced.matches && !dotsOnly) || transferred) return;
      const color = colors[seed.color];
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      if (seed.soft) {
        const soft = ctx.createRadialGradient(x, y, 0, x, y, size);
        soft.addColorStop(0, color); soft.addColorStop(seed.softCore, color); soft.addColorStop(1, 'transparent'); ctx.fillStyle = soft;
      }
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (!hovering && (elapsed >= createDissolveEntrance.duration(timing) || reduced.matches)) {
      hovering = true; hoverAt = elapsed; hooks.onPhase?.('hovering'); onComplete();
    }
    if (hovering && !advanced && elapsed - hoverAt >= timing.advance) advance();
    if (onFormationReady && (elapsed - formationDelayAt >= timing.formDelay || reduced.matches)) {
      const complete = onFormationReady; onFormationReady = null;
      complete();
    }
  }
  function tick(now) {
    frame = 0;
    if (disposed || transferred || document.hidden) { last = null; return; }
    const dt = last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now; draw(dt);
    if (!reduced.matches && !transferred) frame = requestAnimationFrame(tick);
  }
  function wake() { if (!disposed && !transferred && started && !document.hidden && !frame) { last = null; frame = requestAnimationFrame(tick); } }
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(frame); frame = 0; wake(); }, { signal: events.signal });
  addEventListener('resize', () => { resize(); if (started && !transferred) draw(0); }, { signal: events.signal });
  addEventListener('vhuman:themechange', resize, { signal: events.signal });
  return {
    start() {
      if (started || disposed) return;
      started = true; brand.style.transition = 'none'; brand.style.opacity = 0; brand.textContent = 'vHuman'; resize(); hooks.onPhase?.('entrance');
      if (dotsOnly) { elapsed = timing.blank + timing.fade + timing.hold + timing.dissolve * 1.5; brand.style.visibility = 'hidden'; draw(0); }
      onDuration?.(createDissolveEntrance.duration(timing)); wake(); return performance.now();
    },
    continueToModel: advance,
    waitBeforeForm(complete) {
      if (disposed || transferred || formationDelayAt !== null) return;
      formationDelayAt = elapsed;
      hooks.onPhase?.('waiting');
      onFormationReady = complete;
      if (timing.formDelay === 0 || reduced.matches) draw(0);
      else wake();
    },
    takeBubbles() {
      if (!started) return null;
      draw(0); transferred = true; cancelAnimationFrame(frame); canvas.remove(); brand.style.removeProperty('opacity');
      return {
        points: bubbles.slice(), colors: seeds.map(seed => colors[seed.color]),
        // 1 means a crisp circle; softer dots carry their radial solid core.
        softCores: Float32Array.from(seeds, seed => seed.soft ? seed.softCore : 1)
      };
    },
    get phase() { return advanced ? 'loading' : hovering ? 'hovering' : 'entrance'; },
    get elapsed() { return elapsed; },
    finish() { if (!started || disposed || transferred) return; elapsed = Math.max(elapsed, createDissolveEntrance.duration(timing)); draw(0); },
    dispose() { disposed = true; events.abort(); cancelAnimationFrame(frame); canvas.remove(); brand.style.removeProperty('opacity'); }
  };
}
createDissolveEntrance.defaults = Object.freeze({"blank": 400, "fade": 1300, "hold": 1200, "dissolve": 1400, "advance": 1400, "formDelay": 300, "form": 1700, "camera": 3000});
createDissolveEntrance.duration = timing => timing.blank + timing.fade + timing.hold + timing.dissolve;
