// Shared motion primitives. Page scripts own their navigation and scroll policy.
const StudioMotion = (() => {
  const clamp = value => Math.max(0, Math.min(1, value));
  const spring = (value, target = value, delay = 0) => ({ value, target, velocity: 0, delay });
  const presets = {
    entrance: { stiffness: 135, damping: 15.2 },
    smooth: { stiffness: 180, damping: 27.5 },
    returning: { stiffness: 230, damping: 31 }
  };
  const entranceDelay = index => .15 + index * .09;

  function step(s, dt, preset = presets.entrance) {
    if (s.delay > 0) { s.delay -= dt; return true; }
    for (let i = 0; i < 4; i++) {
      s.velocity += ((s.target - s.value) * preset.stiffness - s.velocity * preset.damping) * dt / 4;
      s.value += s.velocity * dt / 4;
    }
    if (Math.abs(s.target - s.value) < .001 && Math.abs(s.velocity) < .001) {
      settle(s);
      return false;
    }
    return true;
  }
  function settle(s) { s.value = s.target; s.velocity = s.delay = 0; }
  function paintEntrance(elements, springs, interactive = false) {
    elements.forEach((element, i) => {
      const s = springs[i];
      element.style.opacity = clamp(s.value);
      element.style.transform = `translateY(${44 * (1 - s.value)}px)`;
      if (interactive) element.inert = s.target === 0 || s.value < .8;
    });
  }
  // Measure plain-text blocks before wrapping, preserving the browser's line breaks.
  function splitLines(blocks) {
    const lines = [], range = document.createRange();
    for (const block of blocks) {
      const text = block.textContent.replace(/\s+/g, " ").trim();
      const node = document.createTextNode(text);
      block.replaceChildren(node);
      const starts = [0];
      let previousTop;
      for (const word of text.matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const top = range.getBoundingClientRect().top;
        if (previousTop !== undefined && Math.abs(top - previousTop) > 1) starts.push(word.index);
        previousTop = top;
      }
      const fragment = document.createDocumentFragment();
      starts.forEach((start, i) => {
        const line = document.createElement("span");
        line.className = "motion-line";
        line.textContent = text.slice(start, starts[i + 1]);
        fragment.append(line);
        lines.push(line);
      });
      block.replaceChildren(fragment);
    }
    return lines;
  }
  function paintFooter(element, s, { travel = 30, threshold = .8, hideAtRest = false } = {}) {
    element.style.opacity = clamp(s.value);
    element.style.transform = `translateY(${travel * (1 - clamp(s.value))}px)`;
    element.inert = s.target !== 1 || s.value < threshold;
    if (hideAtRest) element.style.visibility = s.value > .001 ? "visible" : "hidden";
  }

  function createLoop(update, isActive, onPause = () => {}) {
    let frame = 0, last = 0;
    function tick(time) {
      frame = 0;
      if (!isActive() || document.hidden) return;
      const dt = Math.min((time - last) / 1000 || 1 / 60, 1 / 30);
      last = time;
      if (update(dt, time)) frame = requestAnimationFrame(tick);
    }
    function wake() {
      if (!frame && isActive() && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { stop(); onPause(); }
      else wake();
    });
    return { wake, stop };
  }

  function createLift() {
    const s = { value: 0, velocity: 0 };
    let input = null, delta = 0, lastInput = 0;
    function release() { input = null; delta = 0; }
    function push(distance, source) {
      if (input !== source) delta = 0;
      input = source;
      lastInput = performance.now();
      if (input === "touch") delta += distance;
      else delta += (distance - delta) * .2;
    }
    function advance(dt, time) {
      if (input === "wheel" && time - lastInput >= 75) release();
      if (input) {
        const resistance = 1 / (1 + Math.max(0, -s.value) / 200);
        const amount = input === "touch"
          ? delta * (1 - Math.pow(.4, dt * 60))
          : delta * Math.max(0, 1 - (time - lastInput) / 75) * dt * 60;
        if (input === "touch") delta -= amount;
        const movement = -amount * resistance;
        s.value += movement;
        s.velocity += (movement / dt - s.velocity) * (1 - Math.exp(-20 * dt));
        return input === "wheel" || Math.abs(delta) > .01 || Math.abs(s.velocity) > .1;
      }
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        s.velocity += -s.value * 45 * h;
        s.velocity *= Math.pow(.000004, h);
        s.value += s.velocity * h;
      }
      if (Math.abs(s.value) < .05 && Math.abs(s.velocity) < .1) {
        s.value = s.velocity = 0;
        return false;
      }
      return true;
    }
    return {
      get value() { return s.value; },
      push, advance, release,
      reset() { release(); s.value = s.velocity = 0; }
    };
  }

  // One footer action per input burst; animation completion cannot unlock it.
  // Touch keeps its explicit finger-down/finger-up gesture boundary.
  function bindGestures({ isActive, atBoundary, onInput, onEnd }) {
    let wheel = null, touch = null;
    let lastWheel = -Infinity;
    function gesture(source, direction) {
      return { source, direction, distance: 0, total: 0, used: false,
        startedAtBoundary: atBoundary(),
        consume() { this.used = true; }
      };
    }
    addEventListener("wheel", event => {
      if (!isActive() || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const now = performance.now(), direction = Math.sign(event.deltaY);
      const distance = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      if (!wheel || now - lastWheel > 75 || wheel.direction !== direction) {
        wheel = gesture("wheel", direction);
      }
      lastWheel = now;
      wheel.distance = distance; wheel.total += distance;
      if (onInput(wheel)) event.preventDefault();
    }, { passive: false });
    addEventListener("touchstart", event => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY,
        time: performance.now(), lastMove: 0, gesture: gesture("touch", 0) } : null;
    }, { passive: true });
    addEventListener("touchmove", event => {
      if (!isActive() || !touch || event.touches.length !== 1) return;
      const point = event.touches[0], dx = touch.x - point.clientX, dy = touch.y - point.clientY;
      const now = performance.now(), elapsed = Math.max(1, now - touch.time);
      touch.time = now;
      touch.x = point.clientX; touch.y = point.clientY;
      if (Math.abs(dy) <= Math.abs(dx)) return;
      const g = touch.gesture, direction = Math.sign(dy);
      if (g.direction !== direction) { g.direction = direction; g.total = 0; g.velocity = 0; }
      g.velocity = (g.velocity || 0) * .25 + Math.abs(dy) / elapsed * .75;
      touch.lastMove = now;
      g.distance = Math.abs(dy); g.total += g.distance;
      if (onInput(g)) event.preventDefault();
    }, { passive: false });
    function end(cancelled = false) {
      const g = touch?.gesture;
      if (g && performance.now() - touch.lastMove > 100) g.velocity = 0;
      touch = null;
      onEnd(cancelled ? null : g);
    }
    addEventListener("touchend", () => end(), { passive: true });
    addEventListener("touchcancel", () => end(true), { passive: true });
    addEventListener("blur", () => { wheel = null; end(true); });
    return { reset() { wheel = touch = null; } };
  }
  function acceptsKey(event) {
    return !event.altKey && !event.ctrlKey && !event.metaKey && !event.target.closest("input, textarea, select, button, summary, [contenteditable]");
  }
  return { clamp, spring, step, settle, presets, entranceDelay, paintEntrance, splitLines, paintFooter, createLoop, createLift, bindGestures, acceptsKey };
})();
