import { BackSide, DoubleSide, FrontSide } from 'three/src/constants.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { MeshDepthMaterial } from 'three/src/materials/MeshDepthMaterial.js'
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { rng } from '../lib/rng'
import { REWARD_OUTLINE } from '../lib/palette'

export class Flyer {
  readonly mesh: Mesh
  private readonly outlineMaterial: MeshBasicMaterial | undefined
  angle = 0
  distance = 0
  active = false
  wave = -1 // Coin wave ID. Enemies use -1.

  // Vertex colours multiply the material colour. Pass white to preserve the asset kit colours.
  constructor(geom: BufferGeometry, color: number, vertexColors: boolean, outlined = false) {
    const material = new MeshPhongMaterial({
      color,
      vertexColors,
      side: vertexColors ? DoubleSide : FrontSide,
      shininess: 0,
      specular: 0xffffff,
      flatShading: !vertexColors,
      // Emission keeps collectibles visible at night while lighting still shapes their facets.
      emissive: outlined ? color : 0x000000,
      emissiveIntensity: .25,
    })
    this.mesh = new Mesh(geom, material)
    this.mesh.castShadow = true
    // Three.js can retain the preceding shadow caster's program when only the material side changes.
    // A separate depth material lets preload prepare both shadow variants.
    this.mesh.customDepthMaterial = new MeshDepthMaterial()
    this.mesh.visible = false
    if (outlined) {
      this.outlineMaterial = new MeshBasicMaterial({ color: REWARD_OUTLINE, side: BackSide })
      const shell = new Mesh(geom, this.outlineMaterial)
      shell.name = 'Reward outline'
      shell.scale.setScalar(1.12)
      this.mesh.add(shell)
      this.setNight(0)
    }
  }

  setBorderColor(color: number): void {
    this.outlineMaterial?.color.setHex(color)
  }

  setNight(night: number, enabled = true): void {
    if (!this.outlineMaterial) return
    const t = Math.max(0, Math.min(1, night))
    const fade = enabled ? t * t * (3 - 2 * t) : 0
    ;(this.mesh.material as MeshPhongMaterial).emissiveIntensity = enabled ? .3 + .35 * fade : .25
  }

  spin(dt: number): void {
    if (dt <= 0) return
    const frameScale = dt * 60 / 1000
    this.mesh.rotation.z += rng() * 0.1 * frameScale
    this.mesh.rotation.y += rng() * 0.1 * frameScale
  }
}
