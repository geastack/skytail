import {
  INIT_SPEED,
  INCREMENT_SPEED_BY_TIME,
  INCREMENT_SPEED_BY_LEVEL,
  DIST_FOR_SPEED,
  DIST_FOR_LEVEL,
  DIST_FOR_COINS,
  DIST_FOR_ENEMIES,
} from '../config'

export type SpawnCoinWave = () => void
export type SpawnEnemyWave = (level: number) => void

export class Progression {
  level = 1
  private baseSpeed = INIT_SPEED
  private targetBaseSpeed = INIT_SPEED
  private coinGate = 0
  private speedGate = 0
  private enemyGate = 0
  private levelGate = 0

  schedule(
    distance: number,
    dt: number,
    spawnCoinWave: SpawnCoinWave,
    spawnEnemyWave: SpawnEnemyWave,
  ): void {
    const fd = Math.floor(distance)

    while (true) {
      const nextCoin = this.coinGate + DIST_FOR_COINS
      const nextSpeed = this.speedGate + DIST_FOR_SPEED
      const nextEnemy = this.enemyGate + DIST_FOR_ENEMIES
      const nextLevel = this.levelGate + DIST_FOR_LEVEL
      const nextDistance = Math.min(nextCoin, nextSpeed, nextEnemy, nextLevel)

      if (nextDistance > fd) break

      // At the same distance, process coins, speed, enemies, then level.
      // Boundary enemies use the previous level. The new level replaces the speed increment at that boundary.
      if (nextCoin === nextDistance) {
        this.coinGate = nextCoin
        spawnCoinWave()
      }
      if (nextSpeed === nextDistance) {
        this.speedGate = nextSpeed
        this.targetBaseSpeed += INCREMENT_SPEED_BY_TIME * dt
      }
      if (nextEnemy === nextDistance) {
        this.enemyGate = nextEnemy
        spawnEnemyWave(this.level)
      }
      if (nextLevel === nextDistance) {
        this.levelGate = nextLevel
        this.level++
        this.targetBaseSpeed = INIT_SPEED + INCREMENT_SPEED_BY_LEVEL * this.level
      }
    }
  }

  easedBaseSpeed(dt: number): number {
    this.baseSpeed += (this.targetBaseSpeed - this.baseSpeed) * dt * 0.02
    return this.baseSpeed
  }

  reset(): void {
    this.level = 1
    this.baseSpeed = INIT_SPEED
    this.targetBaseSpeed = INIT_SPEED
    this.coinGate = 0
    this.speedGate = 0
    this.enemyGate = 0
    this.levelGate = 0
  }
}
