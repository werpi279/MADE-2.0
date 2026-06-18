import {
  Mesh,
  MeshStandardMaterial,
  BufferGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
} from 'three'

const MIN_DIST = 0.04    // minimum scene-space movement before adding a new path point
const MAX_PTS  = 120     // rolling path cap to bound geometry cost
const RADIAL   = 8       // tube cross-section segments

const CLAY_MAT = new MeshStandardMaterial({ color: 0xc4845a, roughness: 0.88, metalness: 0 })

export class TubeBuilder {
  private pts: Vector3[] = []
  private radius = 0.05
  readonly liveMesh: Mesh

  constructor() {
    this.liveMesh = new Mesh(new BufferGeometry(), CLAY_MAT)
    this.liveMesh.visible = false
  }

  start(pos: Vector3, radius: number): void {
    this.pts = [pos.clone()]
    this.radius = radius
    this.liveMesh.visible = false
  }

  addPoint(pos: Vector3, radius: number): void {
    if (!this.pts.length) return
    this.radius = radius
    if (pos.distanceTo(this.pts[this.pts.length - 1]) < MIN_DIST) return
    if (this.pts.length >= MAX_PTS) this.pts.shift()
    this.pts.push(pos.clone())
    this._rebuild()
  }

  private _rebuild(): void {
    if (this.pts.length < 2) return
    const curve = new CatmullRomCurve3(this.pts)
    const segs = Math.min(this.pts.length * 3, 240)
    this.liveMesh.geometry.dispose()
    this.liveMesh.geometry = new TubeGeometry(curve, segs, this.radius, RADIAL, false)
    this.liveMesh.visible = true
  }

  /** Freezes the live stroke as a permanent mesh; resets for next stroke. */
  commit(): Mesh | null {
    if (this.pts.length < 3) { this.cancel(); return null }
    const mesh = new Mesh(this.liveMesh.geometry.clone(), CLAY_MAT.clone())
    this.cancel()
    return mesh
  }

  cancel(): void {
    this.pts = []
    this.liveMesh.visible = false
    this.liveMesh.geometry.dispose()
    this.liveMesh.geometry = new BufferGeometry()
  }

  get active(): boolean { return this.pts.length > 0 }
}
