// Choose once per page load; resizing or scrolling never reselects the entrance.
export function chooseStudioEntrance(value = Math.random()) {
  return value < .40 ? 'dissolve' : value < .65 ? 'shuffle' : value < .90 ? 'dot' : 'typing';
}
// Download only the selected entrance.
const loaders = {
  dissolve: () => import('./dissolve.js?v=06120f051a').then(module => module.createDissolveEntrance),
  shuffle: () => import('./shuffle.js?v=392236cb88').then(module => module.createShuffleEntrance),
  dot: () => import('./dot.js?v=1ee6d0dec9').then(module => module.createDotEntrance),
  typing: () => import('./typing.js?v=5bd761ec42').then(module => module.createTypingEntrance)
};
export function loadStudioEntrance(kind) {
  return loaders[kind]();
}
