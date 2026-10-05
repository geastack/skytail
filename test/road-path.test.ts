import { describe, expect, it } from 'vitest';
import { Scene } from 'three/src/scenes/Scene.js';
import type { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import { sharedKit } from '../src/kit/kit';
import { KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { RING_ROWS, RING_TILE, SEA_RADIUS, SPLASH_SEED } from '../src/config';
import { RegionPlan, planRegion, ROAD_SHAPE_COUNT, ROAD_SWEEP_COLUMNS, roadSweepOffset } from '../src/worldgen/plan';
import { RingWorldGenerator } from '../src/worldgen/generator';
import { CellPlacements } from '../src/worldgen/placements';
import { roadSweepGeometry, TerrainRing } from '../src/world/terrain-ring';
import { GROUND_TOP_U } from '../src/worldgen/tables';
import { SLOT_STEP } from '../src/worldgen/scheduler';
import { validateRegion } from './helpers/worldgen-validation';

describe('mixed road paths', () => {
  it('varies shared edge rows and route order, with sweeping reaches, turns and camp branches', () => {
    const a = new RegionPlan(), b = new RegionPlan();
    const rows = new Set<number>(), orders = new Set<number>(), turns = new Set<number>();
    for (let seed = 0; seed < 30; seed++) for (let region = 0; region < 20; region++) {
      planRegion(seed, region, a);
      planRegion(seed + 1, region + 1, b); // A new seed must preserve the shared region edge row.
      expect(a.exitRow).toBe(b.entryRow);
      rows.add(a.entryRow); orders.add(a.roadStyle[1]); turns.add(a.lastChangeCol);
      expect(a.roadShape.filter(v => v > 0).length).toBeGreaterThanOrEqual(ROAD_SWEEP_COLUMNS);
      expect(Array.from(a.roadMask).some(mask => [5, 6, 9, 10].includes(mask))).toBe(true);
      if (a.campCol >= 0) {
        expect(a.maskAt(a.campCol, 6)).toBe(13); // Mask 13 connects the main road to the camp branch.
        expect(a.maskAt(a.campCol, 5)).toBe(3); // Mask 3 connects the camp access road north and south.
        expect(a.maskAt(a.campCol, 4)).toBe(0);
      }
      expect(validateRegion(a)).toEqual([]);
    }
    expect([...rows].sort()).toEqual([4, 5, 6]);
    expect(orders.size).toBe(2);
    expect(turns.size).toBeGreaterThan(4);
  });

  it('joins curved slices continuously with matching tangents and flat endpoints', () => {
    const eps = 0.00001;
    for (const delta of [-2, -1, 1, 2]) {
      const block = delta < 0 ? delta + 2 : delta + 1;
      let last = 0, lastSlope = 0;
      for (let step = 0; step < ROAD_SWEEP_COLUMNS; step++) {
        const shape = block * ROAD_SWEEP_COLUMNS + step + 1;
        const t = (step + 0.5) / ROAD_SWEEP_COLUMNS;
        const owner = Math.round(delta * t * t * (3 - 2 * t));
        const start = owner + roadSweepOffset(shape, 0), end = owner + roadSweepOffset(shape, 1);
        const slope = (roadSweepOffset(shape, eps) - roadSweepOffset(shape, 0)) / eps;
        expect(start).toBeCloseTo(last, 8);
        expect(slope).toBeCloseTo(lastSlope, 5);
        last = end;
        lastSlope = (roadSweepOffset(shape, 1) - roadSweepOffset(shape, 1 - eps)) / eps;
      }
      expect(last).toBe(delta);
      expect(lastSlope).toBeCloseTo(0, 5);
    }
  });

  it('warps asset kit geometry and closes every raised socket on the ring', () => {
    const source = sharedKit().geometry('road_straight', 'main');
    const original = Array.from(source.getAttribute('position').array);
    for (let shape = 1; shape <= ROAD_SHAPE_COUNT; shape++) {
      const geo = roadSweepGeometry(source, shape);
      const p = geo.getAttribute('position'), src = source.getAttribute('position');
      expect(p.count).toBe(src.count);
      expect(Array.from(geo.getAttribute('color').array)).toEqual(Array.from(source.getAttribute('color').array));
      let edges = 0;
      for (let v = 0; v < p.count; v++) {
        const localX = src.getZ(v); // A quarter turn about Y maps source Z to local X.
        const expectedZ = -src.getX(v) + roadSweepOffset(shape, localX / RING_TILE + 0.5) * RING_TILE;
        expect(p.getZ(v)).toBeCloseTo(expectedZ, 4);
        if (Math.abs(Math.abs(localX) - RING_TILE / 2) > 0.0001) continue;
        edges++;
        expect(Math.abs(p.getX(v))).toBeCloseTo((SEA_RADIUS + GROUND_TOP_U + p.getY(v)) * Math.tan(SLOT_STEP / 2), 4);
      }
      expect(edges).toBeGreaterThan(4);
      geo.dispose();
    }
    expect(Array.from(source.getAttribute('position').array)).toEqual(original);
  });

  it('emits one swept mesh per column, excludes random S-bends and resets reused shape metadata', () => {
    const gen = new RingWorldGenerator(), out = new CellPlacements();
    gen.startEpoch(SPLASH_SEED);
    let sweeps = 0;
    for (let c = 0; c < 192; c++) {
      const p = gen.featurePlanFor(c), local = c % 64;
      let emitted = 0;
      for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        for (let k = 0; k < out.count; k++) {
          expect(KIT_MODEL_NAMES[out.modelId[k]]).not.toBe('road_s_bend');
          if (out.roadShape[k] === 0) continue;
          emitted++; sweeps++;
          expect(j).toBe(p.roadRow[local]);
          expect(out.roadShape[k]).toBe(p.roadShape[local]);
          expect(KIT_MODEL_NAMES[out.modelId[k]]).toBe('road_straight');
          expect(out.yaw[k]).toBe(0);
        }
      }
      expect(emitted).toBe(p.roadShape[local] > 0 ? 1 : 0);
    }
    expect(sweeps).toBeGreaterThanOrEqual(24);
  });

  it('renders the planned variants and streams them at maximum speed without capacity drops', () => {
    const ring = new TerrainRing(new Scene(), new RingWorldGenerator());
    const meshes = ring.ring.children.filter(c => c.name.includes('/sweep')) as InstancedMesh[];
    expect(meshes.some(m => m.count > 0)).toBe(true);
    for (const dt of [16.7, 60]) {
      const frames = Math.ceil(4 * Math.PI * 2 / (0.00136 * dt));
      for (let f = 0; f < frames; f++) ring.update(0.00136 * dt, dt, 0);
      expect(ring.dropped).toBe(0);
      expect(meshes.some(m => m.count > 0)).toBe(true);
    }
  });
});
