// Shared point-cloud preparation: the worker uses it for site models, and
// ply-points.js for geometry Spatial Lab has already loaded. Typed arrays only.

// Center on the bounding box and fit the longest side to 3.5 units, in place.
export function normalizePositions(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  const extent = Math.max(...max.map((value, axis) => value - min[axis]));
  if (!(extent > 0) || !Number.isFinite(extent)) throw new Error('PLY has invalid bounds');
  const scale = 3.5 / extent;
  const center = min.map((value, axis) => (value + max[axis]) / 2);
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      // Match the two Float32 writes made by Three's center(), then scale().
      positions[i + axis] = Math.fround(positions[i + axis] - center[axis]) * scale;
    }
    radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
  }
  return { scale, radius };
}

// Select unique existing vertices once, rather than hiding them in the shader.
export function sampleVisible(count, fraction = 1) {
  fraction = Math.max(0, Math.min(1, fraction));
  if (fraction === 1) return null;
  const visible = Math.floor(count * fraction);
  const pool = Uint32Array.from({ length: count }, (_, i) => i);
  for (let i = 0; i < visible; i++) {
    const j = i + Math.floor(Math.random() * (count - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, visible);
}

// Per vertex: phase, speed, tone, and whether it twinkles at all.
export function twinkleSeeds(count, chance = .4) {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = Math.random() * Math.PI * 2;
    seeds[i * 4 + 1] = 1.8 + Math.random() * 2.4;
    seeds[i * 4 + 2] = .65 + Math.random() * .65;
    seeds[i * 4 + 3] = Math.random() < chance ? 1 : 0;
  }
  return seeds;
}
