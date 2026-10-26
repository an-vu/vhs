// The 404 page's upside-down smile (dev/tools/smile-points.py), with the F-35's
// point settings so its dots look the same.
export default {
  id: "smile-points",
  format: "ply",
  path: new URL("../../../models/smile-points.ply", import.meta.url).href,
  settings: {
    MODEL_X_ROTATION: -Math.PI / 2,
    POINT_SIZE: 0.002,
    POINT_OPACITY: 0.88,
    VISIBLE_FRACTION: 1,
    TWINKLE_CHANCE: 0.93,
    TWINKLE_MAX_SIZE: 2.6,
    TWINKLE_SPEED: 1.4
  }
};
