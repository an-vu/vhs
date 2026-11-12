// Point cloud colors come from the CSS palette (effects/model-palette.js).

// Point cloud
// --------------------------------------------------

export const POINT_SIZE = 0.014;

export const POINT_OPACITY = 0.88;


// Zoom
// --------------------------------------------------

export const MIN_CAMERA_Z = 2.5;
export const MAX_CAMERA_Z = 7.0;

export const WHEEL_ZOOM_SPEED = 0.003;
export const PINCH_ZOOM_SPEED = 0.008;

export const ZOOM_SMOOTHING = 0.10;

// --------------------------------------------------
// Model rotation
// --------------------------------------------------

export const REVEAL_ROTATION_START = 0.00135;

export const IDLE_ROTATION = 0.001;

// --------------------------------------------------
// Sharpness
// --------------------------------------------------

// How finely Home's dots are drawn on a sharp (Retina) screen: 2 = full Retina,
// the sharpest and heaviest; 1.5 = a little softer and about 45% fewer pixels to
// draw each frame. Screens below it draw at their own.
export const DOTS_PIXEL_RATIO = 1.5;

// --------------------------------------------------
// Bleed
// --------------------------------------------------

// Dissolving without dissolving, with no rhythm to it. Each dot keeps its own clock, a cycle between the two BLEED_CYCLE lengths from its own
// start; on BLEED_SHARE of its cycles it's left behind, frozen where it was or
// crawling at part speed, and fades away over its own time between the two
// BLEED_RECOVER values; then it twinkles back in where it belongs (0.5 s, a little
// bigger for a moment). No two dots in step, so the pattern has no shape. Never
// further behind than BLEED_MAX_TURN degrees. It runs all the time once the model
// has formed (faded in over BLEED_FADE seconds). BLEED_DELAY: how far back the
// scene keeps the model's turn for it.
export const BLEED_DELAY = 4;

// The furthest a dot can fall behind, in degrees of the model's turn, however fast
// it's spun (a drag doesn't scatter dots further).
export const BLEED_MAX_TURN = 12;

// On how many of its cycles a dot is left behind (0.25 = one in four; 0 = off).
export const BLEED_SHARE = 0.25;

// A dot's cycle, in seconds (each its own length, between the two).
export const BLEED_CYCLE = [4, 10];

// How long a left-behind dot takes to fade away (seconds; each its own, between the two).
export const BLEED_RECOVER = [0.8, 2.5];

// Seconds the scan takes to fade in once the model has formed.
export const BLEED_FADE = 1.5;

// --------------------------------------------------
// Interaction
// --------------------------------------------------

export const DRAG_SENSITIVITY = 0.005;

export const VERTICAL_SENSITIVITY = 0.5;

export const INERTIA = 0.94;

export const MAX_PITCH = Math.PI / 2;
