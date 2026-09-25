function StudioPageScroll(content) {
  const M = StudioMotion;
  const root = document.documentElement;
  const footer = document.querySelector(".site-footer");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!content || !footer) return;
  const legal = M.spring(0), lift = M.createLift();
  let active = false, keyUsed = false;
  const atBottom = () => scrollY + innerHeight >= root.scrollHeight - 3;
  const loop = M.createLoop((dt, time) => {
    let moving = lift.advance(dt, time);
    moving = M.step(legal, dt, M.presets.smooth) || moving;
    paint();
    return moving;
  }, () => active, lift.release);

  function paint() {
    content.style.transform = `translateY(${lift.value}px)`;
    M.paintFooter(footer, legal, { travel: 24, threshold: .95, hideAtRest: true });
  }
  function stretch(distance, source = "wheel") {
    if (legal.target !== 1 || legal.value < .95) return;
    lift.push(distance, source); loop.wake();
  }
  function showFooter(show, immediate = false) {
    legal.target = show ? 1 : 0;
    if (!show) {
      lift.release();
      if (footer.contains(document.activeElement)) document.querySelector(".brand").focus({ preventScroll: true });
    }
    if (immediate) M.settle(legal);
    paint(); loop.wake();
  }
  const gestures = M.bindGestures({
    isActive: () => active,
    atBoundary: atBottom,
    onEnd() { lift.release(); loop.wake(); },
    onInput(g) {
      if (g.direction < 0) {
        lift.release();
        if (legal.target === 1 || g.used) {
          if (!g.used) { showFooter(false); g.consume(); }
          return true;
        }
        return false;
      }
      if (!atBottom()) return false;
      if (!g.startedAtBoundary) {
        // Arrival and its momentum cannot also reveal the footer.
        if (!g.used) g.consume();
        return true;
      }
      if (g.used) return true;
      if (legal.target === 0 && g.total >= (g.source === "touch" ? 35 : 28)) {
        showFooter(true); g.consume();
      } else if (legal.target === 1) stretch(g.distance, g.source);
      return true;
    }
  });

  addEventListener("keydown", event => {
    if (!active || !M.acceptsKey(event)) return;
    if (event.key === "Tab") { showFooter(true, true); return; }
    const up = ["ArrowUp", "PageUp"].includes(event.key) || event.key === " " && event.shiftKey;
    const down = ["ArrowDown", "PageDown", "End"].includes(event.key) || event.key === " " && !event.shiftKey;
    if (!event.repeat) keyUsed = false;
    if (event.key === "Home") { showFooter(false); return; }
    if (up && (legal.target === 1 || keyUsed)) {
      event.preventDefault(); showFooter(false); keyUsed = true;
    } else if (down && atBottom()) {
      event.preventDefault();
      if (keyUsed) return;
      if (legal.target === 0) { showFooter(true); keyUsed = true; }
      else stretch(60);
    }
  });
  addEventListener("keyup", () => { keyUsed = false; });
  function configure() {
    active = !reduced.matches;
    root.classList.toggle("page-motion", active);
    root.style.setProperty("--page-footer-height", `${footer.offsetHeight}px`);
    if (!active) {
      loop.stop(); lift.reset(); gestures.reset();
      [content, footer].forEach(element => element.removeAttribute("style"));
      footer.inert = false;
    } else { paint(); loop.wake(); }
  }
  addEventListener("scroll", () => {
    if (active && !atBottom() && legal.target === 1 && !footer.contains(document.activeElement)) showFooter(false);
  }, { passive: true });
  addEventListener("resize", configure);
  // Expanding a project changes the document bottom; start from normal scrolling.
  content.addEventListener("toggle", () => {
    if (!active) return;
    gestures.reset(); lift.reset(); showFooter(false);
  }, true);
  reduced.addEventListener("change", configure);
  configure();
}
