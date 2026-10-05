import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Controls } from '../src/io/input'

test('browser and native gamepad sources match across dead zones, buttons and disconnection', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let current = null
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [current] } })
  try {
    const browser = new Controls()
    const native = new Controls()
    let channels = Array(8).fill(0)
    native.setNativeGamepadSource(index => channels[index])
    const snapshots = [
      { x: 0, y: 0, buttons: [] },
      { x: 0.12, y: -0.12, buttons: [0] },
      { x: 0.56, y: -0.56, buttons: [1, 3] },
      { x: -1, y: 1, buttons: [13, 14] },
      { x: 0, y: 0, buttons: [] },
      null,
    ]
    const values = controls => ['x', 'y', 'action', 'back', 'flip', 'mute', 'muteMusic'].map(key => controls[key])
    for (const snapshot of snapshots) {
      current = snapshot ? { axes: [snapshot.x, snapshot.y], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: snapshot.buttons.includes(i) })) } : null
      channels = snapshot ? [1, snapshot.x, snapshot.y, ...[0, 1, 3, 13, 14].map(i => Number(snapshot.buttons.includes(i)))] : Array(8).fill(0)
      browser.poll()
      native.poll()
      assert.deepEqual(values(native), values(browser))
    }
    assert.deepEqual(values(native).slice(2), [false, false, false, false, false])
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})

test('gamepad moves and holds a cursor at the same speed across frame rates', () => {
  for (const fps of [30, 60, 120]) {
    const controls = new Controls()
    let channels = [1, 0.56, -0.56, 0, 0, 0, 0, 0]
    controls.setNativeGamepadSource(index => channels[index])
    for (let frame = 0; frame < fps / 2; ++frame) controls.poll(1000 / fps)
    assert.ok(Math.abs(controls.x - 0.75) < 1e-10)
    assert.ok(Math.abs(controls.y - 0.75) < 1e-10)
    const target = [controls.x, controls.y]
    channels = [1, 0, 0, 1, 0, 0, 0, 0]
    controls.poll(1000 / fps)
    assert.deepEqual([controls.x, controls.y], target)
    assert.equal(controls.action, true)
    channels = Array(8).fill(0)
    controls.poll(1000 / fps)
    assert.deepEqual([controls.x, controls.y], target)
    assert.equal(controls.action, false)
  }
})

test('cursor stops at the edge and reverses immediately without accumulated overshoot', () => {
  const controls = new Controls()
  let x = 1
  controls.setNativeGamepadSource(index => index === 0 ? 1 : index === 1 ? x : 0)
  for (let frame = 0; frame < 180; ++frame) controls.poll(1000 / 60)
  assert.equal(controls.x, 1)
  x = -1
  controls.poll(1000 / 60)
  assert.ok(Math.abs(controls.x - 0.95) < 1e-10)
})
