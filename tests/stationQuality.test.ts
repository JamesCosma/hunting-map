import { describe, expect, it } from 'vitest';
import { checkElevation, elevationTolerance, sanitizeConditions } from '../src/lib/stationQuality';
import type { Conditions } from '../src/types';

const GOOD: Conditions = {
  temperatureF: 41,
  relativeHumidity: 55,
  wind: { speedMph: 6, gustMph: 14, directionDeg: 225 },
};

describe('sanitizeConditions', () => {
  it('keeps plausible readings untouched', () => {
    expect(sanitizeConditions(GOOD)).toEqual({ conditions: GOOD, notes: [] });
  });

  it('drops implausible values and explains why', () => {
    const { conditions, notes } = sanitizeConditions({
      temperatureF: 185,
      relativeHumidity: 140,
      wind: { speedMph: 400, gustMph: 999, directionDeg: 720 },
    });
    expect(conditions).toEqual({
      temperatureF: null,
      relativeHumidity: null,
      wind: { speedMph: null, gustMph: null, directionDeg: null },
    });
    expect(notes).toEqual([
      'Ignored an implausible wind speed reading.',
      'Ignored an implausible wind gust reading.',
      'Ignored an implausible temperature reading.',
      'Ignored an implausible humidity reading.',
      'Ignored an implausible wind direction reading.',
    ]);
  });

  it('caps slightly saturated humidity at 100%', () => {
    expect(
      sanitizeConditions({ ...GOOD, relativeHumidity: 102.5 }).conditions.relativeHumidity,
    ).toBe(100);
  });

  it('drops a gust lower than the sustained wind', () => {
    const { conditions, notes } = sanitizeConditions({
      ...GOOD,
      wind: { speedMph: 20, gustMph: 5, directionDeg: 90 },
    });
    expect(conditions.wind).toEqual({ speedMph: 20, gustMph: null, directionDeg: 90 });
    expect(notes).toEqual([]);
  });

  it('accepts cold extremes and calm wind', () => {
    const cold = { ...GOOD, temperatureF: -40, wind: { speedMph: 0, gustMph: 0, directionDeg: 0 } };
    expect(sanitizeConditions(cold).conditions).toEqual(cold);
  });
});

describe('checkElevation', () => {
  it('trusts a listing that agrees with terrain', () => {
    expect(checkElevation(5800, 5800.5)).toEqual({ elevationFt: 5800, check: null });
    // TQIN2: 7,984 ft listed on a ridge where the 90 m model says 8,337 ft.
    expect(checkElevation(7984, 8337)).toEqual({ elevationFt: 7984, check: null });
  });

  it('detects an elevation listed in meters (STCN2: 1,763 "ft" at 5,781 ft terrain)', () => {
    const result = checkElevation(1763, 5781);
    expect(result.check).toEqual({ kind: 'meters', listedFt: 1763, terrainFt: 5781 });
    expect(result.elevationFt).toBeCloseTo(5784, 0);
  });

  it('falls back to terrain for other disagreements', () => {
    expect(checkElevation(3000, 6500)).toEqual({
      elevationFt: 6500,
      check: { kind: 'mismatch', listedFt: 3000, terrainFt: 6500 },
    });
  });

  it('uses terrain when nothing is listed, and the listing when terrain is unknown', () => {
    expect(checkElevation(null, 4200)).toEqual({
      elevationFt: 4200,
      check: { kind: 'terrain', listedFt: null, terrainFt: 4200 },
    });
    expect(checkElevation(4200, null)).toEqual({ elevationFt: 4200, check: null });
    expect(checkElevation(null, null)).toEqual({ elevationFt: null, check: null });
  });

  it('scales tolerance with height', () => {
    expect(elevationTolerance(100)).toBe(250);
    expect(elevationTolerance(10_000)).toBe(800);
  });
});
