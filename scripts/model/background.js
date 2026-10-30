import { createTextMask } from './text-mask.js';
import { chooseModel, models } from "./registry.js";
import { createModelScene } from "./scene.js";
import { setupModelControls } from "./controls.js";

export async function createModelBackground(container, button, onExpand, onControlReady = () => { }, options = {}) {
  let controlReady = false;
  let modelSettled = false, textSettled = false;
  button.style.opacity = 0;
  const scene = await createModelScene(container, models.find(model => model.id === options.model) || chooseModel(), opacity => {
    button.style.opacity = opacity;
    if (opacity > 0 && !controlReady) {
      controlReady = true;
      onControlReady();
    }
  }, { ...options, onSettled() {
    modelSettled = true;
    updateTextExclusion();
    options.onSettled?.();
  } });
  let active = false, expanded = false, fade = null;
  const text = [...document.querySelectorAll("#introBrand, .home-main h1 span, .home-main .main-nav a")];
  const textMask = createTextMask(container, text, canvas => scene.setTextMask(canvas, true));
  let measurement = 0, trackUntil = 0;
  const canMask = () => active && !expanded && modelSettled && textSettled;
  function updateTextExclusion() {
    if (measurement || !canMask()) return;
    measurement = requestAnimationFrame(() => {
      measurement = 0;
      if (!canMask()) return;
      textMask.update();
      if (performance.now() < trackUntil) updateTextExclusion();
    });
  }
  const textObserver = new ResizeObserver(updateTextExclusion);
  text.forEach(node => textObserver.observe(node));
  textObserver.observe(container);
  document.fonts.addEventListener("loadingdone", () => {
    textMask.invalidate(); updateTextExclusion();
  });
  // Contact's words cross-fading (copy-address.js): the room in the dots follows each
  // word's fade, so it's redrawn every frame until the cross-fade is over.
  addEventListener("studio:text-change", () => {
    textMask.invalidate();
    trackUntil = Math.max(trackUntil, performance.now() + 600);
    updateTextExclusion();
  });
  const controls = setupModelControls({ ...scene, isEnabled: () => active && expanded });
  function setExpanded(value) {
    expanded = value && active;
    controls.reset();
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", expanded ? "Close model view" : "Explore model");
    onExpand(expanded);
    if (expanded) {
      cancelAnimationFrame(measurement);
      measurement = 0;
      scene.setTextMaskEnabled(false);
    } else textMask.invalidate();
    // Follow the returning text only while its CSS transition is running.
    trackUntil = expanded ? 0 : performance.now() + 600;
    updateTextExclusion();
  }
  button.addEventListener("click", () => setExpanded(!expanded));
  return {
    setTextSettled(value) {
      if (value === textSettled) return;
      textSettled = value;
      if (!value) {
        cancelAnimationFrame(measurement); measurement = 0;
        scene.setTextMaskEnabled(false);
        textMask.invalidate();
      } else updateTextExclusion();
    },
    get dissolveStarted() { return scene.dissolveStarted; },
    beginDissolve: scene.beginDissolve,
    setExpanded,
    get controlReady() { return controlReady; },
    updateTextExclusion,
    setVisible(value) {
      if (value === active) return;
      active = value;
      if (!value) setExpanded(false);
      fade?.cancel();
      container.hidden = !value;
      if (!value) button.hidden = true;
      scene.setVisible(value);
      updateTextExclusion();
      if (value && !options.model && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        fade = container.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 1800, easing: "cubic-bezier(.25,.1,.25,1)"
        });
      }
    }
  };
}
