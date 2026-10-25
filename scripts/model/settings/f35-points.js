export default {
  id: "f35-points",
  format: "ply",
  path: new URL("../../../models/f35-points.ply", import.meta.url).href,
  settings: {
    MODEL_X_ROTATION: -Math.PI / 2,
    POINT_SIZE: 0.002,
    POINT_OPACITY: 0.88,
    // The file already holds 25% of the source points; see dev/tools/reduce-points.py.
    VISIBLE_FRACTION: 1,
    TWINKLE_CHANCE: 0.93,
    TWINKLE_MAX_SIZE: 2.6,
    TWINKLE_SPEED: 1.4
  }
};
