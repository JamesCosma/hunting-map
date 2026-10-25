import { describe, expect, it } from 'vitest';
import {
  getNearestObservation,
  isUsableObservation,
  parseObservation,
  parseStationCandidates,
} from '../src/services/nws';
import { jsonResponse, stubFetch } from './helpers';

const NOW = new Date('2026-10-25T00:30:00Z');
const minutesAgo = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();
const ORIGIN = { lat: 38.5, lon: -117.0 };

function station(id: string, lat: number, lon: number) {
  return {
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { stationIdentifier: id, name: `${id} Station` },
  };
}

type ObservationOverrides = Partial<
  Record<'temperature' | 'windSpeed' | 'windDirection', number | null>
>;

function observation(timestamp: string, overrides: ObservationOverrides = {}) {
  const q = (unitCode: string, value: number | null) => ({ unitCode, value });
  const pick = (key: keyof ObservationOverrides, fallback: number): number | null =>
    key in overrides ? (overrides[key] ?? null) : fallback;
  return {
    properties: {
      timestamp,
      elevation: q('wmoUnit:m', 1650),
      temperature: q('wmoUnit:degC', pick('temperature', 10)),
      relativeHumidity: q('wmoUnit:percent', 35),
      windSpeed: q('wmoUnit:km_h-1', pick('windSpeed', 16.09344)),
      windGust: q('wmoUnit:km_h-1', null),
      windDirection: q('wmoUnit:degree_(angle)', pick('windDirection', 225)),
    },
  };
}

/** Stations deliberately listed out of distance order to prove we sort. */
const STATIONS = {
  features: [
    station('FAR', 39.5, -117.0),
    station('NEAR', 38.51, -117.0),
    station('MID', 38.7, -117.0),
    station('MID2', 38.9, -117.0),
  ],
};

function routes(observations: Record<string, () => Response>) {
  return stubFetch([
    [
      '/points/',
      () =>
        jsonResponse({
          properties: {
            observationStations: 'https://api.weather.gov/gridpoints/REV/1,2/stations',
          },
        }),
    ],
    ['/gridpoints/REV/1,2/stations', () => jsonResponse(STATIONS)],
    ...Object.entries(observations).map(
      ([id, respond]) =>
        [`/stations/${id}/observations/latest`, respond] as [string, () => Response],
    ),
  ]);
}

describe('parsers', () => {
  it('sorts stations nearest first and computes miles', () => {
    const candidates = parseStationCandidates(STATIONS, ORIGIN);
    expect(candidates.map((c) => c.id)).toEqual(['NEAR', 'MID', 'MID2', 'FAR']);
    expect(candidates[0]?.distanceMi).toBeCloseTo(0.69, 1);
  });

  it('skips malformed station features', () => {
    const json = { features: [{ properties: {} }, station('OK', 38.6, -117)] };
    expect(parseStationCandidates(json, ORIGIN).map((c) => c.id)).toEqual(['OK']);
  });

  it('converts an observation to imperial units', () => {
    const parsed = parseObservation(observation(minutesAgo(10)));
    expect(parsed?.conditions.temperatureF).toBeCloseTo(50);
    expect(parsed?.conditions.wind.speedMph).toBeCloseTo(10);
    expect(parsed?.conditions.wind.directionDeg).toBe(225);
    expect(parsed?.elevationFt).toBeCloseTo(5413, 0);
  });

  it('returns null without a timestamp', () => {
    expect(parseObservation({ properties: {} })).toBeNull();
  });

  it('judges usability by age and temperature', () => {
    const fresh = parseObservation(observation(minutesAgo(30)));
    const stale = parseObservation(observation(minutesAgo(180)));
    const empty = parseObservation(observation(minutesAgo(5), { temperature: null }));
    expect(fresh && isUsableObservation(fresh, NOW)).toBe(true);
    expect(stale && isUsableObservation(stale, NOW)).toBe(false);
    expect(empty && isUsableObservation(empty, NOW)).toBe(false);
  });
});

describe('getNearestObservation', () => {
  it('uses the nearest station when its reading is good', async () => {
    const fetchImpl = routes({
      NEAR: () => jsonResponse(observation(minutesAgo(20))),
      MID: () => jsonResponse(observation(minutesAgo(5))),
      MID2: () => jsonResponse(observation(minutesAgo(5))),
    });
    const result = await getNearestObservation(ORIGIN, { fetchImpl }, () => NOW);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.observation.stationId).toBe('NEAR');
    expect(result.observation.skippedCloser).toBe(0);
  });

  it('falls back past stale and empty stations to the next nearest', async () => {
    const fetchImpl = routes({
      NEAR: () => jsonResponse(observation(minutesAgo(600))),
      MID: () => jsonResponse(observation(minutesAgo(5), { temperature: null })),
      MID2: () => jsonResponse(observation(minutesAgo(15))),
    });
    const result = await getNearestObservation(ORIGIN, { fetchImpl }, () => NOW);
    expect(result.status === 'ok' && result.observation.stationId).toBe('MID2');
    expect(result.status === 'ok' && result.observation.skippedCloser).toBe(2);
  });

  it('keeps going to a second batch when the first has nothing usable', async () => {
    const fetchImpl = routes({
      NEAR: () => jsonResponse({}, 500),
      MID: () => jsonResponse(observation(minutesAgo(600))),
      MID2: () => jsonResponse(observation(minutesAgo(600))),
      FAR: () => jsonResponse(observation(minutesAgo(1))),
    });
    const result = await getNearestObservation(ORIGIN, { fetchImpl }, () => NOW);
    expect(result.status === 'ok' && result.observation.stationId).toBe('FAR');
  });

  it('keeps null wind fields as not reported rather than skipping the station', async () => {
    const fetchImpl = routes({
      NEAR: () =>
        jsonResponse(observation(minutesAgo(5), { windSpeed: null, windDirection: null })),
      MID: () => jsonResponse(observation(minutesAgo(5))),
      MID2: () => jsonResponse(observation(minutesAgo(5))),
    });
    const result = await getNearestObservation(ORIGIN, { fetchImpl }, () => NOW);
    expect(result.status === 'ok' && result.observation.conditions.wind).toEqual({
      speedMph: null,
      gustMph: null,
      directionDeg: null,
    });
  });

  it('reports when no station has recent data', async () => {
    const stale = () => jsonResponse(observation(minutesAgo(600)));
    const fetchImpl = routes({ NEAR: stale, MID: stale, MID2: stale, FAR: stale });
    const result = await getNearestObservation(ORIGIN, { fetchImpl }, () => NOW);
    expect(result).toEqual({ status: 'no-recent-data', stationsChecked: 4 });
  });

  it('treats a 404 from /points as outside coverage', async () => {
    const fetchImpl = stubFetch([['/points/', () => jsonResponse({ title: 'Not found' }, 404)]]);
    await expect(getNearestObservation({ lat: 20, lon: -140 }, { fetchImpl })).resolves.toEqual({
      status: 'outside-coverage',
    });
  });

  it('surfaces a connectivity error when every station request fails', async () => {
    const fetchImpl = routes({});
    await expect(getNearestObservation(ORIGIN, { fetchImpl }, () => NOW)).rejects.toMatchObject({
      kind: 'offline',
    });
  });

  it('sends coordinates rounded to the 4 decimals NWS accepts', async () => {
    const fetchImpl = stubFetch([['/points/', () => jsonResponse({}, 404)]]);
    await getNearestObservation({ lat: 36.123456789, lon: -115.987654321 }, { fetchImpl });
    expect(fetchImpl.calls[0]).toBe('https://api.weather.gov/points/36.1235,-115.9877');
  });
});
