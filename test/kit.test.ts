import { describe, expect, it } from 'vitest';
import { KIT_CATEGORIES } from '../src/kit/generated/index';
import { KIT_MODEL_COUNT, KIT_MODEL_NAMES, M_SHORE_STRAIGHT, M_SHORE_STRAIGHT__WINTER } from '../src/kit/generated/kit-ids';
import { KitLibrary, decodeBase64Chunks, decodePart } from '../src/kit/kit';

describe('baked asset kit', () => {
  it('decodes every category blob to its declared length and every part to its declared bounds', { timeout: 30000 }, () => {
    let models = 0;
    for (const category of KIT_CATEGORIES) {
      const bytes = decodeBase64Chunks(category.b64, category.byteLength);
      expect(bytes.length).toBe(category.byteLength);
      expect(category.byteLength).toBe(category.vertexCount * 12 + category.indexCount * 2);
      for (const model of category.models) {
        models += 1;
        for (const part of model.parts) {
          const mesh = decodePart(category, bytes, part, 1);
          expect(mesh.positions.length).toBe(part.vertexCount * 3);
          expect(mesh.indices.length).toBe(part.indexCount);
          expect(part.indexCount % 3).toBe(0);
          let maxIndex = 0;
          for (const i of mesh.indices) maxIndex = Math.max(maxIndex, i);
          expect(maxIndex).toBeLessThan(part.vertexCount);
          for (let axis = 0; axis < 3; axis++) {
            let lo = Infinity;
            let hi = -Infinity;
            for (let v = 0; v < part.vertexCount; v++) {
              lo = Math.min(lo, mesh.positions[v * 3 + axis]);
              hi = Math.max(hi, mesh.positions[v * 3 + axis]);
            }
            expect(lo).toBeCloseTo(part.bboxMin[axis], 3);
            expect(hi).toBeCloseTo(part.bboxMax[axis], 3);
          }
          for (const c of mesh.colors) expect(c >= 0 && c <= 1).toBe(true);
        }
      }
    }
    expect(models).toBe(KIT_MODEL_COUNT);
    expect(KIT_MODEL_NAMES.length).toBe(KIT_MODEL_COUNT);
  });

  it('matches the measured tile contract and scales into game units', () => {
    const kit = new KitLibrary(6);
    const shore = kit.model('shore_straight');
    expect(shore.bboxMin).toEqual([-5, -0.55, -5]);
    expect(shore.bboxMax).toEqual([5, 0.24, 5]);
    expect(shore.sockets.map((s) => s.name)).toContain('shore_straight__snap_east_waterline');
    const mesh = kit.mesh('shore_straight', 'main');
    let hi = -Infinity;
    for (let v = 0; v < mesh.positions.length; v += 3) hi = Math.max(hi, mesh.positions[v]);
    expect(hi).toBeCloseTo(30, 2);
    expect(kit.geometry('shore_straight', 'main')).toBe(kit.geometry('shore_straight', 'main'));
    expect(() => kit.model('no_such_model')).toThrow();
    expect(kit.modelId('shore_straight')).toBe(M_SHORE_STRAIGHT);
    expect(KIT_MODEL_NAMES[M_SHORE_STRAIGHT]).toBe('shore_straight');
    expect(kit.modelById(M_SHORE_STRAIGHT__WINTER).name).toBe('shore_straight__winter');
    expect(kit.geometryById(M_SHORE_STRAIGHT, 'main')).toBe(kit.geometry('shore_straight', 'main'));
  });

  it('recolours a variant without changing its geometry', () => {
    const kit = new KitLibrary(1);
    const base = kit.mesh('shore_straight', 'main');
    const winter = kit.mesh('shore_straight__winter', 'main');
    expect(winter.positions).toEqual(base.positions);
    expect(winter.indices).toEqual(base.indices);
    expect(winter.colors).not.toEqual(base.colors);
  });

  it('separates shore material roles without changing pivots or beach sand colours', () => {
    const kit = new KitLibrary(1);
    for (const name of KIT_MODEL_NAMES) {
      if (!name.startsWith('shore_') || name.includes('__')) continue;
      for (const suffix of ['', '__spring', '__autumn', '__winter']) {
        const model = kit.model(name + suffix);
        expect(model.parts.map((p) => p.name)).toEqual(['main', 'Sand', 'Water']);
        for (const part of model.parts) expect(part.pivot).toEqual([0, 0, 0]);
        expect(kit.mesh(name + suffix, 'Sand').colors).toEqual(kit.mesh(name, 'Sand').colors);
      }
    }
  });

  it('keeps the aircraft propeller as its own part around a non-zero pivot', () => {
    const kit = new KitLibrary(1);
    const plane = kit.model('airplane_rounded_gold');
    expect(plane.parts.map((p) => p.name)).toEqual(['main', 'Propeller_Pivot']);
    expect(plane.parts[1].pivot[0]).toBeGreaterThan(1);
    expect(plane.sockets.find((s) => s.name === 'Mount_Pilot')).toBeTruthy();
  });
});
