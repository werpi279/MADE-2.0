import { Vector3, Group } from 'three'
import type { HandLandmarkerResult } from '../tracking/handLandmarker'
import { isPointing, isPinch, isCupPose, isTwoFingerPoint } from '../recognizer/gestures'
import { landmarkToScene, handToScene } from '../mapping/volume'
import { BubbleRegion } from '../geometry/bubble'
import { BubbleViz } from '../feedback/bubbleViz'
import { SculptEngine } from '../geometry/sculpt'

// Loop is drawn with z=0 (same as coil) to avoid noisy depth in the drawn path.
// Threshold to close the loop: tip returns within this distance of the start point.
const LOOP_CLOSE_DIST  = 0.30   // scene units
const LOOP_MIN_POINTS  = 7      // minimum samples before close is checked
const LOOP_SAMPLE_DIST = 0.06   // minimum distance between consecutive samples
const LOOP_MAX_POINTS  = 150    // abort loop if path never closes
const SHELL_TOL        = 0.20   // distance from bubble surface for shell detection
const MIN_CAPTURE      = 4      // minimum captured vertices for a valid bubble

type BState = 'idle' | 'drawing' | 'active'

export class BubbleIntent {
  private state: BState = 'idle'
  private drawingHand = -1
  private loopPath: Vector3[] = []  // scene/world space, z=0
  private region: BubbleRegion | null = null
  private readonly viz: BubbleViz

  // Cage single-hand grab
  private cageHand = -1
  private cagePrevPos: Vector3 | null = null

  // Cup two-hand resize
  private cupPrevDist = 0

  constructor(
    private readonly engine: SculptEngine,
    private readonly workpiece: Group,
  ) {
    this.viz = new BubbleViz()
    workpiece.add(this.viz.object)
  }

  get isActive(): boolean { return this.state === 'active' }

  /** Vertex weights for SculptIntent mask mode (non-null while bubble is active). */
  getVertexWeights(): Map<number, number> | null {
    return this.region?.weights ?? null
  }

  /** External dismiss (e.g. sculpt pinch detected outside bubble). */
  dismiss(): void {
    if (this.state === 'active') this.engine.rebuildBVH()
    this.state = 'idle'
    this.region = null
    this.cageHand = -1
    this.cagePrevPos = null
    this.cupPrevDist = 0
    this.viz.hide()
  }

  /**
   * Returns set of claimed hand indices (hands doing cage operations).
   * Drawing-phase hand is also returned so CreateIntent won't consume it.
   */
  update(result: HandLandmarkerResult, skipHands: Set<number> = new Set()): Set<number> {
    const lms = result.landmarks
    const claimed = new Set<number>()

    this.workpiece.updateWorldMatrix(true, false)

    // ── Drawing phase ─────────────────────────────────────────────────────────
    if (this.state === 'idle' || this.state === 'drawing') {
      for (let h = 0; h < Math.min(lms.length, 2); h++) {
        if (skipHands.has(h)) continue

        // Two-finger "peace/V" gesture starts a bubble loop; mutually exclusive
        // with single-finger isPointing (coil), so both can coexist without conflict.
        const twoFinger = isTwoFingerPoint(lms[h])

        if (this.state === 'idle' && twoFinger) {
          this.state = 'drawing'
          this.drawingHand = h
          this.loopPath = [landmarkToScene({ x: lms[h][8].x, y: lms[h][8].y, z: 0 })]
          claimed.add(h)
          break
        }

        if (this.state === 'drawing' && h === this.drawingHand) {
          claimed.add(h)

          if (!twoFinger) {
            this._abortDraw()
            break
          }

          const tip = landmarkToScene({ x: lms[h][8].x, y: lms[h][8].y, z: 0 })
          const last = this.loopPath[this.loopPath.length - 1]
          if (tip.distanceTo(last) > LOOP_SAMPLE_DIST) {
            this.loopPath.push(tip)
          }

          if (this.loopPath.length > LOOP_MAX_POINTS) {
            this._abortDraw()
            break
          }

          // Close loop: tip returns near start with sufficient path length
          if (
            this.loopPath.length >= LOOP_MIN_POINTS &&
            tip.distanceTo(this.loopPath[0]) < LOOP_CLOSE_DIST
          ) {
            this._closeBubble()
          }
        }
      }
      return claimed
    }

    // ── Active phase ──────────────────────────────────────────────────────────
    if (!this.region) { this.viz.hide(); return claimed }

    const localCenter = this.region.center

    // ── Two-hand cup → resize bubble radius ───────────────────────────────────
    if (
      lms.length === 2 &&
      !skipHands.has(0) && !skipHands.has(1) &&
      isCupPose(lms[0], lms[1])
    ) {
      const p0 = this.workpiece.worldToLocal(handToScene(lms[0]).clone())
      const p1 = this.workpiece.worldToLocal(handToScene(lms[1]).clone())
      const d0 = Math.abs(p0.distanceTo(localCenter) - this.region.radius)
      const d1 = Math.abs(p1.distanceTo(localCenter) - this.region.radius)

      if (d0 < SHELL_TOL * 1.5 && d1 < SHELL_TOL * 1.5) {
        const dist = p0.distanceTo(p1)
        if (this.cupPrevDist > 0) {
          const scale = dist / this.cupPrevDist
          if (Math.abs(scale - 1) > 0.005) {
            this.region.resize(this.region.radius * scale, this.engine.getPositions())
          }
        }
        this.cupPrevDist = dist
        claimed.add(0); claimed.add(1)
        this.viz.show(localCenter, this.region.radius, 'cage')
        return claimed
      }
    }
    this.cupPrevDist = 0

    // ── Single-hand on shell: poke dismiss or cage grab ───────────────────────
    let activeCageHand = -1

    for (let h = 0; h < Math.min(lms.length, 2); h++) {
      if (skipHands.has(h)) continue

      // Use palm center to detect shell proximity for grab/poke
      const localPalmPt = this.workpiece.worldToLocal(handToScene(lms[h]).clone())
      const palmDist = localPalmPt.distanceTo(localCenter)
      const onShell = Math.abs(palmDist - this.region.radius) < SHELL_TOL

      // Poke: pointing finger tip touches bubble shell → dismiss
      if (isPointing(lms[h]) && !isPinch(lms[h])) {
        const localTip = this.workpiece.worldToLocal(
          landmarkToScene({ x: lms[h][8].x, y: lms[h][8].y, z: 0 }).clone(),
        )
        const tipDist = localTip.distanceTo(localCenter)
        if (Math.abs(tipDist - this.region.radius) < SHELL_TOL) {
          this.dismiss()
          return claimed
        }
      }

      if (onShell && isPinch(lms[h]) && activeCageHand < 0) {
        activeCageHand = h
      }
    }

    if (activeCageHand >= 0) {
      claimed.add(activeCageHand)
      this.cageHand = activeCageHand
      const localPt = this.workpiece.worldToLocal(handToScene(lms[activeCageHand]).clone())

      if (this.cagePrevPos) {
        const delta = localPt.clone().sub(this.cagePrevPos)
        if (delta.length() > 0.001) {
          this.engine.translateCapture(this.region.weights, delta)
          this.region.center.add(delta)  // keep bubble center co-moving with vertices
        }
      }
      this.cagePrevPos = localPt.clone()
      this.viz.show(this.region.center, this.region.radius, 'cage')
    } else {
      if (this.cageHand >= 0) {
        this.engine.rebuildBVH()
        this.cageHand = -1
      }
      this.cagePrevPos = null

      // Determine visual state: mask if any non-skipped hand is inside bubble
      let insideBubble = false
      for (let h = 0; h < Math.min(lms.length, 2); h++) {
        if (skipHands.has(h)) continue
        const lp = this.workpiece.worldToLocal(handToScene(lms[h]).clone())
        if (lp.distanceTo(localCenter) < this.region.radius * 0.9) {
          insideBubble = true
          break
        }
      }
      this.viz.show(this.region.center, this.region.radius, insideBubble ? 'mask' : 'active')
    }

    return claimed
  }

  private _abortDraw(): void {
    this.state = 'idle'
    this.loopPath = []
    this.drawingHand = -1
  }

  private _closeBubble(): void {
    // Convert all loop points (world space, z=0) to workpiece local space
    const localPath = this.loopPath.map(p => this.workpiece.worldToLocal(p.clone()))

    const centroidLocal = new Vector3()
    for (const p of localPath) centroidLocal.add(p)
    centroidLocal.divideScalar(localPath.length)

    // Radius = mean distance from centroid to loop points (local space), expanded 25%
    let rSum = 0
    for (const p of localPath) rSum += p.distanceTo(centroidLocal)
    const radius = (rSum / localPath.length) * 1.25

    const region = new BubbleRegion(centroidLocal, radius, this.engine.getPositions())

    if (region.weights.size < MIN_CAPTURE) {
      // Loop didn't enclose any mesh vertices: silently discard
      this._abortDraw()
      return
    }

    this.region = region
    this.state = 'active'
    this.drawingHand = -1
    this.loopPath = []

    this.viz.show(centroidLocal, radius, 'active')
  }
}
