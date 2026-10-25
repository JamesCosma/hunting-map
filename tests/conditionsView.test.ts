// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  describeElevationDifference,
  elevationCheckNote,
  renderStationObservation,
  stationTypeLabel,
} from '../src/ui/conditionsView';
import { makeObservation } from './stationFixtures';

function text(elements: HTMLElement[]): string {
  return elements.map((element) => element.textContent).join(' | ');
}

describe('station card', () => {
  it('shows type, distance, elevation relative to the spot, and age', () => {
    const elements = renderStationObservation(
      makeObservation({ stationName: 'Pancake', stationId: 'PANN2', distanceMi: 21.5 }),
      { spotElevationFt: 6800 },
    );
    const content = text(elements);
    expect(content).toContain('Pancake');
    expect(content).toContain('PANN2');
    expect(content).toContain('Fire weather (RAWS)');
    expect(content).toContain('22 mi away');
    expect(content).toContain('Station at 6,000 ft, 800 ft below your spot');
    expect(content).toContain('Reported');
    const type = elements[0]?.querySelector('.station-type');
    expect(type?.getAttribute('data-kind')).toBe('raws');
  });

  it('explains corrections, skipped stations and unavailable sources', () => {
    const content = text(
      renderStationObservation(
        makeObservation({
          elevationCheck: { kind: 'meters', listedFt: 1763, terrainFt: 5781 },
          passedOverCloser: 2,
          skippedCloser: 1,
          qcNotes: ['Dropped a wind gust reading that failed quality control.'],
        }),
        { synopticUnavailable: true },
      ),
    );
    expect(content).toContain('Listed elevation (1,763 ft) looks like meters');
    expect(content).toContain('Chosen over 2 closer stations at a less similar elevation.');
    expect(content).toContain('Skipped 1 closer station with no recent reading.');
    expect(content).toContain('failed quality control');
    expect(content).toContain('showing NWS only');
  });

  it('omits the elevation line when the station has none', () => {
    const content = text(renderStationObservation(makeObservation({ elevationFt: null })));
    expect(content).not.toContain('Station at');
  });
});

describe('station card helpers', () => {
  it('describes elevation differences', () => {
    expect(describeElevationDifference(6050, 6000)).toBe('about the same height as your spot');
    expect(describeElevationDifference(7234, 6000)).toBe('1,234 ft above your spot');
    expect(describeElevationDifference(5000, 6000)).toBe('1,000 ft below your spot');
  });

  it('labels station types with their network where it adds information', () => {
    expect(stationTypeLabel({ kind: 'mesonet', network: 'NV-ENERGY' })).toBe('Mesonet · NV-ENERGY');
    expect(stationTypeLabel({ kind: 'raws', network: 'RAWS' })).toBe('Fire weather (RAWS)');
    expect(stationTypeLabel({ kind: 'other', network: null })).toBe('Weather station');
  });

  it('explains every elevation correction', () => {
    expect(elevationCheckNote({ kind: 'mismatch', listedFt: 3000, terrainFt: 6500 })).toBe(
      'Listed elevation (3,000 ft) disagrees with terrain; using 6,500 ft.',
    );
    expect(elevationCheckNote({ kind: 'terrain', listedFt: null, terrainFt: 4200 })).toBe(
      'No listed elevation; using terrain height 4,200 ft.',
    );
  });
});
