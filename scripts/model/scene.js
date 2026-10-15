import { MODEL_THEME_EVENT } from "./effects/model-palette.js";
import { modelDefaults } from "./registry.js";
import * as THREE from "three";
import * as defaults from "./config.js";
import { createPLYPointCloud } from "./ply-points.js";

// Shared scene: the page owns visibility and chooses its own input controls.
export async function createModelScene(container, model, onRevealProgress = () => { }, options = {}) {
  const C = { ...defaults, ...modelDefaults, ...model.settings };
  const diagnostic = window.StudioDiagnostics;
  const initialized = diagnostic?.start('WebGL renderer initialization');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  initialized?.();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .01, 100);
  const aircraft = new THREE.Group();
  aircraft.rotation.order = "YXZ";
  aircraft.rotation.y = C.INITIAL_Y_ROTATION;
  scene.add(aircraft);
  camera.position.copy(C.CAMERA_START);
  const curve = new THREE.CubicBezierCurve3(C.CAMERA_START, C.CAMERA_CONTROL_1, C.CAMERA_CONTROL_2, C.CAMERA_END);
  const state = { revealComplete: false, targetCameraZ: C.CAMERA_END.z, dragging: false, velocityX: 0, velocityY: 0 };
  // World X/Y match the interactive camera, which looks along -Z.
  // Premultiplication keeps drag independent of the model's current heading.
  const screenRight = new THREE.Vector3(1, 0, 0);
  const screenUp = new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Quaternion();
  let pitch = 0;
  function rotateView(yawDelta, pitchDelta) {
    const nextPitch = THREE.MathUtils.clamp(pitch + pitchDelta, -C.MAX_PITCH, C.MAX_PITCH);
    aircraft.quaternion.premultiply(turn.setFromAxisAngle(screenUp, yawDelta));
    aircraft.quaternion.premultiply(turn.setFromAxisAngle(screenRight, nextPitch - pitch));
    pitch = nextPitch;
  }
  let textTexture;
  let material, visible = false, last = null, elapsed = 0, lastControlOpacity = -1;
  let formationDuration = null, cameraDuration = null, formationDone = false;
  let settledNotified = false, textForegroundNotified = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  container.append(renderer.domElement);
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    if (material) material.uniforms.uScale.value = renderer.domElement.height / 2;
    // Resizing clears the drawing buffer. Paint synchronously before the
    // browser can present it, including the Canvas2D-to-WebGL handoff;
    // waiting for the animation loop leaves a blank particle frame.
    if (visible && material) draw(performance.now());
  }
  function draw(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now;
    elapsed += dt;
    const frames = dt * 60;
    material.uniforms.uTime.value = elapsed;
    if (formationDuration !== null) {
      const p = reduced.matches ? 1 : Math.min(1, elapsed * 1000 / formationDuration);
      material.uniforms.uFormation.value = p * p * (3 - 2 * p);
      if (p === 1 && !formationDone) { formationDone = true; options.onFormed?.(); }
    }
    // Dissolve starts formation and the camera curve together, with separate
    // durations so the model can finish forming during the pullback.
    // Its page-text delay already supplied the pause before this reveal.
    const revealHold = formationDuration === null ? C.REVEAL_HOLD : 0;
    const revealDuration = cameraDuration ?? C.REVEAL_DURATION;
    if (!state.revealComplete) {
      const p = THREE.MathUtils.clamp((elapsed * 1000 - revealHold) / revealDuration, 0, 1);
      const eased = p < .5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2;
      curve.getPoint(eased, camera.position);
      aircraft.rotation.y += THREE.MathUtils.lerp(C.REVEAL_ROTATION_START, C.IDLE_ROTATION, p * p * (3 - 2 * p)) * frames;
      if (p === 1) state.revealComplete = true;
    } else {
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, state.targetCameraZ, reduced.matches ? 1 : 1 - (1 - C.ZOOM_SMOOTHING) ** frames);
      if (!state.dragging && !reduced.matches) {
        rotateView((state.velocityY + C.IDLE_ROTATION) * frames, state.velocityX * frames);
        state.velocityX *= C.INERTIA ** frames;
        state.velocityY *= C.INERTIA ** frames;
      }
    }
    if (formationDuration !== null && !textForegroundNotified &&
        (reduced.matches || elapsed * 1000 >= Math.max(0, cameraDuration - 1000))) {
      textForegroundNotified = true;
      options.onTextForeground?.();
    }
    camera.lookAt(0, 0, 0);
    const rendered = diagnostic?.start('WebGL render CPU submission');
    renderer.render(scene, camera);
    rendered?.();
    if (!settledNotified && state.revealComplete && (formationDuration === null || formationDone)) {
      settledNotified = true;
      options.onSettled?.();
    }
    // Use the same clock as the camera so stalls and hidden tabs stay in sync.
    const progress = formationDuration !== null && !formationDone ? 0 : state.revealComplete ? 1 : THREE.MathUtils.clamp(
      (elapsed * 1000 - revealHold - revealDuration + 600) / 600, 0, 1);
    const opacity = 1 - (1 - progress) ** 2;
    if (opacity !== lastControlOpacity) {
      lastControlOpacity = opacity;
      onRevealProgress(opacity);
    }
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
  try {
    material = await createPLYPointCloud(aircraft, renderer, model, undefined, options.prepareDissolve);
    // Prepare shaders during the intro without advancing the reveal animation.
    const compiled = diagnostic?.start('Shader compile (async wall time)');
    await renderer.compileAsync(scene, camera);
    compiled?.();
    // Upload the static buffers before the visible reveal. A tiny offscreen
    // render with transparent/clipped points avoids painting or advancing time.
    const warmed = diagnostic?.start('Pre-reveal GPU buffer upload (CPU submission)');
    // Use the normal framebuffer so warming does not create a different shader
    // variant for a render target. The container is still hidden here.
    renderer.setSize(1, 1, false);
    const aspect = camera.aspect;
    camera.aspect = 1; camera.updateProjectionMatrix();
    material.uniforms.uFormation.value = 0;
    try {
      renderer.render(scene, camera);
    } finally {
      material.uniforms.uFormation.value = 1;
      camera.aspect = aspect; camera.updateProjectionMatrix();
    }
    warmed?.();
  }
  catch (error) { renderer.dispose(); renderer.domElement.remove(); throw error; }
  addEventListener(MODEL_THEME_EVENT, () => { if (visible && reduced.matches) draw(performance.now()); });
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  return {
    get dissolveStarted() { return formationDuration !== null; },
    beginDissolve(snapshot, duration, pullbackDuration = C.REVEAL_DURATION) {
      if (!snapshot || formationDuration !== null) return;
      const handedOff = diagnostic?.start('Dissolve snapshot handoff');
      const bubbles = snapshot.points;
      const geometry = material.userData.geometry;
      const values = geometry.getAttribute('aDissolve');
      const colors = geometry.getAttribute('aDissolveColor');
      const softCores = geometry.getAttribute('aDissolveSoftCore');
      const indices = geometry.index?.array;
      const count = Math.min(bubbles.length / 4, indices?.length ?? values.count);
      const color = new THREE.Color();
      // Full buffers were prepared in the worker and uploaded during warm-up.
      // Only the entrance particles change at the visible handoff.
      for (let i = 0; i < count; i++) {
        const vertex = indices ? indices[i] : i;
        values.array.set(bubbles.subarray(i * 4, i * 4 + 4), vertex * 4);
        color.set(snapshot.colors[i]).toArray(colors.array, vertex * 3);
        softCores.array[vertex] = snapshot.softCores?.[i] ?? 1;
        values.addUpdateRange(vertex * 4, 4);
        colors.addUpdateRange(vertex * 3, 3);
        softCores.addUpdateRange(vertex, 1);
      }
      values.needsUpdate = colors.needsUpdate = softCores.needsUpdate = true;
      formationDuration = Math.max(1, duration);
      cameraDuration = Math.max(1, pullbackDuration); elapsed = 0;
      material.uniforms.uFormation.value = 0;
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      state.revealComplete = false; camera.position.copy(C.CAMERA_START);
      handedOff?.();
    },
    aircraft, state, rotateView, element: renderer.domElement,
    setTextMask(canvas, enabled) {
      if (!textTexture) {
        textTexture = new THREE.CanvasTexture(canvas);
        textTexture.generateMipmaps = false;
        textTexture.minFilter = THREE.LinearFilter;
        material.uniforms.uTextMask.value = textTexture;
      }
      textTexture.needsUpdate = true;
      material.uniforms.uTextEnabled.value = enabled ? 1 : 0;
      material.uniforms.uTextViewport.value.set(canvas.width, canvas.height);
      material.uniforms.uTextPixelRatio.value = renderer.getPixelRatio();
      if (visible && reduced.matches) draw(performance.now());
    },
    setTextMaskEnabled(enabled) {
      material.uniforms.uTextEnabled.value = enabled ? 1 : 0;
      if (visible && reduced.matches) draw(performance.now());
    },
    setVisible(value) { if (value !== visible) { visible = value; if (visible) resize(); sync(); } },
    redraw() { if (visible && reduced.matches) draw(performance.now()); }
  };
}
