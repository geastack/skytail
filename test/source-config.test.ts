import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { Hero } from '../src/actors/hero'
import { addLights } from '../src/world/lighting'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('Aviator shadow configuration', () => {
  it('uses unlit hero materials without cast or received shadows', () => {
    const hero = new Hero()
    let meshCount = 0
    hero.mesh.traverse((part) => {
      if (!(part instanceof Mesh)) return
      meshCount++
      expect(part.castShadow).toBe(false)
      expect(part.receiveShadow).toBe(false)
      expect(Array.isArray(part.material)).toBe(false)
      expect((part.material as { type: string }).type).toBe('MeshBasicMaterial')
    })
    expect(meshCount).toBe(12)
  })

  it('uses PCF filtering and a 2048-by-2048 sun shadow map', () => {
    const aviator = source('../src/aviator.ts')
    expect(aviator).toContain("import { PCFShadowMap } from 'three/src/constants.js'")
    expect(aviator).toContain('renderer.shadowMap.type = PCFShadowMap')
    expect(aviator).not.toMatch(/\bPCFSoftShadowMap\b/)

    const scene = new Scene()
    addLights(scene)
    const sun = scene.children.find((child) => child instanceof DirectionalLight)
    expect(sun).toBeInstanceOf(DirectionalLight)
    if (!(sun instanceof DirectionalLight)) throw new Error('directional light was not added')
    expect(sun.castShadow).toBe(true)
    expect(sun.shadow.mapSize.width).toBe(2048)
    expect(sun.shadow.mapSize.height).toBe(2048)
  })

})
