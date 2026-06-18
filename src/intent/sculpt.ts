import { Group, Vector3 } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPinch, handOpenness, isCupPose } from '../recognizer/gestures'
import { handToScene } from '../mapping/volume'
import { SculptEngine } from '../geometry/sculpt'
import { InfluenceBlob } from '../feedback/influenceBlob'

const SCULPT_PROXIMITY = 0.45
const MIN_FALLOFF = 0.18
const MAX_FALLOFF = 0.75

type HandState = 'idle' | 'hovering' | 'sculpting'

interface HandTrack {
  state: HandState
  prevPos: Vector3
  prevDist: number
  // True while a pinch session is live; hand stays claimed until pinch releases (Bug 3 fix)
  engagedPinch: boolean
}

function makeTrack(): HandTrack {
  return { state: 'idle', prevPos: new Vector3(), prevDist: 0, engagedPinch: false }
}

export class SculptIntent {
  private tracks: [HandTrack, HandTrack] = [makeTrack(), makeTrack()]

  constructor(
    private readonly engine: SculptEngine,
    private readonly blob: InfluenceBlob,
  ) {}

  /** Returns the set of hand indices this intent consumed so NavigationIntent can skip them. */
  update(result: HandLandmarkerResult, workpiece: Group): Set<number> {
    const lms = result.landmarks
    const claimed = new Set<number>()

    workpiece.updateWorldMatrix(true, false)

    const localPos: Vector3[] = lms.map(lm =>
      workpiece.worldToLocal(handToScene(lm).clone()),
    )

    const atSurface: boolean[] = localPos.map((lp, h) => {
      if (h >= lms.length) return false
      return this.engine.query(lp).distance < SCULPT_PROXIMITY
    })

    const pinching: boolean[] = lms.map(lm => isPinch(lm))

    // ── Two-hand cup → uniform scale ─────────────────────────────────────────
    // Both hands must be at the mesh surface — prevents casual two-hand appearance
    // from triggering scale. Scale is applied ONCE per frame (Bug 1 fix).
    if (lms.length === 2 && isCupPose(lms[0], lms[1]) && atSurface[0] && atSurface[1]) {
      const dist = localPos[0].distanceTo(localPos[1])
      const prevDist = this.tracks[0].prevDist
      if (prevDist > 0) {
        const scale = dist / prevDist
        if (Math.abs(scale - 1) > 0.005) {
          workpiece.scale.multiplyScalar(scale)
        }
      }
      this.tracks[0].prevDist = dist
      this.tracks[1].prevDist = dist
      this.tracks[0].state = 'hovering'
      this.tracks[1].state = 'hovering'
      this.tracks[0].engagedPinch = false
      this.tracks[1].engagedPinch = false
      claimed.add(0); claimed.add(1)
      this.blob.hide()
      return claimed
    }

    this.tracks[0].prevDist = 0
    this.tracks[1].prevDist = 0

    // ── Two-hand axis stretch (both pinching at surface, or both in engaged session) ──
    const t0engaged = this.tracks[0].engagedPinch
    const t1engaged = this.tracks[1].engagedPinch
    if (
      lms.length === 2 &&
      pinching[0] && pinching[1] &&
      ((atSurface[0] && atSurface[1]) || (t0engaged && t1engaged))
    ) {
      const p0 = localPos[0]
      const p1 = localPos[1]
      const axis = p1.clone().sub(p0).normalize()
      const dist = p0.distanceTo(p1)
      const [t0, t1] = this.tracks

      if (t0.state === 'sculpting' && t1.state === 'sculpting' && t0.prevDist > 0) {
        const scale = dist / t0.prevDist
        if (Math.abs(scale - 1) > 0.001) {
          const mid = p0.clone().add(p1).multiplyScalar(0.5)
          this.engine.stretchAlongAxis(mid, axis, scale)
        }
      }

      t0.state = t1.state = 'sculpting'
      t0.engagedPinch = t1.engagedPinch = true
      t0.prevDist = t1.prevDist = dist
      t0.prevPos = p0.clone()
      t1.prevPos = p1.clone()
      claimed.add(0); claimed.add(1)
      this.blob.hide()
      return claimed
    }

    // ── Single-hand push/pull ─────────────────────────────────────────────────
    let blobPos: Vector3 | null = null
    let blobRadius = 0

    for (let h = 0; h < 2; h++) {
      const track = this.tracks[h]

      if (h >= lms.length) {
        if (track.engagedPinch) { this.engine.rebuildBVH(); track.engagedPinch = false }
        track.state = 'idle'
        continue
      }

      // ── Sticky grab: once pinching at surface, stay claimed until pinch releases ──
      // Prevents sculpt session from being stolen by NavigationIntent when the hand
      // drifts slightly off the mesh surface during a pull gesture (Bug 3 fix).
      if (track.engagedPinch) {
        if (!pinching[h]) {
          this.engine.rebuildBVH()
          track.engagedPinch = false
          track.state = 'idle'
        } else {
          claimed.add(h)
          const hit = this.engine.query(localPos[h])
          const openness = handOpenness(lms[h])
          const falloff = MIN_FALLOFF + openness * (MAX_FALLOFF - MIN_FALLOFF)
          // Center deformation on surface hit point — palm center can be inside the
          // mesh and would cover all vertices with its falloff radius (Bug 2 fix).
          const delta = localPos[h].clone().sub(track.prevPos)
          if (delta.length() > 0.001) {
            this.engine.deform(hit.point, delta, falloff)
          }
          track.prevPos = localPos[h].clone()
          track.state = 'sculpting'
          if (!blobPos) { blobPos = hit.point; blobRadius = falloff }
        }
        continue
      }

      if (!atSurface[h]) {
        if (track.state !== 'idle') { this.engine.rebuildBVH(); track.state = 'idle' }
        continue
      }

      claimed.add(h)

      const openness = handOpenness(lms[h])
      const falloff = MIN_FALLOFF + openness * (MAX_FALLOFF - MIN_FALLOFF)
      const hit = this.engine.query(localPos[h])

      if (!blobPos) { blobPos = hit.point; blobRadius = falloff }

      if (!pinching[h]) {
        track.state = 'hovering'
        track.prevPos = localPos[h].clone()
      } else {
        // First pinch frame: begin session and record position — no deform yet.
        // Deform starts next frame only after real movement (Bug 2 fix: prevents
        // spurious inward delta from the hover→pinch state transition).
        track.engagedPinch = true
        track.state = 'sculpting'
        track.prevPos = localPos[h].clone()
      }
    }

    blobPos ? this.blob.show(blobPos, blobRadius) : this.blob.hide()
    return claimed
  }
}
