import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { Hero } from '../src/actors/hero'
import { PlaneController } from '../src/game/plane-controller'
import { DEFAULT_H, AMP_H, FLIP_DURATION } from '../src/config'
import { Controls } from '../src/io/input'

function flight() {
  const plane = new Hero()
  const whips = { count: 0 }
  const controller = new PlaneController(plane, new PerspectiveCamera(60, 16 / 9, 1, 10000), () => {
    whips.count++
  })
  controller.reset()
  return { plane, controller, whips }
}

describe('cape whip', () => {
  it('fires once during a flip and during fast, large cursor reversals', () => {
    const { controller, whips } = flight()
    controller.flip()
    expect(whips.count).toBe(0)
    controller.fly(100, 0, 0, true)
    expect(whips.count).toBe(0) // The roll starts after its initial delay.
    controller.flip() // Ignore a flip request during an active roll.
    controller.fly(100, 0, 0, true)
    expect(whips.count).toBe(1)
    for (let elapsed = 200; elapsed <= FLIP_DURATION; elapsed += 16) controller.fly(16, 0, 0, true)
    expect(whips.count).toBe(1)
    // These full cursor sweeps each take 3 seconds.
    for (let frame = 1; frame <= 180; frame++) controller.fly(1000 / 60, 0, frame / 180, true)
    for (let frame = 1; frame <= 180; frame++) controller.fly(1000 / 60, 0, 1 - frame / 90, true)
    expect(whips.count).toBe(1)
    // This cursor movement covers 0.4 of the range in 50 ms.
    for (let frame = 1; frame <= 3; frame++) controller.fly(1000 / 60, 0, -1 + frame * 0.4 / 3, true)
    expect(whips.count).toBe(1)
    // Each following cursor sweep takes 100 ms.
    for (let frame = 1; frame <= 6; frame++) controller.fly(1000 / 60, 0, -0.6 + frame * 1.6 / 6, true)
    expect(whips.count).toBe(2)
    for (let frame = 1; frame <= 6; frame++) controller.fly(1000 / 60, 0, 1 - frame * 2 / 6, true)
    expect(whips.count).toBe(3)
  })

  it('stays silent through a bomb knockback with the cursor held still', () => {
    const { controller, whips } = flight()
    for (let frame = 0; frame < 10; frame++) controller.fly(1000 / 60, 0, 0, true)
    controller.knockback(0, 1, 1)
    for (let frame = 0; frame < 60; frame++) controller.fly(1000 / 60, 0, 0, true)
    expect(whips.count).toBe(0)
  })
})

describe('cursor flight response', () => {
  it('pitches the nose into a climb and dive equally at 30, 60 and 120 fps', () => {
    const samples: number[] = []
    for (const fps of [30, 60, 120]) {
      const { plane, controller } = flight()
      for (let frame = 1; frame <= fps; frame++) controller.fly(1000 / fps, 0, frame / fps * .5, true)
      expect(plane.mesh.rotation.z).toBeGreaterThan(.1)
      samples.push(plane.mesh.rotation.z)
      for (let frame = 1; frame <= fps; frame++) controller.fly(1000 / fps, 0, .5 - frame / fps * .5, true)
      expect(plane.mesh.rotation.z).toBeLessThan(-.1)
      expect(plane.mesh.rotation.z).toBeCloseTo(-samples[samples.length - 1], 4)
      for (let frame = 0; frame < fps; frame++) controller.fly(1000 / fps, 0, 0, true)
      expect(Math.abs(plane.mesh.rotation.z)).toBeLessThan(.00001)
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(.00001)
  })

  it('keeps frozen frames unchanged and reduces pitch and rolls with reduced motion', () => {
    const { plane, controller } = flight()
    const start = plane.mesh.position.clone()
    controller.fly(0, 1, 1, true)
    expect(plane.mesh.position).toEqual(start)
    plane.reducedMotion = true
    controller.fly(60, 0, 1, true)
    expect(plane.mesh.rotation.z).toBeLessThanOrEqual(.2)
    controller.flip()
    for (let i = 0; i < 50; i++) {
      controller.fly(16, 0, 1, true)
      expect(Math.abs(plane.mesh.rotation.x)).toBeLessThan(.1)
    }
    expect(controller.isFlipping).toBe(false)
  })

  it('finishes repeated barrel rolls without unwinding on subsequent frames', () => {
    const { plane, controller } = flight()
    const neutral = plane.mesh.quaternion.clone()
    for (let roll = 0; roll < 2; ++roll) {
      controller.flip()
      for (let elapsed = 0; elapsed < FLIP_DURATION; elapsed += 16) {
        controller.fly(16, 0, 0, true)
      }
      expect(controller.isFlipping).toBe(false)
      for (let frame = 0; frame < 30; ++frame) {
        controller.fly(16, 0, 0, true)
        expect(plane.mesh.quaternion.angleTo(neutral)).toBeLessThan(1e-7)
      }
    }
  })

  it('follows a gamepad cursor in the same frame and stops moving when released', () => {
    const { plane, controller } = flight()
    const controls = new Controls()
    let axis = -1
    controls.setNativeGamepadSource(channel => channel === 0 ? 1 : channel === 2 ? axis : 0)
    controls.poll(1000 / 60)
    controller.fly(1000 / 60, controls.x, controls.y, controls.relativeCursor)
    expect(plane.mesh.position.y).toBeCloseTo(DEFAULT_H + AMP_H * controls.y, 10)
    const height = plane.mesh.position.y
    axis = 0
    for (let frame = 0; frame < 10; ++frame) {
      controls.poll(1000 / 60)
      controller.fly(1000 / 60, controls.x, controls.y, controls.relativeCursor)
      expect(plane.mesh.position.y).toBe(height)
    }
  })

  it('travels 60 to 70 percent of AMP_H in either direction after 80 ms', () => {
    for (const direction of [-1, 1]) {
      const { plane, controller } = flight()
      for (let i = 0; i < 5; ++i) controller.fly(16, 0, direction)
      const travel = (plane.mesh.position.y - DEFAULT_H) * direction
      expect(travel).toBeGreaterThan(AMP_H * 0.6)
      expect(travel).toBeLessThan(AMP_H * 0.7)
    }
  })

  it('uses the full cursor range and responds immediately after leaving either edge', () => {
    for (const direction of [-1, 1]) {
      const { plane, controller } = flight()
      for (let i = 0; i < 120; ++i) controller.fly(1000 / 60, 0, direction)
      const edge = plane.mesh.position.y
      controller.fly(1000 / 60, 0, direction * 0.95)
      expect((edge - plane.mesh.position.y) * direction).toBeGreaterThan(0.5)
    }
  })
})
