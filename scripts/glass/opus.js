// Opus: the site's glass look. From a spec for the vHuman v in a glass
// circle, then An's tuning in the Glass Lab's Icon tab (Oct 24), made puffy and
// decisive like Apple Music's note: a sharp-knee edge on a wide bevel (.4) with a
// 120 px pull and no fold. The bend sits on the top-right / bottom-left diagonal
// but fades out slowly around the circle (corner focus 1, off-corner bend .15), so
// a line runs straight, then sweeps along the rim in one curve instead of
// twisting where the bend changes strength. A full colour split held to that
// diagonal, reaching a little inside the bend and hugging a logo's edges while
// the logo keeps its own pixels (sharp logo); a strong, very thin corner streak
// that lets logos trail a stroke into the two corners; a 5 px side wall, a wide
// soft lip, a faint border rainbow, and lens warp that bows the logo a little
// (warp and streak raised once the logos sat smaller in the glass). Lengths are
// px on a glass with a 200 px short side; other sizes scale them (see glass.js).
// The Glass Lab starts its Opus style from these values.
export const opus = {
  entrance: 'bubble',
  profile: 'lab', bezel: .4, refraction: 120, fold: 0, zoom: .95, warp: .15,
  rainbowMode: 'smooth', chroma: 1.6, vivid: 1.1, rimLight: .1, rimWidth: 25,
  bevelShade: .05, shine: .5, rimGlow: .15, bulge: .5, bulgeDepth: .3, wall: 5, wallLight: .1, deep: .05, inner: .05,
  innerWidth: 1.5, shadow: .15,
  roundness: 1, smoothness: 2, corners: 'diagonal', cornerFocus: 1, quiet: .15, cornerAngle: 0, cornerSway: .1,
  echoOn: false, echoes: 3, echoGap: 14, echoStrength: .3, echoDrift: .2,
  innerTint: .3, bulgeWidth: 50, bulgeSoft: 5, iconScale: .85,
  reach: .35, sharpLogo: true, streak: .7, streakThin: .05, edgePower: 2.4, smearBlur: 5, rimBand: .1, bulgeRing: false
};
