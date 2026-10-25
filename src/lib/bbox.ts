/**
 * Bounding box helpers for the stations layer. Requests cover a padded view
 * snapped to a fixed grid, so small pans reuse the previous response and
 * repeated views produce identical (cacheable) URLs.
 */
import type { Bounds } from '../types';

/** Grows a box by `fraction` of its size on every side. */
export function padBounds(bounds: Bounds, fraction: number): Bounds {
  const dLat = (bounds.north - bounds.south) * fraction;
  const dLon = (bounds.east - bounds.west) * fraction;
  return {
    south: bounds.south - dLat,
    west: bounds.west - dLon,
    north: bounds.north + dLat,
    east: bounds.east + dLon,
  };
}

/** Expands a box outward to multiples of `step` degrees, clamped to valid coordinates. */
export function snapBounds(bounds: Bounds, step: number): Bounds {
  const down = (value: number): number => Math.floor(value / step) * step;
  const up = (value: number): number => Math.ceil(value / step) * step;
  return {
    south: Math.max(-90, down(bounds.south)),
    west: Math.max(-180, down(bounds.west)),
    north: Math.min(90, up(bounds.north)),
    east: Math.min(180, up(bounds.east)),
  };
}

export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

/** Area in square degrees, used to cap request size. */
export function boundsArea(bounds: Bounds): number {
  return Math.max(0, bounds.north - bounds.south) * Math.max(0, bounds.east - bounds.west);
}

export function containsPoint(bounds: Bounds, point: { lat: number; lon: number }): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lon >= bounds.west &&
    point.lon <= bounds.east
  );
}
