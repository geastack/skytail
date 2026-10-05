import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import type { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { KIT_UNITS_PER_METRE, RING_COLUMNS, RING_ROWS, RING_SECTORS, RING_TILE, RING_Z0, SEA_RADIUS } from '../src/config';
import {
  KIT_MODEL_NAMES,
  M_AIRPLANE_ROUNDED_GOLD,
  M_CAMPFIRE_SOURCE,
  M_GROUND_MEADOW_SUMMER,
  M_SHORE_CORNER_INNER__WINTER,
  M_WATER_OPEN_BLUE,
} from '../src/kit/generated/kit-ids';
import { sharedKit } from '../src/kit/kit';
import { TerrainRing, weldTileGeometry, isGroundTile, pickCampfires, terrainCap } from '../src/world/terrain-ring';
import { ROAD_SHAPE_COUNT } from '../src/worldgen/plan';
import { DebugGenerator } from './helpers/debug-generator';
import { SEASON_SUMMER, type CellPlacements, type WorldGenerator } from '../src/worldgen/placements';
import { SLOT_STEP, slotAngle } from '../src/worldgen/scheduler';

/** One sector contains 7 columns and 11 rows. */
const RING_SECTOR_CELLS = 77;
/** Match the campfire capacity per sector in terrain-ring.ts. */
const CAP_CAMP = 6;

function meshOf(ring: TerrainRing, modelId: number, part: string, crosswise = false): InstancedMesh {
  const name = KIT_MODEL_NAMES[modelId] + '/' + part + (crosswise ? '/z' : '/x');
  for (const child of ring.ring.children) {
    const mesh = child as InstancedMesh;
    if (mesh.name === name) return mesh;
  }
  throw new Error('no InstancedMesh for ' + name);
}

function tileCount(ring: TerrainRing, modelId: number): number {
  return meshOf(ring, modelId, 'main').count + meshOf(ring, modelId, 'main', true).count;
}

function tileMatrix(ring: TerrainRing, column: number, row: number): Matrix4 {
  const expected = new Vector3(SEA_RADIUS * Math.cos(slotAngle(column)),
    SEA_RADIUS * Math.sin(slotAngle(column)), RING_Z0 + row * RING_TILE);
  const matrix = new Matrix4();
  const point = new Vector3();
  for (const crosswise of [false, true]) {
    const mesh = meshOf(ring, M_GROUND_MEADOW_SUMMER, 'main', crosswise);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      if (point.setFromMatrixPosition(matrix).distanceTo(expected) < 0.001) return matrix;
    }
  }
  throw new Error('missing tile');
}

describe('terrain capacities', () => {
  it('allocates capacity for 108 terrain models and excludes aircraft and sky models', () => {
    let variants = 0;
    let instances = 0;
    for (const name of KIT_MODEL_NAMES) {
      const cap = terrainCap(name);
      if (cap === 0) continue;
      variants += 1;
      instances += cap;
    }
    expect(variants).toBe(108);
    expect(instances).toBe(10452); // Main-part capacity excludes the two additional shore-role buffers.
    expect(terrainCap(KIT_MODEL_NAMES[M_AIRPLANE_ROUNDED_GOLD])).toBe(0);
    expect(terrainCap('cloud_round_large')).toBe(0);
    expect(terrainCap('bomb_stylized')).toBe(0);
    expect(terrainCap('ground_meadow_summer')).toBe(RING_SECTOR_CELLS);
    expect(isGroundTile('water_open_blue')).toBe(true);
    expect(isGroundTile('conifer_broad_summer')).toBe(false);
  });
});

describe('terrain ring', () => {
  const ring = new TerrainRing(new Scene(), new DebugGenerator());

  it('places an instanced mesh per model and sector on the sea axis and fills every cell', () => {
    expect(ring.ring.position.y).toBe(-SEA_RADIUS);
    // Ground parts share two weld geometries across all four quarter turns.
    const tileModels = KIT_MODEL_NAMES.filter(isGroundTile).length;
    expect(ring.variants).toBe(165 + tileModels + 56 + ROAD_SHAPE_COUNT);
    expect(ring.ring.children.length).toBe(RING_SECTORS * ring.variants + 3);
    expect(ring.dropped).toBe(0);
    // Each sector has 2 water rows and 9 meadow rows across 7 columns.
    expect(tileCount(ring, M_WATER_OPEN_BLUE)).toBe(14);
    expect(tileCount(ring, M_GROUND_MEADOW_SUMMER)).toBe(63);
    expect(meshOf(ring, M_GROUND_MEADOW_SUMMER, 'main').receiveShadow).toBe(true);
  });

  it('seats a tile on the tangent plane at its slot angle and row depth', () => {
    const m = tileMatrix(ring, 0, 2);
    const p = new Vector3();
    p.setFromMatrixPosition(m);
    const theta = slotAngle(0);
    expect(p.x).toBeCloseTo(SEA_RADIUS * Math.cos(theta), 4);
    expect(p.y).toBeCloseTo(SEA_RADIUS * Math.sin(theta), 4);
    expect(p.z).toBeCloseTo(RING_Z0 + 2 * RING_TILE, 4);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(SEA_RADIUS, 3);
  });

  it('orients tile up radially and advances one slot per column', () => {
    const a = tileMatrix(ring, 0, 2);
    const b = tileMatrix(ring, 1, 2);
    // Local +Y remains radial through tile yaw, so matrix elements 4 to 6 identify the radial direction.
    const up = new Vector3(a.elements[4], a.elements[5], a.elements[6]).normalize();
    expect(up.x).toBeCloseTo(Math.cos(slotAngle(0)), 4);
    expect(up.y).toBeCloseTo(Math.sin(slotAngle(0)), 4);
    expect(up.z).toBeCloseTo(0, 5);
    const p0 = new Vector3().setFromMatrixPosition(a);
    const p1 = new Vector3().setFromMatrixPosition(b);
    expect(Math.hypot(p1.x, p1.y)).toBeCloseTo(SEA_RADIUS, 3);
    expect(p1.z).toBeCloseTo(p0.z, 4);
    expect(Math.atan2(p0.y, p0.x) - Math.atan2(p1.y, p1.x)).toBeCloseTo(SLOT_STEP, 6);
    expect(p0.distanceTo(p1)).toBeCloseTo(2 * SEA_RADIUS * Math.sin(SLOT_STEP / 2), 3);
  });

  it('streams a whole lap without dropping an instance or losing a sector', () => {
    const dt = 16.7;
    const dPhi = 0.00136 * dt; // Level 100 with rightward input.
    const frames = Math.ceil((Math.PI * 2) / dPhi);
    for (let f = 0; f < frames; f++) {
      ring.update(dPhi, dt, 0);
      expect(ring.visibleSectors).toBeGreaterThanOrEqual(4);
      expect(ring.visibleSectors).toBeLessThanOrEqual(5);
    }
    expect(ring.dropped).toBe(0);
    expect(tileCount(ring, M_GROUND_MEADOW_SUMMER)).toBe(63);
    expect(tileCount(ring, M_WATER_OPEN_BLUE)).toBe(14);
  });

  it('changes epoch without rewriting visible terrain', () => {
    const before = ring.visibleSectors;
    ring.startEpoch(0x1234abcd);
    expect(ring.visibleSectors).toBe(before);
    for (let f = 0; f < RING_COLUMNS * RING_ROWS; f++) ring.update(0.0001, 16.7, 0);
    expect(ring.dropped).toBe(0);
  });
});

class CampfireGenerator implements WorldGenerator {
  startEpoch(_seed: number): void {}

  transitionEpoch(_seed: number, _column: number): void {}

  prepare(_column: number): boolean { return false; }

  cell(c: number, j: number, out: CellPlacements): void {
    out.clear();
    out.add(M_GROUND_MEADOW_SUMMER, 0, 0, 0, 0, 1);
    if (j === 5 && c % 4 === 0) out.add(M_CAMPFIRE_SOURCE, 0, 0.24 * KIT_UNITS_PER_METRE, 0, 0, 1);
  }

  season(_c: number): number {
    return SEASON_SUMMER;
  }
}

describe('campfires at night', () => {
  const ring = new TerrainRing(new Scene(), new CampfireGenerator());

  it('gives every campfire its unlit flame at the flame part pivot', () => {
    const fire = meshOf(ring, M_CAMPFIRE_SOURCE, 'main');
    const flame = meshOf(ring, M_CAMPFIRE_SOURCE, 'Flame');
    expect(ring.dropped).toBe(0);
    expect(flame.count).toBe(fire.count);
    expect(fire.count).toBeGreaterThan(0);
    expect(flame.instanceMatrix.count).toBe(CAP_CAMP);
    expect(flame.receiveShadow).toBe(false);
    expect(flame.castShadow).toBe(false);
    const a = new Matrix4();
    const b = new Matrix4();
    fire.getMatrixAt(0, a);
    flame.getMatrixAt(0, b);
    const pivot = sharedKit().modelById(M_CAMPFIRE_SOURCE).parts[1].pivot;
    const expected = new Vector3(pivot[0], pivot[1], pivot[2]).multiplyScalar(KIT_UNITS_PER_METRE).applyMatrix4(a);
    const actual = new Vector3().setFromMatrixPosition(b);
    expect(actual.distanceTo(expected)).toBeCloseTo(0, 3);
  });

  it('lights the nearest campfires only after dark', () => {
    ring.update(0, 16.7, 0);
    for (const light of ring.campfireLights) expect(light.intensity).toBe(0);

    ring.update(0, 16.7, 1);
    let lit = 0;
    for (const light of ring.campfireLights) if (light.intensity > 0) lit += 1;
    expect(lit).toBe(ring.campfireLights.length);
    for (const light of ring.campfireLights) {
      if (light.intensity === 0) continue;
      expect(Math.hypot(light.position.x, light.position.y)).toBeGreaterThan(SEA_RADIUS);
    }

    const full = ring.campfireLights[0].intensity;
    ring.update(0, 16.7, 0.5);
    expect(ring.campfireLights[0].intensity).toBeCloseTo(full / 2, 5);
    ring.update(0, 16.7, 0);
    for (const light of ring.campfireLights) expect(light.intensity).toBe(0);
  });
});

describe('campfire light assignment', () => {
  const shown = new Uint8Array(RING_SECTORS);
  const campfires = new Int32Array(RING_SECTORS);
  const positions = new Float32Array(RING_SECTORS * CAP_CAMP * 3);
  const out = new Int32Array(3);
  const score = new Float32Array(3);

  function place(sector: number, k: number, degrees: number): void {
    const a = (degrees * Math.PI) / 180;
    const at = (sector * CAP_CAMP + k) * 3;
    positions[at] = SEA_RADIUS * Math.cos(a);
    positions[at + 1] = SEA_RADIUS * Math.sin(a);
    positions[at + 2] = 0;
    campfires[sector] = k + 1;
  }

  it('takes the campfires closest to the top of the ring, visible sectors only', () => {
    shown.fill(1);
    place(0, 0, 90);
    place(0, 1, 150);
    place(2, 0, 80);
    place(3, 0, 20);
    shown[1] = 1;
    place(1, 0, 95); // This campfire is nearby, but its sector is hidden.
    shown[1] = 0;

    expect(pickCampfires(campfires, positions, shown, CAP_CAMP, 0, out, score)).toBe(3);
    expect(Array.from(out)).toEqual([0, 2 * CAP_CAMP, 1]);
    expect(score[0]).toBeLessThan(score[1]);
    expect(score[1]).toBeLessThan(score[2]);

    // A 60-degree rotation moves the campfire at 20 degrees to 80 degrees.
    expect(pickCampfires(campfires, positions, shown, CAP_CAMP, Math.PI / 3, out, score)).toBe(3);
    expect(out[0]).toBe(3 * CAP_CAMP);
  });

  it('reports the number of campfires found in visible sectors', () => {
    shown.fill(0);
    campfires.fill(0);
    shown[0] = 1;
    place(0, 0, 90);
    expect(pickCampfires(campfires, positions, shown, CAP_CAMP, 0, out, score)).toBe(1);
    expect(out[0]).toBe(0);
    shown.fill(0);
    expect(pickCampfires(campfires, positions, shown, CAP_CAMP, 0, out, score)).toBe(0);
  });
});

class TintGenerator implements WorldGenerator {
  startEpoch(_seed: number): void {}

  transitionEpoch(_seed: number, _column: number): void {}

  prepare(_column: number): boolean { return false; }

  cell(c: number, j: number, out: CellPlacements): void {
    out.clear();
    out.add(M_GROUND_MEADOW_SUMMER, 0, 0, 0, 0, 1);
    if (c % 2 === 1) out.tintLast(2, 1, 0.5);
    if (j === 5 && c % 4 === 0) out.add(M_CAMPFIRE_SOURCE, 0, 0.24 * KIT_UNITS_PER_METRE, 0, 0, 1);
  }

  season(_c: number): number {
    return SEASON_SUMMER;
  }
}

describe('per-instance tint', () => {
  const ring = new TerrainRing(new Scene(), new TintGenerator());

  it('allocates matching instanceColor and instanceMatrix capacities for every mesh', () => {
    for (const child of ring.ring.children) {
      const mesh = child as InstancedMesh;
      if (mesh.isInstancedMesh !== true) continue;
      expect(mesh.instanceColor).not.toBeNull();
      expect(mesh.instanceColor?.itemSize).toBe(3);
      expect(mesh.instanceColor?.count).toBe(mesh.instanceMatrix.count);
    }
  });

  it('copies the placement tint into the instance slot and leaves the rest at 1', () => {
    const meadow = meshOf(ring, M_GROUND_MEADOW_SUMMER, 'main');
    const gain = meadow.instanceColor!.array;
    // Instance 11 starts column 1 after 11 rows. Its colour channels start at offset 33.
    expect(Array.from(gain.slice(0, 3))).toEqual([1, 1, 1]);
    expect(Array.from(gain.slice(33, 36))).toEqual([2, 1, 0.5]);
    expect(ring.dropped).toBe(0);
    const fire = meshOf(ring, M_CAMPFIRE_SOURCE, 'main');
    const spare = fire.count * 3;
    expect(spare).toBeLessThan(fire.instanceColor!.array.length);
    expect(Array.from(fire.instanceColor!.array.slice(spare, spare + 3))).toEqual([1, 1, 1]);
  });

  it('marks only the written colours dirty, alongside the matrices', () => {
    const meadow = meshOf(ring, M_GROUND_MEADOW_SUMMER, 'main');
    const ranges = meadow.instanceColor!.updateRanges;
    expect(ranges.length).toBe(1);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].count).toBe(meadow.count * 3);
    expect(meadow.instanceColor!.usage).toBe(meadow.instanceMatrix.usage);
  });

  it('keeps the campfire flame neutral whatever its campfire does', () => {
    const flame = meshOf(ring, M_CAMPFIRE_SOURCE, 'Flame');
    const gain = flame.instanceColor!.array;
    expect(flame.count).toBeGreaterThan(0);
    for (let i = 0; i < gain.length; i++) expect(gain[i]).toBe(1);
  });
});

class ShoreTintGenerator implements WorldGenerator {
  startEpoch(_seed: number): void {}

  transitionEpoch(_seed: number, _column: number): void {}
  season(_c: number): number { return 3; }
  prepare(_column: number): boolean { return false; }

  cell(_c: number, _j: number, out: CellPlacements): void {
    out.clear();
    out.add(M_SHORE_CORNER_INNER__WINTER, 0, 0, 0, Math.PI / 2, 1);
    out.tintLast(0.5, 0.75, 1);
    out.waterTint[0] = 1.25;
    out.waterTint[1] = 1.5;
    out.waterTint[2] = 2;
  }
}

it('uploads independent shore land/water gains and keeps the beach neutral', () => {
  const ring = new TerrainRing(new Scene(), new ShoreTintGenerator());
  const main = meshOf(ring, M_SHORE_CORNER_INNER__WINTER, 'main', true);
  const water = meshOf(ring, M_SHORE_CORNER_INNER__WINTER, 'Water', true);
  const sand = meshOf(ring, M_SHORE_CORNER_INNER__WINTER, 'Sand', true);
  expect(ring.dropped).toBe(0);
  for (const mesh of [main, water, sand]) {
    expect(mesh.count).toBe(RING_SECTOR_CELLS);
    expect(mesh.instanceMatrix.array).toEqual(main.instanceMatrix.array);
    expect(mesh.instanceColor!.updateRanges[0].count).toBe(RING_SECTOR_CELLS * 3);
  }
  expect(Array.from(main.instanceColor!.array.slice(0, 3))).toEqual([0.5, 0.75, 1]);
  expect(Array.from(water.instanceColor!.array.slice(0, 3))).toEqual([1.25, 1.5, 2]);
  expect(Array.from(sand.instanceColor!.array.slice(0, 3))).toEqual([1, 1, 1]);
});

it('joins raised grass, water, asphalt and sloped beaches at every tile rotation', () => {
  const kit = sharedKit();
  const ring = new TerrainRing(new Scene(), new DebugGenerator());
  const yaw = new Matrix4();
  const neighbour = new Matrix4().makeRotationZ(-SLOT_STEP);
  const point = new Vector3();
  const other = new Vector3();
  let checked = 0;
  let worstGap = 0;
  let worstRowShift = 0;
  for (let id = 0; id < KIT_MODEL_NAMES.length; id++) {
    const name = KIT_MODEL_NAMES[id];
    if (!isGroundTile(name)) continue;
    const rootY = name.startsWith('road_') ? 0.24 * KIT_UNITS_PER_METRE : 0;
    for (const part of kit.modelById(id).parts) {
      const source = kit.geometryById(id, part.name).getAttribute('position');
      for (let quarter = 0; quarter < 4; quarter++) {
        const mesh = meshOf(ring, id, part.name, (quarter & 1) !== 0);
        const welded = mesh.geometry.getAttribute('position');
        yaw.makeRotationY(quarter * Math.PI / 2);
        expect((ring.ring.children[ring.variants + ring.ring.children.indexOf(mesh)] as InstancedMesh).geometry).toBe(mesh.geometry);
        for (let i = 0; i < source.count; i++) {
          point.fromBufferAttribute(source, i).applyMatrix4(yaw);
          const rowZ = point.z;
          const columnEdge = Math.abs(Math.abs(point.x) - RING_TILE / 2) < 0.001;
          const positive = point.x > 0;
          point.fromBufferAttribute(welded, i).applyMatrix4(yaw);
          worstRowShift = Math.max(worstRowShift, Math.abs(point.z - rowZ));
          if (!columnEdge) continue;
          // Reflect the opposite edge into the neighbouring tangent plane to compare the vertices.
          point.y += SEA_RADIUS + rootY;
          if (!positive) point.x = -point.x;
          other.set(-point.x, point.y, point.z).applyMatrix4(neighbour);
          worstGap = Math.max(worstGap, point.distanceTo(other));
          checked += 1;
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(1000);
  expect(worstGap).toBeLessThan(0.00003); // Geometry uses float32 coordinates.
  expect(worstRowShift).toBeLessThan(0.000001);
});

it('keeps the source kit geometry untouched when preparing ring joins', () => {
  const source = sharedKit().geometryById(M_SHORE_CORNER_INNER__WINTER, 'Sand');
  const before = Array.from(source.getAttribute('position').array);
  const welded = weldTileGeometry(source, true, 0);
  expect(welded).not.toBe(source);
  expect(Array.from(source.getAttribute('position').array)).toEqual(before);
  expect(Array.from(welded.getAttribute('position').array)).not.toEqual(before);
});
