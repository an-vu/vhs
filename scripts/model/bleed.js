import * as THREE from "three";
import { BLEED_STEPS } from "./ply-points.js";

// The bleed (config.js) for a turning point cloud: the group's turn over the last
// BLEED_DELAY seconds, kept each frame, goes to the shader as BLEED_STEPS turns
// from now back to then (in the dots' own frame, so each dot can be drawn where it
// was). Used by Home's model (scene.js) and the 404 smile (turning-points.js).
//
//   const bleed = createBleed(group, material, settings);
//   bleed(time, on);   // each frame before drawing: the clock in seconds, and
//                      // whether it shows (it fades in over BLEED_FADE seconds)
export function createBleed(group, material, settings) {
  const turns = [], past = new THREE.Quaternion(), toNow = new THREE.Quaternion(), step = new THREE.Quaternion();
  const still = new THREE.Quaternion();
  function turnAt(time, out) {
    if (time <= turns[0].time) return out.copy(turns[0].turn);
    for (let i = turns.length - 1; i > 0; i--) {
      if (turns[i - 1].time <= time) {
        const a = turns[i - 1], b = turns[i];
        return out.slerpQuaternions(a.turn, b.turn, (time - a.time) / Math.max(b.time - a.time, 1e-6));
      }
    }
    return out.copy(turns[turns.length - 1].turn);
  }
  // How much of it shows (0 to 1): faded in from the first frame it's on.
  let from = null;
  function amount(time, on) {
    if (!on) { from = null; return 0; }
    from ??= time;
    const p = Math.min(1, (time - from) / (settings.BLEED_FADE ?? 1.5));
    return p * p * (3 - 2 * p);
  }
  return function bleed(time, on) {
    const delay = settings.BLEED_DELAY ?? 0, uniform = material.uniforms.uBleed;
    if (!uniform || !(delay > 0)) return;
    // The history always reaches BLEED_DELAY back; the shader (ply-points.js)
    // picks how far back each knocked-back dot is drawn.
    const reach = delay;
    if (material.uniforms.uBleedAmount) material.uniforms.uBleedAmount.value = amount(time, on);
    const recycled = turns.length > 2 && turns[1].time < time - delay ? turns.shift() : null;
    turns.push({ time, turn: (recycled?.turn ?? new THREE.Quaternion()).copy(group.quaternion) });
    while (turns.length > 2 && turns[1].time < time - delay) turns.shift();
    const dots = group.children.find(child => child.isPoints)?.quaternion ?? step.identity();
    toNow.copy(group.quaternion).multiply(dots).invert();
    for (let k = 0; k < BLEED_STEPS; k++) {
      turnAt(time - reach * k / (BLEED_STEPS - 1), past).multiply(dots).premultiply(toNow);
      // No further back than BLEED_MAX_TURN degrees, along the same turn.
      const angle = 2 * Math.acos(Math.min(1, Math.abs(past.w))), cap = (settings.BLEED_MAX_TURN ?? 12) * Math.PI / 180;
      if (angle > cap) past.slerp(still, 1 - cap / angle);
      uniform.value[k].set(past.x, past.y, past.z, past.w);
    }
  };
}
