// Choose once per page load; resizing or scrolling never reselects the entrance.
function createStudioEntrance(brand) {
  const entrances = [createDotEntrance, createTypingEntrance, createShuffleEntrance];
  return entrances[Math.floor(Math.random() * entrances.length)](brand);
}
