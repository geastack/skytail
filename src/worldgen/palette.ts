import { SEASON_WINTER } from './placements';
import { snowCover } from './stretch';
import { BIOME_ALPINE, BIOME_DESERT, GROUND_SLOT_SAND, TILE_TOP_LINEAR } from './tables';

/** Baked top-face colours, divided by 255, for blue water and ice. Open water and shore Water parts share these colours. */
export const WATER_TOP_LINEAR = new Float32Array([7 / 255, 28 / 255, 104 / 255, 159 / 255, 179 / 255, 224 / 255]);

// RGB gains follow biome order: meadow, woodland, conifer, alpine, desert.
export const GRASS_BIOME_GAIN = new Float32Array([
  1, 1, 1, 0.76, 0.87, 0.82, 0.72, 0.83, 1.15, 0.86, 0.9, 1.06, 1, 1, 1,
]);
const WATER_BIOME_GAIN = new Float32Array([
  1, 1, 1, 0.82, 1.28, 0.87, 0.82, 1.1, 0.96, 1.15, 1.15, 1.08, 1.05, 1.14, 0.95,
]);

/** Return one ground colour channel in linear light before border interpolation. */
export function groundChannel(seed: number, c: number, j: number, biome: number, season: number, channel: number): number {
  if (biome === BIOME_DESERT) return TILE_TOP_LINEAR[GROUND_SLOT_SAND * 3 + channel];
  const snow = TILE_TOP_LINEAR[SEASON_WINTER * 3 + channel];
  if (season === SEASON_WINTER) return snow;
  const grass = TILE_TOP_LINEAR[season * 3 + channel] * GRASS_BIOME_GAIN[biome * 3 + channel];
  if (biome !== BIOME_ALPINE) return grass;
  const coverage = snowCover(seed, c, j, biome, season);
  return grass + (snow - grass) * coverage;
}

export function waterChannel(biome: number, season: number, channel: number): number {
  if (biome === BIOME_ALPINE && season === SEASON_WINTER) return WATER_TOP_LINEAR[3 + channel];
  return WATER_TOP_LINEAR[channel] * WATER_BIOME_GAIN[biome * 3 + channel];
}
