import { describe, expect, it } from 'vitest';
import { resolveStateName } from '../src/lib/usStates';

describe('resolveStateName', () => {
  it('accepts abbreviations and names in any case', () => {
    expect(resolveStateName('NV')).toBe('Nevada');
    expect(resolveStateName(' nv ')).toBe('Nevada');
    expect(resolveStateName('new mexico')).toBe('New Mexico');
  });

  it('rejects unknown text', () => {
    expect(resolveStateName('Nye County')).toBeNull();
    expect(resolveStateName('')).toBeNull();
  });
});
