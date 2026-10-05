import { BIOME_ALPINE, ROAD_PIECE, ROAD_QUARTER, TREE_ROW, TREE_ROW_ALPINE } from './tables';

export function treeRowFactor(biome: number, j: number): number {
  return biome === BIOME_ALPINE ? TREE_ROW_ALPINE[j] : TREE_ROW[j];
}

export function roadPieceOf(mask: number): number {
  return ROAD_PIECE[mask];
}

/** Return the number of quarter turns around +Y for the road edge mask. */
export function roadQuarterOf(mask: number): number {
  return ROAD_QUARTER[mask];
}
