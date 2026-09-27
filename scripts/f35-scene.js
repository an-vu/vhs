import * as THREE from "three";
import * as C from "./f35-config.js";
import { createF35PointCloud } from "./f35-point-cloud.js";

// Shared scene: the page owns visibility and chooses its own input controls.
export async function createF35Scene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .01, 100);
  const aircraft = new THREE.Group();
  aircraft.rotation.order = "YXZ";
  aircraft.rotation.y = C.INITIAL_Y_ROTATION;
  scene.add(aircraft);
  camera.position.copy(C.CAMERA_START);
  const curve = new THREE.CubicBezierCurve3(C.CAMERA_START, C.CAMERA_CONTROL_1, C.CAMERA_CONTROL_2, C.CAMERA_END);
  const state = { revealComplete: false, targetCameraZ: C.CAMERA_END.z, dragging: false, velocityX: 0, velocityY: 0 };
  let material, visible = false, last = null, elapsed = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  container.append(renderer.domElement);
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    if (material) material.uniforms.uScale.value = renderer.domElement.height / 2;
    if (visible && reduced.matches) draw(performance.now());
  }
  function draw(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now;
    elapsed += dt;
    const frames = dt * 60;
    material.uniforms.uTime.value = elapsed;
    if (!state.revealComplete) {
      const p = THREE.MathUtils.clamp((elapsed * 1000 - C.REVEAL_HOLD) / C.REVEAL_DURATION, 0, 1);
      const eased = p < .5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2;
      curve.getPoint(eased, camera.position);
      aircraft.rotation.y += THREE.MathUtils.lerp(C.REVEAL_ROTATION_START, C.IDLE_ROTATION, p * p * (3 - 2 * p)) * frames;
      if (p === 1) state.revealComplete = true;
    } else {
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, state.targetCameraZ, reduced.matches ? 1 : 1 - (1 - C.ZOOM_SMOOTHING) ** frames);
      if (!state.dragging && !reduced.matches) {
        aircraft.rotation.y += (state.velocityY + C.IDLE_ROTATION) * frames;
        aircraft.rotation.x = THREE.MathUtils.clamp(aircraft.rotation.x + state.velocityX * frames, -C.MAX_PITCH, C.MAX_PITCH);
        state.velocityX *= C.INERTIA ** frames;
        state.velocityY *= C.INERTIA ** frames;
      }
    }
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function sync() {
    last = null;
    renderer.setAnimationLoop(null);
    if (!visible || document.hidden) return;
    if (reduced.matches) {
      state.revealComplete = true;
      camera.position.copy(C.CAMERA_END);
      draw(performance.now());
    } else renderer.setAnimationLoop(draw);
  }
  resize();
  try { material = await createF35PointCloud(aircraft, renderer); }
  catch (error) { renderer.dispose(); renderer.domElement.remove(); throw error; }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  return {
    aircraft, state, element: renderer.domElement,
    setVisible(value) { if (value !== visible) { visible = value; if (visible) resize(); sync(); } },
    redraw() { if (visible && reduced.matches) draw(performance.now()); }
  };
}
