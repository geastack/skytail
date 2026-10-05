// Outlines use flat [x0, y0, x1, y1, ...] arrays for the native build.
import { BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'

const ARC_SEGMENTS = 6

/**
 * Return a rounded rectangle centred on the origin with counterclockwise winding.
 * A radius at least min(w, h) / 2 produces a pill or circle.
 */
export function roundedRectOutline(w: number, h: number, r: number): number[] {
  const hw = w / 2
  const hh = h / 2
  const radius = Math.min(r, hw, hh)
  const points: number[] = []
  const corners = [
    [hw - radius, -hh + radius, -Math.PI / 2],
    [hw - radius, hh - radius, 0],
    [-hw + radius, hh - radius, Math.PI / 2],
    [-hw + radius, -hh + radius, Math.PI],
  ]
  for (const corner of corners) {
    const cx = corner[0] as number
    const cy = corner[1] as number
    const start = corner[2] as number
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const a = start + ((Math.PI / 2) * i) / ARC_SEGMENTS
      points.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    }
  }
  return points
}

/** Return a five-point star with alternating outer and inner vertices. The first point is at the top. */
export function starOutline(outer: number, inner: number): number[] {
  const points: number[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = Math.PI / 2 + (i * Math.PI) / 5
    points.push(Math.cos(a) * r, Math.sin(a) * r)
  }
  return points
}

/**
 * Triangulate an outline in the z = 0 plane from the mean of its vertices.
 * The outline must be star-shaped about this point, or the triangles can overlap.
 */
export function fanGeometry(outline: number[]): BufferGeometry {
  const count = outline.length / 2
  let cx = 0
  let cy = 0
  for (let i = 0; i < count; i++) {
    cx += outline[i * 2] as number
    cy += outline[i * 2 + 1] as number
  }
  cx /= count
  cy /= count

  // Vertex 0 is the vertex mean. Vertex i + 1 is outline point i.
  const positions = new Float32Array((count + 1) * 3)
  positions[0] = cx
  positions[1] = cy
  for (let i = 0; i < count; i++) {
    positions[(i + 1) * 3] = outline[i * 2] as number
    positions[(i + 1) * 3 + 1] = outline[i * 2 + 1] as number
  }

  const indices = new Uint16Array(count * 3)
  for (let i = 0; i < count; i++) {
    indices[i * 3] = 0
    indices[i * 3 + 1] = i + 1
    indices[i * 3 + 2] = ((i + 1) % count) + 1
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}
