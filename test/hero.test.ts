import { describe, expect, it } from 'vitest'
import { Mesh } from 'three/src/objects/Mesh.js'
import type { Object3D } from 'three/src/core/Object3D.js'
import { Hero } from '../src/actors/hero'
import { KIT_UNITS_PER_METRE } from '../src/config'
import { M_COYOTE_SUPERMAN } from '../src/kit/generated/kit-ids'
import { sharedKit } from '../src/kit/kit'

// Each entry pairs a model part with its parent. An empty parent identifies a part attached to the root.
const PARTS: [string, string][] = [
  ['Head', ''],
  ['Ear_L', 'Head'],
  ['Ear_R', 'Head'],
  ['Leg_L', ''],
  ['Leg_R', ''],
  ['Tail_1', ''],
  ['Tail_2', 'Tail_1'],
  ['Tail_3', 'Tail_2'],
]

function pivotOf(name: string): number[] {
  const parts = sharedKit().modelById(M_COYOTE_SUPERMAN).parts
  const part = parts.find((p) => p.name === name)
  if (!part) throw new Error('no part ' + name)
  return part.pivot
}

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = []
  root.traverse((o) => {
    if (o instanceof Mesh) found.push(o)
  })
  return found
}

function capeOf(hero: Hero): Mesh {
  const cape = meshes(hero.mesh).find((m) => m.name === 'Cape')
  if (!cape) throw new Error('no cape mesh')
  return cape
}

function partOf(hero: Hero, name: string): Mesh {
  const geometry = sharedKit().geometryById(M_COYOTE_SUPERMAN, name)
  return meshes(hero.mesh).find((m) => m.geometry === geometry)!
}

function settle(hero: Hero, seconds = 8, throttle = 1.4): void {
  for (let i = 0; i < seconds * 60; i++) hero.update(1000 / 60, throttle, false, 0)
}

function pose(hero: Hero): number[] {
  return PARTS.flatMap(([name]) => {
    const r = partOf(hero, name).rotation
    return [r.x, r.y, r.z]
  })
}

describe('Hero', () => {
  it('mounts every posable part at its baked joint', () => {
    const hero = new Hero()
    const found = meshes(hero.mesh)
    // The 12 meshes contain the trunk, eight jointed parts, two eyes, and cape.
    expect(found.length).toBe(12)
    for (const mesh of found) {
      expect(mesh.castShadow).toBe(false)
      expect(mesh.receiveShadow).toBe(false)
    }
    for (const [name, parent] of PARTS) {
      const geometry = sharedKit().geometryById(M_COYOTE_SUPERMAN, name)
      const mesh = found.find((m) => m.geometry === geometry)
      expect(mesh, name).toBeTruthy()
      const pivot = pivotOf(name)
      const origin = parent === '' ? [0, 0, 0] : pivotOf(parent)
      expect(mesh!.position.x).toBeCloseTo((pivot[0] - origin[0]) * KIT_UNITS_PER_METRE, 6)
      expect(mesh!.position.y).toBeCloseTo((pivot[1] - origin[1]) * KIT_UNITS_PER_METRE, 6)
      expect(mesh!.position.z).toBeCloseTo((pivot[2] - origin[2]) * KIT_UNITS_PER_METRE, 6)
    }
  })

  it('moves the cape and stays finite through flight, a hit and a crash', () => {
    const hero = new Hero()
    const cape = capeOf(hero)
    const position = cape.geometry.attributes.position
    const normal = cape.geometry.attributes.normal
    const before = Float32Array.from(position.array as Float32Array)

    for (let frame = 0; frame < 40; frame++) hero.update(16, 1.5, false, 0.2)
    const after = position.array as Float32Array
    let moved = 0
    for (let i = 0; i < after.length; i++) if (Math.abs(after[i] - before[i]) > 1e-4) moved++
    expect(moved).toBeGreaterThan(after.length / 2)

    hero.hit()
    for (let frame = 0; frame < 20; frame++) hero.update(16, 1.5, false, -0.3)
    for (let frame = 0; frame < 120; frame++) hero.update(16, 1.2, true, 0.6)

    for (let i = 0; i < after.length; i++) expect(Number.isFinite(after[i])).toBe(true)
    const normals = normal.array as Float32Array
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
      expect(length).toBeCloseTo(1, 5)
    }
  })

  it('settles all body parts during steady flight', () => {
    const hero = new Hero()
    settle(hero)
    const rest = pose(hero)
    for (let frame = 0; frame < 120; frame++) {
      hero.update(1000 / 60, 1.4, false, 0)
      pose(hero).forEach((angle, i) => expect(angle).toBeCloseTo(rest[i], 6))
    }
    const ear = partOf(hero, 'Ear_L').rotation.z
    settle(hero, 8, 1.6)
    expect(partOf(hero, 'Ear_L').rotation.z).toBeGreaterThan(ear + 0.01)
  })

  it('responds to acceleration and braking, then returns to its steady pose', () => {
    const hero = new Hero()
    settle(hero)
    const rest = pose(hero)
    for (let frame = 1; frame <= 12; frame++) {
      hero.mesh.position.y = frame * frame * 0.06
      hero.mesh.rotation.z = frame * 0.012
      hero.update(1000 / 60, 1.4, false, hero.mesh.rotation.z)
    }
    for (const [name] of PARTS) {
      const index = PARTS.findIndex(([part]) => part === name) * 3
      expect(Math.abs(pose(hero)[index + 2] - rest[index + 2]), name).toBeGreaterThan(0.002)
    }
    const climbing = partOf(hero, 'Ear_L').rotation.z
    for (let frame = 0; frame < 30; frame++) hero.update(1000 / 60, 1.4, false, 0.144)
    expect(Math.abs(partOf(hero, 'Ear_L').rotation.z - climbing)).toBeGreaterThan(0.01)
    hero.mesh.rotation.set(0, 0, 0)
    settle(hero)
    pose(hero).forEach((angle, i) => expect(angle).toBeCloseTo(rest[i], 5))
  })

  it('applies impact momentum without an immediate pose change and damps the motion', () => {
    const hero = new Hero()
    settle(hero)
    const rest = pose(hero)
    hero.hit()
    expect(pose(hero)).toEqual(rest)
    hero.update(16, 1.4, false, 0)
    expect(Math.abs(partOf(hero, 'Ear_L').rotation.z - rest[5])).toBeGreaterThan(0.01)
    settle(hero)
    pose(hero).forEach((angle, i) => expect(angle).toBeCloseTo(rest[i], 5))
  })

  it('keeps motion comparable at 30, 60 and 120 fps', () => {
    function trajectory(fps: number): number[] {
      const hero = new Hero()
      settle(hero)
      const samples: number[] = []
      for (let frame = 1; frame <= fps * 2; frame++) {
        const t = frame / fps
        hero.mesh.position.y = 15 * (1 - Math.cos(t * Math.PI))
        hero.mesh.rotation.x = 0.2 * Math.sin(t * Math.PI)
        hero.mesh.rotation.z = 0.15 * Math.sin(t * Math.PI)
        hero.update(1000 / fps, 1.4, false, hero.mesh.rotation.z)
        if (frame % (fps / 2) === 0) samples.push(...pose(hero))
      }
      return samples
    }
    const reference = trajectory(120)
    for (const fps of [30, 60]) trajectory(fps).forEach((angle, i) => {
      expect(Math.abs(angle - reference[i]), `${fps}fps sample ${i}`).toBeLessThan(0.025)
    })
  })

  it('resets after a crash and teleport, and does not integrate paused frames', () => {
    const hero = new Hero()
    settle(hero)
    hero.hit()
    for (let i = 0; i < 60; i++) {
      hero.mesh.rotation.x += 0.2
      hero.mesh.position.y -= i
      hero.update(60, 1.2, true, 0)
      for (const angle of pose(hero)) expect(Number.isFinite(angle)).toBe(true)
    }
    hero.mesh.position.set(100, 200, 0)
    hero.mesh.rotation.set(0, 0, 0)
    hero.reset()
    const fresh = new Hero()
    hero.update(16, 1.4, false, 0)
    fresh.update(16, 1.4, false, 0)
    expect(pose(hero)).toEqual(pose(fresh))
    const paused = pose(hero)
    hero.update(0, 1.6, true, 1)
    expect(pose(hero)).toEqual(paused)
  })

  it('preserves equivalent roll poses across the 2π seam', () => {
    const hero = new Hero()
    settle(hero)
    const rest = pose(hero)
    hero.mesh.rotation.x = Math.PI * 2
    hero.update(16, 1.4, false, 0)
    hero.mesh.rotation.x = 0
    hero.update(16, 1.4, false, 0)
    pose(hero).forEach((angle, i) => expect(angle).toBeCloseTo(rest[i], 6))
  })

  it('reduces joint deflection with the reduced motion preference', () => {
    const normal = new Hero()
    const reduced = new Hero()
    reduced.reducedMotion = true
    settle(normal)
    settle(reduced)
    expect(Math.abs(partOf(reduced, 'Ear_L').rotation.z))
      .toBeLessThan(Math.abs(partOf(normal, 'Ear_L').rotation.z) * 0.4)
  })

  it('keeps the weighted head restrained and settles an impact without repeated wobble', () => {
    const hero = new Hero()
    settle(hero)
    const head = partOf(hero, 'Head')
    const ear = partOf(hero, 'Ear_L')
    const restHead = head.rotation.z
    const restEar = ear.rotation.z
    hero.hit()
    let headPeak = 0
    let earPeak = 0
    let crossings = 0
    let lastDeflection = 0
    for (let i = 0; i < 180; i++) {
      hero.update(1000 / 60, 1.4, false, 0)
      const deflection = head.rotation.z - restHead
      headPeak = Math.max(headPeak, Math.abs(deflection))
      earPeak = Math.max(earPeak, Math.abs(ear.rotation.z - restEar))
      if (Math.abs(deflection) > 1e-5) {
        if (deflection * lastDeflection < 0) crossings++
        lastDeflection = deflection
      }
      expect(Math.abs(head.rotation.z)).toBeLessThanOrEqual(0.045)
    }
    expect(headPeak).toBeLessThan(0.025)
    expect(headPeak).toBeLessThan(earPeak * 0.4)
    expect(crossings).toBe(0)
    expect(head.rotation.z).toBeCloseTo(restHead, 5)
  })
})
