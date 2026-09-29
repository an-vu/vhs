import { defaults, ease } from "./settings.js";
import { createMotion } from "./motion.js";

// Images: [{ src: "images/project.jpg", alt: "Description", caption: "Optional caption" }].
// Omit src for a labelled placeholder while preparing the project imagery.
export function createVFlow(images, title = "Project", options = {}) {
  if (!Array.isArray(images) || !images.length) {
    throw new TypeError("vFlow needs at least one image or placeholder.");
  }
  const settings = { ...defaults, ...options };
  const loopEnabled = settings.loop;
  const handoffAt = settings.handoff;
  const { state, wrap, cardOffset, pose, stackRank } = createMotion(images.length, settings);
  const gallery = document.createElement("div");
  gallery.className = "vflow";
  gallery.setAttribute("role", "region");
  gallery.setAttribute("aria-label", `${title} images`);
  const stage = document.createElement("div");
  stage.className = "vflow-stage";
  stage.tabIndex = 0;
  stage.setAttribute("aria-label", "Image gallery. Use left and right arrow keys to browse.");
  let current = 0, position = 0, target = 0, frame = 0, drag = null, suppressClick = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let animations = [], lastCurrent = -1;
  const cards = images.map((image, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "vflow-card";
    card.setAttribute("aria-label", `Show image ${index + 1}: ${image.alt || image.caption || title}`);
    if (image.src) {
      const picture = document.createElement("img");
      picture.src = image.src;
      picture.alt = image.alt || "";
      picture.loading = "lazy";
      picture.decoding = "async";
      picture.draggable = false;
      card.append(picture);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "vflow-placeholder";
      placeholder.textContent = image.caption || `Image ${index + 1} coming soon`;
      card.append(placeholder);
    }
    const surface = document.createElement("span");
    surface.className = "vflow-surface";
    surface.append(card.firstElementChild);
    const shade = document.createElement("span");
    shade.className = "vflow-shade";
    shade.setAttribute("aria-hidden", "true");
    surface.append(shade);
    card.append(surface);
    card.tabIndex = -1;
    card.addEventListener("click", () => {
      if (suppressClick) return;
      if (!loopEnabled) { show(index); return; }
      // Follow the clicked card's visible side, including across the loop seam.
      let offset = wrap(index - position);
      if (offset > images.length / 2) offset -= images.length;
      show(Math.round(position + offset));
    });
    stage.append(card);
    return card;
  });
  const controls = document.createElement("div");
  controls.className = "vflow-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Choose image");
  const indicators = images.map((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Show image ${index + 1} of ${images.length}`);
    button.addEventListener("click", () => show(index));
    controls.append(button);
    return button;
  });
  const status = document.createElement("span");
  status.className = "vflow-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  controls.hidden = images.length < 2;
  function updateSelection() {
    current = wrap(Math.round(position));
    if (current === lastCurrent) return;
    lastCurrent = current;
    indicators.forEach((button, i) => button.setAttribute("aria-current", String(i === current)));
    cards.forEach((card, i) => card.setAttribute("aria-current", String(i === current)));
  }
  function paint() {
    cards.forEach((card, i) => {
      const state = pose(i, position);
      card.style.transform = state.transform;
      card.style.opacity = state.opacity;
      card.style.zIndex = stackRank(i, position);
      card.firstElementChild.lastElementChild.style.opacity = (1 - state.main) * settings.shadeOpacity;
      card.dataset.depth = state.main > .99 ? "main" : state.near > .99 ? "near" : "outer";
      indicators[i].style.width = `${settings.dotWidth + settings.dotExpansion * state.dot}px`;
    });
    updateSelection();
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    paint();
    animations.forEach(animation => animation.cancel());
    animations = [];
    gallery.classList.remove("is-moving");
  }
  function show(index) {
    // Finish the current journey before accepting another navigation request.
    if (frame) return;
    if (!loopEnabled) index = wrap(index);
    stop();
    target = index;
    const start = position;
    const distance = Math.abs(target - start);
    const initialPoses = cards.map((card, i) => pose(i, start));
    state.direction = Math.sign(target - start);
    state.journey = { from: start, to: target };
    if (reducedMotion.matches || !distance) {
      position = target = wrap(target);
      state.journey = null;
      paint();
      announce();
      return;
    }
    // Apple media gallery: 1s easeInOutQuad; dot widths follow the same position.
    // Reference: /v/iphone/home/ck/built/scripts/overview/main.built.js
    const duration = settings.duration;
    const samples = Math.ceil(duration / 16);
    const handoffs = [{ offset: 0, at: start }];
    // Discrete stacking changes on the browser timeline, not per-frame z-index animation.
    for (let step = Math.floor(Math.min(start, target)) - 1; step <= Math.ceil(Math.max(start, target)) + 1; step++) {
      const at = step + (state.direction > 0 ? handoffAt : 1 - handoffAt);
      const progress = (at - start) / (target - start);
      if (progress <= 0 || progress >= 1) continue;
      const offset = progress < .5 ? Math.sqrt(progress / 2) : 1 - Math.sqrt((1 - progress) / 2);
      handoffs.push({ offset, at: at + state.direction * 1e-7 });
    }
    handoffs.push({ offset: 1, at: target });
    handoffs.sort((a, b) => a.offset - b.offset);
    // Sample the exact handoff as well as the regular motion frames.
    const crossings = [];
    if (distance > 1) {
      for (let at = Math.ceil(Math.min(start, target)); at < Math.max(start, target); at++) {
        const progress = (at - start) / (target - start);
        if (progress > 0 && progress < 1) crossings.push(progress < .5
          ? Math.sqrt(progress / 2) : 1 - Math.sqrt((1 - progress) / 2));
      }
    }
    const frameOffsets = [...new Set([
      ...Array.from({ length: samples + 1 }, (_, sample) => sample / samples),
      ...handoffs.map(point => point.offset), ...crossings
    ])].sort((a, b) => a - b);
    gallery.classList.add("is-moving");
    // Compute the journey once. The browser runs transforms and opacity itself.
    cards.forEach((card, i) => {
      const travel = [], shades = [], dots = [];
      const offsets = [...frameOffsets];
      const timeAt = at => {
        const p = (at - start) / (target - start);
        return p < .5 ? Math.sqrt(p / 2) : 1 - Math.sqrt((1 - p) / 2);
      };
      if (loopEnabled && images.length > 2) {
        const low = Math.min(start, target), high = Math.max(start, target);
        for (let k = Math.floor((low - i) / images.length) - 1; k <= Math.ceil((high - i) / images.length) + 1; k++) {
          const seam = i + images.length / 2 + k * images.length;
          for (const delta of [-.12, -1e-6, 1e-6, .12]) {
            const at = seam + delta;
            if (at > low && at < high) offsets.push(timeAt(at));
          }
        }
      }
      // Switch faces at the exact edge-on crossing; do not interpolate through zero degrees.
      if (distance > settings.longJumpThreshold && i !== wrap(Math.round(start)) && i !== wrap(target)) {
        const low = Math.min(start, target), high = Math.max(start, target);
        for (let k = Math.floor((low - i) / images.length); k <= Math.ceil((high - i) / images.length); k++) {
          for (const delta of [-1e-6, 0, 1e-6]) {
            const at = i + k * images.length + delta;
            if (at > low && at < high) offsets.push(timeAt(at));
          }
        }
      }
      offsets.sort((a, b) => a - b);
      let previousOffset;
      for (const offset of [...new Set(offsets)]) {
        const state = offset === 0 ? initialPoses[i] : pose(i, start + (target - start) * ease(offset));
        const spatialOffset = cardOffset(i, start + (target - start) * ease(offset));
        if (previousOffset !== undefined && (Math.abs(spatialOffset - previousOffset) > images.length / 2
          || (distance > settings.longJumpThreshold && i !== wrap(Math.round(start)) && i !== wrap(target)
            && Math.sign(spatialOffset) !== Math.sign(previousOffset)))) {
          // Jump sides while invisible; never interpolate a card through the stack.
          travel[travel.length - 1].easing = "steps(1, end)";
        }
        previousOffset = spatialOffset;
        travel.push({ offset, transform: state.transform, opacity: state.opacity });
        shades.push({ offset, opacity: (1 - state.main) * settings.shadeOpacity });
        // Dot expansion follows fractional gallery position, including wraparound.
        dots.push({ offset, width: `${settings.dotWidth + settings.dotExpansion * state.dot}px` });
      }
      const options = { duration, fill: "forwards", easing: "linear" };
      const stacking = card.animate(handoffs.map(point => ({
        offset: point.offset, zIndex: stackRank(i, point.at), easing: "steps(1, end)"
      })), options);
      animations.push(card.animate(travel, options), indicators[i].animate(dots, options), stacking);
      if (shades.every(keyframe => keyframe.opacity === shades[0].opacity)) {
        card.firstElementChild.lastElementChild.style.opacity = shades[0].opacity;
      } else animations.push(card.firstElementChild.lastElementChild.animate(shades, options));
    });
    const started = document.timeline.currentTime;
    animations.forEach(animation => { animation.startTime = started; });
    function tick() {
      const progress = Math.min(1, (animations[0].currentTime || 0) / duration);
      position = start + (target - start) * ease(progress);
      updateSelection();
      if (progress < 1) frame = requestAnimationFrame(tick);
      else {
        position = target = wrap(target);
        state.journey = null;
        stop();
        announce();
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function announce() {
    status.textContent = `${current + 1} / ${images.length}${images[current].caption ? ` — ${images[current].caption}` : ""}`;
  }
  function measure() {
    const width = stage.clientWidth;
    if (!width) return;
    const nextWidth = cards[0].offsetWidth;
    if (nextWidth === state.cardWidth && nextWidth / width === state.centerFraction) return;
    state.cardWidth = nextWidth;
    state.centerFraction = state.cardWidth / width;
    if (frame) { stop(); show(target); }
    else paint();
  }
  // Warm only galleries approaching the viewport, not every closed project.
  let prepared = false;
  const warmup = new IntersectionObserver(entries => {
    const visible = entries[entries.length - 1].isIntersecting;
    gallery.classList.toggle("is-nearby", visible);
    if (!visible || prepared) return;
    prepared = true;
    gallery.querySelectorAll("img").forEach(picture => {
      picture.loading = "eager";
      if (picture.decode) picture.decode().catch(() => { });
    });
  }, { rootMargin: "300px" });
  warmup.observe(stage);
  gallery.addEventListener("keydown", event => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault(); event.stopPropagation();
    if (frame) return;
    show(target + step);
    if (controls.contains(event.target)) indicators[wrap(target)].focus({ preventScroll: true });
  });
  stage.addEventListener("pointerdown", event => {
    if (frame || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  });
  stage.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.horizontal && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      drag.horizontal = true;
      suppressClick = true;
      stage.setPointerCapture(event.pointerId);
    }
  });
  stage.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (drag.horizontal && Math.abs(dx) > settings.swipeThreshold) show(target + (dx < 0 ? 1 : -1));
    drag = null;
  });
  stage.addEventListener("pointercancel", () => { drag = null; });
  gallery.append(stage, controls, status);
  if (images.length === 1) gallery.classList.add("vflow-single");
  paint();
  const resize = new ResizeObserver(measure);
  resize.observe(stage);
  // Call before removing a gallery in a client-rendered application.
  gallery.destroy = () => {
    stop();
    warmup.disconnect();
    resize.disconnect();
    gallery.remove();
  };
  return gallery;
}
