import { Vector3 } from 'three'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { palmCenter } from '../recognizer/gestures'

// Interaction volume scale: how many Three.js units the full camera frame spans
const X_SCALE = 4.0  // left-right: ±2 units
const Y_SCALE = 3.0  // up-down:    ±1.5 units
const Z_SCALE = 2.5  // depth (noisy; use deltas, not absolutes)

/**
 * Map a single normalized landmark to Three.js world space.
 * x is flipped because the camera feed is mirrored in the UI.
 */
export function landmarkToScene(lm: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(
    (0.5 - lm.x) * X_SCALE,
    (0.5 - lm.y) * Y_SCALE,
    (lm.z ?? 0) * Z_SCALE,
  )
}

/**
 * Map a full hand's landmarks to a scene-space position using the palm centroid.
 */
export function handToScene(lm: NormalizedLandmark[]): Vector3 {
  return landmarkToScene(palmCenter(lm))
}
