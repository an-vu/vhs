// Defaults preserve the studio gallery. Override per instance via createVFlow's third argument.
export const defaults = Object.freeze({
  loop: true,
  duration: 1000,          // milliseconds for cards and dots together
  handoff: .4,            // when the incoming card moves above the outgoing card
  retreatFraction: .65,
  longJumpThreshold: 2,   // longer journeys pass intermediate cards edge-on
  perspective: 1200,
  perspectiveRatio: 4,   // minimum perspective relative to card width
  shadeOpacity: .48,
  dotWidth: 24,
  dotExpansion: 40,
  swipeThreshold: 35
});

// The sampled timeline and its inverse must use the same curve.
export const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
