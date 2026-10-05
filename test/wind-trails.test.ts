import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three/src/math/Vector3.js'
import { WindTrail, WindTrails, sampleWindPath, WIND_LIFETIME } from '../src/world/wind-trails'

const at = (t: number, looping = true): Vector3 => {
  const out = new Vector3()
  sampleWindPath(t, looping, out)
  return out
}

describe('wind paths', () => {
  it('travels left, reverses horizontally through the curl, then continues left', () => {
    expect(at(.5).x).toBeLessThan(at(0).x)
    expect(at(1.75).x).toBeGreaterThan(at(1.6).x)
    expect(at(3.5).x).toBeLessThan(at(3).x)
    expect(at(1.675).y).toBeGreaterThan(20)
    expect(at(2.1).y).toBeCloseTo(0)
    expect(at(4).x).toBeCloseTo(-180)
    for (const t of [1.25, 2.1]) {
      const before = at(t).sub(at(t - .0001)).multiplyScalar(10000)
      const after = at(t + .0001).sub(at(t)).multiplyScalar(10000)
      expect(before.distanceTo(after)).toBeLessThan(.2)
    }
  })

  it('keeps straight wind moving left with at most 2.5 units of vertical drift', () => {
    for (let t = .1; t <= 4; t += .1) {
      expect(at(t, false).x).toBeLessThan(at(t - .1, false).x)
      expect(Math.abs(at(t, false).y)).toBeLessThanOrEqual(2.5)
    }
  })
})

describe('pooled wind ribbons', () => {
  it('reveals only a recent tail, tapers both tips, and disappears at the end', () => {
    const trail = new WindTrail()
    trail.draw(1.8, true, .6)
    const position = trail.mesh.geometry.getAttribute('position')
    const color = trail.mesh.geometry.getAttribute('color')
    const tail = new Vector3().fromBufferAttribute(position, 1)
    const head = new Vector3().fromBufferAttribute(position, position.count - 2)
    expect(tail.distanceTo(at(1.2))).toBeLessThan(.001)
    expect(head.distanceTo(at(1.8))).toBeLessThan(.001)
    expect(color.getW(0)).toBe(0)
    expect(color.getW(1)).toBe(0)
    expect(color.getW(3 * 24 + 1)).toBeGreaterThan(.9)
    for (const t of [0, .01, 1.25, 2.4, 3.99, 4]) {
      trail.draw(t, true, .6)
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true)
    }
    trail.draw(WIND_LIFETIME, true, .6)
    expect(trail.mesh.visible).toBe(false)
    expect(trail.material.depthWrite).toBe(false)
    expect(trail.material.depthTest).toBe(true)
  })

  it('has the same geometry at equal elapsed times across frame rates, without reallocating buffers', () => {
    const a = new WindTrails()
    const b = new WindTrails()
    const geometry = a.holder.children.map(mesh => (mesh as WindTrail['mesh']).geometry)
    for (let i = 0; i < 240; i++) a.update(1000 / 30, 100, .5, false)
    for (let i = 0; i < 960; i++) b.update(1000 / 120, 100, .5, false)
    for (let i = 0; i < a.holder.children.length; i++) {
      const ma = a.holder.children[i] as WindTrail['mesh']
      const mb = b.holder.children[i] as WindTrail['mesh']
      expect(ma.geometry).toBe(geometry[i])
      expect(ma.visible).toBe(mb.visible)
      expect(ma.position.equals(mb.position)).toBe(true)
      if (!ma.visible) continue
      const pa = ma.geometry.getAttribute('position').array
      const pb = mb.geometry.getAttribute('position').array
      for (let j = 0; j < pa.length; j++) expect(pa[j]).toBeCloseTo(pb[j], 4)
    }
  })

  it('reduces the field to three slow straight wisps and retires active curls on a preference change', () => {
    const field = new WindTrails()
    field.update(0, 100, 0, true)
    expect(field.holder.children.every(mesh => !mesh.visible)).toBe(true)
    field.update(9000, 100, 0, true)
    const visible = field.holder.children.filter(mesh => mesh.visible)
    expect(visible.length).toBeLessThanOrEqual(3)
    expect(visible.length).toBeGreaterThan(0)
    for (const child of visible) {
      const p = (child as WindTrail['mesh']).geometry.getAttribute('position')
      let previousX = Infinity
      for (let i = 1; i < p.count; i += 3) {
        expect(p.getX(i)).toBeLessThanOrEqual(previousX)
        previousX = p.getX(i)
      }
    }
  })
})
