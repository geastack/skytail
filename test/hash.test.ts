import { describe, expect, it } from 'vitest';
import { hash4, rand4, pick4 } from '../src/worldgen/hash';

describe('position hash', () => {
  it('is deterministic and sensitive to every argument', () => {
    expect(hash4(1, 2, 3, 4)).toBe(hash4(1, 2, 3, 4));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(2, 2, 3, 4));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(1, 3, 3, 4));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(1, 2, 4, 4));
    expect(hash4(1, 2, 3, 4)).not.toBe(hash4(1, 2, 3, 5));
    expect(hash4(0, 0, 0, 0)).not.toBe(0);
  });

  it('spreads neighbouring cells evenly over [0, 1)', () => {
    const buckets = new Array<number>(10).fill(0);
    let n = 0;
    for (let col = 0; col < 200; col++) {
      for (let row = 0; row < 20; row++) {
        const u = rand4(7, col, row, 1);
        expect(u >= 0 && u < 1).toBe(true);
        buckets[Math.floor(u * 10)] += 1;
        n += 1;
      }
    }
    for (const b of buckets) expect(Math.abs(b / n - 0.1)).toBeLessThan(0.02);
    expect(pick4(7, 5, 5, 2, 4)).toBeGreaterThanOrEqual(0);
    expect(pick4(7, 5, 5, 2, 4)).toBeLessThan(4);
  });

  it('matches the reference hash values', () => {
    expect(hash4(0x1a2b3c4d, 0, 0, 0)).toBe(hash4(0x1a2b3c4d, 0, 0, 0));
    expect([hash4(1, 0, 0, 0), hash4(1, 1, 0, 0), hash4(1, 0, 1, 0), hash4(1, 0, 0, 1)]).toMatchSnapshot();
  });
});
