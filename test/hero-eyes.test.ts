import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { Quaternion } from 'three/src/math/Quaternion.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { Hero } from '../src/actors/hero'

describe('Coyotiv eye billboards', () => {
  it('keeps the authored chevrons upright through pitch and barrel rolls', () => {
    const hero = new Hero()
    const camera = new PerspectiveCamera(45, 1, .1, 1000)
    camera.position.set(3, 7, 57)
    camera.lookAt(0, 3, 0)
    const cameraQ = camera.getWorldQuaternion(new Quaternion())
    for (const roll of [0, .6, 1.5, Math.PI, 5.5, 2 * Math.PI]) {
      hero.mesh.rotation.set(roll, 0, .3)
      hero.prepareRender(camera)
      hero.mesh.updateMatrixWorld(true)
      for (const name of ['Eye_L', 'Eye_R']) {
        const eye = hero.mesh.getObjectByName(name) as Mesh
        expect(eye).toBeInstanceOf(Mesh)
        eye.geometry.computeBoundingBox()
        expect(eye.getWorldQuaternion(new Quaternion()).angleTo(cameraQ)).toBeLessThan(1e-6)
        expect(eye.geometry.boundingBox!.max.y).toBeGreaterThan(0)
        expect(eye.geometry.boundingBox!.max.z - eye.geometry.boundingBox!.min.z).toBeLessThan(.001)
      }
    }
  })

  it('shows the near eye and hides the far eye from opposite sides of the face', () => {
    const hero = new Hero()
    const camera = new PerspectiveCamera(45, 1, .1, 1000)
    const visible: string[][] = []
    for (const side of [1, -1]) {
      camera.position.set(0, 3, side * 57)
      camera.lookAt(0, 3, 0)
      hero.prepareRender(camera)
      visible.push(['Eye_L', 'Eye_R'].filter(name => hero.mesh.getObjectByName(name)!.visible))
    }
    expect(visible[0]).toHaveLength(1)
    expect(visible[1]).toHaveLength(1)
    expect(visible[0]).not.toEqual(visible[1])
  })
})
