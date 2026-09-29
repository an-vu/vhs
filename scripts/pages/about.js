(() => {
  const M = StudioMotion;
  const paragraph = document.querySelector(".about-intro");
  const content = document.querySelector(".about-content");
  const links = [...document.querySelectorAll(".about .main-nav a")];
  const sentences = [...document.querySelectorAll(".about-sentence")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!paragraph || !content) return;
  StudioPageScroll(content);
  let lines = [], entrance = [], layout = "", entered = false;
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const s of entrance) moving = M.step(s, dt) || moving;
    M.paintEntrance(lines, entrance);
    return moving;
  }, () => !reduced.matches);

  function measureLines() {
    if (reduced.matches) return;
    const style = getComputedStyle(paragraph);
    const nextLayout = `${paragraph.clientWidth}:${style.fontSize}:${style.fontFamily}:${style.lineHeight}:${style.letterSpacing}`;
    if (layout === nextLayout) return;
    layout = nextLayout;
    lines = [...M.splitLines(sentences), ...links];
    // Resizing reflows the text without replaying the entrance.
    entrance = lines.map((_, i) => entered ? M.spring(1) : M.spring(0, 1, M.entranceDelay(i)));
    entered = true;
    M.paintEntrance(lines, entrance); loop.wake();
  }
  function configure() {
    if (reduced.matches) {
      loop.stop();
      [...sentences, ...links].forEach(element => element.removeAttribute("style"));
      sentences.forEach(element => { element.textContent = element.textContent; });
      lines = []; entrance = []; layout = ""; entered = true;
    } else measureLines();
  }
  addEventListener("resize", configure);
  reduced.addEventListener("change", configure);
  configure();
  new ResizeObserver(measureLines).observe(paragraph);
  if (document.fonts.status === "loading") document.fonts.ready.then(() => {
    layout = ""; measureLines();
  });
})();
