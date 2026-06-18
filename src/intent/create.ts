import { Group, Vector3 } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPointing, thumbIndexRadius } from '../recognizer/gestures'
import { landmarkToScene, handToScene } from '../mapping/volume'
import { TubeBuilder } from '../geometry/tubeBuilder'
import { FrameExtruder } from '../geometry/frameExtruder'
import { SPHERE_RADIUS } from '../feedback/navSphere'

// A hand must be at least this far from the nav sphere to be in CREATE space
const CREATE_MIN_DIST = SPHERE_RADIUS * 1.4

type CoilState = 'idle' | 'drawing'
type FramePhase = 'idle' | 'framing' | 'extruding'

export class CreateIntent {
  private coilState: CoilState[] = ['idle', 'idle']
  private builders: TubeBuilder[]
  private extruder: FrameExtruder

  private framePhase: FramePhase = 'idle'
  private frameBaseDist = 0

  constructor(private readonly workpiece: Group) {
    this.builders = [new TubeBuilder(), new TubeBuilder()]
    this.extruder = new FrameExtruder()
    // Live meshes live in the workpiece so they move with navigation
    workpiece.add(this.builders[0].liveMesh)
    workpiece.add(this.builders[1].liveMesh)
    workpiece.add(this.extruder.previewMesh)
  }

  /**
   * Called every video frame.
   * workpiece.position is the nav sphere centre (world space).
   */
  update(result: HandLandmarkerResult): void {
    const lms = result.landmarks

    // Ensure workpiece world matrix is current so worldToLocal is accurate
    this.workpiece.updateWorldMatrix(true, false)

    // Per-hand eligibility: index extended + far from sphere
    const eligible = lms.map(lm =>
      isPointing(lm) &&
      handToScene(lm).distanceTo(this.workpiece.getWorldPosition(new Vector3())) > CREATE_MIN_DIST,
    )

    const bothEligible = eligible.length === 2 && eligible[0] && eligible[1]

    if (bothEligible) {
      // ── Two-hand frame → extrude ────────────────────────────────────
      this._endCoil(0)
      this._endCoil(1)

      const p0w = handToScene(lms[0])
      const p1w = handToScene(lms[1])
      const centerWorld = p0w.clone().add(p1w).multiplyScalar(0.5)
      const dist = p0w.distanceTo(p1w)
      const radius = dist * 0.5
      const height = Math.max(0, dist - this.frameBaseDist) * 0.8

      if (this.framePhase === 'idle') {
        this.framePhase = 'framing'
        this.frameBaseDist = dist
      }
      if (height > 0.03) this.framePhase = 'extruding'

      // Preview lives in workpiece local space
      const centerLocal = this.workpiece.worldToLocal(centerWorld.clone())
      this.extruder.update(centerLocal, radius, height)

    } else {
      // ── Commit / cancel frame ───────────────────────────────────────
      if (this.framePhase !== 'idle') {
        if (this.framePhase === 'extruding') {
          const m = this.extruder.commit()
          this.workpiece.add(m)
        } else {
          this.extruder.cancel()
        }
        this.framePhase = 'idle'
        this.frameBaseDist = 0
      }

      // ── Per-hand coil ───────────────────────────────────────────────
      for (let h = 0; h < 2; h++) {
        if (h >= lms.length || !eligible[h]) {
          this._endCoil(h)
          continue
        }

        const lm = lms[h]
        // Index tip in world space → workpiece local space
        const tipWorld = landmarkToScene({ x: lm[8].x, y: lm[8].y, z: lm[8].z ?? 0 })
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

  /** True if any hand is actively drawing a coil. */
  get isDrawing(): boolean {
    return this.coilState.some(s => s === 'drawing') || this.framePhase !== 'idle'
  }
}
