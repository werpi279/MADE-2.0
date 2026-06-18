import { Mesh, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const SCULPT_STRENGTH = 0.45
const SMOOTH_WEIGHT   = 0.3
const SMOOTH_ITERS    = 1

export interface SurfaceHit {
  distance: number
  point: Vector3
  normal: Vector3
}

// Shape matching three-mesh-bvh's internal HitPointInfo
interface BVHHit { point: Vector3; distance: number; faceIndex: number }

export class SculptEngine {
  private bvh: MeshBVH
  private pos: Float32Array
  private adj: number[][]     // adj[vertexIndex] = neighbour vertex indices
  private bvhDirty = false

  constructor(private readonly mesh: Mesh) {
    // Three.js IcosahedronGeometry is non-indexed (each face owns 3 unique vertices).
    // mergeVertices() welds coincident vertices and produces an index buffer, which
    // is required by three-mesh-bvh and for correct Laplacian smoothing across faces.
    if (!mesh.geometry.index) {
      mesh.geometry = mergeVertices(mesh.geometry)
      mesh.geometry.computeVertexNormals()
    }
    const geo = mesh.geometry
    this.pos  = geo.attributes.position.array as unknown as Float32Array
    this.bvh  = new MeshBVH(geo)
    this.adj  = buildAdj(geo.index!.array, this.pos.length / 3)
  }

  /** Return the closest surface point to a workpiece-local position. */
  query(localPt: Vector3): SurfaceHit {
    const hit: BVHHit = { point: new Vector3(), distance: 0, faceIndex: 0 }
    ;(this.bvh as any).closestPointToPoint(localPt, hit)
    return {
      distance: hit.distance,
      point:    hit.point.clone(),
      normal:   this._faceNormal(hit.faceIndex),
    }
  }

  /** Raw access to vertex position buffer for BubbleRegion construction. */
  getPositions(): Float32Array { return this.pos }

  /** Translate captured (weighted) vertices by delta. Used by bubble cage mode. */
  translateCapture(weights: Map<number, number>, delta: Vector3): void {
    const p = this.pos
    for (const [i, w] of weights) {
      p[i*3]   += delta.x * w
      p[i*3+1] += delta.y * w
      p[i*3+2] += delta.z * w
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.bvhDirty = true
  }

  /** Scale captured vertices around a pivot. Used by bubble cage scale. */
  scaleCapture(weights: Map<number, number>, center: Vector3, factor: number): void {
    const p = this.pos
    for (const [i, w] of weights) {
      const rx = p[i*3]   - center.x
      const ry = p[i*3+1] - center.y
      const rz = p[i*3+2] - center.z
      const s = 1 + (factor - 1) * w
      p[i*3]   = center.x + rx * s
      p[i*3+1] = center.y + ry * s
      p[i*3+2] = center.z + rz * s
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.bvhDirty = true
  }

  /** Push/pull vertices near localPt by delta with smooth falloff.
   *  Optional mask limits which vertices are affected (bubble mask mode). */
  deform(localPt: Vector3, delta: Vector3, falloff: number, mask?: Map<number, number>): void {
    const p = this.pos
    const n = p.length / 3
    const mod: number[] = []

    for (let i = 0; i < n; i++) {
      const mw = mask ? (mask.get(i) ?? 0) : 1
      if (mw <= 0) continue
      const dx = p[i*3]   - localPt.x
      const dy = p[i*3+1] - localPt.y
      const dz = p[i*3+2] - localPt.z
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz)
      if (d >= falloff) continue
      const w = (1 - d / falloff) ** 2 * SCULPT_STRENGTH * mw
      p[i*3]   += delta.x * w
      p[i*3+1] += delta.y * w
      p[i*3+2] += delta.z * w
      mod.push(i)
    }

    if (!mod.length) return
    for (let iter = 0; iter < SMOOTH_ITERS; iter++) this._smooth(mod)
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.bvhDirty = true
  }

  /** Non-uniform stretch along an axis (for two-hand grip). */
  stretchAlongAxis(midLocal: Vector3, axis: Vector3, scaleFactor: number): void {
    const p = this.pos
    const n = p.length / 3
    for (let i = 0; i < n; i++) {
      const rx = p[i*3]   - midLocal.x
      const ry = p[i*3+1] - midLocal.y
      const rz = p[i*3+2] - midLocal.z
      const proj = rx*axis.x + ry*axis.y + rz*axis.z
      const d    = proj * (scaleFactor - 1)
      p[i*3]   += axis.x * d
      p[i*3+1] += axis.y * d
      p[i*3+2] += axis.z * d
    }
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.bvhDirty = true
  }

  /** Rebuild BVH after sculpting stops (expensive — call only on gesture release). */
  rebuildBVH(): void {
    if (!this.bvhDirty) return
    this.bvh = new MeshBVH(this.mesh.geometry)
    this.bvhDirty = false
  }

  private _smooth(mod: number[]): void {
    const p = this.pos
    const dx = new Float32Array(mod.length)
    const dy = new Float32Array(mod.length)
    const dz = new Float32Array(mod.length)
    for (let mi = 0; mi < mod.length; mi++) {
      const vi = mod[mi]
      const nb = this.adj[vi]
      if (!nb.length) continue
      let sx = 0, sy = 0, sz = 0
      for (const ni of nb) { sx += p[ni*3]; sy += p[ni*3+1]; sz += p[ni*3+2] }
      const inv = SMOOTH_WEIGHT / nb.length
      dx[mi] = (sx - p[vi*3]   * nb.length) * inv
      dy[mi] = (sy - p[vi*3+1] * nb.length) * inv
      dz[mi] = (sz - p[vi*3+2] * nb.length) * inv
    }
    for (let mi = 0; mi < mod.length; mi++) {
      const vi = mod[mi]
      p[vi*3]   += dx[mi]
      p[vi*3+1] += dy[mi]
      p[vi*3+2] += dz[mi]
    }
  }

  private _faceNormal(fi: number): Vector3 {
    const idx = this.mesh.geometry.index!.array
    const p   = this.pos
    const a = idx[fi*3], b = idx[fi*3+1], c = idx[fi*3+2]
    const ax = p[b*3]-p[a*3], ay = p[b*3+1]-p[a*3+1], az = p[b*3+2]-p[a*3+2]
    const bx = p[c*3]-p[a*3], by = p[c*3+1]-p[a*3+1], bz = p[c*3+2]-p[a*3+2]
    return new Vector3(ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx).normalize()
  }
}

function buildAdj(indices: ArrayLike<number>, vertCount: number): number[][] {
  const sets: Set<number>[] = Array.from({ length: vertCount }, () => new Set<number>())
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i+1], c = indices[i+2]
    sets[a].add(b); sets[a].add(c)
    sets[b].add(a); sets[b].add(c)
    sets[c].add(a); sets[c].add(b)
  }
  return sets.map(s => [...s])
}
