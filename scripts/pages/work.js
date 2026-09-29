(() => {
  const content = document.querySelector(".work-content");
  const status = content.querySelector(".work-status");
  status.hidden = false;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  try {
    const projects = studioProjects;
    const fragment = document.createDocumentFragment();
    const years = new Map();
    for (const project of projects) {
      if (typeof project.name !== "string" || !Number.isInteger(project.year) ||
          !Array.isArray(project.description) || !project.description.every(text => typeof text === "string")) {
        throw new Error("Invalid project data");
      }
      if (!years.has(project.year)) years.set(project.year, []);
      years.get(project.year).push(project);
    }
    for (const year of [...years.keys()].sort((a, b) => b - a)) {
      const section = element("section", undefined, "work-year");
      const heading = element("h2", year);
      heading.id = `year-${year}`;
      section.setAttribute("aria-labelledby", heading.id);
      const list = element("ul");
      for (const project of years.get(year)) {
        const item = element("li");
        const details = element("details", undefined, "project");
        details.setAttribute("name", "work-projects");
        const body = element("div", undefined, "project-detail");
        if (project.tagline) body.append(element("p", project.tagline, "project-tagline"));
        if (project.date) {
          const [y, m, d] = project.date.split("-");
          const date = element("time", `${Number(m)}/${Number(d)}/${y}`);
          date.dateTime = project.date;
          body.append(date);
        }
        if (project.images?.length) {
          body.append(createCoverflow(project.images, project.name));
        } else if (project.image === null) {
          const placeholder = element("div", "Image coming soon", "project-image-placeholder");
          placeholder.setAttribute("role", "img");
          placeholder.setAttribute("aria-label", "Project image placeholder");
          body.append(placeholder);
        } else if (project.image) {
          const image = element("img", undefined, "project-image");
          image.src = project.image.src;
          image.alt = project.image.alt || "";
          image.loading = "lazy";
          body.append(image);
        }
        project.description.forEach(text => body.append(element("p", text)));
        details.append(element("summary", project.name), body);
        item.append(details);
        list.append(item);
      }
      section.append(heading, list);
      fragment.append(section);
    }
    content.replaceChildren(fragment);
  } catch (error) {
    status.textContent = "Projects couldn’t load. Please refresh to try again.";
    console.error(error);
    return;
  } finally {
    content.setAttribute("aria-busy", "false");
  }
  const M = StudioMotion;
  StudioPageScroll(content);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const items = [...document.querySelectorAll(".work-year h2, .work-year li")].map(element => ({
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
  content.addEventListener("toggle", event => {
    const project = event.target;
    if (!project.matches("details.project") || !project.open) return;
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
      project.scrollIntoView({ block: "start", behavior: reduced.matches ? "instant" : "smooth" });
    });
  }, true);
})();
