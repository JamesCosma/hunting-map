import { describe, expect, it } from 'vitest';
import { buildElevationUrl, getElevationsFt, parseElevations } from '../src/services/elevation';
import { jsonResponse, stubFetch } from './helpers';

describe('elevation service', () => {
  it('builds one URL for many points', () => {
    const url = new URL(
      buildElevationUrl([
        { lat: 38.5, lon: -116.5 },
        { lat: 38.20694, lon: -116.63278 },
      ]),
    );
    expect(url.searchParams.get('latitude')).toBe('38.5000,38.2069');
    expect(url.searchParams.get('longitude')).toBe('-116.5000,-116.6328');
  });

  it('converts meters to feet, keeping one entry per point', () => {
    const feet = parseElevations({ elevation: [1762, null] }, 3);
    expect(feet[0]).toBeCloseTo(5780.8, 1);
    expect(feet.slice(1)).toEqual([null, null]);
  });

  it('fetches elevations and skips the request for no points', async () => {
    const fetchImpl = stubFetch([['/elevation', () => jsonResponse({ elevation: [0, 304.8] })]]);
    expect(await getElevationsFt([], { fetchImpl })).toEqual([]);
    const feet = await getElevationsFt(
      [
        { lat: 1, lon: 1 },
        { lat: 2, lon: 2 },
      ],
      { fetchImpl },
    );
    expect(feet[0]).toBe(0);
    expect(feet[1]).toBeCloseTo(1000, 6);
    expect(fetchImpl.calls).toHaveLength(1);
  });
});
