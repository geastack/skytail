import type { Camera } from 'three/src/cameras/Camera.js'
import type { Object3D } from 'three/src/core/Object3D.js'
import { Vector4 } from 'three/src/math/Vector4.js'
import { InstancedMesh } from 'three/src/objects/InstancedMesh.js'
import type { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import type { Scene } from 'three/src/scenes/Scene.js'

/**
 * Draw hidden pools and empty terrain batches before gameplay to prepare GPU resources.
 * compile() prepares material programs. Buffers, vertex array objects, and shadow programs also require a draw.
 * The game framebuffer keeps the output colour space and shader variants consistent with gameplay.
 * The host must render the normal scene before presenting the framebuffer.
 */
export function preloadScene(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
  const objects: Object3D[] = []
  const visibility: boolean[] = []
  const culling: boolean[] = []
  const instances: InstancedMesh[] = []
  const counts: number[] = []
  const viewport = renderer.getViewport(new Vector4())
  const scissor = renderer.getScissor(new Vector4())
  const scissorTest = renderer.getScissorTest()
  const sortObjects = renderer.sortObjects
  try {
    scene.traverse((object: Object3D): void => {
      objects.push(object)
      visibility.push(object.visible)
      culling.push(object.frustumCulled)
      object.visible = true
      object.frustumCulled = false
      if (object instanceof InstancedMesh) {
        instances.push(object)
        counts.push(object.count)
        // One instance initializes the indexed draw and vertex array object while uploading the full buffers.
        object.count = Math.min(1, object.instanceMatrix.count)
      }
    })
    // Sorting would cache bounds for the temporary instance counts.
    renderer.sortObjects = false
    renderer.setViewport(0, 0, 1, 1)
    renderer.setScissor(0, 0, 1, 1)
    renderer.setScissorTest(true)
    renderer.render(scene, camera)
  } finally {
    for (let i = 0; i < instances.length; i++) instances[i].count = counts[i]
    for (let i = 0; i < objects.length; i++) {
      objects[i].visible = visibility[i]
      objects[i].frustumCulled = culling[i]
    }
    renderer.sortObjects = sortObjects
    renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w)
    renderer.setScissor(scissor.x, scissor.y, scissor.z, scissor.w)
    renderer.setScissorTest(scissorTest)
  }
}
