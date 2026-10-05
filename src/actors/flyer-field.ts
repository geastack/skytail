import type { Scene } from 'three/src/scenes/Scene.js'
import type { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { Flyer } from './flyer'
import { rand, rng } from '../lib/rng'
import { DEFAULT_H, AMP_H, SEA_RADIUS } from '../config'

// x and y locate the flyer. dx and dy point from the flyer to the hero. d is their distance.
export type FlyerHitHandler = (f: Flyer, x: number, y: number, dx: number, dy: number, d: number) => void
export type FlyerMissHandler = (f: Flyer) => void

export class FlyerField {
  private readonly pool: Flyer[] = []

  constructor(
    private readonly scene: Scene,
    private readonly geom: BufferGeometry,
    private readonly color: number,
    private readonly vertexColors: boolean,
    poolSize: number,
    private readonly speedMul: number, // Orbit speed is relative to game speed.
    private readonly tolerance: number, // Collision distance uses game units.
    private readonly outlined = false,
  ) {
    for (let i = 0; i < poolSize; i++) {
      this.addFlyer()
    }
  }

  // Keep inactive flyers in the scene so preload prepares their geometry and shadow programs before the first spawn.
  private addFlyer(): Flyer {
    const f = new Flyer(this.geom, this.color, this.vertexColors, this.outlined)
    this.pool.push(f)
    this.scene.add(f.mesh)
    return f
  }

  private acquire(): Flyer {
    for (let i = 0; i < this.pool.length; i++) {
      const f = this.pool[i]
      if (!f.active) return f
    }
    return this.addFlyer()
  }

  private activate(f: Flyer, wave: number, angle: number, distance: number): void {
    f.active = true
    f.mesh.visible = true
    f.wave = wave
    f.angle = angle
    f.distance = distance
    f.mesh.position.set(Math.cos(angle) * distance, -SEA_RADIUS + Math.sin(angle) * distance, 0)
  }

  spawnCoins(count: number, wave: number): number {
    const base = SEA_RADIUS + DEFAULT_H + rand(-1, 1) * (AMP_H - 20)
    const amplitude = 10 + Math.round(rng() * 10)
    for (let i = 0; i < count; i++) {
      const f = this.acquire()
      this.activate(f, wave, -(i * 0.02), base + Math.cos(i * 0.5) * amplitude)
    }
    return count
  }

  spawnEnemies(count: number): number {
    for (let i = 0; i < count; i++) {
      const f = this.acquire()
      const distance = SEA_RADIUS + DEFAULT_H + rand(-1, 1) * (AMP_H - 20)
      this.activate(f, -1, -(i * 0.1), distance)
    }
    return count
  }

  update(dt: number, speed: number, planeX: number, planeY: number, onHit: FlyerHitHandler, onMiss: FlyerMissHandler): void {
    for (let i = 0; i < this.pool.length; i++) {
      const f = this.pool[i]
      if (!f.active) continue
      f.angle += speed * dt * this.speedMul
      if (f.angle > Math.PI * 2) f.angle -= Math.PI * 2
      const x = Math.cos(f.angle) * f.distance
      const y = -SEA_RADIUS + Math.sin(f.angle) * f.distance
      f.mesh.position.set(x, y, 0)
      f.spin(dt)
      const dx = planeX - x
      const dy = planeY - y
      const d = Math.sqrt(dx * dx + dy * dy)

      if (d < this.tolerance) {
        f.active = false
        f.mesh.visible = false
        onHit(f, x, y, dx, dy, d)
      } else if (f.angle > Math.PI) {
        f.active = false
        f.mesh.visible = false
        onMiss(f)
      }
    }
  }

  // Update inactive flyers so the next wave uses the current night brightness.
  setNight(night: number, enabled = true): void {
    for (const flyer of this.pool) flyer.setNight(night, enabled)
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const f = this.pool[i]
      f.active = false
      f.mesh.visible = false
      f.wave = -1
    }
  }
}
