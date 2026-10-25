import { describe, expect, it } from 'vitest';
import {
  distanceMiles,
  isValidLatLon,
  normalizeDegrees,
  toCompassPoint,
  wrapLongitude,
} from '../src/lib/geo';

describe('distanceMiles', () => {
  it('is zero for the same point', () => {
    expect(distanceMiles({ lat: 36.24, lon: -115.12 }, { lat: 36.24, lon: -115.12 })).toBe(0);
  });

  it('matches a known distance (Las Vegas to Tonopah is about 185 mi)', () => {
    const d = distanceMiles({ lat: 36.1699, lon: -115.1398 }, { lat: 38.0672, lon: -117.2301 });
    expect(d).toBeGreaterThan(170);
    expect(d).toBeLessThan(185);
  });

  it('is symmetric', () => {
    const a = { lat: 38.5, lon: -117 };
    const b = { lat: 39.1, lon: -116.2 };
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 10);
  });
});

describe('toCompassPoint', () => {
  it.each([
    [0, 'N'],
    [11, 'N'],
    [12, 'NNE'],
    [45, 'NE'],
    [180, 'S'],
    [225, 'SW'],
    [330, 'NNW'],
    [349, 'N'],
    [360, 'N'],
    [-90, 'W'],
  ])('%d degrees is %s', (deg, point) => {
    expect(toCompassPoint(deg)).toBe(point);
  });
});

describe('angle and coordinate helpers', () => {
  it('normalizes degrees', () => {
    expect(normalizeDegrees(-45)).toBe(315);
    expect(normalizeDegrees(405)).toBe(45);
  });

  it('wraps longitudes from a panned world copy', () => {
    expect(wrapLongitude(-475)).toBeCloseTo(-115);
    expect(wrapLongitude(245)).toBeCloseTo(-115);
    expect(wrapLongitude(-115)).toBeCloseTo(-115);
  });

  it('validates coordinates', () => {
    expect(isValidLatLon({ lat: 38.5, lon: -117 })).toBe(true);
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: Number.NaN, lon: 0 })).toBe(false);
  });
});
