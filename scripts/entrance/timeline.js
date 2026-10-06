// Every cue and animation uses the same origin, so late callbacks cannot shift later phases.
function createEntranceTimeline() {
  const cues = [], animations = [], timers = new Set();
  let origin, stopped = false;
  function at(time, callback) { cues.push({ time, callback }); }
  function animate(element, frames, options, time = 0) {
    const animation = element.animate(frames, options);
    animation.pause();
    animations.push({ animation, time });
    return animation;
  }
  function start() {
    if (origin !== undefined || stopped) return origin;
    origin = performance.now();
    for (const { animation, time } of animations) animation.startTime = origin + time;
    for (const cue of cues) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) cue.callback();
      }, Math.max(0, Math.ceil(origin + cue.time - performance.now())));
      timers.add(timer);
    }
    return origin;
  }
  function stop() {
    stopped = true;
    timers.forEach(clearTimeout); timers.clear();
    animations.forEach(({ animation }) => animation.cancel());
    animations.length = cues.length = 0;
  }
  return { at, animate, start, stop };
}
