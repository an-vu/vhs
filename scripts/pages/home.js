import { StudioMotion } from '../shared/motion.js';

// `factory` creates the selected entrance; `dissolve` holds the Dissolve
// entrance's model, settings and phase reporter, or null for the other entrances.
export function startHome(factory, dissolve) {
  const M = StudioMotion;
  const root = document.documentElement;
  root.classList.toggle("dissolve-entrance", !!dissolve);
  const stage = document.querySelector(".intro-stage");
  const brand = document.getElementById("introBrand");
  const content = document.getElementById("homeContent");
  const main = document.querySelector(".home-main");
  const line = document.getElementById("headerLine");
  const footer = document.querySelector(".site-footer");
  const expandButton = document.getElementById("modelExpand"), modelLayer = document.getElementById("model-background");
  const items = [...document.querySelectorAll(".home-main h1 span, .main-nav a")];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const logo = M.spring(0), legal = M.spring(0);
  const lines = items.map(() => M.spring(0));
  const springs = [logo, ...lines, legal];
  const lift = M.createLift();
  let state = 0, scrubbing = false, active = false, keyReturnStop = false;
  let height = innerHeight, width = innerWidth;
  let background = null, backgroundLoading = false, backgroundFailed = false, expanded = false;
  let backgroundRevealed = false, formationPending = false, formationReady = false;
  // Dissolve's word has already become particles, so the logo first fades in
  // at the header. Any later return uses the center-to-header path, which
  // matches the header pose once the logo has settled there.
  let headerArrival = !!dissolve;
  function setExpanded(value) {
    expanded = value;
    root.classList.toggle("aircraft-expanded", value);
    main.inert = brand.inert = value;
    footer.inert = value || legal.target !== 1 || legal.value < .8;
    gestures.reset();
    lift.release();
  }
  function syncBackground() {
    if (backgroundFailed) return;
    const settled = active && state >= 1 &&
      [logo, ...lines].every(s => s.value === 1 && s.velocity === 0 && s.delay <= 0);
    // Start this delay when the last text spring settles, independently of
    // model loading. The entrance keeps the dots moving until the handoff.
    if (dissolve && settled && !formationPending) {
      formationPending = true;
      entrance.waitBeforeForm(() => { formationReady = true; syncBackground(); });
    }
    if (background && settled) backgroundRevealed = true;
    if (background) {
      background.setTextSettled(settled);
      if (dissolve && backgroundRevealed && formationReady && !background.dissolveStarted) {
        background.beginDissolve(entrance.takeBubbles(), dissolve.settings.form ?? factory.defaults.form, dissolve.settings.camera ?? factory.defaults.camera);
        dissolve.report("forming", entrance.elapsed);
      }
      background.setVisible(active && backgroundRevealed && (!dissolve || background.dissolveStarted));
      expandButton.hidden = !settled || !background.controlReady;
      return;
    }
    // Prepare in a worker during the opening pause/fade; reveal still waits for
    // the existing entrance and text springs to finish.
    if (!active || backgroundLoading) return;
    backgroundLoading = true;
    import("../model/background.js")
      .then(module => module.createModelBackground(modelLayer, expandButton, setExpanded, syncBackground, dissolve ? {
        prepareDissolve: true, model: dissolve.model,
        onTextForeground: () => root.classList.add("dissolve-text-front"),
        onFormed: () => dissolve.report("pullback", entrance.elapsed),
        onSettled: () => dissolve.report("model", entrance.elapsed)
      } : {}))
      .then(controller => { background = controller; syncBackground(); })
      .catch(error => {
        backgroundFailed = true;
        if (dissolve) {
          entrance.dispose();
          root.classList.add("dissolve-text-front");
          if (active) go(1, true);
        }
        modelLayer.hidden = true;
        expandButton.hidden = true;
        console.warn("Aircraft background unavailable:", error);
        dissolve?.report(`Model unavailable: ${error.message}`, entrance.elapsed);
      });
  }
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
  const entrance = factory(brand, () => {
    syncBackground();
    if (dissolve) { dissolve.report("hovering", entrance.elapsed); return; }
    if (autoAdvanceScheduled || autoAdvanceCancelled || !active || state !== 0) return;
    autoAdvanceScheduled = true;
    autoAdvanceTimer = setTimeout(() => {
      if (active && state === 0 && !autoAdvanceCancelled && !document.hidden) {
        go(1);
        automaticTransition = true;
      }
    }, 1500);
  }, dissolve?.settings, undefined, {
    onAdvance() { if (active && state === 0) go(1); },
    onPhase(phase) { dissolve?.report(phase, entrance.elapsed); }
  });
  const nextStage = () => Math.min(2, Math.floor(state + .04) + 1);
  const loop = M.createLoop((dt, time) => {
    let moving = lift.advance(dt, time);
    for (const s of springs) {
      const preset = scrubbing || s.target === 0 ? M.presets.returning
        : s === legal || s === logo && !headerArrival ? M.presets.smooth : M.presets.entrance;
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
    // Where the wordmark settles in the header, and its size there.
    const headerY = mobile ? 36 : 43, headerSize = mobile ? 22 : 24;
    const scale = 1 + (headerSize / startSize - 1) * move;
    brand.style.top = `${height / 2}px`;
    brand.style.fontSize = `${startSize}px`;
    brand.style.transform = `translate(-50%, -50%) translateY(${(headerY - height / 2) * move}px) scale(${scale})`;
    if (headerArrival && state > 0) {
      brand.style.top = `${headerY}px`;
      brand.style.fontSize = `${headerSize}px`;
      brand.style.transform = `translate(-50%, -50%) translateY(${44 * (1 - logo.value)}px)`;
      brand.style.opacity = move;
    } else if (dissolve && !headerArrival) brand.style.removeProperty("opacity");
    // During Dissolve the backdrop-filter group stays at full opacity (hidden
    // until the text arrives): animating the parent opacity creates an
    // intermediate backdrop surface during the reveal.
    line.style.opacity = dissolve ? 1 : move;
    line.style.visibility = dissolve && state === 0 ? "hidden" : "";
    main.style.transform = `translateY(${lift.value}px)`;
    M.paintEntrance(items, lines, true);
    M.paintFooter(footer, legal);
    if (expanded) footer.inert = true;
    syncBackground();
    background?.updateTextExclusion();
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
    if (next < state) headerArrival = false;
    scrubbing = direct;
    state = next;
    if (state < 2 || immediate) lift.release();
    logo.target = M.clamp(state);
    if (headerArrival) logo.delay = entering && !immediate ? M.entranceDelay(0) : 0;
    lines.forEach((s, i) => {
      s.target = M.clamp(state);
      s.delay = entering && !immediate ? M.entranceDelay(i + (headerArrival ? 1 : 0)) : 0;
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
    isActive: () => active && !expanded,
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
    syncBackground();
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
    if (expanded) {
      if (event.key === "Escape") {
        event.preventDefault();
        background.setExpanded(false);
        expandButton.focus({ preventScroll: true });
      }
      return;
    }
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
}
