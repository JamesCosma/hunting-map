/**
 * Open-Meteo forecast client. Provides a model estimate of current conditions
 * for the exact chosen point, plus the point's elevation from a 90 m digital
 * elevation model. Works anywhere, so it also covers areas without NWS data.
 */
import { ENDPOINTS } from '../config';
import { buildUrl, fetchJson, type FetchJsonOptions } from '../lib/http';
import { asNumber, asRecord } from '../lib/json';
import { metersToFeet } from '../lib/units';
import type { LatLon, ModelEstimate } from '../types';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
].join(',');

export function buildForecastUrl({ lat, lon }: LatLon): string {
  return buildUrl(ENDPOINTS.openMeteoForecast, {
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT_FIELDS,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    // Unix time avoids parsing a local time string without an offset.
    timeformat: 'unixtime',
    timezone: 'GMT',
  });
}

export class InvalidModelResponseError extends Error {
  constructor() {
    super('Open-Meteo response did not include current conditions');
    this.name = 'InvalidModelResponseError';
  }
}

export function parseModelEstimate(json: unknown): ModelEstimate {
  const root = asRecord(json);
  const current = asRecord(root.current);
  const time = asNumber(current.time);
  if (time == null) throw new InvalidModelResponseError();

  return {
    elevationFt: metersToFeet(asNumber(root.elevation)),
    validAt: new Date(time * 1000),
    conditions: {
      temperatureF: asNumber(current.temperature_2m),
      relativeHumidity: asNumber(current.relative_humidity_2m),
      wind: {
        speedMph: asNumber(current.wind_speed_10m),
        gustMph: asNumber(current.wind_gusts_10m),
        directionDeg: asNumber(current.wind_direction_10m),
      },
    },
  };
}

export async function getModelEstimate(
  point: LatLon,
  options: Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> = {},
): Promise<ModelEstimate> {
  return parseModelEstimate(await fetchJson(buildForecastUrl(point), options));
}
