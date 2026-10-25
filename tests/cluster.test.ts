import { describe, expect, it } from 'vitest';
import { clusterPoints } from '../src/lib/cluster';

describe('clusterPoints', () => {
  it('merges points within the radius and averages their position', () => {
    const clusters = clusterPoints(
      [
        { x: 0, y: 0, item: 'a' },
        { x: 10, y: 0, item: 'b' },
        { x: 200, y: 200, item: 'c' },
      ],
      44,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toEqual({ x: 5, y: 0, items: ['a', 'b'] });
    expect(clusters[1]).toEqual({ x: 200, y: 200, items: ['c'] });
  });

  it('joins clusters across grid cell boundaries', () => {
    const clusters = clusterPoints(
      [
        { x: 43, y: 43, item: 1 },
        { x: 45, y: 45, item: 2 },
      ],
      44,
    );
    expect(clusters.map((c) => c.items)).toEqual([[1, 2]]);
  });

  it('keeps cluster seeds at least a radius apart', () => {
    const points = Array.from({ length: 400 }, (_, i) => ({
      x: (i * 37) % 500,
      y: (i * 53) % 500,
      item: i,
    }));
    const clusters = clusterPoints(points, 44);
    expect(clusters.reduce((sum, c) => sum + c.items.length, 0)).toBe(400);
    const seeds = clusters.map((c) => points.find((p) => p.item === c.items[0]));
    for (const [i, a] of seeds.entries()) {
      for (const b of seeds.slice(i + 1)) {
        if (a == null || b == null) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('handles no points', () => {
    expect(clusterPoints([], 44)).toEqual([]);
  });
});
