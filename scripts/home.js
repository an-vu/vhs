(() => {
  const M = StudioMotion;
  const root = document.documentElement;
  const stage = document.querySelector(".intro-stage");
  const brand = document.getElementById("introBrand");
  const content = document.getElementById("homeContent");
  const main = document.querySelector(".home-main");
  const line = document.getElementById("headerLine");
  const footer = document.querySelector(".site-footer");
  const items = [...document.querySelectorAll(".home-main h1 span, .main-nav a")];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const logo = M.spring(0), legal = M.spring(0);
  const lines = items.map(() => M.spring(0));
  const springs = [logo, ...lines, legal];
  const lift = M.createLift();
  let state = 0, scrubbing = false, active = false, keyReturnStop = false;
  let height = innerHeight, width = innerWidth;
  let brandWidthPerPixel = 1;
  function measureBrand() {
    const probe = document.createElement("span");
    probe.className = "brand";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;font-size:100px;white-space:pre;width:max-content";
    // Separate glyphs allow room for any shuffled order, not just the normal kerning.
    for (const character of "vHuman Studios") {
      const letter = document.createElement("span");
      letter.style.display = "inline-block";
      letter.textContent = character;
      probe.append(letter);
    }
    document.body.append(probe);
    brandWidthPerPixel = probe.getBoundingClientRect().width / 100 * 1.02;
    probe.remove();
  }
  let autoAdvanceCancelled = false, autoAdvanceScheduled = false, autoAdvanceTimer = null;
  let automaticTransition = false;
  function cancelAutoAdvance() {
    autoAdvanceCancelled = true;
    clearTimeout(autoAdvanceTimer);
  }
  const entrance = createStudioEntrance(brand, () => {
    if (autoAdvanceScheduled || autoAdvanceCancelled || !active || state !== 0) return;
    autoAdvanceScheduled = true;
    autoAdvanceTimer = setTimeout(() => {
      if (active && state === 0 && !autoAdvanceCancelled && !document.hidden) {
        go(1);
        automaticTransition = true;
      }
    }, 5400);
  });
  const nextStage = () => Math.min(2, Math.floor(state + .04) + 1);
  const loop = M.createLoop((dt, time) => {
    let moving = lift.advance(dt, time);
    for (const s of springs) {
      const preset = scrubbing || s.target === 0 ? M.presets.returning
        : s === logo || s === legal ? M.presets.smooth : M.presets.entrance;
      moving = M.step(s, dt * (automaticTransition ? .70 : 1), preset) || moving;
    }
    render();
    if (!moving) automaticTransition = false;
    return moving;
  }, () => active, lift.release);

  function render() {
    const mobile = width <= 760, move = M.clamp(logo.value);
    const startSize = Math.min(width * (mobile ? .16 : .1), mobile ? 88 : 150,
      Math.max(1, width - 40) / brandWidthPerPixel);
    // Keep glyph layout stable; move and shrink the rendered wordmark instead.
    const scale = 1 + ((mobile ? 22 : 24) / startSize - 1) * move;
    brand.style.top = `${height / 2}px`;
    brand.style.fontSize = `${startSize}px`;
    brand.style.transform = `translate(-50%, -50%) translateY(${((mobile ? 36 : 43) - height / 2) * move}px) scale(${scale})`;
    line.style.opacity = move;
    main.style.transform = `translateY(${lift.value}px)`;
    M.paintEntrance(items, lines, true);
    M.paintFooter(footer, legal);
  }
  function stretch(distance, source = "wheel") {
    if (state !== 2 || legal.value < .95) return;
    lift.push(distance, source);
    loop.wake();
  }
  function go(next, immediate = false, direct = false) {
    automaticTransition = false;
    next = Math.max(0, Math.min(2, next));
    if (next > 0) { cancelAutoAdvance(); entrance.finish(); }
    if (next === state && !immediate) return;
    const entering = state === 0 && next > 0;
    scrubbing = direct;
    state = next;
    if (state < 2 || immediate) lift.release();
    logo.target = M.clamp(state);
    lines.forEach((s, i) => {
      s.target = M.clamp(state);
      s.delay = entering && !immediate ? M.entranceDelay(i) : 0;
    });
    legal.target = M.clamp(state - 1);
    if (state === 0 && content.contains(document.activeElement)) brand.focus({ preventScroll: true });
    else if (state === 1 && footer.contains(document.activeElement)) items[2].focus({ preventScroll: true });
    if (immediate) springs.forEach(M.settle);
    render();
    loop.wake();
  }
  function scrubUp(distance) {
    const position = scrubbing ? state : Math.min(state, M.clamp(logo.value) + M.clamp(legal.value));
    go(position - distance / (height * .6), false, true);
  }
  const gestures = M.bindGestures({
    isActive: () => active,
    atBoundary: () => true,
    onEnd(g) {
      lift.release();
      // Touch has no native momentum here because we handle the gesture ourselves.
      // Preserve precise slow drags and never carry a footer-dismiss gesture upward.
      if (active && g?.source === "touch" && !g.used && g.direction < 0 &&
          g.total > 12 && g.velocity > .25 && state > 0 && state <= 1) {
        scrubUp(Math.min(height * .6, g.velocity * 280));
      }
      loop.wake();
    },
    onInput(g) {
      cancelAutoAdvance();
      if (g.direction < 0) {
        lift.release();
        if (g.used) return true;
        if (state > 1) { go(1); g.consume(); }
        else scrubUp(g.distance);
      } else if (state === 2) {
        if (!g.used) stretch(g.distance, g.source);
      } else if (!g.used && g.total >= (g.source === "touch" ? 35 : 28)) {
        go(nextStage());
        g.consume();
      }
      return true;
    }
  });

  function configure() {
    entrance.finish();
    const wasActive = active;
    active = !motion.matches && innerHeight >= 420;
    root.classList.toggle("experience", active);
    if (active && footer.offsetTop + footer.offsetHeight > stage.clientHeight + 1) {
      active = false;
      root.classList.remove("experience");
    }
    width = innerWidth;
    measureBrand();
    height = active ? stage.clientHeight : innerHeight;
    if (!active) {
      cancelAutoAdvance();
      lift.reset(); loop.stop(); gestures.reset();
      [brand, content, main, line, footer, ...items].forEach(element => {
        element.removeAttribute("style"); element.inert = false;
      });
    } else {
      if (!wasActive) go(state, true);
      render();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        brand.classList.add("is-visible");
        if (active && state === 0) entrance.start();
      }));
    }
    root.classList.remove("intro-loading");
  }
  addEventListener("keydown", event => {
    if (!active || !M.acceptsKey(event)) return;
    if (event.key === "Tab") { go(2, true); return; }
    let next;
    if (["ArrowDown", "PageDown"].includes(event.key) || event.key === " " && !event.shiftKey) next = nextStage();
    if (["ArrowUp", "PageUp"].includes(event.key) || event.key === " " && event.shiftKey) {
      if (event.repeat && keyReturnStop) { event.preventDefault(); return; }
      keyReturnStop = state > 1;
      next = state > 1 ? 1 : state - 1;
    }
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 2;
    if (next !== undefined) {
      event.preventDefault();
      if (next === 2 && state === 2 && event.key !== "End" && !event.repeat) stretch(60);
      else if (!event.repeat || next < state) go(next);
    }
  });
  addEventListener("keyup", () => { keyReturnStop = false; });
  addEventListener("resize", configure);
  motion.addEventListener("change", configure);
  configure();
})();
