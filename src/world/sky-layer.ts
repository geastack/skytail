// Clouds, balloons, and stars follow the rotating terrain ring. The sun and moon follow the day phase.
import { DoubleSide } from 'three/src/constants.js';
import type { BufferGeometry } from 'three/src/core/BufferGeometry.js';
import type { Object3D } from 'three/src/core/Object3D.js';
import { TetrahedronGeometry } from 'three/src/geometries/TetrahedronGeometry.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import { Mesh } from 'three/src/objects/Mesh.js';
import type { Scene } from 'three/src/scenes/Scene.js';
import { CAMERA_Z, DEFAULT_H, KIT_UNITS_PER_METRE } from '../config';
import {
  M_CLOUD_ROUND_LARGE,
  M_CLOUD_ROUND_SMALL,
  M_HOT_AIR_BALLOON,
  M_MOON_CRESCENT,
  M_STAR_FOUR_POINT,
  M_SUN_RAYS,
} from '../kit/generated/kit-ids';
import { sharedKit } from '../kit/kit';
import { rand4 } from '../worldgen/hash';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const SALT_RING = 0x63;

/** The celestial circle radius uses game units in the plane Z = SKY_CIRCLE_Z. */
export const SKY_CIRCLE_R = 700;
/** This is the celestial circle centre height in game units. */
export const SKY_CIRCLE_Y = -200;
/** The unlit moon uses this Z coordinate in game units. */
export const SKY_CIRCLE_Z = -900;
/** This is the celestial scale at SKY_CIRCLE_Z. The nearer sun preserves its apparent size. */
export const SKY_SCALE = 6;

export interface RingBand {
  seed: number;
  count: number;
  /** This limits placement attempts when the band cannot fit more instances. */
  tries: number;
  /** The distance from the ring axis ranges from rMin to rMin + rSpan, in game units. */
  rMin: number;
  rSpan: number;
  /** The ring-local Z coordinate ranges from zMin to zMin + zSpan, in game units. */
  zMin: number;
  zSpan: number;
  /** The uniform scale multiplies the asset kit geometry in game units. */
  scaleMin: number;
  scaleSpan: number;
  /** The band alternates between modelA and modelB. */
  modelA: number;
  modelB: number;
}

/** Clouds stay outside collectible orbit radii of 620 to 780 game units and behind Z = 0. */
export const CLOUD_BAND: RingBand = {
  seed: 0x534b5901,
  count: 32,
  tries: 400,
  rMin: 800,
  rSpan: 150,
  zMin: -700,
  zSpan: 580,
  scaleMin: 3,
  scaleSpan: 1.7,
  modelA: M_CLOUD_ROUND_LARGE,
  modelB: M_CLOUD_ROUND_SMALL,
};

/** Stars at radii above 1000 game units need Z <= approximately -600 to enter the camera's 50-degree field of view. */
export const STAR_BAND: RingBand = {
  seed: 0x534b5902,
  count: 56,
  tries: 800,
  rMin: 1000,
  rSpan: 150,
  zMin: -950,
  zSpan: 350,
  scaleMin: 4,
  scaleSpan: 4,
  modelA: M_STAR_FOUR_POINT,
  modelB: M_STAR_FOUR_POINT,
};

/** Balloons stay above terrain tops, below the clouds, and behind the collectibles and hazards at Z = 0. */
export const BALLOON_BAND: RingBand = {
  seed: 0x534b5903,
  count: 6,
  tries: 200,
  rMin: 690,
  rSpan: 50,
  zMin: -560,
  zSpan: 380,
  scaleMin: 1,
  scaleSpan: 0.3,
  modelA: M_HOT_AIR_BALLOON,
  modelB: M_HOT_AIR_BALLOON,
};

export const SUN_CIRCLE_Z = BALLOON_BAND.zMin + BALLOON_BAND.zSpan / 2;
/** Scale the sun's orbit and apparent size for the resting camera position. */
export const SUN_DEPTH_SCALE = (CAMERA_Z - SUN_CIRCLE_Z) / (CAMERA_Z - SKY_CIRCLE_Z);
export const SUN_CIRCLE_Y = DEFAULT_H + (SKY_CIRCLE_Y - DEFAULT_H) * SUN_DEPTH_SCALE;

const STAR_ON = 0.45;
const STAR_FADE = 4;

const RAY_SPIN = 0.0002; // The ray rotation rate uses radians per millisecond.

/** The balloon radial motion amplitude uses game units. */
export const BOB_AMP = 6;
const BOB_PERIOD_MIN = 4000; // The balloon period uses milliseconds.
const BOB_PERIOD_SPAN = 3000;
/** The burner height above the basket base uses asset kit metres. */
const GLOW_Y = 1.2;
const GLOW_R = 0.42; // The burner radius uses asset kit metres.

/**
 * A fixed seed selects polar coordinates and depth for each band.
 * Rejection sampling separates spheres whose radii use the model half-width and instance scale.
 */
export class RingPlan {
  /** The distance from the ring axis uses game units. */
  readonly radius: Float32Array;
  /** The angle around the ring axis uses radians at rest. */
  readonly angle: Float32Array;
  /** The ring-local Z coordinate uses game units. */
  readonly z: Float32Array;
  readonly scale: Float32Array;
  /** The rotation around the instance's radial axis uses radians. */
  readonly yaw: Float32Array;
  /** Zero selects modelA. One selects modelB. */
  readonly variant: Uint8Array;
  /** The separation radius is the model half-width multiplied by instance scale, in game units. */
  readonly reach: Float32Array;
  count = 0;

  constructor(band: RingBand) {
    this.radius = new Float32Array(band.count);
    this.angle = new Float32Array(band.count);
    this.z = new Float32Array(band.count);
    this.scale = new Float32Array(band.count);
    this.yaw = new Float32Array(band.count);
    this.variant = new Uint8Array(band.count);
    this.reach = new Float32Array(band.count);
    const halfA = halfWidth(band.modelA);
    const halfB = halfWidth(band.modelB);
    let n = 0;
    for (let k = 0; k < band.tries && n < band.count; k++) {
      const isB = (n & 1) === 1;
      const angle = rand4(band.seed, k, 0, SALT_RING) * TWO_PI;
      const radius = band.rMin + rand4(band.seed, k, 1, SALT_RING) * band.rSpan;
      const z = band.zMin + rand4(band.seed, k, 2, SALT_RING) * band.zSpan;
      const scale = band.scaleMin + rand4(band.seed, k, 3, SALT_RING) * band.scaleSpan;
      const reach = (isB ? halfB : halfA) * scale;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      let clear = true;
      for (let j = 0; j < n; j++) {
        const dx = x - this.radius[j] * Math.cos(this.angle[j]);
        const dy = y - this.radius[j] * Math.sin(this.angle[j]);
        const dz = z - this.z[j];
        const gap = reach + this.reach[j];
        if (dx * dx + dy * dy + dz * dz <= gap * gap) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      this.radius[n] = radius;
      this.angle[n] = angle;
      this.z[n] = z;
      this.scale[n] = scale;
      this.yaw[n] = rand4(band.seed, k, 4, SALT_RING) * TWO_PI;
      this.variant[n] = isB ? 1 : 0;
      this.reach[n] = reach;
      n += 1;
    }
    this.count = n;
  }
}

function halfWidth(modelId: number): number {
  const model = sharedKit().modelById(modelId);
  return ((model.bboxMax[0] - model.bboxMin[0]) / 2) * KIT_UNITS_PER_METRE;
}

/** @gea-refcount */
export class SkyLayer {
  readonly sun: Mesh;
  readonly moon: Mesh;
  readonly stars: InstancedMesh;
  readonly balloons: Mesh[] = [];
  private readonly glows: Mesh[] = [];
  private readonly starMaterial: MeshBasicMaterial;
  private readonly glowMaterial: MeshBasicMaterial;
  private readonly bobBase: Float32Array;
  private readonly bobAmp: Float32Array;
  private readonly bobRate: Float32Array;
  private readonly bobPhase: Float32Array;
  private readonly bobCos: Float32Array;
  private readonly bobSin: Float32Array;
  private readonly bobZ: Float32Array;
  private clock = 0;
  private readonly instance = new Matrix4();
  private readonly ringRotation = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly axisZ = new Vector3(0, 0, 1);
  private readonly rotation = new Quaternion();
  private readonly slotRotation = new Quaternion();

  constructor(scene: Scene, ring: Object3D) {
    const kit = sharedKit();
    const ringMaterial = new MeshPhongMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    const half = (CLOUD_BAND.count + 1) >> 1;
    const large = new InstancedMesh(kit.geometryById(M_CLOUD_ROUND_LARGE, 'main'), ringMaterial, half);
    const small = new InstancedMesh(kit.geometryById(M_CLOUD_ROUND_SMALL, 'main'), ringMaterial, half);
    this.fillClouds(large, small);
    ring.add(large);
    ring.add(small);

    const skyMaterial = new MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: DoubleSide });
    this.sun = new Mesh(kit.geometryById(M_SUN_RAYS, 'main'), ringMaterial);
    this.sun.scale.setScalar(SKY_SCALE * SUN_DEPTH_SCALE);
    this.moon = new Mesh(kit.geometryById(M_MOON_CRESCENT, 'main'), skyMaterial);
    this.moon.scale.setScalar(SKY_SCALE);
    scene.add(this.sun);
    scene.add(this.moon);

    this.starMaterial = new MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      depthWrite: false,
      side: DoubleSide,
      transparent: true,
      opacity: 0,
    });
    this.stars = new InstancedMesh(kit.geometryById(M_STAR_FOUR_POINT, 'main'), this.starMaterial, STAR_BAND.count);
    this.stars.frustumCulled = false;
    this.stars.matrixAutoUpdate = false;
    this.stars.visible = false;
    this.fillStars();
    ring.add(this.stars);

    this.glowMaterial = new MeshBasicMaterial({ color: 0xffa040, fog: false, transparent: true, opacity: 0 });
    const plan = new RingPlan(BALLOON_BAND);
    this.bobBase = new Float32Array(plan.count);
    this.bobAmp = new Float32Array(plan.count);
    this.bobRate = new Float32Array(plan.count);
    this.bobPhase = new Float32Array(plan.count);
    this.bobCos = new Float32Array(plan.count);
    this.bobSin = new Float32Array(plan.count);
    this.bobZ = new Float32Array(plan.count);
    this.fillBalloons(plan, ring, kit.geometryById(M_HOT_AIR_BALLOON, 'main'), ringMaterial);
  }

  /**
   * dt uses milliseconds. night is Daylight.night.
   * The ring carries clouds and stars without individual transform updates.
   */
  update(dt: number, dayPhase: number, night: number): void {
    this.clock += dt;
    const angle = dayPhase * TWO_PI;
    const x = Math.cos(angle) * SKY_CIRCLE_R;
    const y = Math.sin(angle) * SKY_CIRCLE_R;
    this.sun.position.set(x * SUN_DEPTH_SCALE, SUN_CIRCLE_Y + y * SUN_DEPTH_SCALE, SUN_CIRCLE_Z);
    this.moon.position.set(-x, SKY_CIRCLE_Y - y, SKY_CIRCLE_Z);
    this.sun.rotation.z += dt * RAY_SPIN;

    const fade = clamp01((night - STAR_ON) * STAR_FADE);
    this.starMaterial.opacity = fade;
    this.stars.visible = fade > 0;
    this.glowMaterial.opacity = fade;

    for (let i = 0; i < this.balloons.length; i++) {
      const r = this.bobBase[i] + Math.sin(this.clock * this.bobRate[i] + this.bobPhase[i]) * this.bobAmp[i];
      this.balloons[i].position.set(r * this.bobCos[i], r * this.bobSin[i], this.bobZ[i]);
      this.glows[i].visible = fade > 0;
    }
  }

  // The slot transform points local +Y radially outward. Cloud instance buffers remain fixed after initialization.
  private fillClouds(large: InstancedMesh, small: InstancedMesh): void {
    const plan = new RingPlan(CLOUD_BAND);
    let nLarge = 0;
    let nSmall = 0;
    for (let i = 0; i < plan.count; i++) {
      this.composeSlot(plan, i);
      if (plan.variant[i] === 0) {
        large.setMatrixAt(nLarge, this.instance);
        nLarge += 1;
      } else {
        small.setMatrixAt(nSmall, this.instance);
        nSmall += 1;
      }
    }
    this.finishCloudMesh(large, nLarge);
    this.finishCloudMesh(small, nSmall);
  }

  private finishCloudMesh(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private fillStars(): void {
    const plan = new RingPlan(STAR_BAND);
    for (let i = 0; i < plan.count; i++) {
      this.composeSlot(plan, i);
      this.stars.setMatrixAt(i, this.instance);
    }
    this.stars.count = plan.count;
    this.stars.instanceMatrix.needsUpdate = true;
  }

  // Separate balloon meshes allow radial motion without uploading an instance buffer each frame.
  private fillBalloons(plan: RingPlan, ring: Object3D, geometry: BufferGeometry, material: MeshPhongMaterial): void {
    const glowGeometry = new TetrahedronGeometry(GLOW_R * KIT_UNITS_PER_METRE, 2);
    for (let i = 0; i < plan.count; i++) {
      const mesh = new Mesh(geometry, material);
      this.slotRotation.setFromAxisAngle(this.axisZ, plan.angle[i] - HALF_PI);
      this.rotation.setFromAxisAngle(this.axisY, plan.yaw[i]);
      mesh.quaternion.copy(this.slotRotation).multiply(this.rotation);
      mesh.scale.setScalar(plan.scale[i]);
      mesh.frustumCulled = false;
      this.bobBase[i] = plan.radius[i];
      this.bobAmp[i] = BOB_AMP * (0.5 + rand4(BALLOON_BAND.seed, i, 5, SALT_RING) * 0.5);
      this.bobRate[i] = TWO_PI / (BOB_PERIOD_MIN + rand4(BALLOON_BAND.seed, i, 6, SALT_RING) * BOB_PERIOD_SPAN);
      this.bobPhase[i] = rand4(BALLOON_BAND.seed, i, 7, SALT_RING) * TWO_PI;
      this.bobCos[i] = Math.cos(plan.angle[i]);
      this.bobSin[i] = Math.sin(plan.angle[i]);
      this.bobZ[i] = plan.z[i];
      mesh.position.set(plan.radius[i] * this.bobCos[i], plan.radius[i] * this.bobSin[i], plan.z[i]);

      const glow = new Mesh(glowGeometry, this.glowMaterial);
      glow.position.y = GLOW_Y * KIT_UNITS_PER_METRE;
      glow.visible = false;
      mesh.add(glow);
      ring.add(mesh);
      this.balloons.push(mesh);
      this.glows.push(glow);
    }
  }

  private composeSlot(plan: RingPlan, i: number): void {
    const s = plan.scale[i];
    this.position.set(0, plan.radius[i], plan.z[i]);
    this.rotation.setFromAxisAngle(this.axisY, plan.yaw[i]);
    this.scale.set(s, s, s);
    this.instance.compose(this.position, this.rotation, this.scale);
    this.ringRotation.makeRotationZ(plan.angle[i] - HALF_PI);
    this.instance.premultiply(this.ringRotation);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
