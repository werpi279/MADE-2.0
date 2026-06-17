import { Vector3, Group } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPinch, wristRoll } from '../recognizer/gestures'
import { handToScene } from '../mapping/volume'
import { NavSphere, SPHERE_RADIUS } from '../feedback/navSphere'

const APPROACH_DIST = SPHERE_RADIUS * 1.35  // highlight zone
const INSIDE_DIST   = SPHERE_RADIUS * 0.9   // ghost zone

type HandState = 'idle' | 'near' | 'inside' | 'grabbing'

interface HandTrack {
  state: HandState
  prevPos: Vector3
  prevRoll: number
}

function makeTrack(): HandTrack {
  return { state: 'idle', prevPos: new Vector3(), prevRoll: 0 }
}

function wrapAngle(d: number): number {
  while (d >  Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export class NavigationIntent {
  private tracks: [HandTrack, HandTrack] = [makeTrack(), makeTrack()]
  // per-hand: last position when grab was initiated (for first-frame delta kill)
  private grabStart: [Vector3 | null, Vector3 | null] = [null, null]

  update(result: HandLandmarkerResult, workpiece: Group, sphere: NavSphere): void {
    const lms = result.landmarks

    // ── 1. Per-hand state transitions ──────────────────────────────────────
    for (let h = 0; h < 2; h++) {
      const track = this.tracks[h]

      if (h >= lms.length) {
        track.state = 'idle'
        this.grabStart[h] = null
        continue
      }

      const pos = handToScene(lms[h])
      const dist = pos.distanceTo(workpiece.position)
      const pinching = isPinch(lms[h])

      if (track.state === 'grabbing') {
        if (!pinching) {
          track.state = dist < INSIDE_DIST ? 'inside' : dist < APPROACH_DIST ? 'near' : 'idle'
          this.grabStart[h] = null
        }
      } else {
        const proximity: HandState = dist < INSIDE_DIST ? 'inside' : dist < APPROACH_DIST ? 'near' : 'idle'
        if (pinching && proximity !== 'idle') {
          track.state = 'grabbing'
          this.grabStart[h] = pos.clone()
          track.prevRoll = wristRoll(lms[h])
        } else {
          track.state = proximity
        }
      }
    }

    const [t0, t1] = this.tracks
    const h0grab = t0.state === 'grabbing'
    const h1grab = t1.state === 'grabbing'
    const bothGrab = h0grab && h1grab && lms.length === 2

    // ── 2. Two-hand globe rotate ────────────────────────────────────────────
    if (bothGrab) {
      const p0 = handToScene(lms[0])
      const p1 = handToScene(lms[1])

      if (!this.grabStart[0]) { this.grabStart[0] = p0.clone(); t0.prevPos = p0.clone() }
      if (!this.grabStart[1]) { this.grabStart[1] = p1.clone(); t1.prevPos = p1.clone() }

      const prevRel = t1.prevPos.clone().sub(t0.prevPos)
      const currRel = p1.clone().sub(p0)

      // Y-axis rotation from horizontal angular change
      const prevAY = Math.atan2(prevRel.z, prevRel.x)
      const currAY = Math.atan2(currRel.z, currRel.x)
      workpiece.rotation.y += wrapAngle(currAY - prevAY)

      // X-axis tilt from vertical angular change
      const prevAX = Math.atan2(prevRel.y, Math.hypot(prevRel.x, prevRel.z))
      const currAX = Math.atan2(currRel.y, Math.hypot(currRel.x, currRel.z))
      workpiece.rotation.x += wrapAngle(currAX - prevAX)

      // Translate: midpoint travel
      const prevMid = t0.prevPos.clone().add(t1.prevPos).multiplyScalar(0.5)
      const currMid = p0.clone().add(p1).multiplyScalar(0.5)
      workpiece.position.addScaledVector(currMid.sub(prevMid), 0.6)

      t0.prevPos = p0
      t1.prevPos = p1

    // ── 3. Single-hand grab+travel / grab+twist ─────────────────────────────
    } else {
      for (let h = 0; h < Math.min(lms.length, 2); h++) {
        const track = this.tracks[h]
        if (track.state !== 'grabbing') continue

        const pos = handToScene(lms[h])
        const roll = wristRoll(lms[h])

        // Skip first frame of grab to avoid jump from stale prevPos
        if (this.grabStart[h]) {
          this.grabStart[h] = null  // clear sentinel; prevPos is now valid
          track.prevPos = pos.clone()
          track.prevRoll = roll
          continue
        }

        // Translate: hand displacement → workpiece displacement
        const delta = pos.clone().sub(track.prevPos)
        workpiece.position.addScaledVector(delta, 0.8)

        // Rotate: wrist roll delta → Y-axis spin (~1:1 mapping)
        const rollDelta = wrapAngle(roll - track.prevRoll)
        workpiece.rotation.y += rollDelta * 0.9

        track.prevPos = pos
        track.prevRoll = roll
      }
    }

    // ── 4. Sphere visual state ──────────────────────────────────────────────
    const states = this.tracks.slice(0, Math.max(lms.length, 1)).map((t) => t.state)
    const sphereState =
      states.includes('grabbing') ? 'highlight' :
      states.includes('inside')   ? 'ghost'     :
      states.includes('near')     ? 'highlight' : 'idle'

    sphere.setState(sphereState)
  }
}
