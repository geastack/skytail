// A coin wave finishes before COIN_WAVES newer waves reuse its ring-buffer slot.
import { COIN_WAVES } from '../config'

export class CoinWaveTracker {
  private readonly spawned = new Int32Array(COIN_WAVES)
  private readonly resolved = new Int32Array(COIN_WAVES)
  private readonly missed = new Int32Array(COIN_WAVES)
  private seq = 0

  // Call record() after the spawned count is known.
  begin(): number {
    const id = this.seq++
    const s = id % COIN_WAVES
    this.spawned[s] = 0
    this.resolved[s] = 0
    this.missed[s] = 0
    return id
  }

  record(id: number, spawnedCount: number): void {
    this.spawned[id % COIN_WAVES] = spawnedCount
  }

  // Return true when the final coin resolves and the wave has no misses.
  resolve(id: number, wasMissed: boolean): boolean {
    const s = id % COIN_WAVES
    this.resolved[s] += 1
    if (wasMissed) this.missed[s] += 1
    return this.spawned[s] > 0 && this.resolved[s] >= this.spawned[s] && this.missed[s] === 0
  }
}
