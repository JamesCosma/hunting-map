/**
 * Synoptic Data (MesoWest) client for latest station readings.
 *
 * Synoptic aggregates hundreds of networks (airports, RAWS fire weather,
 * SNOTEL, road weather, CWOP personal stations, utility and state mesonets),
 * which often puts a real station much closer to a backcountry spot than the
 * NWS list does. Requests use a public token (safe to ship to browsers) and
 * ask for English units with wind in mph, and for Synoptic's quality control
 * flags so failed readings can be dropped.
 */
import { ENDPOINTS } from '../config';
import { distanceMiles } from '../lib/geo';
import { RequestError, buildUrl, fetchJson, type FetchJsonOptions } from '../lib/http';
import { asArray, asNumber, asRecord, asString } from '../lib/json';
import type { Bounds, Conditions, LatLon } from '../types';

const VARIABLES = {
  temperatureF: 'air_temp',
  relativeHumidity: 'relative_humidity',
  speedMph: 'wind_speed',
  directionDeg: 'wind_direction',
  gustMph: 'wind_gust',
} as const;

type Variable = keyof typeof VARIABLES;

const VARIABLE_LABELS: Record<Variable, string> = {
  temperatureF: 'temperature',
  relativeHumidity: 'humidity',
  speedMph: 'wind speed',
  directionDeg: 'wind direction',
  gustMph: 'wind gust',
};

/** One station from a /stations/latest response. */
export interface SynopticStation extends LatLon {
  id: string;
  name: string;
  networkId: string | null;
  /** Elevation as listed in the station metadata, in feet. */
  listedElevationFt: number | null;
  /** Synoptic's terrain model elevation at the station, in feet, when provided. */
  terrainElevationFt: number | null;
  /** Distance reported by a radius query, in miles. */
  distanceMi: number | null;
  /** Time of the temperature reading, or of the newest reading when there is no temperature. */
  observedAt: Date | null;
  conditions: Conditions;
  /** Readings removed because they failed Synoptic quality control. */
  qcNotes: string[];
}

export type SynopticRequestOptions = Pick<FetchJsonOptions, 'signal' | 'fetchImpl'> & {
  token: string;
};

/** Parameters shared by every latest-readings request. */
function baseParams(token: string, withinMinutes: number): Record<string, string | number> {
  return {
    token,
    vars: Object.values(VARIABLES).join(','),
    units: 'english,speed|mph',
    within: withinMinutes,
    status: 'active',
    qc_flags: 'on',
    qc_checks: 'synopticlabs',
  };
}

export function buildRadiusUrl(
  point: LatLon,
  options: { token: string; radiusMi: number; limit: number; withinMinutes: number },
): string {
  return buildUrl(ENDPOINTS.synopticLatest, {
    ...baseParams(options.token, options.withinMinutes),
    radius: `${point.lat.toFixed(4)},${point.lon.toFixed(4)},${options.radiusMi}`,
    limit: options.limit,
  });
}

export function buildBoundsUrl(
  bounds: Bounds,
  options: { token: string; withinMinutes: number },
): string {
  const { west, south, east, north } = bounds;
  return buildUrl(ENDPOINTS.synopticLatest, {
    ...baseParams(options.token, options.withinMinutes),
    bbox: [west, south, east, north].map((value) => value.toFixed(3)).join(','),
  });
}

function readDate(raw: unknown): Date | null {
  const text = asString(raw);
  if (text == null) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface Reading {
  value: number | null;
  at: Date | null;
  failedQc: boolean;
}

/** Reads `<variable>_value_1` from OBSERVATIONS, including its QC status. */
function readVariable(observations: Record<string, unknown>, name: string): Reading {
  const record = asRecord(observations[`${name}_value_1`]);
  const qc = asRecord(record.qc);
  return {
    value: asNumber(record.value),
    at: readDate(record.date_time),
    failedQc: asString(qc.status) === 'failed',
  };
}

/** Parses one STATION entry. Returns null when it lacks an id or coordinates. */
export function parseSynopticStation(raw: unknown): SynopticStation | null {
  const record = asRecord(raw);
  const id = asString(record.STID);
  const lat = asNumber(record.LATITUDE);
  const lon = asNumber(record.LONGITUDE);
  if (id == null || lat == null || lon == null) return null;

  const observations = asRecord(record.OBSERVATIONS);
  const qcNotes: string[] = [];
  const values = {} as Record<Variable, number | null>;
  let newest: Date | null = null;
  for (const key of Object.keys(VARIABLES) as Variable[]) {
    const reading = readVariable(observations, VARIABLES[key]);
    if (reading.failedQc && reading.value != null) {
      qcNotes.push(`Dropped a ${VARIABLE_LABELS[key]} reading that failed quality control.`);
      values[key] = null;
    } else {
      values[key] = reading.value;
    }
    if (reading.at != null && (newest == null || reading.at > newest)) newest = reading.at;
  }
  const temperatureAt = readVariable(observations, VARIABLES.temperatureF).at;

  return {
    id,
    name: asString(record.NAME)?.trim() || id,
    lat,
    lon,
    networkId: asString(record.MNET_ID),
    listedElevationFt: asNumber(record.ELEVATION),
    terrainElevationFt: asNumber(record.ELEV_DEM),
    distanceMi: asNumber(record.DISTANCE),
    observedAt: values.temperatureF != null ? temperatureAt : newest,
    conditions: {
      temperatureF: values.temperatureF,
      relativeHumidity: values.relativeHumidity,
      wind: {
        speedMph: values.speedMph,
        gustMph: values.gustMph,
        directionDeg: values.directionDeg,
      },
    },
    qcNotes,
  };
}

/**
 * Parses a /stations/latest response. "No stations found" is an empty list;
 * any other failure (for example an invalid token) is a RequestError.
 */
export function parseSynopticResponse(json: unknown): SynopticStation[] {
  const root = asRecord(json);
  const summary = asRecord(root.SUMMARY);
  const code = asNumber(summary.RESPONSE_CODE);
  if (code === 1) {
    const stations: SynopticStation[] = [];
    for (const raw of asArray(root.STATION)) {
      const station = parseSynopticStation(raw);
      if (station != null) stations.push(station);
    }
    return stations;
  }
  if (code === 2 && asNumber(summary.NUMBER_OF_OBJECTS) === 0) return [];
  // Never echo the request URL: it carries the token.
  const status = asNumber(summary.HTTP_STATUS_CODE) ?? undefined;
  throw new RequestError('http', asString(summary.RESPONSE_MESSAGE) ?? 'Synoptic error', status);
}

/** Latest readings from stations near a point, nearest first. */
export async function getSynopticStationsNear(
  point: LatLon,
  options: SynopticRequestOptions & { radiusMi: number; limit: number; withinMinutes: number },
): Promise<SynopticStation[]> {
  const url = buildRadiusUrl(point, options);
  const json = await fetchJson(url, pickFetchOptions(options));
  return parseSynopticResponse(json)
    .map((station) => ({ ...station, distanceMi: distanceMiles(point, station) }))
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

/** Latest readings from every station inside a box. */
export async function getSynopticStationsInBounds(
  bounds: Bounds,
  options: SynopticRequestOptions & { withinMinutes: number },
): Promise<SynopticStation[]> {
  const json = await fetchJson(buildBoundsUrl(bounds, options), pickFetchOptions(options));
  return parseSynopticResponse(json);
}

function pickFetchOptions(options: SynopticRequestOptions): FetchJsonOptions {
  const picked: FetchJsonOptions = {};
  if (options.signal) picked.signal = options.signal;
  if (options.fetchImpl) picked.fetchImpl = options.fetchImpl;
  return picked;
}
