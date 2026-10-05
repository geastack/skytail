//   Original tutorial & game © Karim Maaloul (@yakudoo), Codrops 2016:
//   https://tympanus.net/codrops/2016/04/26/the-aviator-animating-basic-3d-scene-threejs/
//   Source: https://github.com/yakudoo/TheAviator  (license: see README).
import { PCFShadowMap } from 'three/src/constants.js'
import type { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { Controls } from './io/input'
import { World } from './world/world'
import { Game } from './game/game'
import { preloadScene } from './lib/preload-scene'

export class Aviator {
  private readonly world: World
  private readonly game: Game
  private warmed = false

  constructor(pixelWidth: number, pixelHeight: number) {
    this.world = new World(pixelWidth, pixelHeight)
    this.game = new Game(this.world)
  }

  update(dtMs: number, controls: Controls): void {
    if (!this.warmed) return
    this.game.update(dtMs, controls)
  }

  /** Complete initial GPU work before the host starts its gameplay clock. */
  preload(renderer: WebGLRenderer): void {
    if (this.warmed) return
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFShadowMap
    this.world.plane.prepareRender(this.world.camera)
    preloadScene(renderer, this.world.scene, this.world.camera)
    // The perspective pass initializes the native renderer.
    // Restore HUD resource ownership after that pass, including the hidden score row.
    this.world.hud.primeRendererResources()
    preloadScene(renderer, this.world.hud.scene, this.world.hud.camera)
    this.warmed = true
  }

  resize(w: number, h: number, aspect: number): void {
    this.world.resize(w, h, aspect)
  }

  render(renderer: WebGLRenderer): void {
    // Hosts can render directly without an explicit preload call.
    this.preload(renderer)
    this.world.plane.prepareRender(this.world.camera)
    renderer.render(this.world.scene, this.world.camera)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.world.hud.scene, this.world.hud.camera)
    renderer.autoClear = true
  }
}

export function createAviator(pixelWidth: number, pixelHeight: number): Aviator {
  return new Aviator(pixelWidth, pixelHeight)
}
