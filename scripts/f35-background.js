import { createF35Scene } from "./f35-scene.js";
import { setupF35Controls } from "./f35-controls.js";

export async function createF35Background(container, button, onExpand) {
  const scene = await createF35Scene(container);
  let active = false, expanded = false, fade = null;
  const controls = setupF35Controls({ ...scene, isEnabled: () => active && expanded });
  function setExpanded(value) {
    expanded = value && active;
    controls.reset();
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", expanded ? "Close aircraft view" : "Explore aircraft");
    onExpand(expanded);
  }
  button.addEventListener("click", () => setExpanded(!expanded));
  return {
    setExpanded,
    setVisible(value) {
      if (value === active) return;
      active = value;
      if (!value) setExpanded(false);
      fade?.cancel();
      container.hidden = button.hidden = !value;
      scene.setVisible(value);
      if (value && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        fade = container.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 1800, easing: "cubic-bezier(.25,.1,.25,1)"
        });
      }
    }
  };
}
