import { Mesh, SphereGeometry, MeshStandardMaterial, Vector3, DoubleSide } from 'three'

export type BubbleVisState = 'active' | 'cage' | 'mask'

export class BubbleViz {
  readonly object: Mesh

  constructor() {
    this.object = new Mesh(
      new SphereGeometry(1, 24, 16),
      new MeshStandardMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: DoubleSide,
      }),
    )
    this.object.visible = false
    this.object.renderOrder = 2
  }

  show(localCenter: Vector3, radius: number, state: BubbleVisState = 'active'): void {
    this.object.position.copy(localCenter)
    this.object.scale.setScalar(radius)
    this.object.visible = true
    const mat = this.object.material as MeshStandardMaterial
    if (state === 'cage') {
      mat.color.setHex(0xaaddff); mat.opacity = 0.28
    } else if (state === 'mask') {
      mat.color.setHex(0x9988ff); mat.opacity = 0.20
    } else {
      mat.color.setHex(0x88aaff); mat.opacity = 0.13
    }
  }

  hide(): void { this.object.visible = false }
}
