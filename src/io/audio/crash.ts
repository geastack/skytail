import crash1 from '../../sounds/crash-1.mp3'
import crash2 from '../../sounds/crash-2.mp3'
import crash3 from '../../sounds/crash-3.mp3'
import crash4 from '../../sounds/crash-4.mp3'
import crashEndUrl from '../../sounds/crash-end.mp3'
import type { AudioEngine } from './engine'

export class CrashSounds {
  private engine: AudioEngine | null = null
  private buffers: AudioBuffer[] = []
  private endBuffer: AudioBuffer | null = null

  load(engine: AudioEngine): void {
    this.engine = engine
    const crashes = [crash1, crash2, crash3, crash4]
    const crashNames = ['crash-1.mp3', 'crash-2.mp3', 'crash-3.mp3', 'crash-4.mp3']
    for (let i = 0; i < crashes.length; i++) {
      engine.loadBuffer(crashes[i], (b) => this.buffers.push(b), crashNames[i])
    }
    engine.loadBuffer(
      crashEndUrl,
      (b) => {
        this.endBuffer = b
      },
      'crash-end.mp3',
    )
  }

  hit(): void {
    if (!this.engine) return
    if (this.buffers.length > 0) {
      const i = Math.floor(Math.random() * this.buffers.length)
      this.engine.play(this.buffers[i], 0.9, 0.94 + Math.random() * 0.12)
      return
    }
    this.synthFallback()
  }

  // crash-end is about 16 LU louder than the hit clips (-2.8 LUFS versus -19 LUFS).
  // An audio gain of 0.25 places it about 5 dB above a hit.
  death(): void {
    if (this.engine && this.endBuffer) this.engine.play(this.endBuffer, 0.25)
  }

  // Use synthesized noise and a falling sawtooth until the impact clips decode.
  private synthFallback(): void {
    if (!this.engine || !this.engine.ctx || !this.engine.master) return
    const ctx = this.engine.ctx
    const master = this.engine.master
    const t = ctx.currentTime

    const len = Math.floor(ctx.sampleRate * 0.3)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const nFilter = ctx.createBiquadFilter()
    nFilter.type = 'lowpass'
    nFilter.frequency.setValueAtTime(2200, t)
    nFilter.frequency.exponentialRampToValueAtTime(200, t + 0.25)
    const nGain = ctx.createGain()
    nGain.gain.setValueAtTime(0.5, t)
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    noise.connect(nFilter)
    nFilter.connect(nGain)
    nGain.connect(master)
    noise.start(t)
    noise.stop(t + 0.32)

    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const oGain = ctx.createGain()
    osc.connect(oGain)
    oGain.connect(master)
    osc.frequency.setValueAtTime(200, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25)
    oGain.gain.setValueAtTime(0.3, t)
    oGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    osc.start(t)
    osc.stop(t + 0.32)
  }
}
