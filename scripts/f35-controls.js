import * as THREE from "three";

import {
  MIN_CAMERA_Z,
  MAX_CAMERA_Z,
  WHEEL_ZOOM_SPEED,
  PINCH_ZOOM_SPEED,
  DRAG_SENSITIVITY,
  VERTICAL_SENSITIVITY,
  MAX_PITCH
} from "./f35-config.js";

export function setupF35Controls({
  element,
  aircraft,
  state
}) {
  let previousX = 0;
  let previousY = 0;

  const activePointers =
    new Map();

  let previousPinchDistance =
    null;

  function getPinchDistance() {
    const pointers =
      Array.from(
        activePointers.values()
      );

    if (
      pointers.length < 2
    ) {
      return null;
    }

    const first =
      pointers[0];

    const second =
      pointers[1];

    return Math.hypot(
      second.x -
        first.x,

      second.y -
        first.y
    );
  }

  // ------------------------------------------------
  // Pointer down
  // ------------------------------------------------

  element.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !state.revealComplete
      ) {
        return;
      }

      activePointers.set(
        event.pointerId,
        {
          x: event.clientX,
          y: event.clientY
        }
      );

      element.setPointerCapture(
        event.pointerId
      );

      if (
        activePointers.size >= 2
      ) {
        state.dragging =
          false;

        previousPinchDistance =
          getPinchDistance();

        return;
      }

      state.dragging =
        true;

      previousX =
        event.clientX;

      previousY =
        event.clientY;

      state.velocityX = 0;
      state.velocityY = 0;
    }
  );

  // ------------------------------------------------
  // Pointer move
  // ------------------------------------------------

  element.addEventListener(
    "pointermove",
    (event) => {
      if (
        !activePointers.has(
          event.pointerId
        )
      ) {
        return;
      }

      activePointers.set(
        event.pointerId,
        {
          x: event.clientX,
          y: event.clientY
        }
      );

      // ----------------------------------------------
      // Pinch zoom
      // ----------------------------------------------

      if (
        activePointers.size >= 2
      ) {
        state.dragging =
          false;

        const currentDistance =
          getPinchDistance();

        if (
          previousPinchDistance !==
            null &&
          currentDistance !==
            null
        ) {
          const difference =
            previousPinchDistance -
            currentDistance;

          state.targetCameraZ +=
            difference *
            PINCH_ZOOM_SPEED;

          state.targetCameraZ =
            THREE.MathUtils.clamp(
              state.targetCameraZ,
              MIN_CAMERA_Z,
              MAX_CAMERA_Z
            );
        }

        previousPinchDistance =
          currentDistance;

        return;
      }

      // ----------------------------------------------
      // Rotation
      // ----------------------------------------------

      if (
        !state.dragging
      ) {
        return;
      }

      const dx =
        event.clientX -
        previousX;

      const dy =
        event.clientY -
        previousY;

      previousX =
        event.clientX;

      previousY =
        event.clientY;

      aircraft.rotation.y +=
        dx *
        DRAG_SENSITIVITY;

      aircraft.rotation.x +=
        dy *
        DRAG_SENSITIVITY *
        VERTICAL_SENSITIVITY;

      aircraft.rotation.x =
        THREE.MathUtils.clamp(
          aircraft.rotation.x,
          -MAX_PITCH,
          MAX_PITCH
        );

      state.velocityY =
        dx *
        DRAG_SENSITIVITY *
        0.12;

      state.velocityX =
        dy *
        DRAG_SENSITIVITY *
        VERTICAL_SENSITIVITY *
        0.12;
    }
  );

  // ------------------------------------------------
  // Pointer release
  // ------------------------------------------------

  function removePointer(
    event
  ) {
    activePointers.delete(
      event.pointerId
    );

    if (
      element.hasPointerCapture(
        event.pointerId
      )
    ) {
      element.releasePointerCapture(
        event.pointerId
      );
    }

    previousPinchDistance =
      activePointers.size >= 2
        ? getPinchDistance()
        : null;

    if (
      activePointers.size === 0
    ) {
      state.dragging =
        false;

      return;
    }

    if (
      activePointers.size === 1
    ) {
      const remaining =
        Array.from(
          activePointers.values()
        )[0];

      previousX =
        remaining.x;

      previousY =
        remaining.y;

      state.dragging =
        true;

      state.velocityX = 0;
      state.velocityY = 0;
    }
  }

  element.addEventListener(
    "pointerup",
    removePointer
  );

  element.addEventListener(
    "pointercancel",
    removePointer
  );

  // ------------------------------------------------
  // Wheel / trackpad zoom
  // ------------------------------------------------

  element.addEventListener(
    "wheel",
    (event) => {
      if (
        !state.revealComplete
      ) {
        return;
      }

      event.preventDefault();

      state.targetCameraZ +=
        event.deltaY *
        WHEEL_ZOOM_SPEED;

      state.targetCameraZ =
        THREE.MathUtils.clamp(
          state.targetCameraZ,
          MIN_CAMERA_Z,
          MAX_CAMERA_Z
        );
    },

    {
      passive: false
    }
  );
}