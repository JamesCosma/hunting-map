import { describe, expect, it } from 'vitest';
import {
  InvalidModelResponseError,
  buildBatchForecastUrl,
  buildForecastUrl,
  getModelEstimate,
  getModelEstimates,
  parseModelEstimate,
  parseModelEstimates,
} from '../src/services/openMeteo';
import { jsonResponse, stubFetch } from './helpers';

const SAMPLE = {
  latitude: 38.506668,
  longitude: -116.993034,
  elevation: 2116.0,
  current: {
    time: 1792888200,
    interval: 900,
    temperature_2m: 49.9,
    relative_humidity_2m: 49,
    wind_speed_10m: 2.6,
    wind_direction_10m: 63,
    wind_gusts_10m: 6.7,
  },
};

describe('Open-Meteo', () => {
  it('requests imperial units and unix time for the exact point', () => {
    const url = new URL(buildForecastUrl({ lat: 38.5, lon: -117 }));
    expect(url.searchParams.get('latitude')).toBe('38.5000');
    expect(url.searchParams.get('longitude')).toBe('-117.0000');
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('current')).toContain('wind_direction_10m');
  });

  it('parses current conditions and converts elevation to feet', () => {
    const estimate = parseModelEstimate(SAMPLE);
    expect(estimate.elevationFt).toBeCloseTo(6942, 0);
    expect(estimate.validAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(estimate.conditions).toEqual({
      temperatureF: 49.9,
      relativeHumidity: 49,
      wind: { speedMph: 2.6, gustMph: 6.7, directionDeg: 63 },
    });
  });

  it('tolerates missing individual fields', () => {
    const estimate = parseModelEstimate({ current: { time: 1792888200 } });
    expect(estimate.elevationFt).toBeNull();
    expect(estimate.conditions.temperatureF).toBeNull();
  });

  it('rejects a response without current data', () => {
    expect(() => parseModelEstimate({ error: true, reason: 'bad' })).toThrow(
      InvalidModelResponseError,
    );
  });

  it('fetches and parses end to end', async () => {
    const fetchImpl = stubFetch([['api.open-meteo.com', () => jsonResponse(SAMPLE)]]);
    const estimate = await getModelEstimate({ lat: 38.5, lon: -117 }, { fetchImpl });
    expect(estimate.conditions.temperatureF).toBe(49.9);
  });
});

describe('Open-Meteo batch', () => {
  const second = {
    ...SAMPLE,
    location_id: 1,
    current: { ...SAMPLE.current, temperature_2m: 30.2 },
  };
  const third = { ...SAMPLE, location_id: 2, current: { ...SAMPLE.current, temperature_2m: 70.1 } };

  it('sends every point as comma separated coordinate lists', () => {
    const url = new URL(
      buildBatchForecastUrl([
        { lat: 36.2, lon: -115.12 },
        { lat: 38.5, lon: -116.5 },
      ]),
    );
    expect(url.searchParams.get('latitude')).toBe('36.2000,38.5000');
    expect(url.searchParams.get('longitude')).toBe('-115.1200,-116.5000');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
  });

  it('maps entries back to input order using location_id', () => {
    const estimates = parseModelEstimates([SAMPLE, third, second], 3);
    expect(estimates.map((e) => e?.conditions.temperatureF)).toEqual([49.9, 30.2, 70.1]);
  });

  it('accepts the single object returned for one point', () => {
    expect(parseModelEstimates(SAMPLE, 1)[0]?.conditions.temperatureF).toBe(49.9);
  });

  it('marks missing or malformed entries as null without failing the batch', () => {
    const broken = { location_id: 1, current: {} };
    const estimates = parseModelEstimates([SAMPLE, broken], 3);
    expect(estimates[0]).not.toBeNull();
    expect(estimates[1]).toBeNull();
    expect(estimates[2]).toBeNull();
    expect(parseModelEstimates({ error: true }, 2)).toEqual([null, null]);
  });

  it('ignores out of range location ids', () => {
    expect(parseModelEstimates([{ ...SAMPLE, location_id: 9 }], 1)).toEqual([null]);
  });

  it('fetches all points in one request and skips the network for none', async () => {
    const fetchImpl = stubFetch([['api.open-meteo.com', () => jsonResponse([SAMPLE, second])]]);
    const estimates = await getModelEstimates(
      [
        { lat: 38.5, lon: -117 },
        { lat: 36.2, lon: -115.12 },
      ],
      { fetchImpl },
    );
    expect(estimates).toHaveLength(2);
    expect(fetchImpl.calls).toHaveLength(1);
    await expect(getModelEstimates([], { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
