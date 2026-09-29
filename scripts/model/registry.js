import f35 from "./settings/f35.js";
import rb18 from "./settings/rb18.js";
import * as THREE from "three";

// Register each model's settings file below. Asset paths live in those files.
// Optional settings override the shared defaults for that model only.
export const modelDefaults = {
  CAMERA_START: new THREE.Vector3(0, 0.18, 0.05),
  CAMERA_CONTROL_1: new THREE.Vector3(0.05, 0.45, 0.35),
  CAMERA_CONTROL_2: new THREE.Vector3(-0.35, 1.15, 3.4),
  CAMERA_END: new THREE.Vector3(0, 0, 4.45),
  REVEAL_HOLD: 2000,
  REVEAL_DURATION: 4200,
  INITIAL_Y_ROTATION: -Math.PI / 6
};

export const models = [f35, rb18];

export function chooseModel() {
  return models[Math.floor(Math.random() * models.length)];
}
