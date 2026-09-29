import * as THREE from "three";

// Point cloud
// --------------------------------------------------

export const POINT_SIZE = 0.014;

export const POINT_COLOR =
  new THREE.Color(0x62625e);

export const POINT_DARK_COLOR = new THREE.Color(0x30302e);

export const POINT_OPACITY = 0.88;


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
