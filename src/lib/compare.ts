import { STATION_FAR_MI, STATION_NEAR_MI } from '../config';
import { formatElevation, formatSpeed, isCalm } from './format';
import type { Conditions } from '../types';

/**
 * How much weight the nearest station's reading deserves. In the Great Basin
 * the closest reporting station can be 100+ miles away and thousands of feet
 * lower, which makes it a far weaker guide than its precision suggests.
 */
export type Proximity = 'near' | 'moderate' | 'far';

export function stationProximity(distanceMi: number): Proximity {
  if (distanceMi <= STATION_NEAR_MI) return 'near';
  return distanceMi <= STATION_FAR_MI ? 'moderate' : 'far';
}

/** Plain-language caveat shown beside the distance, or null when the station is close. */
export function proximityCaveat(distanceMi: number): string | null {
  switch (stationProximity(distanceMi)) {
    case 'near':
      return null;
    case 'moderate':
      return 'Far enough that local terrain may differ. Compare with the model estimate.';
    case 'far':
      return 'Too far to describe your spot reliably. Trust the model estimate below instead.';
  }
}

/**
 * A single measured-versus-model difference.
 * `tone` drives color only; `text` already reads correctly on its own.
 */
export interface Delta {
  text: string;
  tone: 'higher' | 'lower' | 'same';
}

/** Differences below these are noise from rounding or model resolution, not signal. */
const TEMPERATURE_EPSILON_F = 1;
const ELEVATION_EPSILON_FT = 50;
const WIND_EPSILON_MPH = 2;

function delta(
  model: number | null,
  station: number | null,
  epsilon: number,
  describe: (magnitude: number, direction: 'higher' | 'lower') => string,
  same: string,
): Delta | null {
  if (model == null || station == null) return null;
  const difference = model - station;
  if (Math.abs(difference) < epsilon) return { text: same, tone: 'same' };
  const direction = difference > 0 ? 'higher' : 'lower';
  return { text: describe(Math.abs(difference), direction), tone: direction };
}

export function temperatureDelta(model: number | null, station: number | null): Delta | null {
  return delta(
    model,
    station,
    TEMPERATURE_EPSILON_F,
    (magnitude, direction) =>
      `${Math.round(magnitude)}°F ${direction === 'higher' ? 'warmer' : 'cooler'}`,
    'Same temperature',
  );
}

export function elevationDelta(model: number | null, station: number | null): Delta | null {
  return delta(
    model,
    station,
    ELEVATION_EPSILON_FT,
    (magnitude, direction) =>
      `${formatElevation(magnitude)} ${direction === 'higher' ? 'higher' : 'lower'}`,
    'Same elevation',
  );
}

export function windDelta(model: number | null, station: number | null): Delta | null {
  // "2 mph more wind" is misleading when both readings are effectively calm.
  if (isCalm(model) && isCalm(station)) return { text: 'Both calm', tone: 'same' };
  return delta(
    model,
    station,
    WIND_EPSILON_MPH,
    (magnitude, direction) =>
      `${formatSpeed(magnitude)} ${direction === 'higher' ? 'more' : 'less'} wind`,
    'Same wind',
  );
}

export interface ComparisonInput {
  model: Conditions;
  station: Conditions;
  modelElevationFt: number | null;
  stationElevationFt: number | null;
}

/**
 * The model-versus-station differences worth showing, in priority order.
 * Any pair the sources did not both report is left out rather than guessed at.
 */
export function compareWithStation(input: ComparisonInput): Delta[] {
  return [
    temperatureDelta(input.model.temperatureF, input.station.temperatureF),
    elevationDelta(input.modelElevationFt, input.stationElevationFt),
    windDelta(input.model.wind.speedMph, input.station.wind.speedMph),
  ].filter((entry): entry is Delta => entry != null);
}
