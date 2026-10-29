import { StudioMotion } from '../shared/motion.js';
import { StudioPageScroll } from '../shared/page-scroll.js';
import { createPageMenu } from '../shared/page-menu.js';

(() => {
  const M = StudioMotion;
  StudioPageScroll(document.querySelector(".not-found"));
  createPageMenu();
  const elements = [...document.querySelectorAll(".not-found h1 span, .not-found-mark, .not-found .main-nav a")];
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

// In the middle, like the homepage's aircraft: the upside-down smile as the same
// point cloud, still. Without WebGL the middle stays empty.
Promise.all([import("../model/still-points.js"), import("../model/settings/smile-points.js")])
  .then(([{ createStillPoints }, { default: smile }]) => createStillPoints(document.querySelector(".not-found-mark"), smile))
  .catch(error => console.warn("Smile unavailable:", error));
