import * as THREE from "three";
import { createPLYPointCloud } from "./ply-points.js";

// A point-cloud model drawn as the homepage draws its aircraft (the same dots,
// palette and twinkle), but in place: facing the camera, no reveal, no turning.
// It fills its box, fit to the box's shorter side.
export async function createStillPoints(container, model) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .01, 100);
  const group = new THREE.Group();
  scene.add(group);
  let material;
  try { material = await createPLYPointCloud(group, renderer, model); }
  catch (error) { renderer.dispose(); throw error; }
  const radius = group.children[0].geometry.boundingSphere.radius;
  container.append(renderer.domElement);
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    const reach = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect);
    camera.position.set(0, 0, radius / reach);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    material.uniforms.uScale.value = renderer.domElement.height / 2;
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    renderer.render(scene, camera);
  }
  // The twinkle, as on the homepage: its clock runs while the smile is on screen
  // and the tab is showing; otherwise nothing is drawn.
  let elapsed = 0, last = null, frameId = 0, inView = true;
  function frame(now) {
    frameId = 0;
    if (!inView || document.hidden) { last = null; return; }
    elapsed += last === null ? 0 : Math.min((now - last) / 1000, .05);
    last = now;
    material.uniforms.uTime.value = elapsed;
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  const wake = () => { if (!frameId && inView && !document.hidden) frameId = requestAnimationFrame(frame); };
  document.addEventListener("visibilitychange", () => { last = null; wake(); });
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; wake(); }).observe(container);
  new ResizeObserver(resize).observe(container);
  resize();
  wake();
}
