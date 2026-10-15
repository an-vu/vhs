import * as THREE from "three";
import { loadPreparedPoints } from "./point-loader.js";
import { createPointMaterial } from "./point-material.js";

export async function createPLYPointCloud(group, renderer, model, sourceGeometry, prepareDissolve = false) {
  const diagnostic = window.StudioDiagnostics;
  const geometry = sourceGeometry ?? await loadPreparedPoints(model, prepareDissolve);
  const settings = model.settings;
  if (sourceGeometry) {
    const prepared = diagnostic?.start('Geometry bounds, centering and scaling');
    const position = geometry.getAttribute("position");
    if (!position?.count) { geometry.dispose(); throw new Error("PLY has no vertices."); }
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!(extent > 0) || !Number.isFinite(extent)) {
      geometry.dispose(); throw new Error("PLY has invalid bounds.");
    }
    // Preserve source positions; center and scale uniformly for the shared framing.
    const scale = 3.5 / extent;
    geometry.userData.pointScale = scale;
    geometry.center();
    geometry.scale(scale, scale, scale);
    prepared?.();
    const sampled = diagnostic?.start('Select visible vertices');
    const fraction = THREE.MathUtils.clamp(settings.VISIBLE_FRACTION ?? 1, 0, 1);
    if (fraction < 1) {
      // Select unique existing vertices once, rather than hiding them in the shader.
      const count = Math.floor(position.count * fraction);
      const indices = Uint32Array.from({ length: position.count }, (_, i) => i);
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(Math.random() * (position.count - i));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      geometry.setIndex(new THREE.BufferAttribute(indices.slice(0, count), 1));
    }
    sampled?.();
    const seeded = diagnostic?.start('Generate twinkle seeds');
    const seeds = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      seeds[i * 4] = Math.random() * Math.PI * 2;
      seeds[i * 4 + 1] = 1.8 + Math.random() * 2.4;
      seeds[i * 4 + 2] = .65 + Math.random() * .65;
      seeds[i * 4 + 3] = Math.random() < (settings.TWINKLE_CHANCE ?? .4) ? 1 : 0;
    }
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
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
  material.uniforms.uTwinkleMaxSize = { value: settings.TWINKLE_MAX_SIZE ?? 2.6 };
  return material;
}
