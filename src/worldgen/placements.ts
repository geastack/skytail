// The caller owns and reuses these arrays. Positions use game units relative to the tile root at the footprint centre.
// Local +Y points radially outward. Local X follows the ring. Local +Z points toward the camera.
// The tile top is 0.24 metres above the root.

export const MAX_PLACEMENTS = 24;

export const SEASON_SPRING = 0;
export const SEASON_SUMMER = 1;
export const SEASON_AUTUMN = 2;
export const SEASON_WINTER = 3;

export class CellPlacements {
  readonly modelId = new Int16Array(MAX_PLACEMENTS);
  readonly x = new Float32Array(MAX_PLACEMENTS);
  readonly y = new Float32Array(MAX_PLACEMENTS);
  readonly z = new Float32Array(MAX_PLACEMENTS);
  /** yaw uses radians around the local +Y axis. */
  readonly yaw = new Float32Array(MAX_PLACEMENTS);
  /** The uniform instance scale multiplies geometry in game units. A value of 1 preserves the authored size. */
  readonly scale = new Float32Array(MAX_PLACEMENTS);
  /** Identify one slice of an eight-column road sweep. Zero selects the unmodified asset kit model. */
  readonly roadShape = new Uint8Array(MAX_PLACEMENTS);
  /**
   * The linear RGB gain multiplies baked vertex colours. (1, 1, 1) preserves the authored colours.
   * TerrainRing writes this gain to InstancedMesh.instanceColor.
   */
  readonly tint = new Float32Array(MAX_PLACEMENTS * 3);
  /** The shore tile's Water part uses an independent colour gain. */
  readonly waterTint = new Float32Array(MAX_PLACEMENTS * 3);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  /** Return false without adding the prop when the cell is full. */
  add(modelId: number, x: number, y: number, z: number, yaw: number, scale: number): boolean {
    const i = this.count;
    if (i >= MAX_PLACEMENTS) return false;
    this.modelId[i] = modelId;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.yaw[i] = yaw;
    this.scale[i] = scale;
    this.roadShape[i] = 0;
    this.tint[i * 3] = 1;
    this.tint[i * 3 + 1] = 1;
    this.tint[i * 3 + 2] = 1;
    this.waterTint[i * 3] = 1;
    this.waterTint[i * 3 + 1] = 1;
    this.waterTint[i * 3 + 2] = 1;
    this.count = i + 1;
    return true;
  }

  tintLast(r: number, g: number, b: number): void {
    const i = (this.count - 1) * 3;
    this.tint[i] = r;
    this.tint[i + 1] = g;
    this.tint[i + 2] = b;
  }
}

/**
 * After startEpoch, cell content depends on the epoch seed, column, and row.
 * transitionEpoch adds explicit seed transition history without resetting world columns.
 * TerrainRing writes column c into slot c mod RING_COLUMNS while its sector is hidden.
 */
export interface WorldGenerator {
  /** Reset generation to column 0 with this seed. */
  startEpoch(seed: number): void;
  /** Join a new seed ahead of the frontier without resetting world columns. */
  transitionEpoch(seed: number, column: number): void;
  /** Use at most one cell-budget credit to prepare future content. Return true when preparation uses a credit. */
  prepare(column: number): boolean;
  /** Write cell (c, j) into out. Row 0 is the far horizon. Row RING_ROWS-1 is nearest to the camera. */
  cell(c: number, j: number, out: CellPlacements): void;
  /** Return the SEASON_* index for the stretch containing column c. */
  season(c: number): number;
}
