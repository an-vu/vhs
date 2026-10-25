import * as THREE from "three";
import { loadPreparedPoints } from "./point-loader.js";
import { createPointMaterial } from "./point-material.js";
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
    uniform float uTime;
    uniform float uPointSize;
    uniform float uScale;
    uniform float uTwinkleSpeed;
    uniform float uTwinkleMaxSize;
    uniform float uOpacity;
    varying float vTone;
    varying float vAlpha;
    void main() {
      vDissolveColor = aDissolveColor;
      vDissolveStyle = vec2(aDissolveSoftCore, step(0.00001, aDissolve.w));
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      float pulse = pow(0.5 + 0.5 * sin(uTime * uTwinkleSpeed * aSeed.y + aSeed.x), 3.0);
      // A quiet interval at zero opacity, followed by a soft independent pulse.
      vAlpha = mix(1.0, smoothstep(0.15, 0.75, pulse), aSeed.w);
      vTone = aSeed.z * mix(1.0, mix(0.28, 1.08, pulse), aSeed.w);
      float baseSize = max(1.0, uPointSize * uScale / max(-view.z, 0.05));
      float twinkleSize = mix(1.0, mix(0.25, uTwinkleMaxSize, pulse), aSeed.w);
      gl_PointSize = clamp(baseSize * twinkleSize, 1.0, 10.0);
      // Subpixel sizes may be clamped by the GPU; fade their coverage as well.
      vAlpha *= min(1.0, baseSize * twinkleSize);
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
  material.uniforms.uPixelRatio = { value: renderer.getPixelRatio() };
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
