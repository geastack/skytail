import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Aviator } from '../src/aviator'
import { preloadScene } from '../src/lib/preload-scene'
import { Controls } from '../src/io/input'
import type { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'

const probes = vi.hoisted(() => ({ update: vi.fn(), prime: vi.fn(), prepare: vi.fn() }))
vi.mock('../src/world/world', () => ({ World: class {
  scene = { name: 'world' }
  camera = {}
  plane = { prepareRender: probes.prepare }
  hud = { scene: { name: 'hud' }, camera: {}, primeRendererResources: probes.prime }
} }))
vi.mock('../src/game/game', () => ({ Game: class { update = probes.update } }))
vi.mock('../src/lib/preload-scene', () => ({ preloadScene: vi.fn() }))

function rendererProbe(): WebGLRenderer {
  return { shadowMap: {}, render: vi.fn(), clearDepth: vi.fn(), autoClear: true } as unknown as WebGLRenderer
}

beforeEach(() => { vi.resetAllMocks() })

describe('gameplay startup gate', () => {
  it('blocks gameplay until both scenes preload and preloads each scene once', () => {
    const game = new Aviator(1280, 800)
    const controls = new Controls()
    const renderer = rendererProbe()
    game.update(16, controls)
    expect(probes.update).not.toHaveBeenCalled()
    game.preload(renderer)
    expect(preloadScene).toHaveBeenCalledTimes(2)
    expect(vi.mocked(preloadScene).mock.calls.map(call => call[1].name)).toEqual(['world', 'hud'])
    const order = vi.mocked(preloadScene).mock.invocationCallOrder
    expect(probes.prime.mock.invocationCallOrder[0]).toBeGreaterThan(order[0])
    expect(probes.prime.mock.invocationCallOrder[0]).toBeLessThan(order[1])
    game.update(16, controls)
    expect(probes.update).toHaveBeenCalledWith(16, controls)
    game.preload(renderer)
    game.render(renderer)
    expect(preloadScene).toHaveBeenCalledTimes(2)
    expect(probes.prime).toHaveBeenCalledOnce()
  })

  it('keeps gameplay blocked after a failed preload and allows a retry', () => {
    const game = new Aviator(1280, 800)
    const renderer = rendererProbe()
    vi.mocked(preloadScene).mockImplementationOnce(() => { throw new Error('GPU unavailable') })
    expect(() => game.preload(renderer)).toThrow('GPU unavailable')
    game.update(16, new Controls())
    expect(probes.update).not.toHaveBeenCalled()
    game.preload(renderer)
    game.update(16, new Controls())
    expect(probes.update).toHaveBeenCalledOnce()
  })

  it('preloads before the first visible render when a host omits the explicit startup call', () => {
    const game = new Aviator(1280, 800)
    const renderer = rendererProbe()
    game.render(renderer)
    expect(preloadScene).toHaveBeenCalledTimes(2)
    expect(vi.mocked(preloadScene).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(renderer.render).mock.invocationCallOrder[0])
    expect(renderer.render).toHaveBeenCalledTimes(2)
  })
})
