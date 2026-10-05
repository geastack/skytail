import { COLS_PER_SEASON, RING_ROWS, STRETCH_W_MAX, STRETCH_W_MIN } from '../config';
import { rand4 } from './hash';
import { fieldT } from './fields';
import { simplex2 } from './simplex';
import {
  ALPINE_TEMP,
  BIOME_ALPINE,
  BIOME_BASE_WEIGHT,
  BIOME_COUNT,
  BIOME_DESERT,
  BIOME_LEGAL,
  BIOME_MEADOW,
  BIOME_REPEAT_WEIGHT,
  PROFILE_FAR_COAST,
  PROFILE_INLAND,
  PROFILE_KEEP_P,
  PROFILE_NEAR_COAST,
  PROFILE_WEIGHT,
  ROW_BAND,
  SALT_BIOME,
  SALT_PROFILE,
  SALT_PROFILE_KEEP,
  SALT_SEASON,
  SALT_SHORE,
  SALT_WIDTH,
  SEASON_TEMP,
  SNOW_JITTER,
  SNOW_T_EFF,
  SURFACE_LAND,
  SURFACE_SHORE,
  SURFACE_WATER,
} from './tables';

export class ExitState {
  biome = BIOME_MEADOW;
  previousBiome = -1;
  profile = PROFILE_INLAND;
  coastRunStart = 0;
  /** This is the first column of the next stretch. */
  nextStart = 0;

  reset(): void {
    this.biome = BIOME_MEADOW;
    this.previousBiome = -1;
    this.profile = PROFILE_INLAND;
    this.coastRunStart = 0;
    this.nextStart = 0;
  }
}

export class StretchPlan {
  g = -1;
  seed = 0;
  start = 0;
  width = 0;
  /** end is one past the final column of the stretch. */
  end = 0;
  biome = BIOME_MEADOW;
  profile = PROFILE_INLAND;
  season = 0;
  /** This is the first column of the coast run that contains the stretch. */
  coastRunStart = 0;
}

const biomeWeight = new Float32Array(BIOME_COUNT);

export function seasonOf(seed: number, startCol: number): number {
  const seasonStart = Math.floor(rand4(seed, 0, 0, SALT_SEASON) * 4);
  return (seasonStart + Math.floor(startCol / COLS_PER_SEASON)) % 4;
}

function pickBiome(seed: number, g: number, prev: number, beforePrev: number, t: number): number {
  const legal = BIOME_LEGAL[prev];
  let total = 0;
  for (let b = 0; b < BIOME_COUNT; b++) {
    let w = 0;
    if ((legal & (1 << b)) !== 0) {
      w = BIOME_BASE_WEIGHT;
      if (b === BIOME_ALPINE) w = Math.max(0, -t) + 0.1;
      else if (b === BIOME_DESERT) w = Math.max(0, t) + 0.1;
      if (prev === BIOME_MEADOW && b === BIOME_ALPINE && t >= 0) w = 0;
      if (prev === BIOME_MEADOW && b === BIOME_DESERT && t <= 0) w = 0;
      if (b === prev) w *= BIOME_REPEAT_WEIGHT;
      else if (b === beforePrev) w = 0; // Prevent a biome sequence of A, B, A.
    }
    biomeWeight[b] = w;
    total += w;
  }
  let r = rand4(seed, g, 0, SALT_BIOME) * total;
  for (let b = 0; b < BIOME_COUNT; b++) {
    r -= biomeWeight[b];
    if (r < 0) return b;
  }
  return BIOME_MEADOW;
}

export function profileLegal(biome: number, profile: number): boolean {
  if (biome === BIOME_DESERT) return profile === PROFILE_INLAND;
  if (biome === BIOME_ALPINE) return profile !== PROFILE_NEAR_COAST;
  return true;
}

function pickProfile(seed: number, g: number, biome: number, prev: number): number {
  if (profileLegal(biome, prev) && rand4(seed, g, 1, SALT_PROFILE_KEEP) < PROFILE_KEEP_P) return prev;
  let total = 0;
  for (let p = 0; p < 3; p++) {
    if (profileLegal(biome, p)) total += PROFILE_WEIGHT[p];
  }
  let r = rand4(seed, g, 2, SALT_PROFILE) * total;
  for (let p = 0; p < 3; p++) {
    if (!profileLegal(biome, p)) continue;
    r -= PROFILE_WEIGHT[p];
    if (r < 0) return p;
  }
  return PROFILE_INLAND;
}

/**
 * Plan the stretch from the preceding exit state, then advance that state.
 * The first stretch uses inland meadow, which can follow any biome.
 */
export function planStretch(seed: number, g: number, exit: ExitState, out: StretchPlan): void {
  out.g = g;
  out.seed = seed;
  out.start = exit.nextStart;
  out.width = STRETCH_W_MIN + Math.floor(rand4(seed, g, 0, SALT_WIDTH) * (STRETCH_W_MAX - STRETCH_W_MIN + 1));
  out.end = out.start + out.width;
  const t = fieldT(seed, out.start + (out.width >> 1));
  if (g === 0) {
    out.biome = BIOME_MEADOW;
    out.profile = PROFILE_INLAND;
  } else {
    out.biome = pickBiome(seed, g, exit.biome, exit.previousBiome, t);
    out.profile = pickProfile(seed, g, out.biome, exit.profile);
  }
  out.coastRunStart = g > 0 && out.profile === exit.profile ? exit.coastRunStart : out.start;
  out.season = seasonOf(seed, out.start);
  exit.previousBiome = exit.biome;
  exit.biome = out.biome;
  exit.profile = out.profile;
  exit.coastRunStart = out.coastRunStart;
  exit.nextStart = out.end;
}

/** Coast depth uses rows at a shared vertex column. It reaches zero at both ends of the coast run. */
export function coastDepth(cur: StretchPlan, next: StretchPlan, x: number): number {
  if (cur.profile === PROFILE_INLAND) return 0;
  const toEnd = next.profile === cur.profile ? 99 : cur.end - 0.5 - x;
  const distance = Math.min(x - (cur.coastRunStart - 0.5), toEnd);
  const t = Math.max(0, Math.min(1, distance / 8));
  const depth = 3.25 + 0.45 * simplex2(cur.seed, x / 18, 0.5, SALT_SHORE);
  return depth * t * t * (3 - 2 * t);
}

function coastLand(profile: number, depth: number, row: number): boolean {
  if (profile === PROFILE_FAR_COAST) return row >= -0.5 + depth;
  return row <= RING_ROWS - 0.5 - depth;
}

/** Land-corner bits are NW=1, NE=2, SE=4, SW=8. North is -Z. */
export function shoreMask(cur: StretchPlan, next: StretchPlan, c: number, j: number): number {
  if (cur.profile === PROFILE_INLAND) return 15;
  const west = coastDepth(cur, next, c - 0.5);
  const east = coastDepth(cur, next, c + 0.5);
  let mask = 0;
  if (coastLand(cur.profile, west, j - 0.5)) mask |= 1;
  if (coastLand(cur.profile, east, j - 0.5)) mask |= 2;
  if (coastLand(cur.profile, east, j + 0.5)) mask |= 4;
  if (coastLand(cur.profile, west, j + 0.5)) mask |= 8;
  return mask;
}

export function surfaceAt(cur: StretchPlan, next: StretchPlan, c: number, j: number): number {
  const mask = shoreMask(cur, next, c, j);
  if (mask === 15) return SURFACE_LAND;
  return mask === 0 ? SURFACE_WATER : SURFACE_SHORE;
}

export function tEff(seed: number, c: number, j: number, biome: number, season: number): number {
  const alpine = biome === BIOME_ALPINE ? ALPINE_TEMP : 0;
  return fieldT(seed, c) + SEASON_TEMP[season] - ROW_BAND[j] + alpine;
}

export function snowCover(seed: number, c: number, j: number, biome: number, season: number): number {
  const t = Math.max(0, Math.min(1, (SNOW_T_EFF + SNOW_JITTER - tEff(seed, c, j, biome, season)) / (2 * SNOW_JITTER)));
  return t * t * (3 - 2 * t);
}

/** Use the midpoint of the colour snow field to select snow geometry and features. */
export function isSnowy(seed: number, c: number, j: number, biome: number, season: number): boolean {
  return snowCover(seed, c, j, biome, season) >= 0.5;
}
