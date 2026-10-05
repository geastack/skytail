// Music uses a fixed 5 kHz filter and reaches the master mute bus without the distance filter.
// Its separate mute leaves sound effects unchanged.
import songUrl from '../../sounds/song.mp3'
import type { AudioEngine } from './engine'

const SONG_VOLUME = 0.05

export class Music {
  private engine: AudioEngine | null = null
  private gain: GainNode | null = null
  private muted = false

  start(engine: AudioEngine): void {
    if (this.engine) return
    this.engine = engine
    engine.loadBuffer(
      songUrl,
      (buffer) => {
        const ctx = engine.ctx
        const muteBus = engine.muteBus
        if (!ctx || !muteBus || this.gain) return
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.loop = true
        const gain = ctx.createGain()
        gain.gain.value = this.muted ? 0 : SONG_VOLUME
        this.gain = gain
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 5000
        filter.Q.value = 0.7
        src.connect(gain)
        gain.connect(filter)
        filter.connect(muteBus)
        src.start()
      },
      'song.mp3',
    )
  }

  // Retain mute state even before the music decodes.
  toggleMute(): void {
    this.muted = !this.muted
    if (this.gain && this.engine && this.engine.ctx) {
      this.gain.gain.setValueAtTime(this.muted ? 0 : SONG_VOLUME, this.engine.ctx.currentTime)
    }
  }
}
