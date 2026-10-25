import { describe, expect, it } from 'vitest';
import { asArray, asNumber, asRecord, asString } from '../src/lib/json';

describe('JSON guards', () => {
  it('narrows records and arrays safely', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord([1])).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asArray('nope')).toEqual([]);
  });

  it('reads numbers, including numeric strings', () => {
    expect(asNumber(4.5)).toBe(4.5);
    expect(asNumber('-115.1718')).toBe(-115.1718);
    expect(asNumber('')).toBeNull();
    expect(asNumber('abc')).toBeNull();
    expect(asNumber(Number.NaN)).toBeNull();
    expect(asNumber(null)).toBeNull();
  });

  it('reads non-empty strings', () => {
    expect(asString('KVGT')).toBe('KVGT');
    expect(asString('')).toBeNull();
    expect(asString(3)).toBeNull();
  });
});
