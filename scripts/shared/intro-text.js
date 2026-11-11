import { StudioMotion } from './motion.js';

// The big text of About, Contact, Services, the FAQ and Legal: its sentences rise
// in line by line, then the details under it (each heading, list item and
// paragraph as one line), then the links (and About's small facts line). onSettled
// runs once, when the lines in view have finished their bounce and the fonts are
// in (About begins its rover then).
export function StudioIntroText(content, { onSettled = () => {} } = {}) {
  const M = StudioMotion;
  const paragraph = content?.querySelector(".about-intro");
  const links = [...content?.querySelectorAll(".main-nav a, .about-facts") ?? []];
  const sentences = [...content?.querySelectorAll(".about-sentence") ?? []];
  const details = [...content?.querySelectorAll(".intro-detail > :is(h2, h3), .intro-detail li, .intro-detail > p") ?? []];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!paragraph) return;
  let lines = [], entrance = [], layout = "", entered = false, visibleLineCount = 0, settled = false;
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const s of entrance) moving = M.step(s, dt) || moving;
    M.paintEntrance(lines, entrance);
    announceSettled();
    return moving;
  }, () => !reduced.matches);

  function announceSettled() {
    if (settled || document.fonts.status !== 'loaded') return;
    if (!reduced.matches && (!entered || entrance.some((s, i) => i < visibleLineCount && (s.delay > 0 || Math.abs(s.value - s.target) * 44 > 5 || Math.abs(s.velocity) * 44 > 20)))) return;
    settled = true;
    onSettled();
  }
  function measureLines() {
    if (reduced.matches) return;
    const style = getComputedStyle(paragraph);
    const nextLayout = `${paragraph.clientWidth}:${style.fontSize}:${style.fontFamily}:${style.lineHeight}:${style.letterSpacing}`;
    if (layout === nextLayout) return;
    layout = nextLayout;
    lines = [...M.splitLines(sentences), ...details, ...links];
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
      [...sentences, ...details, ...links].forEach(element => element.removeAttribute("style"));
      sentences.forEach(element => { element.textContent = element.textContent; });
      lines = []; entrance = []; layout = ""; entered = true;
      announceSettled();
    } else measureLines();
  }
  addEventListener("resize", configure);
  reduced.addEventListener("change", configure);
  configure();
  new ResizeObserver(measureLines).observe(paragraph);
  if (document.fonts.status === "loading") document.fonts.ready.then(() => {
    layout = ""; configure();
  });
}
