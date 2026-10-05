// The xorshift32 generator produces a repeatable sequence from this seed.
let seed = 0x1a2b3c4d

export function rng(): number {
  let x = seed
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  seed = x >>> 0
  return (seed & 0xffffff) / 0x1000000
}

export function rand(min: number, max: number): number {
  return min + rng() * (max - min)
}
