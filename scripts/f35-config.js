import * as THREE from "three";

// --------------------------------------------------
// Model
// --------------------------------------------------

export const MODEL_PATH =
  "models/f35-web.glb";

// --------------------------------------------------
// Point cloud
// --------------------------------------------------

export const POINT_COUNT = 7000;
export const POINT_SIZE = 0.014;

export const POINT_COLOR =
  new THREE.Color(0x555555);

export const POINT_OPACITY = 0.88;

export const TWINKLE_CHANCE = 0.20;

// --------------------------------------------------
// Camera reveal
// --------------------------------------------------

export const CAMERA_START =
  new THREE.Vector3(
    0,
    0.18,
    0.05
  );

export const CAMERA_CONTROL_1 =
  new THREE.Vector3(
    0.05,
    0.45,
    0.35
  );

export const CAMERA_CONTROL_2 =
  new THREE.Vector3(
    -0.35,
    1.15,
    3.4
  );

// Reveal now ends directly at the final
// interactive camera distance.
export const CAMERA_END =
  new THREE.Vector3(
    0,
    0,
    4.45
  );

export const REVEAL_HOLD = 2000;
export const REVEAL_DURATION = 4200;

// --------------------------------------------------
// Zoom
// --------------------------------------------------

export const MIN_CAMERA_Z = 2.5;
export const MAX_CAMERA_Z = 7.0;

export const WHEEL_ZOOM_SPEED = 0.003;
export const PINCH_ZOOM_SPEED = 0.008;

export const ZOOM_SMOOTHING = 0.10;

// --------------------------------------------------
// Aircraft rotation
// --------------------------------------------------

export const INITIAL_Y_ROTATION =
  -Math.PI / 6;

export const REVEAL_ROTATION_START =
  0.00135;

export const IDLE_ROTATION =
  0.001;

// --------------------------------------------------
// Interaction
// --------------------------------------------------

export const DRAG_SENSITIVITY =
  0.005;

export const VERTICAL_SENSITIVITY =
  0.5;

export const INERTIA =
  0.94;

export const MAX_PITCH =
  Math.PI / 2;