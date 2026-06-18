import { Mesh, SphereGeometry, MeshStandardMaterial, Vector3 } from 'three'

export class InfluenceBlob {
  readonly object: Mesh

  constructor() {
    this.object = new Mesh(
      new SphereGeometry(1, 16, 12),
      new MeshStandardMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        wireframe: false,
      }),
    )
    this.object.visible = false
    this.object.renderOrder = 1  // draw on top of clay
  }

  /** Show blob at a workpiece-local position with the given falloff radius. */
  show(localPos: Vector3, radius: number): void {
    this.object.position.copy(localPos)
    this.object.scale.setScalar(radius)
    this.object.visible = true
  }

  hide(): void {
    this.object.visible = false
  }
}
