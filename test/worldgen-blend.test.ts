import { describe, expect, it } from 'vitest';
import { RING_ROWS } from '../src/config';
import { KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { CellPlacements, MAX_PLACEMENTS } from '../src/worldgen/placements';
import { createRingWorldGenerator } from '../src/worldgen/generator';
import { edgeBlendT } from '../src/worldgen/cell';
import {
  BIOME_COUNT,
  BIOME_DESERT,
  BIOME_MEADOW,
  ZONE_COLS_DEFAULT,
  ZONE_COLS_TILE_FAMILY,
  tileZoneColumns,
  zoneColumns,
} from '../src/worldgen/tables';

/** A stretch border at the column where the next stretch starts. */
interface Border {
  seed: number;
  column: number;
  beforeBiome: number;
  afterBiome: number;
  beforeSeason: number;
  afterSeason: number;
}

function findBorders(seeds: number, columns: number, wantDesert: boolean): Border[] {
  const found: Border[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const gen = createRingWorldGenerator();
    gen.startEpoch(seed);
    let beforeBiome = -1;
    let beforeSeason = -1;
    let c = 0;
    while (c < columns) {
      const plan = gen.planFor(c);
      const end = plan.end;
      if (plan.start === c && beforeBiome >= 0) {
        const desert =
          (beforeBiome === BIOME_MEADOW && plan.biome === BIOME_DESERT) ||
          (beforeBiome === BIOME_DESERT && plan.biome === BIOME_MEADOW);
        const season = beforeSeason !== plan.season && beforeBiome !== BIOME_DESERT && plan.biome !== BIOME_DESERT;
        if (wantDesert ? desert : season) {
          found.push({
            seed,
            column: c,
            beforeBiome,
            afterBiome: plan.biome,
            beforeSeason,
            afterSeason: plan.season,
          });
        }
      }
      beforeBiome = plan.biome;
      beforeSeason = plan.season;
      c = end;
    }
  }
  return found;
}

function isGroundTile(id: number): boolean {
  return KIT_MODEL_NAMES[id].indexOf('ground_meadow') === 0;
}

function isSand(id: number): boolean {
  return KIT_MODEL_NAMES[id] === 'ground_meadow_dry_sand';
}

function isCactus(id: number): boolean {
  return KIT_MODEL_NAMES[id].indexOf('cactus') === 0;
}

function isTree(id: number): boolean {
  const n = KIT_MODEL_NAMES[id];
  return n.indexOf('conifer') === 0 || n.indexOf('deciduous') === 0;
}

function isCarpet(id: number): boolean {
  const n = KIT_MODEL_NAMES[id];
  return n.indexOf('grass_tuft') === 0 || n.indexOf('shrub_lobed') === 0 || n.indexOf('ground_jagged_patch') === 0;
}

function isChain(id: number): boolean {
  const n = KIT_MODEL_NAMES[id];
  return n.indexOf('distant_rolling_ridge') === 0 || n === 'desert_mesa';
}

describe('biome blend zones', () => {
  it('keeps every zone width inside its cap', () => {
    for (let ba = 0; ba < BIOME_COUNT; ba++) {
      for (let sa = 0; sa < 4; sa++) {
        for (let bb = 0; bb < BIOME_COUNT; bb++) {
          for (let sb = 0; sb < 4; sb++) {
            const zone = zoneColumns(ba, sa, bb, sb);
            const tile = tileZoneColumns(ba, sa, bb, sb);
            expect(zone === ZONE_COLS_DEFAULT).toBe(true);
            expect(tile).toBeLessThanOrEqual(zone);
            expect(tile).toBe(ZONE_COLS_TILE_FAMILY);
            expect(zoneColumns(bb, sb, ba, sa)).toBe(zone);
            expect(tileZoneColumns(bb, sb, ba, sa)).toBe(tile);
          }
        }
      }
    }
  });

  it('gives a monotone, symmetric blend factor across the zone', () => {
    let violations = 0;
    let complementError = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const half of [0.5, 4.5]) {
        const mid = 100.5;
        for (let j = 0; j < RING_ROWS; j++) {
          let previous = -1;
          for (let c = 90; c <= 112; c++) {
            const t = edgeBlendT(seed, c, j, mid, 1, half);
            if (t < 0 || t > 1 || t < previous) violations++;
            previous = t;
            complementError = Math.max(complementError, Math.abs(edgeBlendT(seed, c, j, mid, -1, half) - (1 - t)));
          }
          if (edgeBlendT(seed, Math.floor(mid - half - 4), j, mid, 1, half) !== 0) violations++;
          if (edgeBlendT(seed, Math.ceil(mid + half + 4), j, mid, 1, half) !== 1) violations++;
        }
      }
    }
    expect(violations).toBe(0);
    expect(complementError).toBeLessThan(0.000001);
  });

  it('keeps one warped sand/meadow border and places species on compatible ground', () => {
    const borders = findBorders(40, 900, true);
    expect(borders.length).toBeGreaterThan(20);
    const out = new CellPlacements();
    let mixedBorders = 0;
    let cacti = 0;
    let trees = 0;
    for (const border of borders) {
      const gen = createRingWorldGenerator();
      gen.startEpoch(border.seed);
      let sandInZone = 0;
      let meadowInZone = 0;
      for (let d = -6; d <= 6; d++) {
        const c = border.column + d;
        if (c < 0) continue;
        for (let j = 0; j < RING_ROWS; j++) {
          gen.cell(c, j, out);
          expect(out.count).toBeLessThan(MAX_PLACEMENTS);
          const tile = out.modelId[0];
          if (!isGroundTile(tile)) continue;
          const sand = isSand(tile);
          if (Math.abs(d) <= 2) {
            if (sand) sandInZone += 1;
            else meadowInZone += 1;
          } else {
            // The warped border can shift ownership by at most 3.45 columns.
            const desertSide = (d > 0) === (border.afterBiome === BIOME_DESERT);
            if (Math.abs(d) >= 4) expect(sand).toBe(desertSide);
          }
          for (let i = 1; i < out.count; i++) {
            const id = out.modelId[i];
            if (sand) {
              expect(isTree(id)).toBe(false);
              expect(isCarpet(id)).toBe(false);
            } else {
              expect(isCactus(id)).toBe(false);
            }
            if (isCactus(id)) cacti += 1;
            if (isTree(id)) trees += 1;
          }
        }
      }
      if (sandInZone > 0 && meadowInZone > 0) mixedBorders += 1;
    }
    expect(cacti).toBeGreaterThan(50);
    expect(trees).toBeGreaterThan(50);
    expect(mixedBorders / borders.length).toBeGreaterThan(0.8);
  });

  it('increases cactus counts and decreases tree shares toward desert', () => {
    const borders = findBorders(40, 900, true);
    const out = new CellPlacements();
    const offsets = [-4, -2, 0, 2, 4];
    const cactusAt = new Float64Array(offsets.length);
    const treeAt = new Float64Array(offsets.length);
    for (const border of borders) {
      const gen = createRingWorldGenerator();
      gen.startEpoch(border.seed);
      // Positive offsets point toward the desert.
      const sign = border.afterBiome === BIOME_DESERT ? 1 : -1;
      for (let k = 0; k < offsets.length; k++) {
        const c = border.column + offsets[k] * sign;
        if (c < 0) continue;
        for (let j = 2; j <= 6; j++) {
          gen.cell(c, j, out);
          for (let i = 1; i < out.count; i++) {
            if (isCactus(out.modelId[i])) cactusAt[k] += 1;
            else if (isTree(out.modelId[i])) treeAt[k] += 1;
          }
        }
      }
    }
    // Base density changes from 0.6 in meadow to 0.8 in desert. Compare tree shares to isolate species proportions.
    for (let k = 1; k < offsets.length; k++) {
      expect(cactusAt[k]).toBeGreaterThanOrEqual(cactusAt[k - 1]);
      const here = treeAt[k] / (treeAt[k] + cactusAt[k]);
      const before = treeAt[k - 1] / (treeAt[k - 1] + cactusAt[k - 1]);
      expect(here).toBeLessThanOrEqual(before);
    }
    const last = offsets.length - 1;
    expect(cactusAt[last]).toBeGreaterThan(cactusAt[0]);
    expect(treeAt[0]).toBeGreaterThan(treeAt[last]);
    expect(cactusAt[2]).toBeGreaterThan(0);
    expect(treeAt[2]).toBeGreaterThan(0);
  });

  it('keeps the horizon chain unbroken across a zone', () => {
    const borders = findBorders(40, 900, true);
    expect(borders.length).toBeGreaterThan(10);
    const out = new CellPlacements();
    for (const border of borders) {
      const gen = createRingWorldGenerator();
      gen.startEpoch(border.seed);
      // Profile 1 shows the sea horizon. Exclude adjacent borders because warped ownership can assign their columns to that profile.
      if (gen.planFor(border.column).profile === 1 || gen.planFor(border.column - 1).profile === 1) continue;
      for (let d = -6; d <= 6; d++) {
        const c = border.column + d;
        if (c < 0) continue;
        const plan = gen.planFor(c);
        if (plan.profile === 1 || gen.featurePlanFor(c).riverCorners[(c % 64) * 11] !== 15) continue; // Exclude river cells.
        gen.cell(c, 0, out);
        let chain = 0;
        for (let i = 1; i < out.count; i++) if (isChain(out.modelId[i])) chain += 1;
        expect(chain).toBe(1);
      }
    }
  });

  it('mixes both seasons within the season blend zone', () => {
    const borders = findBorders(60, 1800, false);
    expect(borders.length).toBeGreaterThan(5);
    const out = new CellPlacements();
    let mixed = 0;
    for (const border of borders) {
      const gen = createRingWorldGenerator();
      gen.startEpoch(border.seed);
      let before = 0;
      let after = 0;
      for (let d = -4; d <= 4; d++) {
        const c = border.column + d;
        for (let j = 2; j <= 6; j++) {
          gen.cell(c, j, out);
          const name = KIT_MODEL_NAMES[out.modelId[0]];
          if (!isGroundTile(out.modelId[0])) continue;
          if (name.indexOf(seasonSuffix(border.beforeSeason)) > 0) before += 1;
          if (name.indexOf(seasonSuffix(border.afterSeason)) > 0) after += 1;
        }
      }
      if (before > 0 && after > 0) mixed += 1;
    }
    expect(mixed / borders.length).toBeGreaterThan(0.8);
  });
});

function seasonSuffix(season: number): string {
  if (season === 0) return 'spring';
  if (season === 1) return 'summer';
  if (season === 2) return 'autumn';
  return 'winter';
}
