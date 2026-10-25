/**
 * Open-Meteo elevation client: terrain height from a 90 m digital elevation
 * model for up to 100 points in one request. Used to check listed station
 * elevations and to compare each station's height with the chosen spot.
 */
import { ENDPOINTS } from '../config';
import { buildUrl, fetchJson, type FetchJsonOptions } from '../lib/http';
import { asArray, asNumber, asRecord } from '../lib/json';
import { metersToFeet } from '../lib/units';
import type { LatLon } from '../types';

/** Open-Meteo's documented maximum number of coordinates per request. */
export const MAX_ELEVATION_POINTS = 100;

export function buildElevationUrl(points: readonly LatLon[]): string {
  return buildUrl(ENDPOINTS.openMeteoElevation, {
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
  });
}

/** Parses `{ elevation: [meters, ...] }` into feet, one entry per requested point. */
export function parseElevations(json: unknown, count: number): (number | null)[] {
  const values = asArray(asRecord(json).elevation);
  return Array.from({ length: count }, (_, index) => metersToFeet(asNumber(values[index])));
}

/** Terrain elevation in feet for each point (null where unknown). */
export async function getElevationsFt(
  points: readonly LatLon[],
  options: Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> = {},
): Promise<(number | null)[]> {
  const limited = points.slice(0, MAX_ELEVATION_POINTS);
  if (limited.length === 0) return [];
  const json = await fetchJson(buildElevationUrl(limited), options);
  const feet = parseElevations(json, limited.length);
  return points.map((_, index) => feet[index] ?? null);
}
