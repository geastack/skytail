import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Vector4 } from 'three/src/math/Vector4.js'
import { Group } from 'three/src/objects/Group.js'
import { InstancedMesh } from 'three/src/objects/InstancedMesh.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import type { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { preloadScene } from '../src/lib/preload-scene'

function rendererProbe(draw: () => void) {
  const viewport = new Vector4(12, 24, 1280, 800)
  const scissor = new Vector4(3, 4, 500, 300)
  const renderer = {
    sortObjects: true,
    scissorTest: false,
    getViewport: (out: Vector4) => out.copy(viewport),
    getScissor: (out: Vector4) => out.copy(scissor),
    getScissorTest: () => renderer.scissorTest,
    setViewport: (x: number, y: number, w: number, h: number) => viewport.set(x, y, w, h),
    setScissor: (x: number, y: number, w: number, h: number) => scissor.set(x, y, w, h),
    setScissorTest: (enabled: boolean) => { renderer.scissorTest = enabled },
    render: vi.fn(draw),
  }
  return { renderer: renderer as unknown as WebGLRenderer, viewport, scissor }
}

describe('startup model preload', () => {
  it('draws hidden descendants and every empty sector batch, preserving the pool and placements', () => {
    const scene = new Scene()
    const group = new Group()
    group.visible = false
    scene.add(group)
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const pooled = new Mesh(geometry, material)
    pooled.visible = false
    group.add(pooled)
    const empty = new InstancedMesh(geometry, material, 8)
    empty.count = 0
    empty.visible = false
    empty.frustumCulled = false
    const populated = new InstancedMesh(geometry, material, 8)
    populated.count = 5
    group.add(empty, populated)
    const originalMatrix = populated.instanceMatrix
    const originalData = originalMatrix.array.slice()
    const probe = rendererProbe(() => {
      scene.traverse(object => {
        expect(object.visible).toBe(true)
        expect(object.frustumCulled).toBe(false)
      })
      expect(empty.count).toBe(1)
      expect(populated.count).toBe(1)
      expect(probe.renderer.sortObjects).toBe(false)
      expect(probe.viewport.toArray()).toEqual([0, 0, 1, 1])
      expect(probe.scissor.toArray()).toEqual([0, 0, 1, 1])
      expect(probe.renderer.getScissorTest()).toBe(true)
    })
    preloadScene(probe.renderer, scene, new PerspectiveCamera())
    expect(probe.renderer.render).toHaveBeenCalledOnce()
    expect(group.visible).toBe(false)
    expect(pooled.visible).toBe(false)
    expect(empty.visible).toBe(false)
    expect(empty.frustumCulled).toBe(false)
    expect(populated.visible).toBe(true)
    expect(populated.frustumCulled).toBe(true)
    expect(empty.count).toBe(0)
    expect(populated.count).toBe(5)
    expect(populated.instanceMatrix).toBe(originalMatrix)
    expect(populated.instanceMatrix.array).toEqual(originalData)
    expect(populated.boundingSphere).toBeNull()
    expect(probe.renderer.sortObjects).toBe(true)
    expect(probe.viewport.toArray()).toEqual([12, 24, 1280, 800])
    expect(probe.scissor.toArray()).toEqual([3, 4, 500, 300])
    expect(probe.renderer.getScissorTest()).toBe(false)
  })

  it('restores scene and renderer state even if an upload fails', () => {
    const scene = new Scene()
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 5)
    mesh.visible = false
    scene.add(mesh)
    const probe = rendererProbe(() => { throw new Error('upload failed') })
    probe.renderer.setScissorTest(true)
    probe.renderer.sortObjects = false
    expect(() => preloadScene(probe.renderer, scene, new PerspectiveCamera())).toThrow('upload failed')
    expect(mesh.count).toBe(5)
    expect(mesh.visible).toBe(false)
    expect(mesh.frustumCulled).toBe(true)
    expect(probe.renderer.sortObjects).toBe(false)
    expect(probe.renderer.getScissorTest()).toBe(true)
    expect(probe.viewport.toArray()).toEqual([12, 24, 1280, 800])
    expect(probe.scissor.toArray()).toEqual([3, 4, 500, 300])
  })
})
