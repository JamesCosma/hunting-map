import { describe, expect, it } from 'vitest';
import { SYNOPTIC_NETWORKS } from '../src/data/synopticNetworks';
import { describeNetwork, nwsStationKind } from '../src/services/synopticNetworks';

describe('describeNetwork', () => {
  it('labels the major networks', () => {
    expect(describeNetwork('1')).toEqual({ name: 'ASOS/AWOS', kind: 'airport' });
    expect(describeNetwork('2')).toEqual({ name: 'RAWS', kind: 'raws' });
    expect(describeNetwork('25')).toEqual({ name: 'SNOTEL', kind: 'snow' });
    expect(describeNetwork('65')).toEqual({ name: 'APRSWXNET/CWOP', kind: 'personal' });
  });

  it('falls back to the network category', () => {
    const table = { '900': ['STATE DOT', 10], '901': ['FIRE', 9], '902': ['WX NET', 8] } as const;
    expect(describeNetwork('900', table).kind).toBe('road');
    expect(describeNetwork('901', table).kind).toBe('raws');
    expect(describeNetwork('902', table).kind).toBe('personal');
  });

  it('treats other and unknown networks as mesonets', () => {
    expect(describeNetwork('106')).toEqual({ name: 'HADS', kind: 'mesonet' });
    expect(describeNetwork('999999')).toEqual({ name: null, kind: 'mesonet' });
    expect(describeNetwork(null)).toEqual({ name: null, kind: 'other' });
  });

  it('ships a generated network table', () => {
    expect(Object.keys(SYNOPTIC_NETWORKS).length).toBeGreaterThan(100);
  });
});

describe('nwsStationKind', () => {
  it('recognizes ICAO airport identifiers', () => {
    expect(nwsStationKind('KVGT')).toBe('airport');
    expect(nwsStationKind('PANC')).toBe('airport');
    expect(nwsStationKind('KO26')).toBe('airport');
    expect(nwsStationKind('STCN2')).toBe('other');
    expect(nwsStationKind('AT297')).toBe('other');
  });
});
