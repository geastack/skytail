import { DoubleSide, DynamicDrawUsage } from 'three/src/constants.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { Object3D } from 'three/src/core/Object3D.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Vector3 } from 'three/src/math/Vector3.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { rand4 } from '../worldgen/hash'

export const WIND_LIFETIME = 4 // The tip lifetime uses seconds.
export const WIND_TAIL_TIME = 0.6 // The tail duration uses seconds.
export const WIND_COUNT = 7
const SEGMENTS = 48
const CURL_START = 1.25
const CURL_DURATION = 0.85
const CURL_DRIFT = 14
const TRAVEL = 360
const CURL_SPEED = (TRAVEL - CURL_DRIFT) / (WIND_LIFETIME - CURL_DURATION)
const CURL_RADIUS = (CURL_SPEED * CURL_DURATION - CURL_DRIFT) / (2 * Math.PI)
const WIND_SEED = 0x57494e44

/** age uses seconds. Write the tip position into out in game units. */
export function sampleWindPath(age: number, looping: boolean, out: Vector3): void {
  const t = Math.max(0, Math.min(WIND_LIFETIME, age))
  let x = TRAVEL / 2 - t * TRAVEL / WIND_LIFETIME
  let y = 2.5 * Math.sin(t * Math.PI * 0.8)
  if (looping) {
    if (t < CURL_START) {
      x = TRAVEL / 2 - CURL_SPEED * t
      y = 0
    } else if (t <= CURL_START + CURL_DURATION) {
      const u = (t - CURL_START) / CURL_DURATION
      const angle = u * Math.PI * 2
      x = TRAVEL / 2 - CURL_SPEED * CURL_START - CURL_DRIFT * u - CURL_RADIUS * Math.sin(angle)
      y = CURL_RADIUS * 0.85 * (1 - Math.cos(angle))
    } else {
      const after = t - CURL_START - CURL_DURATION
      x = TRAVEL / 2 - CURL_SPEED * CURL_START - CURL_DRIFT - CURL_SPEED * after
      // Zero initial slope preserves the tangent as the path leaves the circle.
      y = 2 * (1 - Math.cos(after * Math.PI * 1.2))
    }
  }
  out.set(x, y, 0)
}

/** Each trail has three vertices across its width to fade both edges. */
export class WindTrail {
  readonly mesh: Mesh
  readonly material: MeshBasicMaterial
  private readonly positions: Float32Array
  private readonly positionAttribute: BufferAttribute
  private readonly point = new Vector3()
  private readonly before = new Vector3()
  private readonly after = new Vector3()

  constructor() {
    const vertices = (SEGMENTS + 1) * 3
    this.positions = new Float32Array(vertices * 3)
    const colors = new Float32Array(vertices * 4)
    const indices = new Uint16Array(SEGMENTS * 12)
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS
      const alpha = Math.pow(Math.sin(Math.PI * u), 0.45)
      for (let j = 0; j < 3; j++) {
        const c = (i * 3 + j) * 4
        colors[c] = 1
        colors[c + 1] = 1
        colors[c + 2] = 1
        colors[c + 3] = j === 1 ? alpha : 0
      }
      if (i === SEGMENTS) continue
      for (let j = 0; j < 2; j++) {
        const a = i * 3 + j
        const k = i * 12 + j * 6
        indices[k] = a
        indices[k + 1] = a + 3
        indices[k + 2] = a + 1
        indices[k + 3] = a + 1
        indices[k + 4] = a + 3
        indices[k + 5] = a + 4
      }
    }
    const geometry = new BufferGeometry()
    this.positionAttribute = new BufferAttribute(this.positions, 3)
    this.positionAttribute.setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', this.positionAttribute)
    geometry.setAttribute('color', new BufferAttribute(colors, 4))
    geometry.setIndex(new BufferAttribute(indices, 1))
    this.material = new MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0,
      side: DoubleSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    })
    this.mesh = new Mesh(geometry, this.material)
    this.mesh.name = 'wind-trail'
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  /** Sample the trail's past positions analytically so its shape does not depend on frame rate. age uses seconds. */
  draw(age: number, looping: boolean, opacity: number): void {
    const fade = Math.max(0, Math.min(1, age / 0.25, (WIND_LIFETIME - age) / 0.5))
    this.mesh.visible = fade > 0 && opacity > 0
    this.material.opacity = opacity * fade
    if (!this.mesh.visible) return
    const tail = Math.max(0, age - WIND_TAIL_TIME)
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS
      const t = tail + (age - tail) * u
      sampleWindPath(t, looping, this.point)
      sampleWindPath(t - 0.002, looping, this.before)
      sampleWindPath(t + 0.002, looping, this.after)
      const dx = this.after.x - this.before.x
      const dy = this.after.y - this.before.y
      const length = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy))
      const halfWidth = 0.65 * Math.pow(Math.sin(Math.PI * u), 0.7)
      for (let j = 0; j < 3; j++) {
        const width = (j - 1) * halfWidth
        const p = (i * 3 + j) * 3
        this.positions[p] = this.point.x - dy / length * width
        this.positions[p + 1] = this.point.y + dx / length * width
        this.positions[p + 2] = 0
      }
    }
    this.positionAttribute.needsUpdate = true
  }
}

export class WindTrails {
  readonly holder = new Object3D()
  private readonly trails: WindTrail[] = []
  private readonly ages: number[] = []
  private readonly generations: number[] = []
  private readonly periods: number[] = []
  private reduced = false

  constructor() {
    this.holder.name = 'wind-trails'
    for (let i = 0; i < WIND_COUNT; i++) {
      const trail = new WindTrail()
      this.trails.push(trail)
      this.holder.add(trail.mesh)
      this.periods.push(6.4 + i * 0.17)
      this.ages.push(i * 0.83)
      this.generations.push(0)
      this.place(i, 100)
    }
    this.update(0, 100, 0, false)
  }

  update(dtMs: number, cameraY: number, night: number, reducedMotion: boolean): void {
    if (reducedMotion !== this.reduced) {
      this.reduced = reducedMotion
      // Reset trail ages before changing paths to prevent an abrupt change in visible curls.
      for (let i = 0; i < WIND_COUNT; i++) this.ages[i] = -i * 0.9
    }
    const dt = Math.max(0, dtMs) * 0.001 * (this.reduced ? 0.3 : 1)
    for (let i = 0; i < WIND_COUNT; i++) {
      this.ages[i] += dt
      while (this.ages[i] >= this.periods[i]) {
        this.ages[i] -= this.periods[i]
        this.generations[i] += 1
        this.place(i, cameraY)
      }
      const looping = !this.reduced && (i + this.generations[i]) % 2 === 0
      const depthFade = 1 - i * 0.035
      const opacity = (0.65 - Math.max(0, Math.min(1, night)) * 0.15) * depthFade
      this.trails[i].draw(this.ages[i], looping, this.reduced ? (i < 3 ? opacity * 0.65 : 0) : opacity)
    }
  }

  private place(slot: number, cameraY: number): void {
    const generation = this.generations[slot]
    const mesh = this.trails[slot].mesh
    const jitter = rand4(WIND_SEED, slot, generation, 1)
    mesh.position.set(
      (rand4(WIND_SEED, slot, generation, 2) - 0.5) * 230,
      Math.max(70, cameraY - 25 + slot * 24 + jitter * 25),
      -70 - rand4(WIND_SEED, slot, generation, 3) * 160,
    )
    mesh.scale.setScalar(0.8 + rand4(WIND_SEED, slot, generation, 4) * 0.35)
    mesh.rotation.z = (jitter - 0.5) * 0.1
  }
}
