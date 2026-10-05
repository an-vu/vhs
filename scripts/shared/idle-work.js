// Limit preparation to short batches; fall back when idle callbacks are unavailable.
export async function runIdleSteps(steps, cancelled = () => false, foreground = false) {
  while (!cancelled()) {
    const deadline = await new Promise(resolve => {
      // Required entrance work should yield briefly, rather than wait for idle time.
      if (foreground) setTimeout(() => resolve(null), 0);
      else if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 100 });
      else setTimeout(() => resolve(null), 16);
    });
    if (cancelled()) break;
    const end = performance.now() + 4;
    do {
      if (cancelled()) break;
      if (steps.next().done) return true;
    } while (performance.now() < end && (!deadline || deadline.timeRemaining() > 1));
  }
  steps.return?.();
  return false;
}
