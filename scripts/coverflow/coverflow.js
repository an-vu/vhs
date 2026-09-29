// Images: [{ src: "images/project.jpg", alt: "Description", caption: "Optional caption" }].
// Omit src for a labelled placeholder while preparing the project imagery.
function createCoverflow(images, title) {
  const gallery = document.createElement("div");
  gallery.className = "coverflow";
  gallery.setAttribute("role", "region");
  gallery.setAttribute("aria-label", `${title} images`);
  const stage = document.createElement("div");
  stage.className = "coverflow-stage";
  stage.tabIndex = 0;
  stage.setAttribute("aria-label", "Image gallery. Use left and right arrow keys to browse.");
  let current = 0, position = 0, target = 0, frame = 0, drag = null, suppressClick = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let animations = [], cardWidth = 0, centerFraction = .88, lastCurrent = -1;
  const cards = images.map((image, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "coverflow-card";
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
      placeholder.className = "coverflow-placeholder";
      placeholder.textContent = image.caption || `Image ${index + 1} coming soon`;
      card.append(placeholder);
    }
    // Fixed visual treatments: crossfade them instead of repainting filters/shadows.
    const content = card.firstElementChild;
    for (const treatment of ["outer", "near", "main"]) {
      const surface = document.createElement("span");
      surface.className = `coverflow-surface coverflow-${treatment}`;
      const copy = treatment === "main" ? content : content.cloneNode(true);
      if (treatment !== "main") {
        copy.setAttribute("aria-hidden", "true");
        if (copy.tagName === "IMG") copy.alt = "";
      }
      surface.append(copy);
      card.append(surface);
    }
    card.tabIndex = -1;
    card.addEventListener("click", () => {
      if (suppressClick) return;
      // Follow the clicked card's visible side, including across the loop seam.
      let offset = wrap(index - position);
      if (offset > images.length / 2) offset -= images.length;
      show(Math.round(position + offset));
    });
    stage.append(card);
    return card;
  });
  const controls = document.createElement("div");
  controls.className = "coverflow-controls";
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
  status.className = "coverflow-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  controls.hidden = images.length < 2;
  const wrap = value => ((value % images.length) + images.length) % images.length;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const phi = 1.61803398875;
  const nearScale = .84;
  const outerScale = 1 - (1 - nearScale) * phi;
  let nearAngle = 46;
  function measureSideAngle() {
    const sideSpace = (1 - centerFraction) / 2;
    const outerEdge = centerFraction / 2 + sideSpace / phi;
    const innerEdge = sideSpace / (phi * phi * phi);
    const targetWidth = (outerEdge - innerEdge) / centerFraction;
    // Fit the near card between its centre gap and existing outer edge.
    // Include both perspective-projected edges, which have different widths.
    let low = 0, high = 89;
    for (let i = 0; i < 24; i++) {
      const degrees = (low + high) / 2;
      const angle = degrees * Math.PI / 180;
      const half = nearScale * Math.cos(angle) / 2;
      const perspective = cardWidth * nearScale * Math.sin(angle) / 2400;
      const width = half / (1.1 - perspective) + half / (1.1 + perspective);
      if (width > targetWidth) low = degrees;
      else high = degrees;
    }
    nearAngle = (low + high) / 2;
  }
  let motionDirection = 0;
  const retreatEnd = .4;
  const handoffAt = .08;
  function cardOffset(i, at) {
    let offset = wrap(i - at);
    if (offset > images.length / 2) offset -= images.length;
    return offset;
  }
  function visualDistance(offset) {
    const distance = Math.abs(offset);
    if (distance < 1 && motionDirection) {
      // Both start together: retreat quickly, while arrival builds up gradually.
      if (offset * motionDirection < 0) {
        const progress = Math.min(1, distance / retreatEnd);
        return 1 - (1 - progress) ** 2;
      }
      return 1 - ease(1 - distance);
    }
    return distance;
  }
  function pose(i, at) {
    const offset = cardOffset(i, at);
    const distance = visualDistance(offset), side = Math.sign(offset);
    const blend = (center, near, outer) => distance < 1
      ? center + (near - center) * distance
      : near + (outer - near) * Math.min(1, distance - 1);
    const scale = blend(1, nearScale, outerScale);
    const depth = blend(0, -120, -120);
    // Turn the outer card 38.2% of the remaining way toward edge-on.
    const outerAngle = nearAngle + (90 - nearAngle) / (phi * phi);
    const degrees = blend(0, nearAngle, outerAngle);
    const angle = degrees * Math.PI / 180;
    const sideSpace = (1 - centerFraction) / 2;
    const edge = centerFraction / 2 + blend(0, sideSpace / 1.61803398875, sideSpace);
    const projectedHalf = scale * Math.cos(angle) / 2 / (1 - (depth + cardWidth * scale * Math.sin(angle) / 2) / 1200);
    const shift = distance === 0 ? 0 : (edge / centerFraction - projectedHalf) * 100;
    return {
      transform: `translate(-50%, -50%) translateX(${side * shift}%) perspective(1200px) translateZ(${depth}px) rotateY(${-side * degrees}deg) scale(${scale})`,
      opacity: Math.max(0, Math.min(1, (2.5 - distance) * 2)),
      dot: Math.max(0, 1 - Math.abs(offset)),
      // Layers are opaque surfaces; these weights avoid double-dimming.
      main: Math.max(0, 1 - distance),
      near: Math.min(1, Math.max(0, 2 - distance))
    };
  }
  function updateSelection() {
    current = wrap(Math.round(position));
    if (current === lastCurrent) return;
    lastCurrent = current;
    indicators.forEach((button, i) => button.setAttribute("aria-current", String(i === current)));
    cards.forEach((card, i) => card.setAttribute("aria-current", String(i === current)));
  }
  function stackRank(i, at) {
    // Give arrival the foreground while it is still on its own side of centre.
    const front = motionDirection > 0 ? Math.floor(at + 1 - handoffAt)
      : motionDirection < 0 ? Math.ceil(at - 1 + handoffAt) : Math.round(at);
    return images.length - Math.abs(cardOffset(i, front));
  }
  function paint() {
    cards.forEach((card, i) => {
      const state = pose(i, position);
      card.style.transform = state.transform;
      card.style.opacity = state.opacity;
      card.style.zIndex = stackRank(i, position);
      card.children[1].style.opacity = state.near;
      card.children[2].style.opacity = state.main;
      indicators[i].style.width = `${24 + 40 * state.dot}px`;
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
    stop();
    target = index;
    const start = position;
    const distance = Math.abs(target - start);
    const initialPoses = cards.map((card, i) => pose(i, start));
    motionDirection = Math.sign(target - start);
    if (reducedMotion.matches || !distance) {
      position = target = wrap(target);
      paint();
      announce();
      return;
    }
    // Apple's media gallery uses a one-second easeInOutQuad scroll.
    const duration = 1000;
    const samples = Math.ceil(duration / 16);
    const handoffs = [{ offset: 0, at: start }];
    // Discrete stacking changes on the browser timeline, not per-frame z-index animation.
    for (let step = Math.floor(Math.min(start, target)) - 1; step <= Math.ceil(Math.max(start, target)) + 1; step++) {
      const at = step + (motionDirection > 0 ? handoffAt : 1 - handoffAt);
      const progress = (at - start) / (target - start);
      if (progress <= 0 || progress >= 1) continue;
      const offset = progress < .5 ? Math.sqrt(progress / 2) : 1 - Math.sqrt((1 - progress) / 2);
      handoffs.push({ offset, at: at + motionDirection * 1e-7 });
    }
    handoffs.push({ offset: 1, at: target });
    handoffs.sort((a, b) => a.offset - b.offset);
    // Sample the exact handoff as well as the regular motion frames.
    const frameOffsets = [...new Set([
      ...Array.from({ length: samples + 1 }, (_, sample) => sample / samples),
      ...handoffs.map(point => point.offset)
    ])].sort((a, b) => a - b);
    gallery.classList.add("is-moving");
    // Compute the journey once. The browser runs transforms and opacity itself.
    cards.forEach((card, i) => {
      const travel = [], main = [], near = [], dots = [];
      for (const offset of frameOffsets) {
        const state = offset === 0 ? initialPoses[i] : pose(i, start + (target - start) * ease(offset));
        travel.push({ offset, transform: state.transform, opacity: state.opacity });
        main.push({ offset, opacity: state.main });
        near.push({ offset, opacity: state.near });
        // Dot expansion follows fractional gallery position, including wraparound.
        dots.push({ offset, width: `${24 + 40 * state.dot}px` });
      }
      const options = { duration, fill: "forwards", easing: "linear" };
      const stacking = card.animate(handoffs.map(point => ({
        offset: point.offset, zIndex: stackRank(i, point.at), easing: "steps(1, end)"
      })), options);
      animations.push(card.animate(travel, options), card.children[1].animate(near, options), card.children[2].animate(main, options), indicators[i].animate(dots, options), stacking);
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
    if (nextWidth === cardWidth && nextWidth / width === centerFraction) return;
    cardWidth = nextWidth;
    centerFraction = cardWidth / width;
    measureSideAngle();
    if (frame) show(target);
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
      if (picture.decode) picture.decode().catch(() => {});
    });
  }, { rootMargin: "300px" });
  warmup.observe(stage);
  gallery.addEventListener("keydown", event => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault(); event.stopPropagation();
    show(target + step);
    if (controls.contains(event.target)) indicators[((target % images.length) + images.length) % images.length].focus({ preventScroll: true });
  });
  stage.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
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
    if (drag.horizontal && Math.abs(dx) > 35) show(target + (dx < 0 ? 1 : -1));
    drag = null;
  });
  stage.addEventListener("pointercancel", () => { drag = null; });
  gallery.append(stage, controls, status);
  if (images.length === 1) gallery.classList.add("coverflow-single");
  paint();
  new ResizeObserver(measure).observe(stage);
  return gallery;
}
