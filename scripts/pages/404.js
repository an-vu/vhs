import { StudioMotion } from '../shared/motion.js?v=4c4ac8c2b5';
import { StudioPageScroll } from '../shared/page-scroll.js?v=7b012a23a4';

(() => {
  const M = StudioMotion;
  StudioPageScroll(document.querySelector(".not-found"));
  const elements = [...document.querySelectorAll(".not-found h1 span, .not-found .main-nav a")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const springs = elements.map((_, i) => M.spring(reduced.matches ? 1 : 0, 1, M.entranceDelay(i)));
  const loop = M.createLoop(dt => {
    let moving = false;
    springs.forEach(spring => { moving = M.step(spring, dt) || moving; });
    M.paintEntrance(elements, springs);
    return moving;
  }, () => !reduced.matches);
  function finish() {
    loop.stop();
    springs.forEach(spring => M.settle(spring));
    M.paintEntrance(elements, springs);
  }
  reduced.addEventListener("change", finish);
  M.paintEntrance(elements, springs);
  if (!reduced.matches) loop.wake();
})();
