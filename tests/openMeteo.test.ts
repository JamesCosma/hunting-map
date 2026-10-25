import { describe, expect, it } from 'vitest';
import {
  InvalidModelResponseError,
  buildForecastUrl,
  getModelEstimate,
  parseModelEstimate,
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
