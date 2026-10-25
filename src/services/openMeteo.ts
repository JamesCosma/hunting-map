/**
 * Open-Meteo forecast client. Provides a model estimate of current conditions
 * for the exact chosen point, plus the point's elevation from a 90 m digital
 * elevation model. Works anywhere, so it also covers areas without NWS data.
 */
import { ENDPOINTS } from '../config';
import { buildUrl, fetchJson, type FetchJsonOptions } from '../lib/http';
import { asArray, asNumber, asRecord } from '../lib/json';
import { metersToFeet } from '../lib/units';
import type { LatLon, ModelEstimate } from '../types';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
].join(',');

/**
 * Builds a forecast URL for one or more points. Open-Meteo accepts
 * comma-separated coordinate lists and answers with one entry per point,
 * which lets the favorites list load with a single request.
 */
function forecastUrl(points: readonly LatLon[]): string {
  return buildUrl(ENDPOINTS.openMeteoForecast, {
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    current: CURRENT_FIELDS,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    // Unix time avoids parsing a local time string without an offset.
    timeformat: 'unixtime',
    timezone: 'GMT',
  });
}

export function buildForecastUrl(point: LatLon): string {
  return forecastUrl([point]);
}

export function buildBatchForecastUrl(points: readonly LatLon[]): string {
  return forecastUrl(points);
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

/**
 * Parses a multi-point response into estimates in input order. A point whose
 * entry is missing or malformed gets null, so one bad row never hides the rest.
 */
export function parseModelEstimates(json: unknown, count: number): (ModelEstimate | null)[] {
  // A single point comes back as an object rather than a one-element array.
  const entries = Array.isArray(json) ? asArray(json) : [json];
  const estimates: (ModelEstimate | null)[] = Array.from({ length: count }, () => null);
  entries.forEach((entry, position) => {
    // Entries after the first carry `location_id`, their index in the request.
    const index = asNumber(asRecord(entry).location_id) ?? position;
    if (!Number.isInteger(index) || index < 0 || index >= count) return;
    try {
      estimates[index] = parseModelEstimate(entry);
    } catch (error) {
      if (!(error instanceof InvalidModelResponseError)) throw error;
    }
  });
  return estimates;
}

/** Model estimates for several points in one request. Resolves to [] for no points. */
export async function getModelEstimates(
  points: readonly LatLon[],
  options: Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> = {},
): Promise<(ModelEstimate | null)[]> {
  if (points.length === 0) return [];
  const json = await fetchJson(buildBatchForecastUrl(points), options);
  return parseModelEstimates(json, points.length);
}
