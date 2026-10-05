import type { Camera } from 'three/src/cameras/Camera.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { DoubleSide } from 'three/src/constants.js'
import { Matrix4 } from 'three/src/math/Matrix4.js'
import { Quaternion } from 'three/src/math/Quaternion.js'
import { Ray } from 'three/src/math/Ray.js'
import { Vector3 } from 'three/src/math/Vector3.js'
import { KIT_UNITS_PER_METRE as U } from '../config'
import { sharedKit } from '../kit/kit'
import { M_COYOTE_SUPERMAN } from '../kit/generated/kit-ids'

/** The native compiler requires explicit Vector3 arguments for a number[] value. */
function vec3(triple: number[]): Vector3 {
  return new Vector3(triple[0], triple[1], triple[2])
}

export class HeroEyes {
  private readonly eyes: Mesh[] = []
  private readonly anchors: Vector3[] = []
  private readonly normals: Vector3[] = []
  private readonly cameraPosition = new Vector3()
  private readonly anchor = new Vector3()
  private readonly normal = new Vector3()
  private readonly view = new Vector3()
  private readonly start = new Vector3()
  private readonly cameraRotation = new Quaternion()
  private readonly headInverse = new Quaternion()
  private readonly inverse = new Matrix4()
  private readonly ray = new Ray()
  private readonly localRay = new Ray()
  private readonly a = new Vector3()
  private readonly b = new Vector3()
  private readonly c = new Vector3()
  private readonly hit = new Vector3()

  constructor(private readonly head: Mesh, private readonly blockers: Mesh[]) {
    const kit = sharedKit()
    const model = kit.modelById(M_COYOTE_SUPERMAN)
    const headPart = model.parts.find(p => p.name === 'Head')!
    const material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, depthTest: false, depthWrite: false, toneMapped: false, fog: false })
    for (const name of ['Eye_L', 'Eye_R']) {
      const part = model.parts.find(p => p.name === name)!
      const socket = model.sockets.find(s => s.name === name + '_Normal')!

      const anchor = vec3(part.pivot).sub(vec3(headPart.pivot)).multiplyScalar(U)
      this.anchors.push(anchor)
      this.normals.push(vec3(socket.position).sub(vec3(part.pivot)).normalize())
      const eye = new Mesh(kit.geometryById(M_COYOTE_SUPERMAN, name), material)
      eye.name = name
      eye.position.copy(anchor)
      eye.renderOrder = 10
      this.head.add(eye)
      this.eyes.push(eye)
    }
  }

  update(camera: Camera): void {
    camera.getWorldPosition(this.cameraPosition)
    camera.getWorldQuaternion(this.cameraRotation)
    this.head.getWorldQuaternion(this.headInverse).invert()
    for (let i = 0; i < this.eyes.length; i++) {
      const eye = this.eyes[i]
      this.anchor.copy(this.anchors[i]).applyMatrix4(this.head.matrixWorld)
      this.normal.copy(this.normals[i]).transformDirection(this.head.matrixWorld)
      this.view.copy(this.cameraPosition).sub(this.anchor).normalize()
      eye.visible = this.normal.dot(this.view) > 0
      if (eye.visible) {
        this.start.copy(this.anchor).addScaledVector(this.normal, .02 * U)
        this.ray.set(this.start, this.view)
        eye.visible = !this.occluded(this.start.distanceTo(this.cameraPosition))
      }
      // The camera rotation keeps each eye upright during a barrel roll.
      eye.quaternion.copy(this.headInverse).multiply(this.cameraRotation)
      eye.position.copy(this.anchor).addScaledVector(this.view, .03 * U)
      this.head.worldToLocal(eye.position)
    }
  }

  private occluded(far: number): boolean {
    for (let m = 0; m < this.blockers.length; m++) {
      const mesh = this.blockers[m]
      this.inverse.copy(mesh.matrixWorld).invert()
      this.localRay.copy(this.ray).applyMatrix4(this.inverse)
      const positions = mesh.geometry.attributes.position
      const index = mesh.geometry.index
      const count = index ? index.count : positions.count
      for (let j = 0; j < count; j += 3) {
        this.a.fromBufferAttribute(positions, index ? index.getX(j) : j)
        this.b.fromBufferAttribute(positions, index ? index.getX(j + 1) : j + 1)
        this.c.fromBufferAttribute(positions, index ? index.getX(j + 2) : j + 2)
        if (this.localRay.intersectTriangle(this.a, this.b, this.c, false, this.hit)) {
          this.hit.applyMatrix4(mesh.matrixWorld)
          const distance = this.hit.distanceTo(this.ray.origin)
          if (distance > .08 * U && distance < far) return true
        }
      }
    }
    return false
  }
}
