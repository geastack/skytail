import { describe, expect, it } from 'vitest';
import { RING_ROWS, STRETCH_W_MIN } from '../src/config';
import { sharedKit } from '../src/kit/kit';
import { KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { borderPosition, CellWriter, edgeBlendT } from '../src/worldgen/cell';
import { createRingWorldGenerator } from '../src/worldgen/generator';
import { groundChannel, waterChannel, WATER_TOP_LINEAR } from '../src/worldgen/palette';
import { CellPlacements } from '../src/worldgen/placements';
import { simplex2 } from '../src/worldgen/simplex';
import { ExitState, planStretch, shoreMask, StretchPlan } from '../src/worldgen/stretch';
import { groundTopSlot, TILE_TOP_LINEAR, WATER_ICE, ZONE_COLS_DEFAULT, ZONE_WARP_COLS } from '../src/worldgen/tables';

describe('world generation', () => {
  it('produces bounded, continuous simplex noise with values below -0.7 and above 0.7', () => {
    let low = 1;
    let high = -1;
    let maxStep = 0;
    for (let seed = 0; seed < 20; seed++) {
      for (let i = -100; i < 100; i++) {
        const x = i * 0.073;
        const z = i * 0.047 + seed;
        const n = simplex2(seed, x, z, 77);
        low = Math.min(low, n);
        high = Math.max(high, n);
        maxStep = Math.max(maxStep, Math.abs(n - simplex2(seed, x + 0.00001, z, 77)));
        expect(simplex2(seed, x, z, 77)).toBe(n);
      }
    }
    expect(low).toBeGreaterThanOrEqual(-1);
    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(-0.7);
    expect(high).toBeGreaterThan(0.7);
    expect(maxStep).toBeLessThan(0.0002);
  });

  it('warps every border while preserving a core at least 16 columns wide and continuous ownership', () => {
    let minWander = 100;
    let minCore = 100;
    let ownershipErrors = 0;
    for (let seed = 0; seed < 100; seed++) {
      const exit = new ExitState();
      const a = new StretchPlan();
      const b = new StretchPlan();
      planStretch(seed, 0, exit, a);
      for (let g = 1; g < 30; g++) {
        planStretch(seed, g, exit, b);
        const mid = b.start - 0.5;
        let low = Infinity;
        let high = -Infinity;
        for (let j = 0; j < RING_ROWS; j++) {
          const boundary = borderPosition(seed, mid, j);
          low = Math.min(low, boundary);
          high = Math.max(high, boundary);
          let crossings = 0;
          let wasRight = false;
          for (let c = b.start - 10; c <= b.start + 10; c++) {
            const right = edgeBlendT(seed, c, j, mid, 1, 4.5) >= 0.5;
            if (right !== wasRight) crossings++;
            wasRight = right;
          }
          if (crossings !== 1) ownershipErrors++;
        }
        minWander = Math.min(minWander, high - low);
        minCore = Math.min(minCore, b.width - 2 * ZONE_WARP_COLS - ZONE_COLS_DEFAULT);
      }
    }
    expect(ownershipErrors).toBe(0);
    expect(minWander).toBeGreaterThanOrEqual(2.1);
    expect(minCore).toBeGreaterThanOrEqual(16);
    expect(STRETCH_W_MIN).toBe(32);
  });

  it('renders the corner mask it sampled, including outer, inner and terminal pieces', () => {
    const seen = new Set<string>();
    let errors = 0;
    const out = new CellPlacements();
    const exit = new ExitState();
    const plans = [new StretchPlan(), new StretchPlan(), new StretchPlan()];
    const writer = new CellWriter();
    for (const seed of [0, 1, 2026, 0x436f796f]) {
      exit.reset();
      planStretch(seed, 0, exit, plans[0]);
      planStretch(seed, 1, exit, plans[1]);
      for (let g = 0; g < 25; g++) {
        const current = plans[g % 3];
        const next = plans[(g + 1) % 3];
        const previous = g === 0 ? current : plans[(g + 2) % 3];
        for (let c = current.start; c < current.end; c++) {
          for (let j = 0; j < RING_ROWS; j++) {
            writer.write(seed, c, j, previous, current, next, out);
            const name = KIT_MODEL_NAMES[out.modelId[0]];
            if (!name.startsWith('shore_')) continue;
            const base = name.split('__')[0];
            seen.add(base);
            let mask = base === 'shore_corner_outer' ? 1 : base === 'shore_corner_inner' || base === 'shore_end_cap' ? 11 : 3;
            const turns = Math.round(out.yaw[0] / (Math.PI / 2));
            for (let q = 0; q < turns; q++) mask = (mask >> 1) | ((mask & 1) << 3);
            if (mask !== shoreMask(current, next, c, j)) errors++;
            // Curved shore geometry excludes scattered props.
            if (out.count !== 1) errors++;
          }
        }
        planStretch(seed, g + 2, exit, plans[(g + 2) % 3]);
      }
    }
    expect(errors).toBe(0);
    for (const name of ['shore_corner_outer', 'shore_corner_inner', 'shore_end_cap', 'shore_straight', 'shore_cove', 'shore_headland']) {
      expect(seen.has(name), name).toBe(true);
    }
  });

  it('matches a shared target color through green, sand, snow and ice boundaries', () => {
    const writer = new CellWriter();
    const out = new CellPlacements();
    let maxError = 0;
    let winterTinted = 0;
    let waterTinted = 0;
    // Each tuple contains the preceding biome and season, then the following biome and season.
    for (const [ba, sa, bb, sb] of [[0, 1, 1, 1], [0, 2, 4, 2], [0, 3, 0, 0], [0, 3, 3, 3]]) {
      for (const profile of [0, 1]) {
        const a = new StretchPlan();
        const b = new StretchPlan();
        a.g = 0; a.start = 0; a.end = 64; a.width = 64; a.biome = ba; a.season = sa;
        b.g = 1; b.start = 64; b.end = 128; b.width = 64; b.biome = bb; b.season = sb;
        a.profile = profile; b.profile = profile;
        for (let c = 53; c < 76; c++) {
          for (let j = 0; j < RING_ROWS; j++) {
            writer.write(0, c, j, a, c < 64 ? a : b, b, out);
            const id = out.modelId[0];
            const name = KIT_MODEL_NAMES[id];
            const isWater = name.startsWith('water_');
            const isShore = name.startsWith('shore_');
            const season = name.endsWith('__winter') ? 3 : name.endsWith('__spring') ? 0 : name.endsWith('__autumn') ? 2 : 1;
            const slot = isShore ? season : groundTopSlot(id);
            const waterSlot = (isShore ? season === 3 : id === WATER_ICE) ? 1 : 0;
            const t = edgeBlendT(0, c, j, 63.5, 1, 4.5);
            for (let ch = 0; ch < 3; ch++) {
              const expectedLand = groundChannel(0, c, j, ba, sa, ch) * (1 - t) + groundChannel(0, c, j, bb, sb, ch) * t;
              const expectedWater = waterChannel(ba, sa, ch) * (1 - t) + waterChannel(bb, sb, ch) * t;
              const actual = out.tint[ch] * (isWater ? WATER_TOP_LINEAR[waterSlot * 3 + ch] : TILE_TOP_LINEAR[slot * 3 + ch]);
              maxError = Math.max(maxError, Math.abs(actual - (isWater ? expectedWater : expectedLand)));
              if (isShore) maxError = Math.max(maxError, Math.abs(out.waterTint[ch] * WATER_TOP_LINEAR[waterSlot * 3 + ch] - expectedWater));
              if (name.includes('winter') && out.tint[ch] !== 1) winterTinted++;
              if (isWater && out.tint[ch] !== 1) waterTinted++;
            }
          }
        }
      }
    }
    expect(maxError).toBeLessThan(0.000001);
    expect(winterTinted).toBeGreaterThan(0);
    expect(waterTinted).toBeGreaterThan(0);
  });

  it('matches the baked palette values for every ground and shore season', () => {
    const kit = sharedKit();
    for (let id = 0; id < KIT_MODEL_NAMES.length; id++) {
      const name = KIT_MODEL_NAMES[id];
      const groundSlot = groundTopSlot(id);
      const shore = name.startsWith('shore_');
      const water = name === 'water_open_blue' || name === 'water_open_ice';
      if (groundSlot < 0 && !shore && !water) continue;
      const season = name.endsWith('__winter') ? 3 : name.endsWith('__spring') ? 0 : name.endsWith('__autumn') ? 2 : 1;
      for (const part of shore ? ['main', 'Water'] : ['main']) {
        const wet = water || part === 'Water';
        const palette = wet ? WATER_TOP_LINEAR : TILE_TOP_LINEAR;
        const slot = wet ? ((shore ? season === 3 : name === 'water_open_ice') ? 1 : 0) : (shore ? season : groundSlot);
        const colors = kit.mesh(name, part).colors;
        let found = false;
        for (let k = 0; k < colors.length; k += 3) {
          if (Math.abs(colors[k] - palette[slot * 3]) < 0.000001 &&
              Math.abs(colors[k + 1] - palette[slot * 3 + 1]) < 0.000001 &&
              Math.abs(colors[k + 2] - palette[slot * 3 + 2]) < 0.000001) found = true;
        }
        expect(found, name + '/' + part).toBe(true);
      }
    }
  });

  it('keeps tint gains finite and applies environment colours only to tile placements', () => {
    const generator = createRingWorldGenerator();
    const out = new CellPlacements();
    let invalid = 0;
    let maxGain = 0;
    for (const seed of [0, 1, 2026, 0x436f796f]) {
      generator.startEpoch(seed);
      for (let c = 0; c < 900; c++) {
        for (let j = 0; j < RING_ROWS; j++) {
          generator.cell(c, j, out);
          for (let i = 0; i < out.count * 3; i++) {
            for (const gain of [out.tint[i], out.waterTint[i]]) {
              if (!Number.isFinite(gain) || gain <= 0 || gain > 40) invalid++;
              if (i >= 3 && gain !== 1) invalid++;
              maxGain = Math.max(maxGain, gain);
            }
          }
        }
      }
    }
    expect(invalid).toBe(0);
    expect(maxGain).toBeGreaterThan(2.5);
  });
});
