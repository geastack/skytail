import { KIT_UNITS_PER_METRE, RING_TILE } from '../../src/config';
import {
  M_CONIFER_BROAD_SUMMER,
  M_DECIDUOUS_ROUND_SUMMER,
  M_GROUND_MEADOW_SUMMER,
  M_WATER_OPEN_BLUE,
} from '../../src/kit/generated/kit-ids';
import { SEASON_SUMMER, type CellPlacements, type WorldGenerator } from '../../src/worldgen/placements';
import { pick4, rand4 } from '../../src/worldgen/hash';

const SALT_TILE_YAW = 0x11;
const SALT_TREE_COUNT = 0x12;
const SALT_TREE = 0x20; // Each tree uses a block of eight salts.

const WATER_ROWS = 2;
const TREE_ROW_MIN = 2;
const TREE_ROW_MAX = 5;
const MAX_TREES = 3;

/** The tile top is 0.24 metres above its root. */
const TILE_TOP = 0.24 * KIT_UNITS_PER_METRE;
const TREE_SPREAD = RING_TILE * 0.3;

export class DebugGenerator implements WorldGenerator {
  private seed = 0;

  startEpoch(seed: number): void {
    this.seed = seed;
  }

  transitionEpoch(seed: number, _column: number): void {
    this.seed = seed;
  }

  prepare(_column: number): boolean { return false; }

  cell(c: number, j: number, out: CellPlacements): void {
    out.clear();
    const seed = this.seed;
    const yaw = (Math.PI / 2) * pick4(seed, c, j, SALT_TILE_YAW, 4);
    if (j < WATER_ROWS) {
      out.add(M_WATER_OPEN_BLUE, 0, 0, 0, yaw, 1);
      return;
    }
    out.add(M_GROUND_MEADOW_SUMMER, 0, 0, 0, yaw, 1);
    if (j < TREE_ROW_MIN || j > TREE_ROW_MAX) return;
    const trees = pick4(seed, c, j, SALT_TREE_COUNT, MAX_TREES + 1);
    for (let k = 0; k < trees; k++) {
      const salt = SALT_TREE + k * 8;
      const species = pick4(seed, c, j, salt, 2) === 0 ? M_CONIFER_BROAD_SUMMER : M_DECIDUOUS_ROUND_SUMMER;
      const x = (rand4(seed, c, j, salt + 1) - 0.5) * 2 * TREE_SPREAD;
      const z = (rand4(seed, c, j, salt + 2) - 0.5) * 2 * TREE_SPREAD;
      const yawJitter = rand4(seed, c, j, salt + 3) * Math.PI * 2;
      const scale = 0.85 + rand4(seed, c, j, salt + 4) * 0.3;
      out.add(species, x, TILE_TOP, z, yawJitter, scale);
    }
  }

  season(_c: number): number {
    return SEASON_SUMMER;
  }
}
