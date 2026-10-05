import {
  AMP_H,
  DEFAULT_H,
  MAX_CELLS_PER_FRAME,
  RING_COLUMNS,
  RING_ROWS,
  RING_SECTOR_COLS,
  RING_SECTORS,
  SEA_RADIUS,
  TOP_RADIUS_MAX,
} from '../config';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** The angle between neighbouring column slots uses radians. */
export const SLOT_STEP = TWO_PI / RING_COLUMNS;

/**
 * Slot 0 starts at 150 degrees. Slot angles decrease as column indices increase.
 * Positive ring rotation moves content from right to left. Column c+1 enters after column c.
 * At phase 0, columns 0 to 21 are visible. Column 22 enters next.
 */
export const SLOT_THETA0 = (150 * Math.PI) / 180;

/** The visible half-angle includes the highest camera position and the arc over which the tallest terrain remains visible. */
export const PSI_VIS =
  Math.acos(SEA_RADIUS / (SEA_RADIUS + DEFAULT_H + AMP_H)) + Math.acos(SEA_RADIUS / TOP_RADIUS_MAX);

/** The sector half-span includes half a column of margin for crowns and placement jitter. */
export const SECTOR_HALF_SPAN = (RING_SECTOR_COLS / 2) * SLOT_STEP;

export function slotOfColumn(c: number): number {
  return c % RING_COLUMNS;
}

export function sectorOfSlot(slot: number): number {
  return Math.floor(slot / RING_SECTOR_COLS);
}

/** Return the slot centre angle in radians before adding the ring phase. */
export function slotAngle(slot: number): number {
  return SLOT_THETA0 - slot * SLOT_STEP;
}

/** Return the sector centre angle in radians before adding the ring phase. */
export function sectorAngle(sector: number): number {
  return SLOT_THETA0 - (sector * RING_SECTOR_COLS + (RING_SECTOR_COLS - 1) / 2) * SLOT_STEP;
}

/** Wrap the angle into (-PI, PI]. */
export function wrapPi(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  else if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/** Compare the sector and visible arcs through their centre distance and summed half-widths. Both arcs are shorter than a half-turn. */
export function sectorVisible(sector: number, phi: number): boolean {
  return Math.abs(wrapPi(sectorAngle(sector) + phi - HALF_PI)) < PSI_VIS + SECTOR_HALF_SPAN;
}

/**
 * omega uses radians per millisecond. dt uses milliseconds.
 * Each cell needs one rewrite per lap. The extra credit lets the frontier recover delayed work.
 * MAX_CELLS_PER_FRAME caps the budget.
 */
export function cellsThisFrame(omega: number, dt: number): number {
  const need = Math.ceil((RING_COLUMNS * RING_ROWS * omega * dt) / TWO_PI) + 1;
  return need < MAX_CELLS_PER_FRAME ? need : MAX_CELLS_PER_FRAME;
}

/** The frontier writes rows within each column, then advances columns in content order. */
export class RingScheduler {
  /** The ring phase uses radians in [0, 2*PI). */
  phi = 0;
  slot = 0;
  /** Row 0 is the far rim. */
  row = 0;
  /** This is the next content column, relative to the most recent isolated reset. */
  column = 0;
  epochPending = false;
  private budget = 0;

  /** dPhi uses radians. dt uses milliseconds. */
  beginFrame(dPhi: number, dt: number): void {
    let p = (this.phi + dPhi) % TWO_PI;
    if (p < 0) p += TWO_PI;
    this.phi = p;
    this.budget = cellsThisFrame(dt > 0 ? dPhi / dt : 0, dt);
  }

  /** Return true when the budget permits a write and the frontier sector is hidden. */
  hasCell(): boolean {
    return this.budget > 0 && !sectorVisible(sectorOfSlot(this.slot), this.phi);
  }

  /** Planning uses the same budget as cell writes. */
  spendPlanning(): void {
    this.budget -= 1;
  }

  advance(): void {
    this.budget -= 1;
    const r = this.row + 1;
    if (r < RING_ROWS) {
      this.row = r;
      return;
    }
    this.row = 0;
    this.column += 1;
    const s = this.slot + 1;
    this.slot = s === RING_COLUMNS ? 0 : s;
  }

  /** Request an epoch change at the next column boundary. */
  requestEpoch(): void {
    this.epochPending = true;
  }

  /** Reset the content column to 0 without changing the ring slot or row. */
  openEpoch(): void {
    this.epochPending = false;
    this.column = 0;
  }
}
