// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { toLayerStation } from '../src/services/stationsLayerData';
import { legendStatusText, renderStationPopup, stationPinLabel } from '../src/ui/stationsLayer';
import { minutesAgo } from './stationFixtures';

const station = toLayerStation(
  {
    id: 'PANN2',
    name: 'PANCAKE',
    lat: 38.6,
    lon: -116.4,
    networkId: '2',
    listedElevationFt: 5165,
    terrainElevationFt: 5193,
    distanceMi: null,
    observedAt: minutesAgo(20),
    conditions: {
      temperatureF: 40,
      relativeHumidity: 82,
      wind: { speedMph: 6, gustMph: 12, directionDeg: 180 },
    },
    qcNotes: [],
  },
  minutesAgo(0),
);

describe('station popup', () => {
  it('shows name, type, elevation and the latest reading', () => {
    const popup = renderStationPopup(station);
    const text = popup.textContent;
    expect(text).toContain('PANCAKE');
    expect(text).toContain('PANN2');
    expect(text).toContain('Fire weather (RAWS)');
    expect(text).toContain('Elevation 5,165 ft');
    expect(text).toContain('40°F');
    expect(text).toContain('82%');
    expect(text).toContain('6 mph S, gusts 12 mph');
    expect(text).toContain('Reported');
    expect(popup.querySelector('[data-age-since]')).not.toBeNull();
  });

  it('flags stale readings and corrected elevations', () => {
    const stale = { ...station, stale: true, observedAt: minutesAgo(300) };
    expect(renderStationPopup(stale).textContent).toContain('(older than 2 hours)');
    const corrected = {
      ...station,
      elevationCheck: { kind: 'meters' as const, listedFt: 1763, terrainFt: 5781 },
    };
    expect(renderStationPopup(corrected).textContent).toContain('(corrected from terrain)');
    const silent = { ...station, observedAt: null, elevationFt: null };
    expect(renderStationPopup(silent).textContent).toContain('No recent reading');
    expect(renderStationPopup(silent).textContent).toContain('Elevation not listed');
  });

  it('never interprets station names as markup', () => {
    const popup = renderStationPopup({ ...station, name: '<img src=x onerror=alert(1)>' });
    expect(popup.querySelector('img')).toBeNull();
  });
});

describe('pin labels and legend', () => {
  it('names the station, type and temperature', () => {
    expect(stationPinLabel(station)).toBe('PANCAKE, Fire weather (RAWS), 40°F');
    expect(stationPinLabel({ ...station, stale: true })).toBe(
      'PANCAKE, Fire weather (RAWS), no recent reading',
    );
  });

  it('describes every legend state', () => {
    expect(legendStatusText({ kind: 'loading' })).toBe('Loading stations…');
    expect(legendStatusText({ kind: 'zoom' })).toBe('Zoom in to see stations');
    expect(legendStatusText({ kind: 'ready', count: 0 })).toBe('No stations in view');
    expect(legendStatusText({ kind: 'ready', count: 1 })).toBe('1 station in view');
    expect(legendStatusText({ kind: 'ready', count: 1234 })).toBe('1,234 stations in view');
    expect(legendStatusText({ kind: 'error', message: 'Check your connection.' })).toContain(
      'Couldn’t load stations.',
    );
  });
});
