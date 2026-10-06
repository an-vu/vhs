import { watchPaletteUniforms } from './model-palette.js';
import { runIdleSteps } from '../../shared/idle-work.js';
import { scanBandGLSL, scanUniforms } from './model-scan-band.js';
import * as THREE from 'three';

export const spectralDefaults = { density: 100000, size: 1.6, variation: .35, spread: .012, twinkle: .35, twinkleSpeed: 1.4, drift: .003, driftSpeed: .45, intensity: 1, opacity: .85, palette: 0, scanEnabled: 1, scanSpeed: .18, scanWidth: .2, scanStrength: .85, edgeAttraction: .6, edgeReach: .025, lineResponse: 1, edgeDensity: .35, scanPalette: 0, scanVisibility: 0, scanHalo: .6, scanUneven: 0, scanVolume: 0 };

export const spectralPalettes = ['Spectrum', 'Aurora', 'Ember', 'Ultraviolet', 'Glacier', 'vHuman'];

// Triangle areas are measured in the displayed pose; samples remain component-local.
export function createSpectral(meshes, { deferPreparation = false, scanRoot = null } = {}) {
  const options = { ...spectralDefaults }, clouds = [], surfaces = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const wa = new THREE.Vector3(), wb = new THREE.Vector3(), wc = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const edge = new THREE.Line3(), candidate = new THREE.Vector3(), closest = new THREE.Vector3();
  let totalArea = 0, time = 0, scanTime = 0, visible = false;
  const scanBounds = new THREE.Box3(), partBounds = new THREE.Box3(), viewport = new THREE.Vector2();
  const meshToScan = new THREE.Matrix4();
  let prepared = false, generation = 0;
  function* prepareSurfaces() {
    surfaces.length = 0; totalArea = 0;
    for (const mesh of meshes) {
      // This preview supports rigid component animation, as used by the baked rover.
      if (mesh.isSkinnedMesh || mesh.geometry.morphAttributes.position?.length) continue;
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
      const sampleMatrix = mesh.matrixWorld.clone();
      const count = Math.floor((index?.count ?? position.count) / 3), cumulative = new Float64Array(count);
      let area = 0;
      for (let i = 0; i < count; i++) {
        const vertex = j => index ? index.getX(i * 3 + j) : i * 3 + j;
        wa.fromBufferAttribute(position, vertex(0)).applyMatrix4(sampleMatrix);
        wb.fromBufferAttribute(position, vertex(1)).applyMatrix4(sampleMatrix);
        wc.fromBufferAttribute(position, vertex(2)).applyMatrix4(sampleMatrix);
        area += ab.subVectors(wb, wa).cross(ac.subVectors(wc, wa)).length() * .5;
        cumulative[i] = area;
        if (i % 256 === 255) yield;
      }
      if (area > 0) { geometry.computeBoundingBox(); surfaces.push({ mesh, position, index, cumulative, area }); totalArea += area; }
      yield;
    }
    prepared = true;
  }
  if (!deferPreparation) for (const step of prepareSurfaces()) { /* synchronous Lab path */ }
  const uniforms = { time: { value: 0 }, population: { value: 1 }, pixelRatio: { value: 1 }, viewportScale: { value: 1 }, ...scanUniforms() };
  for (const key of ['size', 'variation', 'spread', 'twinkle', 'twinkleSpeed', 'drift', 'driftSpeed', 'intensity', 'opacity', 'palette', 'edgeAttraction', 'edgeReach', 'scanEnabled', 'scanVisibility', 'scanHalo']) uniforms[key] = { value: options[key] };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms,
    vertexShader: `attribute vec4 seed; attribute vec3 surfaceNormal, edgeTarget; attribute float edgePoint;
    uniform float time,pixelRatio,viewportScale,size,variation,spread,twinkle,twinkleSpeed,drift,driftSpeed,intensity;
    uniform int palette,scanVisibility;
    uniform float scanEnabled,scanHalo,population;
    uniform float edgeAttraction,edgeReach;
    ${scanBandGLSL}
    varying vec3 tint; varying float alpha;
    vec3 spectrum(float t){return clamp(abs(mod(vec3(0.,4.,2.)+(1.-t)*4.,6.)-3.)-1.,0.,1.);}
    vec3 paletteColor(float t){
      if(palette==0)return spectrum(t);
      // Distinct anchors keep mixed particle colors vivid rather than muddy.
      float band=floor(t*5.);
      if(palette==1){
        if(band<1.)return vec3(.02,.08,.8);if(band<2.)return vec3(0.,.65,1.);if(band<3.)return vec3(0.,.8,.25);if(band<4.)return vec3(.45,.05,.9);return vec3(.85,.02,.45);
      }
      if(palette==2){
        if(band<1.)return vec3(.3,.005,.04);if(band<2.)return vec3(.8,.02,.01);if(band<3.)return vec3(1.,.15,.01);if(band<4.)return vec3(1.,.45,.015);return vec3(.9,.7,.04);
      }
      if(palette==3){
        if(band<1.)return vec3(.08,.01,.45);if(band<2.)return vec3(.25,.025,.9);if(band<3.)return vec3(.65,.02,.9);if(band<4.)return vec3(.95,.03,.45);return vec3(0.,.55,.8);
      }
      if(band<1.)return vec3(.015,.045,.18);if(band<2.)return vec3(.02,.15,.55);if(band<3.)return vec3(0.,.4,.7);if(band<4.)return vec3(.02,.65,.7);return vec3(.25,.65,.8);
    }
    void main(){
      // Membership follows the original surface, not the drifting point.
      float sourceY=scanCoordinate((modelMatrix*vec4(position,1.)).xyz);
      float envelope=scanEnvelope(sourceY);
      float settled=scanVisibility==0?0.:scanEnabled*smoothstep(.15,.9,envelope);
      float movement=1.-settled;
      float visibility=1.;
      if(scanVisibility!=0){
        float outside=abs(scanHeight-sourceY)-scanWidth*.4;
        float halo=1.-smoothstep(0.,max(.0001,scanWidth*scanHalo),max(0.,outside));
        visibility=scanEnabled*(scanVisibility==1?envelope:halo);
      }
      vec4 p=modelViewMatrix*vec4(position,1.);
      vec3 n=normalize(normalMatrix*surfaceNormal);
      // Most points stay close; a smaller halo occupies the outer spread.
      p.xyz+=n*spread*movement*seed.z*seed.z*seed.z*mix(1.,.2,edgePoint);
      vec3 jitter=vec3(sin(time*driftSpeed+seed.x),sin(time*driftSpeed*.83+seed.y*6.283),sin(time*driftSpeed*1.13+seed.w*6.283));
      p.xyz+=normalize(mat3(modelViewMatrix)*jitter+vec3(.00001))*drift*movement*(.35+.65*seed.z)*mix(1.,.35,edgePoint);
      // Attract only samples already close to their own triangle's edges.
      // The local target follows the same animated component as the sample.
      vec4 anchor=modelViewMatrix*vec4(edgeTarget,1.);
      float distanceToEdge=length((modelViewMatrix*vec4(position-edgeTarget,0.)).xyz);
      float nearby=1.-smoothstep(edgeReach*.3,edgeReach,distanceToEdge);
      float pull=edgeAttraction*nearby*scanBand(sourceY)*edgeInteraction;
      p.xyz=mix(p.xyz,anchor.xyz,pull);
      float pulse=.5+.5*sin(time*twinkleSpeed*(.7+seed.w*.6)+seed.x);
      float activeTwinkle=twinkle*movement;
      alpha=mix(1.,.55+.45*pulse,activeTwinkle);
      vec3 baseColor=palette==5?(seed.y<.65?mix(paletteInk,paletteGray,seed.y/.65):mix(paletteGray,palettePaper,(seed.y-.65)/.35)):studioColor(paletteColor(seed.y));
      tint=mix(paletteGray,baseColor,intensity);
      float worldY=sourceY;
      float band=scanBand(worldY);
      // Stable per-dot offsets mix neighboring colors without random flashing.
      tint=mix(tint,scanColor(worldY,(seed.y-.5)*.7),band);
      tint=mix(tint,paletteInk,edgePoint*.45);
      alpha=mix(alpha,1.,band)*visibility;
      // Stable seeds bring in progressively more dots, without rebuilding clouds.
      alpha*=smoothstep(seed.w*.85,seed.w*.85+.15,population);
      float pointSize=size*mix(1.,.5,edgePoint)*pixelRatio*(1.+variation*(seed.z*2.-1.))*mix(1.,.85+.3*pulse,activeTwinkle)*4.45/max(-p.z,.1);
      // Adapt the cap too, including settled scan-band and edge particles.
      gl_PointSize=clamp(pointSize,1.,max(1.,10.*pixelRatio*viewportScale));
      // GPUs rasterize at least one physical pixel; preserve subpixel coverage.
      alpha*=pow(min(1.,pointSize/gl_PointSize),2.);
      gl_Position=visibility>.001?projectionMatrix*p:vec4(2.,2.,2.,1.);
    }`,
    fragmentShader: `
uniform float opacity; varying vec3 tint;varying float alpha;
    void main(){float r=length(gl_PointCoord-.5);if(r>.5||alpha<=.001)discard;gl_FragColor=vec4(tint,opacity*alpha*(1.-smoothstep(.3,.5,r)));
    #include <colorspace_fragment>
    }`
  });
  function* buildClouds() {
    if (!prepared) yield* prepareSurfaces();
    for (const cloud of clouds) { cloud.removeFromParent(); cloud.geometry.dispose(); } clouds.length = 0;
    let allocated = 0, cumulativeArea = 0;
    for (const surface of surfaces) {
      cumulativeArea += surface.area;
      const next = Math.round(options.density * cumulativeArea / totalArea), count = next - allocated; allocated = next;
      if (!count) continue;
      const targets = new Float32Array(count * 3), edgeFlags = new Float32Array(count);
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
      const { position, index, cumulative, mesh } = surface;
      for (let i = 0; i < count; i++) {
        const target = Math.random() * surface.area; let lo = 0, hi = cumulative.length - 1;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid] > target) hi = mid; else lo = mid + 1; }
        const vertex = j => index ? index.getX(lo * 3 + j) : lo * 3 + j;
        a.fromBufferAttribute(position, vertex(0)); b.fromBufferAttribute(position, vertex(1)); c.fromBufferAttribute(position, vertex(2));
        ab.subVectors(b, a); ac.subVectors(c, a); wa.copy(ab).cross(ac).normalize();
        const root = Math.sqrt(Math.random()), v = Math.random();
        wb.copy(a).multiplyScalar(1 - root).addScaledVector(b, root * (1 - v)).addScaledVector(c, root * v);
        if (Math.random() < options.edgeDensity) {
          // Redistribute the existing budget, rather than adding more particles.
          const lengths = [a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)];
          let pick = Math.random() * (lengths[0] + lengths[1] + lengths[2]);
          const side = pick < lengths[0] ? 0 : pick < lengths[0] + lengths[1] ? 1 : 2;
          wb.copy(side === 0 ? a : side === 1 ? b : c).lerp(side === 0 ? b : side === 1 ? c : a, Math.random());
          edgeFlags[i] = 1;
        }
        wb.toArray(positions, i * 3); wa.toArray(normals, i * 3);
        let nearest = Infinity;
        for (let side = 0; side < 3; side++) {
          edge.set(side === 0 ? a : side === 1 ? b : c, side === 0 ? b : side === 1 ? c : a);
          edge.closestPointToPoint(wb, true, candidate);
          const distance = wb.distanceToSquared(candidate);
          if (distance < nearest) { nearest = distance; closest.copy(candidate); }
        }
        closest.toArray(targets, i * 3);
        seeds.set([Math.random() * Math.PI * 2, Math.random(), Math.random(), Math.random()], i * 4);
        if (i % 256 === 255) yield;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('edgePoint', new THREE.BufferAttribute(edgeFlags, 1)); geometry.setAttribute('edgeTarget', new THREE.BufferAttribute(targets, 3)); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('surfaceNormal', new THREE.BufferAttribute(normals, 3)); geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
      const cloud = new THREE.Points(geometry, material); cloud.frustumCulled = false; cloud.visible = visible; mesh.add(cloud); clouds.push(cloud);
      yield;
    }
  }
  function rebuild() {
    generation++;
    for (const step of buildClouds()) { /* preserve synchronous Lab rebuilding */ }
  }
  async function rebuildAsync(signal, foreground = false) {
    const version = ++generation;
    return runIdleSteps(buildClouds(), () => signal?.aborted || generation !== version, foreground);
  }
  const stopPalette = watchPaletteUniforms(uniforms);
  async function precompile(renderer, camera) {
    if (!clouds.length) return;
    const warmup = new THREE.Scene();
    // Same material/attributes as the live clouds, without exposing them on the page.
    warmup.add(new THREE.Points(clouds[0].geometry, material));
    await renderer.compileAsync(warmup, camera);
  }
  return {
    options, rebuildAsync, precompile,
    setEnabled(value) { if (visible === value) return; visible = value; if (!value) { uniforms.scanStrength.value = 0; uniforms.edgeInteraction.value = 0; uniforms.lineResponse.value = 0; } clouds.forEach(c => c.visible = value); },
    rebuild,
    update(dt, renderer, animate, interact = false, matricesCurrent = false, pointScale = 1, population = 1, scanRate = 1) {
      if (!visible) return;
      uniforms.population.value = population;
      if (animate) { time += dt; scanTime += dt * options.scanSpeed * scanRate; }
      uniforms.time.value = time; uniforms.scanTime.value = scanTime * 10.; uniforms.pixelRatio.value = renderer.getPixelRatio();
      for (const key of Object.keys(options)) if (uniforms[key]) uniforms[key].value = options[key];
      renderer.getSize(viewport);
      // The shorter viewport dimension also handles tall mobile About canvases.
      // Desktop framing stays unchanged when height is the limiting dimension.
      const viewportScale = Math.max(1, Math.min(viewport.x, viewport.y)) / 600 * pointScale;
      uniforms.viewportScale.value = viewportScale;
      uniforms.size.value = options.size * viewportScale;
      // Scene-space distances retain the same relation to the model on every screen.
      uniforms.spread.value = options.spread;
      uniforms.drift.value = options.drift;
      uniforms.edgeReach.value = options.edgeReach;
      uniforms.edgeInteraction.value = interact ? 1 : 0;
      uniforms.lineResponse.value = options.lineResponse;
      uniforms.scanStrength.value = options.scanEnabled ? options.scanStrength : 0;
      if (options.scanEnabled) {
        if (scanRoot) {
          if (!matricesCurrent) scanRoot.updateWorldMatrix(true, false);
          uniforms.worldToScan.value.copy(scanRoot.matrixWorld).invert();
        } else uniforms.worldToScan.value.identity();
        scanBounds.makeEmpty();
        for (const { mesh } of surfaces) {
          if (!matricesCurrent) mesh.updateWorldMatrix(true, false);
          meshToScan.multiplyMatrices(uniforms.worldToScan.value, mesh.matrixWorld);
          partBounds.copy(mesh.geometry.boundingBox).applyMatrix4(meshToScan);
          scanBounds.union(partBounds);
        }
        if (!scanBounds.isEmpty()) {
          const height = Math.max(.001, scanBounds.max.y - scanBounds.min.y), width = Math.max(.001, height * options.scanWidth);
          const phase = scanTime * Math.PI * 2;
          const inset = Math.min(width * .5, height * .45), velocity = Math.sin(phase);
          uniforms.scanHeight.value = THREE.MathUtils.lerp(scanBounds.min.y + inset, scanBounds.max.y - inset, .5 - .5 * Math.cos(phase));
          uniforms.scanDirection.value = velocity / Math.sqrt(velocity * velocity + .04);
          uniforms.scanWidth.value = width;
        } else uniforms.scanStrength.value = 0;
      }
    },
    get scan() { return uniforms; },
    get upwardProgress() { return Math.min(1, scanTime * 2); },
    get count() { return clouds.reduce((n, c) => n + c.geometry.getAttribute('position').count, 0); },
    dispose() { stopPalette(); generation++; for (const c of clouds) { c.removeFromParent(); c.geometry.dispose(); } material.dispose(); }
  };
}
