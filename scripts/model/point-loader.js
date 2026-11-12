import * as THREE from 'three';

// Each load owns a worker; transferred buffers are attached without copying.
export function loadPreparedPoints(model) {
  return new Promise((resolve, reject) => {
    const diagnostic = window.StudioDiagnostics;
    const done = diagnostic?.start('Worker model preparation (async wall time)');
    const worker = new Worker(new URL('./point-worker.js', import.meta.url), { type: 'module' });
    const fail = error => { worker.terminate(); reject(error); };
    worker.onerror = event => fail(new Error(event.message || 'Point worker failed'));
    worker.onmessageerror = () => fail(new Error('Invalid point worker response'));
    worker.onmessage = ({ data }) => {
      worker.terminate();
      done?.();
      if (data.error) { reject(new Error(data.error)); return; }
      const attached = diagnostic?.start('Attach transferred point buffers');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 4));
      if (data.indices) geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), data.radius);
      geometry.userData.pointScale = data.scale;
      attached?.();
      for (const timing of data.timings) diagnostic?.note(timing.name, { ms: timing.ms, thread: 'worker' });
      resolve(geometry);
    };
    worker.postMessage({ path: model.path, settings: model.settings });
  });
}
