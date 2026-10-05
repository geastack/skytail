import { describe, expect, it } from 'vitest'
import { INCREMENT_SPEED_BY_LEVEL, INCREMENT_SPEED_BY_TIME, INIT_SPEED } from '../src/config'
import { Progression } from '../src/game/progression'

describe('Progression distance intervals', () => {
  it('fires each crossed interval once in distance order, including ties', () => {
    const progression = new Progression()
    const events: string[] = []
    const coin = (): void => events.push(`coin:${progression.level}`)
    const enemy = (level: number): void => events.push(`enemy:${level}`)

    progression.schedule(49, 10, coin, enemy)
    progression.schedule(201, 10, coin, enemy)

    expect(events).toEqual([
      'enemy:1',
      'coin:1',
      'enemy:1',
      'enemy:1',
      'coin:1',
      'enemy:1',
    ])

    const targetAfterTwoSpeedGates = INIT_SPEED + 2 * INCREMENT_SPEED_BY_TIME * 10
    expect(progression.easedBaseSpeed(1)).toBeCloseTo(
      INIT_SPEED + (targetAfterTwoSpeedGates - INIT_SPEED) * 0.02,
      12,
    )

    progression.schedule(201, 10, coin, enemy)
    expect(events).toHaveLength(6)
  })

  it('keeps the boundary enemy on the preceding level and resets every interval', () => {
    const progression = new Progression()
    const coinLevels: number[] = []
    const enemyLevels: number[] = []

    progression.schedule(
      1051,
      10,
      () => coinLevels.push(progression.level),
      (level) => enemyLevels.push(level),
    )

    expect(coinLevels).toEqual(new Array(10).fill(1))
    expect(enemyLevels).toHaveLength(21)
    expect(enemyLevels.slice(-2)).toEqual([1, 2])
    expect(progression.level).toBe(2)

    // At distance 1000, the level target replaces the preceding speed increment.
    const levelTarget = INIT_SPEED + INCREMENT_SPEED_BY_LEVEL * 2
    expect(progression.easedBaseSpeed(1)).toBeCloseTo(
      INIT_SPEED + (levelTarget - INIT_SPEED) * 0.02,
      12,
    )

    progression.reset()
    coinLevels.length = 0
    enemyLevels.length = 0
    progression.schedule(
      101,
      10,
      () => coinLevels.push(progression.level),
      (level) => enemyLevels.push(level),
    )

    expect(progression.level).toBe(1)
    expect(coinLevels).toEqual([1])
    expect(enemyLevels).toEqual([1, 1])
  })
})
