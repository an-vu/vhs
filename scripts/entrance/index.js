// Choose once per page load; resizing or scrolling never reselects the entrance.
export function chooseStudioEntrance(value = Math.random()) {
  return value < .40 ? 'dissolve' : value < .65 ? 'shuffle' : value < .90 ? 'dot' : 'typing';
}
// Download only the selected entrance.
const loaders = {
  dissolve: () => import('./dissolve.js').then(module => module.createDissolveEntrance),
  shuffle: () => import('./shuffle.js').then(module => module.createShuffleEntrance),
  dot: () => import('./dot.js').then(module => module.createDotEntrance),
  typing: () => import('./typing.js').then(module => module.createTypingEntrance)
};
export function loadStudioEntrance(kind) {
  return loaders[kind]();
}
