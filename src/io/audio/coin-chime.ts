import coinUrl from '../../sounds/coin.mp3'
import type { AudioEngine } from './engine'

export class CoinChime {
  private engine: AudioEngine | null = null
  private buffer: AudioBuffer | null = null
  private combo = 0
  private lastTime = -10

  load(engine: AudioEngine): void {
    this.engine = engine
    engine.loadBuffer(
      coinUrl,
      (b) => {
        this.buffer = b
      },
      'coin.mp3',
    )
  }

  play(): void {
    if (!this.engine || !this.engine.ctx || !this.buffer) return
    const now = this.engine.ctx.currentTime
    if (now - this.lastTime > 1.0) this.combo = 0
    else this.combo++
    this.lastTime = now
    const combo = this.combo > 12 ? 12 : this.combo
    this.engine.play(this.buffer, 0.7, 1 + combo * 0.05)
  }
}
