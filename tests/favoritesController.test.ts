import { describe, expect, it } from 'vitest';
import { suggestName } from '../src/favoritesController';
import { DROPPED_PIN_LABEL } from '../src/ui/locationView';

describe('suggestName', () => {
  const pin = { lat: 38.5, lon: -116.5, label: DROPPED_PIN_LABEL };

  it('uses the place name for a dropped pin', () => {
    expect(suggestName(pin, 'Nye County, NV')).toBe('Nye County, NV');
  });

  it('falls back to coordinates while the place is unknown', () => {
    expect(suggestName(pin, null)).toBe('Spot at 38.5000° N, 116.5000° W');
  });

  it('keeps the name of a searched place', () => {
    expect(
      suggestName({ lat: 38.07, lon: -117.23, label: 'Tonopah, Nevada' }, 'Near Tonopah'),
    ).toBe('Tonopah, Nevada');
  });
});
