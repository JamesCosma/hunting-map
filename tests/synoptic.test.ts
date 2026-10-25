import { describe, expect, it } from 'vitest';
import { RequestError } from '../src/lib/http';
import {
  buildBoundsUrl,
  buildRadiusUrl,
  getSynopticStationsInBounds,
  getSynopticStationsNear,
  parseSynopticResponse,
  parseSynopticStation,
} from '../src/services/synoptic';
import { jsonResponse, stubFetch } from './helpers';

const TOKEN = 'test-token';
const AT = '2026-10-25T15:10:00Z';

function reading(value: number | null, qc?: 'passed' | 'failed') {
  return { value, date_time: AT, ...(qc ? { qc: { status: qc, qc_flags: [3] } } : {}) };
}

function station(id: string, overrides: Record<string, unknown> = {}) {
  return {
    STID: id,
    NAME: `${id} Station`,
    LATITUDE: '38.2',
    LONGITUDE: '-116.6',
    ELEVATION: '5800.0',
    ELEV_DEM: '5800.5',
    MNET_ID: '2',
    DISTANCE: 21.5,
    OBSERVATIONS: {
      air_temp_value_1: reading(30.2),
      relative_humidity_value_1: reading(95),
      wind_speed_value_1: reading(4),
      wind_direction_value_1: reading(180),
      wind_gust_value_1: reading(9),
    },
    ...overrides,
  };
}

const ok = (stations: unknown[]) => ({
  SUMMARY: { RESPONSE_CODE: 1, RESPONSE_MESSAGE: 'OK', NUMBER_OF_OBJECTS: stations.length },
  STATION: stations,
});

describe('Synoptic URLs', () => {
  it('asks for English units with wind in mph and QC flags', () => {
    const url = new URL(
      buildRadiusUrl(
        { lat: 38.123456, lon: -116.5 },
        { token: TOKEN, radiusMi: 50, limit: 30, withinMinutes: 120 },
      ),
    );
    expect(url.origin + url.pathname).toBe('https://api.synopticdata.com/v2/stations/latest');
    expect(url.searchParams.get('units')).toBe('english,speed|mph');
    expect(url.searchParams.get('radius')).toBe('38.1235,-116.5000,50');
    expect(url.searchParams.get('limit')).toBe('30');
    expect(url.searchParams.get('within')).toBe('120');
    expect(url.searchParams.get('qc_flags')).toBe('on');
    expect(url.searchParams.get('vars')).toBe(
      'air_temp,relative_humidity,wind_speed,wind_direction,wind_gust',
    );
  });

  it('orders the bounding box west, south, east, north', () => {
    const url = new URL(
      buildBoundsUrl(
        { south: 36, west: -115.5, north: 36.5, east: -115 },
        { token: TOKEN, withinMinutes: 1440 },
      ),
    );
    expect(url.searchParams.get('bbox')).toBe('-115.500,36.000,-115.000,36.500');
    expect(url.searchParams.has('limit')).toBe(false);
  });
});

describe('parseSynopticStation', () => {
  it('reads metadata and the latest values', () => {
    const parsed = parseSynopticStation(station('PANN2'));
    expect(parsed).toMatchObject({
      id: 'PANN2',
      name: 'PANN2 Station',
      lat: 38.2,
      lon: -116.6,
      networkId: '2',
      listedElevationFt: 5800,
      terrainElevationFt: 5800.5,
      conditions: {
        temperatureF: 30.2,
        relativeHumidity: 95,
        wind: { speedMph: 4, gustMph: 9, directionDeg: 180 },
      },
      qcNotes: [],
    });
    expect(parsed?.observedAt?.toISOString()).toBe('2026-10-25T15:10:00.000Z');
  });

  it('drops readings that failed quality control and says so', () => {
    const parsed = parseSynopticStation(
      station('X', {
        OBSERVATIONS: {
          air_temp_value_1: reading(31, 'passed'),
          wind_speed_value_1: reading(88, 'failed'),
        },
      }),
    );
    expect(parsed?.conditions.temperatureF).toBe(31);
    expect(parsed?.conditions.wind.speedMph).toBeNull();
    expect(parsed?.qcNotes).toEqual(['Dropped a wind speed reading that failed quality control.']);
  });

  it('handles missing elevations, names and observations', () => {
    const parsed = parseSynopticStation(
      station('STCN2', { NAME: '  ', ELEVATION: null, ELEV_DEM: null, OBSERVATIONS: {} }),
    );
    expect(parsed).toMatchObject({
      name: 'STCN2',
      listedElevationFt: null,
      terrainElevationFt: null,
      observedAt: null,
    });
    expect(parsed?.conditions.temperatureF).toBeNull();
  });

  it('uses the newest reading time when there is no temperature', () => {
    const parsed = parseSynopticStation(
      station('W', {
        OBSERVATIONS: {
          wind_speed_value_1: { value: 3, date_time: '2026-10-25T15:00:00Z' },
          wind_gust_value_1: { value: 5, date_time: '2026-10-25T15:20:00Z' },
        },
      }),
    );
    expect(parsed?.observedAt?.toISOString()).toBe('2026-10-25T15:20:00.000Z');
  });

  it('rejects entries without an id or coordinates', () => {
    expect(parseSynopticStation(station('A', { LATITUDE: null }))).toBeNull();
    expect(parseSynopticStation({ LATITUDE: 1, LONGITUDE: 2 })).toBeNull();
    expect(parseSynopticStation(null)).toBeNull();
  });
});

describe('parseSynopticResponse', () => {
  it('treats "no stations found" as an empty list', () => {
    const empty = {
      SUMMARY: { RESPONSE_CODE: 2, RESPONSE_MESSAGE: 'No stations found', NUMBER_OF_OBJECTS: 0 },
    };
    expect(parseSynopticResponse(empty)).toEqual([]);
  });

  it('throws a RequestError for other failures without exposing the URL', () => {
    const invalid = {
      SUMMARY: { RESPONSE_CODE: 2, RESPONSE_MESSAGE: 'Invalid token', HTTP_STATUS_CODE: 401 },
    };
    expect(() => parseSynopticResponse(invalid)).toThrow(RequestError);
    try {
      parseSynopticResponse(invalid);
    } catch (error) {
      expect((error as RequestError).status).toBe(401);
      expect((error as RequestError).message).toBe('Invalid token');
    }
    expect(() => parseSynopticResponse('nonsense')).toThrow(RequestError);
  });

  it('skips malformed stations', () => {
    expect(parseSynopticResponse(ok([station('A'), { STID: 'B' }])).map((s) => s.id)).toEqual([
      'A',
    ]);
  });
});

describe('Synoptic requests', () => {
  it('returns nearby stations sorted by true distance from the point', async () => {
    const fetchImpl = stubFetch([
      [
        'radius=',
        () =>
          jsonResponse(
            ok([
              station('FAR', { LATITUDE: 38.9, LONGITUDE: -116.5 }),
              station('NEAR', { LATITUDE: 38.51, LONGITUDE: -116.5 }),
            ]),
          ),
      ],
    ]);
    const stations = await getSynopticStationsNear(
      { lat: 38.5, lon: -116.5 },
      { token: TOKEN, radiusMi: 50, limit: 30, withinMinutes: 120, fetchImpl },
    );
    expect(stations.map((s) => s.id)).toEqual(['NEAR', 'FAR']);
    expect(stations[0]?.distanceMi).toBeCloseTo(0.69, 1);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('fetches stations inside a box', async () => {
    const fetchImpl = stubFetch([['bbox=', () => jsonResponse(ok([station('A')]))]]);
    const stations = await getSynopticStationsInBounds(
      { south: 38, west: -117, north: 39, east: -116 },
      { token: TOKEN, withinMinutes: 1440, fetchImpl },
    );
    expect(stations.map((s) => s.id)).toEqual(['A']);
  });

  it('rejects with an http RequestError for an invalid token', async () => {
    const fetchImpl = stubFetch([
      ['radius=', () => jsonResponse({ SUMMARY: { RESPONSE_CODE: 2 } }, 401)],
    ]);
    await expect(
      getSynopticStationsNear(
        { lat: 38.5, lon: -116.5 },
        { token: 'bad', radiusMi: 50, limit: 30, withinMinutes: 120, fetchImpl },
      ),
    ).rejects.toMatchObject({ kind: 'http', status: 401 });
  });
});
