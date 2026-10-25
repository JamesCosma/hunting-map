import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyQuery,
  parseNominatim,
  parseOpenMeteoGeocoding,
  parseZippopotam,
  resetNominatimThrottle,
  searchPlaces,
} from '../src/services/geocoding';
import { jsonResponse, stubFetch } from './helpers';

beforeEach(() => {
  resetNominatimThrottle();
});

const TONOPAH_RESULTS = {
  results: [
    {
      id: 5513795,
      name: 'Tonopah',
      latitude: 38.06716,
      longitude: -117.23008,
      admin1: 'Nevada',
      admin2: 'Nye',
    },
    {
      id: 5284678,
      name: 'Tonopah',
      latitude: 33.49365,
      longitude: -112.93712,
      admin1: 'Arizona',
      admin2: 'Maricopa',
    },
  ],
};

describe('classifyQuery', () => {
  it.each([
    ['', { kind: 'empty' }],
    ['   ', { kind: 'empty' }],
    ['89031', { kind: 'zip', zip: '89031' }],
    ['89031-1234', { kind: 'zip', zip: '89031' }],
    ['Tonopah', { kind: 'name', name: 'Tonopah', stateName: null }],
    ['Tonopah, NV', { kind: 'name', name: 'Tonopah', stateName: 'Nevada' }],
    ['  Ely ,  nevada ', { kind: 'name', name: 'Ely', stateName: 'Nevada' }],
    ['Moab, Grand County', { kind: 'name', name: 'Moab, Grand County', stateName: null }],
    ['8903', { kind: 'name', name: '8903', stateName: null }],
  ])('classifies %j', (input, expected) => {
    expect(classifyQuery(input)).toEqual(expected);
  });
});

describe('parsers', () => {
  it('parses Zippopotam string coordinates', () => {
    const places = parseZippopotam(
      {
        places: [
          {
            'place name': 'North Las Vegas',
            latitude: '36.2589',
            longitude: '-115.1718',
            state: 'Nevada',
          },
        ],
      },
      '89031',
    );
    expect(places).toEqual([
      {
        id: 'zip-89031-0',
        name: 'North Las Vegas',
        region: 'Nevada 89031',
        lat: 36.2589,
        lon: -115.1718,
        source: 'zippopotam',
      },
    ]);
  });

  it('labels counties and filters by state', () => {
    const all = parseOpenMeteoGeocoding(TONOPAH_RESULTS, null);
    expect(all.map((p) => p.region)).toEqual(['Nye County, Nevada', 'Maricopa County, Arizona']);
    expect(parseOpenMeteoGeocoding(TONOPAH_RESULTS, 'Arizona').map((p) => p.lat)).toEqual([
      33.49365,
    ]);
  });

  it('handles a response with no results key', () => {
    expect(parseOpenMeteoGeocoding({ generationtime_ms: 0.2 }, null)).toEqual([]);
  });

  it('builds a readable region from Nominatim display names', () => {
    const [place] = parseNominatim([
      {
        place_id: 1,
        lat: '40.56',
        lon: '-115.47',
        name: 'Ruby Mountains',
        display_name: 'Ruby Mountains, Elko County, Nevada, United States',
      },
    ]);
    expect(place).toMatchObject({ name: 'Ruby Mountains', region: 'Elko County, Nevada' });
  });
});

describe('searchPlaces', () => {
  it('routes ZIP codes to Zippopotam', async () => {
    const fetchImpl = stubFetch([
      [
        'api.zippopotam.us/us/89031',
        () =>
          jsonResponse({
            places: [{ 'place name': 'North Las Vegas', latitude: '36.2', longitude: '-115.1' }],
          }),
      ],
    ]);
    const places = await searchPlaces('89031', { fetchImpl });
    expect(places).toHaveLength(1);
  });

  it('returns no results for an unknown ZIP instead of erroring', async () => {
    const fetchImpl = stubFetch([['api.zippopotam.us', () => jsonResponse({}, 404)]]);
    await expect(searchPlaces('00000', { fetchImpl })).resolves.toEqual([]);
  });

  it('uses Open-Meteo for names without touching Nominatim when it has matches', async () => {
    const fetchImpl = stubFetch([
      ['geocoding-api.open-meteo.com', () => jsonResponse(TONOPAH_RESULTS)],
    ]);
    const places = await searchPlaces('Tonopah, NV', { fetchImpl });
    expect(places.map((p) => p.region)).toEqual(['Nye County, Nevada']);
    expect(fetchImpl.calls.some((url) => url.includes('nominatim'))).toBe(false);
    expect(new URL(fetchImpl.calls[0] ?? '').searchParams.get('name')).toBe('Tonopah');
  });

  it('falls back to Nominatim when Open-Meteo finds nothing', async () => {
    const fetchImpl = stubFetch([
      ['geocoding-api.open-meteo.com', () => jsonResponse({})],
      [
        'nominatim.openstreetmap.org',
        () =>
          jsonResponse([
            {
              place_id: 7,
              lat: '40.56',
              lon: '-115.47',
              name: 'Ruby Mountains',
              display_name: 'Ruby Mountains, Elko County, Nevada, United States',
            },
          ]),
      ],
    ]);
    const places = await searchPlaces('Ruby Mountains', { fetchImpl });
    expect(places[0]?.source).toBe('nominatim');
    const nominatimUrl = new URL(fetchImpl.calls[1] ?? '');
    expect(nominatimUrl.searchParams.get('countrycodes')).toBe('us');
  });

  it('does nothing for empty input', async () => {
    const fetchImpl = stubFetch([]);
    await expect(searchPlaces('  ', { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
