import { describe, expect, it, vi } from 'vitest'
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { BackSide } from 'three/src/constants.js'
import { Vector3 } from 'three/src/math/Vector3.js'
import { Euler } from 'three/src/math/Euler.js'
import { Flyer } from '../src/actors/flyer'
import { hazardGeometry, rewardGeometry } from '../src/actors/flight-props'
import { REWARD_COLOR, REWARD_OUTLINE } from '../src/lib/palette'

vi.mock('../src/lib/rng', () => ({ rng: () => .5 }))

describe('three-dimensional flight props', () => {
  it('gives the five-point star a closed, outward-facing volume and solid depth', () => {
    const geometry = rewardGeometry()
    const box = geometry.boundingBox!
    expect(box.max.x - box.min.x).toBeLessThan(10)
    expect(box.max.z - box.min.z).toBeCloseTo(5.6)
    const p = geometry.attributes.position
    const tips = new Set<string>()
    for (let i = 0; i < p.count; i++) {
      if (Math.hypot(p.getX(i), p.getY(i)) > 5) tips.add(`${p.getX(i)},${p.getY(i)}`)
    }
    expect(tips.size).toBe(5)
    const edges = new Map<string, number>()
    const point = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].join(',')
    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    let volume = 0
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i)
      b.fromBufferAttribute(p, i + 1)
      c.fromBufferAttribute(p, i + 2)
      volume += a.dot(b.cross(c)) / 6
      for (let k = 0; k < 3; k++) {
        const edge = [point(i + k), point(i + (k + 1) % 3)].sort().join('|')
        edges.set(edge, (edges.get(edge) ?? 0) + 1)
      }
    }
    expect(volume).toBeGreaterThan(100)
    expect([...edges.values()].every(count => count === 2)).toBe(true)
    const normals = geometry.attributes.normal
    expect(Math.abs(normals.getZ(0))).toBeLessThan(.95)
  })

  it('keeps a broad visible silhouette throughout a full tumble', () => {
    const p = rewardGeometry().attributes.position
    const point = new Vector3()
    const pose = new Euler()
    for (let y = 0; y < 24; y++) {
      for (let z = 0; z < 24; z++) {
        pose.set(0, y * Math.PI / 12, z * Math.PI / 12)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let i = 0; i < p.count; i++) {
          point.fromBufferAttribute(p, i).applyEuler(pose)
          minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
        }
        expect(maxX - minX).toBeGreaterThan(4)
        expect(maxY - minY).toBeGreaterThan(4)
      }
    }
  })

  it('lights red bombs and yellow stars with a black star border', () => {
    const bomb = new Flyer(hazardGeometry(), 0xffffff, true)
    const star = new Flyer(rewardGeometry(), REWARD_COLOR, false, true)
    for (const flyer of [bomb, star]) {
      expect(flyer.mesh.material).toBeInstanceOf(MeshPhongMaterial)
      expect(flyer.mesh.castShadow).toBe(true)
    }
    expect((bomb.mesh.material as MeshPhongMaterial).flatShading).toBe(false)
    expect((star.mesh.material as MeshPhongMaterial).flatShading).toBe(true)
    expect((star.mesh.material as MeshPhongMaterial).color.getHex()).toBe(REWARD_COLOR)
    expect(bomb.mesh.children).toHaveLength(0)
    const outline = star.mesh.children[0] as Mesh
    expect(outline.geometry).toBe(star.mesh.geometry)
    expect(outline.scale.x).toBe(1.12)
    expect((outline.material as MeshBasicMaterial).color.getHex()).toBe(REWARD_OUTLINE)
    expect(REWARD_OUTLINE).toBe(0x111111)
    expect((outline.material as MeshBasicMaterial).side).toBe(BackSide)
    const colors = bomb.mesh.geometry.attributes.color
    expect(Array.from({ length: colors.count }, (_, i) => colors.getX(i) > colors.getY(i) * 2).some(Boolean)).toBe(true)
  })

  it('tumbles around Y and Z at the same speed across frame rates', () => {
    for (const fps of [30, 60, 120]) {
      const flyer = new Flyer(rewardGeometry(), REWARD_COLOR, false, true)
      for (let frame = 0; frame < fps; frame++) flyer.spin(1000 / fps)
      expect(flyer.mesh.rotation.y).toBeCloseTo(3, 6)
      expect(flyer.mesh.rotation.z).toBeCloseTo(3, 6)
      const pose = flyer.mesh.quaternion.clone()
      flyer.spin(0)
      expect(flyer.mesh.quaternion.equals(pose)).toBe(true)
    }
  })
})
