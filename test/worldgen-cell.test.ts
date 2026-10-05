import { describe, expect, it } from 'vitest';
import { RING_ROWS, RING_TILE, RING_Z0, SPLASH_SEED } from '../src/config';
import { KIT_MODEL_COUNT, KIT_MODEL_NAMES } from '../src/kit/generated/kit-ids';
import { sharedKit } from '../src/kit/kit';
import { CellPlacements, MAX_PLACEMENTS } from '../src/worldgen/placements';
import { createRingWorldGenerator } from '../src/worldgen/generator';
import { roadPieceOf } from '../src/worldgen/roads';
import { REGION_COLUMNS } from '../src/worldgen/plan';
import { StretchPlan } from '../src/worldgen/stretch';
import {
  CAMP_CLEAR_R_M,
  F,
  GROUND_TOP_U,
  LOW_ROW_CAP_U,
  LOW_ROW_FIRST,
  PORT_E,
  PORT_N,
  PORT_S,
  PORT_W,
  ROAD_PIECE,
  TALL_U,
  TALL_Z_MAX_U,
  TOP_LIMIT_U,
} from '../src/worldgen/tables';

const kit = sharedKit();
const CELLS = 2000;

function startsWith(id: number, prefix: string): boolean {
  return KIT_MODEL_NAMES[id].indexOf(prefix) === 0;
}

function isTile(id: number): boolean {
  return startsWith(id, 'ground_meadow') || startsWith(id, 'water_open') || startsWith(id, 'shore_');
}

function isLandform(id: number): boolean {
  return (
    startsWith(id, 'hill_') ||
    startsWith(id, 'mountain_') ||
    startsWith(id, 'desert_mesa') ||
    startsWith(id, 'canyon_pillar') ||
    startsWith(id, 'distant_rolling_ridge') ||
    startsWith(id, 'coastal_bluff')
  );
}

function isChain(id: number): boolean {
  return startsWith(id, 'distant_rolling_ridge');
}

function isTree(id: number): boolean {
  return startsWith(id, 'conifer_') || startsWith(id, 'deciduous_') || startsWith(id, 'cactus_');
}

function topOf(id: number): number {
  return kit.modelById(id).bboxMax[1] * F;
}

/** Convert cell-local Z to terrain ring Z, in game units. */
function worldZ(j: number, z: number): number {
  return RING_Z0 + j * RING_TILE + z;
}

function snapshot(out: CellPlacements): string {
  let s = String(out.count);
  for (let i = 0; i < out.count; i++) {
    s += `|${out.modelId[i]},${out.x[i].toFixed(4)},${out.y[i].toFixed(4)},${out.z[i].toFixed(4)},${out.yaw[i].toFixed(4)},${out.scale[i].toFixed(4)}`;
    s += `,${out.waterTint[i * 3]},${out.waterTint[i * 3 + 1]},${out.waterTint[i * 3 + 2]}`;
    s += `,${out.tint[i * 3].toFixed(4)},${out.tint[i * 3 + 1].toFixed(4)},${out.tint[i * 3 + 2].toFixed(4)}`;
  }
  return s;
}

function copyPlan(from: StretchPlan): StretchPlan {
  const to = new StretchPlan();
  to.g = from.g;
  to.seed = from.seed;
  to.start = from.start;
  to.width = from.width;
  to.end = from.end;
  to.biome = from.biome;
  to.profile = from.profile;
  to.season = from.season;
  to.coastRunStart = from.coastRunStart;
  return to;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
}

describe('cell generation', () => {
  it('generates identical cells for each seed, column and row in any call order', () => {
    const rnd = lcg(7);
    const columns: number[] = [];
    const rows: number[] = [];
    for (let i = 0; i < 500; i++) {
      columns.push(Math.floor(rnd() * 900));
      rows.push(Math.floor(rnd() * RING_ROWS));
    }
    const forward = createRingWorldGenerator();
    forward.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    const expected: string[] = [];
    for (let i = 0; i < columns.length; i++) {
      forward.cell(columns[i], rows[i], out);
      expected.push(snapshot(out));
    }
    for (let i = columns.length - 1; i >= 0; i--) {
      forward.cell(columns[i], rows[i], out);
      expect(snapshot(out)).toBe(expected[i]);
    }
    const fresh = createRingWorldGenerator();
    fresh.startEpoch(SPLASH_SEED);
    for (let i = 0; i < columns.length; i++) {
      const k = (i * 37) % columns.length;
      fresh.cell(columns[k], rows[k], out);
      expect(snapshot(out)).toBe(expected[k]);
    }
    const other = createRingWorldGenerator();
    other.startEpoch(0x51ee7);
    let differences = 0;
    for (let i = 0; i < columns.length; i++) {
      other.cell(columns[i], rows[i], out);
      if (snapshot(out) !== expected[i]) differences += 1;
    }
    expect(differences).toBeGreaterThan(400);
  }, 30000);

  it('writes one tile plus props that obey the height tables and caps', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    let tiles = 0;
    let props = 0;
    for (let c = 0; c * RING_ROWS < CELLS; c++) {
      const plan = gen.featurePlanFor(c);
      for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        expect(out.count).toBeLessThan(MAX_PLACEMENTS);
        expect(out.count).toBeGreaterThan(0);
        expect(isTile(out.modelId[0])).toBe(true);
        expect(out.x[0]).toBe(0);
        expect(out.y[0]).toBe(0);
        expect(out.z[0]).toBe(0);
        expect(out.scale[0]).toBe(1);
        expect(Math.abs((out.yaw[0] % (Math.PI / 2)) / (Math.PI / 2))).toBeLessThan(1e-6);
        tiles += 1;
        const poi = c % REGION_COLUMNS === plan.campCol && j === plan.campRow;
        for (let i = 0; i < out.count; i++) {
          const id = out.modelId[i];
          expect(id).toBeGreaterThanOrEqual(0);
          expect(id).toBeLessThan(KIT_MODEL_COUNT);
          if (i > 0) {
            props += 1;
            expect(isTile(id)).toBe(false);
          }
          const y = out.y[i];
          const known = (KIT_MODEL_NAMES[id] === 'bridge_suspension' && Math.abs(y - (GROUND_TOP_U + 1.525 * F)) < 1e-5) || (KIT_MODEL_NAMES[id] === 'bridge_approach' && Math.abs(y - (GROUND_TOP_U + 0.025 * F)) < 1e-6) || y === 0 || Math.abs(y - GROUND_TOP_U) < 1e-6;
          expect(known).toBe(true);
          const height = topOf(id) * out.scale[i];
          expect(y + height).toBeLessThanOrEqual(TOP_LIMIT_U + 1e-6);
          if (i === 0) continue;
          if (j >= LOW_ROW_FIRST) expect(height).toBeLessThanOrEqual(LOW_ROW_CAP_U + 1e-6);
          if (height > TALL_U) expect(worldZ(j, out.z[i])).toBeLessThanOrEqual(TALL_Z_MAX_U + 1e-6);
          if (j === RING_ROWS - 1) expect(startsWith(id, 'road_')).toBe(true);
        }
        if (!poi) {
          for (let i = 1; i < out.count; i++) {
            if (!isLandform(out.modelId[i])) continue;
            expect(out.count).toBe(2);
            expect(i).toBe(1);
          }
        }
      }
    }
    expect(tiles).toBeGreaterThanOrEqual(CELLS);
    expect(props).toBeGreaterThan(CELLS);
  }, 30000);

  it('varies straight shore decoration and scatter landforms in adjacent columns', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    const shoreOf = new Int16Array(400);
    const shoreRowOf = new Int16Array(400);
    const landformOf = new Int16Array(400 * RING_ROWS);
    let shoreColumns = 0;
    for (let c = 0; c < 400; c++) {
      shoreOf[c] = -1;
      shoreRowOf[c] = -1;
      for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        if (startsWith(out.modelId[0], 'shore_straight') || startsWith(out.modelId[0], 'shore_cove') || startsWith(out.modelId[0], 'shore_headland')) {
          shoreOf[c] = out.modelId[0];
          shoreRowOf[c] = j;
          shoreColumns += 1;
        }
        landformOf[c * RING_ROWS + j] = -1;
        for (let i = 1; i < out.count; i++) {
          if (isLandform(out.modelId[i]) && !isChain(out.modelId[i]) && j > 0) {
            landformOf[c * RING_ROWS + j] = out.modelId[i];
          }
        }
      }
    }
    for (let c = 1; c < 400; c++) {
      // Repeated shore pieces are adjacent only when they share a row. Corner topology can require repeated pieces.
      if (shoreOf[c] >= 0 && shoreOf[c] === shoreOf[c - 1]) expect(shoreRowOf[c]).not.toBe(shoreRowOf[c - 1]);
      for (let j = 1; j < RING_ROWS; j++) {
        const here = landformOf[c * RING_ROWS + j];
        if (here < 0) continue;
        expect(here).not.toBe(landformOf[(c - 1) * RING_ROWS + j]);
      }
    }
    expect(shoreColumns).toBeGreaterThan(20);
  }, 30000);

  it('emits planned road pieces and bridge decks', () => {
    const gen = createRingWorldGenerator(), out = new CellPlacements();
    let roadCells = 0;
    for (let c = 0; c < 900; c++) {
      const p = gen.featurePlanFor(c), local = c % REGION_COLUMNS;
      for (let j = 0; j < RING_ROWS; j++) {
        const mask = p.maskAt(local, j);
        if (!mask || (p.roadShape[local] > 0 && j !== p.roadRow[local])) continue;
        gen.cell(c, j, out);
        const bridge = p.bridgeCol >= 0 && j === p.bridgeRow && Math.abs(local - p.bridgeCol) <= 1;
        if (!bridge) expect(Array.from(out.modelId.slice(1, out.count))).toContain(roadPieceOf(p.roadShape[local] > 0 ? 12 : mask));
        else if (local === p.bridgeCol) expect(Array.from(out.modelId.slice(1, out.count)).map(id => KIT_MODEL_NAMES[id])).toContain('bridge_suspension');
        roadCells++;
      }
    }
    expect(roadCells).toBeGreaterThanOrEqual(900);
  });

  it('keeps campsites separated, with clear space and non-overlapping props', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    let camps = 0;
    let previousCamp = -1000;
    for (let c = 0; c < 900; c++) {
      const plan = gen.featurePlanFor(c);
      if (plan.campCol !== c % REGION_COLUMNS) continue;
      camps += 1;
      expect(c - previousCamp).toBeGreaterThanOrEqual(12);
      previousCamp = c;
      const j = plan.campRow;
      gen.cell(c, j, out);
      for (let a = 1; a < out.count; a++) {
        for (let b = a + 1; b < out.count; b++) {
          expect(rectsOverlap(out, a, b)).toBe(false);
        }
      }
      // Check the 6-metre clearing across neighbouring cells.
      for (let dc = -1; dc <= 1; dc++) {
        for (let dj = -1; dj <= 1; dj++) {
          const nj = j + dj;
          if (nj < 0 || nj >= RING_ROWS) continue;
          gen.cell(c + dc, nj, out);
          for (let i = 0; i < out.count; i++) {
            if (!isTree(out.modelId[i])) continue;
            const x = out.x[i] / F + dc * 10;
            const z = out.z[i] / F + dj * 10;
            expect(Math.sqrt(x * x + z * z)).toBeGreaterThanOrEqual(CAMP_CLEAR_R_M);
          }
        }
      }
    }
    expect(camps).toBeGreaterThan(5);
  }, 30000);

  it('builds river bridges with matching measured deck and approach sockets', () => {
    const gen = createRingWorldGenerator(), out = new CellPlacements();
    let crossings = 0;
    for (let c = 0; c < 2000; c++) {
      const p = gen.featurePlanFor(c);
      if (p.bridgeCol !== c % REGION_COLUMNS) continue;
      crossings++;
      const j = p.bridgeRow;
      gen.cell(c, j, out);
      expect(KIT_MODEL_NAMES[out.modelId[0]].startsWith('water_')).toBe(true);
      expect(KIT_MODEL_NAMES[out.modelId[1]]).toBe('bridge_suspension');
      const bridge = kit.modelById(out.modelId[1]);
      const east = bridge.sockets.find(s => s.name.endsWith('socket_bridge_east'))!;
      const endX = east.position[0] * out.scale[1];
      const deckY = out.y[1] / F;
      for (const side of [-1, 1]) {
        gen.cell(c + side * 2, j, out);
        expect(KIT_MODEL_NAMES[out.modelId[0]].startsWith('ground_')).toBe(true);
        const a = Array.from(out.modelId.slice(0, out.count)).findIndex(id => KIT_MODEL_NAMES[id] === 'bridge_approach');
        expect(a).toBeGreaterThan(0);
        const high = kit.modelById(out.modelId[a]).sockets.find(s => s.name.endsWith('socket_approach_high'))!;
        const x = side * 20 + out.x[a] / F + Math.cos(out.yaw[a]) * high.position[0] * out.scale[a];
        expect(x).toBeCloseTo(side * endX, 5);
        expect(out.y[a] / F + high.position[1] * out.scale[a]).toBeCloseTo(deckY, 5);
      }
    }
    expect(crossings).toBeGreaterThan(10);
  });

  it('changes season only at a stretch start', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    let previous = gen.season(0);
    let changes = 0;
    for (let c = 1; c < 3000; c++) {
      const season = gen.season(c);
      if (season === previous) continue;
      expect(gen.planFor(c).start).toBe(c);
      changes += 1;
      previous = season;
    }
    expect(changes).toBeGreaterThan(5);
  }, 30000);

  it('populates the terrain with trees, landforms, roads, winter overlays and campsites', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    const seen = new Int32Array(KIT_MODEL_COUNT);
    for (let c = 0; c < 600; c++) {
      for (let j = 0; j < RING_ROWS; j++) {
        gen.cell(c, j, out);
        for (let i = 0; i < out.count; i++) seen[out.modelId[i]] += 1;
      }
    }
    let trees = 0;
    let landforms = 0;
    let roads = 0;
    let curves = 0;
    let overlays = 0;
    let camp = 0;
    for (let id = 0; id < KIT_MODEL_COUNT; id++) {
      const n = seen[id];
      if (n === 0) continue;
      if (isTree(id)) trees += n;
      if (isLandform(id)) landforms += n;
      if (startsWith(id, 'road_')) roads += n;
      if (startsWith(id, 'road_curve')) curves += n;
      if (startsWith(id, 'ice_patch') || startsWith(id, 'snow_drift')) overlays += n;
      if (startsWith(id, 'campfire') || startsWith(id, 'tent_') || startsWith(id, 'log_seat')) camp += n;
    }
    expect(trees).toBeGreaterThan(1000);
    expect(landforms).toBeGreaterThan(100);
    expect(roads).toBeGreaterThan(50);
    expect(curves).toBeGreaterThan(0);
    expect(overlays).toBeGreaterThan(50);
    expect(camp).toBeGreaterThan(10);
    expect(seen[kit.modelId('airplane_rounded_gold')]).toBe(0);
    expect(seen[kit.modelId('hot_air_balloon')]).toBe(0);
  }, 30000);

  it('generates a full ring of 693 cells in under 100 ms', () => {
    const gen = createRingWorldGenerator();
    gen.startEpoch(SPLASH_SEED);
    const out = new CellPlacements();
    for (let c = 0; c < 63; c++) for (let j = 0; j < RING_ROWS; j++) gen.cell(c, j, out); // Populate the generation cache before timing.
    const started = performance.now();
    for (let c = 0; c < 63; c++) {
      for (let j = 0; j < RING_ROWS; j++) gen.cell(c, j, out);
    }
    expect(performance.now() - started).toBeLessThan(100);
  });
});

/** Check placement overlap with separating axes and asset kit footprints. */
function rectsOverlap(out: CellPlacements, a: number, b: number): boolean {
  const ma = kit.modelById(out.modelId[a]);
  const mb = kit.modelById(out.modelId[b]);
  const ax = Math.cos(out.yaw[a]);
  const az = -Math.sin(out.yaw[a]);
  const bx = Math.cos(out.yaw[b]);
  const bz = -Math.sin(out.yaw[b]);
  const axes = [
    [ax, az],
    [-az, ax],
    [bx, bz],
    [-bz, bx],
  ];
  const ahx = ((ma.bboxMax[0] - ma.bboxMin[0]) / 2) * out.scale[a];
  const ahz = ((ma.bboxMax[2] - ma.bboxMin[2]) / 2) * out.scale[a];
  const bhx = ((mb.bboxMax[0] - mb.bboxMin[0]) / 2) * out.scale[b];
  const bhz = ((mb.bboxMax[2] - mb.bboxMin[2]) / 2) * out.scale[b];
  const dx = (out.x[b] - out.x[a]) / F;
  const dz = (out.z[b] - out.z[a]) / F;
  for (const [nx, nz] of axes) {
    const ra = ahx * Math.abs(ax * nx + az * nz) + ahz * Math.abs(-az * nx + ax * nz);
    const rb = bhx * Math.abs(bx * nx + bz * nz) + bhz * Math.abs(-bz * nx + bx * nz);
    if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
  }
  return true;
}
