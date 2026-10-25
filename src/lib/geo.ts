import type { LatLon } from '../types';

const EARTH_RADIUS_MI = 3958.7613;
const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points using the haversine formula. */
export function distanceMiles(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Normalizes any angle into the range [0, 360). */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Maps a bearing in degrees to the nearest of the 16 compass points. */
export function toCompassPoint(deg: number): CompassPoint {
  const index = Math.round(normalizeDegrees(deg) / 22.5) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index] ?? 'N';
}

/** True when the coordinates are finite and inside valid latitude/longitude ranges. */
export function isValidLatLon(point: LatLon): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

/** Wraps a longitude into [-180, 180), needed because Leaflet allows panning across the dateline. */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
