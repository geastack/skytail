import { DataTexture } from 'three/src/textures/DataTexture.js'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  UVMapping,
} from 'three/src/constants.js'

export function makeSkyGradient(): DataTexture {
  const n = 64
  const data = new Uint8Array(n * 4)
  // Supply every inherited Texture argument.
  // The native compiler can convert omitted numeric arguments to NaN before Texture applies defaults.
  const tex = new DataTexture(
    data,
    1,
    n,
    RGBAFormat,
    UnsignedByteType,
    UVMapping,
    ClampToEdgeWrapping,
    ClampToEdgeWrapping,
    LinearFilter,
    LinearFilter,
    1,
    SRGBColorSpace,
  )
  writeSkyGradient(tex, 0xe4, 0xe0, 0xba, 0xf7, 0xd9, 0xaa);
  return tex
}

/** Row 0 is the horizon. The last row is the zenith. Update the existing sRGB gradient without allocating a buffer. */
export function writeSkyGradient(
  tex: DataTexture,
  topR: number,
  topG: number,
  topB: number,
  botR: number,
  botG: number,
  botB: number,
): void {
  // Native texture images can be null, arrays, or objects with optional data and height.
  // A DataTexture uses one image.
  const image = tex.image;
  if (image === null || Array.isArray(image)) return;
  const data = image.data;
  const n = image.height;
  if (!data || !n) return;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    data[i * 4] = Math.round(botR + (topR - botR) * t);
    data[i * 4 + 1] = Math.round(botG + (topG - botG) * t);
    data[i * 4 + 2] = Math.round(botB + (topB - botB) * t);
    data[i * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
}
