import { KIT_UNITS_PER_METRE, RING_ROWS, RING_TILE, RING_Z0, SEA_RADIUS, TOP_RADIUS_MAX } from '../config';
import {
  KIT_MODEL_COUNT,
  M_BRIDGE_APPROACH,
  M_SHORE_SADDLE, M_SHORE_SADDLE__SPRING, M_SHORE_SADDLE__AUTUMN, M_SHORE_SADDLE__WINTER,
  M_BRIDGE_SUSPENSION,
  M_CACTUS_FORK_TEAL,
  M_CACTUS_SAGUARO_GREEN,
  M_CACTUS_SAGUARO_TEAL,
  M_CAMPFIRE_SOURCE,
  M_CAMP_FLAG,
  M_CANYON_PILLAR,
  M_CONIFER_BROAD_AUTUMN,
  M_CONIFER_BROAD_SPRING,
  M_CONIFER_BROAD_SUMMER,
  M_CONIFER_BROAD_WINTER,
  M_CONIFER_CLEAN_TRIANGLE,
  M_CONIFER_CLEAN_TRIANGLE__AUTUMN,
  M_CONIFER_CLEAN_TRIANGLE__SPRING,
  M_CONIFER_CLUSTER_AUTUMN,
  M_CONIFER_CLUSTER_SPRING,
  M_CONIFER_CLUSTER_SUMMER,
  M_CONIFER_CLUSTER_WINTER,
  M_CONIFER_SPIRE_AUTUMN,
  M_CONIFER_SPIRE_SPRING,
  M_CONIFER_SPIRE_SUMMER,
  M_CONIFER_SPIRE_WINTER,
  M_DECIDUOUS_ROUND_AUTUMN,
  M_DECIDUOUS_ROUND_SPRING,
  M_DECIDUOUS_ROUND_SUMMER,
  M_DECIDUOUS_ROUND_WINTER,
  M_DECIDUOUS_WINDSWEPT_AUTUMN,
  M_DECIDUOUS_WINDSWEPT_SPRING,
  M_DECIDUOUS_WINDSWEPT_SUMMER,
  M_DECIDUOUS_WINDSWEPT_WINTER,
  M_DESERT_MESA,
  M_DISTANT_ROLLING_RIDGE_TEAL,
  M_DISTANT_ROLLING_RIDGE_VIOLET,
  M_FIREWOOD_STACK,
  M_GRASS_TUFT_AUTUMN,
  M_GRASS_TUFT_SPRING,
  M_GRASS_TUFT_SUMMER,
  M_GROUND_JAGGED_PATCH,
  M_GROUND_JAGGED_PATCH__AUTUMN,
  M_GROUND_MEADOW_AUTUMN,
  M_GROUND_MEADOW_DRY_SAND,
  M_GROUND_MEADOW_SPRING,
  M_GROUND_MEADOW_SUMMER,
  M_GROUND_MEADOW_WINTER,
  M_HILL_ASYMMETRIC_SUMMER,
  M_HILL_ASYMMETRIC_SUMMER__AUTUMN,
  M_HILL_ASYMMETRIC_SUMMER__SPRING,
  M_HILL_ASYMMETRIC_WINTER,
  M_HILL_ROUND_AUTUMN,
  M_HILL_ROUND_SPRING,
  M_HILL_ROUND_SUMMER,
  M_HILL_ROUND_WINTER,
  M_ICE_PATCH,
  M_LOG_SEAT,
  M_MOUNTAIN_SNOW_PEAK,
  M_MOUNTAIN_TWIN_PEAK,
  M_ROAD_CURVE,
  M_ROAD_STRAIGHT,
  M_ROAD_S_BEND,
  M_ROAD_T_JUNCTION,
  M_ROCK_CLUSTER,
  M_SHORE_CORNER_OUTER,
  M_SHORE_CORNER_OUTER__SPRING,
  M_SHORE_CORNER_OUTER__AUTUMN,
  M_SHORE_CORNER_OUTER__WINTER,
  M_SHORE_CORNER_INNER,
  M_SHORE_CORNER_INNER__SPRING,
  M_SHORE_CORNER_INNER__AUTUMN,
  M_SHORE_CORNER_INNER__WINTER,
  M_SHORE_END_CAP,
  M_SHORE_END_CAP__SPRING,
  M_SHORE_END_CAP__AUTUMN,
  M_SHORE_END_CAP__WINTER,
  M_SHORE_COVE,
  M_SHORE_COVE__AUTUMN,
  M_SHORE_COVE__SPRING,
  M_SHORE_COVE__WINTER,
  M_SHORE_HEADLAND,
  M_SHORE_HEADLAND__AUTUMN,
  M_SHORE_HEADLAND__SPRING,
  M_SHORE_HEADLAND__WINTER,
  M_SHORE_STRAIGHT,
  M_SHORE_STRAIGHT__AUTUMN,
  M_SHORE_STRAIGHT__SPRING,
  M_SHORE_STRAIGHT__WINTER,
  M_SHRUB_LOBED_AUTUMN,
  M_SHRUB_LOBED_SUMMER,
  M_SHRUB_LOBED_SUMMER__SPRING,
  M_SIGNPOST_ARROW_BLANK,
  M_SIGNPOST_TURN_SYMBOL,
  M_SNOW_DRIFT,
  M_TENT_A_FRAME_GOLD,
  M_TENT_A_FRAME_MAGENTA,
  M_TENT_TALL_MAGENTA,
  M_TENT_TALL_TEAL,
  M_WATER_OPEN_BLUE,
  M_WATER_OPEN_ICE,
  M_WATER_OPEN_TEAL,
} from '../kit/generated/kit-ids';

/** F converts asset kit metres to game units. */
export const F = KIT_UNITS_PER_METRE;

/** The tile edge uses metres. Each cell spans [-5, +5] on X and Z. */
export const CELL_M = 10;
/** The 3-by-3 vegetation grid uses this pitch in metres. */
export const SUB_PITCH_M = 10 / 3;
/** The sub-cell jitter half-range uses metres. */
export const SUB_JITTER_M = 1.2;

/**
 * The ground and bank top is 0.24 metres above the tile datum, converted to game units.
 * Water tops are 0.08 metres high. Ice patches use the tile datum as their root.
 */
export const GROUND_TOP_U = 0.24 * F;

/** The corridor and foreground height cap is 1.5 metres, converted to game units. */
export const LOW_ROW_CAP_U = 1.5 * F;
export const LOW_ROW_FIRST = 7;
/** A prop taller than this many game units must satisfy the tall-prop depth limit. */
export const TALL_U = 9;
/** Tall props must stay at or below this ring-local Z coordinate in game units. */
export const TALL_Z_MAX_U = -48;
/** This is the maximum instance top height above the tile datum, in game units. */
export const TOP_LIMIT_U = TOP_RADIUS_MAX - SEA_RADIUS;

export const LANDFORM_LAST_ROW = 5;

export const BIOME_MEADOW = 0;
export const BIOME_WOODLAND = 1;
export const BIOME_CONIFER = 2;
export const BIOME_ALPINE = 3;
export const BIOME_DESERT = 4;
export const BIOME_COUNT = 5;

export const PROFILE_INLAND = 0;
export const PROFILE_FAR_COAST = 1;
export const PROFILE_NEAR_COAST = 2;

export const SURFACE_LAND = 0;
export const SURFACE_WATER = 1;
export const SURFACE_SHORE = 2;

export const POI_NONE = 0;
export const POI_CAMP = 1;

// Distinct salts give random choices separate streams.
export const SALT_T = 0x101;
export const SALT_M = 0x102;
export const SALT_W = 0x103;
export const SALT_D = 0x104;
export const SALT_WIDTH = 0x201;
export const SALT_BIOME = 0x202;
export const SALT_PROFILE = 0x203;
export const SALT_PROFILE_KEEP = 0x204;
export const SALT_SEASON = 0x205;
export const SALT_MIX = 0x207;
export const SALT_CAMP_YAW = 0x302;
export const SALT_CAMP_PIECE = 0x303;
export const SALT_SHORE = 0x501;
export const SALT_TILE_YAW = 0x502;
export const SALT_SNOWLINE = 0x503;
export const SALT_LANDFORM = 0x601;
export const SALT_LANDFORM_PICK = 0x602;
export const SALT_ROCK_HALO = 0x603;
export const SALT_VEG_POS = 0x702;
export const SALT_VEG_SPECIES = 0x703;
export const SALT_VEG_YAW = 0x704;
export const SALT_VEG_SCALE = 0x705;
export const SALT_LOW = 0x706;
export const SALT_VEG_MIX = 0x707;
export const SALT_OVERLAY = 0x801;

/** Each row is a bitmask of allowed successor biomes. Bit b selects biome b. */
export const BIOME_LEGAL = new Int32Array([
  0b11111, // Meadow allows all biomes. Climate restricts alpine to T < 0 and desert to T > 0.
  0b00111, // Woodland allows meadow, woodland, and conifer.
  0b01111, // Conifer allows meadow, woodland, conifer, and alpine.
  0b01101, // Alpine allows meadow, conifer, and alpine.
  0b10001, // Desert allows meadow and desert.
]);

export const BIOME_BASE_WEIGHT = 1;
export const BIOME_REPEAT_WEIGHT = 0.35;

/** Weights follow profile order: inland, far coast, near coast. */
export const PROFILE_WEIGHT = new Float32Array([0.45, 0.3, 0.25]);
export const PROFILE_KEEP_P = 0.5;
/** The colour and species blend width uses columns. */
export const ZONE_COLS_DEFAULT = 9;
export const ZONE_COLS_SEASON = 9;
export const ZONE_COLS_TILE_FAMILY = 1;
/** The maximum border displacement is 0.45*5 + 1.2 columns. */
export const ZONE_WARP_COLS = 3.45;
/** This is the minimum scale multiplier for a tree from the biome with less blend weight. */
export const EDGE_SCALE_MIN = 0.7;

export const SHORE_ROW_FAR = 3;
export const SHORE_ROW_NEAR = 7;

/** Season temperature offsets use SEASON_* order. */
export const SEASON_TEMP = new Float32Array([0, 0.3, 0, -0.6]);
/** The effective-temperature row term uses row order. */
export const ROW_BAND = new Float32Array([0.4, 0.4, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0]);
export const ALPINE_TEMP = -0.5;
export const SNOW_T_EFF = -0.3;
export const SNOW_JITTER = 0.15;

export const FAM_GROUND_MEADOW = 0;
export const FAM_GROUND_SAND = 1;
export const FAM_WATER_SEA = 2;
export const FAM_WATER_CANYON = 3;
export const FAM_SHORE_STRAIGHT = 4;
export const FAM_SHORE_COVE = 5;
export const FAM_SHORE_HEADLAND = 6;
export const FAM_HILL_ROUND = 7;
export const FAM_HILL_ASYM = 8;
export const FAM_MOUNTAIN_SNOW = 9;
export const FAM_MOUNTAIN_TWIN = 10;
export const FAM_DESERT_MESA = 11;
export const FAM_CANYON_PILLAR = 12;
export const FAM_RIDGE_VIOLET = 13;
export const FAM_RIDGE_TEAL = 14;
export const FAM_ROCK_CLUSTER = 15;
export const FAM_CONIFER_SPIRE = 16;
export const FAM_CONIFER_BROAD = 17;
export const FAM_CONIFER_CLUSTER = 18;
export const FAM_CONIFER_TRIANGLE = 19;
export const FAM_DECID_ROUND = 20;
export const FAM_DECID_WINDSWEPT = 21;
export const FAM_CACTUS_SAGUARO_GREEN = 22;
export const FAM_CACTUS_SAGUARO_TEAL = 23;
export const FAM_CACTUS_FORK = 24;
export const FAM_GRASS_TUFT = 25;
export const FAM_SHRUB_LOBED = 26;
export const FAM_JAGGED_PATCH = 27;
export const FAM_ICE_PATCH = 28;
export const FAM_SNOW_DRIFT = 29;
export const FAM_SHORE_OUTER = 30;
export const FAM_SHORE_INNER = 31;
export const FAM_SHORE_END = 32;
export const FAM_SHORE_SADDLE = 33;
export const FAMILY_COUNT = 34;

/** Each land-corner mask selects a shore family. SHORE_QUARTER gives its quarter turns around +Y. */
export const SHORE_FAMILY = new Int8Array([
  -1, FAM_SHORE_OUTER, FAM_SHORE_OUTER, FAM_SHORE_STRAIGHT,
  FAM_SHORE_OUTER, FAM_SHORE_SADDLE, FAM_SHORE_STRAIGHT, FAM_SHORE_INNER,
  FAM_SHORE_OUTER, FAM_SHORE_STRAIGHT, FAM_SHORE_SADDLE, FAM_SHORE_INNER,
  FAM_SHORE_STRAIGHT, FAM_SHORE_INNER, FAM_SHORE_INNER, -1,
]);
export const SHORE_QUARTER = new Int8Array([0, 0, 3, 0, 2, 0, 3, 3, 1, 1, 1, 0, 2, 1, 2, 0]);

/**
 * Each (family, season) pair selects a model ID. A value of -1 omits placement.
 * Winter substitutions appear directly in the table, including conifer_cluster_winter for conifer_clean_triangle.
 * Seasons follow spring, summer, autumn, winter order.
 */
export const VARIANT_MODEL = new Int16Array([
  M_GROUND_MEADOW_SPRING, M_GROUND_MEADOW_SUMMER, M_GROUND_MEADOW_AUTUMN, M_GROUND_MEADOW_WINTER,
  M_GROUND_MEADOW_DRY_SAND, M_GROUND_MEADOW_DRY_SAND, M_GROUND_MEADOW_DRY_SAND, M_GROUND_MEADOW_DRY_SAND,
  M_WATER_OPEN_BLUE, M_WATER_OPEN_BLUE, M_WATER_OPEN_BLUE, M_WATER_OPEN_BLUE,
  M_WATER_OPEN_TEAL, M_WATER_OPEN_TEAL, M_WATER_OPEN_TEAL, M_WATER_OPEN_TEAL,
  M_SHORE_STRAIGHT__SPRING, M_SHORE_STRAIGHT, M_SHORE_STRAIGHT__AUTUMN, M_SHORE_STRAIGHT__WINTER,
  M_SHORE_COVE__SPRING, M_SHORE_COVE, M_SHORE_COVE__AUTUMN, M_SHORE_COVE__WINTER,
  M_SHORE_HEADLAND__SPRING, M_SHORE_HEADLAND, M_SHORE_HEADLAND__AUTUMN, M_SHORE_HEADLAND__WINTER,
  M_HILL_ROUND_SPRING, M_HILL_ROUND_SUMMER, M_HILL_ROUND_AUTUMN, M_HILL_ROUND_WINTER,
  M_HILL_ASYMMETRIC_SUMMER__SPRING, M_HILL_ASYMMETRIC_SUMMER, M_HILL_ASYMMETRIC_SUMMER__AUTUMN, M_HILL_ASYMMETRIC_WINTER,
  M_MOUNTAIN_SNOW_PEAK, M_MOUNTAIN_SNOW_PEAK, M_MOUNTAIN_SNOW_PEAK, M_MOUNTAIN_SNOW_PEAK,
  M_MOUNTAIN_TWIN_PEAK, M_MOUNTAIN_TWIN_PEAK, M_MOUNTAIN_TWIN_PEAK, M_MOUNTAIN_TWIN_PEAK,
  M_DESERT_MESA, M_DESERT_MESA, M_DESERT_MESA, M_DESERT_MESA,
  M_CANYON_PILLAR, M_CANYON_PILLAR, M_CANYON_PILLAR, M_CANYON_PILLAR,
  M_DISTANT_ROLLING_RIDGE_VIOLET, M_DISTANT_ROLLING_RIDGE_VIOLET, M_DISTANT_ROLLING_RIDGE_VIOLET, M_DISTANT_ROLLING_RIDGE_VIOLET,
  M_DISTANT_ROLLING_RIDGE_TEAL, M_DISTANT_ROLLING_RIDGE_TEAL, M_DISTANT_ROLLING_RIDGE_TEAL, M_DISTANT_ROLLING_RIDGE_TEAL,
  M_ROCK_CLUSTER, M_ROCK_CLUSTER, M_ROCK_CLUSTER, M_ROCK_CLUSTER,
  M_CONIFER_SPIRE_SPRING, M_CONIFER_SPIRE_SUMMER, M_CONIFER_SPIRE_AUTUMN, M_CONIFER_SPIRE_WINTER,
  M_CONIFER_BROAD_SPRING, M_CONIFER_BROAD_SUMMER, M_CONIFER_BROAD_AUTUMN, M_CONIFER_BROAD_WINTER,
  M_CONIFER_CLUSTER_SPRING, M_CONIFER_CLUSTER_SUMMER, M_CONIFER_CLUSTER_AUTUMN, M_CONIFER_CLUSTER_WINTER,
  M_CONIFER_CLEAN_TRIANGLE__SPRING, M_CONIFER_CLEAN_TRIANGLE, M_CONIFER_CLEAN_TRIANGLE__AUTUMN, M_CONIFER_CLUSTER_WINTER,
  M_DECIDUOUS_ROUND_SPRING, M_DECIDUOUS_ROUND_SUMMER, M_DECIDUOUS_ROUND_AUTUMN, M_DECIDUOUS_ROUND_WINTER,
  M_DECIDUOUS_WINDSWEPT_SPRING, M_DECIDUOUS_WINDSWEPT_SUMMER, M_DECIDUOUS_WINDSWEPT_AUTUMN, M_DECIDUOUS_WINDSWEPT_WINTER,
  M_CACTUS_SAGUARO_GREEN, M_CACTUS_SAGUARO_GREEN, M_CACTUS_SAGUARO_GREEN, M_CACTUS_SAGUARO_GREEN,
  M_CACTUS_SAGUARO_TEAL, M_CACTUS_SAGUARO_TEAL, M_CACTUS_SAGUARO_TEAL, M_CACTUS_SAGUARO_TEAL,
  M_CACTUS_FORK_TEAL, M_CACTUS_FORK_TEAL, M_CACTUS_FORK_TEAL, M_CACTUS_FORK_TEAL,
  M_GRASS_TUFT_SPRING, M_GRASS_TUFT_SUMMER, M_GRASS_TUFT_AUTUMN, -1,
  M_SHRUB_LOBED_SUMMER__SPRING, M_SHRUB_LOBED_SUMMER, M_SHRUB_LOBED_AUTUMN, -1,
  M_GROUND_JAGGED_PATCH, M_GROUND_JAGGED_PATCH, M_GROUND_JAGGED_PATCH__AUTUMN, -1,
  -1, -1, -1, M_ICE_PATCH,
  -1, -1, -1, M_SNOW_DRIFT,
  M_SHORE_CORNER_OUTER__SPRING, M_SHORE_CORNER_OUTER, M_SHORE_CORNER_OUTER__AUTUMN, M_SHORE_CORNER_OUTER__WINTER,
  M_SHORE_CORNER_INNER__SPRING, M_SHORE_CORNER_INNER, M_SHORE_CORNER_INNER__AUTUMN, M_SHORE_CORNER_INNER__WINTER,
  M_SHORE_END_CAP__SPRING, M_SHORE_END_CAP, M_SHORE_END_CAP__AUTUMN, M_SHORE_END_CAP__WINTER,
  M_SHORE_SADDLE__SPRING, M_SHORE_SADDLE, M_SHORE_SADDLE__AUTUMN, M_SHORE_SADDLE__WINTER,
]);

/** Each biome has four species slots. A value of -1 marks an unused slot. */
export const TREE_SPECIES = new Int16Array([
  FAM_DECID_ROUND, FAM_DECID_WINDSWEPT, FAM_CONIFER_TRIANGLE, -1,
  FAM_DECID_ROUND, FAM_DECID_WINDSWEPT, FAM_CONIFER_BROAD, -1,
  FAM_CONIFER_SPIRE, FAM_CONIFER_BROAD, FAM_CONIFER_CLUSTER, FAM_CONIFER_TRIANGLE,
  FAM_CONIFER_SPIRE, FAM_CONIFER_CLUSTER, -1, -1,
  FAM_CACTUS_SAGUARO_GREEN, FAM_CACTUS_SAGUARO_TEAL, FAM_CACTUS_FORK, -1,
]);

/** Cumulative weights use the same slot order as TREE_SPECIES. */
export const TREE_SPECIES_CUM = new Float32Array([
  0.6, 0.85, 1, 1,
  0.5, 0.85, 1, 1,
  0.4, 0.7, 0.9, 1,
  0.5, 1, 1, 1,
  0.5, 0.75, 1, 1,
]);

/** These are mean tree counts per cell at D = 0.5 in the biome core. */
export const TREE_BASE = new Float32Array([0.6, 3, 3.5, 1, 0.8]);

export const TREE_ROW = new Float32Array([0.5, 0.7, 1, 1, 1, 1, 0.6, 0, 0, 0, 0]);
export const TREE_ROW_ALPINE = new Float32Array([0, 0, 0.3, 0.3, 1, 1, 1, 0, 0, 0, 0]);

export const LOW_FAMILY = new Int16Array([FAM_GRASS_TUFT, FAM_SHRUB_LOBED, FAM_JAGGED_PATCH, FAM_ROCK_CLUSTER]);
/** Mean counts use biome order. Each biome has grass, shrub, patch, and rock entries. */
export const LOW_DENSITY = new Float32Array([
  2, 0.8, 0.4, 0.2,
  0.5, 0.4, 0, 0,
  0.3, 0.4, 0, 0.6,
  0.3, 0, 0, 0.8,
  0, 0, 0, 0.8,
]);
/** Heavy fog obscures small props in rows 0 and 1. Row 10 also excludes small props. */
export const LOW_ROW = new Float32Array([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
export const SHRUB_EDGE_MUL = 3;

/** Each biome has three landform candidate slots. Parallel arrays give the family, first row, last row, and probability. */
export const LANDFORM_FAMILY = new Int16Array([
  FAM_HILL_ROUND, -1, -1,
  FAM_HILL_ROUND, -1, -1,
  FAM_HILL_ASYM, FAM_MOUNTAIN_SNOW, -1,
  FAM_MOUNTAIN_SNOW, FAM_HILL_ASYM, -1,
  FAM_DESERT_MESA, FAM_MOUNTAIN_TWIN, FAM_CANYON_PILLAR,
]);
export const LANDFORM_ROW_MIN = new Int8Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0, 2]);
export const LANDFORM_ROW_MAX = new Int8Array([5, 0, 0, 5, 0, 0, 5, 3, 0, 3, 5, 0, 4, 3, 5]);
export const LANDFORM_P = new Float32Array([
  0.25, 0, 0,
  0.3, 0, 0,
  0.3, 0.2, 0,
  0.5, 0.3, 0,
  0.4, 0.25, 0.3,
]);
export const LANDFORM_W_BASE = 0.15;
export const LANDFORM_W_GAIN = 0.5;
/** The uniform chain scale makes neighbouring landforms overlap by approximately one metre. */
export const CHAIN_SCALE = 1.1;
/** The horizon chain depth offset uses metres. */
export const CHAIN_Z_M = -2.5;
export const J0_LANDFORM_Z_M = 2;
export const ROCK_HALO_MAX = 2;

/** Vegetation must stay this many metres from a road centreline. */
export const ROAD_CLEAR_M = 2.5;

/** Campsite radii and sign clearance radii use metres. */
export const CAMP_TENT_R_M = 3.6;
export const CAMP_SEAT_R_M = 1.8;
export const CAMP_FIREWOOD_R_M = 2.8;
export const CAMP_FLAG_R_M = 4;
export const CAMP_CLEAR_R_M = 6;
export const SIGN_CLEAR_R_M = 3;
/**
 * Campsite angles use radians relative to the fire's yaw.
 * The radii and angles allow at least 0.24 metres between piece footprints across all tent pairs and jitter extremes.
 */
export const CAMP_SEAT_ANGLE = new Float32Array([(75 * Math.PI) / 180, (195 * Math.PI) / 180, (305 * Math.PI) / 180]);
export const CAMP_SEAT_JITTER = (10 * Math.PI) / 180;
export const CAMP_TENT_B_ANGLE = (135 * Math.PI) / 180;
export const CAMP_FIREWOOD_ANGLE = (250 * Math.PI) / 180;
export const CAMP_FLAG_ANGLE = (60 * Math.PI) / 180;
export const CAMP_TENT_B_P = 0.6;
export const CAMP_TENTS = new Int16Array([M_TENT_A_FRAME_GOLD, M_TENT_A_FRAME_MAGENTA, M_TENT_TALL_MAGENTA, M_TENT_TALL_TEAL]);
export const CAMP_FIRE = M_CAMPFIRE_SOURCE;
export const CAMP_SEAT = M_LOG_SEAT;
export const CAMP_FIREWOOD = M_FIREWOOD_STACK;
export const CAMP_FLAG = M_CAMP_FLAG;

/** Winter overlay anchors use X and Z sub-cell indices. */
export const ICE_ANCHOR = new Int8Array([0, 2, 2, 0]);
export const DRIFT_ANCHOR = new Int8Array([0, 0, 1, 2, 2, 1]);
export const ICE_MAX = 2;
export const DRIFT_MAX = 3;

// Road ports use N=-Z, S=+Z, E=+X, W=-X. East advances the column index.
export const PORT_N = 1;
export const PORT_S = 2;
export const PORT_E = 4;
export const PORT_W = 8;
/** Directions 0 to 3 use north, south, east, west order. */
export const DIR_PORT = new Int8Array([PORT_N, PORT_S, PORT_E, PORT_W]);
export const DIR_OPPOSITE = new Int8Array([1, 0, 3, 2]);
export const DIR_DJ = new Int8Array([-1, 1, 0, 0]);
export const DIR_DC = new Int8Array([0, 0, 1, -1]);

/**
 * Each road edge mask selects a piece. ROAD_QUARTER gives its quarter turns around +Y.
 * Masks 0 and 15 select -1 because neither has a road piece.
 */
export const ROAD_PIECE = new Int16Array([
  -1, M_ROAD_STRAIGHT, M_ROAD_STRAIGHT, M_ROAD_STRAIGHT,
  M_ROAD_STRAIGHT, M_ROAD_CURVE, M_ROAD_CURVE, M_ROAD_T_JUNCTION,
  M_ROAD_STRAIGHT, M_ROAD_CURVE, M_ROAD_CURVE, M_ROAD_T_JUNCTION,
  M_ROAD_STRAIGHT, M_ROAD_T_JUNCTION, M_ROAD_T_JUNCTION, -1,
]);
export const SIGN_TURN = M_SIGNPOST_TURN_SYMBOL;
export const SIGN_ARROW = M_SIGNPOST_ARROW_BLANK;
/** The signpost offset uses metres. Signposts are 17.7 game units tall and must satisfy the tall-prop depth limit. */
export const SIGN_OFFSET_M = 2.8;
export const WATER_ICE = M_WATER_OPEN_ICE;
export const ROAD_QUARTER = new Int8Array([
  0, 0, 0, 0, 1, 1, 0, 0, 1, 2, 3, 2, 1, 1, 3, 0,
]);

/**
 * Model top heights use asset kit metres and pair with MODEL_TOP_ID.
 * Named model constants preserve the height and ID pairs when a bake changes model IDs.
 */
const MODEL_TOP_ID = new Int16Array([
  M_BRIDGE_SUSPENSION, M_CACTUS_FORK_TEAL, M_CACTUS_SAGUARO_GREEN, M_CACTUS_SAGUARO_TEAL,
  M_CAMPFIRE_SOURCE, M_CAMP_FLAG, M_CANYON_PILLAR, M_CONIFER_BROAD_AUTUMN,
  M_CONIFER_BROAD_SPRING, M_CONIFER_BROAD_SUMMER, M_CONIFER_BROAD_WINTER, M_CONIFER_CLEAN_TRIANGLE,
  M_CONIFER_CLEAN_TRIANGLE__AUTUMN, M_CONIFER_CLEAN_TRIANGLE__SPRING, M_CONIFER_CLUSTER_AUTUMN, M_CONIFER_CLUSTER_SPRING,
  M_CONIFER_CLUSTER_SUMMER, M_CONIFER_CLUSTER_WINTER, M_CONIFER_SPIRE_AUTUMN, M_CONIFER_SPIRE_SPRING,
  M_CONIFER_SPIRE_SUMMER, M_CONIFER_SPIRE_WINTER, M_DECIDUOUS_ROUND_AUTUMN, M_DECIDUOUS_ROUND_SPRING,
  M_DECIDUOUS_ROUND_SUMMER, M_DECIDUOUS_ROUND_WINTER, M_DECIDUOUS_WINDSWEPT_AUTUMN, M_DECIDUOUS_WINDSWEPT_SPRING,
  M_DECIDUOUS_WINDSWEPT_SUMMER, M_DECIDUOUS_WINDSWEPT_WINTER, M_DESERT_MESA, M_DISTANT_ROLLING_RIDGE_TEAL,
  M_DISTANT_ROLLING_RIDGE_VIOLET, M_FIREWOOD_STACK, M_GRASS_TUFT_AUTUMN, M_GRASS_TUFT_SPRING,
  M_GRASS_TUFT_SUMMER, M_GROUND_JAGGED_PATCH, M_GROUND_JAGGED_PATCH__AUTUMN, M_GROUND_MEADOW_AUTUMN,
  M_GROUND_MEADOW_DRY_SAND, M_GROUND_MEADOW_SPRING, M_GROUND_MEADOW_SUMMER, M_GROUND_MEADOW_WINTER,
  M_HILL_ASYMMETRIC_SUMMER, M_HILL_ASYMMETRIC_SUMMER__AUTUMN, M_HILL_ASYMMETRIC_SUMMER__SPRING, M_HILL_ASYMMETRIC_WINTER,
  M_HILL_ROUND_AUTUMN, M_HILL_ROUND_SPRING, M_HILL_ROUND_SUMMER, M_HILL_ROUND_WINTER,
  M_ICE_PATCH, M_LOG_SEAT, M_MOUNTAIN_SNOW_PEAK, M_MOUNTAIN_TWIN_PEAK,
  M_ROAD_CURVE, M_ROAD_STRAIGHT, M_ROAD_S_BEND, M_ROAD_T_JUNCTION,
  M_ROCK_CLUSTER, M_SHORE_COVE, M_SHORE_COVE__AUTUMN, M_SHORE_COVE__SPRING,
  M_SHORE_COVE__WINTER, M_SHORE_HEADLAND, M_SHORE_HEADLAND__AUTUMN, M_SHORE_HEADLAND__SPRING,
  M_SHORE_HEADLAND__WINTER, M_SHORE_STRAIGHT, M_SHORE_STRAIGHT__AUTUMN, M_SHORE_STRAIGHT__SPRING,
  M_SHORE_STRAIGHT__WINTER, M_SHRUB_LOBED_AUTUMN, M_SHRUB_LOBED_SUMMER, M_SHRUB_LOBED_SUMMER__SPRING,
  M_SIGNPOST_ARROW_BLANK, M_SIGNPOST_TURN_SYMBOL, M_SNOW_DRIFT, M_TENT_A_FRAME_GOLD,
  M_TENT_A_FRAME_MAGENTA, M_TENT_TALL_MAGENTA, M_TENT_TALL_TEAL, M_WATER_OPEN_BLUE,
  M_WATER_OPEN_ICE, M_WATER_OPEN_TEAL,
]);
const MODEL_TOP_M = new Float32Array([
  1.870, 1.489, 2.587, 2.587, 1.674, 3.500, 5.000, 4.001,
  4.001, 4.001, 4.046, 3.400, 3.400, 3.400, 3.500, 3.500,
  3.500, 3.545, 5.000, 5.000, 5.000, 5.045, 2.804, 2.804,
  2.804, 2.884, 3.219, 3.219, 3.219, 3.209, 4.000, 2.000,
  2.000, 0.720, 0.200, 0.200, 0.200, 0.430, 0.430, 0.240,
  0.240, 0.240, 0.240, 0.473, 3.800, 3.800, 3.800, 3.920,
  2.800, 2.800, 2.800, 2.920, 0.100, 0.434, 5.800, 5.500,
  0.037, 0.037, 0.037, 0.037, 0.700, 0.240, 0.240, 0.240,
  0.240, 0.240, 0.240, 0.240, 0.240, 0.240, 0.240, 0.240,
  0.240, 0.900, 0.900, 0.900, 2.954, 2.954, 0.350, 2.400,
  2.400, 3.000, 3.000, 0.083, 0.083, 0.083,
]);

/** Model top heights use game units indexed by model ID. Unlisted models retain zero. */
export const MODEL_TOP_U = new Float32Array(KIT_MODEL_COUNT);
for (let i = 0; i < MODEL_TOP_ID.length; i++) {
  MODEL_TOP_U[MODEL_TOP_ID[i]] = MODEL_TOP_M[i] * F;
}

MODEL_TOP_U[M_BRIDGE_APPROACH] = 0.6 * F;

for (let family = FAM_SHORE_OUTER; family <= FAM_SHORE_SADDLE; family++) {
  for (let season = 0; season < 4; season++) MODEL_TOP_U[VARIANT_MODEL[family * 4 + season]] = 0.24 * F;
}

/** Each row stores the greatest cell-local Z, in metres, that keeps tall props at ring-local Z <= -48 game units. */
export const TALL_Z_LIMIT_M = new Float32Array(RING_ROWS);
for (let j = 0; j < RING_ROWS; j++) {
  TALL_Z_LIMIT_M[j] = (TALL_Z_MAX_U - (RING_Z0 + j * RING_TILE)) / F;
}

/** Sub-cell indices 0, 1, and 2 select centre offsets in metres. */
export const SUB_OFFSET_M = new Float32Array([-SUB_PITCH_M, 0, SUB_PITCH_M]);

/** These linear colour bytes, divided by 255, match the baked vertex colours used for gain calculations. */
export const TILE_TOP_LINEAR = new Float32Array([
  114 / 255, 168 / 255, 23 / 255, // Spring.
  69 / 255, 141 / 255, 13 / 255, // Summer.
  237 / 255, 119 / 255, 7 / 255, // Autumn.
  239 / 255, 246 / 255, 255 / 255, // Winter.
  239 / 255, 161 / 255, 74 / 255, // Sand.
]);
export const GROUND_SLOT_SAND = 3 + 1;
export const GROUND_SLOT_WINTER = 3;

/** Return the TILE_TOP_LINEAR row for a ground model, or -1 for other models. */
export function groundTopSlot(model: number): number {
  if (model === M_GROUND_MEADOW_SPRING) return 0;
  if (model === M_GROUND_MEADOW_SUMMER) return 1;
  if (model === M_GROUND_MEADOW_AUTUMN) return 2;
  if (model === M_GROUND_MEADOW_WINTER) return GROUND_SLOT_WINTER;
  if (model === M_GROUND_MEADOW_DRY_SAND) return GROUND_SLOT_SAND;
  return -1;
}

export function zoneColumns(_biomeA: number, _seasonA: number, _biomeB: number, _seasonB: number): number {
  return ZONE_COLS_DEFAULT;
}

export function tileZoneColumns(_biomeA: number, _seasonA: number, _biomeB: number, _seasonB: number): number {
  return ZONE_COLS_TILE_FAMILY;
}

/** Return the model ID for (family, season), or -1 when the table omits the variant. */
export function variantModel(family: number, season: number): number {
  return VARIANT_MODEL[family * 4 + season];
}

