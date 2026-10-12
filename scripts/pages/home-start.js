// The lab and ordinary visits share the same Dissolve homepage path.
const query = new URLSearchParams(location.search);
if (query.has('motionDiagnostics')) await import('../motion-diagnostics.js');
let config;
if (query.has('motionPreview')) {
  try { config = JSON.parse(query.get('motionPreview')); }
  catch (error) { console.warn('Entrance preview settings unavailable', error); }
}
window.StudioEntranceKind = config ? 'dissolve' : chooseStudioEntrance();
if (window.StudioEntranceKind === 'dissolve') {
  const { createDissolveEntrance } = await import('../entrance/dissolve.js');
  const dissolve = {
    settings: { ...config?.settings, dotSettings: config?.dotSettings },
    // Choose once per visit; explicit lab selections remain deterministic.
    model: config ? (config.model === 'rb18' ? 'rb18' : 'f35-points')
      : Math.random() < .5 ? 'f35-points' : 'rb18',
    factory: createDissolveEntrance,
    report(phase, elapsed) {
      window.StudioDiagnostics?.phase(phase);
      if (config) parent.postMessage({ type: 'studio:motion-preview', phase, elapsed }, location.origin);
    }
  };
  window.StudioDissolveEntrance = dissolve;
  if (config) window.StudioEntrancePreview = dissolve;
}
await import('./home.js');
window.StudioHomeReady = true;
dispatchEvent(new Event('studio:home-ready'));
window.StudioDissolveEntrance?.report('ready', 0);
