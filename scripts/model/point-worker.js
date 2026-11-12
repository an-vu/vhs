import { normalizePositions, sampleVisible, twinkleSeeds } from './point-prep.js';

// The shipped point clouds are vertex-only binary XYZ PLYs: 16-bit, each dot a
// step from the one before ("encoding delta16", dev/tools/pack-points.py, about
// 0.9 MB for a 230,000-dot model), or plain 32-bit floats (the labs' sources).
// Keep their decoding and all O(vertex-count) preparation off the animation thread.
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
      const all = header.slice(0, end.index).trim().split(/\r?\n/);
      const delta = all.some(line => line.startsWith('comment encoding delta16'));
      const lines = all.filter(line => !line.startsWith('comment '));
      const count = Number(/^element vertex (\d+)$/.exec(lines[2])?.[1]);
      const type = /^property (float|short) x$/.exec(lines[3])?.[1];
      if (lines[0] !== 'ply' || lines[1] !== 'format binary_little_endian 1.0' || !Number.isSafeInteger(count) || count <= 0 ||
          !type || lines.slice(3).join('\n') !== `property ${type} x\nproperty ${type} y\nproperty ${type} z` || (delta && type !== 'short')) {
        throw new Error('Unsupported PLY layout; expected binary XYZ vertices');
      }
      const offset = new TextEncoder().encode(header.slice(0, end.index + end[0].length)).length;
      const size = type === 'short' ? 2 : 4;
      if (bytes.byteLength - offset !== count * 3 * size) throw new Error('Invalid PLY vertex payload');
      const view = new DataView(bytes, offset);
      const result = new Float32Array(count * 3);
      if (type === 'short') {
        // Each axis adds up its steps, wrapping at 16 bits as they were written.
        const at = [0, 0, 0];
        for (let i = 0; i < result.length; i++) {
          const value = view.getInt16(i * 2, true), axis = i % 3;
          at[axis] = delta ? (at[axis] + value) << 16 >> 16 : value;
          result[i] = at[axis];
        }
        return result;
      }
      for (let i = 0; i < result.length; i++) {
        result[i] = view.getFloat32(i * 4, true);
        if (!Number.isFinite(result[i])) throw new Error('Non-finite PLY position');
      }
      return result;
    });
    const count = positions.length / 3;
    const { scale, radius } = measure('Worker geometry preparation', () => normalizePositions(positions));
    const indices = measure('Worker select visible vertices', () => sampleVisible(count, settings.VISIBLE_FRACTION ?? 1));
    const seeds = measure('Worker generate twinkle seeds', () => twinkleSeeds(count, settings.TWINKLE_CHANCE));
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
