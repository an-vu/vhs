import { createF35Scene } from "./f35-scene.js";
import { MIN_CAMERA_Z, MAX_CAMERA_Z, DRAG_SENSITIVITY, VERTICAL_SENSITIVITY, MAX_PITCH, PINCH_ZOOM_SPEED } from "./f35-config.js";

export async function createF35Background(container, controls) {
  const scene = await createF35Scene(container);
  const { state, aircraft, element } = scene;
  let active = false, mouse = null, touch = null, fade = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function zoom(delta) {
    state.targetCameraZ = clamp(state.targetCameraZ + delta, MIN_CAMERA_Z, MAX_CAMERA_Z);
    scene.redraw();
  }
  controls.addEventListener("click", event => {
    const button = event.target.closest("button[data-zoom]");
    if (button && state.revealComplete) zoom(Number(button.dataset.zoom));
  });
  function rotate(dx, dy) {
    aircraft.rotation.y += dx * DRAG_SENSITIVITY;
    aircraft.rotation.x = clamp(aircraft.rotation.x + dy * DRAG_SENSITIVITY * VERTICAL_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    state.velocityY = dx * DRAG_SENSITIVITY * .12;
    state.velocityX = dy * DRAG_SENSITIVITY * VERTICAL_SENSITIVITY * .12;
    scene.redraw();
  }
  element.addEventListener("pointerdown", event => {
    if (!active || !state.revealComplete || event.pointerType !== "mouse" || event.button !== 0) return;
    mouse = { x: event.clientX, y: event.clientY };
    state.dragging = true;
    state.velocityX = state.velocityY = 0;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", event => {
    if (!mouse) return;
    rotate(event.clientX - mouse.x, event.clientY - mouse.y);
    mouse = { x: event.clientX, y: event.clientY };
  });
  function releaseMouse() { mouse = null; state.dragging = false; }
  element.addEventListener("pointerup", releaseMouse);
  element.addEventListener("pointercancel", releaseMouse);
  element.addEventListener("lostpointercapture", releaseMouse);
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  element.addEventListener("touchstart", event => {
    if (!active || !state.revealComplete) return;
    const p = event.touches[0];
    touch = { x: p.clientX, y: p.clientY, mode: event.touches.length > 1 ? "pinch" : null,
      distance: event.touches.length > 1 ? distance(event.touches) : 0 };
    state.velocityX = state.velocityY = 0;
  }, { passive: true });
  element.addEventListener("touchmove", event => {
    if (!touch || !active) return;
    if (event.touches.length >= 2) {
      const next = distance(event.touches);
      if (touch.mode === "pinch") zoom((touch.distance - next) * PINCH_ZOOM_SPEED);
      touch.mode = "pinch"; touch.distance = next; state.dragging = true;
    } else {
      const p = event.touches[0], dx = p.clientX - touch.x, dy = p.clientY - touch.y;
      if (!touch.mode) {
        if (Math.hypot(dx, dy) < 8) { event.stopPropagation(); return; }
        touch.mode = Math.abs(dx) > Math.abs(dy) ? "rotate" : "scroll";
      }
      if (touch.mode === "scroll") return;
      if (touch.mode === "rotate") { state.dragging = true; rotate(dx, 0); }
      touch.x = p.clientX; touch.y = p.clientY;
    }
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  function endTouch(event) {
    if (event.touches.length) return;
    touch = null; state.dragging = false;
  }
  element.addEventListener("touchend", endTouch);
  element.addEventListener("touchcancel", endTouch);
  window.addEventListener("blur", () => { touch = null; releaseMouse(); });
  return {
    setVisible(value) {
      if (value === active) return;
      active = value;
      fade?.cancel();
      container.hidden = controls.hidden = !value;
      if (!value) { touch = null; releaseMouse(); }
      scene.setVisible(value);
      if (value && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        fade = container.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 1800, easing: "cubic-bezier(.25,.1,.25,1)"
        });
      }
    }
  };
}
