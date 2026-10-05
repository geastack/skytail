// Flight distance controls the day phase. Each channel approaches its target with a 0.5-second time constant.
// Preset colours and gradient texture bytes use sRGB. Interpolation also uses sRGB.
import { SRGBColorSpace } from 'three/src/constants.js';
import type { AmbientLight } from 'three/src/lights/AmbientLight.js';
import type { DirectionalLight } from 'three/src/lights/DirectionalLight.js';
import type { HemisphereLight } from 'three/src/lights/HemisphereLight.js';
import type { Fog } from 'three/src/scenes/Fog.js';
import type { DataTexture } from 'three/src/textures/DataTexture.js';
import { AMBIENT_REST, DIST_PER_DAY } from '../config';
import { writeSkyGradient } from '../lib/three-helpers';

// Each preset row stores RGB colours as three sRGB bytes.
const TOP = 0; // This is the gradient zenith.
const BOT = 3; // The gradient horizon and fog share this colour.
const HEMI_SKY = 6;
const HEMI_GROUND = 9;
const HEMI_I = 12;
const AMB = 13;
const AMB_I = 16;
const SUN = 17;
const SUN_I = 20;
const NIGHT = 21; // Zero means day. One means midnight.
const CHANNELS = 22;

const HEMI_DAY = 0.9 * Math.PI;
const SUN_DAY = 0.9 * Math.PI;

// Preset order: dawn, noon, dusk, midnight.
const PRESETS = new Float32Array([
  0xe4, 0xe0, 0xba, 0xf7, 0xd9, 0xaa, 0xaa, 0xaa, 0xaa, 0x00, 0x00, 0x00, HEMI_DAY, 0xdc, 0x88, 0x74, AMBIENT_REST, 0xff, 0xd9, 0xa0, SUN_DAY, 0,
  0x9f, 0xd5, 0xe0, 0xc6, 0xe8, 0xed, 0xc6, 0xe8, 0xed, 0x3a, 0x3a, 0x2a, HEMI_DAY, 0xb8, 0xc8, 0xd0, AMBIENT_REST, 0xff, 0xff, 0xff, SUN_DAY, 0,
  0xe4, 0xe0, 0xba, 0xf7, 0xd9, 0xaa, 0xaa, 0xaa, 0xaa, 0x00, 0x00, 0x00, 0.8 * HEMI_DAY, 0xdc, 0x88, 0x74, AMBIENT_REST, 0xf0, 0x7f, 0x2f, 0.7 * Math.PI, 0,
  0x0f, 0x24, 0x47, 0x2f, 0x5d, 0xab, 0x2f, 0x5d, 0xab, 0x00, 0x00, 0x00, 0.35 * HEMI_DAY, 0x62, 0x4b, 0x9e, 0.35 * AMBIENT_REST, 0x9c, 0xb1, 0xd1, 0.35 * Math.PI, 1,
]);

const TAU = 500; // The easing time constant uses milliseconds.
const GRADIENT_BYTES = 6;

// Smoothstep removes slope changes at preset boundaries.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** @gea-refcount */
export class Daylight {
  /** Day phase: 0 is dawn, 0.25 is noon, 0.5 is dusk, and 0.75 is midnight. */
  dayPhase = 0;
  /** The hit flash returns to this eased ambient intensity. */
  ambientRest = AMBIENT_REST;
  /** Night brightness ranges from 0 by day to 1 at midnight. */
  night = 0;

  private readonly state = new Float32Array(CHANNELS);
  private readonly written = new Uint8Array(GRADIENT_BYTES);

  constructor(
    private readonly gradient: DataTexture,
    private readonly fog: Fog,
    private readonly hemisphere: HemisphereLight,
    private readonly ambient: AmbientLight,
    private readonly sun: DirectionalLight,
  ) {
    for (let c = 0; c < CHANNELS; c++) this.state[c] = PRESETS[c];
    this.apply();
  }

  /** dt uses milliseconds. Call update in every game state to ease channels toward the distance-driven preset. */
  update(distance: number, dt: number): void {
    const days = distance / DIST_PER_DAY;
    const phase = days - Math.floor(days);
    this.dayPhase = phase;

    const key = phase * 4;
    const from = Math.floor(key) % 4;
    const t = smoothstep(key - Math.floor(key));
    const a = from * CHANNELS;
    const b = ((from + 1) % 4) * CHANNELS;
    const ease = 1 - Math.exp(-dt / TAU);
    const state = this.state;
    for (let c = 0; c < CHANNELS; c++) {
      const target = PRESETS[a + c] + (PRESETS[b + c] - PRESETS[a + c]) * t;
      state[c] += (target - state[c]) * ease;
    }
    this.ambientRest = state[AMB_I];
    this.night = state[NIGHT];
    this.apply();
  }

  // The fog shares the gradient horizon colour. The directional sun and its shadow camera stay fixed.
  private apply(): void {
    const s = this.state;
    this.hemisphere.color.setRGB(s[HEMI_SKY] / 255, s[HEMI_SKY + 1] / 255, s[HEMI_SKY + 2] / 255, SRGBColorSpace);
    this.hemisphere.groundColor.setRGB(s[HEMI_GROUND] / 255, s[HEMI_GROUND + 1] / 255, s[HEMI_GROUND + 2] / 255, SRGBColorSpace);
    this.hemisphere.intensity = s[HEMI_I];
    this.ambient.color.setRGB(s[AMB] / 255, s[AMB + 1] / 255, s[AMB + 2] / 255, SRGBColorSpace);
    this.sun.color.setRGB(s[SUN] / 255, s[SUN + 1] / 255, s[SUN + 2] / 255, SRGBColorSpace);
    this.sun.intensity = s[SUN_I];
    this.fog.color.setRGB(s[BOT] / 255, s[BOT + 1] / 255, s[BOT + 2] / 255, SRGBColorSpace);

    if (!this.gradientMoved()) return;
    writeSkyGradient(this.gradient, s[TOP], s[TOP + 1], s[TOP + 2], s[BOT], s[BOT + 1], s[BOT + 2]);
  }

  // Upload the gradient only when a rounded colour byte changes.
  private gradientMoved(): boolean {
    let moved = false;
    for (let c = 0; c < GRADIENT_BYTES; c++) {
      const byte = Math.round(this.state[TOP + c]);
      if (byte === this.written[c]) continue;
      this.written[c] = byte;
      moved = true;
    }
    return moved;
  }
}
