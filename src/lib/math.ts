// Map v from [vmin, vmax] to [tmin, tmax]. Clamp v to the source range.
export function normalize(v: number, vmin: number, vmax: number, tmin: number, tmax: number): number {
  const nv = Math.max(Math.min(v, vmax), vmin)
  return tmin + ((nv - vmin) / (vmax - vmin)) * (tmax - tmin)
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
