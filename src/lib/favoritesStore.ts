/**
 * Favorites persisted in localStorage (per device, per browser).
 *
 * Stored as a versioned document, `{ version: 1, favorites: [...] }`, so the
 * shape can evolve with a migration instead of silently breaking. Everything
 * read back is validated entry by entry: a corrupt entry is dropped, a corrupt
 * document reads as an empty list, and nothing here ever throws.
 */
import { FAVORITE_NAME_MAX_LENGTH, MAX_FAVORITES, STORAGE_KEYS } from '../config';
import type { Favorite, LatLon } from '../types';
import { distanceMiles, isValidLatLon } from './geo';
import { asArray, asNumber, asRecord, asString } from './json';
import { readJson, writeJson } from './storage';

export const FAVORITES_SCHEMA_VERSION = 1;

export interface FavoritesDocument {
  version: typeof FAVORITES_SCHEMA_VERSION;
  favorites: Favorite[];
}

/** Where the document lives. Injected in tests; localStorage in the app. */
export interface FavoritesStorage {
  read(): unknown;
  /** Returns false if the write was rejected (quota, privacy mode). */
  write(document: FavoritesDocument): boolean;
}

export const localFavoritesStorage: FavoritesStorage = {
  read: () => readJson(STORAGE_KEYS.favorites),
  write: (document) => writeJson(STORAGE_KEYS.favorites, document),
};

/** Two favorites closer than this (about 50 ft) are the same spot. */
const SAME_SPOT_MILES = 0.01;

const ZIP_PATTERN = /^\d{5}$/;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Trims, collapses whitespace, strips control characters and caps the length. */
export function normalizeFavoriteName(name: string): string {
  const clean = name.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, FAVORITE_NAME_MAX_LENGTH).join('').trim();
}

/** Five decimal places is about 1 m: plenty, and keeps storage tidy. */
const roundCoordinate = (value: number): number => Math.round(value * 1e5) / 1e5;

function parseFavorite(raw: unknown): Favorite | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  const name = normalizeFavoriteName(asString(record.name) ?? '');
  const lat = asNumber(record.lat);
  const lon = asNumber(record.lon);
  if (id == null || name === '' || lat == null || lon == null) return null;
  if (!isValidLatLon({ lat, lon })) return null;
  const zip = asString(record.zip);
  return {
    id,
    name,
    lat,
    lon,
    place: asString(record.place),
    zip: zip != null && ZIP_PATTERN.test(zip) ? zip : null,
    createdAt: asNumber(record.createdAt) ?? 0,
  };
}

/**
 * Reads a stored document of any known version into a clean list. Documents
 * from a newer app version are read best effort (unknown fields are ignored).
 */
export function parseFavoritesDocument(raw: unknown): Favorite[] {
  const document = asRecord(raw);
  const version = asNumber(document.version);
  if (version == null || version < 1) return [];
  // Future migrations go here, for example `if (version === 1) document = migrateV1(document)`.
  const seen = new Set<string>();
  const favorites: Favorite[] = [];
  for (const entry of asArray(document.favorites)) {
    const favorite = parseFavorite(entry);
    if (favorite == null || seen.has(favorite.id)) continue;
    seen.add(favorite.id);
    favorites.push(favorite);
    if (favorites.length >= MAX_FAVORITES) break;
  }
  return favorites;
}

export interface NewFavorite extends LatLon {
  name: string;
  place: string | null;
  zip: string | null;
}

export type AddFavoriteResult =
  | { status: 'added'; favorite: Favorite }
  /** The spot is already saved; nothing changed. */
  | { status: 'duplicate'; favorite: Favorite }
  | { status: 'full' }
  /** The name was empty after cleanup. */
  | { status: 'invalid' };

export type FavoritesListener = (favorites: readonly Favorite[]) => void;

function createId(): string {
  // randomUUID needs a secure context and Safari 15.4+; fall back for local network testing.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class FavoritesStore {
  private favorites: Favorite[];
  private readonly listeners = new Set<FavoritesListener>();
  /** False after storage rejected a write; the list still works for this session. */
  private persisted = true;

  constructor(
    private readonly storage: FavoritesStorage = localFavoritesStorage,
    private readonly newId: () => string = createId,
    private readonly now: () => number = Date.now,
  ) {
    this.favorites = parseFavoritesDocument(storage.read());
  }

  list(): readonly Favorite[] {
    return this.favorites;
  }

  get isFull(): boolean {
    return this.favorites.length >= MAX_FAVORITES;
  }

  /** True when the last change was saved to the device. */
  get isPersisted(): boolean {
    return this.persisted;
  }

  get(id: string): Favorite | undefined {
    return this.favorites.find((favorite) => favorite.id === id);
  }

  /** The saved favorite at (or within about 50 ft of) this point, if any. */
  findAt(point: LatLon): Favorite | undefined {
    return this.favorites.find((favorite) => distanceMiles(favorite, point) < SAME_SPOT_MILES);
  }

  add(input: NewFavorite): AddFavoriteResult {
    const existing = this.findAt(input);
    if (existing != null) return { status: 'duplicate', favorite: existing };
    if (this.isFull) return { status: 'full' };
    const name = normalizeFavoriteName(input.name);
    if (name === '' || !isValidLatLon(input)) return { status: 'invalid' };
    const favorite: Favorite = {
      id: this.newId(),
      name,
      lat: roundCoordinate(input.lat),
      lon: roundCoordinate(input.lon),
      place: input.place,
      zip: input.zip,
      createdAt: this.now(),
    };
    this.commit([...this.favorites, favorite]);
    return { status: 'added', favorite };
  }

  /** Renames a favorite. Returns false for unknown ids or names that are empty after cleanup. */
  rename(id: string, name: string): boolean {
    const clean = normalizeFavoriteName(name);
    const current = this.get(id);
    if (current == null || clean === '') return false;
    if (clean !== current.name) {
      this.commit(this.favorites.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    }
    return true;
  }

  /** Removes a favorite and returns it with its position, so it can be restored (undo). */
  remove(id: string): { favorite: Favorite; index: number } | null {
    const index = this.favorites.findIndex((favorite) => favorite.id === id);
    const favorite = this.favorites[index];
    if (favorite == null) return null;
    this.commit(this.favorites.filter((f) => f.id !== id));
    return { favorite, index };
  }

  /** Puts a removed favorite back where it was. No-op if it would duplicate or overflow. */
  restore(favorite: Favorite, index: number): boolean {
    if (this.get(favorite.id) != null || this.findAt(favorite) != null || this.isFull) return false;
    const next = [...this.favorites];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, favorite);
    this.commit(next);
    return true;
  }

  /** Re-reads storage, for changes made in another tab. */
  reload(): void {
    this.favorites = parseFavoritesDocument(this.storage.read());
    this.notify();
  }

  subscribe(listener: FavoritesListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commit(next: Favorite[]): void {
    this.favorites = next;
    this.persisted = this.storage.write({
      version: FAVORITES_SCHEMA_VERSION,
      favorites: next,
    });
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.favorites);
  }
}
