/**
 * Reverse geocoding: turns a point into "Near Indian Springs, Clark County, NV"
 * and its ZIP code, using OpenStreetMap Nominatim.
 *
 * Zoom 18 (address level) is requested because only address-level results
 * carry a postcode. In remote areas Nominatim returns just the county, which
 * is reported as-is with no ZIP. Results are cached for the session per
 * ~100 m cell, and all requests share Nominatim's one-per-second limit.
 */
import { ENDPOINTS, REVERSE_GEOCODE_CACHE_SIZE } from '../config';
import { asRecord, asString } from '../lib/json';
import { LruCache } from '../lib/lruCache';
import type { LatLon, PlaceSummary } from '../types';
import { requestNominatim, type NominatimRequestOptions } from './nominatim';

/** Address keys for populated places, most specific useful level first. */
const LOCALITY_KEYS = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb'] as const;

const US_ZIP = /^(\d{5})(?:$|[-\s;,])/;
const ISO_SUBDIVISION = /^[A-Z]{2}-([A-Z0-9]{1,3})$/;

/** Reads a Nominatim reverse response. Points with no address at all yield an empty summary. */
export function parseReverseGeocode(json: unknown): PlaceSummary {
  const address = asRecord(asRecord(json).address);
  const read = (key: string): string | null => asString(address[key])?.trim() || null;

  const isUs = read('country_code') === 'us';
  const locality = LOCALITY_KEYS.map(read).find((value) => value != null) ?? null;
  const county = read('county');
  const subdivision = ISO_SUBDIVISION.exec(read('ISO3166-2-lvl4') ?? '')?.[1] ?? null;
  const state = isUs ? (subdivision ?? read('state')) : read('state');
  const country = isUs ? null : read('country');

  const area = [county, state, country].filter((part) => part != null);
  let label: string | null;
  if (locality != null) label = `Near ${[locality, ...area].join(', ')}`;
  else label = area.length > 0 ? area.join(', ') : null;

  const zip = isUs ? (US_ZIP.exec(read('postcode') ?? '')?.[1] ?? null) : null;
  return { label, zip };
}

const cache = new LruCache<string, PlaceSummary>(REVERSE_GEOCODE_CACHE_SIZE);

/** Three decimal places is about 110 m, well inside any ZIP or town boundary error. */
const cacheKey = ({ lat, lon }: LatLon): string => `${lat.toFixed(3)},${lon.toFixed(3)}`;

/** Returns a cached summary without touching the network, or undefined. */
export function getCachedPlace(point: LatLon): PlaceSummary | undefined {
  return cache.get(cacheKey(point));
}

/** Looks up the place name and ZIP code for a point. Rejects with a `RequestError`. */
export async function reverseGeocode(
  point: LatLon,
  options: NominatimRequestOptions = {},
): Promise<PlaceSummary> {
  const cached = getCachedPlace(point);
  if (cached != null) return cached;
  const json = await requestNominatim(
    ENDPOINTS.nominatimReverse,
    {
      lat: point.lat.toFixed(5),
      lon: point.lon.toFixed(5),
      format: 'jsonv2',
      zoom: 18,
      addressdetails: 1,
      'accept-language': 'en',
    },
    options,
  );
  const summary = parseReverseGeocode(json);
  cache.set(cacheKey(point), summary);
  return summary;
}

/** Test hook: empties the session cache. */
export function clearReverseGeocodeCache(): void {
  cache.clear();
}
