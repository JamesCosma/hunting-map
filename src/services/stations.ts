/**
 * Nearest representative station from every available source.
 *
 * NWS and Synoptic are queried in parallel. Either source failing is not
 * fatal while the other answers; Synoptic is skipped entirely when the build
 * has no token. Usable readings are merged, sanity checked (implausible
 * values, Synoptic QC, listed elevation vs terrain) and ranked by distance
 * plus elevation difference from the spot (see lib/stationSelection).
 */
import {
  STATION_MAX_AGE_MINUTES,
  SYNOPTIC_SEARCH_LIMIT,
  SYNOPTIC_SEARCH_RADIUS_MI,
  SYNOPTIC_TOKEN,
} from '../config';
import { isAbortError, RequestError, type FetchJsonOptions } from '../lib/http';
import { checkElevation, sanitizeConditions } from '../lib/stationQuality';
import {
  chooseStation,
  isUsableReading,
  mergeCandidates,
  type StationCandidate,
} from '../lib/stationSelection';
import type { LatLon, StationObservation } from '../types';
import { getElevationsFt } from './elevation';
import { getNearestObservation, type NwsResult } from './nws';
import { getSynopticStationsNear, type SynopticStation } from './synoptic';
import { describeNetwork } from './synopticNetworks';

export type StationsResult =
  | {
      status: 'ok';
      observation: StationObservation;
      /** Terrain elevation of the chosen spot, when it could be looked up. */
      spotElevationFt: number | null;
      /** True when Synoptic is configured but could not be reached, so only NWS was searched. */
      synopticUnavailable: boolean;
    }
  /** No source covers this point (outside the US and no Synoptic stations nearby). */
  | { status: 'outside-coverage' }
  /** Stations exist, but none had a recent, usable reading. */
  | { status: 'no-recent-data'; stationsChecked: number; synopticUnavailable: boolean };

export interface StationsOptions extends Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> {
  /** Synoptic token. Defaults to the build-time token; null disables Synoptic. */
  token?: string | null;
  now?: () => Date;
}

/** Converts a Synoptic station to a candidate, or null when it has no reading time. */
export function synopticCandidate(station: SynopticStation): StationCandidate | null {
  if (station.observedAt == null) return null;
  const network = describeNetwork(station.networkId);
  return {
    observation: {
      stationId: station.id,
      stationName: station.name,
      source: 'synoptic',
      kind: network.kind,
      network: network.name,
      lat: station.lat,
      lon: station.lon,
      distanceMi: station.distanceMi ?? 0,
      elevationFt: station.listedElevationFt,
      elevationCheck: null,
      observedAt: station.observedAt,
      conditions: station.conditions,
      qcNotes: station.qcNotes,
      skippedCloser: 0,
      passedOverCloser: 0,
    },
    terrainFt: station.terrainElevationFt,
  };
}

/** Applies plausibility checks, dropping bad values and noting why. */
function sanitize(candidate: StationCandidate): StationCandidate {
  const { conditions, notes } = sanitizeConditions(candidate.observation.conditions);
  return {
    ...candidate,
    observation: {
      ...candidate.observation,
      conditions,
      qcNotes: [...candidate.observation.qcNotes, ...notes],
    },
  };
}

interface TerrainLookup {
  spotFt: number | null;
  /** Terrain at each candidate, by index (null where unknown). */
  candidateFt: (number | null)[];
}

/**
 * One Open-Meteo request for the spot plus every candidate without a terrain
 * height. Failure only skips the elevation checks and the elevation ranking.
 */
async function lookUpTerrain(
  point: LatLon,
  candidates: readonly StationCandidate[],
  options: Pick<FetchJsonOptions, 'signal' | 'fetchImpl'>,
): Promise<TerrainLookup> {
  const missing = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.terrainFt == null);
  const candidateFt = candidates.map((c) => c.terrainFt);
  try {
    const feet = await getElevationsFt(
      [point, ...missing.map(({ candidate }) => candidate.observation)],
      options,
    );
    missing.forEach(({ index }, position) => {
      candidateFt[index] = feet[position + 1] ?? null;
    });
    return { spotFt: feet[0] ?? null, candidateFt };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { spotFt: null, candidateFt };
  }
}

function asRequestError(reason: unknown): RequestError {
  return reason instanceof RequestError ? reason : new RequestError('offline', String(reason));
}

export async function getNearestStation(
  point: LatLon,
  options: StationsOptions = {},
): Promise<StationsResult> {
  const now = options.now ?? (() => new Date());
  const token = options.token === undefined ? SYNOPTIC_TOKEN : options.token;
  const request: Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> = {};
  if (options.signal) request.signal = options.signal;
  if (options.fetchImpl) request.fetchImpl = options.fetchImpl;

  const [nwsOutcome, synopticOutcome] = await Promise.allSettled([
    getNearestObservation(point, request, now),
    token == null
      ? Promise.resolve(null)
      : getSynopticStationsNear(point, {
          ...request,
          token,
          radiusMi: SYNOPTIC_SEARCH_RADIUS_MI,
          limit: SYNOPTIC_SEARCH_LIMIT,
          withinMinutes: STATION_MAX_AGE_MINUTES,
        }),
  ]);
  for (const outcome of [nwsOutcome, synopticOutcome]) {
    if (outcome.status === 'rejected' && isAbortError(outcome.reason)) throw outcome.reason;
  }

  const nws: NwsResult | null = nwsOutcome.status === 'fulfilled' ? nwsOutcome.value : null;
  const synoptic = synopticOutcome.status === 'fulfilled' ? synopticOutcome.value : null;
  const synopticUnavailable = token != null && synoptic == null;
  if (nws == null && synoptic == null && nwsOutcome.status === 'rejected') {
    throw asRequestError(nwsOutcome.reason);
  }

  const time = now();
  const nwsObservation = nws?.status === 'ok' ? nws.observation : null;
  const fromSynoptic = (synoptic ?? [])
    .map(synopticCandidate)
    .filter((candidate): candidate is StationCandidate => candidate != null)
    .map(sanitize);
  const all = mergeCandidates([
    ...(nwsObservation ? [sanitize({ observation: nwsObservation, terrainFt: null })] : []),
    ...fromSynoptic,
  ]);
  const usable = all.filter((c) => isUsableReading(c.observation, time));

  if (usable.length === 0) {
    // Nothing usable and NWS never answered: report the failure so the user can retry.
    if (nwsOutcome.status === 'rejected') throw asRequestError(nwsOutcome.reason);
    if (nws?.status === 'outside-coverage' && (synoptic?.length ?? 0) === 0) {
      return { status: 'outside-coverage' };
    }
    const nwsChecked = nws?.status === 'no-recent-data' ? nws.stationsChecked : 0;
    return {
      status: 'no-recent-data',
      stationsChecked: Math.max(nwsChecked, synoptic?.length ?? 0),
      synopticUnavailable,
    };
  }

  const terrain = await lookUpTerrain(point, usable, request);
  const checked = usable.map((candidate, index) => {
    const { elevationFt, check } = checkElevation(
      candidate.observation.elevationFt,
      terrain.candidateFt[index] ?? null,
    );
    return { ...candidate.observation, elevationFt, elevationCheck: check };
  });

  const choice = chooseStation(checked, terrain.spotFt);
  if (choice == null) throw new RequestError('parse', 'No station could be chosen');
  const chosen = choice.observation;
  const unusableCloser = all.filter(
    (c) => c.observation.distanceMi < chosen.distanceMi && !isUsableReading(c.observation, time),
  ).length;
  const nwsSkipped =
    nwsObservation != null && nwsObservation.distanceMi <= chosen.distanceMi
      ? nwsObservation.skippedCloser
      : 0;

  return {
    status: 'ok',
    observation: {
      ...chosen,
      skippedCloser: Math.max(unusableCloser, nwsSkipped),
      passedOverCloser: choice.passedOverCloser,
    },
    spotElevationFt: terrain.spotFt,
    synopticUnavailable,
  };
}
