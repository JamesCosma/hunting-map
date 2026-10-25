/**
 * National Weather Service (api.weather.gov) client.
 *
 * Flow: /points/{lat},{lon} gives the forecast office grid and the URL of the
 * observation stations near it. We sort those stations by true distance from
 * the chosen point and fetch /stations/{id}/observations/latest in small
 * batches until we find a reading that is recent and actually has a
 * temperature. Stale or empty stations are common in remote areas, so the
 * fallback to the next nearest station is the core of this module.
 */
import {
  ENDPOINTS,
  STATION_BATCH_SIZE,
  STATION_MAX_AGE_MINUTES,
  STATION_MAX_CANDIDATES,
} from '../config';
import { distanceMiles } from '../lib/geo';
import { RequestError, fetchJson, type FetchJsonOptions } from '../lib/http';
import { asArray, asNumber, asRecord, asString } from '../lib/json';
import { wmoToImperial } from '../lib/units';
import type { Conditions, LatLon, StationObservation } from '../types';

/** NWS asks clients to request GeoJSON explicitly. Accept is CORS-safelisted, so no preflight. */
const NWS_HEADERS = { Accept: 'application/geo+json' };

export interface StationCandidate extends LatLon {
  id: string;
  name: string;
  distanceMi: number;
}

export interface ParsedObservation {
  observedAt: Date;
  elevationFt: number | null;
  conditions: Conditions;
}

export type NwsResult =
  | { status: 'ok'; observation: StationObservation }
  /** The point is outside NWS coverage (offshore, outside the US). */
  | { status: 'outside-coverage' }
  /** Stations exist, but none had a recent, usable reading. */
  | { status: 'no-recent-data'; stationsChecked: number };

type RequestOptions = Pick<FetchJsonOptions, 'signal' | 'fetchImpl'>;

/** NWS rejects coordinates with more than 4 decimal places. */
const formatPointPath = ({ lat, lon }: LatLon): string => `${lat.toFixed(4)},${lon.toFixed(4)}`;

/** Reads a `{ value, unitCode }` quantity and converts it to imperial units. */
function readQuantity(raw: unknown): number | null {
  const quantity = asRecord(raw);
  const unitCode = asString(quantity.unitCode);
  return unitCode == null ? null : wmoToImperial(asNumber(quantity.value), unitCode);
}

/** Parses a /points response into the observation stations URL. */
export function parseStationsUrl(json: unknown): string | null {
  return asString(asRecord(asRecord(json).properties).observationStations);
}

/** Parses a station collection and returns stations sorted nearest first. */
export function parseStationCandidates(json: unknown, origin: LatLon): StationCandidate[] {
  const candidates: StationCandidate[] = [];
  for (const feature of asArray(asRecord(json).features)) {
    const record = asRecord(feature);
    const properties = asRecord(record.properties);
    const coordinates = asArray(asRecord(record.geometry).coordinates);
    const id = asString(properties.stationIdentifier);
    const lon = asNumber(coordinates[0]);
    const lat = asNumber(coordinates[1]);
    if (id == null || lat == null || lon == null) continue;
    candidates.push({
      id,
      name: asString(properties.name) ?? id,
      lat,
      lon,
      distanceMi: distanceMiles(origin, { lat, lon }),
    });
  }
  return candidates.sort((a, b) => a.distanceMi - b.distanceMi);
}

/** Parses /stations/{id}/observations/latest. Returns null if the payload has no timestamp. */
export function parseObservation(json: unknown): ParsedObservation | null {
  const properties = asRecord(asRecord(json).properties);
  const timestamp = asString(properties.timestamp);
  const observedAt = timestamp == null ? null : new Date(timestamp);
  if (observedAt == null || Number.isNaN(observedAt.getTime())) return null;

  return {
    observedAt,
    elevationFt: readQuantity(properties.elevation),
    conditions: {
      temperatureF: readQuantity(properties.temperature),
      relativeHumidity: readQuantity(properties.relativeHumidity),
      wind: {
        speedMph: readQuantity(properties.windSpeed),
        gustMph: readQuantity(properties.windGust),
        directionDeg: readQuantity(properties.windDirection),
      },
    },
  };
}

/**
 * A reading is usable when it is recent and reports a temperature. Other
 * fields may still be null (many small stations do not measure wind) and are
 * shown as "Not reported".
 */
export function isUsableObservation(
  observation: ParsedObservation,
  now: Date = new Date(),
  maxAgeMinutes: number = STATION_MAX_AGE_MINUTES,
): boolean {
  const ageMinutes = (now.getTime() - observation.observedAt.getTime()) / 60_000;
  return ageMinutes <= maxAgeMinutes && observation.conditions.temperatureF != null;
}

async function fetchLatest(
  station: StationCandidate,
  options: RequestOptions,
): Promise<ParsedObservation | null> {
  const url = `${ENDPOINTS.nwsBase}/stations/${encodeURIComponent(station.id)}/observations/latest`;
  // One attempt per station: on failure we move on to the next station instead of waiting.
  const json = await fetchJson(url, { ...options, headers: NWS_HEADERS, retries: 0 });
  return parseObservation(json);
}

/** Finds the latest usable observation from the nearest reporting NWS station. */
export async function getNearestObservation(
  point: LatLon,
  options: RequestOptions = {},
  now: () => Date = () => new Date(),
): Promise<NwsResult> {
  let pointJson: unknown;
  try {
    pointJson = await fetchJson(`${ENDPOINTS.nwsBase}/points/${formatPointPath(point)}`, {
      ...options,
      headers: NWS_HEADERS,
    });
  } catch (error) {
    // 404 means "no forecast office covers this point", which is an expected outcome.
    if (error instanceof RequestError && error.status === 404)
      return { status: 'outside-coverage' };
    throw error;
  }

  const stationsUrl = parseStationsUrl(pointJson);
  if (stationsUrl == null) return { status: 'outside-coverage' };

  const stationsJson = await fetchJson(stationsUrl, { ...options, headers: NWS_HEADERS });
  const candidates = parseStationCandidates(stationsJson, point).slice(0, STATION_MAX_CANDIDATES);

  let checked = 0;
  let failures = 0;
  let firstFailure: RequestError | null = null;
  for (let start = 0; start < candidates.length; start += STATION_BATCH_SIZE) {
    const batch = candidates.slice(start, start + STATION_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((s) => fetchLatest(s, options)));

    for (const [index, outcome] of settled.entries()) {
      const station = batch[index];
      if (station == null) continue;
      if (outcome.status === 'rejected') {
        if (outcome.reason instanceof RequestError && outcome.reason.kind === 'aborted') {
          throw outcome.reason;
        }
        failures++;
        firstFailure ??=
          outcome.reason instanceof RequestError
            ? outcome.reason
            : new RequestError('offline', String(outcome.reason));
        continue;
      }
      const parsed = outcome.value;
      if (parsed != null && isUsableObservation(parsed, now())) {
        return {
          status: 'ok',
          observation: {
            stationId: station.id,
            stationName: station.name,
            distanceMi: station.distanceMi,
            elevationFt: parsed.elevationFt,
            observedAt: parsed.observedAt,
            conditions: parsed.conditions,
            skippedCloser: start + index,
          },
        };
      }
    }
    checked += batch.length;
  }

  // If every single request failed it is a connectivity problem, not missing data.
  if (checked > 0 && failures === checked && firstFailure != null) throw firstFailure;
  return { status: 'no-recent-data', stationsChecked: checked };
}
