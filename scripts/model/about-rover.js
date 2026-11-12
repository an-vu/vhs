import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupModelControls } from './controls.js';
import { INERTIA, MAX_PITCH, ZOOM_SMOOTHING } from './config.js';
import { createModelLines } from './effects/model-lines.js';
import { createSpectral } from './effects/model-spectral.js';
import { paletteColors, MODEL_THEME_EVENT } from './effects/model-palette.js';
import { createFrameClock } from '../shared/frame-clock.js';
import { curiositySettings } from './settings/curiosity.js';
import { createAboutRoverView } from './about-rover-view.js';
import { sideways } from '../shared/phone.js';

// The rover's phone framing: under 700 px wide, or a phone on its side.
const small = width => width < 700 || sideways.matches;

const host = document.querySelector('#about-rover');
const button = document.querySelector('#about-model-expand');
let viewportWidth = 1;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const state = { revealComplete: true, targetCameraZ: 6.9, dragging: false, velocityX: 0, velocityY: 0 };
const screenRight = new THREE.Vector3(), screenUp = new THREE.Vector3(), turn = new THREE.Quaternion();
let pitch = 0, zoom = state.targetCameraZ;
let renderer, controls, model, mixer, lines, spectral, observer;
let frame = 0, last = null, disposed = false;
let playbackStarted = false, entranceStarted = false, entranceElapsed = 0, revealedAt = null, hold = 0;
const entrance = { value: -1000 };
const dotBuildDuration = .5;
const sweepDuration = 3;
const animationDelay = .5;
const animationSpeed = 1.3;
// The rover's moving parts play out and back; back at the start they rest this
// long (seconds) before playing out again.
const restartHold = 1;
const worldUp = new THREE.Vector3(0, 1, 0);
// Half the rover's box (a little roomier, for the arm as it moves), for telling
// whether any of it is on screen (onScreen()).
const corner = new THREE.Vector3();
let halfSize = null;
const frameClock = createFrameClock();
let spectralPreparation, preparingSpectral;
const meshes = [];
// What each part moves with (set once the model loads): its nearest animated part, or the model.
let partGroup = null;
const scene = new THREE.Scene();
// draw() updates the hierarchy once for the line effect and renderer.
scene.matrixWorldAutoUpdate = false;
const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
const view = new THREE.Vector3(2.8, 1.6, 5);
const wrapper = new THREE.Group();
const rotation = new THREE.Group();
rotation.add(wrapper); scene.add(rotation);
const invisible = new THREE.MeshBasicMaterial({ visible: false });
const originalMaterials = new Set();
const geometries = new Set();

const roverView = createAboutRoverView({
  host, button, camera, rotation, state, reduced, signal: events.signal,
  getPitch: () => pitch,
  setPitch: value => { pitch = value; },
  canExpand: () => Boolean(lines),
  isDisposed: () => disposed,
  onExpandedChange(value) {
    lines.options.surface = value ? curiositySettings.line.surface : 'solid';
    if (value) prepareSpectral();
    spectral?.setEnabled(value && !reduced.matches);
    controls.reset();
    last = null;
    resize();
    wake();
  }
});

function resize() {
  if (!renderer) return;
  const { width, height } = host.getBoundingClientRect();
  camera.aspect = width / Math.max(height, 1);
  // Desktop uses 85% of the original visual size; preserve mobile framing. A phone
  // on its side: 70%, so it fits its band between the header and the text.
  camera.zoom = sideways.matches ? .7 : small(width) ? 1 : .85;
  viewportWidth = width;
  roverView.resize(width, height);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, small(width) ? 1.25 : 1.5));
  renderer.setSize(width, height, false);
  wake();
}
// The rover scrolls with the page (about.css) and holds still while it does:
// nothing is drawn until the scrolling stops, then it carries on from there.
// While its dots are still building it, they keep bubbling and only their sweep
// up the rover holds (`held` in draw()).
let scrolling = false, scrollRest = 0;
addEventListener('scroll', () => {
  if (roverView.expanded) return;
  scrolling = true;
  clearTimeout(scrollRest);
  scrollRest = setTimeout(() => { scrolling = false; last = null; wake(); }, 150);
}, { passive: true, signal: events.signal });
function draw(now) {
  frame = 0;
  if (disposed || document.hidden || !lines || !entranceStarted) return;
  const held = scrolling && !roverView.expanded && !roverView.transitioning;
  // Scrolled out of view, it stops; scrolling back (the scroll's end wakes it), it carries on.
  if (!roverView.expanded && !roverView.transitioning && !onScreen()) { last = null; return; }
  if (held && !(spectral && !reduced.matches && revealedAt === null)) { last = null; return; }
  if (last === null) frameClock.reset();
  // Playing on its own (the slow parts moving), it draws 30 times a second, half the
  // work; 60 while it's revealed, dragged, zoomed, opened or closed.
  const onItsOwn = playbackStarted && !roverView.expanded && !roverView.transitioning && !state.dragging
    && Math.abs(state.velocityX) + Math.abs(state.velocityY) <= .0001 && Math.abs(zoom - state.targetCameraZ) <= .001;
  const dt = frameClock.tick(now, reduced.matches, onItsOwn ? 30 : 60);
  last = now;
  if (dt === null) { wake(); return; }
  // Held, the dots still fill in, but their sweep up the rover waits.
  if (!playbackStarted && !(held && entranceElapsed >= dotBuildDuration)) entranceElapsed += dt;
  const useSpectral = spectral && !reduced.matches;
  if (!useSpectral && revealedAt === null) finishReveal();
  roverView.advance(dt);
  if (playbackStarted && !roverView.expanded && !roverView.transitioning && !reduced.matches) {
    if (hold > 0) hold -= dt;
    else mixer?.update(dt);
  }
  const frames = dt * 60;
  zoom = THREE.MathUtils.lerp(zoom, state.targetCameraZ, reduced.matches ? 1 : 1 - (1 - ZOOM_SMOOTHING) ** frames);
  camera.position.copy(view).normalize().multiplyScalar(zoom * Math.max(1, .85 / camera.aspect));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  if (!roverView.transitioning && !state.dragging && !reduced.matches) {
    rotateView(state.velocityY * frames, state.velocityX * frames);
    if (roverView.expanded) rotation.quaternion.premultiply(turn.setFromAxisAngle(worldUp, .06 * dt));
    state.velocityX *= INERTIA ** frames; state.velocityY *= INERTIA ** frames;
  }
  scene.updateMatrixWorld(true);
  // Match Lab dimensions to the About model's smaller desktop framing.
  const detailScale = small(viewportWidth) ? 1 : .8 * camera.zoom;
  // Use the same dot scale for the entrance and the expanded view.
  const dotScale = .8 * camera.zoom * (small(viewportWidth) ? .95 : .75);
  const revealing = useSpectral && !roverView.expanded && revealedAt === null;
  spectral?.setEnabled(Boolean(useSpectral && (roverView.expanded || revealing)));
  if (useSpectral && (roverView.expanded || revealing)) {
    // Keep Spectral's scan field; increase only its travel rate through this first pass.
    spectral.update(dt, renderer, true, true, true, dotScale,
      revealing ? THREE.MathUtils.lerp(.05, 1, Math.min(1, entranceElapsed / dotBuildDuration)) : 1,
      revealing ? entranceElapsed < dotBuildDuration || held ? 0 : 1 / (2 * curiositySettings.spectral.scanSpeed * sweepDuration) : 1);
    if (revealing) {
      // Carry the band and its halo past the top before removing the effect.
      const progress = spectral.upwardProgress;
      spectral.scan.scanHeight.value += spectral.scan.scanWidth.value * 2.6 * THREE.MathUtils.smoothstep(progress, .7, 1);
      entrance.value = entranceElapsed < dotBuildDuration ? -1000 : spectral.scan.scanHeight.value + spectral.scan.scanWidth.value * .56;
      if (spectral.upwardProgress >= 1) finishReveal();
    }
  }
  if (revealedAt !== null && (reduced.matches || entranceElapsed - revealedAt >= animationDelay)) playbackStarted = true;
  const detailBlend = small(viewportWidth) && !roverView.expanded && revealedAt !== null && !reduced.matches
    ? THREE.MathUtils.smoothstep(entranceElapsed - revealedAt, 0, animationDelay) : 1;
  // Ease in the paper surface and rear edges after the mobile scan clears the model.
  lines.options.surface = roverView.expanded || (revealing && revealedAt === null)
    ? curiositySettings.line.surface : detailBlend < 1 ? 'ghost' : 'solid';
  lines.options.surfaceOpacity = detailBlend;
  lines.options.hiddenOpacity = curiositySettings.line.hiddenOpacity * detailBlend;
  lines.options.creases = !small(viewportWidth) && curiositySettings.line.creases;
  // The faint rear-edge pass costs one draw per mesh and is barely visible at .05.
  lines.options.hidden = small(viewportWidth) && (roverView.expanded || revealing) ? 'off' : curiositySettings.line.hidden;
  lines.update(renderer, useSpectral && (roverView.expanded || revealedAt === null) ? spectral.scan : undefined, true, detailScale);
  renderer.render(scene, camera);
  const interacting = Math.abs(state.velocityX) + Math.abs(state.velocityY) > .0001 || Math.abs(zoom - state.targetCameraZ) > .001;
  if (!reduced.matches || interacting || roverView.transitioning) wake();
  else last = null;
}
// Whether any of the rover shows: its box as last drawn, against the view.
function onScreen() {
  if (!halfSize) return true;
  const box = host.getBoundingClientRect();
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1).multiply(halfSize).applyMatrix4(rotation.matrixWorld).project(camera);
    low = Math.min(low, corner.y); high = Math.max(high, corner.y);
  }
  return box.top + (1 - low) / 2 * box.height > 0 && box.top + (1 - high) / 2 * box.height < innerHeight;
}
function finishReveal() {
  revealedAt = entranceElapsed;
  entrance.value = 1000;
  button.hidden = false;
  spectral?.setEnabled(roverView.expanded && !reduced.matches);
}
function wake() {
  if (!frame && !disposed && !document.hidden && lines) frame = requestAnimationFrame(draw);
}
function rotateView(yaw, deltaPitch) {
  const nextPitch = THREE.MathUtils.clamp(pitch + deltaPitch, -MAX_PITCH, MAX_PITCH);
  screenRight.setFromMatrixColumn(camera.matrixWorld, 0);
  screenUp.setFromMatrixColumn(camera.matrixWorld, 1);
  rotation.quaternion.premultiply(turn.setFromAxisAngle(screenUp, yaw));
  rotation.quaternion.premultiply(turn.setFromAxisAngle(screenRight, nextPitch - pitch));
  pitch = nextPitch;
}
function prepareSpectral() {
  if (disposed || spectral || reduced.matches) return;
  if (spectralPreparation) return spectralPreparation;
  // The dots go in the same moving groups as the lines (model-spectral.js).
  const effect = createSpectral(meshes, { deferPreparation: true, scanRoot: rotation, groupOf: mesh => partGroup?.(mesh) ?? mesh });
  preparingSpectral = effect;
  Object.assign(effect.options, curiositySettings.spectral);
  if (small(viewportWidth)) {
    effect.options.density = Math.min(effect.options.density, 15000);
  }
  spectralPreparation = (async () => {
    if (!await effect.rebuildAsync(events.signal, true) || disposed) return;
    await effect.precompile(renderer, camera);
    if (disposed) return;
    spectral = effect;
    preparingSpectral = null;
    spectral.setEnabled(roverView.expanded && !reduced.matches);
    wake();
  })().catch(error => {
    if (!disposed) {
      effect.dispose(); preparingSpectral = null;
      console.warn('Spectral preparation unavailable:', error);
    }
  }).finally(() => { spectralPreparation = null; });
  return spectralPreparation;
}
function release() {
  if (disposed) return;
  roverView.dispose();
  disposed = true;
  cancelAnimationFrame(frame);
  events.abort(); observer?.disconnect(); controls?.reset();
  mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
  preparingSpectral?.dispose(); preparingSpectral = null;
  spectral?.dispose(); lines?.dispose();
  geometries.forEach(geometry => geometry.dispose());
  const textures = new Set();
  originalMaterials.forEach(material => {
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    material.dispose();
  });
  textures.forEach(texture => texture.dispose()); invisible.dispose();
  renderer?.dispose(); renderer?.domElement.remove();
  button.hidden = true;
}
async function start() {
  if (disposed) return;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(paletteColors().ink, 0);
    host.append(renderer.domElement);
    controls = setupModelControls({
      element: renderer.domElement, state, rotateView,
      isEnabled: () => roverView.expanded && !roverView.transitioning, redraw: wake
    });
    const gltf = await new GLTFLoader().loadAsync(new URL('../../models/curiosity.glb', import.meta.url).href);
    if (disposed) {
      gltf.scene.traverse(object => {
        object.geometry?.dispose();
        for (const material of [object.material].flat().filter(Boolean)) {
          Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); });
          material.dispose();
        }
      });
      return;
    }
    model = gltf.scene;
    model.traverse(object => {
      if (!object.isMesh) return;
      meshes.push(object); geometries.add(object.geometry);
      [object.material].flat().forEach(material => originalMaterials.add(material));
      object.material = invisible;
    });
    wrapper.add(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!(extent > 0 && Number.isFinite(extent))) throw new Error('Invalid rover bounds');
    const scale = 3.5 * .8 / extent;
    wrapper.scale.setScalar(scale);
    wrapper.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
    halfSize = size.clone().multiplyScalar(scale / 2 * 1.15);
    scene.updateMatrixWorld(true);
    camera.position.copy(view); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // Parts that always move together are drawn as one (model-lines.js): each
    // follows its nearest animated part, or the model.
    const moving = new Set((gltf.animations[0]?.tracks ?? []).map(track => THREE.PropertyBinding.parseTrackName(track.name).nodeName));
    const groupOf = mesh => { for (let node = mesh; node && node !== wrapper; node = node.parent) if (moving.has(node.name)) return node; return model; };
    partGroup = groupOf;
    lines = createModelLines(meshes, scene, entrance, { followTheme: true, groupOf });
    Object.assign(lines.options, curiositySettings.line, {
      // Opaque paper-colored faces occlude page text while preserving the line style.
      surface: 'solid', shading: false,
      color: '#' + paletteColors().ink.getHexString(),
      surfaceColor: '#' + paletteColors().paper.getHexString()
    });
    lines.setEnabled(true);
    mixer = new THREE.AnimationMixer(model);
    mixer.timeScale = animationSpeed;
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopPingPong, Infinity).play();
    // It turns around at the far end, then back at the start: every second turn.
    let turns = 0;
    mixer.addEventListener('loop', () => { if (++turns % 2 === 0) hold = restartHold; });
    observer = new ResizeObserver(resize); observer.observe(host);
    mixer.update(0);
    scene.updateMatrixWorld(true);
    resize();
    await prepareSpectral();
    if (disposed) return;
    lines.update(renderer, undefined, true, small(viewportWidth) ? 1 : .8 * camera.zoom);
    await renderer.compileAsync(scene, camera);
    await textReady;
    if (disposed) return;
    entranceStarted = true;
    host.classList.add('is-ready');
    last = null; wake();
  } catch (error) {
    if (disposed) return;
    console.error('Could not load the About rover:', error);
    release();
  }
}
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = 0; last = null; wake();
}, { signal: events.signal });
reduced.addEventListener('change', () => { last = null; wake(); }, { signal: events.signal });
addEventListener('pagehide', event => { if (!event.persisted) release(); }, { signal: events.signal });
addEventListener('pageshow', () => { last = null; wake(); }, { signal: events.signal });
// Prepare alongside the text, then advance directly from its completion event.
const textReady = document.documentElement.dataset.aboutReady ? Promise.resolve() : new Promise(resolve => {
  addEventListener('about-ready', resolve, { once: true, signal: events.signal });
});
addEventListener(MODEL_THEME_EVENT, wake, { signal: events.signal });
start();
