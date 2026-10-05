import { RING_ROWS } from '../config';
import { pick4, rand4 } from './hash';
import { PORT_E, PORT_N, PORT_S, PORT_W } from './tables';

export const REGION_COLUMNS = 64;
export const REGION_CELLS = REGION_COLUMNS * RING_ROWS;
export const ROAD_ROW = 5; // This row is central within the dry corridor, rows 4 to 6.
export const ROAD_SWEEP_COLUMNS = 8;
export const ROAD_SHAPE_COUNT = 4 * ROAD_SWEEP_COLUMNS;
export const RIVER_HALF_WIDTH = 0.75;
const SALT_REGION_CAMP = 0x6a09e667;
const SALT_REGION_RIVER = 0xbb67ae85;
const SALT_REGION_BEND = 0x3c6ef372;
const SALT_ROAD = 0xa54ff53a;
const ROAD_DELTAS = new Int8Array([-2, -1, 1, 2]);

/** Region-edge road rows depend on the boundary index independently of the seed, so they join across seed transitions. */
export function roadEdgeRow(boundary: number): number {
  return 4 + pick4(0x510e527f, boundary, 0, SALT_ROAD, 3);
}

function ease(t: number): number { return t * t * (3 - 2 * t); }

/** Return the row offset for a sweep slice. t is 0 at the west edge and 1 at the east edge. */
export function roadSweepOffset(shape: number, t: number): number {
  const code = shape - 1;
  const delta = ROAD_DELTAS[Math.floor(code / ROAD_SWEEP_COLUMNS)];
  const step = code % ROAD_SWEEP_COLUMNS;
  return delta * ease((step + t) / ROAD_SWEEP_COLUMNS) - Math.round(delta * ease((step + 0.5) / ROAD_SWEEP_COLUMNS));
}

/** Columns use region-local indices. Each cache slot reuses this storage. */
export class RegionPlan {
  seed = 0;
  index = -1;
  campCol = -1;
  campRow = 4;
  riverCol = -1;
  bridgeCol = -1;
  bridgeRow = ROAD_ROW;
  entryRow = ROAD_ROW;
  exitRow = ROAD_ROW;
  firstChangeCol = 19;
  lastChangeCol = 39;
  firstRow = 6;
  lastRow = 6;
  readonly roadStyle = new Uint8Array(4); // Style 1 uses a sweep. Style 0 uses angular pieces. Crossing and campsite approaches stay straight.
  readonly roadShape = new Uint8Array(REGION_COLUMNS);
  readonly roadRow = new Uint8Array(REGION_COLUMNS); // This row owns the swept mesh, which can cross a row boundary.
  readonly riverCentre = new Float32Array(RING_ROWS + 1);
  readonly roadMask = new Uint8Array(REGION_CELLS);
  readonly riverCorners = new Uint8Array(REGION_CELLS);
  /** Reserve infrastructure and clearings before scattering scenery. */
  readonly reserved = new Uint8Array(REGION_CELLS);

  maskAt(c: number, j: number): number {
    if (c < 0 || c >= REGION_COLUMNS || j < 0 || j >= RING_ROWS) return 0;
    return this.roadMask[c * RING_ROWS + j];
  }
}

/** Set destinations, region-edge ports, and river geometry before filling columns. */
export function beginRegion(seed: number, index: number, out: RegionPlan): void {
  out.seed = seed;
  out.index = index;
  out.campRow = 4;
  out.campCol = rand4(seed, index, 0, SALT_REGION_CAMP) < 0.7
    ? (pick4(seed, index, 1, SALT_REGION_CAMP, 2) === 0 ? 13 : 49) + pick4(seed, index, 2, SALT_REGION_CAMP, 5) : -1;
  out.riverCol = rand4(seed, index, 0, SALT_REGION_RIVER) < 0.65
    ? 29 + pick4(seed, index, 1, SALT_REGION_RIVER, 7) : -1;
  out.bridgeCol = -1;
  out.entryRow = roadEdgeRow(index);
  out.exitRow = roadEdgeRow(index + 1);
  out.firstRow = out.campCol >= 0 && out.campCol < 32 ? 6 : 4 + pick4(seed, index, 0, SALT_ROAD, 3);
  out.bridgeRow = 4 + pick4(seed, index, 1, SALT_ROAD, 2);
  if (out.bridgeRow === out.firstRow) out.bridgeRow = out.bridgeRow === 4 ? 5 : 4;
  out.lastRow = out.campCol >= 32 ? 6 : 4 + (out.bridgeRow - 4 + 1 + pick4(seed, index, 2, SALT_ROAD, 2)) % 3;
  out.roadStyle[0] = pick4(seed, index, 3, SALT_ROAD, 2);
  out.firstChangeCol = out.riverCol >= 0 ? out.riverCol - 10 : 19 + pick4(seed, index, 5, SALT_ROAD, 7);
  out.lastChangeCol = out.riverCol >= 0 ? out.riverCol + 3 : 36 + pick4(seed, index, 6, SALT_ROAD, 5);
  out.roadStyle[1] = pick4(seed, index, 7, SALT_ROAD, 2);
  out.roadStyle[2] = 1 - out.roadStyle[1];
  out.roadStyle[3] = pick4(seed, index, 4, SALT_ROAD, 2);
  // The central river banks stay straight to fit the bridge.
  for (let v = 0; v <= RING_ROWS; v++) {
    const d = v < 3 ? 3 - v : v > 8 ? v - 8 : 0;
    const side = v < 3 ? 0 : 1;
    const bend = pick4(seed, index, side, SALT_REGION_BEND, 3) - 1;
    out.riverCentre[v] = out.riverCol + bend * d * 0.6;
  }
}

/** One planning credit fills one column without allocating storage. */
export function planRegionColumn(out: RegionPlan, c: number): void {
  let from = out.firstRow, to = from, section = -1, step = 0;
  if (c < 8) { from = out.entryRow; to = out.firstRow; section = 0; step = c; }
  else if (c >= out.firstChangeCol && c < out.firstChangeCol + ROAD_SWEEP_COLUMNS) { from = out.firstRow; to = out.bridgeRow; section = 1; step = c - out.firstChangeCol; }
  else if (c >= out.firstChangeCol + ROAD_SWEEP_COLUMNS && c < out.lastChangeCol) { from = out.bridgeRow; to = from; }
  else if (c >= out.lastChangeCol && c < out.lastChangeCol + ROAD_SWEEP_COLUMNS) { from = out.bridgeRow; to = out.lastRow; section = 2; step = c - out.lastChangeCol; }
  else if (c >= out.lastChangeCol + ROAD_SWEEP_COLUMNS && c < 56) { from = out.lastRow; to = from; }
  else if (c >= 56) { from = out.lastRow; to = out.exitRow; section = 3; step = c - 56; }
  let entry = from, exit = from, low = from, high = from;
  out.roadShape[c] = 0;
  out.roadRow[c] = from;
  if (section >= 0 && from !== to) {
    const delta = to - from;
    if (out.roadStyle[section] === 1) {
      const block = delta < 0 ? delta + 2 : delta + 1;
      out.roadShape[c] = 1 + block * ROAD_SWEEP_COLUMNS + step;
      low = from + delta * ease(step / ROAD_SWEEP_COLUMNS);
      high = from + delta * ease((step + 1) / ROAD_SWEEP_COLUMNS);
      entry = Math.round(low); exit = Math.round(high);
      out.roadRow[c] = Math.round(from + delta * ease((step + 0.5) / ROAD_SWEEP_COLUMNS));
    } else {
      entry = step <= 4 ? from : to;
      exit = step < 4 ? from : to;
      low = entry; high = exit;
      out.roadRow[c] = exit;
    }
  }
  const lo = Math.min(entry, exit), hi = Math.max(entry, exit);
  for (let j = 0; j < RING_ROWS; j++) {
    const at = c * RING_ROWS + j;
    let road = 0;
    if (j >= lo && j <= hi) {
      if (j === entry) road |= PORT_W;
      if (j === exit) road |= PORT_E;
      if (j > lo) road |= PORT_N;
      if (j < hi) road |= PORT_S;
    }
    // The campsite access leaves its south entrance open.
    if (c === out.campCol) {
      if (j === 6) road |= PORT_N;
      if (j === 5) road = PORT_N | PORT_S;
    }
    out.roadMask[at] = road;
    let corners = 15;
    if (out.riverCol >= 0) {
      corners = 0;
      if (Math.abs(c - 0.5 - out.riverCentre[j]) >= RIVER_HALF_WIDTH) corners |= 1;
      if (Math.abs(c + 0.5 - out.riverCentre[j]) >= RIVER_HALF_WIDTH) corners |= 2;
      if (Math.abs(c + 0.5 - out.riverCentre[j + 1]) >= RIVER_HALF_WIDTH) corners |= 4;
      if (Math.abs(c - 0.5 - out.riverCentre[j + 1]) >= RIVER_HALF_WIDTH) corners |= 8;
    }
    out.riverCorners[at] = corners;
    // Reserve the full bridge approaches before scattering props.
    if (road !== 0 && corners === 0) out.bridgeCol = c;
    const bank = out.riverCol >= 0 && Math.abs(c - out.riverCol) <= 2 && Math.abs(j - out.bridgeRow) <= 1;
    const clearing = out.campCol >= 0 && Math.abs(c - out.campCol) <= 1 && j >= out.campRow && j <= 6;
    const swept = out.roadShape[c] > 0 && j >= Math.min(low, high) - 0.65 && j <= Math.max(low, high) + 0.65;
    out.reserved[at] = road !== 0 || bank || clearing || swept ? 1 : 0;
  }
}

/** Complete the entire region synchronously. Streaming uses planRegionColumn ahead of the frontier. */
export function planRegion(seed: number, index: number, out: RegionPlan): void {
  beginRegion(seed, index, out);
  for (let c = 0; c < REGION_COLUMNS; c++) planRegionColumn(out, c);
}
