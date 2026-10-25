/**
 * Choosing the station whose reading best represents the chosen spot.
 *
 * NWS and Synoptic list many of the same stations (airports especially), so
 * candidates are merged by identifier first. Then every usable candidate is
 * scored by distance plus a penalty for elevation difference: in hunting
 * country a station 3 miles away but 2,000 ft lower in a valley often reads
 * 8 °F warmer than the ridge you are on, while one 12 miles away at the same
 * height is usually closer to the truth.
 */
import { ELEVATION_PENALTY_MI_PER_1000_FT, STATION_MAX_AGE_MINUTES } from '../config';
import type { StationObservation } from '../types';

/** A station reading plus the terrain height at the station, when known. */
export interface StationCandidate {
  observation: StationObservation;
  terrainFt: number | null;
}

/** Elevation difference assumed for a station that lists no elevation. */
export const UNKNOWN_ELEVATION_DIFFERENCE_FT = 500;

/** Readings closer together than this are considered equally fresh when merging duplicates. */
const SAME_TIME_MS = 5 * 60_000;

/** A reading is usable when it is recent and reports a temperature. */
export function isUsableReading(
  observation: Pick<StationObservation, 'observedAt' | 'conditions'>,
  now: Date = new Date(),
  maxAgeMinutes: number = STATION_MAX_AGE_MINUTES,
): boolean {
  const ageMinutes = (now.getTime() - observation.observedAt.getTime()) / 60_000;
  return ageMinutes <= maxAgeMinutes && observation.conditions.temperatureF != null;
}

/** Number of readings a station actually reported, used to break ties between duplicates. */
export function completeness(observation: StationObservation): number {
  const { temperatureF, relativeHumidity, wind } = observation.conditions;
  return [temperatureF, relativeHumidity, wind.speedMph, wind.gustMph, wind.directionDeg].filter(
    (value) => value != null,
  ).length;
}

/**
 * Picks between two listings of the same station: the fresher reading wins,
 * then the more complete one, then Synoptic (it carries network and terrain
 * details). The winner keeps the more descriptive type and network.
 */
export function preferListing(a: StationCandidate, b: StationCandidate): StationCandidate {
  const timeDiff = a.observation.observedAt.getTime() - b.observation.observedAt.getTime();
  let winner: StationCandidate;
  if (Math.abs(timeDiff) > SAME_TIME_MS) {
    winner = timeDiff > 0 ? a : b;
  } else {
    const completenessDiff = completeness(a.observation) - completeness(b.observation);
    if (completenessDiff !== 0) winner = completenessDiff > 0 ? a : b;
    else winner = a.observation.source === 'synoptic' ? a : b;
  }
  const other = winner === a ? b : a;
  const synoptic = [a, b].find((c) => c.observation.source === 'synoptic');
  return {
    observation: {
      ...winner.observation,
      kind: synoptic?.observation.kind ?? winner.observation.kind,
      network: synoptic?.observation.network ?? winner.observation.network,
      elevationFt: winner.observation.elevationFt ?? other.observation.elevationFt,
    },
    terrainFt: winner.terrainFt ?? other.terrainFt,
  };
}

/** Merges candidates from every source, one per station identifier, nearest first. */
export function mergeCandidates(candidates: readonly StationCandidate[]): StationCandidate[] {
  const byId = new Map<string, StationCandidate>();
  for (const candidate of candidates) {
    const key = candidate.observation.stationId.toUpperCase();
    const existing = byId.get(key);
    byId.set(key, existing == null ? candidate : preferListing(existing, candidate));
  }
  return [...byId.values()].sort((a, b) => a.observation.distanceMi - b.observation.distanceMi);
}

/**
 * Lower is better: distance in miles plus a distance-equivalent penalty for
 * elevation difference. Without a spot elevation, distance alone decides.
 */
export function stationScore(
  observation: Pick<StationObservation, 'distanceMi' | 'elevationFt'>,
  spotElevationFt: number | null,
): number {
  if (spotElevationFt == null) return observation.distanceMi;
  const difference =
    observation.elevationFt == null
      ? UNKNOWN_ELEVATION_DIFFERENCE_FT
      : Math.abs(observation.elevationFt - spotElevationFt);
  return observation.distanceMi + (difference / 1000) * ELEVATION_PENALTY_MI_PER_1000_FT;
}

export interface StationChoice {
  observation: StationObservation;
  /** Usable stations closer than the chosen one that lost on elevation. */
  passedOverCloser: number;
}

/** Picks the best-scoring usable station. Returns null when there are none. */
export function chooseStation(
  observations: readonly StationObservation[],
  spotElevationFt: number | null,
): StationChoice | null {
  let best: StationObservation | null = null;
  let bestScore = Infinity;
  for (const observation of observations) {
    const score = stationScore(observation, spotElevationFt);
    if (
      score < bestScore ||
      (score === bestScore && best != null && observation.distanceMi < best.distanceMi)
    ) {
      best = observation;
      bestScore = score;
    }
  }
  if (best == null) return null;
  const chosen = best;
  const passedOverCloser = observations.filter((o) => o.distanceMi < chosen.distanceMi).length;
  return { observation: chosen, passedOverCloser };
}
