import { describe, expect, it } from 'vitest';
import { FAVORITE_NAME_MAX_LENGTH, MAX_FAVORITES } from '../src/config';
import {
  FAVORITES_SCHEMA_VERSION,
  FavoritesStore,
  normalizeFavoriteName,
  parseFavoritesDocument,
  type FavoritesDocument,
  type FavoritesStorage,
} from '../src/lib/favoritesStore';

/** In-memory storage that records writes and can simulate a full quota. */
function memoryStorage(initial: unknown = null): FavoritesStorage & {
  data: unknown;
  writes: number;
  failWrites: boolean;
} {
  return {
    data: initial,
    writes: 0,
    failWrites: false,
    read() {
      return this.data;
    },
    write(document: FavoritesDocument) {
      this.writes++;
      if (this.failWrites) return false;
      this.data = JSON.parse(JSON.stringify(document)) as unknown;
      return true;
    },
  };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => `id-${++next}`;
}

const NLV = {
  lat: 36.2,
  lon: -115.12,
  name: 'North Las Vegas',
  place: 'Near North Las Vegas, Clark County, NV',
  zip: '89030',
};
const NYE = { lat: 38.5, lon: -116.5, name: 'Nye flats', place: 'Nye County, NV', zip: null };

function newStore(storage = memoryStorage()): FavoritesStore {
  return new FavoritesStore(storage, sequentialIds(), () => 1_700_000_000_000);
}

describe('normalizeFavoriteName', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(normalizeFavoriteName('  North \n\t ridge\u0007 stand ')).toBe('North ridge stand');
  });

  it('caps the length without splitting characters', () => {
    const long = '🦌'.repeat(FAVORITE_NAME_MAX_LENGTH + 10);
    expect(Array.from(normalizeFavoriteName(long))).toHaveLength(FAVORITE_NAME_MAX_LENGTH);
  });
});

describe('parseFavoritesDocument', () => {
  const valid = {
    id: 'a',
    name: 'Camp',
    lat: 38.5,
    lon: -116.5,
    place: null,
    zip: null,
    createdAt: 1,
  };

  it('reads a valid version 1 document', () => {
    expect(parseFavoritesDocument({ version: 1, favorites: [valid] })).toEqual([valid]);
  });

  it('treats corrupt or unversioned data as an empty list', () => {
    for (const raw of [
      null,
      'oops',
      42,
      [],
      {},
      { favorites: [valid] },
      { version: 0, favorites: [valid] },
    ]) {
      expect(parseFavoritesDocument(raw)).toEqual([]);
    }
  });

  it('drops invalid entries and keeps the rest', () => {
    const favorites = parseFavoritesDocument({
      version: 1,
      favorites: [
        valid,
        { ...valid, id: 'b', lat: 95 },
        { ...valid, id: 'c', name: '   ' },
        { ...valid, id: undefined },
        'garbage',
        { ...valid, id: 'd', lat: '38.6', zip: 'not-a-zip', place: 7, createdAt: 'x' },
      ],
    });
    expect(favorites.map((f) => f.id)).toEqual(['a', 'd']);
    expect(favorites[1]).toMatchObject({ lat: 38.6, zip: null, place: null, createdAt: 0 });
  });

  it('drops duplicate ids and caps the list', () => {
    const many = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => ({ ...valid, id: `f${i}` }));
    expect(parseFavoritesDocument({ version: 1, favorites: [valid, valid] })).toHaveLength(1);
    expect(parseFavoritesDocument({ version: 1, favorites: many })).toHaveLength(MAX_FAVORITES);
  });

  it('reads documents from a newer version best effort', () => {
    const favorites = parseFavoritesDocument({
      version: 2,
      favorites: [{ ...valid, color: 'red' }],
    });
    expect(favorites).toEqual([valid]);
  });
});

describe('FavoritesStore', () => {
  it('adds a favorite and persists a versioned document', () => {
    const storage = memoryStorage();
    const store = newStore(storage);
    const result = store.add({ ...NLV, name: '  North   Las Vegas ' });
    expect(result).toEqual({
      status: 'added',
      favorite: { id: 'id-1', ...NLV, createdAt: 1_700_000_000_000 },
    });
    expect(storage.data).toEqual({ version: FAVORITES_SCHEMA_VERSION, favorites: store.list() });
    expect(newStore(storage).list()).toEqual(store.list());
  });

  it('rounds coordinates to five decimals', () => {
    const store = newStore();
    store.add({ ...NYE, lat: 38.123456789, lon: -116.987654321 });
    expect(store.list()[0]).toMatchObject({ lat: 38.12346, lon: -116.98765 });
  });

  it('reports the existing favorite instead of saving the same spot twice', () => {
    const store = newStore();
    store.add(NLV);
    const again = store.add({ ...NLV, lat: NLV.lat + 0.00005, name: 'Other name' });
    expect(again).toMatchObject({ status: 'duplicate', favorite: { id: 'id-1' } });
    expect(store.list()).toHaveLength(1);
    expect(store.findAt({ lat: 36.20001, lon: -115.12 })?.id).toBe('id-1');
    expect(store.findAt({ lat: 36.3, lon: -115.12 })).toBeUndefined();
  });

  it('refuses to add beyond the cap', () => {
    const store = newStore();
    for (let i = 0; i < MAX_FAVORITES; i++) {
      expect(store.add({ ...NYE, lat: 30 + i * 0.1 }).status).toBe('added');
    }
    expect(store.isFull).toBe(true);
    expect(store.add({ ...NYE, lat: 45 })).toEqual({ status: 'full' });
  });

  it('rejects names that are empty after cleanup', () => {
    expect(newStore().add({ ...NYE, name: ' \n ' })).toEqual({ status: 'invalid' });
  });

  it('renames, ignoring blank names and unknown ids', () => {
    const storage = memoryStorage();
    const store = newStore(storage);
    store.add(NLV);
    expect(store.rename('id-1', ' Truck camp ')).toBe(true);
    expect(store.get('id-1')?.name).toBe('Truck camp');
    const writes = storage.writes;
    expect(store.rename('id-1', 'Truck camp')).toBe(true);
    expect(storage.writes).toBe(writes); // unchanged name, no write
    expect(store.rename('id-1', '   ')).toBe(false);
    expect(store.rename('missing', 'x')).toBe(false);
    expect(store.get('id-1')?.name).toBe('Truck camp');
  });

  it('removes and restores a favorite at its original position', () => {
    const store = newStore();
    store.add(NLV);
    store.add(NYE);
    store.add({ ...NYE, lat: 39, name: 'Third' });
    const removed = store.remove('id-2');
    expect(removed?.index).toBe(1);
    expect(store.list().map((f) => f.id)).toEqual(['id-1', 'id-3']);
    if (removed == null) throw new Error('expected a removed favorite');
    expect(store.restore(removed.favorite, removed.index)).toBe(true);
    expect(store.list().map((f) => f.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(store.restore(removed.favorite, removed.index)).toBe(false);
    expect(store.remove('missing')).toBeNull();
  });

  it('notifies subscribers on every change until unsubscribed', () => {
    const store = newStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((list) => seen.push(list.length));
    store.add(NLV);
    store.add(NYE);
    unsubscribe();
    store.remove('id-1');
    expect(seen).toEqual([1, 2]);
  });

  it('keeps working in memory when storage rejects writes', () => {
    const storage = memoryStorage();
    storage.failWrites = true;
    const store = newStore(storage);
    expect(store.add(NLV).status).toBe('added');
    expect(store.list()).toHaveLength(1);
    expect(store.isPersisted).toBe(false);
  });

  it('reloads changes made in another tab', () => {
    const storage = memoryStorage();
    const store = newStore(storage);
    const other = newStore(storage);
    other.add(NYE);
    expect(store.list()).toHaveLength(0);
    store.reload();
    expect(store.list().map((f) => f.name)).toEqual(['Nye flats']);
  });
});
