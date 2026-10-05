import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupModelControls } from './controls.js';
import { INERTIA, MAX_PITCH, ZOOM_SMOOTHING } from './config.js';
import { createModelLines } from './effects/model-lines.js';
import { createSpectral } from './effects/model-spectral.js';
import { createFrameClock } from '../shared/frame-clock.js';
import { curiositySettings } from './settings/curiosity.js';

const host = document.querySelector('#about-rover');
const button = document.querySelector('#about-model-expand');
const text = [...document.querySelectorAll('.about-intro, .about .main-nav, .site-header')];
const buttonPlaceholder = document.createElement('span');
buttonPlaceholder.className = 'about-model-placeholder';
buttonPlaceholder.setAttribute('aria-hidden', 'true');
let savedView, viewTransition;
let viewMix = 0;
let viewportWidth = 1, viewportHeight = 1, blockLift = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const state = { revealComplete: true, targetCameraZ: 6.9, dragging: false, velocityX: 0, velocityY: 0 };
const screenRight = new THREE.Vector3(), screenUp = new THREE.Vector3(), turn = new THREE.Quaternion();
let pitch = 0, zoom = state.targetCameraZ;
let renderer, controls, model, mixer, lines, spectral, observer;
let frame = 0, last = null, expanded = false, disposed = false;
let playbackStarted = false, entranceStarted = false, entranceElapsed = 0, revealedAt = null;
const entrance = { value: -1000 };
const dotBuildDuration = .5;
const sweepDuration = 3;
const animationDelay = .5;
const worldUp = new THREE.Vector3(0, 1, 0);
const frameClock = createFrameClock();
let spectralPreparation, preparingSpectral;
let backgroundLayer = null;
const layerFades = [];
const layerTargets = [
  [document.querySelector('.site-header .header-blur'), 0],
  [document.querySelector('.site-header .header-inner'), .85],
  [document.querySelector('.about-intro'), .9]
];
function cancelLayerFades() {
  layerFades.forEach(animation => animation.cancel());
  layerFades.length = 0;
}
const meshes = [];
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

function resize() {
  if (!renderer) return;
  const { width, height } = host.getBoundingClientRect();
  camera.aspect = width / Math.max(height, 1);
  // Desktop uses 85% of the original visual size; preserve mobile framing.
  camera.zoom = width < 700 ? 1 : .85;
  viewportWidth = width; viewportHeight = height;
  blockLift = parseFloat(getComputedStyle(document.body).getPropertyValue('--about-block-lift')) || 0;
  if (expanded) {
    const anchor = buttonPlaceholder.getBoundingClientRect();
    button.style.left = `${anchor.left}px`;
    button.style.top = `${anchor.top}px`;
  }
  // Lift the projection by the same CSS-pixel distance as the text.
  updateProjection();
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, width < 700 ? 1.25 : 1.5));
  renderer.setSize(width, height, false);
  wake();
}
function updateProjection() {
  const width = viewportWidth, height = viewportHeight;
  const offset = 1 - viewMix;
  camera.setViewOffset(width, height, -width * (width < 700 ? .10 : .17) * offset,
    (height * (width < 700 ? .22 : .19) + blockLift) * offset, width, height);
}
function advanceView(dt) {
  if (!viewTransition) return;
  const transition = viewTransition;
  transition.elapsed += dt;
  const t = reduced.matches ? 1 : Math.min(1, transition.elapsed / .65);
  const ease = t * t * (3 - 2 * t);
  viewMix = THREE.MathUtils.lerp(transition.from, expanded ? 1 : 0, ease);
  rotation.quaternion.slerpQuaternions(transition.fromRotation, transition.toRotation, ease);
  pitch = THREE.MathUtils.lerp(transition.fromPitch, transition.toPitch, ease);
  updateProjection();
  if (t === 1) {
    viewTransition = null;
    if (!expanded) savedView = null;
  }
}
function draw(now) {
  frame = 0;
  if (disposed || document.hidden || !lines || !entranceStarted) return;
  if (last === null) frameClock.reset();
  const dt = frameClock.tick(now, reduced.matches);
  last = now;
  if (dt === null) { wake(); return; }
  if (!playbackStarted) entranceElapsed += dt;
  const useSpectral = spectral && !reduced.matches;
  if (!useSpectral && revealedAt === null) finishReveal();
  advanceView(dt);
  if (playbackStarted && !expanded && !viewTransition && !reduced.matches) mixer?.update(dt);
  const frames = dt * 60;
  zoom = THREE.MathUtils.lerp(zoom, state.targetCameraZ, reduced.matches ? 1 : 1 - (1 - ZOOM_SMOOTHING) ** frames);
  camera.position.copy(view).normalize().multiplyScalar(zoom * Math.max(1, .85 / camera.aspect));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  if (!viewTransition && !state.dragging && !reduced.matches) {
    rotateView(state.velocityY * frames, state.velocityX * frames);
    if (expanded) rotation.quaternion.premultiply(turn.setFromAxisAngle(worldUp, .06 * dt));
    state.velocityX *= INERTIA ** frames; state.velocityY *= INERTIA ** frames;
  }
  scene.updateMatrixWorld(true);
  // Match Lab dimensions to the About model's smaller desktop framing.
  const detailScale = viewportWidth < 700 ? 1 : .8 * camera.zoom;
  // Use the same dot scale for the entrance and expanded view.
  const dotScale = .8 * camera.zoom * (viewportWidth < 700 ? .95 : .75);
  const revealing = useSpectral && !expanded && revealedAt === null;
  spectral?.setEnabled(Boolean(useSpectral && (expanded || revealing)));
  if (useSpectral && (expanded || revealing)) {
    // Keep Spectral's scan field; increase only its travel rate through this first pass.
    spectral.update(dt, renderer, true, true, true, dotScale,
      revealing ? THREE.MathUtils.lerp(.05, 1, Math.min(1, entranceElapsed / dotBuildDuration)) : 1,
      revealing ? entranceElapsed < dotBuildDuration ? 0 : 1 / (2 * curiositySettings.spectral.scanSpeed * sweepDuration) : 1);
    if (revealing) {
      // Carry the band and its halo past the top before removing the effect.
      const progress = spectral.upwardProgress;
      spectral.scan.scanHeight.value += spectral.scan.scanWidth.value * 2.6 * THREE.MathUtils.smoothstep(progress, .7, 1);
      entrance.value = entranceElapsed < dotBuildDuration ? -1000 : spectral.scan.scanHeight.value + spectral.scan.scanWidth.value * .56;
      if (spectral.upwardProgress >= 1) finishReveal();
    }
  }
  if (revealedAt !== null && (reduced.matches || entranceElapsed - revealedAt >= animationDelay)) playbackStarted = true;
  lines.options.surface = expanded || (revealing && revealedAt === null) ? curiositySettings.line.surface : 'solid';
  lines.options.creases = viewportWidth >= 700 && curiositySettings.line.creases;
  // The faint rear-edge pass costs one draw per mesh and is barely visible at .05.
  lines.options.hidden = viewportWidth < 700 && (expanded || revealing) ? 'off' : curiositySettings.line.hidden;
  lines.update(renderer, useSpectral && (expanded || revealedAt === null) ? spectral.scan : undefined, true, detailScale);
  renderer.render(scene, camera);
  const interacting = Math.abs(state.velocityX) + Math.abs(state.velocityY) > .0001 || Math.abs(zoom - state.targetCameraZ) > .001;
  if (!reduced.matches || interacting || viewTransition) wake();
  else last = null;
}
function finishReveal() {
  revealedAt = entranceElapsed;
  entrance.value = 1000;
  button.hidden = false;
  spectral?.setEnabled(expanded && !reduced.matches);
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
function setExpanded(value, restoreFocus = false) {
  if (value === expanded || !lines) return;
  cancelLayerFades();
  if (value) {
    savedView ??= { quaternion: rotation.quaternion.clone(), pitch, zoom, target: state.targetCameraZ };
    button.before(buttonPlaceholder);
    document.body.append(button);
  } else {
    state.targetCameraZ = savedView.target;
    buttonPlaceholder.replaceWith(button);
    button.style.removeProperty('left');
    button.style.removeProperty('top');
  }
  viewTransition = {
    from: viewMix, elapsed: 0,
    fromRotation: rotation.quaternion.clone(),
    toRotation: value ? rotation.quaternion.clone() : savedView.quaternion.clone(),
    fromPitch: pitch, toPitch: value ? pitch : savedView.pitch
  };
  expanded = value;
  if (reduced.matches) advanceView(0);
  lines.options.surface = value ? curiositySettings.line.surface : 'solid';
  if (value) prepareSpectral();
  spectral?.setEnabled(value && !reduced.matches);
  controls.reset();
  document.documentElement.classList.toggle('about-model-expanded', value);
  text.forEach(element => { element.inert = value; });
  button.setAttribute('aria-expanded', String(value));
  button.setAttribute('aria-label', value ? 'Close rover view' : 'Explore Curiosity rover');
  last = null;
  resize();
  if (restoreFocus) button.focus({ preventScroll: true });
  wake();
}
function prepareSpectral() {
  if (disposed || spectral || reduced.matches) return;
  if (spectralPreparation) return spectralPreparation;
  const effect = createSpectral(meshes, { deferPreparation: true });
  preparingSpectral = effect;
  Object.assign(effect.options, curiositySettings.spectral);
  if (viewportWidth < 700) {
    effect.options.density = Math.min(effect.options.density, 15000);
  }
  spectralPreparation = (async () => {
    if (!await effect.rebuildAsync(events.signal, true) || disposed) return;
    await effect.precompile(renderer, camera);
    if (disposed) return;
    spectral = effect;
    preparingSpectral = null;
    spectral.setEnabled(expanded && !reduced.matches);
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
  if (expanded) setExpanded(false);
  disposed = true;
  cancelLayerFades();
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
    renderer.setClearColor(0, 0);
    host.append(renderer.domElement);
    controls = setupModelControls({ element: renderer.domElement, state, rotateView,
      isEnabled: () => expanded && !viewTransition, redraw: wake });
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
    scene.updateMatrixWorld(true);
    camera.position.copy(view); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    lines = createModelLines(meshes, scene, entrance);
    Object.assign(lines.options, curiositySettings.line, {
      // Opaque paper-colored faces occlude page text while preserving the line style.
      surface: 'solid', shading: false,
      surfaceColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f9f8f6'
    });
    lines.setEnabled(true);
    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopPingPong, Infinity).play();
    observer = new ResizeObserver(resize); observer.observe(host);
    mixer.update(0);
    scene.updateMatrixWorld(true);
    resize();
    await prepareSpectral();
    if (disposed) return;
    lines.update(renderer, undefined, true, viewportWidth < 700 ? 1 : .8 * camera.zoom);
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
function syncScrollLayer() {
  const next = scrollY > 1;
  if (next === backgroundLayer) return;
  const initial = backgroundLayer === null;
  backgroundLayer = next;
  cancelLayerFades();
  document.documentElement.classList.toggle('about-rover-background', next);
  if (initial || expanded || reduced.matches || disposed) return;
  for (const [element, opacity] of layerTargets) {
    if (element) layerFades.push(element.animate([{ opacity }, { opacity: 1 }], {
      duration: 140, easing: 'ease-out'
    }));
  }
}
addEventListener('scroll', syncScrollLayer, { passive: true, signal: events.signal });
syncScrollLayer();
button.addEventListener('click', event => setExpanded(!expanded, event.detail === 0), { signal: events.signal });
// Keep the page's footer/overscroll gestures out of the expanded viewer.
for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
  host.addEventListener(type, event => { if (expanded) event.stopPropagation(); }, { passive: true, signal: events.signal });
}
document.addEventListener('keydown', event => {
  if (!expanded) return;
  if (event.key === 'Escape') { event.preventDefault(); setExpanded(false, true); }

}, { signal: events.signal });
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = 0; last = null; wake();
}, { signal: events.signal });
reduced.addEventListener('change', () => { cancelLayerFades(); last = null; wake(); }, { signal: events.signal });
addEventListener('pagehide', event => { if (!event.persisted) release(); }, { signal: events.signal });
addEventListener('pageshow', () => { last = null; wake(); }, { signal: events.signal });
// Prepare alongside the text, then advance directly from its completion event.
const textReady = document.documentElement.dataset.aboutReady ? Promise.resolve() : new Promise(resolve => {
  addEventListener('about-ready', resolve, { once: true, signal: events.signal });
});
start();
