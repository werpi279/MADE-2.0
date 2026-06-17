import { Mesh, IcosahedronGeometry, MeshStandardMaterial } from 'three'

export function createPlaceholderMesh(): Mesh {
  const geo = new IcosahedronGeometry(0.55, 4)
  const mat = new MeshStandardMaterial({
    color: 0xc4845a,   // warm terracotta clay
    roughness: 0.88,
    metalness: 0.0,
  })
  return new Mesh(geo, mat)
}
