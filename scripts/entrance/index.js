// Choose once per page load; resizing or scrolling never reselects the entrance.
function chooseStudioEntrance(value = Math.random()) {
  return value < .40 ? 'dissolve' : value < .65 ? 'shuffle' : value < .90 ? 'dot' : 'typing';
}
function createStudioEntrance(brand, onComplete = () => { }, hooks = {}) {
  const dissolve = window.StudioDissolveEntrance;
  if (dissolve) return dissolve.factory(brand, onComplete, dissolve.settings, undefined, hooks);
  const factories = { dot: createDotEntrance, typing: createTypingEntrance, shuffle: createShuffleEntrance };
  return factories[window.StudioEntranceKind](brand, onComplete);
}
