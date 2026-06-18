import { Vector3 } from 'three'

/** Soft-weighted set of mesh vertices captured inside a bubble region. */
export class BubbleRegion {
  center: Vector3
  radius: number
  weights: Map<number, number>  // vertex index → weight in [0, 1]

  constructor(center: Vector3, radius: number, pos: Float32Array) {
    this.center = center.clone()
    this.radius = radius
    this.weights = new Map()
    this._compute(pos)
  }

  /** Recompute weights after the radius changes (cup/grip adjust). */
  resize(newRadius: number, pos: Float32Array): void {
    this.radius = newRadius
    this.weights.clear()
    this._compute(pos)
  }

  private _compute(pos: Float32Array): void {
    const n = pos.length / 3
    const cx = this.center.x, cy = this.center.y, cz = this.center.z
    for (let i = 0; i < n; i++) {
      const dx = pos[i*3] - cx, dy = pos[i*3+1] - cy, dz = pos[i*3+2] - cz
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz)
      if (d < this.radius) {
        this.weights.set(i, (1 - d / this.radius) ** 2)
      }
    }
  }
}
