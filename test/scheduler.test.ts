import { describe, expect, it } from 'vitest';
import { MAX_CELLS_PER_FRAME, RING_COLUMNS, RING_ROWS, RING_SECTOR_COLS, RING_SECTORS, RING_TILE, SEA_RADIUS } from '../src/config';
import {
  PSI_VIS,
  RingScheduler,
  SECTOR_HALF_SPAN,
  SLOT_STEP,
  cellsThisFrame,
  sectorAngle,
  sectorOfSlot,
  sectorVisible,
  slotAngle,
  slotOfColumn,
} from '../src/worldgen/scheduler';

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
/** Content enters view at this angle on the right horizon. */
const ENTRY = Math.PI / 2 - PSI_VIS;

/** The remaining nonnegative rotation before column c enters view, in radians. */
function entryDelay(c: number, phi: number): number {
  const d = (ENTRY - (slotAngle(slotOfColumn(c)) + phi)) % TWO_PI;
  return d < 0 ? d + TWO_PI : d;
}

describe('ring slots', () => {
  it('places 63 tangent tiles edge to edge around the ring with radius 600', () => {
    expect(SLOT_STEP).toBeCloseTo(TWO_PI / 63, 12);
    expect(2 * SEA_RADIUS * Math.tan(SLOT_STEP / 2)).toBeCloseTo(RING_TILE, 3);
    expect(RING_SECTORS * RING_SECTOR_COLS).toBe(RING_COLUMNS);
  });

  it('lets column c + 1 enter the view exactly one slot after column c', () => {
    for (let c = 0; c < RING_COLUMNS - 1; c++) {
      expect(slotAngle(slotOfColumn(c + 1))).toBeLessThan(slotAngle(slotOfColumn(c)));
      const later = (entryDelay(c + 1, 0) - entryDelay(c, 0) + TWO_PI) % TWO_PI;
      expect(later).toBeCloseTo(SLOT_STEP, 9);
    }
  });

  it('opens with columns 0 to 21 visible and column 22 next to enter', () => {
    for (let c = 0; c <= 21; c++) expect(Math.abs(slotAngle(c) - Math.PI / 2)).toBeLessThan(PSI_VIS);
    expect(slotAngle(22)).toBeLessThan(ENTRY);
  });

  it('spans a sector over its 7 columns plus half a column of margin', () => {
    for (let s = 0; s < RING_SECTORS; s++) {
      const first = slotAngle(s * RING_SECTOR_COLS);
      const last = slotAngle(s * RING_SECTOR_COLS + RING_SECTOR_COLS - 1);
      expect(sectorAngle(s)).toBeCloseTo((first + last) / 2, 9);
      expect(SECTOR_HALF_SPAN).toBeCloseTo((first - last) / 2 + SLOT_STEP / 2, 9);
      expect(sectorOfSlot(s * RING_SECTOR_COLS + 6)).toBe(s);
    }
  });
});

describe('visibility window', () => {
  it('spans 61.5 degrees on each side of the top of the ring', () => {
    expect(PSI_VIS / DEG).toBeCloseTo(61.5, 1);
    expect((Math.PI / 2 - PSI_VIS) / DEG).toBeCloseTo(28.5, 1);
    expect((Math.PI / 2 + PSI_VIS) / DEG).toBeCloseTo(151.5, 1);
  });

  it('keeps at most 5 of 9 sectors visible throughout a lap', () => {
    for (let step = 0; step < 3600; step++) {
      const phi = (step / 3600) * TWO_PI;
      let visible = 0;
      for (let s = 0; s < RING_SECTORS; s++) if (sectorVisible(s, phi)) visible += 1;
      expect(visible).toBeGreaterThanOrEqual(4);
      expect(visible).toBeLessThanOrEqual(5);
    }
  });
});

describe('cell budget', () => {
  it('follows rotation rate within the frame budget', () => {
    expect(cellsThisFrame(0.00022, 16.7)).toBe(2); // Splash rotation rate.
    expect(cellsThisFrame(0.00049, 16.7)).toBe(2); // Level 1 with neutral input.
    expect(cellsThisFrame(0.00084, 16.7)).toBe(3); // Level 50 rotation rate.
    expect(cellsThisFrame(0.00136, 16.7)).toBe(4); // Level 100 with rightward input.
    expect(cellsThisFrame(0.00136, 60)).toBe(MAX_CELLS_PER_FRAME);
    expect(cellsThisFrame(0, 16.7)).toBe(1);
  });
});

function simulateLaps(omega: number, dt: number, laps: number): number {
  const sched = new RingScheduler();
  const writtenAt = new Int32Array(RING_COLUMNS);
  const completedAt = new Int32Array(RING_SECTORS);
  const hiddenSince = new Int32Array(RING_SECTORS);
  const shown = new Uint8Array(RING_SECTORS);
  const mark = (frame: number): void => {
    if (sched.row !== RING_ROWS - 1) return;
    writtenAt[sched.slot] = frame;
    if (sched.slot % RING_SECTOR_COLS === RING_SECTOR_COLS - 1) completedAt[sectorOfSlot(sched.slot)] = frame;
  };

  for (let k = 0; k < RING_COLUMNS * RING_ROWS; k++) {
    mark(0); // Record the initial fill at frame zero.
    sched.advance();
  }

  const dPhi = omega * dt;
  const frames = Math.ceil((laps * TWO_PI) / dPhi);
  for (let f = 1; f <= frames; f++) {
    sched.beginFrame(dPhi, dt);
    for (let s = 0; s < RING_SECTORS; s++) {
      const visible = sectorVisible(s, sched.phi);
      if (visible && shown[s] === 0) {
        expect(completedAt[s]).toBeGreaterThanOrEqual(hiddenSince[s]);
        for (let k = 0; k < RING_SECTOR_COLS; k++) {
          expect(writtenAt[s * RING_SECTOR_COLS + k]).toBeGreaterThanOrEqual(hiddenSince[s]);
        }
      } else if (!visible && shown[s] === 1) {
        hiddenSince[s] = f;
      }
      shown[s] = visible ? 1 : 0;
    }
    while (sched.hasCell()) {
      mark(f);
      sched.advance();
    }
  }
  return sched.column - RING_COLUMNS;
}

describe('rewrite frontier', () => {
  // The frontier can trail a complete lap by one sector.
  it('rewrites every sector while hidden across 200 laps at maximum speed', () => {
    const columns = simulateLaps(0.00136, 16.7, 200);
    expect(columns).toBeGreaterThanOrEqual(200 * RING_COLUMNS - RING_SECTOR_COLS);
    expect(columns).toBeLessThanOrEqual(200 * RING_COLUMNS + RING_COLUMNS);
  });

  it('sustains maximum speed with 60 ms frames across 200 laps', () => {
    const columns = simulateLaps(0.00136, 60, 200);
    expect(columns).toBeGreaterThanOrEqual(200 * RING_COLUMNS - RING_SECTOR_COLS);
    expect(columns).toBeLessThanOrEqual(200 * RING_COLUMNS + RING_COLUMNS);
  });

  it('opens an epoch only at a column boundary', () => {
    const sched = new RingScheduler();
    sched.advance();
    sched.requestEpoch();
    expect(sched.epochPending).toBe(true);
    expect(sched.row).toBe(1);
    while (sched.row !== 0) sched.advance();
    sched.openEpoch();
    expect(sched.column).toBe(0);
    expect(sched.epochPending).toBe(false);
  });
});
