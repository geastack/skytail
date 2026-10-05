import { rand4 } from './hash';
import { simplex2 } from './simplex';
import { SALT_D, SALT_M, SALT_T, SALT_W } from './tables';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lattice1(seed: number, i: number, octave: number, salt: number): number {
  return rand4(seed, i, octave, salt) * 2 - 1;
}

function valueNoise1(seed: number, x: number, lambda: number, octave: number, salt: number): number {
  const xf = x / lambda;
  const i = Math.floor(xf);
  const s = smoothstep(xf - i);
  const a = lattice1(seed, i, octave, salt);
  const b = lattice1(seed, i + 1, octave, salt);
  return a + (b - a) * s;
}

function fbm2(seed: number, x: number, lambda0: number, lambda1: number, salt: number): number {
  return (valueNoise1(seed, x, lambda0, 0, salt) + 0.5 * valueNoise1(seed, x, lambda1, 1, salt)) / 1.5;
}

/** The temperature field ranges from -1 to 1. Its lattice spacings are 96 and 48 columns. */
export function fieldT(seed: number, c: number): number {
  return fbm2(seed, c, 96, 48, SALT_T);
}

/** The moisture field ranges from -1 to 1 and controls tree and shrub density. */
export function fieldM(seed: number, c: number): number {
  return fbm2(seed, c, 48, 24, SALT_M);
}

/** The relief field ranges from -1 to 1 and controls landform probability and the teal ridge. */
export function fieldW(seed: number, c: number): number {
  return fbm2(seed, c, 16, 8, SALT_W);
}

/** The detail field ranges from -1 to 1 and uses a triangular lattice. */
export function fieldD(seed: number, c: number, j: number): number {
  return simplex2(seed, c / 6, j / 4, SALT_D);
}

/** Map a field value from [-1, 1] to [0, 1]. */
export function unit01(v: number): number {
  return v * 0.5 + 0.5;
}

export function densityScale(seed: number, c: number, j: number): number {
  return (0.6 + 0.8 * unit01(fieldM(seed, c))) * (0.5 + unit01(fieldD(seed, c, j)));
}
