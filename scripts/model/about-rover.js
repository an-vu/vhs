import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupModelControls } from './controls.js';
import { INERTIA, MAX_PITCH, ZOOM_SMOOTHING } from './config.js';
import { createModelLines } from './effects/model-lines.js';
import { createSpectral } from './effects/model-spectral.js';
import { curiositySettings } from './settings/curiosity.js';

const host = document.querySelector('#about-rover');
const button = document.querySelector('#about-model-expand');
const text = [...document.querySelectorAll('.about-intro, .about .main-nav, .site-header')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const state = { revealComplete: true, targetCameraZ: 6.9, dragging: false, velocityX: 0, velocityY: 0 };
const screenRight = new THREE.Vector3(), screenUp = new THREE.Vector3(), turn = new THREE.Quaternion();
let pitch = 0, zoom = state.targetCameraZ;
let renderer, controls, model, mixer, lines, spectral, observer;
let frame = 0, last = null, expanded = false, disposed = false;
let playbackStarted = false, reveal, startTimer;
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
  // Shift the projection, not the canvas: no corner viewport to clip the rover.
  camera.setViewOffset(width, height, -width * (width < 700 ? .10 : .17), -height * (width < 700 ? .22 : .19), width, height);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, width < 700 ? 1.25 : 1.5));
  renderer.setSize(width, height, false);
  wake();
}
function draw(now) {
  frame = 0;
  if (disposed || document.hidden || !lines) return;
  // Avoid doubling the full background workload on 120/144 Hz displays.
  if (!reduced.matches && last !== null && now - last < 1000 / 60 - .5) { wake(); return; }
  const dt = last === null ? 0 : Math.min((now - last) / 1000, .05);
  last = now;
  if (playbackStarted && !reduced.matches) mixer?.update(dt);
  const frames = dt * 60;
  zoom = THREE.MathUtils.lerp(zoom, state.targetCameraZ, reduced.matches ? 1 : 1 - (1 - ZOOM_SMOOTHING) ** frames);
  camera.position.copy(view).normalize().multiplyScalar(zoom * Math.max(1, .85 / camera.aspect));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  if (!state.dragging && !reduced.matches) {
    rotateView(state.velocityY * frames, state.velocityX * frames);
    state.velocityX *= INERTIA ** frames; state.velocityY *= INERTIA ** frames;
  }
  scene.updateMatrixWorld(true);
  if (expanded) spectral?.update(dt, renderer, playbackStarted && !reduced.matches, true, true);
  lines.update(renderer, expanded ? spectral?.scan : undefined, true);
  renderer.render(scene, camera);
  const interacting = Math.abs(state.velocityX) + Math.abs(state.velocityY) > .0001 || Math.abs(zoom - state.targetCameraZ) > .001;
  if (!reduced.matches && (playbackStarted || interacting)) wake();
  else last = null;
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
function setExpanded(value) {
  expanded = value;
  // Build particles only on first expansion; reuse them on subsequent visits.
  if (value && !spectral) {
    spectral = createSpectral(meshes);
    Object.assign(spectral.options, curiositySettings.spectral);
    spectral.rebuild();
  }
  spectral?.setEnabled(value);
  controls.reset();
  document.documentElement.classList.toggle('about-model-expanded', value);
  text.forEach(element => { element.inert = value; });
  button.setAttribute('aria-expanded', String(value));
  button.setAttribute('aria-label', value ? 'Close rover view' : 'Explore Curiosity rover');
  wake();
}
function release() {
  if (disposed) return;
  if (expanded) setExpanded(false);
  disposed = true;
  cancelAnimationFrame(frame); clearTimeout(startTimer); reveal?.cancel();
  events.abort(); observer?.disconnect(); controls?.reset();
  mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
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
      isEnabled: () => expanded, redraw: wake });
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
    lines = createModelLines(meshes, scene);
    Object.assign(lines.options, curiositySettings.line); lines.setEnabled(true);
    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopPingPong, Infinity).play();
    observer = new ResizeObserver(resize); observer.observe(host);
    mixer.update(0);
    resize();
    host.classList.add('is-ready');
    reveal = host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced.matches ? 0 : 500, easing: 'ease' });
    await reveal.finished;
    if (disposed) return;
    button.hidden = false;
    playbackStarted = true; last = null; wake();
  } catch (error) {
    if (disposed) return;
    console.error('Could not load the About rover:', error);
    release();
  }
}
button.addEventListener('click', () => setExpanded(!expanded), { signal: events.signal });
// Keep the page's footer/overscroll gestures out of the expanded viewer.
for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
  host.addEventListener(type, event => { if (expanded) event.stopPropagation(); }, { passive: true, signal: events.signal });
}
document.addEventListener('keydown', event => {
  if (!expanded) return;
  if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); }

}, { signal: events.signal });
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = 0; last = null; wake();
}, { signal: events.signal });
reduced.addEventListener('change', () => { last = null; wake(); }, { signal: events.signal });
addEventListener('pagehide', event => { if (!event.persisted) release(); }, { signal: events.signal });
addEventListener('pageshow', () => { last = null; wake(); }, { signal: events.signal });
// Give the loaded page 200 ms before preparing the rover.
const pageLoaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(resolve => addEventListener('load', resolve, { once: true }));
pageLoaded.then(() => { if (!disposed) startTimer = setTimeout(start, 200); });
