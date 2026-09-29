import { createVFlow } from "../vflow/vflow.js";

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
          body.append(createVFlow(project.images, project.name));
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
  StudioContentList(content);
})();
