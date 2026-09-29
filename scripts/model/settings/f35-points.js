export default {
  id: "f35-points",
  format: "ply",
  path: new URL("../../../models/f35-points.ply", import.meta.url).href,
  settings: {
    MODEL_X_ROTATION: -Math.PI / 2,
    POINT_SIZE: 0.002,
    POINT_OPACITY: 0.88,
    VISIBLE_FRACTION: 0.25,
    TWINKLE_CHANCE: 0.93,
    TWINKLE_MAX_SIZE: 2.6,
    TWINKLE_SPEED: 1.4
  }
};
