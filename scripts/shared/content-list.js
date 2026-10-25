import { StudioMotion } from './motion.js';
import { StudioPageScroll } from './page-scroll.js';

export function StudioContentList(content, { deepLinks = false } = {}) {
  if (!content) return;
  const M = StudioMotion;
  StudioPageScroll(content);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const items = [...content.querySelectorAll(".content-section > h2, .content-section > ul > li")].map(element => ({
    element,
    spring: null,
    shown: false
  }));
  const loop = M.createLoop(dt => {
    let moving = false;
    for (const item of items) {
      if (!item.spring) continue;
      moving = M.step(item.spring, dt) || moving;
      M.paintEntrance([item.element], [item.spring]);
    }
    return moving;
  }, () => !reduced.matches);
  const observer = new IntersectionObserver(entries => {
    if (reduced.matches) return;
    const visible = new Set(entries.filter(entry => entry.isIntersecting).map(entry => entry.target));
    // DOM order gives one sequence across sections. Only visible rows queue.
    let delay = Math.max(M.entranceDelay(0), ...items.map(item => item.spring ? item.spring.delay + .09 : 0));
    for (const item of items) {
      if (item.shown || !visible.has(item.element)) continue;
      item.shown = true;
      item.spring = M.spring(0, 1, delay);
      delay += .09;
      observer.unobserve(item.element);
    }
    loop.wake();
  });
  function configure() {
    observer.disconnect();
    loop.stop();
    for (const item of items) {
      item.spring = null;
      item.element.removeAttribute("style");
      if (!reduced.matches && !item.shown) {
        item.element.style.opacity = 0;
        observer.observe(item.element);
      }
    }
  }
  reduced.addEventListener("change", configure);
  configure();
  let alignFrame = 0;
  const linkedOpens = new WeakSet();
  function alignDisclosure(disclosure, behavior) {
    // Also support browsers without native exclusive details groups.
    content.querySelectorAll("details.disclosure[open]").forEach(other => {
      if (other !== disclosure) other.open = false;
    });
    cancelAnimationFrame(alignFrame);
    alignFrame = requestAnimationFrame(() => {
      if (!disclosure.open) return;
      // Finish this row's entrance before measuring its final position.
      const item = items.find(item => item.element === disclosure.parentElement);
      if (item) {
        item.shown = true;
        observer.unobserve(item.element);
        if (item.spring) {
          M.settle(item.spring);
          M.paintEntrance([item.element], [item.spring]);
        }
      }
      disclosure.scrollIntoView({ block: "start", behavior });
    });
  }
  content.addEventListener("toggle", event => {
    const disclosure = event.target;
    if (!disclosure.matches("details.disclosure")) return;
    const linked = linkedOpens.delete(disclosure);
    if (!disclosure.open) return;
    alignDisclosure(disclosure, linked || reduced.matches ? "instant" : "smooth");
  }, true);
  if (deepLinks) {
    function openLinked() {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const disclosure = document.getElementById(id);
      if (!disclosure?.matches("details.disclosure") || !content.contains(disclosure)) return;
      if (disclosure.open) alignDisclosure(disclosure, "instant");
      else { linkedOpens.add(disclosure); disclosure.open = true; }
    }
    openLinked();
    addEventListener("hashchange", openLinked);
  }
}
