import { Mesh, CylinderGeometry, MeshStandardMaterial, Vector3 } from 'three'

const PREVIEW_MAT = new MeshStandardMaterial({
  color: 0xc4845a,
  roughness: 0.88,
  metalness: 0,
  transparent: true,
  opacity: 0.55,
})

export class FrameExtruder {
  readonly previewMesh: Mesh
  private savedCenter = new Vector3()
  private savedRadius = 0.1
  private savedHeight = 0.02

  constructor() {
    this.previewMesh = new Mesh(new CylinderGeometry(0.1, 0.1, 0.02, 32), PREVIEW_MAT)
    this.previewMesh.visible = false
  }

  update(center: Vector3, radius: number, height: number): void {
    this.savedCenter.copy(center)
    this.savedRadius = radius
    this.savedHeight = height
    this.previewMesh.geometry.dispose()
    this.previewMesh.geometry = new CylinderGeometry(radius, radius, Math.max(height, 0.02), 32)
    this.previewMesh.position.copy(center)
    this.previewMesh.visible = true
  }

  /** Returns a permanent Mesh and hides the preview. */
  commit(): Mesh {
    const geo = new CylinderGeometry(this.savedRadius, this.savedRadius, Math.max(this.savedHeight, 0.05), 32)
    const mat = new MeshStandardMaterial({ color: 0xc4845a, roughness: 0.88, metalness: 0 })
    const mesh = new Mesh(geo, mat)
    mesh.position.copy(this.savedCenter)
    this.previewMesh.visible = false
    return mesh
  }

  cancel(): void {
    this.previewMesh.visible = false
  }
}
