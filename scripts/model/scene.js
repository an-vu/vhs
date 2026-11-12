import { MODEL_THEME_EVENT } from "./effects/model-palette.js";
import { modelDefaults } from "./registry.js";
import * as THREE from "three";
import * as defaults from "./config.js";
import { createPLYPointCloud } from "./ply-points.js";
import { createBleed } from "./bleed.js";
import { sideways } from "../shared/phone.js";

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
  // The bleed (bleed.js), once the material exists; it shows once the model has formed.
  let bleed = () => {};
  let textTexture;
  let material, visible = false, last = null, elapsed = 0, lastControlOpacity = -1;
  let formationDuration = null, cameraDuration = null, formationDone = false;
  // The Dissolve's handed-over dots while the model forms (beginDissolve).
  let introDots = null;
  let settledNotified = false, textForegroundNotified = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // Touch screens draw the dots at their own sharpness setting (config.js).
  const touch = matchMedia("(pointer: coarse)");
  container.append(renderer.domElement);
  // A phone on its side: the model sits in the left half, beside Home's text, and
  // big, sized from the screen's width rather than its height (Safari's bars can
  // leave under 300 px of it): side-on, its length (the longest side, 3.5 units
  // once loaded) is SIDE_FILL of the width, running past the screen's edge, the
  // dots keeping out of the letters. The view is shifted and zoomed, not the
  // canvas, so the Dissolve's dots still hand over where they are; opened
  // (Explore model), it glides back to the middle.
  // Centred at 41% of the width, so side-on (the widest it gets as it turns, its
  // near end about 5% bigger for the perspective) it stays about 25 px inside the
  // left edge and reaches about to the headline.
  const SIDE_SHIFT = -.09, SIDE_FILL = .72, MODEL_LENGTH = 3.5;
  const sideZoom = () => SIDE_FILL * viewWidth / viewHeight
    * 2 * C.CAMERA_END.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / MODEL_LENGTH;
  let shift = 0, centered = false, viewWidth = 1, viewHeight = 1;
  function placeView(dt = null) {
    const target = sideways.matches && !centered ? SIDE_SHIFT : 0;
    const zoom = sideways.matches ? sideZoom() : 1;
    if (camera.zoom !== zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
    if (dt === null && shift === target && !shift) return;
    shift = dt === null || reduced.matches ? target : THREE.MathUtils.lerp(shift, target, 1 - Math.exp(-dt * 6));
    if (Math.abs(shift - target) < .0005) shift = target;
    if (shift) camera.setViewOffset(viewWidth, viewHeight, -viewWidth * shift, 0, viewWidth, viewHeight);
    else camera.clearViewOffset();
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / Math.max(1, height);
    viewWidth = Math.max(1, width); viewHeight = Math.max(1, height);
    camera.updateProjectionMatrix();
    placeView();
    renderer.setPixelRatio(Math.min(devicePixelRatio, (touch.matches ? C.TOUCH_DOTS_PIXEL_RATIO : C.DOTS_PIXEL_RATIO) ?? 2));
    // Dots too small for a pixel keep the coverage they'd have at full sharpness.
    if (material) material.uniforms.uCoverage.value = renderer.getPixelRatio() / Math.min(devicePixelRatio, 2);
    renderer.setSize(width, height, false);
    // The dots' size follows the zoom too (a phone on its side, placeView()), so a
    // model drawn bigger has its dots in proportion: kept at the unzoomed size, most
    // came out under a pixel, were drawn a pixel big, and smeared the model dark.
    if (material) material.uniforms.uScale.value = renderer.domElement.height / 2 * camera.zoom;
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
    if (shift !== (sideways.matches && !centered ? SIDE_SHIFT : 0)) placeView(dt);
    material.uniforms.uTime.value = elapsed;
    if (formationDuration !== null) {
      const p = reduced.matches ? 1 : Math.min(1, elapsed * 1000 / formationDuration);
      material.uniforms.uFormation.value = p * p * (3 - 2 * p);
      if (p === 1 && !formationDone) { formationDone = true; endFormation(); options.onFormed?.(); }
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
    bleed(elapsed, state.revealComplete);
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
  // Formed: the handed-over dots go back into the model, drawn just as they were.
  function endFormation() {
    if (!introDots) return;
    introDots.removeFromParent();
    introDots.geometry.dispose();
    introDots = null;
    material.userData.points.geometry.setDrawRange(0, Infinity);
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
    material = await createPLYPointCloud(aircraft, renderer, model);
    material.uniforms.uCoverage.value = renderer.getPixelRatio() / Math.min(devicePixelRatio, 2);
    bleed = createBleed(aircraft, material, C);
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
      // The intro's dots become the model's first dots (bubble i is the i-th dot
      // drawn). For the formation they get a small cloud of their own carrying
      // where each was on the screen, its size, opacity, colour and softness; the
      // model skips them until it has formed (endFormation), so the rest of its
      // dots need nothing but a seed.
      const bubbles = snapshot.points;
      const points = material.userData.points, geometry = points.geometry;
      const indices = geometry.index?.array;
      const position = geometry.getAttribute('position').array, seeds = geometry.getAttribute('aSeed').array;
      const count = Math.min(bubbles.length / 4, indices?.length ?? position.length / 3);
      const at = new Float32Array(count * 3), seed = new Float32Array(count * 4);
      const colors = new Float32Array(count * 3), softCores = new Float32Array(count);
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const vertex = indices ? indices[i] : i;
        at.set(position.subarray(vertex * 3, vertex * 3 + 3), i * 3);
        seed.set(seeds.subarray(vertex * 4, vertex * 4 + 4), i * 4);
        color.set(snapshot.colors[i]).toArray(colors, i * 3);
        softCores[i] = snapshot.softCores?.[i] ?? 1;
      }
      const handed = new THREE.BufferGeometry();
      handed.setAttribute('position', new THREE.BufferAttribute(at, 3));
      handed.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      handed.setAttribute('aDissolve', new THREE.BufferAttribute(bubbles.slice(0, count * 4), 4));
      handed.setAttribute('aDissolveColor', new THREE.BufferAttribute(colors, 3));
      handed.setAttribute('aDissolveSoftCore', new THREE.BufferAttribute(softCores, 1));
      introDots = new THREE.Points(handed, material);
      introDots.frustumCulled = false;
      points.add(introDots);
      geometry.setDrawRange(count, Infinity);
      formationDuration = Math.max(1, duration);
      cameraDuration = Math.max(1, pullbackDuration); elapsed = 0;
      material.uniforms.uFormation.value = 0;
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      state.revealComplete = false; camera.position.copy(C.CAMERA_START);
      handedOff?.();
    },
    state, rotateView, element: renderer.domElement,
    setTextMask(canvas, enabled) {
      // A texture keeps the size of its first upload, so a mask that has changed
      // size (the window resized, a phone turned) gets a new one; otherwise the
      // gap around the words is drawn in the wrong place.
      if (textTexture && (textTexture.userData.width !== canvas.width || textTexture.userData.height !== canvas.height)) {
        textTexture.dispose();
        textTexture = null;
      }
      if (!textTexture) {
        textTexture = new THREE.CanvasTexture(canvas);
        textTexture.generateMipmaps = false;
        textTexture.minFilter = THREE.LinearFilter;
        textTexture.userData = { width: canvas.width, height: canvas.height };
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
    // Explore model: the view back in the middle (a phone on its side, placeView()).
    setCentered(value) { centered = value; if (reduced.matches) { placeView(); if (visible) draw(performance.now()); } },
    setVisible(value) { if (value !== visible) { visible = value; if (visible) resize(); sync(); } },
    redraw() { if (visible && reduced.matches) draw(performance.now()); }
  };
}
