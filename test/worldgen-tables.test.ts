import { describe, expect, it } from 'vitest';
import { KIT_MODEL_COUNT, KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { sharedKit } from '../src/kit/kit';
import { SEASON_AUTUMN, SEASON_SPRING, SEASON_SUMMER, SEASON_WINTER } from '../src/worldgen/placements';
import {
  F,
  FAMILY_COUNT,
  FAM_CACTUS_FORK,
  FAM_CACTUS_SAGUARO_GREEN,
  FAM_CACTUS_SAGUARO_TEAL,
  FAM_CANYON_PILLAR,
  FAM_CONIFER_BROAD,
  FAM_CONIFER_CLUSTER,
  FAM_CONIFER_SPIRE,
  FAM_CONIFER_TRIANGLE,
  FAM_DECID_ROUND,
  FAM_DECID_WINDSWEPT,
  FAM_DESERT_MESA,
  FAM_GRASS_TUFT,
  FAM_GROUND_MEADOW,
  FAM_GROUND_SAND,
  FAM_HILL_ASYM,
  FAM_HILL_ROUND,
  FAM_ICE_PATCH,
  FAM_JAGGED_PATCH,
  FAM_MOUNTAIN_SNOW,
  FAM_MOUNTAIN_TWIN,
  FAM_RIDGE_TEAL,
  FAM_RIDGE_VIOLET,
  FAM_ROCK_CLUSTER,
  FAM_SHORE_SADDLE,
  FAM_SHORE_OUTER,
  FAM_SHORE_INNER,
  FAM_SHORE_END,
  FAM_SHORE_COVE,
  FAM_SHORE_HEADLAND,
  FAM_SHORE_STRAIGHT,
  FAM_SHRUB_LOBED,
  FAM_SNOW_DRIFT,
  FAM_WATER_CANYON,
  FAM_WATER_SEA,
  MODEL_TOP_U,
  ROAD_PIECE,
  ROAD_QUARTER,
  variantModel,
} from '../src/worldgen/tables';

/** Model names appear in spring, summer, autumn, winter order. */
const VARIANT_TABLE: Array<[number, string[]]> = [
  [FAM_SHORE_SADDLE, ['shore_saddle__spring', 'shore_saddle', 'shore_saddle__autumn', 'shore_saddle__winter']],
  [FAM_GROUND_MEADOW, ['ground_meadow_spring', 'ground_meadow_summer', 'ground_meadow_autumn', 'ground_meadow_winter']],
  [FAM_GROUND_SAND, ['ground_meadow_dry_sand', 'ground_meadow_dry_sand', 'ground_meadow_dry_sand', 'ground_meadow_dry_sand']],
  [FAM_WATER_SEA, ['water_open_blue', 'water_open_blue', 'water_open_blue', 'water_open_blue']],
  [FAM_WATER_CANYON, ['water_open_teal', 'water_open_teal', 'water_open_teal', 'water_open_teal']],
  [FAM_SHORE_STRAIGHT, ['shore_straight__spring', 'shore_straight', 'shore_straight__autumn', 'shore_straight__winter']],
  [FAM_SHORE_COVE, ['shore_cove__spring', 'shore_cove', 'shore_cove__autumn', 'shore_cove__winter']],
  [FAM_SHORE_HEADLAND, ['shore_headland__spring', 'shore_headland', 'shore_headland__autumn', 'shore_headland__winter']],
  [FAM_SHORE_OUTER, ['shore_corner_outer__spring', 'shore_corner_outer', 'shore_corner_outer__autumn', 'shore_corner_outer__winter']],
  [FAM_SHORE_INNER, ['shore_corner_inner__spring', 'shore_corner_inner', 'shore_corner_inner__autumn', 'shore_corner_inner__winter']],
  [FAM_SHORE_END, ['shore_end_cap__spring', 'shore_end_cap', 'shore_end_cap__autumn', 'shore_end_cap__winter']],
  [FAM_HILL_ROUND, ['hill_round_spring', 'hill_round_summer', 'hill_round_autumn', 'hill_round_winter']],
  [FAM_HILL_ASYM, ['hill_asymmetric_summer__spring', 'hill_asymmetric_summer', 'hill_asymmetric_summer__autumn', 'hill_asymmetric_winter']],
  [FAM_MOUNTAIN_SNOW, ['mountain_snow_peak', 'mountain_snow_peak', 'mountain_snow_peak', 'mountain_snow_peak']],
  [FAM_MOUNTAIN_TWIN, ['mountain_twin_peak', 'mountain_twin_peak', 'mountain_twin_peak', 'mountain_twin_peak']],
  [FAM_DESERT_MESA, ['desert_mesa', 'desert_mesa', 'desert_mesa', 'desert_mesa']],
  [FAM_CANYON_PILLAR, ['canyon_pillar', 'canyon_pillar', 'canyon_pillar', 'canyon_pillar']],
  [FAM_RIDGE_VIOLET, ['distant_rolling_ridge_violet', 'distant_rolling_ridge_violet', 'distant_rolling_ridge_violet', 'distant_rolling_ridge_violet']],
  [FAM_RIDGE_TEAL, ['distant_rolling_ridge_teal', 'distant_rolling_ridge_teal', 'distant_rolling_ridge_teal', 'distant_rolling_ridge_teal']],
  [FAM_ROCK_CLUSTER, ['rock_cluster', 'rock_cluster', 'rock_cluster', 'rock_cluster']],
  [FAM_CONIFER_SPIRE, ['conifer_spire_spring', 'conifer_spire_summer', 'conifer_spire_autumn', 'conifer_spire_winter']],
  [FAM_CONIFER_BROAD, ['conifer_broad_spring', 'conifer_broad_summer', 'conifer_broad_autumn', 'conifer_broad_winter']],
  [FAM_CONIFER_CLUSTER, ['conifer_cluster_spring', 'conifer_cluster_summer', 'conifer_cluster_autumn', 'conifer_cluster_winter']],
  [FAM_CONIFER_TRIANGLE, ['conifer_clean_triangle__spring', 'conifer_clean_triangle', 'conifer_clean_triangle__autumn', 'conifer_cluster_winter']],
  [FAM_DECID_ROUND, ['deciduous_round_spring', 'deciduous_round_summer', 'deciduous_round_autumn', 'deciduous_round_winter']],
  [FAM_DECID_WINDSWEPT, ['deciduous_windswept_spring', 'deciduous_windswept_summer', 'deciduous_windswept_autumn', 'deciduous_windswept_winter']],
  [FAM_CACTUS_SAGUARO_GREEN, ['cactus_saguaro_green', 'cactus_saguaro_green', 'cactus_saguaro_green', 'cactus_saguaro_green']],
  [FAM_CACTUS_SAGUARO_TEAL, ['cactus_saguaro_teal', 'cactus_saguaro_teal', 'cactus_saguaro_teal', 'cactus_saguaro_teal']],
  [FAM_CACTUS_FORK, ['cactus_fork_teal', 'cactus_fork_teal', 'cactus_fork_teal', 'cactus_fork_teal']],
  [FAM_GRASS_TUFT, ['grass_tuft_spring', 'grass_tuft_summer', 'grass_tuft_autumn', '']],
  [FAM_SHRUB_LOBED, ['shrub_lobed_summer__spring', 'shrub_lobed_summer', 'shrub_lobed_autumn', '']],
  [FAM_JAGGED_PATCH, ['ground_jagged_patch', 'ground_jagged_patch', 'ground_jagged_patch__autumn', '']],
  [FAM_ICE_PATCH, ['', '', '', 'ice_patch']],
  [FAM_SNOW_DRIFT, ['', '', '', 'snow_drift']],
];

const SEASONS = [SEASON_SPRING, SEASON_SUMMER, SEASON_AUTUMN, SEASON_WINTER];

describe('world generation tables', () => {
  it('resolves each family and season to its expected model or explicit omission', () => {
    expect(VARIANT_TABLE.length).toBe(FAMILY_COUNT);
    for (const [family, names] of VARIANT_TABLE) {
      for (let s = 0; s < 4; s++) {
        const id = variantModel(family, SEASONS[s]);
        if (names[s] === '') {
          expect(id).toBe(-1);
          continue;
        }
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(KIT_MODEL_COUNT);
        expect(KIT_MODEL_NAMES[id]).toBe(names[s]);
      }
    }
  });

  it('stores each known model top in game units', () => {
    const kit = sharedKit();
    expect(MODEL_TOP_U.length).toBe(KIT_MODEL_COUNT);
    let known = 0;
    for (let id = 0; id < KIT_MODEL_COUNT; id++) {
      if (MODEL_TOP_U[id] === 0) continue; // Skip models without a stored height.
      known += 1;
      expect(MODEL_TOP_U[id]).toBeCloseTo(kit.modelById(id).bboxMax[1] * F, 2);
    }
    expect(known).toBeGreaterThan(80);
    for (const [family] of VARIANT_TABLE) {
      for (let s = 0; s < 4; s++) {
        const id = variantModel(family, SEASONS[s]);
        if (id >= 0) expect(MODEL_TOP_U[id]).toBeGreaterThan(0);
      }
    }
  });

  it('maps 14 road masks and excludes a four-way crossing', () => {
    expect(ROAD_PIECE[0]).toBe(-1);
    expect(ROAD_PIECE[15]).toBe(-1);
    let pieces = 0;
    for (let mask = 1; mask < 15; mask++) {
      expect(ROAD_PIECE[mask]).toBeGreaterThanOrEqual(0);
      expect(ROAD_QUARTER[mask]).toBeGreaterThanOrEqual(0);
      expect(ROAD_QUARTER[mask]).toBeLessThan(4);
      pieces += 1;
    }
    expect(pieces).toBe(14);
  });
});
