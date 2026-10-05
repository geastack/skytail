import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { Float32BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { sharedKit } from '../kit/kit'
import { M_BOMB_STYLIZED__RED } from '../kit/generated/kit-ids'

export function rewardGeometry(): BufferGeometry {
  const outline: number[] = []
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5
    const radius = i % 2 === 0 ? 5.2 : 2.6
    outline.push(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  const positions: number[] = []
  for (let i = 0; i < 10; i++) {
    const j = (i + 1) % 10
    const x = outline[i * 2], y = outline[i * 2 + 1]
    const nx = outline[j * 2], ny = outline[j * 2 + 1]
    positions.push(0, 0, 2.8, x, y, .9, nx, ny, .9)
    positions.push(0, 0, -2.8, nx, ny, -.9, x, y, -.9)
    positions.push(x, y, .9, x, y, -.9, nx, ny, -.9)
    positions.push(x, y, .9, nx, ny, -.9, nx, ny, .9)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function hazardGeometry(): BufferGeometry {
  return sharedKit().geometryById(M_BOMB_STYLIZED__RED, 'main').clone().center()
}
