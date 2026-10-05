// Each batch uses one model part, weld axis, and sector.
// Hidden sectors accumulate placements before completeSector publishes their counts and update ranges.
// The renderer uploads changed buffers when it next draws the sector.
import { DoubleSide, DynamicDrawUsage } from 'three/src/constants.js';
import type { BufferAttribute } from 'three/src/core/BufferAttribute.js';
import type { BufferGeometry } from 'three/src/core/BufferGeometry.js';
import type { InterleavedBufferAttribute } from 'three/src/core/InterleavedBufferAttribute.js';
import { InstancedBufferAttribute } from 'three/src/core/InstancedBufferAttribute.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { PointLight } from 'three/src/lights/PointLight.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import type { Scene } from 'three/src/scenes/Scene.js';
import {
  KIT_UNITS_PER_METRE,
  RING_COLUMNS,
  RING_ROWS,
  RING_SECTOR_COLS,
  RING_SECTORS,
  RING_TILE,
  RING_Z0,
  SEA_RADIUS,
  SPLASH_SEED,
} from '../config';
import { KIT_MODEL_COUNT, KIT_MODEL_NAMES, M_BRIDGE_APPROACH, M_BRIDGE_SUSPENSION, M_CAMPFIRE_SOURCE, M_ROAD_STRAIGHT } from '../kit/generated/kit-ids';
import { sharedKit } from '../kit/kit';
import { CellPlacements, type WorldGenerator } from '../worldgen/placements';
import { ROAD_SHAPE_COUNT, roadSweepOffset } from '../worldgen/plan';
import { GROUND_TOP_U } from '../worldgen/tables';
import { RingScheduler, SLOT_STEP, sectorOfSlot, sectorVisible, slotAngle, wrapPi } from '../worldgen/scheduler';

const HALF_PI = Math.PI / 2;

// Each sector contains 77 cells. Full instance buffers drop and count placements instead of growing during a frame.
const CAP_TILE = 77;
const CAP_TREE = 160;
const CAP_SCATTER = 240;
const CAP_ROAD = 40;
const CAP_LANDFORM = 24;
const CAP_RIDGE = 14;
const CAP_CAMP = 6;
const CAP_LANDMARK = 2;

// Create the fixed campfire light pool at startup so terrain programs include its light slots before gameplay.
const CAMPFIRE_LIGHTS = 3;
const CAMPFIRE_LIGHT_COLOUR = 0xffa040;
const CAMPFIRE_LIGHT_DISTANCE = 90; // The maximum light distance uses game units.
const CAMPFIRE_LIGHT_DECAY = 2; // The decay exponent gives inverse-square falloff.
const CAMPFIRE_LIGHT_INTENSITY = 900; // The full-night intensity uses candela and scales with Daylight.night.
const CAMPFIRE_LIGHT_RISE = 1.5; // The radial rise above the flame pivot uses game units.

function hasPrefix(name: string, prefix: string): boolean {
  return name.indexOf(prefix) === 0;
}

/**
 * Write visible campfire indices to out, nearest to the ring top first.
 * Each index is sector * capPerSector + instance. score is caller-owned scratch with the same length as out.
 * Return the number selected, up to out.length.
 */
export function pickCampfires(
  campfires: Int32Array,
  positions: Float32Array,
  shown: Uint8Array,
  capPerSector: number,
  phi: number,
  out: Int32Array,
  score: Float32Array,
): number {
  const want = out.length;
  let found = 0;
  for (let s = 0; s < campfires.length; s++) {
    if (shown[s] === 0) continue;
    for (let k = 0; k < campfires[s]; k++) {
      const at = s * capPerSector + k;
      const d = Math.abs(wrapPi(Math.atan2(positions[at * 3 + 1], positions[at * 3]) + phi - HALF_PI));
      let i = found < want ? found : want - 1;
      if (i === want - 1 && found === want && d >= score[i]) continue;
      while (i > 0 && score[i - 1] > d) {
        score[i] = score[i - 1];
        out[i] = out[i - 1];
        i -= 1;
      }
      score[i] = d;
      out[i] = at;
      if (found < want) found += 1;
    }
  }
  return found;
}

export function isGroundTile(name: string): boolean {
  return (
    hasPrefix(name, 'ground_meadow') ||
    hasPrefix(name, 'water_') ||
    hasPrefix(name, 'shore_') ||
    hasPrefix(name, 'road_')
  );
}

/** Return the model's instance capacity per sector, or 0 when terrain does not place the model. */
export function terrainCap(name: string): number {
  if (isGroundTile(name)) return hasPrefix(name, 'road_') ? CAP_ROAD : CAP_TILE;
  if (hasPrefix(name, 'signpost_')) return CAP_ROAD;
  if (hasPrefix(name, 'conifer_') || hasPrefix(name, 'deciduous_') || hasPrefix(name, 'cactus_')) return CAP_TREE;
  if (
    hasPrefix(name, 'grass_') ||
    hasPrefix(name, 'shrub_') ||
    hasPrefix(name, 'ground_jagged') ||
    name === 'rock_cluster' ||
    name === 'ice_patch' ||
    name === 'snow_drift'
  ) {
    return CAP_SCATTER;
  }
  if (hasPrefix(name, 'distant_rolling_ridge')) return CAP_RIDGE;
  if (
    hasPrefix(name, 'hill_') ||
    hasPrefix(name, 'mountain_') ||
    hasPrefix(name, 'coastal_bluff') ||
    name === 'desert_mesa' ||
    name === 'canyon_pillar'
  ) {
    return CAP_LANDFORM;
  }
  if (hasPrefix(name, 'tent_') || name === 'camp_flag' || name === 'campfire_source' || name === 'firewood_stack' || name === 'log_seat') {
    return CAP_CAMP;
  }
  if (name === 'bridge_approach') return CAP_ROAD;
  if (name === 'bridge_suspension' || name === 'hot_air_balloon') return CAP_LANDMARK;
  return 0;
}

function positionsOf(geometry: BufferGeometry): BufferAttribute | InterleavedBufferAttribute {
  const positions = geometry.getAttribute('position');
  if (!positions) throw new Error('terrain geometry has no position attribute');
  return positions;
}

/**
 * A point at height h needs tangent half-width (R + h) * tan(step/2).
 * Stretch only the axis around the ring. Stretching depth would overlap row joins.
 * Centred tiles at unit scale use two cached geometries for four quarter turns.
 */
export function weldTileGeometry(source: BufferGeometry, crosswise: boolean, rootY: number): BufferGeometry {
  const geometry = source.clone();
  const positions = positionsOf(geometry);
  const widthFactor = 2 * Math.tan(SLOT_STEP / 2) / RING_TILE;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const gain = (SEA_RADIUS + rootY + y) * widthFactor;
    positions.setXYZ(i, crosswise ? x : x * gain, y, crosswise ? z * gain : z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function roadSweepGeometry(source: BufferGeometry, shape: number): BufferGeometry {
  const strip = source.clone();
  strip.rotateY(HALF_PI); // The authored road runs along Z. The sweep runs along columns.
  const positions = positionsOf(strip);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const offset = roadSweepOffset(shape, x / RING_TILE + 0.5) * RING_TILE;
    positions.setXYZ(i, x, positions.getY(i), positions.getZ(i) + offset);
  }
  const geometry = weldTileGeometry(strip, false, GROUND_TOP_U);
  strip.dispose();
  return geometry;
}

/** Map a strip point to its tile's tangent plane. x and y use game units. Only out.x and out.y change. */
export function bendStripPoint(x: number, y: number, out: Vector3): void {
  const column = Math.floor((x + RING_TILE / 2) / RING_TILE);
  const local = x - column * RING_TILE;
  const angle = column * SLOT_STEP;
  out.x = Math.cos(angle) * local + Math.sin(angle) * (SEA_RADIUS + y);
  out.y = -Math.sin(angle) * local + Math.cos(angle) * (SEA_RADIUS + y) - SEA_RADIUS;
}

/** Bend both bridge parts onto the ring so their sockets meet. */
function bendBridgeGeometry(source: BufferGeometry, approach: boolean): BufferGeometry {
  const geometry = source.clone();
  const positions = positionsOf(geometry);
  const scale = approach ? 2.5 : 2;
  const rootX = approach ? 2.5 * KIT_UNITS_PER_METRE : 0;
  const rootY = (0.24 + (approach ? 0.025 : 1.525)) * KIT_UNITS_PER_METRE;
  const point = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    bendStripPoint(rootX + positions.getX(i) * scale, rootY + positions.getY(i) * scale, point);
    positions.setXYZ(i, (point.x - rootX) / scale, (point.y - rootY) / scale, positions.getZ(i));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** @gea-refcount */
export class TerrainRing {
  readonly ring = new Object3D();
  /** Count placements dropped because a sector buffer is full or the model is outside the terrain set. */
  dropped = 0;
  visibleSectors = 0;
  readonly variants: number;
  /** Lights follow the selected campfires in order of proximity to the ring top. */
  readonly campfireLights: PointLight[] = [];

  private readonly generator: WorldGenerator;
  private readonly sched = new RingScheduler();
  private readonly placements = new CellPlacements();
  private readonly meshes: InstancedMesh[] = [];
  private readonly tints: InstancedBufferAttribute[] = [];
  private readonly counts: Int32Array;
  private readonly caps = new Int32Array(KIT_MODEL_COUNT * 6 + ROAD_SHAPE_COUNT + 1);
  /** Each model ID selects a variant index. A value of -1 excludes the model from terrain. */
  private readonly variantOf = new Int32Array(KIT_MODEL_COUNT);
  private readonly waterVariantOf = new Int32Array(KIT_MODEL_COUNT);
  private readonly sandVariantOf = new Int32Array(KIT_MODEL_COUNT);
  private readonly roadVariantOf = new Int32Array(ROAD_SHAPE_COUNT + 1);
  /** Odd quarter turns use a copy of the same part welded along local Z. */
  private readonly crossVariantOf = new Int32Array(KIT_MODEL_COUNT * 6 + ROAD_SHAPE_COUNT + 1);
  private readonly shown = new Uint8Array(RING_SECTORS);
  private readonly campfireVariant: number;
  private readonly flameVariant: number;
  /** Campfire light positions use ring-local game units, grouped by sector with CAP_CAMP entries per sector. */
  private readonly campfirePos = new Float32Array(RING_SECTORS * CAP_CAMP * 3);
  private readonly campfireCount = new Int32Array(RING_SECTORS);
  private readonly lit = new Int32Array(CAMPFIRE_LIGHTS);
  private readonly litScore = new Float32Array(CAMPFIRE_LIGHTS);
  private readonly cellRotation = new Matrix4();
  private readonly instance = new Matrix4();
  private readonly flame = new Matrix4();
  private readonly flamePivot = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly rotation = new Quaternion();
  private epochSeed = SPLASH_SEED;
  private blendEpoch = false;

  constructor(scene: Scene, generator: WorldGenerator) {
    this.generator = generator;
    const kit = sharedKit();
    const material = new MeshPhongMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    // Unlit flame shells retain their baked brightness at night.
    const flameMaterial = new MeshBasicMaterial({ vertexColors: true, fog: true, side: DoubleSide });
    const ids = new Int32Array(KIT_MODEL_COUNT * 6 + ROAD_SHAPE_COUNT + 1);
    const partNames: string[] = [];
    const crosswise = new Uint8Array(KIT_MODEL_COUNT * 6 + ROAD_SHAPE_COUNT + 1);
    const shapeOfVariant = new Uint8Array(KIT_MODEL_COUNT * 6 + ROAD_SHAPE_COUNT + 1);
    this.crossVariantOf.fill(-1);
    this.waterVariantOf.fill(-1);
    this.sandVariantOf.fill(-1);
    let variants = 0;
    for (let id = 0; id < KIT_MODEL_COUNT; id++) {
      const cap = terrainCap(KIT_MODEL_NAMES[id]);
      if (cap === 0) {
        this.variantOf[id] = -1;
        continue;
      }
      this.variantOf[id] = variants;
      this.caps[variants] = cap;
      ids[variants] = id;
      partNames.push('main');
      variants += 1;
    }
    for (let id = 0; id < KIT_MODEL_COUNT; id++) {
      if (!hasPrefix(KIT_MODEL_NAMES[id], 'shore_')) continue;
      this.waterVariantOf[id] = variants;
      this.caps[variants] = CAP_TILE;
      ids[variants] = id;
      partNames.push('Water');
      variants += 1;
      this.sandVariantOf[id] = variants;
      this.caps[variants] = CAP_TILE;
      ids[variants] = id;
      partNames.push('Sand');
      variants += 1;
    }
    this.campfireVariant = this.variantOf[M_CAMPFIRE_SOURCE];
    this.flameVariant = variants;
    this.caps[variants] = CAP_CAMP;
    ids[variants] = M_CAMPFIRE_SOURCE;
    partNames.push('Flame');
    variants += 1;
    const originalVariants = variants;
    for (let v = 0; v < originalVariants; v++) {
      if (!isGroundTile(KIT_MODEL_NAMES[ids[v]])) continue;
      this.crossVariantOf[v] = variants;
      this.caps[variants] = this.caps[v];
      ids[variants] = ids[v];
      partNames.push(partNames[v]);
      crosswise[variants] = 1;
      variants += 1;
    }
    for (let shape = 1; shape <= ROAD_SHAPE_COUNT; shape++) {
      this.roadVariantOf[shape] = variants;
      shapeOfVariant[variants] = shape;
      this.caps[variants] = RING_SECTOR_COLS;
      ids[variants] = M_ROAD_STRAIGHT;
      partNames.push('main');
      variants += 1;
    }
    this.variants = variants;
    this.counts = new Int32Array(RING_SECTORS * variants);
    const bridgeGeometry = bendBridgeGeometry(kit.geometryById(M_BRIDGE_SUSPENSION, 'main'), false);
    const approachGeometry = bendBridgeGeometry(kit.geometryById(M_BRIDGE_APPROACH, 'main'), true);
    const geometries: BufferGeometry[] = [];
    for (let v = 0; v < variants; v++) {
      const id = ids[v];
      const name = KIT_MODEL_NAMES[id];
      const source = kit.geometryById(id, partNames[v]);
      let geometry = source;
      if (shapeOfVariant[v] > 0) {
        geometry = roadSweepGeometry(source, shapeOfVariant[v]);
      } else if (isGroundTile(name)) {
        geometry = weldTileGeometry(source, crosswise[v] === 1, hasPrefix(name, 'road_') ? GROUND_TOP_U : 0);
      } else if (id === M_BRIDGE_SUSPENSION) {
        geometry = bridgeGeometry;
      } else if (id === M_BRIDGE_APPROACH) {
        geometry = approachGeometry;
      }
      geometries.push(geometry);
    }
    for (let s = 0; s < RING_SECTORS; s++) {
      for (let v = 0; v < variants; v++) {
        const flame = v === this.flameVariant;
        const name = KIT_MODEL_NAMES[ids[v]];
        const geometry = geometries[v];
        const mesh = new InstancedMesh(geometry, flame ? flameMaterial : material, this.caps[v]);
        mesh.name = name + '/' + partNames[v] + (shapeOfVariant[v] > 0 ? '/sweep' + shapeOfVariant[v] : crosswise[v] === 1 ? '/z' : '/x');
        // Sector visibility replaces bounding-sphere culling for these instance batches.
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = !flame && isGroundTile(name);
        mesh.count = 0;
        mesh.visible = false;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        // Every batch needs instanceColor so the shared material uses one shader variant, including batches with no tint.
        const gain = new Float32Array(this.caps[v] * 3);
        for (let i = 0; i < gain.length; i++) gain[i] = 1;
        const tint = new InstancedBufferAttribute(gain, 3, false, 1);
        tint.setUsage(DynamicDrawUsage);
        mesh.instanceColor = tint;
        this.tints.push(tint);
        this.meshes.push(mesh);
        this.ring.add(mesh);
      }
    }
    // Flame geometry uses its own pivot. Compose that pivot with the campfire transform.
    const parts = kit.modelById(M_CAMPFIRE_SOURCE).parts;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].name !== 'Flame') continue;
      const pivot = parts[i].pivot;
      this.flamePivot.makeTranslation(
        pivot[0] * KIT_UNITS_PER_METRE,
        pivot[1] * KIT_UNITS_PER_METRE,
        pivot[2] * KIT_UNITS_PER_METRE,
      );
    }
    for (let i = 0; i < CAMPFIRE_LIGHTS; i++) {
      const light = new PointLight(CAMPFIRE_LIGHT_COLOUR, 0, CAMPFIRE_LIGHT_DISTANCE, CAMPFIRE_LIGHT_DECAY);
      // Keep all lights in the scene. Adding or removing lights changes the shared terrain program.
      this.campfireLights.push(light);
      this.ring.add(light);
    }
    this.ring.position.y = -SEA_RADIUS;
    scene.add(this.ring);
    generator.startEpoch(SPLASH_SEED);
    this.fillAll();
    this.updateVisibility();
  }

  /**
   * dPhi uses radians. dt uses milliseconds. night is Daylight.night.
   * Call update once per frame in every game state.
   */
  update(dPhi: number, dt: number, night: number): void {
    this.ring.rotateZ(dPhi);
    this.sched.beginFrame(dPhi, dt);
    this.updateVisibility();
    if (this.generator.prepare(this.sched.column)) this.sched.spendPlanning();
    while (this.sched.hasCell()) {
      this.writeCell();
      this.sched.advance();
    }
    this.updateCampfireLights(night);
  }

  private updateCampfireLights(night: number): void {
    const found = night > 0 ? pickCampfires(this.campfireCount, this.campfirePos, this.shown, CAP_CAMP, this.sched.phi, this.lit, this.litScore) : 0;
    const intensity = night * CAMPFIRE_LIGHT_INTENSITY;
    for (let i = 0; i < CAMPFIRE_LIGHTS; i++) {
      const light = this.campfireLights[i];
      if (i >= found) {
        light.intensity = 0;
        continue;
      }
      const at = this.lit[i] * 3;
      const x = this.campfirePos[at];
      const y = this.campfirePos[at + 1];
      light.position.set(x, y, this.campfirePos[at + 2]);
      light.intensity = intensity;
    }
  }

  /** Request an isolated seed reset at the next column boundary. transitionEpoch preserves the existing content strip. */
  startEpoch(seed: number): void {
    this.epochSeed = seed;
    this.blendEpoch = false;
    this.sched.requestEpoch();
  }

  transitionEpoch(seed: number): void {
    this.epochSeed = seed;
    this.blendEpoch = true;
    this.sched.requestEpoch();
  }

  /** Return the next content column. An isolated reset restarts column indices at 0. */
  get frontierColumn(): number {
    return this.sched.column;
  }

  private fillAll(): void {
    const total = RING_COLUMNS * RING_ROWS;
    for (let k = 0; k < total; k++) {
      this.writeCell();
      this.sched.advance();
    }
    // Complete the initial fill and prepare the next region before streaming starts.
    while (this.generator.prepare(this.sched.column)) {  }
  }

  private updateVisibility(): void {
    let shownCount = 0;
    for (let s = 0; s < RING_SECTORS; s++) {
      const inWindow = sectorVisible(s, this.sched.phi);
      if (inWindow) shownCount += 1;
      const visible = inWindow;
      if (visible === (this.shown[s] === 1)) continue;
      this.shown[s] = visible ? 1 : 0;
      const base = s * this.variants;
      for (let v = 0; v < this.variants; v++) {
        this.meshes[base + v].visible = visible && this.counts[base + v] > 0;
      }
    }
    this.visibleSectors = shownCount;
  }

  // M = Rz(slotAngle - PI/2) * T(0, R, rowZ) * T(x, y, z) * Ry(yaw) * S(scale).
  // The parent ring supplies Rz(phi).
  private writeCell(): void {
    const sched = this.sched;
    const slot = sched.slot;
    const row = sched.row;
    const sector = sectorOfSlot(slot);
    const colInSector = slot % RING_SECTOR_COLS;
    if (row === 0) {
      if (sched.epochPending) {
        if (this.blendEpoch) {
          this.generator.transitionEpoch(this.epochSeed, sched.column);
          sched.epochPending = false;
        } else {
          this.generator.startEpoch(this.epochSeed);
          sched.openEpoch();
        }
      }
      if (colInSector === 0) this.clearSector(sector);
    }
    this.generator.cell(sched.column, row, this.placements);
    this.cellRotation.makeRotationZ(slotAngle(slot) - HALF_PI);
    const rowZ = RING_Z0 + row * RING_TILE;
    const props = this.placements;
    for (let k = 0; k < props.count; k++) {
      let variant = this.variantOf[props.modelId[k]];
      const crosswise = (Math.round(props.yaw[k] / HALF_PI) & 1) !== 0;
      if (props.roadShape[k] > 0) variant = this.roadVariantOf[props.roadShape[k]];
      else if (variant >= 0 && crosswise && this.crossVariantOf[variant] >= 0) variant = this.crossVariantOf[variant];
      if (variant < 0) {
        this.dropped += 1;
        continue;
      }
      const at = sector * this.variants + variant;
      const n = this.counts[at];
      if (n >= this.caps[variant]) {
        this.dropped += 1;
        continue;
      }
      const s = props.scale[k];
      this.position.set(props.x[k], SEA_RADIUS + props.y[k], rowZ + props.z[k]);
      this.rotation.setFromAxisAngle(this.axisY, props.yaw[k]);
      this.scale.set(s, s, s);
      this.instance.compose(this.position, this.rotation, this.scale);
      this.instance.premultiply(this.cellRotation);
      this.meshes[at].setMatrixAt(n, this.instance);
      const gain = this.tints[at].array;
      gain[n * 3] = props.tint[k * 3];
      gain[n * 3 + 1] = props.tint[k * 3 + 1];
      gain[n * 3 + 2] = props.tint[k * 3 + 2];
      this.counts[at] = n + 1;
      const water = this.waterVariantOf[props.modelId[k]];
      if (water >= 0) {
        this.writeShorePart(sector, crosswise ? this.crossVariantOf[water] : water, n, props.waterTint[k * 3], props.waterTint[k * 3 + 1], props.waterTint[k * 3 + 2]);
        const sand = this.sandVariantOf[props.modelId[k]];
        this.writeShorePart(sector, crosswise ? this.crossVariantOf[sand] : sand, n, 1, 1, 1);
      }
      if (variant === this.campfireVariant) this.writeFlame(sector, n);
    }
    if (row === RING_ROWS - 1 && colInSector === RING_SECTOR_COLS - 1) this.completeSector(sector);
  }

  /** Shore parts share the main tile's identity pivot, capacity, and placement matrix. */
  private writeShorePart(sector: number, variant: number, n: number, r: number, g: number, b: number): void {
    const at = sector * this.variants + variant;
    this.meshes[at].setMatrixAt(n, this.instance);
    const gain = this.tints[at].array;
    gain[n * 3] = r;
    gain[n * 3 + 1] = g;
    gain[n * 3 + 2] = b;
    this.counts[at] = n + 1;
  }

  // Flames keep a colour gain of 1 because biome tint does not apply to their emission.
  private writeFlame(sector: number, instance: number): void {
    const at = sector * this.variants + this.flameVariant;
    this.flame.multiplyMatrices(this.instance, this.flamePivot);
    this.meshes[at].setMatrixAt(instance, this.flame);
    this.counts[at] = instance + 1;
    // The light rises radially above the flame in the ring-local XY plane.
    const e = this.flame.elements;
    const radius = Math.sqrt(e[12] * e[12] + e[13] * e[13]);
    const rise = radius > 0 ? CAMPFIRE_LIGHT_RISE / radius : 0;
    const slot = (sector * CAP_CAMP + instance) * 3;
    this.campfirePos[slot] = e[12] * (1 + rise);
    this.campfirePos[slot + 1] = e[13] * (1 + rise);
    this.campfirePos[slot + 2] = e[14];
    this.campfireCount[sector] = instance + 1;
  }

  private clearSector(sector: number): void {
    const base = sector * this.variants;
    for (let v = 0; v < this.variants; v++) this.counts[base + v] = 0;
    this.campfireCount[sector] = 0;
  }

  private completeSector(sector: number): void {
    const base = sector * this.variants;
    const visible = this.shown[sector] === 1;
    for (let v = 0; v < this.variants; v++) {
      const mesh = this.meshes[base + v];
      const n = this.counts[base + v];
      mesh.count = n;
      mesh.visible = visible && n > 0;
      if (n === 0) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
      const tint = this.tints[base + v];
      tint.clearUpdateRanges();
      tint.addUpdateRange(0, n * 3);
      tint.needsUpdate = true;
    }
  }
}
