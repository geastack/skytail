import { AudioEngine } from './engine'
import { EngineDrone } from './drone'
import { Music } from './music'
import { CoinChime } from './coin-chime'
import { CrashSounds } from './crash'
import { CapeFlaps } from './cape'

interface GestureTargetLike {
  addEventListener?: (type: string, handler: (event?: { code?: string }) => void) => void
}

export class Sound {
  private readonly engine = new AudioEngine()
  private readonly drone = new EngineDrone()
  private readonly music = new Music()
  private readonly coinChime = new CoinChime()
  private readonly crashes = new CrashSounds()
  private readonly capeFlaps = new CapeFlaps()

  // Register callbacks from bind(), after World stores Sound.
  // The native build copies Sound by value. Constructor callbacks would retain the temporary instance.
  private attachSounds(): void {
    this.engine.onReady(() => {
      this.drone.start(this.engine)
      this.music.start(this.engine)
      this.coinChime.load(this.engine)
      this.crashes.load(this.engine)
      this.capeFlaps.load(this.engine)
    })
  }

  bind(): void {
    const g = globalThis as unknown as {
      window?: GestureTargetLike
      AudioContext?: unknown
      webkitAudioContext?: unknown
    }
    // The native host creates the context synchronously without browser gesture events.
    // Attach sounds directly after ensure(). Native mute actions arrive through Controls and Game.
    if (!g.AudioContext && !g.webkitAudioContext) {
      this.engine.ensure()
      this.drone.start(this.engine)
      this.music.start(this.engine)
      this.coinChime.load(this.engine)
      this.crashes.load(this.engine)
      this.capeFlaps.load(this.engine)
      return
    }
    // Defer browser sound attachment until the first gesture creates the context.
    this.attachSounds()
    const target = g.window
    if (!target || !target.addEventListener) return
    const unlock = (): void => this.engine.ensure()
    target.addEventListener('pointerdown', unlock)
    target.addEventListener('mousedown', unlock)
    target.addEventListener('mousemove', unlock)
    target.addEventListener('keydown', (event) => {
      this.engine.ensure()
      if (event && event.code === 'KeyM') this.toggleMute()
    })
  }

  toggleMute(): void {
    this.engine.toggleMute()
  }

  toggleMusicMute(): void {
    this.music.toggleMute()
  }

  setEngine(distance: number, flying: boolean): void {
    this.engine.setDistance(distance)
    this.drone.setFlying(flying)
  }

  coin(): void {
    this.coinChime.play()
  }

  enemy(): void {
    this.crashes.hit()
  }

  death(): void {
    this.crashes.death()
  }

  cape(): void {
    this.capeFlaps.play()
  }
}
