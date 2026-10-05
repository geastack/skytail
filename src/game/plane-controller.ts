import type { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { Euler } from 'three/src/math/Euler.js'
import { Vector3 } from 'three/src/math/Vector3.js'
import type { Hero } from '../actors/hero'
import { normalize } from '../lib/math'
import { DEFAULT_H, AMP_H, AMP_W, SPLASH_X, FLIP_DURATION } from '../config'

const FLIP_ANTICIPATE = 100 // The counter-roll duration uses milliseconds.
const FLIP_SETTLE = 150 // The settling duration uses milliseconds.
const FLIP_WINDUP = 0.12 // The counter-roll angle uses radians.
const FLIP_OVERSHOOT = 0.175 // The overshoot uses radians and is approximately 10 degrees.
const FLIP_WHIP_AT = FLIP_ANTICIPATE + 80

function flipAngle(elapsed: number): number {
  if (elapsed < FLIP_ANTICIPATE) return -FLIP_WINDUP * Math.sin((Math.PI * elapsed) / FLIP_ANTICIPATE)
  const roll = FLIP_DURATION - FLIP_ANTICIPATE - FLIP_SETTLE
  const spun = elapsed - FLIP_ANTICIPATE
  if (spun < roll) {
    const remaining = 1 - spun / roll
    return (Math.PI * 2 + FLIP_OVERSHOOT) * (1 - remaining * remaining * remaining)
  }
  const settle = (spun - roll) / FLIP_SETTLE
  return Math.PI * 2 + FLIP_OVERSHOOT * (1 - settle * settle * (3 - 2 * settle))
}

const PITCH_GAIN = 0.0008 * (1000 / 60) * 0.2 // Pitch gain converts game units per second to radians.
const SWING_TRAVEL = 0.9 // This is 45 percent of the full cursor range.
const SWING_WINDOW_MS = 250
const SWING_DEADBAND = 0.002

export class PlaneController {
  planeSpeed = 0 // This throttle factor controls game speed and engine sound.

  private readonly poseRotation = new Euler()
  private flipTime = 0 // The remaining flip duration uses milliseconds. Zero means no flip.
  private fallSpeed = 0.001
  private colSpeedX = 0
  private colSpeedY = 0
  private colDispX = 0
  private colDispY = 0

  private lastCy = 0
  private swingDir = 0 // Direction: +1 means up, -1 means down, and 0 means none.
  private swingTravel = 0
  private swingMs = 0
  private swingWhipped = false

  constructor(
    private readonly plane: Hero,
    private readonly camera: PerspectiveCamera,
    // Report a cape whip during a barrel roll or sharp vertical movement.
    private readonly onCapeWhip: () => void,
  ) {}

  get isFlipping(): boolean {
    return this.flipTime > 0
  }

  flip(): void {
    if (this.flipTime <= 0) this.flipTime = FLIP_DURATION
  }

  knockback(dx: number, dy: number, d: number): void {
    if (d > 0) {
      this.colSpeedX = (100 * dx) / d
      this.colSpeedY = (100 * dy) / d
    }
  }

  reset(): void {
    this.flipTime = 0
    this.fallSpeed = 0.001
    this.colSpeedX = 0
    this.colSpeedY = 0
    this.colDispX = 0
    this.colDispY = 0
    this.lastCy = 0
    this.swingDir = 0
    this.swingTravel = 0
    this.swingMs = 0
    this.swingWhipped = false
    this.plane.mesh.position.set(SPLASH_X, DEFAULT_H, 0)
    this.poseRotation.set(0, 0, 0)
    this.plane.mesh.setRotationFromEuler(this.poseRotation)
    this.plane.reset()
  }

  fly(dt: number, cx: number, cy: number, relativeCursor = false): void {
    if (dt <= 0) return
    this.planeSpeed = normalize(cx, -0.5, 0.5, 1.2, 1.6)

    let targetY = normalize(cy, -1, 1, DEFAULT_H - AMP_H, DEFAULT_H + AMP_H)
    let targetX = normalize(cx, -1, 1, -AMP_W * 0.7, -AMP_W)

    this.colDispX += this.colSpeedX
    targetX += this.colDispX
    this.colDispY += this.colSpeedY
    targetY += this.colDispY

    const p = this.plane.mesh
    const position: Vector3 = p.position
    const cameraPosition: Vector3 = this.camera.position
    // Relative cursor input already follows a continuous path. Another position filter adds latency and drift after release.
    const response = 1 - Math.exp(-dt / 80)
    const previousY = position.y
    const follow = relativeCursor ? 1 : response
    position.y += (targetY - position.y) * follow
    position.x += (targetX - position.x) * follow

    const verticalSpeed = (position.y - previousY) * 1000 / dt
    this.trackSwing(dt, cy)
    const motionScale = this.plane.reducedMotion ? 0.25 : 1
    const pitch = Math.atan(verticalSpeed * PITCH_GAIN) * motionScale
    // Relative cursor input needs pitch smoothing to prevent an abrupt return to level after stick release.
    const pitchFollow = relativeCursor ? 1 - Math.exp(-dt / 80) : 1
    this.poseRotation.z += (pitch - this.poseRotation.z) * pitchFollow
    this.poseRotation.x += (-pitch * 0.5 - this.poseRotation.x) * pitchFollow

    if (this.flipTime > 0) {
      const before = FLIP_DURATION - this.flipTime
      this.flipTime -= dt
      if (this.flipTime < 0) this.flipTime = 0

      if (before < FLIP_WHIP_AT && FLIP_DURATION - this.flipTime >= FLIP_WHIP_AT) this.onCapeWhip()
      // Reset the roll angle to zero after completion. Easing from 2*PI would reverse the completed roll.
      this.poseRotation.x = this.flipTime > 0 && !this.plane.reducedMotion ? flipAngle(FLIP_DURATION - this.flipTime) : 0
    }
    p.setRotationFromEuler(this.poseRotation)

    cameraPosition.y += (position.y - cameraPosition.y) * dt * 0.002
    this.camera.fov = normalize(cx, -1, 1, 45, 62)
    this.camera.updateProjectionMatrix()

    this.colSpeedX += (0 - this.colSpeedX) * dt * 0.03
    this.colDispX += (0 - this.colDispX) * dt * 0.01
    this.colSpeedY += (0 - this.colSpeedY) * dt * 0.03
    this.colDispY += (0 - this.colDispY) * dt * 0.01
  }

  // Idle frames advance the swing clock so slow movement cannot trigger a cape whip.
  private trackSwing(dt: number, cy: number): void {
    const dy = cy - this.lastCy
    this.lastCy = cy
    const dir = dy > SWING_DEADBAND ? 1 : dy < -SWING_DEADBAND ? -1 : 0
    if (dir !== 0 && dir !== this.swingDir) {
      this.swingDir = dir
      this.swingTravel = 0
      this.swingMs = 0
      this.swingWhipped = false
    }
    this.swingTravel += Math.abs(dy)
    this.swingMs += dt
    if (!this.swingWhipped && this.swingMs <= SWING_WINDOW_MS && this.swingTravel >= SWING_TRAVEL) {
      this.swingWhipped = true
      this.onCapeWhip()
    }
  }

  // Return true after the hero falls below the world, so Game can show the replay screen.
  crash(dt: number): boolean {
    const p = this.plane.mesh
    const position: Vector3 = p.position
    this.poseRotation.z += (-Math.PI / 2 - this.poseRotation.z) * 0.0002 * dt
    this.poseRotation.x += 0.0003 * dt
    p.setRotationFromEuler(this.poseRotation)
    this.fallSpeed *= 1.05
    position.y -= this.fallSpeed * dt
    return position.y < -200
  }

  splash(dt: number, clock: number): void {
    this.planeSpeed = 1.4
    const p = this.plane.mesh
    const position: Vector3 = p.position
    const cameraPosition: Vector3 = this.camera.position
    const amplitude = this.plane.reducedMotion ? 4 : 18
    const ty = DEFAULT_H + Math.sin(clock * 0.0016) * amplitude
    const follow = 1 - Math.exp(-dt * 0.006)
    position.x += (SPLASH_X - position.x) * follow
    position.y += (ty - position.y) * follow
    // Pitch leads the vertical bobbing motion.
    const pitch = Math.atan2(Math.cos(clock * 0.0016) * amplitude * 1.6, 120)
    this.poseRotation.z += (pitch - this.poseRotation.z) * (1 - Math.exp(-dt / 80))
    this.poseRotation.x = 0
    p.setRotationFromEuler(this.poseRotation)
    cameraPosition.y += (position.y - cameraPosition.y) * dt * 0.002
    this.camera.fov = 60
    this.camera.updateProjectionMatrix()
  }
}
