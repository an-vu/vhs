// Every motion module loads inside this try: a failed download must never
// leave the static homepage hidden.
const query = new URLSearchParams(location.search);
try {
  // The lab and ordinary visits share the same Dissolve homepage path.
  if (query.has('motionDiagnostics')) await import('../motion-diagnostics.js');
  let config;
  if (query.has('motionPreview')) {
    try { config = JSON.parse(query.get('motionPreview')); }
    catch (error) { console.warn('Entrance preview settings unavailable', error); }
  }
  const { chooseStudioEntrance, loadStudioEntrance } = await import('../entrance/index.js');
  const kind = config ? 'dissolve' : chooseStudioEntrance();
  const [factory, { startHome }] = await Promise.all([loadStudioEntrance(kind), import('./home.js')]);
  const dissolve = kind !== 'dissolve' ? null : {
    settings: { ...config?.settings, dotSettings: config?.dotSettings },
    // Choose once per visit; explicit lab selections remain deterministic.
    model: config ? (config.model === 'rb18' ? 'rb18' : 'f35-points')
      : Math.random() < .5 ? 'f35-points' : 'rb18',
    report(phase, elapsed) {
      window.StudioDiagnostics?.phase(phase);
      if (config) parent.postMessage({ type: 'studio:motion-preview', phase, elapsed }, location.origin);
    }
  };
  startHome(factory, dissolve);
  dissolve?.report('ready', 0);
} catch (error) {
  console.warn('Homepage motion unavailable:', error);
  const root = document.documentElement;
  root.classList.remove('intro-loading', 'experience', 'dissolve-entrance', 'dissolve-text-front');
  document.querySelectorAll('#introBrand, #headerLine, .home-content, .home-main, .home-main h1 span, .home-main .main-nav a, .site-footer').forEach(element => {
    element.removeAttribute('style'); element.inert = false;
  });
  document.querySelectorAll('.dissolve-particles').forEach(element => element.remove());
  document.getElementById('model-background').hidden = true;
  document.getElementById('modelExpand').hidden = true;
  if (query.has('motionPreview')) {
    parent.postMessage({ type: 'studio:motion-preview', phase: `Model unavailable: ${error.message}`, elapsed: 0 }, location.origin);
  }
}
