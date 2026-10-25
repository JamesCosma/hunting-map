import { describe, expect, it } from 'vitest';
import { LruCache } from '../src/lib/lruCache';

describe('LruCache', () => {
  it('evicts the least recently used entry beyond capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // "b" is now the oldest
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('overwrites existing keys without growing', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 5);
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(5);
  });
});
