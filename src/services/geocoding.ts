/**
 * Place search. US ZIP codes go to Zippopotam.us; names go to the Open-Meteo
 * geocoder (GeoNames data, includes towns, peaks and ranges). If Open-Meteo
 * has no match we fall back to OpenStreetMap Nominatim, which knows many
 * named areas GeoNames lacks. Nominatim is only called on an explicit submit,
 * at most once per second, as its usage policy requires.
 */
import { ENDPOINTS, SEARCH_RESULT_LIMIT } from '../config';
import { buildUrl, fetchJson, RequestError, type FetchJsonOptions } from '../lib/http';
import { asArray, asNumber, asRecord, asString } from '../lib/json';
import { resolveStateName } from '../lib/usStates';
import type { PlaceResult } from '../types';

type RequestOptions = Pick<FetchJsonOptions, 'signal' | 'fetchImpl'>;

export type SearchQuery =
  | { kind: 'empty' }
  | { kind: 'zip'; zip: string }
  | { kind: 'name'; name: string; stateName: string | null };

const ZIP_PATTERN = /^(\d{5})(?:-\d{4})?$/;

/**
 * Classifies user input. "89031" and "89031-1234" are ZIP codes. "Tonopah, NV"
 * is split into a name plus a state filter because the Open-Meteo geocoder
 * matches on the place name only.
 */
export function classifyQuery(input: string): SearchQuery {
  const text = input.trim().replace(/\s+/g, ' ');
  if (text === '') return { kind: 'empty' };

  const zip = ZIP_PATTERN.exec(text);
  if (zip?.[1] != null) return { kind: 'zip', zip: zip[1] };

  const commaIndex = text.lastIndexOf(',');
  if (commaIndex > 0) {
    const stateName = resolveStateName(text.slice(commaIndex + 1));
    if (stateName != null) {
      return { kind: 'name', name: text.slice(0, commaIndex).trim(), stateName };
    }
  }
  return { kind: 'name', name: text, stateName: null };
}

export function parseZippopotam(json: unknown, zip: string): PlaceResult[] {
  return asArray(asRecord(json).places).flatMap((raw, index): PlaceResult[] => {
    const place = asRecord(raw);
    const lat = asNumber(place.latitude);
    const lon = asNumber(place.longitude);
    const name = asString(place['place name']);
    if (lat == null || lon == null || name == null) return [];
    const state = asString(place.state) ?? '';
    return [
      {
        id: `zip-${zip}-${index}`,
        name,
        region: [state, zip].filter(Boolean).join(' '),
        lat,
        lon,
        source: 'zippopotam',
      },
    ];
  });
}

const ADMIN2_SUFFIXES = /\b(County|Parish|Borough|Census Area|Municipality|City)$/i;

function describeAdmin2(admin2: string | null, admin1: string | null): string | null {
  if (admin2 == null) return null;
  if (ADMIN2_SUFFIXES.test(admin2)) return admin2;
  if (admin1 === 'Louisiana') return `${admin2} Parish`;
  if (admin1 === 'Alaska') return admin2;
  return `${admin2} County`;
}

export function parseOpenMeteoGeocoding(json: unknown, stateName: string | null): PlaceResult[] {
  return asArray(asRecord(json).results)
    .flatMap((raw): PlaceResult[] => {
      const result = asRecord(raw);
      const lat = asNumber(result.latitude);
      const lon = asNumber(result.longitude);
      const name = asString(result.name);
      const id = asNumber(result.id);
      const admin1 = asString(result.admin1);
      if (lat == null || lon == null || name == null || id == null) return [];
      if (stateName != null && admin1 !== stateName) return [];
      return [
        {
          id: `om-${id}`,
          name,
          region: [describeAdmin2(asString(result.admin2), admin1), admin1]
            .filter(Boolean)
            .join(', '),
          lat,
          lon,
          source: 'open-meteo',
        },
      ];
    })
    .slice(0, SEARCH_RESULT_LIMIT);
}

export function parseNominatim(json: unknown): PlaceResult[] {
  return asArray(json).flatMap((raw): PlaceResult[] => {
    const result = asRecord(raw);
    const lat = asNumber(result.lat);
    const lon = asNumber(result.lon);
    const displayName = asString(result.display_name);
    const placeId = asNumber(result.place_id);
    if (lat == null || lon == null || displayName == null || placeId == null) return [];
    const parts = displayName.split(',').map((part) => part.trim());
    const name = asString(result.name) ?? parts[0] ?? displayName;
    const region = parts.filter((part) => part !== name && part !== 'United States').join(', ');
    return [{ id: `osm-${placeId}`, name, region, lat, lon, source: 'nominatim' }];
  });
}

const NOMINATIM_MIN_INTERVAL_MS = 1000;
let lastNominatimRequest = 0;

async function searchNominatim(text: string, options: RequestOptions): Promise<PlaceResult[]> {
  const wait = lastNominatimRequest + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimRequest = Date.now();
  const url = buildUrl(ENDPOINTS.nominatimSearch, {
    q: text,
    countrycodes: 'us',
    format: 'jsonv2',
    limit: SEARCH_RESULT_LIMIT,
  });
  return parseNominatim(await fetchJson(url, { ...options, retries: 0 }));
}

/** Searches for places in the US. Resolves to an empty array when nothing matches. */
export async function searchPlaces(
  input: string,
  options: RequestOptions = {},
): Promise<PlaceResult[]> {
  const query = classifyQuery(input);
  switch (query.kind) {
    case 'empty':
      return [];
    case 'zip':
      try {
        return parseZippopotam(
          await fetchJson(`${ENDPOINTS.zippopotam}/${query.zip}`, options),
          query.zip,
        );
      } catch (error) {
        // Zippopotam answers 404 for ZIP codes it does not know.
        if (error instanceof RequestError && error.status === 404) return [];
        throw error;
      }
    case 'name': {
      const url = buildUrl(ENDPOINTS.openMeteoGeocoding, {
        name: query.name,
        // Ask for more when filtering by state so the filter does not empty the list.
        count: query.stateName == null ? SEARCH_RESULT_LIMIT : 50,
        countryCode: 'US',
        language: 'en',
        format: 'json',
      });
      const results = parseOpenMeteoGeocoding(await fetchJson(url, options), query.stateName);
      if (results.length > 0) return results;
      const fallbackText =
        query.stateName == null ? query.name : `${query.name}, ${query.stateName}`;
      return searchNominatim(fallbackText, options);
    }
  }
}

/** Test hook: resets the Nominatim rate limiter. */
export function resetNominatimThrottle(): void {
  lastNominatimRequest = 0;
}
