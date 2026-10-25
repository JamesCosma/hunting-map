/**
 * Unit conversion helpers. All functions pass `null` through so callers can
 * keep "not reported" values distinct from zero.
 */

export const celsiusToFahrenheit = (c: number | null): number | null =>
  c == null ? null : (c * 9) / 5 + 32;

export const kmhToMph = (kmh: number | null): number | null =>
  kmh == null ? null : kmh / 1.609344;

export const msToMph = (ms: number | null): number | null =>
  ms == null ? null : ms * 2.2369362920544;

export const knotsToMph = (kt: number | null): number | null =>
  kt == null ? null : kt * 1.150779448;

export const metersToFeet = (m: number | null): number | null => (m == null ? null : m / 0.3048);

/**
 * Converts a WMO coded quantity, as returned by api.weather.gov, to the
 * imperial unit used in the UI. Returns `null` for unknown units rather than
 * guessing, so a surprising payload never renders a wrong number.
 */
export function wmoToImperial(value: number | null, unitCode: string): number | null {
  if (value == null) return null;
  const unit = unitCode.replace(/^wmoUnit:/, '');
  switch (unit) {
    case 'degC':
      return celsiusToFahrenheit(value);
    case 'degF':
      return value;
    case 'km_h-1':
      return kmhToMph(value);
    case 'm_s-1':
      return msToMph(value);
    case 'kt':
      return knotsToMph(value);
    case 'm':
      return metersToFeet(value);
    case 'percent':
    case 'degree_(angle)':
      return value;
    default:
      return null;
  }
}
