// WAV avoids MP3 encoder padding clicks at the loop boundary.
// The source runs continuously at constant pitch. Audio gain silences it when the hero stops flying.
import droneUrl from '../../sounds/drone.wav'
import type { AudioEngine } from './engine'

export class EngineDrone {
  private engine: AudioEngine | null = null
  private gain: GainNode | null = null

  start(engine: AudioEngine): void {
    if (this.gain || !engine.ctx || !engine.master) return
    this.engine = engine
    const ctx = engine.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(engine.master)
    this.gain = gain
    engine.loadBuffer(
      droneUrl,
      (buffer) => {
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.loop = true
        src.connect(gain)
        src.start()
      },
      'drone.wav',
    )
  }

  setFlying(flying: boolean): void {
    if (!this.engine || !this.engine.ctx || !this.gain) return
    const t = this.engine.ctx.currentTime
    const target = flying ? 0.16 * this.engine.proximity : 0
    this.gain.gain.setValueAtTime(this.gain.gain.value, t)
    this.gain.gain.linearRampToValueAtTime(target, t + 0.1)
  }
}
