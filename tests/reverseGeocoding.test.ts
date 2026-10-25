import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatZip } from '../src/lib/format';
import { RequestError } from '../src/lib/http';
import { searchPlaces } from '../src/services/geocoding';
import { resetNominatimThrottle } from '../src/services/nominatim';
import {
  clearReverseGeocodeCache,
  getCachedPlace,
  parseReverseGeocode,
  reverseGeocode,
} from '../src/services/reverseGeocoding';
import { jsonResponse, stubFetch } from './helpers';

beforeEach(() => {
  resetNominatimThrottle();
  clearReverseGeocodeCache();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Trimmed from a live response for 36.5866, -115.6683. */
const INDIAN_SPRINGS = {
  place_id: 1,
  addresstype: 'aeroway',
  address: {
    aeroway: 'Creech Air Force Base',
    road: '1st Street',
    village: 'Indian Springs',
    county: 'Clark County',
    state: 'Nevada',
    'ISO3166-2-lvl4': 'US-NV',
    postcode: '89018',
    country: 'United States',
    country_code: 'us',
  },
};

/** Trimmed from a live response for 38.5, -116.5 (central Nevada, no town or ZIP). */
const NYE_COUNTY = {
  place_id: 2,
  addresstype: 'county',
  address: {
    county: 'Nye County',
    state: 'Nevada',
    'ISO3166-2-lvl4': 'US-NV',
    country: 'United States',
    country_code: 'us',
  },
};

describe('parseReverseGeocode', () => {
  it('names the nearest town with county and state abbreviation, plus the ZIP', () => {
    expect(parseReverseGeocode(INDIAN_SPRINGS)).toEqual({
      label: 'Near Indian Springs, Clark County, NV',
      zip: '89018',
    });
  });

  it('prefers the city over a neighborhood', () => {
    const summary = parseReverseGeocode({
      address: {
        suburb: 'Downtown North Las Vegas',
        city: 'North Las Vegas',
        county: 'Clark County',
        'ISO3166-2-lvl4': 'US-NV',
        postcode: '89030',
        country_code: 'us',
      },
    });
    expect(summary.label).toBe('Near North Las Vegas, Clark County, NV');
  });

  it('falls back to county and state with no ZIP in remote areas', () => {
    expect(parseReverseGeocode(NYE_COUNTY)).toEqual({ label: 'Nye County, NV', zip: null });
  });

  it('uses the state name when no ISO code is present', () => {
    const summary = parseReverseGeocode({
      address: { hamlet: 'Ruby Valley', state: 'Nevada', country_code: 'us' },
    });
    expect(summary.label).toBe('Near Ruby Valley, Nevada');
  });

  it('keeps only the five digit ZIP from ZIP+4 or lists', () => {
    const zipOf = (postcode: string): string | null =>
      parseReverseGeocode({ address: { postcode, country_code: 'us' } }).zip;
    expect(zipOf('89018-1234')).toBe('89018');
    expect(zipOf('89018;89019')).toBe('89018');
    expect(zipOf('8901')).toBeNull();
    expect(zipOf('ABCDE')).toBeNull();
  });

  it('does not report foreign postal codes as ZIP codes', () => {
    const summary = parseReverseGeocode({
      address: {
        town: 'Osoyoos',
        state: 'British Columbia',
        postcode: 'V0H 1V0',
        country: 'Canada',
        country_code: 'ca',
      },
    });
    expect(summary).toEqual({ label: 'Near Osoyoos, British Columbia, Canada', zip: null });
  });

  it('returns an empty summary for unmatched points such as open ocean', () => {
    expect(parseReverseGeocode({ error: 'Unable to geocode' })).toEqual({ label: null, zip: null });
    expect(parseReverseGeocode(null)).toEqual({ label: null, zip: null });
  });
});

describe('formatZip', () => {
  it('formats present and missing ZIP codes', () => {
    expect(formatZip('89018')).toBe('ZIP 89018');
    expect(formatZip(null)).toBe('No ZIP');
  });
});

describe('reverseGeocode', () => {
  it('requests an address level lookup in English and parses it', async () => {
    const fetchImpl = stubFetch([
      ['nominatim.openstreetmap.org/reverse', () => jsonResponse(INDIAN_SPRINGS)],
    ]);
    const summary = await reverseGeocode({ lat: 36.58661, lon: -115.66834 }, { fetchImpl });
    expect(summary.zip).toBe('89018');
    const url = new URL(fetchImpl.calls[0] ?? '');
    expect(url.searchParams.get('zoom')).toBe('18');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('accept-language')).toBe('en');
    expect(url.searchParams.get('lat')).toBe('36.58661');
  });

  it('serves nearby points (same ~100 m cell) from the cache', async () => {
    const fetchImpl = stubFetch([['nominatim', () => jsonResponse(NYE_COUNTY)]]);
    await reverseGeocode({ lat: 38.5001, lon: -116.5001 }, { fetchImpl });
    await reverseGeocode({ lat: 38.5002, lon: -116.5003 }, { fetchImpl });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(getCachedPlace({ lat: 38.5, lon: -116.5 })?.label).toBe('Nye County, NV');
    expect(getCachedPlace({ lat: 39, lon: -116.5 })).toBeUndefined();
  });

  it('does not cache failures and does not retry them', async () => {
    const failing = stubFetch([['nominatim', () => jsonResponse({}, 503)]]);
    await expect(
      reverseGeocode({ lat: 38.5, lon: -116.5 }, { fetchImpl: failing }),
    ).rejects.toBeInstanceOf(RequestError);
    expect(failing.calls).toHaveLength(1);
    expect(getCachedPlace({ lat: 38.5, lon: -116.5 })).toBeUndefined();
  });

  it('shares the one request per second limit with place search', async () => {
    vi.useFakeTimers();
    const fetchImpl = stubFetch([
      ['geocoding-api.open-meteo.com', () => jsonResponse({})],
      ['nominatim.openstreetmap.org/search', () => jsonResponse([])],
      ['nominatim.openstreetmap.org/reverse', () => jsonResponse(NYE_COUNTY)],
    ]);
    const search = searchPlaces('Nowhere Flat', { fetchImpl });
    await vi.advanceTimersByTimeAsync(0);
    const reverse = reverseGeocode({ lat: 38.5, lon: -116.5 }, { fetchImpl });
    await vi.advanceTimersByTimeAsync(900);
    expect(fetchImpl.calls.filter((url) => url.includes('/reverse'))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([search, reverse]);
    expect(fetchImpl.calls.filter((url) => url.includes('/reverse'))).toHaveLength(1);
  });
});
