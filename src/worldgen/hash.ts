// Use 32-bit shifts, XOR, and addition for native compiler support.

function mix(x: number): number {
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** Return a repeatable 32-bit hash of (seed, a, b, salt). */
export function hash4(seed: number, a: number, b: number, salt: number): number {
  let h = mix((seed ^ 0x9e3779b9) >>> 0);
  h = mix((h + ((a << 16) ^ (a >>> 16) ^ 0x85ebca6b)) >>> 0);
  h = mix((h + ((b << 16) ^ (b >>> 16) ^ 0xc2b2ae35)) >>> 0);
  h = mix((h + (salt ^ 0x27d4eb2f)) >>> 0);
  return h === 0 ? 0x6a09e667 : h;
}

/** Map a hash to [0, 1). */
export function unit(h: number): number {
  return (h & 0xffffff) / 0x1000000;
}

/** Return a value in [0, 1) for (seed, a, b, salt). */
export function rand4(seed: number, a: number, b: number, salt: number): number {
  return unit(hash4(seed, a, b, salt));
}

/** Return an integer in [0, n) for (seed, a, b, salt). */
export function pick4(seed: number, a: number, b: number, salt: number, n: number): number {
  return Math.floor(unit(hash4(seed, a, b, salt)) * n);
}
