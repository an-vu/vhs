function StudioContentList(content, { deepLinks = false } = {}) {
  if (!content) return;
  const M = StudioMotion;
  StudioPageScroll(content);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const items = [...content.querySelectorAll(".work-year > h2, .work-year > ul > li")].map(element => ({
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
    // DOM order gives one sequence across year boundaries. Only visible rows queue.
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
  function alignProject(project, behavior) {
    // Also support browsers without native exclusive details groups.
    content.querySelectorAll("details.project[open]").forEach(other => {
      if (other !== project) other.open = false;
    });
    cancelAnimationFrame(alignFrame);
    alignFrame = requestAnimationFrame(() => {
      if (!project.open) return;
      // Finish this row's entrance before measuring its final position.
      const item = items.find(item => item.element === project.parentElement);
      if (item) {
        item.shown = true;
        observer.unobserve(item.element);
        if (item.spring) {
          M.settle(item.spring);
          M.paintEntrance([item.element], [item.spring]);
        }
      }
      project.scrollIntoView({ block: "start", behavior });
    });
  }
  content.addEventListener("toggle", event => {
    const project = event.target;
    if (!project.matches("details.project")) return;
    const linked = linkedOpens.delete(project);
    if (!project.open) return;
    alignProject(project, linked || reduced.matches ? "instant" : "smooth");
  }, true);
  if (deepLinks) {
    function openLinkedProject() {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const project = document.getElementById(id);
      if (!project?.matches("details.project") || !content.contains(project)) return;
      if (project.open) alignProject(project, "instant");
      else { linkedOpens.add(project); project.open = true; }
    }
    openLinkedProject();
    addEventListener("hashchange", openLinkedProject);
  }
}
