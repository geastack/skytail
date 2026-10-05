// CellWriter reuses scratch buffers and reads three stretch plans plus one feature region.
// A blend factor from the warped border controls ground tint, landforms, vegetation density, and species.
import { M_BRIDGE_APPROACH, M_BRIDGE_SUSPENSION } from '../kit/generated/kit-ids';
import { RegionPlan, REGION_COLUMNS } from './plan';
import { RING_ROWS } from '../config';
import { simplex2 } from './simplex';
import { groundChannel, waterChannel, WATER_TOP_LINEAR } from './palette';
import { densityScale, fieldW, unit01 } from './fields';
import { pick4, rand4 } from './hash';
import { CellPlacements, MAX_PLACEMENTS, SEASON_WINTER } from './placements';
import { roadPieceOf, roadQuarterOf, treeRowFactor } from './roads';
import { isSnowy, shoreMask, StretchPlan, surfaceAt } from './stretch';
import {
  BIOME_ALPINE,
  BIOME_DESERT,
  CAMP_FIRE,
  CAMP_FIREWOOD,
  CAMP_FIREWOOD_ANGLE,
  CAMP_FIREWOOD_R_M,
  CAMP_FLAG,
  CAMP_FLAG_ANGLE,
  CAMP_FLAG_R_M,
  CAMP_SEAT,
  CAMP_SEAT_ANGLE,
  CAMP_SEAT_JITTER,
  CAMP_SEAT_R_M,
  CAMP_TENTS,
  CAMP_TENT_B_ANGLE,
  CAMP_TENT_B_P,
  CAMP_TENT_R_M,
  CHAIN_SCALE,
  CHAIN_Z_M,
  DIR_DC,
  DIR_DJ,
  DRIFT_ANCHOR,
  DRIFT_MAX,
  EDGE_SCALE_MIN,
  F,
  FAM_DESERT_MESA,
  FAM_GROUND_MEADOW,
  FAM_GROUND_SAND,
  FAM_ICE_PATCH,
  FAM_MOUNTAIN_SNOW,
  FAM_RIDGE_TEAL,
  FAM_RIDGE_VIOLET,
  FAM_ROCK_CLUSTER,
  FAM_SHORE_STRAIGHT,
  FAM_SHORE_INNER,
  FAM_SHORE_END,
  SHORE_FAMILY,
  SHORE_QUARTER,
  FAM_SNOW_DRIFT,
  FAM_WATER_SEA,
  GROUND_SLOT_SAND,
  GROUND_TOP_U,
  ICE_ANCHOR,
  ICE_MAX,
  J0_LANDFORM_Z_M,
  LANDFORM_FAMILY,
  LANDFORM_LAST_ROW,
  LANDFORM_P,
  LANDFORM_ROW_MAX,
  LANDFORM_ROW_MIN,
  LANDFORM_W_BASE,
  LANDFORM_W_GAIN,
  LOW_DENSITY,
  LOW_FAMILY,
  LOW_ROW,
  LOW_ROW_CAP_U,
  LOW_ROW_FIRST,
  MODEL_TOP_U,
  POI_CAMP,
  PORT_E,
  PORT_N,
  PORT_S,
  PORT_W,
  PROFILE_FAR_COAST,
  ROAD_CLEAR_M,
  ROCK_HALO_MAX,
  SALT_CAMP_PIECE,
  SALT_CAMP_YAW,
  SALT_LANDFORM,
  SALT_LANDFORM_PICK,
  SALT_LOW,
  SALT_OVERLAY,
  SALT_ROCK_HALO,
  SALT_SHORE,
  SALT_TILE_YAW,
  SALT_VEG_MIX,
  SALT_VEG_POS,
  SALT_VEG_SCALE,
  SALT_VEG_SPECIES,
  SALT_VEG_YAW,
  SHRUB_EDGE_MUL,
  SIGN_ARROW,
  SIGN_CLEAR_R_M,
  SIGN_OFFSET_M,
  SIGN_TURN,
  SUB_JITTER_M,
  SUB_OFFSET_M,
  SURFACE_LAND,
  SURFACE_SHORE,
  SURFACE_WATER,
  TALL_U,
  TALL_Z_LIMIT_M,
  TOP_LIMIT_U,
  TREE_BASE,
  TREE_SPECIES,
  TREE_SPECIES_CUM,
  WATER_ICE,
  SALT_MIX,
  TILE_TOP_LINEAR,
  groundTopSlot,
  variantModel,
  zoneColumns,
} from './tables';

const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
/** The minimum tree spacing within one cell uses metres. */
const TREE_SPACING_M = 1.6;
const SUB_COUNT = 9;
/** This hash offset separates low props from tree streams. */
const LOW_HASH_BASE = 256;
/** Each quarter turn rotates the signpost offset (-2.8, 0, 0) metres with its road piece. */
const SIGN_DX = new Int8Array([-1, 0, 1, 0]);
const SIGN_DZ = new Int8Array([0, 1, 0, -1]);
/** The rock jitter half-range uses metres. Rocks stay at least 5.5 metres from the landform centre. */
const HALO_JITTER_M = 0.5;
/** Each stretch reserves this many core columns outside its two blend zones. */
export const ZONE_CORE_COLS = 16;

function smoothstep01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/**
 * mid and half use columns. toward is +1 on the higher-column side of the border.
 * The blend factor is 1 in this stretch's core and 0 in its neighbour's core. It is 0.5 at the warped border.
 * Both sides use the same border position. Their factors sum to 1.
 */
export function edgeBlendT(seed: number, c: number, j: number, mid: number, toward: number, half: number): number {
  const s = toward * (c - borderPosition(seed, mid, j));
  return smoothstep01(0.5 + s / (2 * half));
}

/** The border position depends on the row, independently of the sampled column. */
export function borderPosition(seed: number, mid: number, j: number): number {
  const direction = rand4(seed, Math.floor(mid), 0, SALT_MIX) < 0.5 ? -1 : 1;
  return mid + direction * 0.45 * (j - 5) + 1.2 * simplex2(seed, mid / 37, j / 6, SALT_MIX);
}

function zoneHalf(a: StretchPlan, b: StretchPlan): number {
  if (a.g === b.g) return 0.5; // The first stretch has no predecessor.
  return cappedHalf(zoneColumns(a.biome, a.season, b.biome, b.season), a, b);
}

function cappedHalf(columns: number, a: StretchPlan, b: StretchPlan): number {
  const half = columns * 0.5;
  const room = (Math.min(a.width, b.width) - ZONE_CORE_COLS) * 0.5;
  return half < room ? half : room;
}

function surfaceOwned(
  c: number,
  j: number,
  previous: StretchPlan,
  current: StretchPlan,
  next: StretchPlan,
): number {
  if (c < current.start) return surfaceAt(previous, current, c, j);
  if (c >= current.end) return surfaceAt(next, next, c, j);
  return surfaceAt(current, next, c, j);
}

/** Return the candidate landform family before checking adjacency. Return -1 when the cell has no candidate. */
function landformRaw(seed: number, c: number, j: number, plan: StretchPlan): number {
  if (j > LANDFORM_LAST_ROW) return -1;
  const relief = LANDFORM_W_BASE + LANDFORM_W_GAIN * unit01(fieldW(seed, c));
  const u = rand4(seed, c, j, SALT_LANDFORM);
  const base = plan.biome * 3;
  let acc = 0;
  for (let k = 0; k < 3; k++) {
    const family = LANDFORM_FAMILY[base + k];
    if (family < 0) continue;
    if (j < LANDFORM_ROW_MIN[base + k] || j > LANDFORM_ROW_MAX[base + k]) continue;
    acc += LANDFORM_P[base + k] * relief;
    if (u >= acc) continue;
    if (family === FAM_MOUNTAIN_SNOW && !isSnowy(seed, c, j, plan.biome, plan.season)) return -1;
    return family;
  }
  return -1;
}

/** Return the horizon chain family for this cell, or -1 when no chain applies. */
function chainFamily(seed: number, c: number, j: number, plan: StretchPlan): number {
  if (plan.biome === BIOME_DESERT) return j === 0 ? FAM_DESERT_MESA : -1;
  if (plan.profile === PROFILE_FAR_COAST) return -1; // The far coast leaves the sea horizon visible.
  if (j === 0) return FAM_RIDGE_VIOLET;
  if (j === 1 && fieldW(seed, c) > 0) return FAM_RIDGE_TEAL;
  return -1;
}

export function shoreVariant(seed: number, c: number, _current: StretchPlan): number {
  return (c & 1) === 0 ? 0 : 1 + pick4(seed, c >> 1, 0, SALT_SHORE, 2);
}

/**
 * zM uses cell-local metres. baseY and topU use game units.
 * The checks enforce the corridor height cap, tall-prop depth, and maximum radius.
 */
export function heightOk(j: number, zM: number, baseY: number, topU: number, scale: number): boolean {
  const top = topU * scale;
  if (top > LOW_ROW_CAP_U && j >= LOW_ROW_FIRST) return false;
  if (top > TALL_U && zM > TALL_Z_LIMIT_M[j]) return false;
  return baseY + top <= TOP_LIMIT_U;
}

export class CellWriter {
  private readonly subUsed = new Uint8Array(SUB_COUNT);
  private readonly treeX = new Float32Array(SUB_COUNT);
  private readonly treeZ = new Float32Array(SUB_COUNT);
  private readonly signX = new Float32Array(2);
  private readonly signZ = new Float32Array(2);
  private treeCount = 0;
  private signCount = 0;
  private readonly noPlan = new StretchPlan();
  private own: StretchPlan = this.noPlan;
  private near: StretchPlan = this.noPlan;
  private borderMid = 0;
  private borderSeed = 0;
  private borderToward = 1;
  private borderHalf = 0.5;
  private tileModel = -1;
  private features = new RegionPlan();

  setFeatures(plan: RegionPlan): void { this.features = plan; }

  private corners(current: StretchPlan, next: StretchPlan, c: number, j: number): number {
    const local = c - this.features.index * REGION_COLUMNS;
    const river = this.features.index >= 0 && local >= 0 && local < REGION_COLUMNS
      ? this.features.riverCorners[local * RING_ROWS + j] : 15;
    return shoreMask(current, next, c, j) & river;
  }

  private surface(current: StretchPlan, next: StretchPlan, c: number, j: number): number {
    const mask = this.corners(current, next, c, j);
    return mask === 15 ? SURFACE_LAND : mask === 0 ? SURFACE_WATER : SURFACE_SHORE;
  }

  write(
    seed: number,
    c: number,
    j: number,
    previous: StretchPlan,
    current: StretchPlan,
    next: StretchPlan,
    out: CellPlacements,
  ): void {
    out.clear();
    this.subUsed.fill(0);
    this.treeCount = 0;
    this.signCount = 0;
    this.setBorder(c, previous, current, next);

    const surface = this.surface(current, next, c, j);
    const features = this.features;
    const local = c - features.index * REGION_COLUMNS;
    const planned = features.index >= 0;
    const poi = planned ? (local === features.campCol && j === features.campRow ? POI_CAMP : 0) : 0;
    const t = this.blendAt(seed, c, j);
    // Water and shore geometry follow the coast profile independently of the biome blend.
    const tables = this.ownerAt(seed, c, j);
    const mask = planned ? features.maskAt(local, j) : 0;

    // The feature region must be complete before writing cells. Overlays use the occupancy left by earlier placements.
    this.addTile(seed, c, j, surface, poi, tables, current, next, t, out);
    const crossing = planned && features.bridgeCol >= 0 && j === features.bridgeRow && Math.abs(local - features.bridgeCol) <= 2;
    if (!crossing || Math.abs(local - features.bridgeCol) === 2) this.addRoad(c, j, mask, out);
    if (crossing) {
      this.addRiverBridge(local - features.bridgeCol, out);
      return;
    }
    if (j === RING_ROWS - 1) return;
    this.addSigns(seed, c, j, mask, current, out);

    if (poi === POI_CAMP) {
      this.addCampsite(seed, c, j, out);
      return;
    }
    if (planned && features.reserved[local * RING_ROWS + j] !== 0) return;

    if (surface === SURFACE_LAND && mask === 0 && j <= LANDFORM_LAST_ROW) {
      if (this.addLandform(seed, c, j, tables, out)) return;
    }

    this.addVegetation(seed, c, j, surface, mask, tables, current, t, out);
    this.addOverlays(seed, c, j, surface, tables.season, current, next, out);
    this.addRockHalo(seed, c, j, surface, mask, previous, current, next, out);
  }

  private setBorder(c: number, previous: StretchPlan, current: StretchPlan, next: StretchPlan): void {
    const atStart = c - current.start <= current.end - 1 - c;
    this.own = current;
    this.near = atStart ? previous : next;
    this.borderMid = (atStart ? current.start : current.end) - 0.5;
    this.borderToward = atStart ? 1 : -1;
    // Both sides use the incoming seed, including at a seed transition.
    this.borderSeed = (atStart ? current : next).seed;
    this.borderHalf = zoneHalf(current, this.near);
  }

  /** The blend factor is 1 in this stretch's core and 0 in its neighbour's core. */
  private blendAt(_seed: number, c: number, j: number): number {
    return edgeBlendT(this.borderSeed, c, j, this.borderMid, this.borderToward, this.borderHalf);
  }

  private ownerAt(seed: number, c: number, j: number): StretchPlan {
    return this.blendAt(seed, c, j) < 0.5 ? this.near : this.own;
  }

  private hardOwnerAt(seed: number, c: number, j: number): StretchPlan {
    return this.ownerAt(seed, c, j);
  }

  private addTile(
    seed: number,
    c: number,
    j: number,
    surface: number,
    poi: number,
    tables: StretchPlan,
    current: StretchPlan,
    next: StretchPlan,
    t: number,
    out: CellPlacements,
  ): void {
    const season = tables.season;
    let model = variantModel(FAM_GROUND_MEADOW, season);
    let yaw = pick4(seed, c, j, SALT_TILE_YAW, 4) * QUARTER;
    if (surface === SURFACE_WATER) {
      const frozen = tables.biome === BIOME_ALPINE && season === SEASON_WINTER;
      model = frozen ? WATER_ICE : variantModel(FAM_WATER_SEA, season);
    } else if (surface === SURFACE_SHORE) {
      const corners = this.corners(current, next, c, j);
      let family = SHORE_FAMILY[corners];
      if (family === FAM_SHORE_STRAIGHT) family += shoreVariant(seed, c, current);
      const terminal = c === current.coastRunStart || (next.profile !== current.profile && c === current.end - 1);
      if (family === FAM_SHORE_INNER && terminal) family = FAM_SHORE_END;
      model = variantModel(family, season);
      yaw = SHORE_QUARTER[corners] * QUARTER;
    } else if (tables.biome === BIOME_DESERT) {
      model = variantModel(FAM_GROUND_SAND, season);
    } else if (tables.biome === BIOME_ALPINE && isSnowy(tables.seed, c, j, tables.biome, season)) {
      model = variantModel(FAM_GROUND_MEADOW, SEASON_WINTER);
    }
    out.add(model, 0, 0, 0, yaw, 1);
    this.tileModel = model;
    this.tintTile(seed, c, j, surface, model, season, t, out);
  }

  /** Divide the shared target colour by the chosen mesh's baked colour, including snow. */
  private tintTile(
    seed: number, c: number, j: number, surface: number, model: number,
    season: number, t: number, out: CellPlacements,
  ): void {
    const slot = surface === SURFACE_SHORE ? season : groundTopSlot(model);
    const waterSlot = (surface === SURFACE_SHORE ? season === SEASON_WINTER : model === WATER_ICE) ? 1 : 0;
    for (let channel = 0; channel < 3; channel++) {
      const targetWater = waterChannel(this.own.biome, this.own.season, channel) * t +
        waterChannel(this.near.biome, this.near.season, channel) * (1 - t);
      const waterGain = targetWater / WATER_TOP_LINEAR[waterSlot * 3 + channel];
      if (surface === SURFACE_WATER) out.tint[channel] = waterGain;
      else {
        const targetLand = groundChannel(this.own.seed, c, j, this.own.biome, this.own.season, channel) * t +
          groundChannel(this.near.seed, c, j, this.near.biome, this.near.season, channel) * (1 - t);
        out.tint[channel] = targetLand / TILE_TOP_LINEAR[slot * 3 + channel];
      }
      out.waterTint[channel] = waterGain;
    }
  }

  private addRoad(c: number, j: number, mask: number, out: CellPlacements): void {
    if (mask === 0) return;
    const local = c - this.features.index * REGION_COLUMNS;
    const shape = this.features.index >= 0 ? this.features.roadShape[local] : 0;
    if (shape > 0) {
      if (j !== this.features.roadRow[local]) return;
      if (out.add(roadPieceOf(12), 0, GROUND_TOP_U, 0, 0, 1)) out.roadShape[out.count - 1] = shape;
      return;
    }
    const piece = roadPieceOf(mask);
    if (piece < 0) return;
    // The road root rests on the ground top. The asphalt is 0.265 metres above the tile root.
    out.add(piece, 0, GROUND_TOP_U, 0, roadQuarterOf(mask) * QUARTER, 1);
  }

  private addSigns(seed: number, c: number, j: number, mask: number, current: StretchPlan, out: CellPlacements): void {
    if (mask === 0) return;
    if (isTJunction(mask)) {
      const quarter = roadQuarterOf(mask);
      this.addProp(
        SIGN_TURN,
        j,
        SIGN_DX[quarter] * SIGN_OFFSET_M,
        SIGN_DZ[quarter] * SIGN_OFFSET_M,
        quarter * QUARTER,
        1,
        out,
      );
    }
    if (this.features.index < 0 || c % REGION_COLUMNS !== this.features.campCol || j !== 6) return;
    this.addProp(SIGN_ARROW, j, SIGN_OFFSET_M, 0, Math.PI, 1, out);
  }

  /** xM and zM use cell-local metres. Height checks use game units. */
  private addProp(
    model: number,
    j: number,
    xM: number,
    zM: number,
    yaw: number,
    scale: number,
    out: CellPlacements,
  ): boolean {
    if (model < 0 || out.count >= MAX_PLACEMENTS) return false;
    if (!heightOk(j, zM, GROUND_TOP_U, MODEL_TOP_U[model], scale)) return false;
    if (model === SIGN_TURN || model === SIGN_ARROW) {
      const slot = this.signCount % 2;
      this.signX[slot] = xM;
      this.signZ[slot] = zM;
      this.signCount += 1;
    }
    return out.add(model, xM * F, GROUND_TOP_U, zM * F, yaw, scale);
  }

  private addCampsite(seed: number, c: number, j: number, out: CellPlacements): void {
    // The template leaves the south entrance open and separates the pieces' footprints.
    const a0 = this.features.index >= 0 ? Math.PI : rand4(seed, c, j, SALT_CAMP_YAW) * TAU;
    this.addProp(CAMP_FIRE, j, 0, 0, a0, 1, out);
    const tentA = pick4(seed, c, j, SALT_CAMP_PIECE, 4);
    this.addFacingFire(CAMP_TENTS[tentA], j, CAMP_TENT_R_M, a0, out);
    if (rand4(seed, c, j + 16, SALT_CAMP_PIECE) < CAMP_TENT_B_P) {
      const tentB = (tentA + 1 + pick4(seed, c, j + 32, SALT_CAMP_PIECE, 3)) % 4;
      this.addFacingFire(CAMP_TENTS[tentB], j, CAMP_TENT_R_M, a0 + CAMP_TENT_B_ANGLE, out);
    }
    const seats = 2 + pick4(seed, c, j + 48, SALT_CAMP_PIECE, 2);
    for (let k = 0; k < seats; k++) {
      const jitter = (rand4(seed, c, j + 64 + k, SALT_CAMP_PIECE) * 2 - 1) * CAMP_SEAT_JITTER;
      this.addFacingFire(CAMP_SEAT, j, CAMP_SEAT_R_M, a0 + CAMP_SEAT_ANGLE[k] + jitter, out);
    }
    this.addFacingFire(CAMP_FIREWOOD, j, CAMP_FIREWOOD_R_M, a0 + CAMP_FIREWOOD_ANGLE, out);
    this.addFacingFire(CAMP_FLAG, j, CAMP_FLAG_R_M, a0 + CAMP_FLAG_ANGLE, out);
  }

  private addFacingFire(model: number, j: number, radius: number, angle: number, out: CellPlacements): void {
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    this.addProp(model, j, x, z, Math.atan2(-Math.cos(angle), -Math.sin(angle)), 1, out);
  }

  /** The bridge spans -10 to +10 metres. Its 7.5-metre bank ramps rise 1.5 metres to the deck. */
  private addRiverBridge(offset: number, out: CellPlacements): void {
    if (offset === 0) out.add(M_BRIDGE_SUSPENSION, 0, GROUND_TOP_U + 1.525 * F, 0, 0, 2);
    else if (Math.abs(offset) === 2) {
      const side = offset < 0 ? -1 : 1;
      out.add(M_BRIDGE_APPROACH, -side * 2.5 * F, GROUND_TOP_U + 0.025 * F, 0, side < 0 ? 0 : Math.PI, 2.5);
    }
  }

  private addLandform(seed: number, c: number, j: number, tables: StretchPlan, out: CellPlacements): boolean {
    // The horizon chain uses one border owner to avoid gaps in the skyline.
    const chainPlan = this.hardOwnerAt(seed, c, j);
    const chain = chainFamily(seed, c, j, chainPlan);
    if (chain >= 0) {
      const chainModel = variantModel(chain, chainPlan.season);
      const chainYaw = chain === FAM_DESERT_MESA && (c & 1) === 1 ? Math.PI : 0;
      return this.addProp(chainModel, j, 0, CHAIN_Z_M, chainYaw, CHAIN_SCALE, out);
    }
    const family = this.landformAt(seed, c, j, tables);
    if (family < 0) return false;
    const zM = j === 0 ? J0_LANDFORM_Z_M : 0;
    const yaw = pick4(seed, c, j, SALT_LANDFORM_PICK, 2) * Math.PI; // This rotation keeps the footprint aligned with the cell axes.
    return this.addProp(variantModel(family, tables.season), j, 0, zM, yaw, 1, out);
  }

  /** Reject a scattered landform when the preceding column has the same candidate family and no horizon chain. */
  private landformAt(seed: number, c: number, j: number, owner: StretchPlan): number {
    const raw = landformRaw(seed, c, j, owner);
    if (raw < 0) return -1;
    if (c > 0) {
      const left = this.ownerAt(seed, c - 1, j);
      if (chainFamily(seed, c - 1, j, left) < 0 && landformRaw(seed, c - 1, j, left) === raw) return -1;
    }
    return raw;
  }

  private addVegetation(
    seed: number,
    c: number,
    j: number,
    surface: number,
    mask: number,
    tables: StretchPlan,
    current: StretchPlan,
    t: number,
    out: CellPlacements,
  ): void {
    if (surface !== SURFACE_LAND) return;
    const other = this.near;
    const scale = densityScale(seed, c, j);
    const sand = groundTopSlot(this.tileModel) === GROUND_SLOT_SAND;
    // Tree counts interpolate between biome tables independently of tile ownership.
    const ownTrees = TREE_BASE[this.own.biome] * treeRowFactor(this.own.biome, j);
    const nearTrees = TREE_BASE[other.biome] * treeRowFactor(other.biome, j);
    let count = Math.round((ownTrees * t + nearTrees * (1 - t)) * scale);
    if (count > SUB_COUNT) count = SUB_COUNT;
    const order = pick4(seed, c, j, SALT_VEG_POS, SUB_COUNT);
    let lastSlot = -1;
    for (let k = 0; k < count; k++) {
      const hashRow = j * 16 + k;
      // Choose this stretch's biome table with probability t. Restrict species to those compatible with the tile.
      const fromOwn = rand4(seed, c, hashRow, SALT_VEG_MIX) < t;
      const biome = this.speciesBiome(fromOwn ? this.own.biome : other.biome, other.biome, sand);
      const slot = this.pickSpecies(seed, c, j, k, biome, lastSlot);
      if (slot < 0) continue;
      const model = variantModel(TREE_SPECIES[biome * 4 + slot], tables.season);
      if (model < 0) continue;
      // Trees from the biome with less blend weight use a smaller scale.
      const weight = fromOwn ? t : 1 - t;
      const taper = EDGE_SCALE_MIN + (1 - EDGE_SCALE_MIN) * weight;
      const instanceScale = (0.85 + 0.3 * rand4(seed, c, hashRow, SALT_VEG_SCALE)) * taper;
      const placed = this.scatterOne(
        seed,
        c,
        j,
        hashRow,
        (k * 7 + order) % SUB_COUNT,
        model,
        instanceScale,
        surface,
        mask,
        current,
        true,
        out,
      );
      if (placed) lastSlot = slot;
    }

    const rowFactor = LOW_ROW[j];
    if (rowFactor <= 0) return;
    // The shrub multiplier peaks at the blend midpoint and returns to 1 in each core.
    const shrubEdge = 1 + (SHRUB_EDGE_MUL - 1) * 4 * t * (1 - t);
    const lowOwn = this.lowDensityBiome(this.own.biome, other.biome, sand);
    const lowNear = this.lowDensityBiome(other.biome, this.own.biome, sand);
    for (let f = 0; f < 4; f++) {
      const model = variantModel(LOW_FAMILY[f], tables.season);
      if (model < 0) continue;
      let density = LOW_DENSITY[lowOwn * 4 + f] * t + LOW_DENSITY[lowNear * 4 + f] * (1 - t);
      if (f === 1) density *= shrubEdge;
      const lowCount = Math.round(density * rowFactor * scale);
      for (let k = 0; k < lowCount && k < 4; k++) {
        const hashRow = LOW_HASH_BASE + (j * 4 + f) * 16 + k;
        this.scatterOne(
          seed,
          c,
          j,
          hashRow,
          pick4(seed, c, hashRow, SALT_LOW, SUB_COUNT),
          model,
          0.85 + 0.3 * rand4(seed, c, hashRow, SALT_VEG_SCALE),
          surface,
          mask,
          current,
          false,
          out,
        );
      }
    }
  }

  /** Sand tiles use desert species. Green tiles exclude desert species. */
  private speciesBiome(drawn: number, other: number, sand: boolean): number {
    if (sand) return BIOME_DESERT;
    if (drawn !== BIOME_DESERT) return drawn;
    return this.own.biome === BIOME_DESERT ? other : this.own.biome;
  }

  /** Sand tiles use desert densities. Green tiles replace desert densities with the other biome's densities. */
  private lowDensityBiome(side: number, other: number, sand: boolean): number {
    if (sand) return BIOME_DESERT;
    if (side !== BIOME_DESERT) return side;
    return other;
  }

  /** Check the final jittered position before placing the instance. Return true when placement succeeds. */
  private scatterOne(
    seed: number,
    c: number,
    j: number,
    hashRow: number,
    sub: number,
    model: number,
    scale: number,
    surface: number,
    mask: number,
    current: StretchPlan,
    isTree: boolean,
    out: CellPlacements,
  ): boolean {
    if (out.count >= MAX_PLACEMENTS || this.subUsed[sub] !== 0) return false;
    const x = SUB_OFFSET_M[sub % 3] + (rand4(seed, c, hashRow, SALT_VEG_POS) * 2 - 1) * SUB_JITTER_M;
    let z = SUB_OFFSET_M[(sub / 3) | 0] + (rand4(seed, c, hashRow + 512, SALT_VEG_POS) * 2 - 1) * SUB_JITTER_M;
    // Move tall props to the row's depth limit before checking placement.
    if (MODEL_TOP_U[model] * scale > TALL_U && z > TALL_Z_LIMIT_M[j]) z = TALL_Z_LIMIT_M[j];
    if (!this.spotOk(c, j, x, z, surface, mask, current)) return false;
    if (isTree) {
      for (let s = 0; s < this.treeCount; s++) {
        const dx = this.treeX[s] - x;
        const dz = this.treeZ[s] - z;
        if (dx * dx + dz * dz < TREE_SPACING_M * TREE_SPACING_M) return false;
      }
    }
    if (!this.addProp(model, j, x, z, rand4(seed, c, hashRow, SALT_VEG_YAW) * TAU, scale, out)) return false;
    if (isTree) {
      this.treeX[this.treeCount] = x;
      this.treeZ[this.treeCount] = z;
      this.treeCount += 1;
    }
    this.subUsed[sub] = 1;
    return true;
  }

  private spotOk(
    c: number,
    j: number,
    xM: number,
    zM: number,
    surface: number,
    mask: number,
    current: StretchPlan,
  ): boolean {
    if (surface !== SURFACE_LAND) return false; // Curved shores have no defined safe footprint for props.
    if ((mask & (PORT_N | PORT_S)) !== 0 && Math.abs(xM) < ROAD_CLEAR_M) return false;
    if ((mask & (PORT_E | PORT_W)) !== 0 && Math.abs(zM) < ROAD_CLEAR_M) return false;
    for (let s = 0; s < this.signCount && s < 2; s++) {
      const dx = this.signX[s] - xM;
      const dz = this.signZ[s] - zM;
      if (dx * dx + dz * dz < SIGN_CLEAR_R_M * SIGN_CLEAR_R_M) return false;
    }
    return true;
  }

  private addOverlays(
    seed: number,
    c: number,
    j: number,
    surface: number,
    season: number,
    current: StretchPlan,
    next: StretchPlan,
    out: CellPlacements,
  ): void {
    if (season !== SEASON_WINTER || current.biome === BIOME_DESERT) return;
    if (groundTopSlot(this.tileModel) === GROUND_SLOT_SAND) return;
    if (surface === SURFACE_WATER) {
      const nearShore =
        (j > 0 && surfaceAt(current, next, c, j - 1) === SURFACE_SHORE) ||
        (j + 1 < RING_ROWS && surfaceAt(current, next, c, j + 1) === SURFACE_SHORE);
      if (!nearShore) return;
      const model = variantModel(FAM_ICE_PATCH, SEASON_WINTER);
      const count = pick4(seed, c, j, SALT_OVERLAY, ICE_MAX + 1);
      for (let k = 0; k < count && out.count < MAX_PLACEMENTS; k++) {
        // The ice root uses the tile datum. Its surface is 0.02 metres above the water top.
        out.add(
          model,
          SUB_OFFSET_M[ICE_ANCHOR[k * 2]] * F,
          0,
          SUB_OFFSET_M[ICE_ANCHOR[k * 2 + 1]] * F,
          rand4(seed, c, j * 16 + k, SALT_OVERLAY) * TAU,
          1,
        );
      }
      return;
    }
    if (surface !== SURFACE_LAND || LOW_ROW[j] <= 0) return;
    const model = variantModel(FAM_SNOW_DRIFT, SEASON_WINTER);
    const count = pick4(seed, c, j, SALT_OVERLAY, DRIFT_MAX + 1);
    for (let k = 0; k < count; k++) {
      const sx = DRIFT_ANCHOR[k * 2];
      const sz = DRIFT_ANCHOR[k * 2 + 1];
      const sub = sz * 3 + sx;
      if (this.subUsed[sub] !== 0) continue;
      this.subUsed[sub] = 1;
      this.addProp(model, j, SUB_OFFSET_M[sx], SUB_OFFSET_M[sz], rand4(seed, c, j * 16 + k, SALT_OVERLAY) * TAU, 1, out);
    }
  }

  private addRockHalo(
    seed: number,
    c: number,
    j: number,
    surface: number,
    mask: number,
    previous: StretchPlan,
    current: StretchPlan,
    next: StretchPlan,
    out: CellPlacements,
  ): void {
    if (surface !== SURFACE_LAND || mask !== 0) return;
    if (j < 2 || j > LANDFORM_LAST_ROW) return;
    const model = variantModel(FAM_ROCK_CLUSTER, 0);
    for (let d = 0; d < 4; d++) {
      const nc = c + DIR_DC[d];
      const nj = j + DIR_DJ[d];
      if (nc < 0 || nj < 0 || nj > LANDFORM_LAST_ROW) continue;
      if (surfaceOwned(nc, nj, previous, current, next) !== SURFACE_LAND) continue;
      const owner = this.ownerAt(seed, nc, nj);
      if (chainFamily(seed, nc, nj, this.hardOwnerAt(seed, nc, nj)) < 0 && this.landformAt(seed, nc, nj, owner) < 0) {
        continue;
      }
      // Place rocks in this cell near the neighbouring landform.
      const sx = 1 + DIR_DC[d];
      const sz = 1 + DIR_DJ[d];
      const count = 1 + pick4(seed, c, j * 4 + d, SALT_ROCK_HALO, ROCK_HALO_MAX);
      for (let k = 0; k < count; k++) {
        const ox = d < 2 ? k : 0;
        const oz = d < 2 ? 0 : k;
        const cx = (sx + ox) % 3;
        const cz = (sz + oz) % 3;
        const sub = cz * 3 + cx;
        if (this.subUsed[sub] !== 0) continue;
        this.subUsed[sub] = 1;
        const x = SUB_OFFSET_M[cx] + (rand4(seed, c, j * 16 + k, SALT_ROCK_HALO) * 2 - 1) * HALO_JITTER_M;
        const z = SUB_OFFSET_M[cz] + (rand4(seed, c, j * 16 + k + 8, SALT_ROCK_HALO) * 2 - 1) * HALO_JITTER_M;
        if (!this.spotOk(c, j, x, z, surface, mask, current)) continue;
        this.addProp(model, j, x, z, rand4(seed, c, j * 16 + k, SALT_VEG_YAW) * TAU, 1, out);
      }
      return; // One neighbouring landform supplies rocks per cell to limit placement count.
    }
  }

  private pickSpecies(seed: number, c: number, j: number, k: number, biome: number, lastSlot: number): number {
    const base = biome * 4;
    const u = rand4(seed, c, j * 16 + k, SALT_VEG_SPECIES);
    let slot = 3;
    for (let s = 0; s < 4; s++) {
      if (u < TREE_SPECIES_CUM[base + s]) {
        slot = s;
        break;
      }
    }
    while (slot >= 0 && TREE_SPECIES[base + slot] < 0) slot -= 1;
    if (slot < 0) return -1;
    if (slot === lastSlot && TREE_SPECIES[base + 2] >= 0) {
      slot = (slot + 1) % 4;
      while (TREE_SPECIES[base + slot] < 0) slot = (slot + 1) % 4;
    }
    return slot;
  }
}

function isTJunction(mask: number): boolean {
  return mask === 7 || mask === 11 || mask === 13 || mask === 14;
}
