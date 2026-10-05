(() => {
  const M = StudioMotion;
  const paragraph = document.querySelector(".about-intro");
  const content = document.querySelector(".about-content");
  const links = [...document.querySelectorAll(".about .main-nav a")];
  const sentences = [...document.querySelectorAll(".about-sentence")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!paragraph || !content) return;
  StudioPageScroll(content);
  let lines = [], entrance = [], layout = "", entered = false, visibleLineCount = 0;
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const s of entrance) moving = M.step(s, dt) || moving;
    M.paintEntrance(lines, entrance);
    announceReady();
    return moving;
  }, () => !reduced.matches);

  function announceReady() {
    if (document.documentElement.dataset.aboutReady || document.fonts.status !== 'loaded') return;
    // Begin the rover as the visible text reaches the end of its bounce.
    if (!reduced.matches && (!entered || entrance.some((s, i) => i < visibleLineCount && (s.delay > 0 || Math.abs(s.value - s.target) * 44 > 5 || Math.abs(s.velocity) * 44 > 20)))) return;
    document.documentElement.dataset.aboutReady = 'true';
    dispatchEvent(new Event('about-ready'));
  }
  function measureLines() {
    if (reduced.matches) return;
    const style = getComputedStyle(paragraph);
    const nextLayout = `${paragraph.clientWidth}:${style.fontSize}:${style.fontFamily}:${style.lineHeight}:${style.letterSpacing}`;
    if (layout === nextLayout) return;
    layout = nextLayout;
    lines = [...M.splitLines(sentences), ...links];
    visibleLineCount = lines.reduce((count, line, i) => line.getBoundingClientRect().top < innerHeight ? i + 1 : count, 0);
    // Keep the visible stagger within 600ms, including on narrow screens with
    // more wrapped lines.
    const staggerScale = Math.min(1, .6 / (.09 * Math.max(1, visibleLineCount - 1)));
    // Resizing reflows the text without replaying the entrance.
    entrance = lines.map((_, i) => entered ? M.spring(1) : M.spring(0, 1, M.entranceDelay(i * staggerScale)));
    entered = true;
    M.paintEntrance(lines, entrance); loop.wake();
  }
  function configure() {
    if (reduced.matches) {
      loop.stop();
      [...sentences, ...links].forEach(element => element.removeAttribute("style"));
      sentences.forEach(element => { element.textContent = element.textContent; });
      lines = []; entrance = []; layout = ""; entered = true;
      announceReady();
    } else measureLines();
  }
  addEventListener("resize", configure);
  reduced.addEventListener("change", configure);
  configure();
  new ResizeObserver(measureLines).observe(paragraph);
  if (document.fonts.status === "loading") document.fonts.ready.then(() => {
    layout = ""; configure();
  });
})();
