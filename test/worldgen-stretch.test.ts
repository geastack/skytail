import { describe, expect, it } from 'vitest';
import { COLS_PER_SEASON, SPLASH_SEED, STRETCH_W_MAX, STRETCH_W_MIN } from '../src/config';
import { ExitState, planStretch, profileLegal, seasonOf, coastDepth, shoreMask, StretchPlan, surfaceAt } from '../src/worldgen/stretch';
import {
  BIOME_ALPINE,
  BIOME_COUNT,
  BIOME_DESERT,
  BIOME_LEGAL,
  BIOME_MEADOW,
  PROFILE_FAR_COAST,
  PROFILE_INLAND,
  PROFILE_NEAR_COAST,
  SURFACE_LAND,
  SURFACE_SHORE,
  SURFACE_WATER,
} from '../src/worldgen/tables';

const STRETCHES = 10000;

describe('stretch chain', () => {
  it('keeps 10 000 stretches legal, sized and continuous', () => {
    const exit = new ExitState();
    const plans = [new StretchPlan(), new StretchPlan()];
    exit.reset();
    let previousBiome = -1;
    let beforePreviousBiome = -1;
    let previousProfile = -1;
    let previousEnd = 0;
    const seasonStart = seasonOf(SPLASH_SEED, 0);
    const biomeSeen = new Int32Array(BIOME_COUNT);
    for (let g = 0; g < STRETCHES; g++) {
      const plan = plans[g % 2];
      planStretch(SPLASH_SEED, g, exit, plan);
      expect(plan.width).toBeGreaterThanOrEqual(STRETCH_W_MIN);
      expect(plan.width).toBeLessThanOrEqual(STRETCH_W_MAX);
      expect(plan.start).toBe(previousEnd);
      expect(plan.end).toBe(plan.start + plan.width);
      if (g === 0) {
        expect(plan.biome).toBe(BIOME_MEADOW);
        expect(plan.profile).toBe(PROFILE_INLAND);
      } else {
        expect((BIOME_LEGAL[previousBiome] >> plan.biome) & 1).toBe(1);
        if (plan.biome === BIOME_DESERT) expect(previousBiome === BIOME_ALPINE).toBe(false);
        if (plan.biome === BIOME_ALPINE) expect(previousBiome === BIOME_DESERT).toBe(false);
      }
      expect(profileLegal(plan.biome, plan.profile)).toBe(true);
      expect(plan.season).toBe((seasonStart + Math.floor(plan.start / COLS_PER_SEASON)) % 4);
      if (plan.profile === previousProfile) expect(plan.coastRunStart).toBeLessThanOrEqual(plan.start);
      else expect(plan.coastRunStart).toBe(plan.start);
      biomeSeen[plan.biome] += 1;
      if (previousBiome !== plan.biome) expect(plan.biome).not.toBe(beforePreviousBiome);
      beforePreviousBiome = previousBiome;
      previousBiome = plan.biome;
      previousProfile = plan.profile;
      previousEnd = plan.end;
    }
    for (let b = 0; b < BIOME_COUNT; b++) expect(biomeSeen[b]).toBeGreaterThan(100);
  }, 30000);

  it('closes every coast run at an all-land edge and preserves matching vertices', () => {
    const exit = new ExitState();
    const current = new StretchPlan();
    const next = new StretchPlan();
    planStretch(SPLASH_SEED, 0, exit, current);
    let runs = 0;
    let errors = 0;
    for (let g = 1; g < 2000; g++) {
      planStretch(SPLASH_SEED, g, exit, next);
      if (current.profile !== PROFILE_INLAND) {
        if (current.coastRunStart === current.start) expect(coastDepth(current, next, current.start - 0.5)).toBe(0);
        if (next.profile !== current.profile) {
          expect(coastDepth(current, next, current.end - 0.5)).toBe(0);
          runs += 1;
        }
      }
      for (let c = current.start; c < current.end; c++) {
        for (let j = 0; j < 11; j++) {
          const m = shoreMask(current, next, c, j);
          const e = c + 1 === current.end ? shoreMask(next, next, c + 1, j) : shoreMask(current, next, c + 1, j);
          if (((m >> 1) & 1) !== (e & 1) || ((m >> 2) & 1) !== ((e >> 3) & 1)) errors++;
          if (j < 10) {
            const s = shoreMask(current, next, c, j + 1);
            if (((m >> 3) & 1) !== (s & 1) || ((m >> 2) & 1) !== ((s >> 1) & 1)) errors++;
          }
          if (m === 5 || m === 10) errors++; // Masks 5 and 10 contain diagonal land corners.
        }
      }
      copyPlan(next, current);
    }
    expect(errors).toBe(0);
    expect(runs).toBeGreaterThan(50);
  });

  it('keeps campsite rows dry under every profile', () => {
    const exit = new ExitState();
    const current = new StretchPlan();
    const next = new StretchPlan();
    exit.reset();
    planStretch(SPLASH_SEED, 0, exit, current);
    for (let g = 1; g < 500; g++) {
      planStretch(SPLASH_SEED, g, exit, next);
      for (let c = current.start; c < current.end; c++) {
        expect(surfaceAt(current, next, c, 4)).toBe(SURFACE_LAND);
        expect(surfaceAt(current, next, c, 5)).toBe(SURFACE_LAND);
      }
      copyPlan(next, current);
    }
  }, 30000);

  it('gives a different seed a different chain', () => {
    const a = new StretchPlan();
    const b = new StretchPlan();
    const exitA = new ExitState();
    const exitB = new ExitState();
    exitA.reset();
    exitB.reset();
    let different = 0;
    let nearCoast = 0;
    for (let g = 0; g < 50; g++) {
      planStretch(SPLASH_SEED, g, exitA, a);
      planStretch(0x1234abcd, g, exitB, b);
      if (a.width !== b.width || a.biome !== b.biome || a.profile !== b.profile) different += 1;
      if (a.profile === PROFILE_NEAR_COAST) nearCoast += 1;
    }
    expect(different).toBeGreaterThan(20);
    expect(nearCoast).toBeGreaterThan(0);
  });
});

function copyPlan(from: StretchPlan, to: StretchPlan): void {
  to.g = from.g;
  to.seed = from.seed;
  to.start = from.start;
  to.width = from.width;
  to.end = from.end;
  to.biome = from.biome;
  to.profile = from.profile;
  to.season = from.season;
  to.coastRunStart = from.coastRunStart;
}
