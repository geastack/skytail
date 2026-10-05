import { describe, expect, it } from 'vitest';
import { SRGBColorSpace } from 'three/src/constants.js';
import { AmbientLight } from 'three/src/lights/AmbientLight.js';
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js';
import { HemisphereLight } from 'three/src/lights/HemisphereLight.js';
import { Fog } from 'three/src/scenes/Fog.js';
import type { DataTexture } from 'three/src/textures/DataTexture.js';
import { DIST_PER_DAY } from '../src/config';
import { makeSkyGradient } from '../src/lib/three-helpers';
import { Daylight } from '../src/world/daylight';

interface Rig {
  daylight: Daylight;
  gradient: DataTexture;
  fog: Fog;
  hemisphere: HemisphereLight;
}

function rig(): Rig {
  const gradient = makeSkyGradient();
  const fog = new Fog(0xf7d9aa, 100, 750);
  const hemisphere = new HemisphereLight(0xaaaaaa, 0x000000, 1);
  const ambient = new AmbientLight(0xdc8874, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  return { daylight: new Daylight(gradient, fog, hemisphere, ambient, sun), gradient, fog, hemisphere };
}

/** The bottom gradient row contains the horizon colour. */
function horizon(gradient: DataTexture): number[] {
  const data = gradient.image.data;
  if (data === null) throw new Error('gradient has no pixels');
  return [data[0], data[1], data[2]];
}

function fogBytes(fog: Fog): number[] {
  const hex = fog.color.getHex(SRGBColorSpace);
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

describe('the world clock', () => {
  it('maps distance onto dawn, noon, dusk and midnight, and wraps', () => {
    const { daylight } = rig();
    daylight.update(0, 16);
    expect(daylight.dayPhase).toBe(0);
    daylight.update(DIST_PER_DAY * 0.25, 16);
    expect(daylight.dayPhase).toBe(0.25);
    daylight.update(DIST_PER_DAY * 0.5, 16);
    expect(daylight.dayPhase).toBe(0.5);
    daylight.update(DIST_PER_DAY * 0.75, 16);
    expect(daylight.dayPhase).toBe(0.75);
    daylight.update(DIST_PER_DAY, 16);
    expect(daylight.dayPhase).toBe(0);
    daylight.update(DIST_PER_DAY * 3.25, 16);
    expect(daylight.dayPhase).toBeCloseTo(0.25, 12);
  });

  it('starts at dawn before the first update', () => {
    const { gradient, fog } = rig();
    expect(horizon(gradient)).toEqual([0xf7, 0xd9, 0xaa]);
    expect(fogBytes(fog)).toEqual([0xf7, 0xd9, 0xaa]);
  });
});

describe('time-of-day presets', () => {
  it('keeps fog colour within one byte of the gradient horizon on every frame', () => {
    const { daylight, gradient, fog } = rig();
    for (let i = 0; i < 200; i++) {
      daylight.update((i / 200) * DIST_PER_DAY, 16);
      const sky = horizon(gradient);
      const air = fogBytes(fog);
      for (let c = 0; c < 3; c++) expect(Math.abs(sky[c] - air[c])).toBeLessThanOrEqual(1);
    }
  });

  it('eases every channel to within 1 % of the target in 5 s', () => {
    const { daylight, fog, hemisphere } = rig();
    for (let step = 0; step < 313; step++) daylight.update(DIST_PER_DAY * 0.75, 16);
    const midnight = [0x2f, 0x5d, 0xab];
    const air = fogBytes(fog);
    for (let c = 0; c < 3; c++) expect(Math.abs(air[c] - midnight[c])).toBeLessThanOrEqual(3);
    expect(hemisphere.intensity).toBeCloseTo(0.35 * 0.9 * Math.PI, 3);
    expect(daylight.night).toBeCloseTo(1, 3);
    expect(daylight.ambientRest).toBeCloseTo(0.35 * 0.5 * Math.PI, 3);
  });

  it('eases back to dawn after a distance reset', () => {
    const { daylight, fog } = rig();
    for (let step = 0; step < 313; step++) daylight.update(DIST_PER_DAY * 0.75, 16);
    daylight.update(0, 16); // A reset returns distance to zero.
    const air = fogBytes(fog);
    expect(air[2]).toBeGreaterThan(0x90);
    for (let step = 0; step < 313; step++) daylight.update(0, 16);
    expect(fogBytes(fog)).toEqual([0xf7, 0xd9, 0xaa]);
  });
});
