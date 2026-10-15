// Shared by the entrance and Motion Lab. Percentages use 0–100; sizes are
// CSS-pixel radii at the full 150px desktop wordmark, scaled with the word on smaller screens.
export const dotGroups = [
  ['Color & population', [
    ['count', 'Number of dots', 420, 10, 2000, 1],
    ['gray', 'Gray (%)', 50, 0, 100, 1],
    ['black', 'Black (%)', 30, 0, 100, 1],
    ['lightGray', 'Light gray (%)', 20, 0, 100, 1],
    ['smallColors', 'Custom small-dot colors', 0, 0, 1, 1],
    ['smallGray', 'Small-dot gray (%)', 34, 0, 100, 1],
    ['smallBlack', 'Small-dot black (%)', 43, 0, 100, 1],
    ['smallLightGray', 'Small-dot light gray (%)', 23, 0, 100, 1],
    ['mediumColors', 'Custom medium-dot colors', 1, 0, 1, 1],
    ['mediumGray', 'Medium-dot gray (%)', 40, 0, 100, 1],
    ['mediumBlack', 'Medium-dot black (%)', 55, 0, 100, 1],
    ['mediumLightGray', 'Medium-dot light gray (%)', 5, 0, 100, 1],
    ['largeColors', 'Custom large-dot colors', 1, 0, 1, 1],
    ['largeGray', 'Large-dot gray (%)', 28, 0, 100, 1],
    ['largeBlack', 'Large-dot black (%)', 70, 0, 100, 1],
    ['largeLightGray', 'Large-dot light gray (%)', 2, 0, 100, 1]
  ]],
  ['Size', [
    ['largePercent', 'Large dots (%)', 2.14, 0, 100, .01],
    ['mediumPercent', 'Medium dots (%)', 9.29, 0, 100, .01],
    ['smallMin', 'Small minimum radius (px)', 0.65, .1, 100, .05],
    ['smallMax', 'Small maximum radius (px)', 5.25, .1, 100, .05],
    ['mediumMin', 'Medium minimum radius (px)', 4, .1, 100, .1],
    ['mediumMax', 'Medium maximum radius (px)', 11, .1, 100, .1],
    ['largeMin', 'Large minimum radius (px)', 16, .1, 100, .1],
    ['largeMax', 'Large maximum radius (px)', 20, .1, 100, .1],
    ['smallBias', 'Small-dot size bias', 1.7, .1, 5, .1]
  ]],
  ['Soft-focus blur', [
    ['smallThreshold', 'Small-dot cutoff radius (px)', 8, .1, 100, .1],
    ['smallBlur', 'Small-dot blur chance (%)', 30, 0, 100, 1],
    ['largeBlur', 'Larger-dot blur chance (%)', 8, 0, 100, 1],
    ['smallCore', 'Small blurred dot solid core (%)', 20, 0, 99, 1],
    ['largeCore', 'Largest blurred dot solid core (%)', 50, 0, 99, 1]
  ]],
  ['Transparency', [
    ['smallTransparent', 'Smallest-dot transparency chance (%)', 25, 0, 100, 1],
    ['largeTransparent', 'Largest-dot transparency chance (%)', 2.5, 0, 100, .5],
    ['smallOpacityMin', 'Smallest translucent dot minimum opacity (%)', 50, 0, 100, 1],
    ['smallOpacityMax', 'Smallest translucent dot maximum opacity (%)', 80, 0, 100, 1],
    ['largeOpacityMin', 'Largest translucent dot minimum opacity (%)', 90, 0, 100, 1],
    ['largeOpacityMax', 'Largest translucent dot maximum opacity (%)', 97, 0, 100, 1]
  ]],
  ['Spread & movement', [
    ['widePercent', 'Screen-wide dots (%)', 28, 0, 100, 1],
    ['spreadX', 'Horizontal spread (% of viewport)', 18, 0, 100, 1],
    ['spreadY', 'Vertical spread (% of viewport)', 22, 0, 100, 1],
    ['upward', 'Upward lift (% of word size)', 18, 0, 100, 1],
    ['burst', 'Initial outward speed', 3, .1, 10, .1],
    ['flight', 'Continued outward speed', 0.22, 0, 2, .01],
    ['driftX', 'Horizontal drift (px)', 7, 0, 100, 1],
    ['driftY', 'Vertical drift (px)', 6, 0, 100, 1],
    ['driftSpeed', 'Drift speed multiplier', 1, 0, 5, .1]
  ]]
];
export const dotDefaults = Object.freeze(Object.fromEntries(dotGroups.flatMap(([, fields]) => fields.map(([key, , value]) => [key, value]))));
export function dotSettings(input = {}) {
  const result = {};
  for (const [, fields] of dotGroups) for (const [key, , fallback, min, max] of fields) {
    const value = input[key];
    result[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  result.count = Math.round(result.count);
  for (const prefix of ['small', 'medium', 'large', 'smallOpacity', 'largeOpacity']) {
    result[prefix + 'Max'] = Math.max(result[prefix + 'Min'], result[prefix + 'Max']);
  }
  const sum = result.gray + result.black + result.lightGray;
  for (const key of ['gray', 'black', 'lightGray']) result[key] = sum ? result[key] / sum * 100 : dotDefaults[key];
  return result;
}
