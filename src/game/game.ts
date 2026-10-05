import { Controls, Edge } from '../io/input'
import { Flyer } from '../actors/flyer'
import type { FlyerHitHandler, FlyerMissHandler } from '../actors/flyer-field'
import type { World } from '../world/world'
import { PlaneController } from './plane-controller'
import { CoinWaveTracker } from './coin-waves'
import { Progression, type SpawnCoinWave, type SpawnEnemyWave } from './progression'
import { HudDirector } from '../hud/hud-director'
import { rng } from '../lib/rng'
import { hash4 } from '../worldgen/hash'
import { BROWN_DARK, REWARD_COLOR } from '../lib/palette'
import { DIST_FOR_LEVEL, AMBIENT_FLASH, SPLASH_ROT, SPLASH_SEED } from '../config'

const PLAYING = 0
const CRASHING = 1
const REPLAY = 2
const SPLASH = 3

// This salt separates run seeds from other hash streams.
const SALT_RUN = 0x52554e00;

/** @gea-refcount */
export class Game {
  // The run counter determines this seed. The splash uses SPLASH_SEED.
  runSeed = SPLASH_SEED;

  private status = SPLASH
  private energy = 100
  private distance = 0
  private speed = 0
  private clock = 0 // The splash clock uses milliseconds.
  private runCounter = 0;

  private readonly planeCtl: PlaneController
  private readonly waves = new CoinWaveTracker()
  private readonly progression = new Progression()
  private readonly hudDirector: HudDirector

  private readonly actionEdge = new Edge()
  private readonly backEdge = new Edge()
  private readonly flipEdge = new Edge()
  private readonly muteEdge = new Edge()
  private readonly muteMusicEdge = new Edge()

  // Native callbacks use fixed argument counts.
  // Keep every FlyerHitHandler and FlyerMissHandler parameter, including unused parameters.
  private readonly onCoinHit: FlyerHitHandler = (f, x, y, _dx, _dy, _d): void => this.collectCoin(f, x, y)
  private readonly onCoinMiss: FlyerMissHandler = (f): void => this.resolveWave(f, true)
  private readonly onEnemyHit: FlyerHitHandler = (f, x, y, dx, dy, d): void => this.hitEnemy(x, y, dx, dy, d)
  private readonly onEnemyMiss: FlyerMissHandler = (_f): void => {}

  private readonly onCapeWhip = (): void => this.world.sound.cape()
  // An object containing these callbacks widens to gea_cpp_value in a native class field.
  // Separate callbacks avoid rebuilding a typed record each frame.
  private readonly spawnCoinWave: SpawnCoinWave = (): void => {
    const id = this.waves.begin()
    this.waves.record(id, this.world.coins.spawnCoins(1 + Math.floor(rng() * 10), id))
  }
  private readonly spawnEnemyWave: SpawnEnemyWave = (level: number): void => {
    this.world.enemies.spawnEnemies(level)
  }

  constructor(private readonly world: World) {
    this.planeCtl = new PlaneController(world.plane, world.camera, this.onCapeWhip)
    this.hudDirector = new HudDirector(world.hud)
  }

  update(dtMs: number, controls: Controls): void {
    const dt = Math.min(dtMs, 60)
    this.clock += dt

    controls.poll(dt)
    this.handleInput(controls)

    if (this.status === PLAYING) this.updatePlaying(dt, controls)
    else if (this.status === CRASHING) this.updateCrashing(dt)
    else if (this.status === SPLASH) this.updateSplash(dt)

    this.updateEnvironment(dt)

    this.hudDirector.update(dtMs, dt, {
      distance: this.distance,
      energy: this.energy / 100,
      level: this.progression.level,
      levelProgress: (this.distance % DIST_FOR_LEVEL) / DIST_FOR_LEVEL,
      splash: this.status === SPLASH,
      dead: this.status === CRASHING || this.status === REPLAY,
      replay: this.status === REPLAY,
      reducedMotion: this.world.plane.reducedMotion,
    })
  }

  private handleInput(controls: Controls): void {
    if (this.actionEdge.rising(controls.action) && (this.status === REPLAY || this.status === SPLASH)) this.reset(PLAYING)

    if (this.backEdge.rising(controls.back) && this.status !== SPLASH) this.reset(SPLASH)

    if (this.flipEdge.rising(controls.flip) && this.status === PLAYING) this.planeCtl.flip()

    if (this.muteEdge.rising(controls.mute)) this.world.sound.toggleMute()

    if (this.muteMusicEdge.rising(controls.muteMusic)) this.world.sound.toggleMusicMute()
  }

  private updatePlaying(dt: number, controls: Controls): void {
    const w = this.world
    this.progression.schedule(this.distance, dt, this.spawnCoinWave, this.spawnEnemyWave)

    this.planeCtl.fly(dt, controls.x, controls.y, controls.relativeCursor)
    this.distance += this.speed * dt * 50
    this.energy = Math.max(0, this.energy - this.speed * dt * 3)

    const px = w.plane.mesh.position.x
    const py = w.plane.mesh.position.y
    w.coins.update(dt, this.speed, px, py, this.onCoinHit, this.onCoinMiss)
    w.enemies.update(dt, this.speed, px, py, this.onEnemyHit, this.onEnemyMiss)

    this.speed = this.progression.easedBaseSpeed(dt) * this.planeCtl.planeSpeed
    if (this.energy < 1) {
      this.status = CRASHING
      w.coins.reset()
      w.enemies.reset()
      w.sound.death()
    }
  }

  private updateCrashing(dt: number): void {
    this.speed *= 0.99
    if (this.planeCtl.crash(dt)) this.status = REPLAY
  }

  private updateSplash(dt: number): void {
    this.planeCtl.splash(dt, this.clock)
  }

  private updateEnvironment(dt: number): void {
    const w = this.world
    // Zero flight distance holds the daylight target at dawn on the splash. A reset eases daylight toward dawn.
    w.daylight.update(this.distance, dt);
    w.coins.setNight(w.daylight.night)
    w.ambient.intensity += (w.daylight.ambientRest - w.ambient.intensity) * dt * 0.005

    const rotSpeed = this.status === SPLASH ? SPLASH_ROT : this.speed
    w.terrain.update(rotSpeed * dt, dt, w.daylight.night);
    w.skyLayer.update(dt, w.daylight.dayPhase, w.daylight.night);
    w.wind.update(dt, w.camera.position.y, w.daylight.night, w.plane.reducedMotion)
    w.particles.update(dt)

    w.plane.update(dt, this.planeCtl.planeSpeed, (this.status === CRASHING || this.status === REPLAY), w.plane.mesh.rotation.z)

    // Scale camera distance by the field of view for engine attenuation.
    const edx = w.plane.mesh.position.x - w.camera.position.x
    const edy = w.plane.mesh.position.y - w.camera.position.y
    const edz = w.plane.mesh.position.z - w.camera.position.z
    const eucd = Math.sqrt(edx * edx + edy * edy + edz * edz)

    w.sound.setEngine(eucd * (w.camera.fov / 55), this.status === PLAYING || this.status === SPLASH)
  }

  private collectCoin(f: Flyer, x: number, y: number): void {
    this.energy = Math.min(100, this.energy + 3)
    this.world.particles.spawn(x, y, REWARD_COLOR, 5, 0.8)
    this.world.sound.coin()
    this.resolveWave(f, false)
  }

  private hitEnemy(x: number, y: number, dx: number, dy: number, d: number): void {
    this.energy = Math.max(0, this.energy - 10)
    this.world.ambient.intensity = AMBIENT_FLASH

    this.world.particles.spawn(x, y, BROWN_DARK, 7, 3.2)
    this.world.particles.spawn(x, y, 0xee4131, 6, 2.4)
    this.world.particles.spawn(x, y, 0xffb80e, 3, 1.4)
    this.world.sound.enemy()
    this.planeCtl.knockback(dx, dy, d)
    this.world.plane.hit()
  }

  private resolveWave(f: Flyer, missed: boolean): void {
    if (f.wave < 0) return
    if (this.waves.resolve(f.wave, missed)) this.planeCtl.flip()
    f.wave = -1
  }

  private reset(toStatus: number): void {
    this.energy = 100
    this.distance = 0
    this.speed = 0
    this.status = toStatus
    this.progression.reset()
    this.planeCtl.reset()
    this.world.coins.reset()
    this.world.enemies.reset()
    if (toStatus === PLAYING) {
      this.runCounter += 1;
      this.runSeed = hash4(SPLASH_SEED, this.runCounter, 0, SALT_RUN);
    } else {
      this.runSeed = SPLASH_SEED;
    }
    // Preserve current terrain. Blend the new seed at a stretch boundary that has no generated content.
    this.world.terrain.transitionEpoch(this.runSeed);
  }
}
