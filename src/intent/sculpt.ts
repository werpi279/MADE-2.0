import { Group, Vector3 } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPinch, handOpenness, isCupPose } from '../recognizer/gestures'
import { handToScene } from '../mapping/volume'
import { SculptEngine } from '../geometry/sculpt'
import { InfluenceBlob } from '../feedback/influenceBlob'

// Hand must be within this distance (in workpiece-local units) of the mesh
// surface to be in SCULPT territory.
const SCULPT_PROXIMITY = 0.45

const MIN_FALLOFF = 0.18   // closed fist → tight dent
const MAX_FALLOFF = 0.75   // open palm  → broad swell

type HandState = 'idle' | 'hovering' | 'sculpting'

interface HandTrack {
  state: HandState
  prevPos: Vector3
  prevDist: number  // two-hand distance on previous frame (for stretch/scale)
}

function makeTrack(): HandTrack {
  return { state: 'idle', prevPos: new Vector3(), prevDist: 0 }
}

export class SculptIntent {
  private tracks: [HandTrack, HandTrack] = [makeTrack(), makeTrack()]

  constructor(
    private readonly engine: SculptEngine,
    private readonly blob: InfluenceBlob,
  ) {}

  /**
   * Returns the set of hand indices this intent consumed so that NavigationIntent
   * can skip them.
   */
  update(result: HandLandmarkerResult, workpiece: Group): Set<number> {
    const lms = result.landmarks
    const claimed = new Set<number>()

    workpiece.updateWorldMatrix(true, false)

    // --- Classify each hand in workpiece-local space ---
    const localPos: Vector3[] = lms.map(lm =>
      workpiece.worldToLocal(handToScene(lm).clone()),
    )

    const atSurface: boolean[] = localPos.map((lp, h) => {
      if (h >= lms.length) return false
      return this.engine.query(lp).distance < SCULPT_PROXIMITY
    })

    const pinching: boolean[] = lms.map(lm => isPinch(lm))

    // ── Two-hand cup → uniform scale ─────────────────────────────────────────
    if (lms.length === 2 && isCupPose(lms[0], lms[1])) {
      const dist = localPos[0].distanceTo(localPos[1])
      for (let h = 0; h < 2; h++) {
        const track = this.tracks[h]
        if (track.prevDist > 0 && dist > 0) {
          const scale = dist / track.prevDist
          workpiece.scale.multiplyScalar(scale)
        }
        track.prevDist = dist
        track.state = 'hovering'
        claimed.add(h)
      }
      this.blob.hide()
      return claimed
    }

    // Reset two-hand scale state
    for (const t of this.tracks) t.prevDist = 0

    // ── Two-hand axis stretch (both pinching at surface) ──────────────────────
    if (
      lms.length === 2 &&
      pinching[0] && pinching[1] &&
      atSurface[0] && atSurface[1]
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

      if (h >= lms.length || !atSurface[h]) {
        if (track.state !== 'idle') {
          this.engine.rebuildBVH()
          track.state = 'idle'
        }
        continue
      }

      claimed.add(h)

      const openness = handOpenness(lms[h])
      const falloff  = MIN_FALLOFF + openness * (MAX_FALLOFF - MIN_FALLOFF)
      const hit      = this.engine.query(localPos[h])

      // Always show blob at closest surface point
      if (!blobPos) { blobPos = hit.point; blobRadius = falloff }

      if (!pinching[h]) {
        // Hovering: show preview blob, no deformation
        track.state = 'hovering'
        track.prevPos = localPos[h].clone()
      } else {
        // Sculpting: apply deformation
        if (track.state !== 'idle') {
          const delta = localPos[h].clone().sub(track.prevPos)
          if (delta.length() > 0.001) {
            this.engine.deform(localPos[h], delta, falloff)
          }
        }
        track.state = 'sculpting'
        track.prevPos = localPos[h].clone()
      }
    }

    if (blobPos) {
      this.blob.show(blobPos, blobRadius)
    } else {
      this.blob.hide()
    }

    return claimed
  }
}
