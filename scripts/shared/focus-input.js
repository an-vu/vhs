// Pointer clicks stay visually quiet; keyboard navigation retains focus indicators.
(() => {
  const root = document.documentElement;
  addEventListener('pointerdown', () => root.classList.add('pointer-input'), { capture: true, passive: true });
  addEventListener('keydown', event => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) root.classList.remove('pointer-input');
  }, true);
})();
