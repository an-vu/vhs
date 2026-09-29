import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { createPointMaterial } from "./point-material.js";

export async function createPLYPointCloud(group, renderer, model) {
  const geometry = await new PLYLoader().loadAsync(model.path);
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
  geometry.center();
  geometry.scale(scale, scale, scale);
  const settings = model.settings;
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
  const seeds = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    seeds[i * 4] = Math.random() * Math.PI * 2;
    seeds[i * 4 + 1] = 1.8 + Math.random() * 2.4;
    seeds[i * 4 + 2] = .65 + Math.random() * .65;
    seeds[i * 4 + 3] = Math.random() < (settings.TWINKLE_CHANCE ?? .4) ? 1 : 0;
  }
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const material = createPointMaterial(renderer, {
    ...settings, POINT_SIZE: (settings.POINT_SIZE ?? .002) * scale
  }, `
    attribute vec4 aSeed;
    uniform float uTime;
    uniform float uPointSize;
    uniform float uScale;
    uniform float uTwinkleSpeed;
    uniform float uTwinkleMaxSize;
    varying float vTone;
    varying float vAlpha;
    void main() {
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
      gl_Position = projectionMatrix * view;
      // Fully transparent points still cost raster work unless clipped out.
      if (vAlpha == 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  `);
  material.uniforms.uTwinkleSpeed = { value: settings.TWINKLE_SPEED ?? 1 };
  material.uniforms.uTwinkleMaxSize = { value: settings.TWINKLE_MAX_SIZE ?? 2.6 };
  const points = new THREE.Points(geometry, material);
  points.rotation.x = settings.MODEL_X_ROTATION ?? 0;
  group.add(points);
  return material;
}
