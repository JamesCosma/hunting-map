/**
 * Data for the weather stations map layer: Synoptic bounding-box requests,
 * a small cache keyed by request box, and conversion to display records.
 *
 * Requests cover the view padded on every side and snapped to a grid, so
 * panning within the padding, zooming in, and returning to a recent view are
 * all served from memory without spending API requests.
 */
import { STATION_MAX_AGE_MINUTES, STATIONS_LAYER } from '../config';
import { boundsArea, containsBounds, padBounds, snapBounds } from '../lib/bbox';
import { checkElevation, sanitizeConditions } from '../lib/stationQuality';
import type { Bounds, Conditions, ElevationCheck, LatLon, StationKind } from '../types';
import { getSynopticStationsInBounds, type SynopticStation } from './synoptic';
import { describeNetwork } from './synopticNetworks';

export interface LayerStation extends LatLon {
  id: string;
  name: string;
  kind: StationKind;
  network: string | null;
  elevationFt: number | null;
  elevationCheck: ElevationCheck | null;
  observedAt: Date | null;
  conditions: Conditions;
  /** No usable reading in the last 2 hours. */
  stale: boolean;
}

export function toLayerStation(station: SynopticStation, now: Date = new Date()): LayerStation {
  const network = describeNetwork(station.networkId);
  // Only Synoptic's own terrain value is used here: no extra requests for map pins.
  const elevation = checkElevation(station.listedElevationFt, station.terrainElevationFt);
  const { conditions } = sanitizeConditions(station.conditions);
  const ageMinutes =
    station.observedAt == null ? Infinity : (now.getTime() - station.observedAt.getTime()) / 60_000;
  return {
    id: station.id,
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    kind: network.kind,
    network: network.name,
    elevationFt: elevation.elevationFt,
    elevationCheck: elevation.check,
    observedAt: station.observedAt,
    conditions,
    stale: ageMinutes > STATION_MAX_AGE_MINUTES || conditions.temperatureF == null,
  };
}

/** Whether a view is small enough to load stations for. */
export function canLoadView(view: Bounds, zoom: number): boolean {
  return zoom >= STATIONS_LAYER.minZoom && boundsArea(view) <= STATIONS_LAYER.maxViewAreaSqDeg;
}

/** The box to request for a view: padded and snapped, unless padding would make it too large. */
export function requestBoundsFor(view: Bounds): Bounds {
  const padded = snapBounds(padBounds(view, STATIONS_LAYER.padding), STATIONS_LAYER.gridDeg);
  if (boundsArea(padded) <= STATIONS_LAYER.maxViewAreaSqDeg * 2) return padded;
  return snapBounds(view, STATIONS_LAYER.gridDeg);
}

interface CacheEntry {
  bounds: Bounds;
  fetchedAt: number;
  stations: LayerStation[];
}

export type FetchBox = (bounds: Bounds, signal: AbortSignal) => Promise<LayerStation[]>;

/** Fetches stations for a request box from Synoptic. */
export function synopticBoxFetcher(token: string): FetchBox {
  return async (bounds, signal) => {
    const stations = await getSynopticStationsInBounds(bounds, {
      token,
      signal,
      withinMinutes: STATIONS_LAYER.withinMinutes,
    });
    const now = new Date();
    return stations.map((station) => toLayerStation(station, now));
  };
}

export class StationBoxLoader {
  private readonly entries: CacheEntry[] = [];

  constructor(
    private readonly fetchBox: FetchBox,
    private readonly now: () => number = Date.now,
  ) {}

  /** A fresh cached response covering the view, if there is one. */
  cached(view: Bounds): LayerStation[] | null {
    const time = this.now();
    const entry = this.entries.find(
      (candidate) =>
        time - candidate.fetchedAt < STATIONS_LAYER.cacheMs &&
        containsBounds(candidate.bounds, view),
    );
    return entry?.stations ?? null;
  }

  /** Stations covering the view, from cache or one request. */
  async load(view: Bounds, signal: AbortSignal): Promise<LayerStation[]> {
    const cached = this.cached(view);
    if (cached != null) return cached;
    const bounds = requestBoundsFor(view);
    const stations = await this.fetchBox(bounds, signal);
    this.entries.unshift({ bounds, fetchedAt: this.now(), stations });
    this.entries.length = Math.min(this.entries.length, STATIONS_LAYER.cacheEntries);
    return stations;
  }
}
