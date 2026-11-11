import { StudioMotion } from './motion.js';

// The big text of About, Contact, Services, the FAQ and Legal: its sentences rise
// in line by line, then the details under it (each heading, list item and
// paragraph as one line), then the links. Lines further down rise as they come
// into view. onSettled runs once, when the lines in the first view have finished
// their bounce and the fonts are in (About begins its rover then). Returns
// { inPlace, lastStart }: whether the text has finished arriving where you are,
// and when its last line on screen starts rising (Services' logo strip and its
// glass follow them).
export function StudioIntroText(content, { onSettled = () => {} } = {}) {
  const M = StudioMotion;
  const paragraph = content?.querySelector(".about-intro");
  const links = [...content?.querySelectorAll(".main-nav a") ?? []];
  const sentences = [...content?.querySelectorAll(".about-sentence") ?? []];
  const details = [...content?.querySelectorAll(".intro-detail > :is(h2, h3), .intro-detail li, .intro-detail > p") ?? []];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!paragraph) return { inPlace: () => true, lastStart: () => 0 };
  // A link to a part of the page (/services#3d-and-spatial, from the Sitemap).
  const target = (() => {
    try {
      const element = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      return element && content.contains(element) ? element : null;
    } catch { return null; }
  })();
  const margin = element => parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
  let lines = [], entrance = [], layout = "", entered = false, visibleLineCount = 0, settled = false;
  const loop = M.createLoop(dt => {
    let moving = false;
    // Only lines whose rise moved are painted again (Nov 11: every line was, each
    // frame, while any one moved).
    entrance.forEach((s, i) => {
      moving = M.step(s, dt) || moving;
      if (s.painted !== s.value) { M.paintEntrance([lines[i]], [s]); s.painted = s.value; }
    });
    announceSettled();
    return moving;
  }, () => !reduced.matches);
  // Lines outside the first view wait, hidden, and rise as they come into view
  // (An, Nov 10: scrolling down fast, the text further down was still on its way
  // from the top, up to 4 s). Lines that come in together rise .09 s apart,
  // squeezed into .6 s like the first view, starting at once (lines come into
  // view in order anyway).
  const waiting = new IntersectionObserver(entries => {
    const coming = entries.filter(entry => entry.isIntersecting).map(entry => lines.indexOf(entry.target))
      .filter(i => i >= 0 && entrance[i].target === 0).sort((a, b) => a - b);
    if (!coming.length) return;
    const step = Math.min(.09, .6 / Math.max(1, coming.length - 1));
    let delay = 0;
    for (const i of coming) {
      waiting.unobserve(lines[i]);
      Object.assign(entrance[i], { target: 1, delay });
      delay += step;
    }
    loop.wake();
  });
  const watchWaiting = () => entrance.forEach((s, i) => { if (s.target === 0) waiting.observe(lines[i]); });
  // Landed to the eye: in its place, within a pixel, no longer bouncing.
  const landed = s => s.delay <= 0 && Math.abs(s.target - s.value) * 44 < 1 && Math.abs(s.velocity) * 44 < 20;
  const onScreen = line => { const box = line.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight; };
  // Every line that has started rising has landed, and none on screen still waits.
  const inPlace = () => entrance.every((s, i) => s.target === 1 ? landed(s) : !onScreen(lines[i]));
  // Seconds until the last line on screen starts rising; null while one on screen
  // still waits to be seen.
  const lastStart = () => {
    let at = 0;
    for (let i = 0; i < entrance.length; i++) {
      if (entrance[i].target === 1) at = Math.max(at, entrance[i].delay);
      else if (onScreen(lines[i])) return null;
    }
    return at;
  };

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
    const before = new Map(lines.map((line, i) => [line, entrance[i]]));
    lines = [...M.splitLines(sentences), ...details, ...links];
    waiting.disconnect();
    if (entered) {
      // Resizing reflows the text without replaying the entrance; lines still
      // waiting further down keep waiting.
      entrance = lines.map(line => before.get(line)?.target === 0 ? before.get(line) : M.spring(1));
      watchWaiting();
    } else {
      // The entrance starts with the first line in view, not the page's first
      // line: opened on a part far down (a link, or a scroll the browser brings
      // back), the lines there waited for every line above them to rise in first,
      // up to 2.6 s (An, Nov 10). A link's part may not be scrolled to yet, so the
      // view is where the browser will put it.
      const top = viewTop(), rects = lines.map(line => line.getBoundingClientRect());
      let first = rects.findIndex(rect => rect.bottom > top);
      if (first < 0) first = lines.length;
      visibleLineCount = rects.reduce((count, rect, i) => rect.top < top + innerHeight ? i + 1 : count, first);
      // Keep the visible stagger within 600ms, including on narrow screens with
      // more wrapped lines.
      const staggerScale = Math.min(1, .6 / (.09 * Math.max(1, visibleLineCount - first - 1)));
      entrance = lines.map((_, i) => i >= first && i < visibleLineCount ? M.spring(0, 1, M.entranceDelay((i - first) * staggerScale)) : M.spring(0));
      entered = true;
      // The rest waits for the view to be where it will be (land()).
      land(watchWaiting);
    }
    M.paintEntrance(lines, entrance); entrance.forEach(s => { s.painted = s.value; }); loop.wake();
  }
  // Where the view's top will be, on the screen as it is now.
  function viewTop() {
    if (!target) return 0;
    const room = document.documentElement.scrollHeight - innerHeight - scrollY;
    return Math.min(target.getBoundingClientRect().top - margin(target), room);
  }
  // A linked line is put where it will settle. Browsers scroll to it where it is
  // drawn, and mid-rise that's up to 44 px low (paintEntrance), so it settled that
  // much higher, its top under the header's blur (Safari on the iPhone, Nov 10).
  // While the page opens (until a touch, a key, the wheel, or 3 s), each time the
  // browser scrolls, the line's place on the page goes back where it belongs.
  // `then` runs once the view is there (at once without a linked line), so the
  // lines above it wait instead of rising while the page still shows its top.
  function land(then) {
    if (!target || !lines.some(line => line === target || line.contains(target))) { then(); return; }
    const pageTop = () => { let y = 0; for (let e = target; e; e = e.offsetParent) y += e.offsetTop; return y; };
    let there = false;
    const go = () => { if (!there) { there = true; then(); } };
    const fix = () => {
      const y = Math.max(0, Math.min(pageTop() - margin(target), document.documentElement.scrollHeight - innerHeight));
      if (Math.abs(scrollY - y) > 1) scrollTo({ top: y, behavior: "instant" });
      go();
    };
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"];
    const stop = () => {
      removeEventListener("scroll", fix);
      inputs.forEach(type => removeEventListener(type, stop, true));
      clearTimeout(timer);
      go();
    };
    addEventListener("scroll", fix, { passive: true });
    inputs.forEach(type => addEventListener(type, stop, { capture: true, passive: true }));
    const timer = setTimeout(stop, 3000);
    if (scrollY > 0) fix();
  }
  function configure() {
    if (reduced.matches) {
      loop.stop();
      [...sentences, ...details, ...links].forEach(element => element.removeAttribute("style"));
      sentences.forEach(element => { element.textContent = element.textContent; });
      waiting.disconnect();
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
  return { inPlace, lastStart };
}
