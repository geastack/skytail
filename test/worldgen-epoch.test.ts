import { describe, expect, it } from 'vitest';
import { Scene } from 'three/src/scenes/Scene.js';
import { RING_ROWS, SPLASH_SEED } from '../src/config';
import { TerrainRing } from '../src/world/terrain-ring';
import { RingWorldGenerator } from '../src/worldgen/generator';
import { borderPosition, edgeBlendT } from '../src/worldgen/cell';
import { groundChannel } from '../src/worldgen/palette';
import { CellPlacements } from '../src/worldgen/placements';
import { shoreMask, StretchPlan } from '../src/worldgen/stretch';
import { groundTopSlot, PROFILE_INLAND, TILE_TOP_LINEAR, zoneColumns } from '../src/worldgen/tables';

function snapshot(out: CellPlacements): number[] {
  const result: number[] = [];
  for (let k = 0; k < out.count; k++) {
    result.push(out.modelId[k], out.x[k], out.y[k], out.z[k], out.yaw[k], out.scale[k]);
    for (let ch = 0; ch < 3; ch++) result.push(out.tint[k * 3 + ch], out.waterTint[k * 3 + ch]);
  }
  return result;
}

function planCopy(gen: RingWorldGenerator, c: number): StretchPlan {
  const plan = gen.planFor(c);
  return Object.assign(new StretchPlan(), plan);
}

class RecordedGenerator extends RingWorldGenerator {
  resets = 0;
  requests = 0;
  requestedColumn = -1;
  readonly columns: number[] = [];
  startEpoch(seed: number): void {
    this.resets++;
    super.startEpoch(seed);
  }
  transitionEpoch(seed: number, c: number): void {
    this.requests++;
    this.requestedColumn = c;
    super.transitionEpoch(seed, c);
  }
  cell(c: number, j: number, out: CellPlacements): void {
    if (j === 0) this.columns.push(c);
    super.cell(c, j, out);
  }
}

describe('live seed handoffs', () => {
  it('keeps the renderer column sequence and never resets a running world', () => {
    const gen = new RecordedGenerator();
    const ring = new TerrainRing(new Scene(), gen);
    for (const seed of [1234, 5678, 9012]) {
      const frontier = ring.frontierColumn;
      ring.transitionEpoch(seed);
      for (let f = 0; f < 800; f++) ring.update(0.01, 16.7, 0);
      expect(gen.requestedColumn).toBeGreaterThanOrEqual(frontier);
      expect(gen.requestedColumn).toBeLessThanOrEqual(frontier + 1);
    }
    expect(gen.resets).toBe(1);
    expect(gen.requests).toBe(3);
    expect(gen.columns).toEqual(Array.from({ length: gen.columns.length }, (_, i) => i));
    expect(ring.dropped).toBe(0);
  });

  it('preserves all written cells and leaves a full stretch before a seed change', () => {
    const out = new CellPlacements();
    for (let seed = 0; seed < 20; seed++) {
      const gen = new RingWorldGenerator();
      gen.startEpoch(seed);
      const firstEnd = gen.planFor(0).end;
      const frontier = firstEnd + (seed % 3 === 0 ? 0 : gen.planFor(firstEnd).width - 1);
      const current = planCopy(gen, frontier);
      const next = planCopy(gen, current.end);
      const before: number[][] = [];
      for (let c = 0; c < frontier; c++) for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        before.push(snapshot(out));
      }
      gen.transitionEpoch(seed + 100, frontier);
      expect(next.end - frontier).toBeGreaterThanOrEqual(32);
      expect(gen.planFor(next.end).seed).toBe(seed + 100);
      expect(gen.planFor(next.end).profile).toBe(PROFILE_INLAND);
      let at = 0;
      for (let c = 0; c < frontier; c++) for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        expect(snapshot(out)).toEqual(before[at++]);
      }
    }
  });

  it('uses the same wandering blend and matching coast vertices on both sides of a handoff', () => {
    const out = new CellPlacements();
    let coasts = 0;
    for (let seed = 0; seed < 30; seed++) {
      const gen = new RingWorldGenerator();
      gen.startEpoch(seed);
      const frontier = 63;
      const currentEnd = gen.planFor(frontier).end;
      const boundary = gen.planFor(currentEnd).end;
      gen.transitionEpoch(seed + 1000, frontier);
      const old = planCopy(gen, boundary - 1);
      const incoming = planCopy(gen, boundary);
      if (old.profile !== PROFILE_INLAND) coasts++;
      const half = Math.min(zoneColumns(old.biome, old.season, incoming.biome, incoming.season) / 2,
        (Math.min(old.width, incoming.width) - 16) / 2);
      const positions: number[] = [];
      for (let j = 0; j < RING_ROWS; j++) {
        positions.push(borderPosition(incoming.seed, boundary - 0.5, j));
        const left = shoreMask(old, incoming, boundary - 1, j);
        const right = shoreMask(incoming, incoming, boundary, j);
        expect((left >> 1) & 1).toBe(right & 1);
        expect((left >> 2) & 1).toBe((right >> 3) & 1);
        // Expected colours combine the prior seed snow field with the incoming seed border warp.
        for (const c of [boundary - 1, boundary]) {
          gen.cell(c, j, out);
          const t = edgeBlendT(incoming.seed, c, j, boundary - 0.5, 1, half);
          const ground = groundTopSlot(out.modelId[0]);
          const slot = ground >= 0 ? ground : (t >= 0.5 ? incoming : old).season;
          for (let ch = 0; ch < 3; ch++) {
            const expected = groundChannel(old.seed, c, j, old.biome, old.season, ch) * (1 - t) +
              groundChannel(incoming.seed, c, j, incoming.biome, incoming.season, ch) * t;
            expect(out.tint[ch] * TILE_TOP_LINEAR[slot * 3 + ch]).toBeCloseTo(expected, 5);
          }
        }
      }
      expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThanOrEqual(2.1);
    }
    expect(coasts).toBeGreaterThan(0);
  });

  it('replays repeated and superseded requests identically, including after cache rewinds', () => {
    const a = new RingWorldGenerator();
    const b = new RingWorldGenerator();
    const out = new CellPlacements();
    for (let i = 0; i < 20; i++) {
      const c = 63 + i * 100;
      a.transitionEpoch(SPLASH_SEED + i, c);
      b.transitionEpoch(SPLASH_SEED + i, c);
      a.transitionEpoch(i, c + 1);
      b.transitionEpoch(i, c + 1);
      // Exceed the initial epoch-history capacity and query the caches in different orders.
      for (const col of [c + 100, 0, c + 32, c, c + 77]) {
        a.cell(col, 5, out);
        const expected = snapshot(out);
        b.cell(col + 200, 2, out);
        b.cell(col, 5, out);
        expect(snapshot(out)).toEqual(expected);
      }
    }
    a.startEpoch(9);
    b.startEpoch(9);
    a.cell(63, 5, out);
    const expected = snapshot(out);
    b.cell(63, 5, out);
    expect(snapshot(out)).toEqual(expected);
  });
});
