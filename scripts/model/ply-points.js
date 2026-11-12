import * as THREE from "three";
import { loadPreparedPoints } from "./point-loader.js";
import { createPointMaterial } from "./point-material.js";
import { BLEED_SHARE, BLEED_CYCLE, BLEED_RECOVER, BLEED_DELAY } from "./config.js";
import { normalizePositions, sampleVisible, twinkleSeeds } from "./point-prep.js";

export async function createPLYPointCloud(group, renderer, model, sourceGeometry, prepareDissolve = false) {
  const diagnostic = window.StudioDiagnostics;
  const geometry = sourceGeometry ?? await loadPreparedPoints(model, prepareDissolve);
  const settings = model.settings;
  if (sourceGeometry) {
    // Spatial Lab already loaded this geometry; prepare it as the worker does.
    const prepared = diagnostic?.start('Geometry bounds, centering and scaling');
    const position = geometry.getAttribute("position");
    if (!position?.count) { geometry.dispose(); throw new Error("PLY has no vertices."); }
    let normalized;
    try { normalized = normalizePositions(position.array); }
    catch (error) { geometry.dispose(); throw error; }
    position.needsUpdate = true;
    geometry.boundingBox = null;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), normalized.radius);
    geometry.userData.pointScale = normalized.scale;
    prepared?.();
    const sampled = diagnostic?.start('Select visible vertices');
    const indices = sampleVisible(position.count, settings.VISIBLE_FRACTION ?? 1);
    if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    sampled?.();
    const seeded = diagnostic?.start('Generate twinkle seeds');
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(twinkleSeeds(position.count, settings.TWINKLE_CHANCE), 4));
    seeded?.();
  }
  const position = geometry.getAttribute('position');
  const scale = geometry.userData.pointScale;
  diagnostic?.note('Vertices', { source: position.count, drawn: geometry.index?.count ?? position.count });
  const material = createTwinkleMaterial(renderer, {
    ...settings, POINT_SIZE: (settings.POINT_SIZE ?? .002) * scale
  });
  const points = new THREE.Points(geometry, material);
  material.userData.geometry = geometry;
  points.rotation.x = settings.MODEL_X_ROTATION ?? 0;
  group.add(points);
  return material;
}

// How many ages of the model's turn the shader gets for the bleed (scene.js).
export const BLEED_STEPS = 12;

// Shared by homepage PLY models and mesh-vertex previews.
export function createTwinkleMaterial(renderer, settings) {
  const material = createPointMaterial(renderer, settings, `
    attribute vec4 aSeed;
    attribute vec4 aDissolve;
    attribute vec3 aDissolveColor;
    attribute float aDissolveSoftCore;
    varying vec3 vDissolveColor;
    varying vec2 vDissolveStyle;
    uniform float uFormation;
    uniform float uPixelRatio;
    // Drawn at a lower pixel ratio than full sharpness (DOTS_PIXEL_RATIO), a dot too
    // small for one pixel is still drawn one pixel big, and that pixel covers more
    // of the screen, so the cloud would read darker. uCoverage is the ratio
    // drawn at over full sharpness's (1.5 / 2 on a Retina screen; 1 elsewhere or at
    // full sharpness); a dot's strength makes its coverage what it would be there.
    uniform float uCoverage;
    uniform float uTime;
    uniform float uPointSize;
    uniform float uScale;
    uniform float uTwinkleSpeed;
    uniform float uTwinkleMaxSize;
    uniform float uOpacity;
    // The bleed (scene.js): the model's turn from now back to BLEED_DELAY ago, in
    // BLEED_STEPS steps, and how far it has faded in (uBleedAmount).
    const int BLEED_STEPS = ${BLEED_STEPS};
    uniform vec4 uBleed[BLEED_STEPS];
    uniform float uBleedAmount, uBleedShare, uBleedDelay;
    uniform vec2 uBleedRecover, uBleedCycle;
    varying float vTone;
    varying float vAlpha;
    vec3 turnBy(vec4 q, vec3 v) {
      vec3 t = 2.0 * cross(q.xyz, v);
      return v + q.w * t + cross(q.xyz, t);
    }
    void main() {
      vDissolveColor = aDissolveColor;
      vDissolveStyle = vec2(aDissolveSoftCore, step(0.00001, aDissolve.w));
      // The bleed: the model dissolving here and there without ever dissolving.
      // Each dot keeps its own clock (a
      // cycle of its own length, from its own start); on some cycles it's left
      // behind, frozen where it was or crawling at part speed, fades away as the model
      // turns on, then twinkles back in where it belongs, a little bigger for a moment.
      // No two dots in step, no shape to the pattern.
      float lag = 0.0, bleedFade = 1.0, bleedPop = 1.0;
      if (uBleedAmount > 0.0) {
        float cycle = mix(uBleedCycle.x, uBleedCycle.y, fract(aSeed.x * 1.37 + aSeed.z));
        float turns = uTime / cycle + fract(aSeed.x * .159 + aSeed.y * .37);
        float since = fract(turns) * cycle;
        float pick = fract(sin(dot(vec2(aSeed.x, floor(turns)), vec2(12.9898, 78.233))) * 43758.5453);
        if (pick < uBleedShare) {
          float u = pick / uBleedShare;
          float fadeOut = mix(uBleedRecover.x, uBleedRecover.y, fract(u * 7.31 + aSeed.y));
          if (since < fadeOut) {
            // Left behind: its age grows with the time since the beam, 40% to 100% as fast.
            float age = since * mix(.4, 1.0, fract(u * 3.17));
            lag = uBleedAmount * min(age / uBleedDelay, 1.0) * float(BLEED_STEPS - 1);
            bleedFade = 1.0 - uBleedAmount * since / fadeOut;
          } else {
            float back = min(1.0, (since - fadeOut) / .5);
            bleedFade = mix(1.0, back, uBleedAmount);
            bleedPop = 1.0 + uBleedAmount * .9 * sin(3.14159 * back);
          }
        }
      }
      float step0 = floor(lag);
      vec4 turnA = uBleed[int(step0)];
      vec4 turnB = uBleed[int(min(step0 + 1.0, float(BLEED_STEPS - 1)))];
      if (dot(turnA, turnB) < 0.0) turnB = -turnB;
      vec3 placed = turnBy(normalize(mix(turnA, turnB, lag - step0)), position);
      vec4 view = modelViewMatrix * vec4(placed, 1.0);
      float pulse = pow(0.5 + 0.5 * sin(uTime * uTwinkleSpeed * aSeed.y + aSeed.x), 3.0);
      // A quiet interval at zero opacity, followed by a soft independent pulse.
      vAlpha = mix(1.0, smoothstep(0.15, 0.75, pulse), aSeed.w);
      vAlpha *= bleedFade;
      vTone = aSeed.z * mix(1.0, mix(0.28, 1.08, pulse), aSeed.w);
      float trueSize = uPointSize * uScale / max(-view.z, 0.05);
      float baseSize = max(1.0, trueSize);
      float twinkleSize = mix(1.0, mix(0.25, uTwinkleMaxSize, pulse), aSeed.w) * bleedPop;
      gl_PointSize = clamp(baseSize * twinkleSize, 1.0, 10.0);
      // Subpixel sizes may be clamped by the GPU; fade their coverage as well.
      vAlpha *= min(1.0, baseSize * twinkleSize);
      float cover = max(trueSize, uCoverage) / baseSize;
      vAlpha *= cover * cover;
      // Apply model opacity only to the model endpoint. Source bubbles already
      // carry their final canvas opacity, including fully opaque dots.
      vAlpha *= uOpacity;
      gl_Position = projectionMatrix * view;
      if (uFormation < 1.0) {
        vec2 origin = aDissolve.xy;
        float arrival = smoothstep(aSeed.z * 0.25, 1.0, uFormation);
        // Begin with every bubble in front of the close camera. Blend in
        // homogeneous clip space, avoiding division by zero or negative W
        // for model vertices behind the camera during the pullback.
        gl_Position = mix(vec4(origin, 0.0, 1.0), gl_Position, uFormation);
        vAlpha = mix(aDissolve.w, vAlpha, aDissolve.w > 0.0 ? uFormation : arrival);
        gl_PointSize = mix(aDissolve.z * uPixelRatio, gl_PointSize, uFormation);
        vTone *= uFormation;
      }
      // Fully transparent points still cost raster work unless clipped out.
      if (vAlpha == 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  `);
  material.uniforms.uTwinkleSpeed = { value: settings.TWINKLE_SPEED ?? 1 };
  material.uniforms.uTwinkleMaxSize = { value: settings.TWINKLE_MAX_SIZE ?? 2.6 };
  material.uniforms.uFormation = { value: 1 };
  // No bleed until a scene fills it in (scene.js): every step is "now".
  material.uniforms.uBleed = { value: Array.from({ length: BLEED_STEPS }, () => new THREE.Vector4(0, 0, 0, 1)) };
  material.uniforms.uBleedAmount = { value: 0 };
  material.uniforms.uBleedShare = { value: settings.BLEED_SHARE ?? BLEED_SHARE };
  material.uniforms.uBleedCycle = { value: new THREE.Vector2(...(settings.BLEED_CYCLE ?? BLEED_CYCLE)) };
  material.uniforms.uBleedDelay = { value: settings.BLEED_DELAY ?? BLEED_DELAY };
  material.uniforms.uBleedRecover = { value: new THREE.Vector2(...(settings.BLEED_RECOVER ?? BLEED_RECOVER)) };
  material.uniforms.uPixelRatio = { value: renderer.getPixelRatio() };
  material.uniforms.uCoverage = { value: 1 };
  material.defaultAttributeValues.aDissolve = [0, 0, 0, 0];
  material.defaultAttributeValues.aDissolveColor = [0, 0, 0];
  material.defaultAttributeValues.aDissolveSoftCore = [1];
  material.fragmentShader = 'uniform float uFormation; varying vec3 vDissolveColor; varying vec2 vDissolveStyle;\n' +
    material.fragmentShader.replace('float textAlpha = 1.0;',
      `// Match Canvas2D: crisp circles or a linear radial alpha falloff.
      float radius = distanceFromCenter * 2.0;
      float aa = max(fwidth(radius), 0.0001);
      float sourceEdge = vDissolveStyle.x >= 1.0
        ? 1.0 - smoothstep(1.0 - aa, 1.0, radius)
        : 1.0 - clamp((radius - vDissolveStyle.x) / (1.0 - vDissolveStyle.x), 0.0, 1.0);
      edge = mix(edge, sourceEdge, (1.0 - uFormation) * vDissolveStyle.y);
      finalColor = mix(vDissolveColor, finalColor, uFormation);
      float textAlpha = 1.0;`)
      .replace('uOpacity *', '');
  return material;
}
