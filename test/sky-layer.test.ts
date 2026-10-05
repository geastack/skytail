import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { M_MOON_CRESCENT, M_SUN_RAYS } from '../src/kit/generated/kit-ids';
import { Object3D } from 'three/src/core/Object3D.js';
import type { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { CAMERA_Z, DEFAULT_H, FOG_FAR, FOG_NEAR, KIT_UNITS_PER_METRE, TOP_RADIUS_MAX } from '../src/config';
import { sharedKit } from '../src/kit/kit';
import {
  BALLOON_BAND,
  BOB_AMP,
  CLOUD_BAND,
  type RingBand,
  RingPlan,
  SKY_CIRCLE_R,
  SKY_SCALE,
  SUN_CIRCLE_Y,
  SUN_CIRCLE_Z,
  SUN_DEPTH_SCALE,
  SKY_CIRCLE_Y,
  SKY_CIRCLE_Z,
  STAR_BAND,
  SkyLayer,
} from '../src/world/sky-layer';

/** The model footprint radius at scale 1, in game units. */
function halfWidth(modelId: number): number {
  const model = sharedKit().modelById(modelId);
  return ((model.bboxMax[0] - model.bboxMin[0]) / 2) * KIT_UNITS_PER_METRE;
}

function expectInBand(band: RingBand, plan: RingPlan): void {
  const half = [halfWidth(band.modelA), halfWidth(band.modelB)];
  expect(plan.count).toBe(band.count);
  for (let i = 0; i < plan.count; i++) {
    expect(plan.radius[i]).toBeGreaterThanOrEqual(band.rMin);
    expect(plan.radius[i]).toBeLessThanOrEqual(band.rMin + band.rSpan);
    expect(plan.z[i]).toBeGreaterThanOrEqual(band.zMin);
    expect(plan.z[i]).toBeLessThanOrEqual(band.zMin + band.zSpan);
    expect(plan.scale[i]).toBeGreaterThanOrEqual(band.scaleMin);
    expect(plan.scale[i]).toBeLessThanOrEqual(band.scaleMin + band.scaleSpan);
    expect(plan.reach[i]).toBeCloseTo(half[plan.variant[i]] * plan.scale[i], 4);
    for (let j = 0; j < i; j++) {
      const dx = plan.radius[i] * Math.cos(plan.angle[i]) - plan.radius[j] * Math.cos(plan.angle[j]);
      const dy = plan.radius[i] * Math.sin(plan.angle[i]) - plan.radius[j] * Math.sin(plan.angle[j]);
      const dz = plan.z[i] - plan.z[j];
      expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeGreaterThan(plan.reach[i] + plan.reach[j]);
    }
  }
}

function expectDeterministic(band: RingBand): void {
  const a = new RingPlan(band);
  const b = new RingPlan(band);
  expect(Array.from(b.radius)).toEqual(Array.from(a.radius));
  expect(Array.from(b.angle)).toEqual(Array.from(a.angle));
  expect(Array.from(b.z)).toEqual(Array.from(a.z));
  expect(Array.from(b.scale)).toEqual(Array.from(a.scale));
  expect(Array.from(b.yaw)).toEqual(Array.from(a.yaw));
  expect(Array.from(b.variant)).toEqual(Array.from(a.variant));
}

describe('sky ring bands', () => {
  it('repeat the same plan for each RingPlan instance', () => {
    expectDeterministic(CLOUD_BAND);
    expectDeterministic(STAR_BAND);
    expectDeterministic(BALLOON_BAND);
  });

  it('keeps clouds outside the coin orbits and away from the flight lane', () => {
    expect(CLOUD_BAND.rMin).toBeGreaterThanOrEqual(800);
    expect(CLOUD_BAND.zMin + CLOUD_BAND.zSpan).toBeLessThanOrEqual(-120);
    expectInBand(CLOUD_BAND, new RingPlan(CLOUD_BAND));
  });

  it('hangs the stars outside the cloud ring and behind the horizon', () => {
    expect(STAR_BAND.rMin).toBeGreaterThanOrEqual(CLOUD_BAND.rMin + CLOUD_BAND.rSpan);
    expect(STAR_BAND.zMin + STAR_BAND.zSpan).toBeLessThanOrEqual(-600);
    expectInBand(STAR_BAND, new RingPlan(STAR_BAND));
  });

  it('flies the balloons above the terrain, below the clouds and far from z = 0', () => {
    expect(BALLOON_BAND.rMin - BOB_AMP).toBeGreaterThan(TOP_RADIUS_MAX);
    expect(BALLOON_BAND.rMin + BALLOON_BAND.rSpan).toBeLessThan(CLOUD_BAND.rMin);
    expect(BALLOON_BAND.zMin + BALLOON_BAND.zSpan).toBeLessThanOrEqual(-180);
    expectInBand(BALLOON_BAND, new RingPlan(BALLOON_BAND));
  });
});

describe('sky scene graph', () => {
  it('places world bands under the ring and celestial bodies outside it', () => {
    const scene = new Scene();
    const ring = new Object3D();
    const sky = new SkyLayer(scene, ring);
    expect(ring.children.length).toBe(3 + BALLOON_BAND.count);
    expect(scene.children.length).toBe(2);
    expect(sky.stars.parent).toBe(ring);
    expect(sky.balloons.length).toBe(BALLOON_BAND.count);
    for (let i = 0; i < 2; i++) {
      const mesh = ring.children[i] as InstancedMesh;
      expect(mesh.count).toBe(16);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.frustumCulled).toBe(false);
    }
  });

  it('bobs every balloon inside its band and lights the burners only at night', () => {
    const sky = new SkyLayer(new Scene(), new Object3D());
    const rMax = BALLOON_BAND.rMin + BALLOON_BAND.rSpan + BOB_AMP;
    for (let step = 0; step < 400; step++) {
      sky.update(16, 0.25, 0);
      for (const balloon of sky.balloons) {
        const radius = Math.hypot(balloon.position.x, balloon.position.y);
        expect(radius).toBeGreaterThan(TOP_RADIUS_MAX);
        expect(radius).toBeLessThan(rMax);
        expect(balloon.children[0].visible).toBe(false);
      }
    }
    sky.update(16, 0.75, 1);
    for (const balloon of sky.balloons) expect(balloon.children[0].visible).toBe(true);
  });
});

describe('celestial circle', () => {
  it('preserves the projected solar orbit and apparent size while leaving the moon in place', () => {
    const sky = new SkyLayer(new Scene(), new Object3D());
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 10000);
    camera.position.set(0, DEFAULT_H, CAMERA_Z);
    camera.updateMatrixWorld();
    for (let i = 0; i <= 200; i++) {
      const phase = i / 200;
      const angle = phase * Math.PI * 2;
      const oldSun = new Vector3(Math.cos(angle) * SKY_CIRCLE_R,
        SKY_CIRCLE_Y + Math.sin(angle) * SKY_CIRCLE_R, SKY_CIRCLE_Z);
      sky.update(0, phase, 0);
      expect(sky.moon.position.x).toBeCloseTo(-oldSun.x, 6);
      expect(sky.moon.position.y).toBeCloseTo(2 * SKY_CIRCLE_Y - oldSun.y, 6);
      expect(sky.moon.position.z).toBe(SKY_CIRCLE_Z);
      // The offset checks apparent size as well as the projected centre.
      for (const offset of [new Vector3(), new Vector3(8.983, 0, 1.318)]) {
        const before = offset.clone().multiplyScalar(SKY_SCALE).add(oldSun).project(camera);
        const after = offset.clone().multiply(sky.sun.scale).add(sky.sun.position).project(camera);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
      }
    }
    expect(sky.moon.scale.x).toBe(SKY_SCALE);
    expect(sky.moon.geometry).toBe(sharedKit().geometryById(M_MOON_CRESCENT, 'main'));
    expect(sky.moon.material).toBeInstanceOf(MeshBasicMaterial);
    expect((sky.moon.material as MeshBasicMaterial).fog).toBe(false);
  });

  it('shares the balloon material and places the sun inside the shared fog range', () => {
    const sky = new SkyLayer(new Scene(), new Object3D());
    sky.update(0, 0.25, 0);
    const material = sky.sun.material as MeshPhongMaterial;
    expect(material).toBeInstanceOf(MeshPhongMaterial);
    expect(material.fog).toBe(true);
    expect(material.vertexColors).toBe(true);
    for (const balloon of sky.balloons) expect(balloon.material).toBe(material);
    expect(sky.sun.geometry).toBe(sharedKit().geometryById(M_SUN_RAYS, 'main'));
    expect(sky.sun.position.z).toBe(SUN_CIRCLE_Z);
    expect(SUN_CIRCLE_Z).toBeGreaterThanOrEqual(BALLOON_BAND.zMin);
    expect(SUN_CIRCLE_Z).toBeLessThanOrEqual(BALLOON_BAND.zMin + BALLOON_BAND.zSpan);
    const positions = sky.sun.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const depth = CAMERA_Z - (sky.sun.position.z + positions.getZ(i) * sky.sun.scale.z);
      expect(depth).toBeGreaterThan(FOG_NEAR);
      expect(depth).toBeLessThan(FOG_FAR);
    }
  });

  it('holds the sun above the horizon exactly from dawn to dusk', () => {
    const sky = new SkyLayer(new Scene(), new Object3D());
    for (let i = 0; i <= 200; i++) {
      const phase = i / 200;
      sky.update(16, phase, 0);
      const up = sky.sun.position.y > SUN_CIRCLE_Y + 1e-6;
      expect(up).toBe(phase > 0 && phase < 0.5);
    }
    sky.update(16, 0.25, 0);
    expect(sky.sun.position.y).toBeCloseTo(SUN_CIRCLE_Y + SKY_CIRCLE_R * SUN_DEPTH_SCALE, 6);
    sky.update(16, 0.75, 0);
    expect(sky.sun.position.y).toBeCloseTo(SUN_CIRCLE_Y - SKY_CIRCLE_R * SUN_DEPTH_SCALE, 6);
  });

  it('shows the stars only at night', () => {
    const sky = new SkyLayer(new Scene(), new Object3D());
    sky.update(16, 0.25, 0);
    expect(sky.stars.visible).toBe(false);
    sky.update(16, 0.75, 1);
    expect(sky.stars.visible).toBe(true);
  });
});
