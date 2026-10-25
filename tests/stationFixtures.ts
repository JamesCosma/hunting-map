import type { StationObservation } from '../src/types';

export const NOW = new Date('2026-10-25T16:00:00Z');
export const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

export function makeObservation(overrides: Partial<StationObservation> = {}): StationObservation {
  return {
    stationId: 'TEST1',
    stationName: 'Test Station',
    source: 'synoptic',
    kind: 'raws',
    network: 'RAWS',
    lat: 38.5,
    lon: -116.5,
    distanceMi: 5,
    elevationFt: 6000,
    elevationCheck: null,
    observedAt: minutesAgo(10),
    conditions: {
      temperatureF: 40,
      relativeHumidity: 50,
      wind: { speedMph: 5, gustMph: 10, directionDeg: 200 },
    },
    qcNotes: [],
    skippedCloser: 0,
    passedOverCloser: 0,
    ...overrides,
  };
}
