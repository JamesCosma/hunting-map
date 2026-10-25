import { describe, expect, it, vi } from 'vitest';
import type { SynopticStation } from '../src/services/synoptic';
import type { Bounds } from '../src/types';
import {
  StationBoxLoader,
  canLoadView,
  requestBoundsFor,
  toLayerStation,
  type LayerStation,
} from '../src/services/stationsLayerData';
import { NOW, minutesAgo } from './stationFixtures';

function synoptic(overrides: Partial<SynopticStation> = {}): SynopticStation {
  return {
    id: 'STCN2',
    name: 'Stone Cabin',
    lat: 38.2,
    lon: -116.6,
    networkId: '106',
    listedElevationFt: 5800,
    terrainElevationFt: 5800,
    distanceMi: null,
    observedAt: minutesAgo(15),
    conditions: {
      temperatureF: 30,
      relativeHumidity: 95,
      wind: { speedMph: 0, gustMph: 0, directionDeg: 0 },
    },
    qcNotes: [],
    ...overrides,
  };
}

describe('toLayerStation', () => {
  it('labels the station and marks fresh readings', () => {
    expect(toLayerStation(synoptic(), NOW)).toMatchObject({
      id: 'STCN2',
      kind: 'mesonet',
      network: 'HADS',
      elevationFt: 5800,
      stale: false,
    });
  });

  it('marks old or temperature-less readings as stale', () => {
    expect(toLayerStation(synoptic({ observedAt: minutesAgo(180) }), NOW).stale).toBe(true);
    expect(toLayerStation(synoptic({ observedAt: null }), NOW).stale).toBe(true);
    const noTemp = synoptic();
    noTemp.conditions = { ...noTemp.conditions, temperatureF: null };
    expect(toLayerStation(noTemp, NOW).stale).toBe(true);
  });

  it('corrects elevations using Synoptic terrain only', () => {
    const station = toLayerStation(synoptic({ listedElevationFt: 1763, terrainElevationFt: 5781 }));
    expect(station.elevationCheck?.kind).toBe('meters');
    expect(toLayerStation(synoptic({ terrainElevationFt: null })).elevationCheck).toBeNull();
  });
});

describe('view limits', () => {
  it('loads only views that are small enough', () => {
    const small = { south: 36, west: -115.5, north: 36.5, east: -115 };
    const huge = { south: 30, west: -120, north: 40, east: -110 };
    expect(canLoadView(small, 10)).toBe(true);
    expect(canLoadView(huge, 10)).toBe(false);
    expect(canLoadView(small, 5)).toBe(false);
  });

  it('pads and snaps the request box, dropping the padding for large views', () => {
    expect(requestBoundsFor({ south: 36.1, west: -115.3, north: 36.3, east: -115.0 })).toEqual({
      south: 36,
      west: -115.5,
      north: 36.5,
      east: -114.75,
    });
    const large = { south: 36.1, west: -117.1, north: 37.9, east: -115.0 };
    expect(requestBoundsFor(large)).toEqual({ south: 36, west: -117.25, north: 38, east: -115 });
  });
});

describe('StationBoxLoader', () => {
  const VIEW = { south: 36.1, west: -115.3, north: 36.3, east: -115.0 };
  const stations: LayerStation[] = [toLayerStation(synoptic(), NOW)];

  it('reuses a fresh response while the view stays inside it', async () => {
    let time = 0;
    const fetchBox = vi.fn(() => Promise.resolve(stations));
    const loader = new StationBoxLoader(fetchBox, () => time);
    const signal = new AbortController().signal;

    expect(await loader.load(VIEW, signal)).toBe(stations);
    expect(loader.cached({ ...VIEW, south: 36.15 })).toBe(stations);
    await loader.load({ ...VIEW, north: 36.4 }, signal);
    expect(fetchBox).toHaveBeenCalledTimes(1);

    time = 11 * 60_000;
    expect(loader.cached(VIEW)).toBeNull();
    await loader.load(VIEW, signal);
    expect(fetchBox).toHaveBeenCalledTimes(2);
  });

  it('fetches again for a view outside every cached box', async () => {
    const fetchBox = vi.fn<(bounds: Bounds, signal: AbortSignal) => Promise<LayerStation[]>>(() =>
      Promise.resolve(stations),
    );
    const loader = new StationBoxLoader(fetchBox, () => 0);
    const signal = new AbortController().signal;
    await loader.load(VIEW, signal);
    await loader.load({ south: 38, west: -117, north: 38.4, east: -116.5 }, signal);
    expect(fetchBox).toHaveBeenCalledTimes(2);
    expect(fetchBox.mock.calls[0]?.[0]).toEqual({
      south: 36,
      west: -115.5,
      north: 36.5,
      east: -114.75,
    });
  });
});
