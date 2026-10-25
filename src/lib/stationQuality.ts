/**
 * Data quality checks for station readings. Weather networks vary widely in
 * how well they are maintained, so readings are checked for physically
 * implausible values, and listed station elevations are compared with a
 * terrain model before they are trusted.
 */
import type { Conditions, ElevationCheck } from '../types';
import { metersToFeet } from './units';

/** Plausible ranges for surface readings in the US. Values outside are sensor faults. */
const LIMITS = {
  temperatureF: { min: -80, max: 135 },
  relativeHumidity: { min: 0, max: 100 },
  speedMph: { min: 0, max: 150 },
  gustMph: { min: 0, max: 200 },
  directionDeg: { min: 0, max: 360 },
} as const;

/** Humidity sensors often read slightly above 100% when saturated; treat that as 100%. */
const HUMIDITY_OVERSHOOT = 5;

export interface SanitizedConditions {
  conditions: Conditions;
  /** Plain-language notes about readings that were dropped. */
  notes: string[];
}

function inRange(value: number | null, limit: { min: number; max: number }): boolean {
  return value == null || (value >= limit.min && value <= limit.max);
}

/** Drops implausible readings so they show as "Not reported" instead of a wrong number. */
export function sanitizeConditions(conditions: Conditions): SanitizedConditions {
  const notes: string[] = [];
  const keep = (
    value: number | null,
    limit: { min: number; max: number },
    label: string,
  ): number | null => {
    if (inRange(value, limit)) return value;
    notes.push(`Ignored an implausible ${label} reading.`);
    return null;
  };

  let humidity = conditions.relativeHumidity;
  if (humidity != null && humidity > 100 && humidity <= 100 + HUMIDITY_OVERSHOOT) humidity = 100;

  const speed = keep(conditions.wind.speedMph, LIMITS.speedMph, 'wind speed');
  let gust = keep(conditions.wind.gustMph, LIMITS.gustMph, 'wind gust');
  // A gust lower than the sustained speed is a reporting error; drop the gust only.
  if (gust != null && speed != null && gust < speed - 1) gust = null;

  return {
    conditions: {
      temperatureF: keep(conditions.temperatureF, LIMITS.temperatureF, 'temperature'),
      relativeHumidity: keep(humidity, LIMITS.relativeHumidity, 'humidity'),
      wind: {
        speedMph: speed,
        gustMph: gust,
        directionDeg: keep(conditions.wind.directionDeg, LIMITS.directionDeg, 'wind direction'),
      },
    },
    notes,
  };
}

/** Listed and terrain elevations this close are considered to agree. */
export function elevationTolerance(terrainFt: number): number {
  return Math.max(250, Math.abs(terrainFt) * 0.08);
}

export interface CheckedElevation {
  elevationFt: number | null;
  check: ElevationCheck | null;
}

/**
 * Compares a station's listed elevation with the terrain model at its
 * coordinates. A listing that only agrees with terrain when read as meters is
 * converted (a common metadata mistake); any other disagreement falls back to
 * terrain, because a 90 m terrain model is rarely off by more than a few
 * hundred feet while a wrong listing can be off by thousands.
 */
export function checkElevation(
  listedFt: number | null,
  terrainFt: number | null,
): CheckedElevation {
  if (terrainFt == null) return { elevationFt: listedFt, check: null };
  if (listedFt == null) {
    return { elevationFt: terrainFt, check: { kind: 'terrain', listedFt: null, terrainFt } };
  }
  const tolerance = elevationTolerance(terrainFt);
  if (Math.abs(listedFt - terrainFt) <= tolerance) return { elevationFt: listedFt, check: null };

  const asMeters = metersToFeet(listedFt) ?? listedFt;
  if (Math.abs(asMeters - terrainFt) <= tolerance) {
    return { elevationFt: asMeters, check: { kind: 'meters', listedFt, terrainFt } };
  }
  return { elevationFt: terrainFt, check: { kind: 'mismatch', listedFt, terrainFt } };
}
