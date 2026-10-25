import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheit,
  kmhToMph,
  metersToFeet,
  msToMph,
  wmoToImperial,
} from '../src/lib/units';

describe('unit conversions', () => {
  it('converts temperature', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
    expect(celsiusToFahrenheit(20)).toBeCloseTo(68);
  });

  it('converts speed and length', () => {
    expect(kmhToMph(16.09344)).toBeCloseTo(10);
    expect(msToMph(10)).toBeCloseTo(22.369, 3);
    expect(metersToFeet(1000)).toBeCloseTo(3280.84, 2);
  });

  it('passes null through instead of turning it into zero', () => {
    expect(celsiusToFahrenheit(null)).toBeNull();
    expect(kmhToMph(null)).toBeNull();
    expect(metersToFeet(null)).toBeNull();
  });
});

describe('wmoToImperial', () => {
  it('handles NWS unit codes', () => {
    expect(wmoToImperial(20, 'wmoUnit:degC')).toBeCloseTo(68);
    expect(wmoToImperial(7.416, 'wmoUnit:km_h-1')).toBeCloseTo(4.608, 3);
    expect(wmoToImperial(5, 'wmoUnit:m_s-1')).toBeCloseTo(11.18, 2);
    expect(wmoToImperial(10, 'wmoUnit:kt')).toBeCloseTo(11.51, 2);
    expect(wmoToImperial(671, 'wmoUnit:m')).toBeCloseTo(2201.4, 1);
    expect(wmoToImperial(40, 'wmoUnit:percent')).toBe(40);
    expect(wmoToImperial(330, 'wmoUnit:degree_(angle)')).toBe(330);
  });

  it('refuses to guess for unknown units', () => {
    expect(wmoToImperial(1, 'wmoUnit:furlong')).toBeNull();
    expect(wmoToImperial(null, 'wmoUnit:degC')).toBeNull();
  });
});
