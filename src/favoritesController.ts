import type { App } from './app';
import { FAVORITES_STALE_AFTER_MS, MAX_FAVORITES } from './config';
import type { FavoritesStore } from './lib/favoritesStore';
import { formatCoordinates } from './lib/format';
import { describeError, isAbortError } from './lib/http';
import { getModelEstimates } from './services/openMeteo';
import type { ChosenLocation, Favorite, ModelEstimate } from './types';
import type { FavoritesView, RowConditions } from './ui/favoritesView';
import { isDroppedPin } from './ui/locationView';
import type { SaveFavoriteView, SaveState } from './ui/saveFavoriteView';
import type { Tabs } from './ui/tabs';

export type ResultsTab = 'conditions' | 'favorites';

export interface FavoritesViews {
  tabs: Tabs<ResultsTab>;
  list: FavoritesView;
  save: SaveFavoriteView;
  /** Count badge on the Favorites tab. */
  count: HTMLElement;
  /** Element that scrolls the results on wide screens. */
  results: HTMLElement;
}

/**
 * Connects saved favorites to the rest of the app: saving the selected spot,
 * the Favorites list with live conditions, and jumping back to a favorite.
 *
 * Conditions for every favorite come from one batched Open-Meteo request,
 * made when the list is shown and its data is missing or older than five
 * minutes. Values already on screen stay visible while a refresh runs.
 */
export class FavoritesController {
  private views: FavoritesViews | null = null;
  /** Latest estimate per favorite id; null means the batch had no usable entry for it. */
  private readonly estimates = new Map<string, ModelEstimate | null>();
  private updatedAt: Date | null = null;
  private controller: AbortController | null = null;
  private error: string | null = null;
  private visible = false;
  private lastRemoved: { favorite: Favorite; index: number } | null = null;
  /** Coordinates the save form was last shown for, to close it when the spot changes. */
  private saveTarget: string | null = null;

  constructor(
    private readonly app: App,
    private readonly store: FavoritesStore,
  ) {}

  attach(views: FavoritesViews): void {
    this.views = views;
    this.store.subscribe(() => {
      this.handleFavoritesChanged();
    });
    this.app.onSelectionChange(() => {
      this.updateSaveState();
    });
    this.updateSaveState();
    this.updateCount();
    this.render();
  }

  /** Called when the Favorites tab is shown or hidden. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.refreshIfStale();
    } else {
      this.lastRemoved = null;
      this.views?.list.clearUndo();
      this.views?.list.setEditing(false);
    }
  }

  refresh(): void {
    const favorites = this.store.list();
    if (favorites.length === 0) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.error = null;
    this.render();

    getModelEstimates(favorites, { signal: controller.signal }).then(
      (results) => {
        if (controller.signal.aborted) return;
        favorites.forEach((favorite, index) => {
          this.estimates.set(favorite.id, results[index] ?? null);
        });
        this.updatedAt = new Date();
        this.finish(controller);
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        this.error = describeError(error);
        this.finish(controller);
      },
    );
  }

  /** Jumps to a favorite on the map and loads its full station and model detail. */
  open(favorite: Favorite): void {
    const views = this.views;
    if (views == null) return;
    const location: ChosenLocation =
      favorite.place == null
        ? { lat: favorite.lat, lon: favorite.lon, label: favorite.name }
        : { lat: favorite.lat, lon: favorite.lon, label: favorite.name, detail: favorite.place };
    views.tabs.select('conditions', { focus: true });
    this.app.select(location, { recenter: true });
    // Bring the map and the selected spot summary into view.
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    window.scrollTo({ top: 0, behavior });
    views.results.scrollTo({ top: 0, behavior });
  }

  /** Saves the selected spot. Returns an error message for the form, or null. */
  saveCurrent(name: string): string | null {
    const selection = this.app.selection;
    if (selection == null) return 'Choose a spot on the map first.';
    const { location, place } = selection;
    const result = this.store.add({
      lat: location.lat,
      lon: location.lon,
      name,
      place: place?.label ?? (isDroppedPin(location) ? null : (location.detail ?? null)),
      zip: place?.zip ?? null,
    });
    switch (result.status) {
      case 'added':
      case 'duplicate':
        return null;
      case 'full':
        return `You have ${MAX_FAVORITES} favorites, the most this device can hold. Delete one first.`;
      case 'invalid':
        return 'Enter a name for this spot.';
    }
  }

  /** Shows the Favorites list with the selected spot's row focused. */
  showCurrent(): void {
    const selection = this.app.selection;
    const favorite = selection == null ? undefined : this.store.findAt(selection.location);
    if (this.views == null || favorite == null) return;
    this.views.tabs.select('favorites', { focus: false });
    this.views.list.focusFavorite(favorite.id);
  }

  /** Picks up changes another tab made to stored favorites. */
  reloadFromStorage(): void {
    this.store.reload();
  }

  rename(id: string, name: string): boolean {
    return this.store.rename(id, name);
  }

  remove(id: string): void {
    const removed = this.store.remove(id);
    if (removed == null) return;
    this.lastRemoved = removed;
    this.views?.list.showUndo(removed.favorite.name);
  }

  undo(): void {
    const removed = this.lastRemoved;
    this.lastRemoved = null;
    this.views?.list.clearUndo();
    if (removed != null) this.store.restore(removed.favorite, removed.index);
  }

  private finish(controller: AbortController): void {
    if (this.controller === controller) this.controller = null;
    this.render();
  }

  private refreshIfStale(): void {
    const favorites = this.store.list();
    if (favorites.length === 0 || this.controller != null) return;
    const missing = favorites.some((favorite) => !this.estimates.has(favorite.id));
    const age = this.updatedAt == null ? Infinity : Date.now() - this.updatedAt.getTime();
    if (missing || age > FAVORITES_STALE_AFTER_MS) this.refresh();
  }

  private handleFavoritesChanged(): void {
    // Drop data for deleted favorites, but keep the one that can still be undone.
    const keep = new Set(this.store.list().map((favorite) => favorite.id));
    if (this.lastRemoved != null) keep.add(this.lastRemoved.favorite.id);
    for (const id of this.estimates.keys()) if (!keep.has(id)) this.estimates.delete(id);

    this.updateSaveState();
    this.updateCount();
    this.render();
    if (this.visible) this.refreshIfStale();
  }

  private updateSaveState(): void {
    const selection = this.app.selection;
    if (this.views == null || selection == null) return;
    const { location, place } = selection;
    const target = `${String(location.lat)},${String(location.lon)}`;
    if (target !== this.saveTarget) {
      // A name typed for the previous spot must never be saved to a new one.
      this.saveTarget = target;
      this.views.save.close();
    }
    const saved = this.store.findAt(location);
    let state: SaveState;
    if (saved != null) state = { kind: 'saved', name: saved.name };
    else if (this.store.isFull) state = { kind: 'full', max: MAX_FAVORITES };
    else state = { kind: 'unsaved', suggestedName: suggestName(location, place?.label ?? null) };
    this.views.save.setState(state);
  }

  private updateCount(): void {
    if (this.views == null) return;
    const count = this.store.list().length;
    this.views.count.textContent = String(count);
    this.views.count.hidden = count === 0;
  }

  private render(): void {
    const views = this.views;
    if (views == null) return;
    const refreshing = this.controller != null;
    const conditions = new Map<string, RowConditions>();
    for (const favorite of this.store.list()) {
      const estimate = this.estimates.get(favorite.id);
      if (estimate != null) conditions.set(favorite.id, { kind: 'ready', estimate });
      else if (estimate === null) conditions.set(favorite.id, { kind: 'error' });
      else
        conditions.set(favorite.id, this.error == null ? { kind: 'loading' } : { kind: 'error' });
    }
    views.list.render({
      favorites: this.store.list(),
      conditions,
      updatedAt: this.updatedAt,
      refreshing,
      error: this.error,
      storageWarning: !this.store.isPersisted,
      max: MAX_FAVORITES,
    });
  }
}

/** Default favorite name: the place name for dropped pins, the searched name otherwise. */
export function suggestName(location: ChosenLocation, placeLabel: string | null): string {
  if (!isDroppedPin(location)) return location.label;
  return placeLabel ?? `Spot at ${formatCoordinates(location.lat, location.lon)}`;
}
