import { scanPalettes } from '../model/effects/model-scan-band.js';
import { previewPresets } from './model-preview-presets.js';
import { createSpectral, spectralDefaults, spectralPalettes } from '../model/effects/model-spectral.js';
import { createModelLines, lineDefaults, linePresets } from '../model/effects/model-lines.js';
import { createModelEffects } from './model-effects.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPLYPointCloud, createTwinkleMaterial } from '../model/ply-points.js';
import { models, modelDefaults } from '../model/registry.js';
import { POINT_COLOR, POINT_DARK_COLOR } from '../model/config.js';

const host = document.querySelector('#rover');
const modelSelect = document.querySelector('#model');
const modelFolder = new URL('../../models/', import.meta.url);
const status = document.querySelector('#status');
const settings = document.querySelector('#settings');
const animationSettings = document.querySelector('#animation-settings');
const animationNote = document.querySelector('#animation-note');
const animationPlayback = document.querySelector('#animation-playback');
const emptyState = document.querySelector('#empty-state');
const clipSelect = document.querySelector('#clip');
const play = document.querySelector('#play');
const progress = document.querySelector('#progress');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const events = new AbortController();
const enabled = { rotation: true, lines: true, points: false, path: false, phase: false, scan: false, spectral: false };
let study, lineEffect, spectral;
installEffectPanels();
syncFalseColorControls();
let renderer, controls, observer, mixer, model, action, pointMaterial;
let frame = 0, last = null, elapsed = 0, visible = true, disposed = false;
let playing = false;
let twinkleSpeed = 1;
const copyButton = document.querySelector('#copy-settings');
const copyStatus = document.querySelector('#copy-status');
const copyFallback = document.querySelector('#settings-copy-fallback');
const rotationSpeed = () => THREE.MathUtils.degToRad(Number(document.querySelector('#rotation-speed').value));
let pointOnly = false, loadVersion = 0;
let preset, presetPoints, pointScale = 1, pointSettings;
const pointGeometries = [];
// Shared visual defaults; model-specific orientation stays in its own preset.
const pointDefaults = { ...models.find(item => item.id === 'rb18').settings, MODEL_X_ROTATION: 0, INITIAL_Y_ROTATION: 0, TWINKLE_MAX_SIZE: 2.6 };
const meshes = [], originals = new Set(), geometries = new Set(), materials = new Set();
const invisible = new THREE.MeshBasicMaterial({ visible: false });
const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b5af, roughness: .8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
[invisible, faceMaterial].forEach(m => materials.add(m));

function installEffectPanels() {
  const tabs = document.querySelector('.effect-tabs');
  tabs.setAttribute('aria-orientation', 'vertical');
  const groups = [
    ['path','Path'],
    ['phase','Phase'],
    ['scan','Scan']
  ];
  for (const [id,title] of groups) {
    const row=document.createElement('div');row.className='effect-tab';row.setAttribute('role','presentation');
    row.innerHTML=`<input type="checkbox" data-enable="${id}" aria-label="Enable ${title}"><button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="false" tabindex="-1">${title}</button>`;tabs.append(row);
    const panel=document.createElement('section');panel.id=`panel-${id}`;panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`tab-${id}`);
    panel.innerHTML = '';
    const slider=(key,label,min,max,step,value)=>panel.insertAdjacentHTML('beforeend',`<label for="${id}-${key}">${label} <output id="${id}-${key}-value">${value}</output></label><input id="${id}-${key}" data-study="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`);
    const toggle=(key,label,checked=true,kind='study-effect')=>panel.insertAdjacentHTML('beforeend',`<label class="checkbox-label"><input id="${id}-${key}" data-${kind}="${key}" type="checkbox" ${checked?'checked':''}>${label}</label>`);
    const choice=(key,label,items)=>panel.insertAdjacentHTML('beforeend',`<label for="${id}-${key}">${label}</label><select id="${id}-${key}" data-study="${key}">${items.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select>`);
    slider('opacity','Study opacity (shared)',.05,1,.05,.45);
    if(id!=='scan'){
      panel.insertAdjacentHTML('beforeend',`<label for="${id}-target">Animated part (shared)</label><select id="${id}-target" data-study="target"></select>`);
      slider('history','History duration (seconds, shared)',.5,6,.5,2);
    }
    if(id==='path'){
      toggle('trails','Motion paths');toggle('arcs','Pivot arcs');toggle('skeleton','Joint markers',false);toggle('labels','Angle labels',false,'study');
      slider('trailLength','Trail length (samples)',2,80,1,60);slider('fade','Trail fade',0,3,.1,1);slider('radius','Probe radius / model extent',.02,.5,.01,.18);
    }
    if(id==='phase'){
      toggle('echoes','Temporal echoes');toggle('displacement','Live displacement',false);toggle('shell','Ghost shell',false);
      slider('echoCount','Echo count',1,6,1,3);slider('spacing','Snapshot spacing (seconds)',.08,1,.01,.25);slider('falloff','Opacity retained per echo',.1,1,.05,.65);
      choice('pose','Pose visualization',[['previous','Previous poses'],['future','Future clip poses']]);slider('sensitivity','Displacement sensitivity',.5,8,.5,2);
    }
    if(id==='scan'){
      choice('scanMode','Visualization',[[0,'Section scanner'],[1,'False Color'],[2,'Depth map'],[3,'Distance from plane'],[4,'Surface normals']]);
      const before=panel.children.length;
      choice('colorMetric','Metric',[[0,'Depth'],[1,'Axis position'],[2,'Distance from plane']]);
      choice('colorPalette','Palette',[[0,'Spectrum'],[1,'Thermal'],[2,'Infrared'],[3,'Mono']]);
      choice('colorAxis','Axis',[[1,'Y'],[0,'X'],[2,'Z']]);
      choice('colorRange','Range',[[0,'Auto'],[1,'Manual']]);
      panel.insertAdjacentHTML('beforeend','<div id="color-manual" hidden><label for="scan-colorMin">Minimum (scene units)</label><input id="scan-colorMin" data-study="colorMin" type="number" step="0.1" value="0"><label for="scan-colorMax">Maximum (scene units)</label><input id="scan-colorMax" data-study="colorMax" type="number" step="0.1" value="5"><p id="color-range-error" role="status"></p></div>');
      choice('colorInvert','Invert',[[0,'Off'],[1,'On']]);
      choice('colorBands','Bands',[[0,'Smooth'],[4,'4 bands'],[8,'8 bands'],[16,'16 bands']]);
      const colorControls=document.createElement('div');colorControls.id='false-color-controls';colorControls.hidden=true;
      [...panel.children].slice(before).forEach(child=>colorControls.append(child));
      colorControls.insertAdjacentHTML('beforeend','<p>Depth measures distance along the camera view. Axis applies to position and plane-distance metrics. Thermal and Infrared are palettes, not sensor readings.</p>');panel.append(colorControls);
      toggle('sweep','Animated sweep',true,'study');slider('plane','Plane position',0,1,.01,.5);slider('scanSpeed','Sweeps per second',.05,1,.05,.25);
    }
    document.querySelector('.effect-panels').append(panel);
  }
  const row=document.createElement('div');row.className='effect-tab';row.setAttribute('role','presentation');
  row.innerHTML='<input type="checkbox" data-enable="spectral" aria-label="Enable Spectral"><button type="button" role="tab" id="tab-spectral" aria-controls="panel-spectral" aria-selected="false" tabindex="-1">Spectral</button>';tabs.append(row);
  const panel=document.createElement('section');panel.id='panel-spectral';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-spectral');
  panel.innerHTML='<p id="spectral-count"></p>';
  for(const [key,label,min,max,step] of [
    ['density','Sampled points',10000,200000,5000],['edgeDensity','Points along edges (fraction)',0,.8,.05],['size','Point size',.5,4,.1],['variation','Size variation',0,1,.05],['spread','Surface spread (scene units)',0,.12,.002],['twinkle','Twinkle strength',0,1,.05],['twinkleSpeed','Twinkle speed',0,3,.1],['drift','Drift amount (scene units)',0,.03,.001],['driftSpeed','Drift speed',0,2,.05],['intensity','Color intensity',0,1,.05],['opacity','Opacity',.05,1,.05],['scanSpeed','Scan cycles per second',0,.5,.01],['scanWidth','Scan width / model height',.02,.4,.01],['scanUneven','Scan irregularity (0 = straight)',0,1,.05],['scanHalo','Surrounding halo / band width',.1,2,.1],['scanStrength','Scan strength',0,1,.05],['edgeAttraction','Edge attraction',0,1,.05],['edgeReach','Edge attraction reach (scene units)',.005,.08,.005],['lineResponse','Line fade in scan',0,1,.05]
  ])panel.insertAdjacentHTML('beforeend',`<label for="spectral-${key}">${label}<output id="spectral-${key}-value">${spectralDefaults[key]}</output></label><input id="spectral-${key}" data-spectral="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${spectralDefaults[key]}">`);
  panel.insertAdjacentHTML('beforeend','<label><input type="checkbox" data-spectral="scanVolume"> Vary through all three dimensions</label>');
  panel.insertAdjacentHTML('beforeend',`<label for="spectral-palette">Palette</label><select id="spectral-palette" data-spectral="palette">${spectralPalettes.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select>`);
  panel.insertAdjacentHTML('beforeend',`<label for="spectral-scanPalette">Scan palette</label><select id="spectral-scanPalette" data-spectral="scanPalette">${scanPalettes.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select>`);
  panel.insertAdjacentHTML('beforeend','<label for="spectral-scanVisibility">Dot visibility</label><select id="spectral-scanVisibility" data-spectral="scanVisibility"><option value="0">Everywhere</option><option value="1">Scan band only</option><option value="2">Scan band + surrounding halo</option></select>');
  panel.insertAdjacentHTML('beforeend','<label for="spectral-scanEnabled">Shared scan band</label><select id="spectral-scanEnabled" data-spectral="scanEnabled"><option value="1">On</option><option value="0">Off</option></select>');
  document.querySelector('.effect-panels').append(panel);
}
function syncFalseColorControls() {
  document.querySelector('#false-color-controls').hidden=document.querySelector('#scan-scanMode').value!=='1';
  document.querySelector('#color-manual').hidden=document.querySelector('#scan-colorRange').value!=='1';
  document.querySelector('#scan-colorAxis').disabled=document.querySelector('#scan-colorMetric').value==='0';
  const min=Number(document.querySelector('#scan-colorMin').value),max=Number(document.querySelector('#scan-colorMax').value);
  document.querySelector('#color-range-error').textContent=max>min?'':'Maximum must be greater than minimum; the preview uses Auto until corrected.';
}
function studyValue(input) {
  return input.type==='checkbox' ? input.checked : input.dataset.study==='pose' ? input.value : Number(input.value);
}
function applyPreviewDefaults() {
  const saved=previewPresets[modelSelect.value];
  const line={...lineDefaults,...saved?.line}, dots={...spectralDefaults,...saved?.spectral};
  for(const [attribute,values] of [['line',line],['spectral',dots]])document.querySelectorAll(`[data-${attribute}]`).forEach(input=>{
    const value=values[input.dataset[attribute]];
    if(input.type==='checkbox')input.checked=value;else input.value=value;
    const output=document.getElementById(`${input.id}-value`);if(output)output.value=value;
  });
  document.querySelector('#line-preset').value=saved?'custom':'fine';
  enabled.spectral=!!saved?.spectral;
  if(saved)enabled.lines=true;
}
function readLineSettings() {
  document.querySelectorAll('[data-line]').forEach(input => {
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    if (lineEffect) lineEffect.options[input.dataset.line] = value;
    const output = document.getElementById(`${input.id}-value`); if (output) output.value = value;
  });
}
function listen(target, name, callback) { target.addEventListener(name, callback, { signal: events.signal }); }
function collectSettings() {
  const read = attribute => Object.fromEntries([...document.querySelectorAll(`[data-${attribute}]`)].map(input => [
    input.dataset[attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())], input.type === 'checkbox' ? input.checked
      : ['range', 'number'].includes(input.type) ? Number(input.value) : input.value
  ]));
  const points = read('setting');
  return {
    model: modelSelect.value,
    enabled: { ...enabled },
    rotation: read('rotation'),
    points: {
      POINT_SIZE: points['points-size'], POINT_OPACITY: points['points-opacity'],
      VISIBLE_FRACTION: points.density / 100, TWINKLE_CHANCE: points.chance / 100,
      TWINKLE_SPEED: points['twinkle-speed'], TWINKLE_MAX_SIZE: points['max-size'],
      color: points['point-color'], darkColor: points['point-dark']
    },
    line: read('line'),
    studies: { options: read('study'), effects: read('study-effect') },
    spectral: read('spectral'),
    animation: {
      clip: action?.getClip().name ?? null,
      playing, speed: Number(document.querySelector('#speed').value),
      position: Number(progress.value)
    },
    units: {
      rotation: 'degrees; speed in degrees/second; X/Y are the chosen base orientation',
      pointSize: 'source-space units before model normalization',
      spectralPointSize: 'CSS pixels at a 600px shortest viewport dimension; all spectral dots and their size cap scale together',
      spectralScanWidth: 'fraction of model height',
      spectralSpreadDriftAndEdgeReach: 'scene units',
      lineWidthAndDashes: 'CSS pixels at a 600px reference viewport; scaled to viewport and model framing',
      animationPosition: 'fraction of clip duration'
    }
  };
}
async function copySettings() {
  if (!model) return;
  const text = JSON.stringify(collectSettings(), null, 2);
  copyFallback.hidden = true;
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = 'Copied';
  } catch {
    // LAN previews may not have clipboard access; keep a selectable fallback.
    copyFallback.value = text;
    copyFallback.hidden = false;
    copyFallback.focus(); copyFallback.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    if (copied) {
      copyFallback.hidden = true;
      copyButton.focus();
      copyStatus.textContent = 'Copied';
    } else copyStatus.textContent = 'Press ⌘C or Ctrl+C to copy.';
  }
}
function wake() { if (!disposed && renderer && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
function draw(now) {
  frame = 0;
  const dt = last === null ? 0 : Math.min((now - last) / 1000, .05);
  last = now;
  if (playing) mixer?.update(dt);
  if (pointMaterial && !reduced.matches) pointMaterial.uniforms.uTime.value = elapsed += dt;
  if (model && enabled.rotation && rotationSpeed() > 0 && !reduced.matches) wrapper.rotation.y += rotationSpeed() * dt;
  controls.update();
  camera.updateMatrixWorld();
  study?.update(dt, action?.time, !reduced.matches && (playing || !action), action?.getClip(), camera);
  spectral?.update(dt,renderer,!reduced.matches,!!enabled.lines && !!lineEffect?.options.triangles);
  lineEffect?.update(renderer,spectral?.scan);
  renderer.render(scene, camera);
  if (action) progress.value = action.time / Math.max(.001, action.getClip().duration);
  if (enabled.spectral && !reduced.matches || study?.scanning && (playing || !action) && !reduced.matches || playing && action || enabled.points && twinkleSpeed > 0 && !reduced.matches || model && enabled.rotation && rotationSpeed() > 0 && !reduced.matches) wake();
  else last = null;
}
function pauseClock() { cancelAnimationFrame(frame); frame = 0; last = null; }
function updatePlay() { play.textContent = playing ? 'Pause' : 'Play'; wake(); }
function resize() {
  if (!renderer) return;
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  if (pointMaterial) pointMaterial.uniforms.uScale.value = renderer.domElement.height / 2;
  wake();
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x77736c, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.5);
key.position.set(3, 5, 4); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 1);
fill.position.set(-4, 2, -3); scene.add(fill);
const wrapper = new THREE.Group();
scene.add(wrapper);

function appearance(prepare = false) {
  for (const mesh of meshes) {
    mesh.material = invisible;
    if ((prepare || enabled.points) && !mesh.userData.previewPoints) {
      const position = mesh.geometry.getAttribute('position');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position.clone());
      pointGeometry(geometry);
      geometries.add(geometry);
      const points = new THREE.Points(geometry, pointMaterial);
      mesh.add(points); mesh.userData.previewPoints = points;
    }
    if (mesh.userData.previewPoints) mesh.userData.previewPoints.visible = enabled.points;
  }
  if (enabled.lines && !lineEffect && meshes.length) {
    lineEffect = createModelLines(meshes, scene);
    readLineSettings();
  }
  lineEffect?.setEnabled(!!enabled.lines);
  if(enabled.spectral && !spectral && meshes.length){
    spectral=createSpectral(meshes);
    document.querySelectorAll('[data-spectral]').forEach(input=>spectral.options[input.dataset.spectral]=input.type==='checkbox'?Number(input.checked):Number(input.value));
    spectral.rebuild();
    document.querySelector('#spectral-count').textContent=`${spectral.count.toLocaleString()} sampled points`;
  }
  spectral?.setEnabled(!!enabled.spectral);
  if (pointOnly && model) model.visible = enabled.points;
  const groups={path:['trails','arcs','skeleton'],phase:['echoes','displacement','shell']};
  for(const [group, effects] of Object.entries(groups))for(const effect of effects)study?.set(effect,!!enabled[group] && document.querySelector(`[data-study-effect="${effect}"]`).checked);
  study?.set('scanner',!!enabled.scan);
  wake();
}
function selectClip() {
  mixer?.stopAllAction(); action = null;
  const clip = clips[Number(clipSelect.value)];
  playing = !!clip && !reduced.matches;
  animationPlayback.hidden = !clip;
  animationNote.hidden = !!clip;
  animationNote.textContent = clips.length || !model ? 'Select an animation.' : 'No animations in this model.';
  if (clip) {
    action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopPingPong, Infinity).play();
    mixer.update(0);
  }
  play.disabled = !action;
  document.querySelector('#restart').disabled = !action;
  progress.disabled = !action;
  progress.value = 0;
  study?.reset();
  appearance(); updatePlay();
}
let clips = [];
function clearModel() {
  pauseClock();
  spectral?.dispose(); spectral=null;
  document.querySelector('#spectral-count').textContent='';
  study?.dispose(); study = null;
  lineEffect?.dispose(); lineEffect = null;
  mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
  wrapper.clear();
  pointMaterial?.dispose();
  pointMaterial = preset = presetPoints = null; pointScale = 1; pointGeometries.length = 0;
  wrapper.rotation.set(0, 0, 0);
  geometries.forEach(g => g.dispose()); geometries.clear();
  const textures = new Set();
  originals.forEach(material => {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  });
  textures.forEach(texture => texture.dispose()); originals.clear(); meshes.length = 0;
  model = mixer = action = null; clips = [];
  clipSelect.replaceChildren(new Option('Select an animation…', '-1'));
  clipSelect.value = '-1';
  animationSettings.disabled = true; animationPlayback.hidden = true;
  animationNote.hidden = false; animationNote.textContent = 'Select an animation.';
  copyButton.disabled = true; copyStatus.textContent = ''; copyFallback.hidden = true;
  document.querySelector('#reset-view').disabled = true;
  document.querySelector('#view-hint').hidden = true;
  emptyState.hidden = false;
  playing = false;
  wrapper.position.set(0, 0, 0); wrapper.scale.setScalar(1);
  elapsed = 0;
}
function destroy() {
  if (disposed) return;
  disposed = true; loadVersion++; clearModel(); events.abort(); observer?.disconnect();
  resizeObserver.disconnect(); controls?.dispose();
  materials.forEach(m => m.dispose());
  renderer?.dispose(); renderer?.domElement.remove();
}
function pointGeometry(geometry) {
  const count = geometry.getAttribute('position').count;
  const seeds = new Float32Array(count * 4);
  const chances = new Float32Array(count);
  const indices = Uint32Array.from({ length: count }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    chances[i] = Math.random();
    seeds[i * 4] = Math.random() * Math.PI * 2;
    seeds[i * 4 + 1] = 1.8 + Math.random() * 2.4;
    seeds[i * 4 + 2] = .65 + Math.random() * .65;
    seeds[i * 4 + 3] = chances[i] < pointSettings.TWINKLE_CHANCE ? 1 : 0;
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  geometry.userData.twinkleChances = chances;
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, Math.floor(count * pointSettings.VISIBLE_FRACTION));
  pointGeometries.push(geometry);
  return geometry;
}
function updatePointCount() {
  const drawn = pointGeometries.reduce((sum, g) => sum + g.drawRange.count, 0);
  const total = pointGeometries.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  document.querySelector('#point-count').textContent = `${drawn.toLocaleString()} / ${total.toLocaleString()} vertices drawn`;
}
function syncPointSettings() {
  const set = (id, value) => {
    document.getElementById(id).value = value;
    const output = document.getElementById(`${id}-value`); if (output) output.value = value;
  };
  const C = pointSettings;
  twinkleSpeed = C.TWINKLE_SPEED;
  set('point-size', C.POINT_SIZE);
  set('point-opacity', C.POINT_OPACITY);
  set('twinkle-speed', twinkleSpeed);
  pointMaterial.uniforms.uColor.value = POINT_COLOR.clone();
  pointMaterial.uniforms.uDarkColor.value = POINT_DARK_COLOR.clone();
  set('point-density', C.VISIBLE_FRACTION * 100);
  set('point-chance', C.TWINKLE_CHANCE * 100);
  set('point-max', C.TWINKLE_MAX_SIZE);
  set('point-color', '#' + POINT_COLOR.getHexString());
  set('point-dark', '#' + POINT_DARK_COLOR.getHexString());
  set('point-x', Math.round(THREE.MathUtils.radToDeg(C.MODEL_X_ROTATION)));
  set('point-y', Math.round(THREE.MathUtils.radToDeg(preset ? preset.settings.INITIAL_Y_ROTATION ?? modelDefaults.INITIAL_Y_ROTATION : 0)));
  updatePointCount();
}
async function discoverModels() {
  // Python's simple HTTP server exposes a directory listing; static hosts may not.
  try {
    const response = await fetch(modelFolder, { cache: 'no-store', signal: events.signal });
    if (!response.ok) throw new Error('No directory listing');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const names = new Set();
    for (const link of doc.querySelectorAll('a[href]')) {
      const url = new URL(link.getAttribute('href'), modelFolder);
      if (url.origin !== modelFolder.origin || !url.pathname.startsWith(modelFolder.pathname)) continue;
      const name = decodeURIComponent(url.pathname.slice(modelFolder.pathname.length));
      if (!name.includes('/') && /\.(glb|gltf|ply)$/i.test(name)) names.add(name);
    }
    if (!names.size) throw new Error('No supported models in listing');
    const selected = modelSelect.value;
    modelSelect.replaceChildren(new Option('Select a model…', ''), ...[...names].sort().map(name => new Option(name, name)));
    modelSelect.value = names.has(selected) ? selected : '';
  } catch (error) {
    // Keep the bundled options when the host has no directory listing.
  }
}
async function loadModel() {
  const version = ++loadVersion;
  settings.disabled = true;
  clearModel(); renderer.render(scene, camera);
  if (!modelSelect.value) { status.textContent = ''; wake(); return; }
  status.textContent = `Loading ${modelSelect.value}…`;
  let loaded;
  try {
    const url = new URL(encodeURIComponent(modelSelect.value), modelFolder).href;
    const ply = /\.ply$/i.test(modelSelect.value);
    loaded = ply ? await new PLYLoader().loadAsync(url) : await new GLTFLoader().loadAsync(url);
    if (disposed || version !== loadVersion) {
      if (ply) loaded.dispose();
      else {
        const unused = new Set();
        loaded.scene.traverse(object => {
          object.geometry?.dispose();
          for (const material of [object.material].flat().filter(Boolean)) unused.add(material);
        });
        unused.forEach(material => { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); });
      }
      return;
    }
    preset = models.find(item => item.path === url);
    pointSettings = { ...pointDefaults, ...preset?.settings };
    pointOnly = ply && !loaded.index;
    if (ply) {
      geometries.add(loaded);
      if (preset) {
        model = new THREE.Group();
        pointMaterial = await createPLYPointCloud(model, renderer, preset, loaded);
        if (disposed || version !== loadVersion) { pointMaterial.dispose(); loaded.dispose(); return; }
        presetPoints = model.children[0]; pointScale = loaded.userData.pointScale;
        pointGeometry(loaded);
      } else model = pointOnly ? new THREE.Points(pointGeometry(loaded), invisible) : new THREE.Mesh(loaded, faceMaterial);
      if (!pointOnly) meshes.push(model);
    } else {
      model = loaded.scene;
      model.traverse(object => {
        if (!object.isMesh) return;
        meshes.push(object); geometries.add(object.geometry);
        for (const material of [object.material].flat()) originals.add(material);
      });
    }
    // Exported orientation and animated children stay untouched.
    wrapper.add(model); model.updateMatrixWorld(true);
    if (preset) {
      wrapper.rotation.order = 'YXZ';
      wrapper.rotation.y = preset.settings.INITIAL_Y_ROTATION ?? modelDefaults.INITIAL_Y_ROTATION;
      camera.fov = 40; camera.position.copy(modelDefaults.CAMERA_END);
      renderer.toneMapping = THREE.NoToneMapping;
    } else {
      const bounds = new THREE.Box3().setFromObject(model);
      const extent = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
      if (!(extent > 0 && Number.isFinite(extent))) throw new Error('Invalid model bounds');
      const scale = 3.5 / extent;
      pointScale = scale;
      wrapper.scale.setScalar(scale);
      wrapper.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
      camera.fov = 38; camera.position.set(4, 2.6, 5);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    if (!preset) {
      pointMaterial = createTwinkleMaterial(renderer, { ...pointSettings, POINT_SIZE: pointSettings.POINT_SIZE * pointScale });
      if (pointOnly) model.material = pointMaterial;
    }
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0); controls.update(); controls.saveState();
    for (const input of document.querySelectorAll('[data-enable]')) {
      input.disabled = pointOnly && !['points', 'rotation'].includes(input.dataset.enable);
      if (pointOnly && input.dataset.enable !== 'rotation') enabled[input.dataset.enable] = input.dataset.enable === 'points';
      input.checked = enabled[input.dataset.enable];
    }
    if (!pointOnly && !Object.entries(enabled).some(([name, value]) => name !== 'rotation' && value)) {
      enabled.lines = true; document.querySelector('[data-enable="lines"]').checked = true;
    }
    applyPreviewDefaults();
    document.querySelectorAll('[data-enable]').forEach(input=>input.checked=!!enabled[input.dataset.enable]);
    appearance(true);
    syncPointSettings();
    mixer = new THREE.AnimationMixer(model);
    mixer.timeScale = Number(document.querySelector('#speed').value);
    clips = ply ? [] : loaded.animations;
    clipSelect.replaceChildren(new Option('Select an animation…', '-1'));
    clips.forEach((clip, index) => clipSelect.add(new Option(`${index + 1}. ${clip.name} (${clip.duration.toFixed(1)}s)`, String(index))));
    clipSelect.value = '-1';
    animationSettings.disabled = !clips.length;
    study = meshes.length ? createModelEffects({ model, meshes, clips, scene }) : null;
    for (const id of ['path','phase','scan','spectral']) {
      const input=document.querySelector(`[data-enable="${id}"]`);
      input.disabled=!study || (id==='path' && !study.nodes.length) || (id==='spectral' && !meshes.some(mesh=>!mesh.isSkinnedMesh && !mesh.geometry.morphAttributes.position?.length));
      if(input.disabled)enabled[id]=input.checked=false;
    }
    document.querySelectorAll('[data-study="target"]').forEach(select => {
      select.replaceChildren(new Option('All animated parts', '-1'), ...(study?.nodes || []).map((node, index) => new Option(node.name || `Node ${index + 1}`, index)));
      select.value = study?.nodes.length ? '0' : '-1';
    });
    if (study) document.querySelectorAll('[data-study]').forEach(input => {
      if (input.dataset.study !== 'target') study.options[input.dataset.study] = studyValue(input);
    });
    playing = false;
    settings.disabled = false;
    emptyState.hidden = true;
    document.querySelector('#view-hint').hidden = false;
    document.querySelector('#reset-view').disabled = false;
    copyButton.disabled = false;
    document.querySelector('[role="tab"][aria-selected="true"]').click();
    if (pointOnly) document.querySelector('#tab-points').click();
    status.textContent = pointOnly
      ? `${loaded.getAttribute('position').count.toLocaleString()} source points · no faces or animation.`
      : `${meshes.length.toLocaleString()} meshes · ${meshes.reduce((total, mesh) => total + mesh.geometry.getAttribute('position').count, 0).toLocaleString()} vertices · ${meshes.reduce((total, mesh) => total + Math.floor((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3), 0).toLocaleString()} faces`;
    selectClip();
  } catch (error) {
    if (disposed || version !== loadVersion) return;
    clearModel(); renderer.render(scene, camera);
    console.error('Model preview:', error);
    status.textContent = 'Could not load this model. Try another file; check the console for details.';
  }
}
const resizeObserver = new ResizeObserver(resize);
listen(window, 'pagehide', event => { if (event.persisted) pauseClock(); else destroy(); });
listen(window, 'pageshow', wake);
listen(document, 'visibilitychange', () => { pauseClock(); wake(); });
listen(reduced, 'change', () => {
  if (reduced.matches) playing = false;
  document.querySelector('#motion-note').textContent = reduced.matches ? 'Reduced motion: automatic playback and twinkle are off. Play is available manually.' : '';
  updatePlay();
});

try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 2; controls.maxDistance = 12;
  controls.addEventListener('change', wake);
  resizeObserver.observe(host); resize();
  observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; pauseClock(); wake(); });
  observer.observe(host);
    listen(clipSelect, 'change', selectClip);
    listen(play, 'click', () => { playing = !playing; updatePlay(); });
    listen(document.querySelector('#restart'), 'click', () => { if (action) { action.time = 0; mixer.update(0); study?.reset(); wake(); } });
    listen(document.querySelector('#reset-view'), 'click', () => { controls.reset(); wake(); });
    listen(document.querySelector('#speed'), 'input', event => { mixer.timeScale = Number(event.target.value); document.querySelector('#speed-value').value = `${event.target.value}×`; });
    listen(progress, 'input', () => { if (action) { playing = false; action.time = Number(progress.value) * action.getClip().duration; mixer.update(0); study?.reset(); updatePlay(); } });
    document.querySelectorAll('[data-enable]').forEach(input => listen(input, 'change', () => {
      enabled[input.dataset.enable] = input.checked; appearance();
    }));
    listen(document.querySelector('#line-preset'), 'change', event => {
      const preset = linePresets[event.target.value]; if (!preset) return;
      const values = { ...lineDefaults, ...preset };
      document.querySelectorAll('[data-line]').forEach(input => {
        const value = values[input.dataset.line];
        if (input.type === 'checkbox') input.checked = value; else input.value = value;
      });
      readLineSettings(); wake();
    });
    document.querySelectorAll('[data-line]').forEach(input => listen(input, 'input', () => {
      document.querySelector('#line-preset').value = 'custom'; readLineSettings(); wake();
    }));
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    function selectTab(tab) {
      tabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
      });
    }
    tabs.forEach((tab, index) => {
      listen(tab, 'click', () => selectTab(tab));
      listen(tab, 'keydown', event => {
        const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
        if (!offset && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length];
        selectTab(next); next.focus();
      });
    });
    document.querySelectorAll('[data-study-effect]').forEach(input => listen(input,'change',()=>{appearance();wake();}));
    document.querySelectorAll('[data-study]').forEach(input => listen(input, 'input', () => {
      if (!study) return;
      study.options[input.dataset.study] = studyValue(input);
      syncFalseColorControls();
      document.querySelectorAll(`[data-study="${input.dataset.study}"]`).forEach(other => {
        if(other.type==='checkbox')other.checked=input.checked;else other.value = input.value;
        const output = document.getElementById(`${other.id}-value`); if (output) output.value = input.value;
      });
      if (['target', 'radius', 'pose'].includes(input.dataset.study)) study.reset();
      else study.refresh();
      wake();
    }));
    document.querySelectorAll('[data-spectral]').forEach(input=>{
      listen(input,'input',()=>{
        const output=document.getElementById(`${input.id}-value`);if(output)output.value=input.value;
        if(spectral && !['density','edgeDensity'].includes(input.dataset.spectral))spectral.options[input.dataset.spectral]=input.type==='checkbox'?Number(input.checked):Number(input.value);
        wake();
      });
      if(['density','edgeDensity'].includes(input.dataset.spectral))listen(input,'change',()=>{
        if(!spectral)return;
        spectral.options[input.dataset.spectral]=input.type==='checkbox'?Number(input.checked):Number(input.value);spectral.rebuild();
        document.querySelector('#spectral-count').textContent=`${spectral.count.toLocaleString()} sampled points`;wake();
      });
    });
    document.querySelectorAll('[data-setting]').forEach(input => listen(input, 'input', () => {
      const value = Number(input.value);
      const output = document.querySelector(`#${input.id}-value`);
      if (output) output.value = input.value;
      switch (input.dataset.setting) {
        case 'points-size': pointMaterial.uniforms.uPointSize.value = value * pointScale; break;
        case 'points-opacity': pointMaterial.uniforms.uOpacity.value = value; break;
        case 'twinkle-speed': twinkleSpeed = value; pointMaterial.uniforms.uTwinkleSpeed.value = value; break;
        case 'max-size': pointMaterial.uniforms.uTwinkleMaxSize.value = value; break;
        case 'density':
          pointSettings.VISIBLE_FRACTION = value / 100;
          pointGeometries.forEach(g => g.setDrawRange(0, Math.floor(g.getAttribute('position').count * value / 100)));
          updatePointCount(); break;
        case 'chance': {
          pointSettings.TWINKLE_CHANCE = value / 100;
          for (const geometry of pointGeometries) {
            const seeds = geometry.getAttribute('aSeed');
            const chances = geometry.userData.twinkleChances;
            for (let i = 0; i < seeds.count; i++) seeds.setW(i, chances[i] < value / 100 ? 1 : 0);
            seeds.needsUpdate = true;
          }
          break;
        }
        case 'point-color': pointMaterial.uniforms.uColor.value.set(input.value); break;
        case 'point-dark': pointMaterial.uniforms.uDarkColor.value.set(input.value); break;
      }
      wake();
    }));
    document.querySelector('#motion-note').textContent = reduced.matches ? 'Reduced motion: automatic playback and twinkle are off. Play is available manually.' : '';
    document.querySelectorAll('[data-rotation]').forEach(input => listen(input, 'input', () => {
      const value = Number(input.value);
      document.getElementById(`${input.id}-value`).value = input.value;
      if (input.dataset.rotation === 'xDegrees') (presetPoints ?? wrapper).rotation.x = THREE.MathUtils.degToRad(value);
      if (input.dataset.rotation === 'yDegrees') wrapper.rotation.y = THREE.MathUtils.degToRad(value);
      wake();
    }));
    listen(copyButton, 'click', copySettings);
    listen(document.querySelector('#reset-points'), 'click', loadModel);
    listen(modelSelect, 'change', loadModel);
    await discoverModels();
    selectClip();
    if (!disposed && modelSelect.value) await loadModel();
} catch (error) {
  console.error('Model preview:', error);
  status.textContent = 'Could not start the viewer. Open this page through your local HTTP server; check the console for details.';
  destroy();
}
