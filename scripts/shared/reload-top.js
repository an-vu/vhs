// Run in the head before the browser restores scroll on a reload.
(() => {
  const reloading = performance.getEntriesByType('navigation')[0]?.type === 'reload';
  if (!reloading) return;
  history.scrollRestoration = 'manual';
  const reset = () => scrollTo({ top: 0, left: 0, behavior: 'instant' });
  reset();
  addEventListener('DOMContentLoaded', reset, { once: true });
  addEventListener('load', reset, { once: true });
  addEventListener('pageshow', () => {
    reset();
    requestAnimationFrame(() => {
      reset();
      history.scrollRestoration = 'auto';
    });
  }, { once: true });
})();
