import { hash4 } from './hash';

const SKEW = 0.3660254037844386;
const UNSKEW = 0.21132486540518713;
const NORMALIZER = 0.01001634121365712;
const GRADIENTS = new Float32Array(48);
for (let i = 0; i < 24; i++) {
  const angle = Math.PI / 24 + i * Math.PI / 12;
  GRADIENTS[i * 2] = Math.cos(angle);
  GRADIENTS[i * 2 + 1] = Math.sin(angle);
}

function contribution(seed: number, i: number, k: number, salt: number, x: number, z: number): number {
  const a = 0.5 - x * x - z * z;
  if (a <= 0) return 0;
  const g = (hash4(seed, i, k, salt) % 24) * 2;
  const aa = a * a;
  return aa * aa * (GRADIENTS[g] * x + GRADIENTS[g + 1] * z);
}

/** Return triangular-lattice noise clamped to [-1, 1]. */
export function simplex2(seed: number, x: number, z: number, salt: number): number {
  const s = (x + z) * SKEW;
  const i = Math.floor(x + s);
  const k = Math.floor(z + s);
  const u = (i + k) * UNSKEW;
  const x0 = x - i + u;
  const z0 = z - k + u;
  const di = x0 > z0 ? 1 : 0;
  const dk = 1 - di;
  const value = (
    contribution(seed, i, k, salt, x0, z0) +
    contribution(seed, i + di, k + dk, salt, x0 - di + UNSKEW, z0 - dk + UNSKEW) +
    contribution(seed, i + 1, k + 1, salt, x0 - 1 + 2 * UNSKEW, z0 - 1 + 2 * UNSKEW)
  ) / NORMALIZER;
  return Math.max(-1, Math.min(1, value));
}
