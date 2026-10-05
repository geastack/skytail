import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/src/math/Vector3.js';
import { bendStripPoint } from '../src/world/terrain-ring';
import { F, GROUND_TOP_U } from '../src/worldgen/tables';
import { KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { RING_ROWS, RING_COLUMNS, RING_SECTORS, RING_SECTOR_COLS } from '../src/config';
import { beginRegion, planRegion, planRegionColumn, RegionPlan, REGION_COLUMNS, roadEdgeRow } from '../src/worldgen/plan';
import { renderedCorners, validateRenderedEdges, validateRegion } from './helpers/worldgen-validation';
import { RingWorldGenerator } from '../src/worldgen/generator';
import { CellPlacements } from '../src/worldgen/placements';
import { shoreMask } from '../src/worldgen/stretch';
import { SHORE_FAMILY } from '../src/worldgen/tables';
import { SLOT_STEP, cellsThisFrame, sectorOfSlot, sectorVisible, RingScheduler } from '../src/worldgen/scheduler';

describe('regional feature planning', () => {
  it('produces identical plans for direct, reordered and incremental queries', () => {
    const a = new RegionPlan(), b = new RegionPlan();
    for (const seed of [0, 1, 2026, 0x436f796f]) for (const index of [999999, 4, 0, 300, 1]) {
      planRegion(seed, index, a);
      beginRegion(seed, index, b);
      for (let c = 0; c < REGION_COLUMNS; c++) planRegionColumn(b, c);
      expect(b).toEqual(a);
      planRegion(seed + 1, index + 1, b);
      planRegion(seed, index, b);
      expect(b).toEqual(a);
    }
  });

  it('connects every road and river, derives bridges, reserves camps and agrees across regions', () => {
    const p = new RegionPlan();
    let rivers = 0, camps = 0;
    for (let seed = 0; seed < 100; seed++) for (let index = 0; index < 30; index++) {
      planRegion(seed, index, p);
      expect(validateRegion(p), `seed ${seed} region ${index}`).toEqual([]);
      expect(p.maskAt(0, roadEdgeRow(index)) & 8).toBe(8);
      expect(p.maskAt(REGION_COLUMNS - 1, roadEdgeRow(index + 1)) & 4).toBe(4);
      if (p.riverCol >= 0) rivers++;
      if (p.campCol >= 0) camps++;
    }
    expect(rivers).toBeGreaterThan(1000);
    expect(camps).toBeGreaterThan(1000);
  });

  it('merges rivers with actual coast topology without unmatched corners or missing models', () => {
    const gen = new RingWorldGenerator();
    const masks = new Uint8Array(640 * RING_ROWS);
    const errors: string[] = [];
    for (let seed = 0; seed < 40; seed++) {
      gen.startEpoch(seed);
      for (let c = 0; c < 640; c++) {
        const p = gen.planFor(c);
        const next = gen.planFor(p.end);
        const f = gen.featurePlanFor(c);
        for (let j = 0; j < RING_ROWS; j++) {
          const mask = shoreMask(p, next, c, j) & f.riverCorners[(c % REGION_COLUMNS) * RING_ROWS + j];
          masks[c * RING_ROWS + j] = mask;
          if (mask !== 0 && mask !== 15 && SHORE_FAMILY[mask] < 0) errors.push(`seed ${seed} c ${c} j ${j}: missing mask ${mask}`);
          if (f.reserved[(c % REGION_COLUMNS) * RING_ROWS + j] && mask !== 15 && Math.abs(c % REGION_COLUMNS - f.riverCol) > 2) errors.push(`seed ${seed} c ${c} j ${j}: wet reservation`);
        }
      }
      for (let c = 0; c < 639; c++) for (let j = 0; j < RING_ROWS; j++) {
        const m = masks[c * RING_ROWS + j], e = masks[(c + 1) * RING_ROWS + j];
        if (((m >> 1) & 1) !== (e & 1) || ((m >> 2) & 1) !== ((e >> 3) & 1)) errors.push(`seed ${seed} c ${c} j ${j}: east seam`);
        if (j < RING_ROWS - 1) {
          const s = masks[c * RING_ROWS + j + 1];
          if (((m >> 3) & 1) !== (s & 1) || ((m >> 2) & 1) !== ((s >> 1) & 1)) errors.push(`seed ${seed} c ${c} j ${j}: south seam`);
        }
      }
    }
    expect(errors).toEqual([]);
  }, 30000);

  it('checks emitted tile topology and detects broken plans', () => {
    const gen = new RingWorldGenerator(), out = new CellPlacements();
    const corners = new Uint8Array(640 * RING_ROWS);
    for (const seed of [18, 31, 1131379055]) {
      gen.startEpoch(seed);
      for (let c = 0; c < 640; c++) for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        corners[c * RING_ROWS + j] = renderedCorners(KIT_MODEL_NAMES[out.modelId[0]], out.yaw[0]);
      }
      expect(validateRenderedEdges(corners, 640)).toEqual([]);
    }
    const p = new RegionPlan();
    planRegion(0, 0, p);
    p.roadMask[8 * RING_ROWS + p.roadRow[8]] = 0;
    expect(validateRegion(p).some(i => i.message.includes('road'))).toBe(true);
    planRegion(0, 0, p);
    p.bridgeCol = 0;
    expect(validateRegion(p).some(i => i.message === 'Orphan bridge')).toBe(true);
    planRegion(0, 0, p);
    p.riverCorners[8 * RING_ROWS + 5] = 0;
    expect(validateRegion(p).some(i => i.message === 'Isolated river water')).toBe(true);
  });

  it('joins the measured bridge and approach sockets in curved ring space', () => {
    for (const side of [-1, 1]) {
      const deck = new Vector3(), ramp = new Vector3();
      bendStripPoint(side * 10 * F, GROUND_TOP_U + 1.525 * F, deck);
      // The approach socket lies two columns from the bridge. Mirror the right approach with a half turn about local Y.
      bendStripPoint(10 * F, GROUND_TOP_U + (0.025 + 0.6 * 2.5) * F, ramp);
      ramp.x *= -side;
      ramp.y += 600;
      ramp.applyAxisAngle(new Vector3(0, 0, 1), -side * 2 * SLOT_STEP);
      ramp.y -= 600;
      expect(ramp.distanceTo(deck)).toBeLessThan(0.0001);
    }
  });

  it('prepares within the frame budget across live seed changes without synchronous misses', () => {
    for (const dt of [16.7, 60]) {
      const gen = new RingWorldGenerator(), sched = new RingScheduler(), out = new CellPlacements();
      gen.startEpoch(0);
      for (let k = 0; k < 63 * RING_ROWS; k++) { gen.cell(sched.column, sched.row, out); sched.advance(); }
      while (gen.prepare(sched.column)) { /* Complete startup planning before recording synchronous misses. */ }
      const initial = gen.synchronousPlans;
      const completed = new Int32Array(RING_SECTORS), hidden = new Int32Array(RING_SECTORS), shown = new Uint8Array(RING_SECTORS);
      const frames = Math.ceil(200 * Math.PI * 2 / (0.00136 * dt));
      for (let f = 1; f <= frames; f++) {
        const dPhi = 0.00136 * Math.min(dt, 60);
        sched.beginFrame(dPhi, dt);
        if (f % 1700 === 0) gen.transitionEpoch(f + 100, sched.column);
        for (let sector = 0; sector < RING_SECTORS; sector++) {
          const visible = sectorVisible(sector, sched.phi);
          if (visible && !shown[sector]) expect(completed[sector], `sector ${sector} frame ${f}`).toBeGreaterThanOrEqual(hidden[sector]);
          else if (!visible && shown[sector]) hidden[sector] = f;
          shown[sector] = visible ? 1 : 0;
        }
        let credits = 0;
        if (gen.prepare(sched.column)) { sched.spendPlanning(); credits++; }
        while (sched.hasCell()) {
          gen.cell(sched.column, sched.row, out);
          if (sched.row === RING_ROWS - 1 && sched.slot % RING_SECTOR_COLS === RING_SECTOR_COLS - 1) completed[sectorOfSlot(sched.slot)] = f;
          sched.advance(); credits++;
        }
        expect(credits).toBeLessThanOrEqual(cellsThisFrame(0.00136, dt));
      }
      expect(gen.synchronousPlans).toBe(initial);
      expect(sched.column - RING_COLUMNS).toBeGreaterThanOrEqual(200 * RING_COLUMNS - RING_SECTOR_COLS);
    }
  }, 30000);
});
