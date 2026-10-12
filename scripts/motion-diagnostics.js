// Opt-in measurement only: add &motionDiagnostics=1 to a full-size preview URL.
// RAF gaps include browser scheduling and GPU/compositor stalls, not just JS work.
const origin = performance.now();
const events = [], frames = [], renders = [];
let phase = 'loading', previous = null, running = true;
const now = () => performance.now() - origin;
window.StudioDiagnostics = {
  phase(value) { phase = value; events.push({ phase, at: now() }); },
  note(name, data) { events.push({ name, at: now(), ...data }); },
  start(name) {
    const at = now(), during = phase;
    return () => {
      if (!running) return;
      const entry = { name, phase: during, at, ms: now() - at };
      if (name === 'WebGL render CPU submission') { if (renders.length < 12000) renders.push(entry); }
      else events.push(entry);
    };
  }
};
document.addEventListener('visibilitychange', () => { previous = null; });
function sample(time) {
  if (!running) return;
  if (!document.hidden && previous !== null && frames.length < 12000) frames.push({ at: now(), phase, ms: time - previous });
  previous = document.hidden ? null : time;
  requestAnimationFrame(sample);
}
requestAnimationFrame(sample);
const button = document.createElement('button');
button.id = 'finishDiagnosticCapture';
button.textContent = 'Finish diagnostic capture';
button.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:10000;font:14px monospace;padding:12px';
document.body.append(button);
button.onclick = () => {
  running = false;
  const sorted = frames.map(f => f.ms).sort((a,b) => a-b);
  const report = {
    viewport: [innerWidth, innerHeight, devicePixelRatio],
    duration: now(), frameCount: frames.length,
    medianFrameMs: sorted[Math.floor(sorted.length / 2)],
    p95FrameMs: sorted[Math.floor(sorted.length * .95)],
    events,
    slowFrames: frames.filter(f => f.ms > 25).sort((a,b) => b.ms-a.ms).slice(0,20),
    slowRenders: renders.sort((a,b) => b.ms-a.ms).slice(0,10)
  };
  window.StudioDiagnosticReport = report;
  const output = document.createElement('pre');
  output.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:10001;background:white;color:black;font:12px monospace;padding:20px;margin:0';
  for (const [key, value] of Object.entries(report)) {
    const entries = Array.isArray(value) && typeof value[0] === 'object' ? value : [value];
    for (const entry of entries) {
      const line = document.createElement('div');
      line.textContent = key + ': ' + JSON.stringify(entry);
      output.append(line);
    }
  }
  document.body.append(output);
  button.remove();
};
