// The shipped point clouds are vertex-only binary XYZ PLYs. Keep their decoding
// and all O(vertex-count) preparation off the animation thread.
self.onmessage = async ({ data: { path, settings, prepareDissolve = false } }) => {
  const timings = [];
  const measure = (name, fn) => {
    const start = performance.now();
    const result = fn();
    timings.push({ name, ms: performance.now() - start });
    return result;
  };
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`PLY request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    const positions = measure('Worker PLY decode', () => {
      const header = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096)));
      const end = /end_header\r?\n/.exec(header);
      if (!end) throw new Error('Unsupported PLY header');
      const lines = header.slice(0, end.index).trim().split(/\r?\n/).filter(line => !line.startsWith('comment '));
      const count = Number(/^element vertex (\d+)$/.exec(lines[2])?.[1]);
      if (lines[0] !== 'ply' || lines[1] !== 'format binary_little_endian 1.0' ||
          !Number.isSafeInteger(count) || count <= 0 || lines.slice(3).join('\n') !== 'property float x\nproperty float y\nproperty float z') {
        throw new Error('Unsupported PLY layout; expected binary XYZ vertices');
      }
      const offset = new TextEncoder().encode(header.slice(0, end.index + end[0].length)).length;
      if (bytes.byteLength - offset !== count * 12) throw new Error('Invalid PLY vertex payload');
      const view = new DataView(bytes, offset);
      const result = new Float32Array(count * 3);
      for (let i = 0; i < result.length; i++) {
        result[i] = view.getFloat32(i * 4, true);
        if (!Number.isFinite(result[i])) throw new Error('Non-finite PLY position');
      }
      return result;
    });
    const count = positions.length / 3;
    let scale, radius = 0;
    measure('Worker geometry preparation', () => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i++) {
        const axis = i % 3;
        min[axis] = Math.min(min[axis], positions[i]);
        max[axis] = Math.max(max[axis], positions[i]);
      }
      const extent = Math.max(...max.map((value, axis) => value - min[axis]));
      if (!(extent > 0)) throw new Error('PLY has invalid bounds');
      scale = 3.5 / extent;
      const center = min.map((value, axis) => (value + max[axis]) / 2);
      for (let i = 0; i < positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          // Match the two Float32 writes made by Three's center(), then scale().
          positions[i + axis] = Math.fround(positions[i + axis] - center[axis]) * scale;
        }
        radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
      }
    });
    const indices = measure('Worker select visible vertices', () => {
      const fraction = Math.max(0, Math.min(1, settings.VISIBLE_FRACTION ?? 1));
      if (fraction === 1) return null;
      const visible = Math.floor(count * fraction);
      const pool = Uint32Array.from({ length: count }, (_, i) => i);
      for (let i = 0; i < visible; i++) {
        const j = i + Math.floor(Math.random() * (count - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, visible);
    });
    const seeds = measure('Worker generate twinkle seeds', () => {
      const result = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        result[i * 4] = Math.random() * Math.PI * 2;
        result[i * 4 + 1] = 1.8 + Math.random() * 2.4;
        result[i * 4 + 2] = .65 + Math.random() * .65;
        result[i * 4 + 3] = Math.random() < (settings.TWINKLE_CHANCE ?? .4) ? 1 : 0;
      }
      return result;
    });
    const dissolve = prepareDissolve ? measure('Worker prepare dissolve attributes', () => {
      const values = new Float32Array(count * 4);
      const colors = new Float32Array(count * 3);
      const softCores = new Float32Array(count);
      const visible = indices?.length ?? count;
      for (let i = 0; i < visible; i++) {
        const offset = (indices ? indices[i] : i) * 4;
        values[offset] = Math.random() * 2 - 1;
        values[offset + 1] = Math.random() * 2 - 1;
        values[offset + 2] = 1;
      }
      return { values, colors, softCores };
    }) : null;
    self.postMessage({ positions, indices, seeds, scale, radius, timings, dissolve },
      [positions.buffer, seeds.buffer, ...(indices ? [indices.buffer] : []),
        ...(dissolve ? Object.values(dissolve).map(array => array.buffer) : [])]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
