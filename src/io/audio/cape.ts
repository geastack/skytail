import cape1 from '../../sounds/cape-1.mp3'
import cape2 from '../../sounds/cape-2.mp3'
import cape3 from '../../sounds/cape-3.mp3'
import cape4 from '../../sounds/cape-4.mp3'
import cape5 from '../../sounds/cape-5.mp3'
import type { AudioEngine } from './engine'

const COOLDOWN_S = 0.35

export class CapeFlaps {
  private engine: AudioEngine | null = null
  private buffers: AudioBuffer[] = []
  private lastTime = -10

  load(engine: AudioEngine): void {
    this.engine = engine
    const clips = [cape1, cape2, cape3, cape4, cape5]
    const names = ['cape-1.mp3', 'cape-2.mp3', 'cape-3.mp3', 'cape-4.mp3', 'cape-5.mp3']
    for (let i = 0; i < clips.length; i++) {
      engine.loadBuffer(clips[i], (b) => this.buffers.push(b), names[i])
    }
  }

  play(): void {
    if (!this.engine || !this.engine.ctx || this.buffers.length === 0) return
    const now = this.engine.ctx.currentTime
    if (now - this.lastTime < COOLDOWN_S) return
    this.lastTime = now
    const i = Math.floor(Math.random() * this.buffers.length)
    this.engine.play(this.buffers[i], 0.5, 0.94 + Math.random() * 0.12)
  }
}
