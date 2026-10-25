import { describe, expect, it } from 'vitest';
import {
  compareWithStation,
  elevationDelta,
  proximityCaveat,
  stationProximity,
  temperatureDelta,
  windDelta,
} from '../src/lib/compare';
import type { Conditions } from '../src/types';

const conditions = (temperatureF: number | null, speedMph: number | null = null): Conditions => ({
  temperatureF,
  relativeHumidity: null,
  wind: { speedMph, gustMph: null, directionDeg: null },
});

describe('stationProximity', () => {
  it('bands a station by distance', () => {
    expect(stationProximity(0)).toBe('near');
    expect(stationProximity(15)).toBe('near');
    expect(stationProximity(15.1)).toBe('moderate');
    expect(stationProximity(40)).toBe('moderate');
    expect(stationProximity(160)).toBe('far');
  });

  it('only warns about stations that are not near', () => {
    expect(proximityCaveat(8)).toBeNull();
    expect(proximityCaveat(25)).toContain('terrain');
    expect(proximityCaveat(160)).toContain('model estimate');
  });
});

describe('temperatureDelta', () => {
  it('describes direction from the station to the spot', () => {
    expect(temperatureDelta(62, 66)).toEqual({ text: '4°F cooler', tone: 'lower' });
    expect(temperatureDelta(70, 66)).toEqual({ text: '4°F warmer', tone: 'higher' });
  });

  it('treats a sub-degree difference as the same', () => {
    expect(temperatureDelta(66.4, 66)).toEqual({ text: 'Same temperature', tone: 'same' });
  });

  it('returns null when either side is missing', () => {
    expect(temperatureDelta(null, 66)).toBeNull();
    expect(temperatureDelta(66, null)).toBeNull();
  });
});

describe('elevationDelta', () => {
  it('formats the magnitude with a thousands separator', () => {
    expect(elevationDelta(9_800, 2_205)).toEqual({ text: '7,595 ft higher', tone: 'higher' });
    expect(elevationDelta(2_205, 9_800)).toEqual({ text: '7,595 ft lower', tone: 'lower' });
  });

  it('ignores differences within the model resolution', () => {
    expect(elevationDelta(2_230, 2_205)).toEqual({ text: 'Same elevation', tone: 'same' });
  });
});

describe('windDelta', () => {
  it('describes a meaningful difference', () => {
    expect(windDelta(12, 5)).toEqual({ text: '7 mph more wind', tone: 'higher' });
    expect(windDelta(5, 12)).toEqual({ text: '7 mph less wind', tone: 'lower' });
  });

  it('collapses two calm readings instead of reporting a difference', () => {
    expect(windDelta(0, 0.5)).toEqual({ text: 'Both calm', tone: 'same' });
  });

  it('still reports when only one side is calm', () => {
    expect(windDelta(14, 0)).toEqual({ text: '14 mph more wind', tone: 'higher' });
  });
});

describe('compareWithStation', () => {
  it('returns temperature, elevation and wind in priority order', () => {
    const deltas = compareWithStation({
      model: conditions(62, 12),
      station: conditions(66, 5),
      modelElevationFt: 9_800,
      stationElevationFt: 2_205,
    });
    expect(deltas.map((entry) => entry.text)).toEqual([
      '4°F cooler',
      '7,595 ft higher',
      '7 mph more wind',
    ]);
  });

  it('drops pairs that either source did not report', () => {
    const deltas = compareWithStation({
      model: conditions(62, null),
      station: conditions(66, 5),
      modelElevationFt: null,
      stationElevationFt: 2_205,
    });
    expect(deltas.map((entry) => entry.text)).toEqual(['4°F cooler']);
  });
});
