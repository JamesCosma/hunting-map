import { describe, expect, it } from 'vitest';
import { boundsArea, containsBounds, containsPoint, padBounds, snapBounds } from '../src/lib/bbox';

const VIEW = { south: 36.1, west: -115.3, north: 36.3, east: -115.0 };

describe('bbox helpers', () => {
  it('pads every side by a fraction of the size', () => {
    const padded = padBounds(VIEW, 0.25);
    expect(padded.south).toBeCloseTo(36.05);
    expect(padded.north).toBeCloseTo(36.35);
    expect(padded.west).toBeCloseTo(-115.375);
    expect(padded.east).toBeCloseTo(-114.925);
  });

  it('snaps outward to the grid and clamps to valid coordinates', () => {
    expect(snapBounds(VIEW, 0.25)).toEqual({ south: 36, west: -115.5, north: 36.5, east: -115 });
    expect(snapBounds({ south: -91, west: -181, north: 91, east: 181 }, 1)).toEqual({
      south: -90,
      west: -180,
      north: 90,
      east: 180,
    });
  });

  it('checks containment and area', () => {
    const outer = snapBounds(VIEW, 0.25);
    expect(containsBounds(outer, VIEW)).toBe(true);
    expect(containsBounds(VIEW, outer)).toBe(false);
    expect(boundsArea(outer)).toBeCloseTo(0.25);
    expect(boundsArea({ south: 1, west: 1, north: 0, east: 2 })).toBe(0);
    expect(containsPoint(VIEW, { lat: 36.2, lon: -115.12 })).toBe(true);
    expect(containsPoint(VIEW, { lat: 37, lon: -115.12 })).toBe(false);
  });
});
