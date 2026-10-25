import { describe, expect, it } from 'vitest';
import {
  NOT_REPORTED,
  formatAge,
  formatCoordinates,
  formatDistance,
  formatElevation,
  formatHumidity,
  formatSpeed,
  formatTemperature,
  formatWindDirection,
  formatWindShort,
  formatZip,
} from '../src/lib/format';

describe('value formatting', () => {
  it('rounds and labels values', () => {
    expect(formatTemperature(67.6)).toBe('68°F');
    expect(formatHumidity(40.03)).toBe('40%');
    expect(formatSpeed(4.6)).toBe('5 mph');
    expect(formatElevation(6942.3)).toBe('6,942 ft');
  });

  it('shows a clear label for missing values', () => {
    expect(formatTemperature(null)).toBe(NOT_REPORTED);
    expect(formatHumidity(null)).toBe(NOT_REPORTED);
    expect(formatSpeed(null)).toBe(NOT_REPORTED);
    expect(formatElevation(null)).toBe(NOT_REPORTED);
  });

  it('keeps negative elevations (Death Valley)', () => {
    expect(formatElevation(-282)).toBe('-282 ft');
  });

  it('formats distances with sensible precision', () => {
    expect(formatDistance(0.04)).toBe('under 0.1 mi');
    expect(formatDistance(3.26)).toBe('3.3 mi');
    expect(formatDistance(42.7)).toBe('43 mi');
  });

  it('formats coordinates with hemispheres', () => {
    expect(formatCoordinates(36.24, -115.12)).toBe('36.2400° N, 115.1200° W');
  });
});

describe('formatWindDirection', () => {
  it('describes where the wind comes from', () => {
    expect(formatWindDirection(225, 8)).toBe('From SW (225°)');
  });

  it('says calm for near-zero wind even with a direction', () => {
    expect(formatWindDirection(90, 0)).toBe('Calm');
  });

  it('handles a missing direction', () => {
    expect(formatWindDirection(null, 5)).toBe('Direction not reported');
  });
});

describe('formatAge', () => {
  const now = new Date('2026-10-24T18:00:00Z');
  const ago = (minutes: number): Date => new Date(now.getTime() - minutes * 60_000);

  it.each([
    [0, 'just now'],
    [12, '12 min ago'],
    [60, '1 hr ago'],
    [125, '2 hr 5 min ago'],
    [60 * 24, '1 day ago'],
    [60 * 72, '3 days ago'],
  ])('%d minutes reads as "%s"', (minutes, text) => {
    expect(formatAge(ago(minutes), now)).toBe(text);
  });

  it('treats small clock skew into the future as just now', () => {
    expect(formatAge(new Date(now.getTime() + 30_000), now)).toBe('just now');
  });
});

describe('place and list formatting', () => {
  it('formats present and missing ZIP codes', () => {
    expect(formatZip('89018')).toBe('ZIP 89018');
    expect(formatZip(null)).toBe('No ZIP');
  });

  it('formats compact wind for list rows', () => {
    expect(formatWindShort(12.4, 225)).toBe('12 mph SW');
    expect(formatWindShort(12.4, null)).toBe('12 mph');
    expect(formatWindShort(0.4, 225)).toBe('Calm');
    expect(formatWindShort(null, 225)).toBe(NOT_REPORTED);
  });
});
