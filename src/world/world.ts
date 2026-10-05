import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import type { AmbientLight } from 'three/src/lights/AmbientLight.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { Fog } from 'three/src/scenes/Fog.js'
import { Hud } from '../hud/hud'
import { Sound } from '../io/audio'
import { Hero } from '../actors/hero'
import { ParticleSystem } from '../actors/particles'
import { FlyerField } from '../actors/flyer-field'
import { addLights } from './lighting'
import { TerrainRing } from './terrain-ring'
import { Daylight } from './daylight'
import { SkyLayer } from './sky-layer'
import { WindTrails } from './wind-trails'
import { createRingWorldGenerator } from '../worldgen/generator';
import { makeSkyGradient } from '../lib/three-helpers'
import { rewardGeometry, hazardGeometry } from '../actors/flight-props'
import { SKY, REWARD_COLOR } from '../lib/palette'
import {
  DEFAULT_H,
  CAMERA_Z,
  FOG_FAR,
  FOG_NEAR,
  COIN_POOL_SIZE,
  ENEMY_POOL_SIZE,
  COIN_SPEED_MUL,
  COIN_COLLIDE_TOL,
  ENEMY_SPEED_MUL,
  ENEMY_COLLIDE_TOL,
} from '../config'

/** @gea-refcount */
export class World {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly hud: Hud
  readonly ambient: AmbientLight
  readonly daylight: Daylight
  readonly terrain: TerrainRing
  readonly skyLayer: SkyLayer
  readonly wind: WindTrails
  readonly plane: Hero
  readonly coins: FlyerField
  readonly enemies: FlyerField
  readonly particles: ParticleSystem
  readonly sound: Sound

  constructor(pixelWidth: number, pixelHeight: number) {
    this.scene = new Scene()
    const gradient = makeSkyGradient()
    const fog = new Fog(SKY, FOG_NEAR, FOG_FAR);
    this.scene.background = gradient
    this.scene.fog = fog

    this.camera = new PerspectiveCamera(50, pixelWidth / pixelHeight, 0.1, 10000)
    this.camera.position.set(0, DEFAULT_H, CAMERA_Z)

    this.hud = new Hud(pixelWidth, pixelHeight)

    const lights = addLights(this.scene)
    this.ambient = lights.ambient
    this.daylight = new Daylight(gradient, fog, lights.hemisphere, lights.ambient, lights.sun);

    this.terrain = new TerrainRing(this.scene, createRingWorldGenerator());
    this.skyLayer = new SkyLayer(this.scene, this.terrain.ring);
    this.wind = new WindTrails()
    this.scene.add(this.wind.holder)

    this.plane = new Hero()
    this.plane.mesh.position.set(0, DEFAULT_H, 0)
    this.scene.add(this.plane.mesh)

    const coinGeom = rewardGeometry()
    const enemyGeom = hazardGeometry()
    this.coins = new FlyerField(this.scene, coinGeom, REWARD_COLOR, false, COIN_POOL_SIZE, COIN_SPEED_MUL, COIN_COLLIDE_TOL, true)
    this.enemies = new FlyerField(this.scene, enemyGeom, 0xffffff, true, ENEMY_POOL_SIZE, ENEMY_SPEED_MUL, ENEMY_COLLIDE_TOL)

    this.particles = new ParticleSystem(120)
    this.scene.add(this.particles.holder)

    this.sound = new Sound()
    this.sound.bind()
  }

  resize(pixelWidth: number, pixelHeight: number, aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    this.hud.resize(pixelWidth, pixelHeight)
  }
}
