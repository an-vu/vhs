// Carry fractional refresh intervals forward instead of restarting the cap every frame.
export function createFrameClock(fps = 60) {
  const interval = 1000 / fps;
  let previous = null, budget = 0, elapsed = 0;
  return {
    reset() { previous = null; budget = elapsed = 0; },
    tick(now, immediate = false) {
      if (previous === null) { previous = now; return 0; }
      const delta = Math.max(0, now - previous);
      previous = now;
      budget += delta; elapsed += delta;
      if (!immediate && budget + .001 < interval) return null;
      budget = Math.max(0, budget - interval * Math.max(1, Math.floor((budget + .001) / interval)));
      const dt = Math.min(elapsed / 1000, .05);
      elapsed = 0;
      return dt;
    }
  };
}
