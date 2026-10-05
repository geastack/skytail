import type { Hud } from './hud'
import { easeInOutCubic } from '../lib/math'

const TITLE_DURATION = 850
const ENERGY_FADE_DURATION = 200
const RECENTER_DURATION = 300
const SCORE_STAGGER = 60
const PROMPT_FADE_DURATION = 250
const REDUCED_DURATION = 200

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step)
}

function fadeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export interface HudFrame {
  distance: number
  energy: number // Fraction from 0 to 1.
  level: number
  levelProgress: number // Fraction from 0 to 1 within the current level.
  splash: boolean
  dead: boolean // True from the crash, before replay becomes available.
  replay: boolean
  reducedMotion: boolean
}

export class HudDirector {
  private splashRaw = 0
  private replayRaw = 0
  private energyGoneRaw = 0
  private energyBlinkElapsed = 0
  private fps = 60
  private fpsDisplayElapsed = 500

  constructor(private readonly hud: Hud) {}

  update(dtMs: number, dt: number, frame: HudFrame): void {
    if (dtMs > 0) this.fps += (1000 / dtMs - this.fps) * 0.1
    const duration = frame.reducedMotion ? REDUCED_DURATION : TITLE_DURATION
    const step = Math.max(0, dt) / duration
    // Continue from the current factors when Start, Replay, or Back interrupts a transition.
    this.splashRaw = approach(this.splashRaw, frame.splash ? 1 : 0, step)
    this.replayRaw = approach(this.replayRaw, frame.replay ? 1 : 0, step)
    // Delay energy restoration while the result pair returns to gameplay positions.
    const hideEnergy = frame.dead || (!frame.reducedMotion && this.replayRaw > 0.25)
    this.energyGoneRaw = approach(this.energyGoneRaw, hideEnergy ? 1 : 0, Math.max(0, dt) / RECENTER_DURATION)
    const splashT = easeInOutCubic(this.splashRaw)
    const replayT = easeInOutCubic(this.replayRaw)
    const scoreRaw = Math.max(0, (this.replayRaw * TITLE_DURATION - SCORE_STAGGER) / (TITLE_DURATION - SCORE_STAGGER))
    const scoreT = easeInOutCubic(scoreRaw)
    const energyFadeRaw = Math.min(1, this.energyGoneRaw * RECENTER_DURATION / ENERGY_FADE_DURATION)
    // Recenter after the energy sticker mostly fades.
    const energyGoneT = easeInOutCubic(Math.max(0, (this.energyGoneRaw * RECENTER_DURATION - 100) / 200))

    // Reduced motion uses final positions with short opacity fades.
    if (frame.reducedMotion) {
      this.hud.setPresentation(frame.splash ? 1 : 0, frame.replay ? 1 : 0, frame.replay ? 1 : 0, frame.dead ? 1 : 0)
    } else {
      this.hud.setPresentation(splashT, replayT, scoreT, energyGoneT)
    }
    const titleOpacity = frame.reducedMotion ? (frame.replay ? fadeOut(this.replayRaw) : frame.splash ? fadeOut(this.splashRaw) : 1) : 1
    this.hud.setTitleOpacity(titleOpacity)
    this.hud.setSplashOpacity(frame.reducedMotion && !frame.splash ? 0 : splashT)
    const subtitleOpacity = frame.reducedMotion ? (frame.splash ? fadeOut(this.splashRaw) : frame.replay ? fadeOut(this.replayRaw) : 0) : Math.min(1, splashT + replayT)
    this.hud.setSubtitleOpacity(subtitleOpacity)

    // Retain final level and distance values until the outgoing result fades.
    const returning = !frame.replay && this.replayRaw > 0
    if (!returning || this.replayRaw <= 0.5 || frame.reducedMotion) {
      this.hud.setScore(frame.distance)
      this.hud.setLevel(frame.level)
      this.hud.setLevelProgress(frame.levelProgress)
    }
    let energyBlink = 1
    if (!frame.dead && frame.energy < 0.3) {
      this.energyBlinkElapsed = (this.energyBlinkElapsed + dt) % 150
      energyBlink = Math.abs((this.energyBlinkElapsed / 150) * 2 - 1)
    } else this.energyBlinkElapsed = 0
    this.hud.setEnergy(frame.energy, energyBlink)
    const rowOpacity = frame.reducedMotion ? (frame.splash ? 0 : 1) : Math.max(0, 1 - splashT * 2)
    let scoreOpacity = rowOpacity
    if (frame.reducedMotion && frame.replay) scoreOpacity *= fadeOut(this.replayRaw)
    else if (returning && !frame.reducedMotion) scoreOpacity *= Math.abs(this.replayRaw * 2 - 1)
    this.hud.setScoreOpacity(scoreOpacity)
    this.hud.setLevelOpacity(scoreOpacity)
    this.hud.setEnergyOpacity(rowOpacity * (1 - fadeOut(energyFadeRaw)))

    if (frame.replay) {
      const promptRaw = frame.reducedMotion ? this.replayRaw : Math.max(0, Math.min(1, (this.replayRaw * TITLE_DURATION - (TITLE_DURATION - PROMPT_FADE_DURATION)) / PROMPT_FADE_DURATION))
      this.hud.setPrompt('replay', fadeOut(promptRaw))
    } else if (splashT > 0.01 && (!frame.reducedMotion || frame.splash)) {
      this.hud.setPrompt('start', splashT)
    } else {
      this.hud.setPrompt('none', 0)
    }

    this.fpsDisplayElapsed += dtMs
    if (this.fpsDisplayElapsed >= 500) {
      this.fpsDisplayElapsed = 0
      this.hud.setFps(this.fps)
    }
  }
}
