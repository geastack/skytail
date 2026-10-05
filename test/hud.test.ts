import { describe, expect, it, vi } from 'vitest'
import { Group } from 'three/src/objects/Group.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { Box3 } from 'three/src/math/Box3.js'
import type { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import type { Text } from 'troika-three-text'
import { Hud } from '../src/hud/hud'
import { HudDirector, type HudFrame } from '../src/hud/hud-director'

// Text layout requires a browser worker. This mock preserves the scene transforms used by these tests.
vi.mock('troika-three-text', async () => {
  const { Group } = await import('three/src/objects/Group.js')
  return { Text: class extends Group { text = ''; fillOpacity = 1; sync(): void {} } }
})

const playing: HudFrame = { distance: 2137, energy: .7, level: 3, levelProgress: .4, splash: false, dead: false, replay: false, reducedMotion: false }
const crashing = { ...playing, energy: 0, dead: true }
const replay = { ...crashing, replay: true }

function setup(width = 1280, height = 800) {
  const hud = new Hud(width, height)
  const director = new HudDirector(hud)
  const parts = hud as unknown as {
    titleGroup: Group; tagline: Text; scoreRoot: Group; levelRoot: Group; energyRoot: Group; barFill: Mesh;
    promptRoot: Group; promptText: Text; splashRoot: Group; distText: Text; levelText: Text;
  }
  function advance(ms: number, frame: HudFrame) {
    for (let elapsed = 0; elapsed < ms;) {
      const dt = Math.min(10, ms - elapsed)
      director.update(dt, dt, frame)
      elapsed += dt
    }
  }
  advance(1000, playing)
  return { hud, director, parts, advance }
}

function stickerBounds(root: Group): Box3 {
  root.updateMatrixWorld(true)
  return new Box3().setFromObject(root.children[0])
}

function opacity(root: Group): number {
  return ((root.children[0].children[0] as Mesh).material as MeshBasicMaterial).opacity
}

describe('game-over HUD transitions', () => {
  it('shows and centers all three gameplay instruments under the title, with captions attached', () => {
    const { parts } = setup()
    const level = stickerBounds(parts.levelRoot)
    const energy = stickerBounds(parts.energyRoot)
    // Tilted stickers and hard shadows can shift the optical edge by 2 pixels.
    expect(Math.abs((level.min.x + energy.max.x) / 2 - parts.titleGroup.position.x)).toBeLessThan(3)
    expect((parts.levelRoot.children[1] as Text).text).toBe('LEVEL')
    expect((parts.scoreRoot.children[1] as Text).text).toBe('DISTANCE')
    expect((parts.energyRoot.children[1] as Text).text).toBe('ENERGY')
    expect(parts.levelRoot.visible && parts.scoreRoot.visible && parts.energyRoot.visible).toBe(true)
    expect(parts.barFill.scale.x).toBe(.7)
  })

  it('fades only energy at death and retains the level and distance', () => {
    const { parts, advance } = setup()
    advance(50, crashing)
    expect(opacity(parts.energyRoot)).toBeGreaterThan(0)
    expect(opacity(parts.energyRoot)).toBeLessThan(1)
    expect((parts.energyRoot.children[1] as Text).fillOpacity).toBe(opacity(parts.energyRoot))
    expect(opacity(parts.levelRoot)).toBe(1)
    expect(opacity(parts.scoreRoot)).toBe(1)
    expect(parts.levelText.fillOpacity).toBe(1)
    expect(parts.promptRoot.visible).toBe(false)
    expect(parts.distText.text).toBe('2137')
    advance(300, crashing)
    expect(parts.energyRoot.visible).toBe(false)
    expect(parts.levelRoot.visible).toBe(true)
    const level = stickerBounds(parts.levelRoot)
    const score = stickerBounds(parts.scoreRoot)
    expect(Math.abs((level.min.x + score.max.x) / 2 - parts.titleGroup.position.x)).toBeLessThan(3)
    expect(parts.scoreRoot.visible).toBe(true)
  })

  it('moves the title, subtitle and score forward without text overlap', () => {
    const { parts, advance } = setup()
    advance(250, crashing)
    for (let elapsed = 0; elapsed < 900; elapsed += 10) {
      advance(10, replay)
      const scoreTop = stickerBounds(parts.scoreRoot).max.y
      // Overlay Y coordinates increase upwards.
      const subtitleBottom = parts.tagline.position.y - 8 * parts.tagline.scale.y
      expect(subtitleBottom).toBeGreaterThan(scoreTop)
    }
    expect(parts.titleGroup.scale.x).toBeGreaterThan(1)
    expect(parts.scoreRoot.scale.x).toBeGreaterThan(1)
    expect(parts.levelRoot.scale.x).toBe(parts.scoreRoot.scale.x)
    expect(parts.levelRoot.position.y).toBe(parts.scoreRoot.position.y)
    expect(parts.levelRoot.visible).toBe(true)
    expect(parts.energyRoot.visible).toBe(false)
    expect(parts.promptRoot.position.x).toBe(parts.titleGroup.position.x)
    expect(parts.promptRoot.visible).toBe(true)
    expect(parts.promptText.text).toBe('REPLAY')
    expect(parts.splashRoot.visible).toBe(false)
  })

  it('preserves the result during exit and restores the live level and distance on replay', () => {
    const { parts, advance } = setup()
    advance(1000, replay)
    advance(100, { ...playing, distance: 0, level: 1 })
    expect(parts.distText.text).toBe('2137')
    expect(parts.levelText.text).toBe('3')
    expect(parts.energyRoot.visible).toBe(false)
    expect(parts.promptRoot.visible).toBe(false)
    advance(900, { ...playing, distance: 27, level: 1 })
    expect(parts.distText.text).toBe('27')
    expect(parts.levelText.text).toBe('1')
    expect(parts.energyRoot.visible).toBe(true)
    expect(parts.levelRoot.visible).toBe(true)
    expect(parts.scoreRoot.scale.x).toBe(1)
    expect(parts.titleGroup.scale.x).toBe(1)
    expect(parts.tagline.visible).toBe(false)
  })

  it('retargets an unfinished entrance without a position jump or stale replay content', () => {
    const { parts, advance, director } = setup()
    advance(350, replay)
    const before = parts.titleGroup.position.clone()
    director.update(0, 0, playing)
    expect(parts.titleGroup.position.equals(before)).toBe(true)
    expect(parts.promptRoot.visible).toBe(false)
    advance(1000, { ...playing, splash: true, distance: 0 })
    expect(parts.promptText.text).toBe('PLAY')
    expect(parts.splashRoot.visible).toBe(true)
    expect(parts.scoreRoot.visible).toBe(false)
  })

  it('uses stable result transforms and a short fade for reduced motion, including a zero score', () => {
    const { parts, advance } = setup()
    advance(20, { ...replay, distance: 0, reducedMotion: true })
    const position = parts.scoreRoot.position.clone()
    const scale = parts.scoreRoot.scale.clone()
    expect(opacity(parts.scoreRoot)).toBeGreaterThan(0)
    expect(opacity(parts.scoreRoot)).toBeLessThan(1)
    expect(parts.distText.text).toBe('0')
    advance(200, { ...replay, distance: 0, reducedMotion: true })
    expect(parts.scoreRoot.position.equals(position)).toBe(true)
    expect(parts.scoreRoot.scale.equals(scale)).toBe(true)
    expect(opacity(parts.scoreRoot)).toBe(1)
    expect(parts.levelRoot.visible).toBe(true)
    expect(parts.energyRoot.visible).toBe(false)
  })

  it.each([[1280, 800], [640, 496], [390, 844], [844, 390]])('keeps the result and replay prompt separated after resizing to %ix%i', (width, height) => {
    const { hud, parts, advance } = setup()
    advance(1000, replay)
    hud.resize(width, height)
    const score = stickerBounds(parts.scoreRoot)
    const prompt = stickerBounds(parts.promptRoot)
    const label = parts.scoreRoot.children[1]
    const labelBottom = parts.scoreRoot.position.y + (label.position.y - 6) * parts.scoreRoot.scale.y
    expect(labelBottom).toBeGreaterThan(prompt.max.y)
    expect(score.min.x).toBeGreaterThan(0)
    expect(score.max.x).toBeLessThan(width)
    expect(prompt.min.y).toBeGreaterThan(0)
    expect(parts.titleGroup.position.x).toBe(width / 2)
    const level = stickerBounds(parts.levelRoot)
    expect(level.min.x).toBeGreaterThan(0)
    expect(level.max.x).toBeLessThan(score.min.x)
    expect(Math.abs((level.min.x + score.max.x) / 2 - width / 2)).toBeLessThan(4)
  })
})
