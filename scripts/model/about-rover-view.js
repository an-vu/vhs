import * as THREE from 'three';

// About-page presentation: projection, expand/collapse, focus and scroll layers.
export function createAboutRoverView({
  host, button, camera, rotation, state, reduced, signal,
  getPitch, setPitch, canExpand, isDisposed, onExpandedChange
}) {
  const text = [...document.querySelectorAll('.about-intro, .about .main-nav, .site-header')];
  const buttonPlaceholder = document.createElement('span');
  buttonPlaceholder.className = 'about-model-placeholder';
  buttonPlaceholder.setAttribute('aria-hidden', 'true');
  let savedView, viewTransition;
  let viewMix = 0, expanded = false;
  let viewportWidth = 1, viewportHeight = 1, blockLift = 0;
  let backgroundLayer = null;
  const layerFades = [];
  const layerTargets = [
    [document.querySelector('.site-header .header-blur'), 0],
    [document.querySelector('.site-header .header-inner'), .85],
    [document.querySelector('.about-intro'), .9]
  ];
  function cancelLayerFades() {
    layerFades.forEach(animation => animation.cancel());
    layerFades.length = 0;
  }
  function resize(width, height) {
    viewportWidth = width; viewportHeight = height;
    blockLift = parseFloat(getComputedStyle(document.body).getPropertyValue('--about-block-lift')) || 0;
    if (expanded) {
      const anchor = buttonPlaceholder.getBoundingClientRect();
      button.style.left = `${anchor.left}px`;
      button.style.top = `${anchor.top}px`;
    }
    updateProjection();
  }
  function updateProjection() {
    const width = viewportWidth, height = viewportHeight;
    const offset = 1 - viewMix;
    camera.setViewOffset(width, height, -width * (width < 700 ? .10 : .17) * offset,
      (height * (width < 700 ? .22 : .19) + blockLift) * offset, width, height);
  }
  function advanceView(dt) {
    if (!viewTransition) return;
    const transition = viewTransition;
    transition.elapsed += dt;
    const t = reduced.matches ? 1 : Math.min(1, transition.elapsed / .65);
    const ease = t * t * (3 - 2 * t);
    viewMix = THREE.MathUtils.lerp(transition.from, expanded ? 1 : 0, ease);
    rotation.quaternion.slerpQuaternions(transition.fromRotation, transition.toRotation, ease);
    setPitch(THREE.MathUtils.lerp(transition.fromPitch, transition.toPitch, ease));
    updateProjection();
    if (t === 1) {
      viewTransition = null;
      if (!expanded) savedView = null;
    }
  }
  function setExpanded(value, restoreFocus = false) {
    if (value === expanded || !canExpand()) return;
    cancelLayerFades();
    if (value) {
      savedView ??= { quaternion: rotation.quaternion.clone(), pitch: getPitch(), target: state.targetCameraZ };
      button.before(buttonPlaceholder);
      document.body.append(button);
    } else {
      state.targetCameraZ = savedView.target;
      buttonPlaceholder.replaceWith(button);
      button.style.removeProperty('left');
      button.style.removeProperty('top');
    }
    viewTransition = {
      from: viewMix, elapsed: 0,
      fromRotation: rotation.quaternion.clone(),
      toRotation: value ? rotation.quaternion.clone() : savedView.quaternion.clone(),
      fromPitch: getPitch(), toPitch: value ? getPitch() : savedView.pitch
    };
    expanded = value;
    if (reduced.matches) advanceView(0);
    document.documentElement.classList.toggle('about-model-expanded', value);
    text.forEach(element => { element.inert = value; });
    button.setAttribute('aria-expanded', String(value));
    button.setAttribute('aria-label', value ? 'Close rover view' : 'Explore Curiosity rover');
    onExpandedChange(value);
    if (restoreFocus) button.focus({ preventScroll: true });
  }
  function syncScrollLayer() {
    const next = scrollY > 1;
    if (next === backgroundLayer) return;
    const initial = backgroundLayer === null;
    backgroundLayer = next;
    cancelLayerFades();
    document.documentElement.classList.toggle('about-rover-background', next);
    if (initial || expanded || reduced.matches || isDisposed()) return;
    for (const [element, opacity] of layerTargets) {
      if (element) layerFades.push(element.animate([{ opacity }, { opacity: 1 }], {
        duration: 140, easing: 'ease-out'
      }));
    }
  }
  addEventListener('scroll', syncScrollLayer, { passive: true, signal });
  syncScrollLayer();
  button.addEventListener('click', event => setExpanded(!expanded, event.detail === 0), { signal });
  // Keep the page's footer/overscroll gestures out of the expanded viewer.
  for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
    host.addEventListener(type, event => { if (expanded) event.stopPropagation(); }, { passive: true, signal });
  }
  document.addEventListener('keydown', event => {
    if (!expanded) return;
    if (event.key === 'Escape') { event.preventDefault(); setExpanded(false, true); }
  }, { signal });
  reduced.addEventListener('change', cancelLayerFades, { signal });
  return {
    get expanded() { return expanded; },
    get transitioning() { return Boolean(viewTransition); },
    resize,
    advance: advanceView,
    dispose() {
      if (expanded) setExpanded(false);
      cancelLayerFades();
    }
  };
}
