import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

const PINCH_THRESHOLD = 0.07  // normalized units, thumb tip (4) to index tip (8)

export function isPinch(lm: NormalizedLandmark[]): boolean {
  const dx = lm[4].x - lm[8].x
  const dy = lm[4].y - lm[8].y
  const dz = (lm[4].z ?? 0) - (lm[8].z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < PINCH_THRESHOLD
}

export function isPointing(lm: NormalizedLandmark[]): boolean {
  // Index extended, other fingers curled: index tip far from palm, rest close
  const palmCenter = { x: (lm[0].x + lm[5].x + lm[17].x) / 3, y: (lm[0].y + lm[5].y + lm[17].y) / 3 }
  const indexDist = Math.hypot(lm[8].x - palmCenter.x, lm[8].y - palmCenter.y)
  const middleDist = Math.hypot(lm[12].x - palmCenter.x, lm[12].y - palmCenter.y)
  const ringDist = Math.hypot(lm[16].x - palmCenter.x, lm[16].y - palmCenter.y)
  return indexDist > 0.18 && middleDist < 0.14 && ringDist < 0.14
}

export function handOpenness(lm: NormalizedLandmark[]): number {
  // Mean fingertip distance from palm centroid, normalized to [0, 1]
  const cx = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5
  const cy = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5
  const mean = [4, 8, 12, 16, 20].reduce((s, i) => {
    return s + Math.hypot(lm[i].x - cx, lm[i].y - cy)
  }, 0) / 5
  return Math.min(mean / 0.22, 1.0)
}

export function wristRoll(lm: NormalizedLandmark[]): number {
  // Angle of the wrist→middle-MCP vector in screen XY (radians)
  const dx = lm[9].x - lm[0].x
  const dy = lm[9].y - lm[0].y
  return Math.atan2(dy, dx)
}

/**
 * Maps thumb–index gap to a tube radius in scene units.
 * d ≈ 0.07 (near-pinch) → 0.02;  d ≈ 0.25 (wide open) → 0.12
 */
export function thumbIndexRadius(lm: NormalizedLandmark[]): number {
  const d = Math.hypot(
    lm[4].x - lm[8].x,
    lm[4].y - lm[8].y,
    (lm[4].z ?? 0) - (lm[8].z ?? 0),
  )
  return Math.max(0.02, Math.min(0.12, 0.02 + (d - 0.07) * 0.56))
}

/**
 * Index AND middle fingers extended, ring/pinky curled — the "peace / V sign".
 * Used for bubble loop drawing, mutually exclusive with isPointing (single finger).
 */
export function isTwoFingerPoint(lm: NormalizedLandmark[]): boolean {
  const cx = (lm[0].x + lm[5].x + lm[17].x) / 3
  const cy = (lm[0].y + lm[5].y + lm[17].y) / 3
  const indexDist  = Math.hypot(lm[8].x  - cx, lm[8].y  - cy)
  const middleDist = Math.hypot(lm[12].x - cx, lm[12].y - cy)
  const ringDist   = Math.hypot(lm[16].x - cx, lm[16].y - cy)
  const pinkyDist  = Math.hypot(lm[20].x - cx, lm[20].y - cy)
  return indexDist > 0.17 && middleDist > 0.16 && ringDist < 0.13 && pinkyDist < 0.11
}

/**
 * Two open palms cradling the object: both hands open, neither pinching or pointing.
 * Used to distinguish uniform scale (cup object) from axis stretch (grip two sides).
 */
export function isCupPose(lm0: NormalizedLandmark[], lm1: NormalizedLandmark[]): boolean {
  if (isPinch(lm0) || isPinch(lm1)) return false
  if (isPointing(lm0) || isPointing(lm1)) return false
  return handOpenness(lm0) > 0.55 && handOpenness(lm1) > 0.55
}

export function palmCenter(lm: NormalizedLandmark[]): { x: number; y: number; z: number } {
  const pts = [lm[0], lm[5], lm[9], lm[13], lm[17]]
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    z: pts.reduce((s, p) => s + (p.z ?? 0), 0) / pts.length,
  }
}
