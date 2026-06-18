import { Group, Vector3 } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPointing, isPinch, thumbIndexRadius } from '../recognizer/gestures'
import { landmarkToScene, handToScene } from '../mapping/volume'
import { TubeBuilder } from '../geometry/tubeBuilder'
import { FrameExtruder } from '../geometry/frameExtruder'

// Debounce constants — prevents isPointing flicker from starting/stopping strokes
const ONSET_FRAMES   = 4   // consecutive pointing frames needed to START a stroke
const RELEASE_FRAMES = 8   // consecutive non-pointing frames needed to END a stroke

// Two-hand frame: both hands must point together for this many frames
const FRAME_ONSET = 5

type CoilState = 'idle' | 'drawing'
type FramePhase = 'idle' | 'framing' | 'extruding'

export class CreateIntent {
  private coilState: CoilState[] = ['idle', 'idle']
  private builders: TubeBuilder[]
  private extruder: FrameExtruder

  // Debounce counters per hand
  private onsetCount:   number[] = [0, 0]   // frames of consecutive pointing
  private releaseCount: number[] = [0, 0]   // frames of consecutive not-pointing

  private framePhase: FramePhase = 'idle'
  private frameBaseDist = 0
  private frameBothCount = 0               // frames both hands pointing together

  constructor(private readonly workpiece: Group) {
    this.builders = [new TubeBuilder(), new TubeBuilder()]
    this.extruder = new FrameExtruder()
    workpiece.add(this.builders[0].liveMesh)
    workpiece.add(this.builders[1].liveMesh)
    workpiece.add(this.extruder.previewMesh)
  }

  update(result: HandLandmarkerResult): void {
    const lms = result.landmarks
    this.workpiece.updateWorldMatrix(true, false)

    // ── Raw per-hand pointing check (no distance gate — the gesture IS the intent) ──
    // Pointing is mutually exclusive with pinching (index+thumb together), so there
    // is no accidental conflict with the NAVIGATE pinch gesture.
    const rawPointing = [false, false]
    for (let h = 0; h < 2; h++) {
      rawPointing[h] = h < lms.length && isPointing(lms[h]) && !isPinch(lms[h])
    }

    // ── Two-hand frame detection (debounced) ─────────────────────────────────────
    const rawBoth = rawPointing[0] && rawPointing[1] && lms.length === 2
    if (rawBoth) { this.frameBothCount++ } else { this.frameBothCount = 0 }
    const bothPointing = rawBoth && (
      this.framePhase !== 'idle'           // already in frame mode: sustain freely
        ? true
        : this.frameBothCount >= FRAME_ONSET  // onset threshold
    )

    if (bothPointing) {
      // ── Two-hand frame → extrude ─────────────────────────────────────────
      this._endCoil(0)
      this._endCoil(1)

      const p0w = handToScene(lms[0])
      const p1w = handToScene(lms[1])
      const centerWorld = p0w.clone().add(p1w).multiplyScalar(0.5)
      const dist = p0w.distanceTo(p1w)
      const radius = Math.max(dist * 0.5, 0.1)
      const height = Math.max(0, dist - this.frameBaseDist) * 0.8

      if (this.framePhase === 'idle') {
        this.framePhase = 'framing'
        this.frameBaseDist = dist
      }
      if (height > 0.05) this.framePhase = 'extruding'

      const centerLocal = this.workpiece.worldToLocal(centerWorld.clone())
      this.extruder.update(centerLocal, radius, height)

    } else {
      // ── Commit / cancel frame ─────────────────────────────────────────────
      if (this.framePhase !== 'idle') {
        if (this.framePhase === 'extruding') {
          this.workpiece.add(this.extruder.commit())
        } else {
          this.extruder.cancel()
        }
        this.framePhase = 'idle'
        this.frameBaseDist = 0
        this.frameBothCount = 0
      }

      // ── Per-hand coil (debounced) ─────────────────────────────────────────
      for (let h = 0; h < 2; h++) {
        // Update debounce counters
        if (rawPointing[h]) {
          this.onsetCount[h]++
          this.releaseCount[h] = 0
        } else {
          this.releaseCount[h]++
          this.onsetCount[h] = 0
        }

        const shouldDraw = this.coilState[h] === 'drawing'
          ? this.releaseCount[h] < RELEASE_FRAMES   // keep drawing through brief gaps
          : this.onsetCount[h] >= ONSET_FRAMES       // start only after stable gesture

        if (!shouldDraw) {
          this._endCoil(h)
          continue
        }

        const lm = lms[h]

        // Index tip → workpiece local space.
        // z is set to 0: MediaPipe normalised-landmark z is too noisy to use raw.
        // The result is a clean XY coil that doesn't jitter in depth.
        const tipWorld = landmarkToScene({ x: lm[8].x, y: lm[8].y, z: 0 })
        const tipLocal = this.workpiece.worldToLocal(tipWorld.clone())
        const r = thumbIndexRadius(lm)

        if (this.coilState[h] === 'idle') {
          this.coilState[h] = 'drawing'
          this.builders[h].start(tipLocal, r)
        } else {
          this.builders[h].addPoint(tipLocal, r)
        }
      }
    }
  }

  private _endCoil(h: number): void {
    if (this.coilState[h] === 'idle') return
    this.coilState[h] = 'idle'
    const m = this.builders[h].commit()
    if (m) this.workpiece.add(m)
  }

  get isDrawing(): boolean {
    return this.coilState.some(s => s === 'drawing') || this.framePhase !== 'idle'
  }
}
