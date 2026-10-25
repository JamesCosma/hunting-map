import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_ELEVATION_DIFFERENCE_FT,
  chooseStation,
  completeness,
  isUsableReading,
  mergeCandidates,
  stationScore,
} from '../src/lib/stationSelection';
import { NOW, makeObservation, minutesAgo } from './stationFixtures';

describe('isUsableReading', () => {
  it('needs a reading from the last 2 hours with a temperature', () => {
    expect(isUsableReading(makeObservation({ observedAt: minutesAgo(119) }), NOW)).toBe(true);
    expect(isUsableReading(makeObservation({ observedAt: minutesAgo(121) }), NOW)).toBe(false);
    const noTemp = makeObservation();
    noTemp.conditions = { ...noTemp.conditions, temperatureF: null };
    expect(isUsableReading(noTemp, NOW)).toBe(false);
  });
});

describe('mergeCandidates', () => {
  const nws = makeObservation({
    stationId: 'KVGT',
    source: 'nws',
    kind: 'airport',
    network: null,
    distanceMi: 4.2,
    observedAt: minutesAgo(40),
  });
  const synoptic = makeObservation({
    stationId: 'kvgt',
    source: 'synoptic',
    kind: 'airport',
    network: 'ASOS/AWOS',
    distanceMi: 4.2,
    observedAt: minutesAgo(5),
  });

  it('keeps one listing per station, preferring the fresher reading', () => {
    const merged = mergeCandidates([
      { observation: nws, terrainFt: null },
      { observation: synoptic, terrainFt: 2200 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.observation.source).toBe('synoptic');
    expect(merged[0]?.terrainFt).toBe(2200);
  });

  it('prefers the more complete reading when both are equally fresh', () => {
    const sparse = makeObservation({
      ...synoptic,
      observedAt: nws.observedAt,
      conditions: {
        temperatureF: 50,
        relativeHumidity: null,
        wind: { speedMph: null, gustMph: null, directionDeg: null },
      },
    });
    const merged = mergeCandidates([
      { observation: sparse, terrainFt: 2200 },
      { observation: nws, terrainFt: null },
    ]);
    expect(merged[0]?.observation.source).toBe('nws');
    // The NWS reading keeps Synoptic's network and terrain details.
    expect(merged[0]?.observation.network).toBe('ASOS/AWOS');
    expect(merged[0]?.terrainFt).toBe(2200);
  });

  it('prefers Synoptic on a full tie and sorts by distance', () => {
    const far = makeObservation({ stationId: 'FAR', distanceMi: 30 });
    const merged = mergeCandidates([
      { observation: far, terrainFt: null },
      { observation: { ...nws, observedAt: synoptic.observedAt }, terrainFt: null },
      { observation: synoptic, terrainFt: null },
    ]);
    expect(merged.map((c) => [c.observation.stationId, c.observation.source])).toEqual([
      ['kvgt', 'synoptic'],
      ['FAR', 'synoptic'],
    ]);
  });

  it('counts reported values', () => {
    expect(completeness(nws)).toBe(5);
  });
});

describe('stationScore', () => {
  it('adds 5 miles per 1,000 ft of elevation difference', () => {
    expect(stationScore({ distanceMi: 10, elevationFt: 7000 }, 5000)).toBe(20);
    expect(stationScore({ distanceMi: 10, elevationFt: 4000 }, 5000)).toBe(15);
  });

  it('uses distance alone without a spot elevation', () => {
    expect(stationScore({ distanceMi: 10, elevationFt: 9000 }, null)).toBe(10);
  });

  it('assumes a moderate difference when the station lists no elevation', () => {
    expect(stationScore({ distanceMi: 10, elevationFt: null }, 5000)).toBe(
      10 + (UNKNOWN_ELEVATION_DIFFERENCE_FT / 1000) * 5,
    );
  });
});

describe('chooseStation', () => {
  it('picks the nearest station when elevations are similar', () => {
    const choice = chooseStation(
      [
        makeObservation({ stationId: 'A', distanceMi: 3, elevationFt: 6100 }),
        makeObservation({ stationId: 'B', distanceMi: 8, elevationFt: 6000 }),
      ],
      6000,
    );
    expect(choice?.observation.stationId).toBe('A');
    expect(choice?.passedOverCloser).toBe(0);
  });

  it('passes over a closer valley station for one at the same height', () => {
    const choice = chooseStation(
      [
        makeObservation({ stationId: 'VALLEY', distanceMi: 3, elevationFt: 4000 }),
        makeObservation({ stationId: 'RIDGE', distanceMi: 12, elevationFt: 6900 }),
      ],
      7000,
    );
    expect(choice?.observation.stationId).toBe('RIDGE');
    expect(choice?.passedOverCloser).toBe(1);
  });

  it('breaks ties by distance and handles an empty list', () => {
    // Both score 10: FAR is 7.5 mi + 500 ft, NEAR is 5 mi + 1,000 ft.
    const choice = chooseStation(
      [
        makeObservation({ stationId: 'FAR', distanceMi: 7.5, elevationFt: 5500 }),
        makeObservation({ stationId: 'NEAR', distanceMi: 5, elevationFt: 6000 }),
      ],
      5000,
    );
    expect(choice?.observation.stationId).toBe('NEAR');
    expect(chooseStation([], 5000)).toBeNull();
  });
});
