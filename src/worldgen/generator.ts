// Cell content depends on the seed, column, row, and explicit seed transition history.
// Cached stretch plans preserve that result when queries arrive in a different order.
import { SPLASH_SEED } from '../config';
import { CellWriter } from './cell';
import { CellPlacements, WorldGenerator } from './placements';
import { beginRegion, planRegion, planRegionColumn, RegionPlan, REGION_COLUMNS } from './plan';
import { ExitState, planStretch, StretchPlan } from './stretch';

const PLAN_SLOTS = 3;

export class RingWorldGenerator implements WorldGenerator {
  // Only transitionEpoch grows these arrays. Cell queries reuse their storage.
  private epochSeeds = new Float64Array(8);
  private epochStarts = new Float64Array(8);
  private epochCount = 1;
  private planningEpoch = 0;
  private readonly plans: StretchPlan[] = [new StretchPlan(), new StretchPlan(), new StretchPlan()];
  private readonly exit = new ExitState();
  private readonly writer = new CellWriter();
  private readonly regions: RegionPlan[] = [new RegionPlan(), new RegionPlan(), new RegionPlan()];
  private readonly regionReady = new Int16Array(3);
  private featureStarts = new Float64Array(8);
  /** Count feature regions completed synchronously after cache misses. */
  synchronousPlans = 0;

  private regionSeed(index: number): number {
    let e = this.epochCount - 1;
    while (e > 0 && this.featureStarts[e] > index) e -= 1;
    return this.epochSeeds[e];
  }

  /** Prepare one column of the next feature region using one scheduler credit. */
  prepare(column: number): boolean {
    const index = Math.floor(column / REGION_COLUMNS) + 1;
    const slot = index % 3;
    const out = this.regions[slot];
    const seed = this.regionSeed(index);
    if (out.index !== index || out.seed !== seed) {
      beginRegion(seed, index, out);
      this.regionReady[slot] = 0;
    }
    const c = this.regionReady[slot];
    if (c >= REGION_COLUMNS) return false;
    planRegionColumn(out, c);
    this.regionReady[slot] = c + 1;
    return true;
  }

  /** Complete a feature region synchronously on a cache miss. Streaming prepares these regions ahead of the frontier. */
  featurePlanFor(column: number): RegionPlan {
    const index = Math.floor(column / REGION_COLUMNS);
    const slot = index % 3;
    const out = this.regions[slot];
    const seed = this.regionSeed(index);
    if (out.index !== index || out.seed !== seed || this.regionReady[slot] < REGION_COLUMNS) {
      planRegion(seed, index, out);
      this.regionReady[slot] = REGION_COLUMNS;
      this.synchronousPlans += 1;
    }
    return out;
  }
  /** The current stretch index is -1 until the cache contains a plan. */
  private currentG = -1;

  constructor() {
    this.epochSeeds[0] = SPLASH_SEED;
  }

  startEpoch(seed: number): void {
    this.epochCount = 1;
    this.epochSeeds[0] = seed;
    this.epochStarts[0] = 0;
    this.planningEpoch = 0;
    this.currentG = -1;
    this.featureStarts[0] = 0;
    for (let i = 0; i < 3; i++) this.regions[i].index = -1;
    for (let i = 0; i < PLAN_SLOTS; i++) {
      this.plans[i].g = -1;
    }
  }

  /**
   * Join the new seed after the next stretch. One unwritten stretch remains for the border blend and coast taper.
   * Requests must arrive at the frontier in increasing world-column order.
   */
  transitionEpoch(seed: number, column: number): void {
    this.ensurePlans(column);
    const firstG = this.currentG + 2;
    const last = this.epochCount - 1;
    if (this.epochStarts[last] === firstG) this.epochSeeds[last] = seed;
    else {
      if (this.epochCount === this.epochSeeds.length) {
        const seeds = new Float64Array(this.epochCount * 2);
        const starts = new Float64Array(this.epochCount * 2);
        seeds.set(this.epochSeeds);
        starts.set(this.epochStarts);
        this.epochSeeds = seeds;
        this.epochStarts = starts;
        const featureStarts = new Float64Array(this.epochCount * 2);
        featureStarts.set(this.featureStarts);
        this.featureStarts = featureStarts;
      }
      this.epochStarts[this.epochCount] = firstG;
      this.epochSeeds[this.epochCount] = seed;
      this.epochCount += 1;
    }
    this.featureStarts[this.epochCount - 1] = Math.max(Math.floor(column / REGION_COLUMNS) + 2, Math.ceil(this.plans[(this.currentG + 1) % PLAN_SLOTS].end / REGION_COLUMNS));
  }

  cell(c: number, j: number, out: CellPlacements): void {
    this.ensurePlans(c);
    const g = this.currentG;
    const current = this.plans[g % PLAN_SLOTS];
    const next = this.plans[(g + 1) % PLAN_SLOTS];
    this.writer.setFeatures(this.featurePlanFor(c));
    // The first stretch uses its own tables as the missing predecessor.
    const previous = g === 0 ? current : this.plans[(g + 2) % PLAN_SLOTS];
    this.writer.write(current.seed, c, j, previous, current, next, out);
  }

  season(c: number): number {
    this.ensurePlans(c);
    return this.plans[this.currentG % PLAN_SLOTS].season;
  }

  planFor(c: number): StretchPlan {
    this.ensurePlans(c);
    const current = this.plans[this.currentG % PLAN_SLOTS];
    return current;
  }

  /** Keep the current stretch and both neighbouring stretches in the cache. */
  private ensurePlans(c: number): void {
    if (this.currentG >= 0) {
      const current = this.plans[this.currentG % PLAN_SLOTS];
      if (c >= current.start) {
        while (c >= this.plans[this.currentG % PLAN_SLOTS].end) this.advance();
        return;
      }
    }
    // A cache miss replays the stretch chain from the first stretch. The work grows with the requested stretch index.
    this.exit.reset();
    this.planningEpoch = 0;
    this.plan(0, this.plans[0]);
    this.plan(1, this.plans[1]);
    this.currentG = 0;
    while (c >= this.plans[this.currentG % PLAN_SLOTS].end) this.advance();
  }

  private plan(g: number, out: StretchPlan): void {
    while (this.planningEpoch + 1 < this.epochCount && this.epochStarts[this.planningEpoch + 1] <= g) {
      this.planningEpoch += 1;
    }
    planStretch(this.epochSeeds[this.planningEpoch], g - this.epochStarts[this.planningEpoch], this.exit, out);
    // Cache and road identities use global stretch indices across seed transitions.
    out.g = g;
  }

  private advance(): void {
    const g = this.currentG + 1;
    this.plan(g + 1, this.plans[(g + 1) % PLAN_SLOTS]);
    this.currentG = g;
  }
}

export function createRingWorldGenerator(): RingWorldGenerator {
  return new RingWorldGenerator();
}
