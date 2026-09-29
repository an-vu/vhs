export default {
  id: "rb18",
  format: "ply",
  path: new URL("../../../models/rb18-points.ply", import.meta.url).href,
  settings: {
    MODEL_X_ROTATION: -Math.PI / 2,
    INITIAL_Y_ROTATION: Math.PI * 5 / 6,
    // Source-space size before uniform normalization to the shared framing.
    POINT_SIZE: 0.002,
    POINT_OPACITY: 0.88,
    VISIBLE_FRACTION: 0.35,
    TWINKLE_CHANCE: 0.93,
    TWINKLE_SPEED: 1.4
  }
};
