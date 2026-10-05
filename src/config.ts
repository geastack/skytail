export const GAME_TITLE = 'SKYTAIL'

export const DEFAULT_H = 100 // The resting height uses game units.
export const CAMERA_Z = 200; // The camera depth uses game units. Sky projection uses this value.
export const AMP_H = 80 // Vertical travel extends this many game units above and below DEFAULT_H.
export const AMP_W = 75 // The horizontal travel range uses game units.
export const SEA_RADIUS = 600

export const INIT_SPEED = 0.00035
export const INCREMENT_SPEED_BY_TIME = 0.0000025
export const INCREMENT_SPEED_BY_LEVEL = 0.000005
export const DIST_FOR_SPEED = 100
export const DIST_FOR_LEVEL = 1000
export const DIST_FOR_COINS = 100
export const DIST_FOR_ENEMIES = 50

// Multiplying the legacy light intensities by PI preserves their irradiance in current Three.js.
export const AMBIENT_REST = 0.5 * Math.PI
export const AMBIENT_FLASH = 2 * Math.PI

export const SPLASH_X = -AMP_W * 0.7
export const SPLASH_ROT = 0.00022
export const COIN_WAVES = 16
export const FLIP_DURATION = 700 // One barrel roll takes this many milliseconds.
export const COIN_POOL_SIZE = 20
export const ENEMY_POOL_SIZE = 10
export const COIN_SPEED_MUL = 0.5
export const COIN_COLLIDE_TOL = 15
export const ENEMY_SPEED_MUL = 0.6
export const ENEMY_COLLIDE_TOL = 10

// Tangent asset kit tiles are 10 metres wide. Their width fixes the conversion to game units.
// Rows advance along +Z toward the camera from RING_Z0.
export const KIT_UNITS_PER_METRE = 5.98895; // Game units per metre: 2 * SEA_RADIUS * tan(PI / RING_COLUMNS) / 10.
export const RING_COLUMNS = 63;
export const RING_ROWS = 11;
export const RING_TILE = 59.8895; // The tangent tile width uses game units.
export const RING_Z0 = -420.055; // This is the centre Z coordinate of row 0. Rows span -450.0 to +208.8 game units.
export const RING_SECTORS = 9; // Each sector spans seven columns, or 40 degrees.
export const RING_SECTOR_COLS = 7;
export const RING_CORRIDOR_ROW = 7; // This row lies under the flight corridor, near Z = 0.
export const TOP_RADIUS_MAX = 646.1; // This includes the terrain ring, tile height, and tallest landed model (hot_air_balloon).
export const MAX_CELLS_PER_FRAME = 10; // Limit the number of cells rewritten per frame.
export const STRETCH_W_MIN = 32; // The minimum stretch width uses columns.
export const STRETCH_W_MAX = 48;
export const COLS_PER_SEASON = 400; // A season lasts this many columns.
export const DIST_PER_DAY = 1000; // A day-night cycle spans this much flight distance.
export const SPLASH_SEED = 0x436f796f;
export const FOG_NEAR = 100;
export const FOG_FAR = 750;
