import { createNativeAudioContext, nativeAudioBufferForFile } from '@geastack/native-webgl-angle/nativeAudioHost'

// The native host implements the Web Audio API through native classes.
export class AudioEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  muteBus: GainNode | null = null
  proximity = 1 // Distance factor from 0.4 to 1, shared by sound effects.
  private masterFilter: BiquadFilterNode | null = null
  private muted = false
  private readyListeners: Array<() => void> = []

  // Call the listener when the context and buses exist, immediately if they already exist.
  onReady(listener: () => void): void {
    if (this.ctx) listener()
    else this.readyListeners.push(listener)
  }

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume()
      return
    }
    const g = globalThis as unknown as {
      AudioContext?: { new (): AudioContext }
      webkitAudioContext?: { new (): AudioContext }
    }
    const Ctor = g.AudioContext || g.webkitAudioContext
    // Use the browser context when available. The native host returns its own AudioContext implementation.
    // The cast bridges the browser types.
    const ctx: AudioContext | null = Ctor ? new Ctor() : (createNativeAudioContext() as unknown as AudioContext | null)
    if (!ctx) return
    this.ctx = ctx

    const muteBus = ctx.createGain()
    muteBus.gain.value = this.muted ? 0 : 1
    muteBus.connect(ctx.destination)
    this.muteBus = muteBus

    // Sound effects use the distance filter. Music reaches muteBus through its own fixed filter.
    const master = ctx.createGain()
    master.gain.value = 0.6
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 20000
    filter.Q.value = 0.7
    master.connect(filter)
    filter.connect(muteBus)
    this.master = master
    this.masterFilter = filter

    if (ctx.state !== 'running') ctx.resume()
    const listeners = this.readyListeners
    this.readyListeners = []
    for (let i = 0; i < listeners.length; i++) listeners[i]()
  }

  toggleMute(): void {
    this.muted = !this.muted
    if (this.muteBus) {
      const t = this.ctx ? this.ctx.currentTime : 0
      this.muteBus.gain.setValueAtTime(this.muted ? 0 : 1, t)
    }
  }

  // Keep the proximity factor at least 0.4 so distant sounds remain audible.
  setDistance(distance: number): void {
    let raw = 1 - (distance - 150) / 160
    if (raw < 0) raw = 0
    if (raw > 1) raw = 1
    this.proximity = raw < 0.4 ? 0.4 : raw
    if (!this.ctx || !this.masterFilter) return
    const t = this.ctx.currentTime
    const cutoff = 6000 + raw * 14000
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, t)
    this.masterFilter.frequency.linearRampToValueAtTime(cutoff, t + 0.12)
  }

  // The native host decodes synchronously by nativeName, the asset basename in Resources/Sounds.
  // Browser URLs include content hashes and do not match bundled filenames.
  // The browser fetches and decodes asynchronously when fetch exists.
  loadBuffer(url: string, onLoad: (buffer: AudioBuffer) => void, nativeName: string): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const nativeBuffer = nativeAudioBufferForFile(nativeName)
    if (nativeBuffer) {
      onLoad(nativeBuffer as unknown as AudioBuffer)
      return
    }
    const g = globalThis as unknown as {
      fetch?: (u: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>
    }
    if (!g.fetch) return
    g.fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then(onLoad)
      .catch(() => {})
  }

  // Scale each sound effect by the shared proximity factor before sending it to the master bus.
  play(buffer: AudioBuffer, gain: number, playbackRate = 1): void {
    if (!this.ctx || !this.master) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    if (playbackRate !== 1) src.playbackRate.value = playbackRate
    const g = this.ctx.createGain()
    g.gain.value = gain * this.proximity
    src.connect(g)
    g.connect(this.master)
    src.start()
  }
}
