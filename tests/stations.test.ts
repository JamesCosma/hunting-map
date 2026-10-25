import { describe, expect, it } from 'vitest';
import { getNearestStation, synopticCandidate } from '../src/services/stations';
import { jsonResponse, stubFetch, type Route } from './helpers';
import { NOW, minutesAgo } from './stationFixtures';

const SPOT = { lat: 38.5, lon: -116.5 };
const FT = 0.3048;

function nwsRoutes(options: { latest?: () => Response; points?: () => Response } = {}): Route[] {
  return [
    [
      '/points/',
      options.points ??
        (() =>
          jsonResponse({
            properties: {
              observationStations: 'https://api.weather.gov/gridpoints/X/1,1/stations',
            },
          })),
    ],
    [
      '/gridpoints/X/1,1/stations',
      () =>
        jsonResponse({
          features: [
            {
              geometry: { type: 'Point', coordinates: [-116.5, 38.9] },
              properties: { stationIdentifier: 'KTPH', name: 'Tonopah Airport' },
            },
          ],
        }),
    ],
    [
      '/stations/KTPH/observations/latest',
      options.latest ??
        (() =>
          jsonResponse({
            properties: {
              timestamp: minutesAgo(20).toISOString(),
              elevation: { unitCode: 'wmoUnit:m', value: 1653 },
              temperature: { unitCode: 'wmoUnit:degC', value: 5 },
              relativeHumidity: { unitCode: 'wmoUnit:percent', value: 60 },
              windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 10 },
              windGust: { unitCode: 'wmoUnit:km_h-1', value: null },
              windDirection: { unitCode: 'wmoUnit:degree_(angle)', value: 180 },
            },
          })),
    ],
  ];
}

function synopticStation(
  id: string,
  lat: number,
  options: {
    elevation?: string | null;
    dem?: string | null;
    minutes?: number;
    temp?: number | null;
    net?: string;
  } = {},
) {
  const at = minutesAgo(options.minutes ?? 10).toISOString();
  return {
    STID: id,
    NAME: `${id} name`,
    LATITUDE: lat,
    LONGITUDE: -116.5,
    ELEVATION: options.elevation === undefined ? '6000' : options.elevation,
    ELEV_DEM: options.dem === undefined ? '6000' : options.dem,
    MNET_ID: options.net ?? '2',
    OBSERVATIONS: {
      air_temp_value_1: { value: options.temp === undefined ? 30 : options.temp, date_time: at },
      wind_speed_value_1: { value: 3, date_time: at },
    },
  };
}

function synopticRoute(stations: unknown[]): Route {
  return [
    'synopticdata.com',
    () =>
      jsonResponse({
        SUMMARY: { RESPONSE_CODE: 1, NUMBER_OF_OBJECTS: stations.length },
        STATION: stations,
      }),
  ];
}

/** Spot first, then each station without terrain data, in meters. */
function elevationRoute(meters: number[]): Route {
  return ['/v1/elevation', () => jsonResponse({ elevation: meters })];
}

const run = (routes: Route[], token: string | null = 'token') =>
  getNearestStation(SPOT, { fetchImpl: stubFetch(routes), token, now: () => NOW });

describe('getNearestStation', () => {
  it('uses NWS only when there is no Synoptic token', async () => {
    const fetchImpl = stubFetch([...nwsRoutes(), elevationRoute([6000 * FT])]);
    const result = await getNearestStation(SPOT, { fetchImpl, token: null, now: () => NOW });
    expect(result.status === 'ok' && result.observation.stationId).toBe('KTPH');
    expect(result.status === 'ok' && result.observation.kind).toBe('airport');
    expect(result.status === 'ok' && result.synopticUnavailable).toBe(false);
    expect(fetchImpl.calls.some((url) => url.includes('synopticdata'))).toBe(false);
  });

  it('chooses a closer Synoptic station over a far NWS one', async () => {
    const result = await run([
      synopticRoute([synopticStation('PANN2', 38.6)]),
      ...nwsRoutes(),
      elevationRoute([6000 * FT, 5423 * FT]),
    ]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.observation).toMatchObject({
      stationId: 'PANN2',
      source: 'synoptic',
      kind: 'raws',
      network: 'RAWS',
    });
    expect(result.spotElevationFt).toBeCloseTo(6000, 0);
  });

  it('corrects an elevation listed in meters before ranking', async () => {
    const result = await run([
      synopticRoute([
        synopticStation('STCN2', 38.55, { elevation: '1829', dem: null, net: '106' }),
      ]),
      ...nwsRoutes({ latest: () => jsonResponse({}, 404) }),
      elevationRoute([6000 * FT, 1829]),
    ]);
    expect(result.status === 'ok' && result.observation.elevationCheck?.kind).toBe('meters');
    expect(result.status === 'ok' && result.observation.elevationFt).toBeCloseTo(6000, -1);
  });

  it('prefers a station at a similar height and reports the closer one passed over', async () => {
    const result = await run([
      synopticRoute([
        synopticStation('VALLEY', 38.53, { elevation: '3500', dem: '3500' }),
        synopticStation('RIDGE', 38.65, { elevation: '6050', dem: '6050' }),
      ]),
      ...nwsRoutes({ latest: () => jsonResponse({}, 404) }),
      elevationRoute([6000 * FT]),
    ]);
    expect(result.status === 'ok' && result.observation.stationId).toBe('RIDGE');
    expect(result.status === 'ok' && result.observation.passedOverCloser).toBe(1);
  });

  it('skips stale and temperature-less stations and counts them', async () => {
    const result = await run([
      synopticRoute([
        synopticStation('OLD', 38.51, { minutes: 300 }),
        synopticStation('NOTEMP', 38.52, { temp: null }),
        synopticStation('GOOD', 38.6),
      ]),
      ...nwsRoutes({ latest: () => jsonResponse({}, 404) }),
      elevationRoute([6000 * FT]),
    ]);
    expect(result.status === 'ok' && result.observation.stationId).toBe('GOOD');
    expect(result.status === 'ok' && result.observation.skippedCloser).toBe(2);
  });

  it('falls back to NWS when Synoptic fails', async () => {
    const result = await run([
      ['synopticdata.com', () => jsonResponse({ SUMMARY: { RESPONSE_CODE: 2 } }, 401)],
      ...nwsRoutes(),
      elevationRoute([6000 * FT, 5423 * FT]),
    ]);
    expect(result.status === 'ok' && result.observation.stationId).toBe('KTPH');
    expect(result.status === 'ok' && result.synopticUnavailable).toBe(true);
  });

  it('uses Synoptic when NWS is down', async () => {
    const result = await run([
      synopticRoute([synopticStation('PANN2', 38.6)]),
      ['/points/', () => jsonResponse({}, 500)],
      elevationRoute([6000 * FT]),
    ]);
    expect(result.status === 'ok' && result.observation.stationId).toBe('PANN2');
  });

  it('still answers when the elevation lookup fails, ranking by distance', async () => {
    const result = await run([
      synopticRoute([
        synopticStation('VALLEY', 38.53, { elevation: '3500', dem: '3500' }),
        synopticStation('RIDGE', 38.65, { elevation: '6050', dem: '6050' }),
      ]),
      ...nwsRoutes({ latest: () => jsonResponse({}, 404) }),
    ]);
    expect(result.status === 'ok' && result.observation.stationId).toBe('VALLEY');
    expect(result.status === 'ok' && result.spotElevationFt).toBeNull();
  });

  it('throws when every source fails', async () => {
    await expect(
      run([
        ['synopticdata.com', () => jsonResponse({}, 500)],
        ['/points/', () => jsonResponse({}, 500)],
      ]),
    ).rejects.toMatchObject({ kind: 'http' });
  });

  it('reports outside coverage only when no source has stations', async () => {
    const result = await run([synopticRoute([]), ['/points/', () => jsonResponse({}, 404)]]);
    expect(result).toEqual({ status: 'outside-coverage' });
  });

  it('reports no recent data when stations exist but none is usable', async () => {
    const result = await run([
      synopticRoute([synopticStation('OLD', 38.51, { minutes: 300 })]),
      ...nwsRoutes({
        latest: () => jsonResponse({ properties: { timestamp: minutesAgo(400).toISOString() } }),
      }),
    ]);
    expect(result).toMatchObject({ status: 'no-recent-data', synopticUnavailable: false });
  });
});

describe('synopticCandidate', () => {
  it('ignores stations without a reading time', () => {
    expect(
      synopticCandidate({
        id: 'X',
        name: 'X',
        lat: 1,
        lon: 1,
        networkId: null,
        listedElevationFt: null,
        terrainElevationFt: null,
        distanceMi: 1,
        observedAt: null,
        conditions: {
          temperatureF: null,
          relativeHumidity: null,
          wind: { speedMph: null, gustMph: null, directionDeg: null },
        },
        qcNotes: [],
      }),
    ).toBeNull();
  });
});
