import { TetrahedronGeometry } from 'three/src/geometries/TetrahedronGeometry.js'
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js'
import { Object3D } from 'three/src/core/Object3D.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { rng } from '../lib/rng'
import { TEAL } from '../lib/palette'

export class ParticleSystem {
  readonly holder: Object3D
  private readonly meshes: Mesh[]
  private readonly mats: MeshPhongMaterial[]
  private readonly active: boolean[]
  private readonly age: Float32Array
  private readonly dur: Float32Array
  private readonly sx: Float32Array
  private readonly sy: Float32Array
  private readonly tx: Float32Array
  private readonly ty: Float32Array
  private readonly startScale: Float32Array
  private readonly rvx: Float32Array
  private readonly rvy: Float32Array

  constructor(capacity: number) {
    this.holder = new Object3D()
    this.meshes = []
    this.mats = []
    this.active = []
    this.age = new Float32Array(capacity)
    this.dur = new Float32Array(capacity)
    this.sx = new Float32Array(capacity)
    this.sy = new Float32Array(capacity)
    this.tx = new Float32Array(capacity)
    this.ty = new Float32Array(capacity)
    this.startScale = new Float32Array(capacity)
    this.rvx = new Float32Array(capacity)
    this.rvy = new Float32Array(capacity)
    const geom = new TetrahedronGeometry(3, 0)
    for (let i = 0; i < capacity; i++) {
      const mat = new MeshPhongMaterial({ color: TEAL, shininess: 0, flatShading: true })
      const mesh = new Mesh(geom, mat)
      mesh.visible = false
      // Keep every shard in the scene so preload prepares its geometry and material before the first collision.
      this.holder.add(mesh)
      this.meshes.push(mesh)
      this.mats.push(mat)
      this.active.push(false)
    }
  }

  spawn(x: number, y: number, color: number, count: number, scale: number): void {
    let spawned = 0
    for (let i = 0; i < this.meshes.length && spawned < count; i++) {
      if (this.active[i]) continue
      this.active[i] = true
      spawned++
      const mesh = this.meshes[i]
      this.mats[i].color.setHex(color)
      mesh.visible = true
      mesh.position.set(x, y, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.scale.set(scale, scale, scale)
      this.age[i] = 0
      this.dur[i] = 0.6 + rng() * 0.2
      this.sx[i] = x
      this.sy[i] = y
      this.tx[i] = x + (-1 + rng() * 2) * 50
      this.ty[i] = y + (-1 + rng() * 2) * 50
      this.startScale[i] = scale
      this.rvx[i] = rng() * 12
      this.rvy[i] = rng() * 12
    }
  }

  update(dtMs: number): void {
    const dtSec = dtMs / 1000
    for (let i = 0; i < this.meshes.length; i++) {
      if (!this.active[i]) continue
      this.age[i] += dtSec
      const t = this.age[i] / this.dur[i]
      const mesh = this.meshes[i]
      if (t >= 1) {
        this.active[i] = false
        mesh.visible = false
        continue
      }
      const ease = 1 - (1 - t) * (1 - t)
      mesh.position.x = this.sx[i] + (this.tx[i] - this.sx[i]) * ease
      mesh.position.y = this.sy[i] + (this.ty[i] - this.sy[i]) * ease
      const s = this.startScale[i] + (0.1 - this.startScale[i]) * t
      mesh.scale.set(s, s, s)
      mesh.rotation.x = this.rvx[i] * t
      mesh.rotation.y = this.rvy[i] * t
    }
  }
}
