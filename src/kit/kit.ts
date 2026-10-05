// Base64 decoder adapted from @geastack/native-webgl-angle.
// Native atob strings corrupt bytes at or above 0x80, and the native runtime has no DataView.
// Decode bytes directly and assemble multibyte values from Uint8Array reads.
import { BufferGeometry } from 'three/src/core/BufferGeometry.js';
import { Float32BufferAttribute, Uint16BufferAttribute } from 'three/src/core/BufferAttribute.js';
import type { KitCategory, KitModel, KitPart } from './kit-types';
import { KIT_CATEGORIES } from './generated/index';
import { KIT_UNITS_PER_METRE } from '../config';

/** Decoded geometry for one model part. Positions use game units. */
export interface KitMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
}

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return 0;
}

/** Decode base64 chunks into exactly byteLength bytes. */
export function decodeBase64Chunks(chunks: string[], byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let o = 0;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    for (let i = 0; i < chunk.length; i += 4) {
      const code2 = chunk.charCodeAt(i + 2);
      const code3 = chunk.charCodeAt(i + 3);
      const v0 = base64Value(chunk.charCodeAt(i));
      const v1 = base64Value(chunk.charCodeAt(i + 1));
      const v2 = base64Value(code2);
      const v3 = base64Value(code3);
      if (o < byteLength) {
        out[o] = (v0 << 2) | (v1 >> 4);
        o += 1;
      }
      if (code2 !== 61 && o < byteLength) {
        out[o] = ((v1 & 15) << 4) | (v2 >> 2);
        o += 1;
      }
      if (code3 !== 61 && o < byteLength) {
        out[o] = ((v2 & 3) << 6) | v3;
        o += 1;
      }
    }
  }
  return out;
}

/** Decode one part from a category. Scale positions by unitsPerMetre relative to the part pivot. */
export function decodePart(category: KitCategory, bytes: Uint8Array, part: KitPart, unitsPerMetre: number): KitMesh {
  const totalVerts = category.vertexCount;
  const posBase = 0;
  const nrmBase = totalVerts * 6;
  const colBase = totalVerts * 9;
  const idxBase = totalVerts * 12;
  const n = part.vertexCount;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const ex = (part.bboxMax[0] - part.bboxMin[0]) / 65535;
  const ey = (part.bboxMax[1] - part.bboxMin[1]) / 65535;
  const ez = (part.bboxMax[2] - part.bboxMin[2]) / 65535;
  for (let k = 0; k < n; k++) {
    const v = part.vertexStart + k;
    const p = posBase + v * 6;
    const qx = bytes[p] | (bytes[p + 1] << 8);
    const qy = bytes[p + 2] | (bytes[p + 3] << 8);
    const qz = bytes[p + 4] | (bytes[p + 5] << 8);
    positions[k * 3] = (part.bboxMin[0] + qx * ex) * unitsPerMetre;
    positions[k * 3 + 1] = (part.bboxMin[1] + qy * ey) * unitsPerMetre;
    positions[k * 3 + 2] = (part.bboxMin[2] + qz * ez) * unitsPerMetre;
    const q = nrmBase + v * 3;
    let nx = bytes[q];
    let ny = bytes[q + 1];
    let nz = bytes[q + 2];
    if (nx > 127) nx -= 256;
    if (ny > 127) ny -= 256;
    if (nz > 127) nz -= 256;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const inv = len > 0 ? 1 / len : 0;
    normals[k * 3] = nx * inv;
    normals[k * 3 + 1] = ny * inv;
    normals[k * 3 + 2] = nz * inv;
    const c = colBase + v * 3;
    colors[k * 3] = bytes[c] / 255;
    colors[k * 3 + 1] = bytes[c + 1] / 255;
    colors[k * 3 + 2] = bytes[c + 2] / 255;
  }
  const indices = new Uint16Array(part.indexCount);
  for (let k = 0; k < part.indexCount; k++) {
    const p = idxBase + (part.indexStart + k) * 2;
    indices[k] = bytes[p] | (bytes[p + 1] << 8);
  }
  return { positions, normals, colors, indices };
}

export function kitGeometry(mesh: KitMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new Uint16BufferAttribute(mesh.indices, 1));
  return geometry;
}

/**
 * Decode categories at construction and cache geometry on first request by model/part string keys.
 * Native interfaces use value copies, so cache keys cannot depend on object identity.
 */
export class KitLibrary {
  private readonly categories: KitCategory[] = [];
  private readonly bytes: Uint8Array[] = [];
  private readonly geometryKeys: string[] = [];
  private readonly geometries: BufferGeometry[] = [];
  /** Models in ID order, matching the M_* constants. */
  readonly models: KitModel[] = [];

  constructor(readonly unitsPerMetre: number) {
    for (let i = 0; i < KIT_CATEGORIES.length; i++) {
      const category = KIT_CATEGORIES[i];
      this.categories.push(category);
      this.bytes.push(decodeBase64Chunks(category.b64, category.byteLength));
      for (let j = 0; j < category.models.length; j++) {
        this.models.push(category.models[j]);
      }
    }
  }

  /** Return the index in models for a name. Throw if the name is unknown. */
  modelId(name: string): number {
    for (let i = 0; i < this.models.length; i++) {
      if (this.models[i].name === name) return i;
    }
    throw new Error('kit: unknown model ' + name);
  }

  modelById(id: number): KitModel {
    return this.models[id];
  }

  /** Return shared geometry for the requested model part. */
  geometryById(id: number, partName: string): BufferGeometry {
    return this.geometry(this.models[id].name, partName);
  }

  /** Find a model by name. Throw if the name is unknown. */
  model(name: string): KitModel {
    for (let i = 0; i < this.categories.length; i++) {
      const models = this.categories[i].models;
      for (let j = 0; j < models.length; j++) {
        if (models[j].name === name) return models[j];
      }
    }
    throw new Error('kit: unknown model ' + name);
  }

  /** Decode the requested model part with positions in game units. */
  mesh(name: string, partName: string): KitMesh {
    for (let i = 0; i < this.categories.length; i++) {
      const models = this.categories[i].models;
      for (let j = 0; j < models.length; j++) {
        if (models[j].name !== name) continue;
        const parts = models[j].parts;
        for (let k = 0; k < parts.length; k++) {
          if (parts[k].name === partName) return decodePart(this.categories[i], this.bytes[i], parts[k], this.unitsPerMetre);
        }
        throw new Error('kit: model ' + name + ' has no part ' + partName);
      }
    }
    throw new Error('kit: unknown model ' + name);
  }

  /** Return shared geometry for a model part, creating it on first request. */
  geometry(name: string, partName: string): BufferGeometry {
    const key = name + '/' + partName;
    for (let i = 0; i < this.geometryKeys.length; i++) {
      if (this.geometryKeys[i] === key) return this.geometries[i];
    }
    const geometry = kitGeometry(this.mesh(name, partName));
    this.geometryKeys.push(key);
    this.geometries.push(geometry);
    return geometry;
  }
}

let shared: KitLibrary | null = null;

/** Return the shared asset kit at KIT_UNITS_PER_METRE, creating it on first use. */
export function sharedKit(): KitLibrary {
  if (shared === null) shared = new KitLibrary(KIT_UNITS_PER_METRE);
  return shared;
}
