import { RING_ROWS } from '../../src/config';
import { RegionPlan, REGION_COLUMNS, ROAD_ROW, ROAD_SHAPE_COUNT, roadSweepOffset } from '../../src/worldgen/plan';
import { DIR_DC, DIR_DJ, DIR_OPPOSITE, DIR_PORT } from '../../src/worldgen/tables';

export interface PlanIssue { column: number; row: number; message: string; }

export function validateRegion(plan: RegionPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const report = (c: number, j: number, message: string) => issues.push({ column: plan.index * REGION_COLUMNS + c, row: j, message });
  const seen = new Set<number>();
  const queue = [plan.entryRow];
  while (queue.length) {
    const at = queue.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    const c = Math.floor(at / RING_ROWS);
    const j = at % RING_ROWS;
    const mask = plan.maskAt(c, j);
    for (let d = 0; d < 4; d++) {
      if (!(mask & DIR_PORT[d])) continue;
      const nc = c + DIR_DC[d];
      const nj = j + DIR_DJ[d];
      if ((nc === -1 && nj === plan.entryRow) || (nc === REGION_COLUMNS && nj === plan.exitRow)) continue;
      if (nc === plan.campCol && nj === plan.campRow) continue;
      if (!(plan.maskAt(nc, nj) & DIR_PORT[DIR_OPPOSITE[d]])) report(c, j, 'Unmatched road port');
      else queue.push(nc * RING_ROWS + nj);
    }
  }
  for (let c = 0; c < REGION_COLUMNS; c++) for (let j = 0; j < RING_ROWS; j++) {
    const at = c * RING_ROWS + j;
    const mask = plan.roadMask[at];
    const land = plan.riverCorners[at];
    if (mask && !seen.has(at)) report(c, j, 'Disconnected road');
    if (mask === 15) report(c, j, 'Unsupported road junction');
    if (land === 5 || land === 10) report(c, j, 'Unsupported river saddle');
    if (c + 1 < REGION_COLUMNS) {
      const east = plan.riverCorners[at + RING_ROWS];
      if (((land >> 1) & 1) !== (east & 1) || ((land >> 2) & 1) !== ((east >> 3) & 1)) report(c, j, 'River edge mismatch');
    }
    if (j + 1 < RING_ROWS) {
      const south = plan.riverCorners[at + 1];
      if (((land >> 3) & 1) !== (south & 1) || ((land >> 2) & 1) !== ((south >> 1) & 1)) report(c, j, 'River edge mismatch');
    }
    if (mask && land !== 15 && (j !== plan.bridgeRow || Math.abs(c - plan.bridgeCol) > 1)) report(c, j, 'Road crosses water without bridge');
  }
  // Road ports use integer rows. Sweep sockets use continuous row coordinates.
  let previousEast = plan.entryRow;
  for (let c = 0; c < REGION_COLUMNS; c++) {
    const shape = plan.roadShape[c], owner = plan.roadRow[c];
    if (shape > ROAD_SHAPE_COUNT) { report(c, owner, 'Invalid road sweep shape'); continue; }
    let west = -1, east = -1;
    for (let j = 0; j < RING_ROWS; j++) {
      if (plan.maskAt(c, j) & 8) west = j;
      if (plan.maskAt(c, j) & 4) east = j;
    }
    if (shape > 0) {
      const start = owner + roadSweepOffset(shape, 0), end = owner + roadSweepOffset(shape, 1);
      if (Math.round(start) !== west || Math.round(end) !== east) report(c, owner, 'Sweep disagrees with road ports');
      west = start; east = end;
      if (start < 4 || start > 6 || end < 4 || end > 6) report(c, owner, 'Sweep leaves dry corridor');
      if (!plan.maskAt(c, owner) || !plan.reserved[c * RING_ROWS + owner]) report(c, owner, 'Unreserved road sweep');
      if (plan.bridgeCol >= 0 && Math.abs(c - plan.bridgeCol) <= 2) report(c, owner, 'Sweep bends bridge approach');
    }
    if (Math.abs(west - previousEast) > 0.00001) report(c, owner, 'Unmatched physical road socket');
    previousEast = east;
  }
  if (Math.abs(previousEast - plan.exitRow) > 0.00001) report(REGION_COLUMNS - 1, plan.exitRow, 'Unmatched region road socket');
  if (plan.campCol >= 0) {
    const c = plan.campCol;
    if (plan.maskAt(c, plan.campRow) !== 0 || !seen.has(c * RING_ROWS + plan.campRow + 1)) report(c, plan.campRow, 'Camp has no clear entrance');
    for (let dc = -1; dc <= 1; dc++) for (let dj = -1; dj <= 1; dj++) {
      const j = plan.campRow + dj;
      const at = (c + dc) * RING_ROWS + j;
      if (plan.riverCorners[at] !== 15) report(c + dc, j, 'Wet camp clearing');
      if (plan.roadMask[at] && dj !== 1) report(c + dc, j, 'Road intrudes into camp clearing');
    }
  }
  if (plan.bridgeCol >= 0) {
    const c = plan.bridgeCol;
    if (plan.riverCol < 0 || plan.riverCorners[c * RING_ROWS + plan.bridgeRow] !== 0 || plan.maskAt(c, plan.bridgeRow) !== 12) report(c, plan.bridgeRow, 'Orphan bridge');
    for (const side of [-1, 1]) if (plan.riverCorners[(c + side * 2) * RING_ROWS + plan.bridgeRow] !== 15 || plan.maskAt(c + side * 2, plan.bridgeRow) !== 12) report(c, plan.bridgeRow, 'Invalid bridge approach');
  }
  // River flow requires connected wet edges. Diagonal contact does not connect the flow.
  const wet = new Set<number>();
  const flow: number[] = [];
  for (let c = 0; c < REGION_COLUMNS; c++) if ((plan.riverCorners[c * RING_ROWS] & 3) !== 3) flow.push(c * RING_ROWS);
  while (flow.length) {
    const at = flow.pop()!;
    if (wet.has(at)) continue;
    wet.add(at);
    const c = Math.floor(at / RING_ROWS), j = at % RING_ROWS, land = plan.riverCorners[at];
    const edges = [3, 12, 6, 9];
    for (let d = 0; d < 4; d++) {
      const nc = c + DIR_DC[d], nj = j + DIR_DJ[d];
      if (nc >= 0 && nc < REGION_COLUMNS && nj >= 0 && nj < RING_ROWS && (land & edges[d]) !== edges[d]) flow.push(nc * RING_ROWS + nj);
    }
  }
  for (let at = 0; at < plan.riverCorners.length; at++) if (plan.riverCorners[at] !== 15 && !wet.has(at)) report(Math.floor(at / RING_ROWS), at % RING_ROWS, 'Isolated river water');
  if (plan.riverCol >= 0 && ![...wet].some(at => at % RING_ROWS === RING_ROWS - 1)) report(plan.riverCol, ROAD_ROW, 'River has no downstream outlet');
  return issues;
}

/** Decode the shore mask from the rendered asset kit model and yaw. */
export function renderedCorners(name: string, yaw: number): number {
  if (name.startsWith('water_')) return 0;
  if (!name.startsWith('shore_')) return 15;
  let mask = name.startsWith('shore_saddle') ? 5 : name.startsWith('shore_corner_outer') ? 1 :
    name.startsWith('shore_corner_inner') || name.startsWith('shore_end_cap') ? 11 : 3;
  for (let i = 0; i < Math.round(yaw / (Math.PI / 2)); i++) mask = (mask >> 1) | ((mask & 1) << 3);
  return mask;
}

export function validateRenderedEdges(corners: Uint8Array, columns: number): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (let c = 0; c < columns; c++) for (let j = 0; j < RING_ROWS; j++) {
    const at = c * RING_ROWS + j, m = corners[at];
    if (c + 1 < columns) {
      const e = corners[at + RING_ROWS];
      if (((m >> 1) & 1) !== (e & 1) || ((m >> 2) & 1) !== ((e >> 3) & 1)) issues.push({ column:c, row:j, message:'Rendered water/land edge mismatch east' });
    }
    if (j + 1 < RING_ROWS) {
      const s = corners[at + 1];
      if (((m >> 3) & 1) !== (s & 1) || ((m >> 2) & 1) !== ((s >> 1) & 1)) issues.push({ column:c, row:j, message:'Rendered water/land edge mismatch south' });
    }
  }
  return issues;
}
