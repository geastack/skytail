// The HUD uses an orthographic overlay with pixel coordinates increasing upwards.
// Convert top offsets to positions with height - offset.

import { Group } from 'three/src/objects/Group.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { OrthographicCamera } from 'three/src/cameras/OrthographicCamera.js'
import { RingGeometry } from 'three/src/geometries/RingGeometry.js'
import { fanGeometry, roundedRectOutline, starOutline } from './shape-outline'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { DoubleSide } from 'three/src/constants.js'
import { Text } from 'troika-three-text'
import unboundedBlackUrl from '../fonts/unbounded-900.woff'
import unboundedBoldUrl from '../fonts/unbounded-700.woff'
import interUrl from '../fonts/inter-600.woff'
import { BAR_TRACK, CINNABAR, HUD_WHITE, INK, MIKADO, REWARD_CYAN, TIFFANY } from '../lib/palette'
import { GAME_TITLE } from '../config'

const ARC_SEGMENTS = 64

// Scale the title and its shadow together.
const TITLE_SIZE = 28
const TITLE_SHADOW = 2
const TITLE_SPLASH_SCALE = 118 / TITLE_SIZE
const TITLE_TOP_Y = 52 // Title centre in pixels from the top during play.
const TITLE_SPLASH_Y = 231 // Title centre in pixels from the top on the start screen.

const SCORE_ROW_Y = 136 // Sticker row centre in pixels from the top.
const SCORE_LABEL_DROP = 47 // Label centre in pixels below the sticker centre.
const LEVEL_X = -219
const DIST_X = -41
const ENERGY_X = 167
const RESULT_LEVEL_X = -108
const RESULT_DIST_X = 50
const BAR_W = 144
const BAR_H = 14
const REPLAY_SCORE_SCALE = 1.7

// Concrete arrays retain material identity in native code.
// Iterating root.children can copy materials into anonymous records.
interface HudLayer {
  readonly meshes: Mesh[]
  readonly materials: MeshBasicMaterial[]
  readonly texts: Text[]
}

function shapeMesh(outline: number[], color: number, into: HudLayer): Mesh {
  const material = new MeshBasicMaterial({ color, side: DoubleSide })
  // Flat HUD meshes need one transparent draw pass.
  // DoubleSide otherwise changes the material version twice per frame and rebuilds shader parameters.
  material.forceSinglePass = true
  const mesh = new Mesh(fanGeometry(outline), material)
  mesh.frustumCulled = false
  into.meshes.push(mesh)
  into.materials.push(material)
  return mesh
}

// deg is clockwise in degrees. The overlay increases y upwards, so rotation and shadow y offsets use negative values.
function sticker(w: number, h: number, r: number, fill: number, deg: number, drop: number, into: HudLayer): Group {
  const group = new Group()
  const shadow = shapeMesh(roundedRectOutline(w, h, r), INK, into)
  shadow.position.set(drop, -drop, 0)
  const border = shapeMesh(roundedRectOutline(w, h, r), INK, into)
  border.position.z = 1
  const face = shapeMesh(roundedRectOutline(w - 4, h - 4, r - 2), fill, into)
  face.position.z = 2
  group.add(shadow)
  group.add(border)
  group.add(face)
  group.rotation.z = (-deg * Math.PI) / 180
  return group
}

function makeText(size: number, color: number, font: string, spacing: number, into: HudLayer): Text {
  const t = new Text()
  t.font = font
  t.fontSize = size
  t.color = color
  t.anchorX = 'center'
  t.anchorY = 'middle'
  t.letterSpacing = spacing
  t.depthOffset = -1
  t.text = ''
  t.sync()
  into.texts.push(t)
  return t
}

function rebuildText(text: Text): void {
  const value = text.text
  // A trailing space changes the native layout fingerprint without adding visible pixels.
  // Restore the exact text after rebuilding.
  text.text = value + ' '
  text.sync()
  text.text = value
  text.sync()
}

// Clone geometry buffers and rebuild glyph quads after renderer initialization.
function primeLayer(layer: HudLayer): void {
  for (let i = 0; i < layer.meshes.length; i++) {
    const mesh = layer.meshes[i]
    mesh.geometry = mesh.geometry.clone()
  }
  for (let i = 0; i < layer.texts.length; i++) {
    rebuildText(layer.texts[i])
  }
}

function setLayerOpacity(layer: HudLayer, o: number): void {
  for (let i = 0; i < layer.materials.length; i++) {
    const material = layer.materials[i]
    if (!material.transparent) {
      material.transparent = true
      material.needsUpdate = true
    }
    material.opacity = o
  }
  for (let i = 0; i < layer.texts.length; i++) {
    const text = layer.texts[i]
    text.fillOpacity = o
    text.sync()
  }
}

export class Hud {
  readonly scene: Scene
  readonly camera: OrthographicCamera

  private readonly chrome: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly title: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly subtitle: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly splash: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly prompt: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly energy: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly level: HudLayer = { meshes: [], materials: [], texts: [] }
  private readonly score: HudLayer = { meshes: [], materials: [], texts: [] }

  private readonly energyRoot: Group
  private readonly levelRoot: Group
  private readonly scoreRoot: Group
  private readonly splashRoot: Group
  private readonly promptRoot: Group
  private readonly titleGroup: Group
  private readonly titleMain: Text
  private readonly titleShadow: Text
  private readonly presents: Group
  private readonly tagline: Text
  private readonly hints: Group
  private readonly controlsText: Text
  private readonly creditText: Text
  private readonly fpsText: Text
  private readonly promptText: Text
  private readonly levelText: Text
  private readonly distText: Text
  private readonly barFill: Mesh
  private readonly barFillMat: MeshBasicMaterial
  private readonly levelArc: Mesh
  private nativeResourcesPrimed = false
  private scoreResourcesPrimed = false

  private width: number
  private height: number
  private lastScore = -1
  private lastLevel = -1
  private lastFps = -1
  private lastScoreOpacity = -1
  private lastSplashOpacity = -1
  private lastEnergyOpacity = -1
  private lastEnergyLow: boolean | null = null
  private energyBlinkOpacity = 1
  private lastLevelOpacity = -1
  private lastTitleOpacity = -1
  private lastSubtitleOpacity = -1
  private lastPromptOpacity = -1
  private splashT = 0
  private replayT = 0
  private scoreReplayT = 0
  private energyGoneT = 0
  private lastPrompt = ''

  constructor(pixelWidth: number, pixelHeight: number) {
    this.width = pixelWidth
    this.height = pixelHeight
    this.scene = new Scene()
    this.camera = new OrthographicCamera(0, pixelWidth, pixelHeight, 0, -100, 100)

    this.titleShadow = makeText(TITLE_SIZE, INK, unboundedBlackUrl, -0.045, this.title)
    this.titleShadow.text = GAME_TITLE
    this.titleShadow.position.set(TITLE_SHADOW, -TITLE_SHADOW, 0)
    this.titleShadow.sync()
    this.titleMain = makeText(TITLE_SIZE, TIFFANY, unboundedBlackUrl, -0.045, this.title)
    this.titleMain.text = GAME_TITLE
    this.titleMain.position.set(0, 0, 1)
    this.titleMain.sync()
    this.titleGroup = new Group()
    this.titleGroup.add(this.titleShadow)
    this.titleGroup.add(this.titleMain)
    this.scene.add(this.titleGroup)

    this.fpsText = makeText(11, INK, unboundedBoldUrl, 0, this.chrome)
    this.fpsText.anchorX = 'right'
    this.fpsText.sync()
    this.scene.add(this.fpsText)

    this.splashRoot = new Group()
    this.scene.add(this.splashRoot)

    this.presents = sticker(206, 34, 6, MIKADO, -3, 3, this.splash)
    const presentsText = makeText(12, INK, unboundedBoldUrl, 0.12, this.splash)
    presentsText.text = 'COYOTIV PRESENTS'
    presentsText.position.z = 3
    presentsText.sync()
    this.presents.add(presentsText)
    this.splashRoot.add(this.presents)

    this.tagline = makeText(16, INK, interUrl, 0.02, this.subtitle)
    this.tagline.text = 'an endless flight with the Coyotiv mascot'
    this.tagline.sync()
    this.scene.add(this.tagline)

    this.hints = new Group()
    const starSticker = sticker(205, 40, 8, REWARD_CYAN, -2.5, 3, this.splash)
    starSticker.position.set(-127.5, 0, 0)
    const starIcon = shapeMesh(starOutline(9, 3.8), HUD_WHITE, this.splash)
    starIcon.position.set(-77.5, 0, 3)
    starSticker.add(starIcon)
    const starText = makeText(13, INK, unboundedBoldUrl, 0.06, this.splash)
    starText.text = 'GRAB THE STARS'
    starText.position.set(12, 0, 3)
    starText.sync()
    starSticker.add(starText)
    this.hints.add(starSticker)
    const bombSticker = sticker(235, 40, 8, CINNABAR, 2, 3, this.splash)
    bombSticker.position.set(112.5, 0, 0)
    const bombBody = shapeMesh(roundedRectOutline(12, 12, 6), HUD_WHITE, this.splash)
    bombBody.position.set(-92.5, -1.5, 3)
    bombSticker.add(bombBody)
    const bombCap = shapeMesh(roundedRectOutline(5, 3, 1), HUD_WHITE, this.splash)
    bombCap.position.set(-92.5, 5, 3)
    bombSticker.add(bombCap)
    const bombFuse = shapeMesh(roundedRectOutline(2, 5, 1), HUD_WHITE, this.splash)
    bombFuse.position.set(-90.5, 8.5, 3)
    bombFuse.rotation.z = -0.6
    bombSticker.add(bombFuse)
    const bombText = makeText(13, HUD_WHITE, unboundedBoldUrl, 0.06, this.splash)
    bombText.text = 'DODGE THE BOMBS'
    bombText.position.set(12, 0, 3)
    bombText.sync()
    bombSticker.add(bombText)
    this.hints.add(bombSticker)
    this.splashRoot.add(this.hints)

    this.controlsText = makeText(12, INK, interUrl, 0, this.splash)
    this.controlsText.anchorX = 'left'
    this.controlsText.text = 'Mouse or gamepad stick to fly / arrows or WASD / space, click or A to start'
    this.controlsText.sync()
    this.splashRoot.add(this.controlsText)
    this.creditText = makeText(12, INK, interUrl, 0, this.splash)
    this.creditText.anchorX = 'right'
    this.creditText.text = 'Original game by Karim Maaloul / github.com/yakudoo'
    this.creditText.sync()
    this.splashRoot.add(this.creditText)

    this.promptRoot = new Group()
    this.promptRoot.visible = false
    this.scene.add(this.promptRoot)
    const pill = sticker(200, 64, 32, MIKADO, 0, 5, this.prompt)
    const playIcon = shapeMesh([-4.5, 6.3, 6.3, 0, -4.5, -6.3], INK, this.prompt)
    playIcon.position.set(-57, 0, 3)
    pill.add(playIcon)
    this.promptText = makeText(20, INK, unboundedBlackUrl, 0.02, this.prompt)
    this.promptText.text = 'PLAY'
    this.promptText.position.set(12, 0, 3)
    this.promptText.sync()
    pill.add(this.promptText)
    this.promptRoot.add(pill)

    this.energyRoot = new Group()
    this.scene.add(this.energyRoot)
    this.levelRoot = new Group()
    this.scoreRoot = new Group()
    this.scene.add(this.levelRoot)
    this.scene.add(this.scoreRoot)

    const badge = sticker(64, 64, 32, TIFFANY, -4, 3, this.level)
    // Sweep clockwise from the top. Clockwise angles are negative in this overlay.
    const arc = new RingGeometry(24, 28, ARC_SEGMENTS, 1, Math.PI / 2, -Math.PI * 2)
    arc.setDrawRange(0, 0)
    const levelArcMat = new MeshBasicMaterial({ color: MIKADO, side: DoubleSide })
    levelArcMat.forceSinglePass = true
    this.levelArc = new Mesh(arc, levelArcMat)
    this.levelArc.frustumCulled = false
    this.levelArc.position.z = 3
    badge.add(this.levelArc)
    this.level.meshes.push(this.levelArc)
    this.level.materials.push(levelArcMat)
    this.levelText = makeText(24, HUD_WHITE, unboundedBlackUrl, 0, this.level)
    this.levelText.position.set(0, 0, 4)
    badge.add(this.levelText)
    this.levelRoot.add(badge)

    const distPill = sticker(180, 64, 32, HUD_WHITE, 1.5, 3, this.score)
    this.distText = makeText(30, INK, unboundedBlackUrl, -0.03, this.score)
    this.distText.position.set(0, 0, 3)
    distPill.add(this.distText)
    this.scoreRoot.add(distPill)

    const energyPill = sticker(168, 64, 32, HUD_WHITE, -1.5, 3, this.energy)
    const trackBorder = shapeMesh(roundedRectOutline(BAR_W + 4, BAR_H + 4, 9), INK, this.energy)
    trackBorder.position.z = 3
    energyPill.add(trackBorder)
    const trackFace = shapeMesh(roundedRectOutline(BAR_W, BAR_H, 7), BAR_TRACK, this.energy)
    trackFace.position.z = 4
    energyPill.add(trackFace)
    this.barFill = shapeMesh(roundedRectOutline(BAR_W, BAR_H, 7), MIKADO, this.energy)
    this.barFill.position.z = 5
    this.barFillMat = this.barFill.material as MeshBasicMaterial
    energyPill.add(this.barFill)
    this.energyRoot.add(energyPill)
    const energyLabel = makeText(11, INK, interUrl, 0.16, this.energy)
    energyLabel.text = 'ENERGY'
    energyLabel.position.set(0, -SCORE_LABEL_DROP, 0)
    energyLabel.sync()
    this.energyRoot.add(energyLabel)

    const levelLabel = makeText(11, INK, interUrl, 0.16, this.level)
    levelLabel.text = 'LEVEL'
    levelLabel.position.set(0, -SCORE_LABEL_DROP, 0)
    levelLabel.sync()
    this.levelRoot.add(levelLabel)
    const scoreLabel = makeText(11, INK, interUrl, 0.16, this.score)
    scoreLabel.text = 'DISTANCE'
    scoreLabel.position.set(0, -SCORE_LABEL_DROP, 0)
    scoreLabel.sync()
    this.scoreRoot.add(scoreLabel)

    this.layout()
    this.setScore(0)
    this.setLevel(1)
    this.setEnergy(1)
  }

  // The first world render initializes the native renderer.
  // Recreate HUD resources once between the first world and HUD renders.
  primeRendererResources(): void {
    if (this.nativeResourcesPrimed) return
    this.nativeResourcesPrimed = true
    primeLayer(this.chrome)
    primeLayer(this.title)
    primeLayer(this.subtitle)
    primeLayer(this.splash)
    primeLayer(this.prompt)
    this.primeScoreResources()
  }

  private primeScoreResources(): void {
    if (this.scoreResourcesPrimed) return
    this.scoreResourcesPrimed = true
    // Prime the hidden score row during preload to retain its uploaded buffers when play starts.
    primeLayer(this.score)
    primeLayer(this.level)
    primeLayer(this.energy)
  }

  // Retain transition factors so resizing preserves the current presentation.
  setPresentation(splash: number, replay: number, scoreReplay: number, energyGone: number): void {
    this.splashT = splash
    this.replayT = replay
    this.scoreReplayT = scoreReplay
    this.energyGoneT = energyGone
    this.applyPresentation()
  }

  setTitleOpacity(o: number): void {
    if (o === this.lastTitleOpacity) return
    this.lastTitleOpacity = o
    setLayerOpacity(this.title, o)
  }

  setSubtitleOpacity(o: number): void {
    if (o === this.lastSubtitleOpacity) return
    this.lastSubtitleOpacity = o
    this.tagline.visible = o > 0.01
    if (this.tagline.visible) setLayerOpacity(this.subtitle, o)
  }

  setSplashOpacity(o: number): void {
    if (o === this.lastSplashOpacity) return
    this.lastSplashOpacity = o
    this.splashRoot.visible = o > 0.01
    if (this.splashRoot.visible) setLayerOpacity(this.splash, o)
  }

  setScoreOpacity(o: number): void {
    if (o === this.lastScoreOpacity) return
    this.lastScoreOpacity = o
    this.scoreRoot.visible = o > 0.01
    if (this.scoreRoot.visible) setLayerOpacity(this.score, o)
  }

  setLevelOpacity(o: number): void {
    if (o === this.lastLevelOpacity) return
    this.lastLevelOpacity = o
    this.levelRoot.visible = o > 0.01
    if (this.levelRoot.visible) setLayerOpacity(this.level, o)
  }

  setEnergyOpacity(o: number): void {
    if (o === this.lastEnergyOpacity) return
    this.lastEnergyOpacity = o
    this.energyRoot.visible = o > 0.01
    if (!this.energyRoot.visible) return
    setLayerOpacity(this.energy, o)
    this.barFillMat.opacity = o * this.energyBlinkOpacity
  }

  setPrompt(kind: 'start' | 'replay' | 'none', opacity: number): void {
    if (kind === 'none') {
      if (this.promptRoot.visible) this.promptRoot.visible = false
      this.lastPrompt = kind
      return
    }
    if (kind !== this.lastPrompt) {
      this.lastPrompt = kind
      this.promptText.text = kind === 'start' ? 'PLAY' : 'REPLAY'
      this.promptText.sync()
    }
    this.promptRoot.visible = opacity > 0.01
    if (opacity !== this.lastPromptOpacity) {
      this.lastPromptOpacity = opacity
      setLayerOpacity(this.prompt, opacity)
    }
  }

  private applyPresentation(): void {
    const cx = this.width / 2
    const fit = Math.min(1, Math.max(0.1, (this.width - 48) / 760), Math.max(0.1, (this.height - 64) / 580))
    const middle = this.height * 0.46
    const titleY = middle - 155 * fit
    const subtitleY = middle - 80 * fit
    const scoreY = middle + 30 * fit
    const promptY = middle + 175 * fit
    const titleScale = 1 + (TITLE_SPLASH_SCALE - 1) * this.splashT + (TITLE_SPLASH_SCALE * fit - 1) * this.replayT
    this.titleGroup.position.set(cx, this.height - (TITLE_TOP_Y + (TITLE_SPLASH_Y - TITLE_TOP_Y) * this.splashT + (titleY - TITLE_TOP_Y) * this.replayT), 0)
    this.titleGroup.scale.set(titleScale, titleScale, 1)

    // Move and scale the subtitle with the title to keep it above the score during transitions.
    const subtitleBaseScale = 1 / TITLE_SPLASH_SCALE
    const subtitleBaseY = TITLE_TOP_Y + 75 * subtitleBaseScale
    const subtitleScale = subtitleBaseScale + (1 - subtitleBaseScale) * this.splashT + (fit - subtitleBaseScale) * this.replayT
    this.tagline.position.set(cx, this.height - (subtitleBaseY + (312 - subtitleBaseY) * this.splashT + (subtitleY - subtitleBaseY) * this.replayT), 0)
    this.tagline.scale.set(subtitleScale, subtitleScale, 1)
    const scoreScale = 1 + (REPLAY_SCORE_SCALE * fit - 1) * this.scoreReplayT
    const rowY = this.height - (SCORE_ROW_Y + (scoreY - SCORE_ROW_Y) * this.scoreReplayT)
    const levelX = LEVEL_X + (RESULT_LEVEL_X - LEVEL_X) * this.energyGoneT
    const distanceX = DIST_X + (RESULT_DIST_X - DIST_X) * this.energyGoneT
    // Scale offsets with the stickers to preserve the gap and baseline during transitions.
    this.levelRoot.position.set(cx + levelX * scoreScale, rowY, 0)
    this.levelRoot.scale.set(scoreScale, scoreScale, 1)
    this.scoreRoot.position.set(cx + distanceX * scoreScale, rowY, 0)
    this.scoreRoot.scale.set(scoreScale, scoreScale, 1)
    this.energyRoot.position.set(cx + ENERGY_X, this.height - SCORE_ROW_Y, 0)
    const promptScale = 1 + (fit - 1) * this.replayT
    this.promptRoot.position.set(cx, this.height * 0.41 + (this.height - promptY - this.height * 0.41) * this.replayT, 0)
    this.promptRoot.scale.set(promptScale, promptScale, 1)
  }

  private layout(): void {
    const cx = this.width / 2
    this.applyPresentation()
    this.presents.position.set(cx, this.height - 143, 0)
    this.hints.position.set(cx, 104, 0)
    this.controlsText.position.set(48, 27, 0)
    this.creditText.position.set(this.width - 126, 27, 0)
    this.fpsText.position.set(this.width - 48, 27, 0)
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    this.width = pixelWidth
    this.height = pixelHeight
    this.camera.left = 0
    this.camera.right = pixelWidth
    this.camera.top = pixelHeight
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()
    this.layout()
  }

  setScore(value: number): void {
    let v = Math.floor(value)
    if (v < 0) v = 0
    if (v === this.lastScore) return
    this.lastScore = v
    this.distText.text = String(v)
    this.distText.sync()
  }

  setLevel(value: number): void {
    let v = Math.floor(value)
    if (v < 1) v = 1
    if (v === this.lastLevel) return
    this.lastLevel = v
    this.levelText.text = String(v)
    this.levelText.sync()
  }

  setLevelProgress(frac: number): void {
    let f = frac
    if (f < 0) f = 0
    if (f > 1) f = 1
    this.levelArc.geometry.setDrawRange(0, Math.floor(f * ARC_SEGMENTS) * 6)
  }

  setFps(value: number): void {
    const v = Math.round(value)
    if (v === this.lastFps) return
    this.lastFps = v
    this.fpsText.text = v + ' FPS'
    this.fpsText.sync()
  }

  setEnergy(frac: number, blinkOpacity = 1): void {
    const f = Math.max(0, Math.min(1, frac))
    this.barFill.scale.x = Math.max(0.001, f)
    this.barFill.position.x = -(BAR_W * (1 - f)) / 2
    this.energyBlinkOpacity = blinkOpacity
    const opacity = this.lastEnergyOpacity < 0 ? 1 : this.lastEnergyOpacity
    this.barFillMat.opacity = opacity * blinkOpacity
    const low = frac < 0.5
    if (low !== this.lastEnergyLow) {
      this.lastEnergyLow = low
      this.barFillMat.color.setHex(low ? CINNABAR : MIKADO)
    }
  }

}
