import { Group, Line, BufferGeometry, LineDashedMaterial, Vector3 } from 'three'

export const SPHERE_RADIUS = 1.5

type SphereVisualState = 'idle' | 'highlight' | 'ghost'

function addLatitude(group: Group, r: number, yFrac: number, mat: LineDashedMaterial): void {
  const y = yFrac * r
  const rx = Math.sqrt(Math.max(0, r * r - y * y))
  const pts: Vector3[] = []
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    pts.push(new Vector3(rx * Math.cos(a), y, rx * Math.sin(a)))
  }
  const line = new Line(new BufferGeometry().setFromPoints(pts), mat)
  line.computeLineDistances()
  group.add(line)
}

function addMeridian(group: Group, r: number, angle: number, mat: LineDashedMaterial): void {
  const pts: Vector3[] = []
  for (let i = 0; i <= 72; i++) {
    const phi = (i / 72) * Math.PI * 2
    pts.push(new Vector3(
      r * Math.sin(phi) * Math.cos(angle),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(angle),
    ))
  }
  const line = new Line(new BufferGeometry().setFromPoints(pts), mat)
  line.computeLineDistances()
  group.add(line)
}

export class NavSphere {
  readonly object: Group
  private mat: LineDashedMaterial

  constructor(radius = SPHERE_RADIUS) {
    this.mat = new LineDashedMaterial({
      color: 0x4488ff,
      dashSize: 0.1,
      gapSize: 0.05,
      opacity: 0.5,
      transparent: true,
    })

    this.object = new Group()
    for (const f of [-0.8, -0.45, 0, 0.45, 0.8]) addLatitude(this.object, radius, f, this.mat)
    for (let i = 0; i < 6; i++) addMeridian(this.object, radius, (i / 6) * Math.PI, this.mat)
  }

  setState(state: SphereVisualState): void {
    switch (state) {
      case 'idle':
        this.mat.color.setHex(0x4488ff)
        this.mat.opacity = 0.5
        break
      case 'highlight':
        this.mat.color.setHex(0x88ccff)
        this.mat.opacity = 0.9
        break
      case 'ghost':
        this.mat.color.setHex(0x4488ff)
        this.mat.opacity = 0.15
        break
    }
    this.mat.needsUpdate = true
  }
}
