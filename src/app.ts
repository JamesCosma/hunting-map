import { PLACE_ZOOM, REVERSE_GEOCODE_DEBOUNCE_MS, STORAGE_KEYS } from './config';
import { formatCoordinates } from './lib/format';
import { isValidLatLon } from './lib/geo';
import { describeError, isAbortError } from './lib/http';
import { asNumber, asRecord, asString } from './lib/json';
import { readJson, writeJson } from './lib/storage';
import { getModelEstimate } from './services/openMeteo';
import { getCachedPlace, reverseGeocode } from './services/reverseGeocoding';
import { getNearestStation, type StationsResult } from './services/stations';
import type { ChosenLocation, LatLon, ModelEstimate, PlaceSummary } from './types';
import { CardView } from './ui/cardView';
import { renderModelEstimate, renderStationObservation } from './ui/conditionsView';
import { DROPPED_PIN_LABEL, LocationView } from './ui/locationView';
import type { MapView } from './ui/mapView';

/** The current spot and, once looked up, its place name and ZIP. */
export interface Selection {
  location: ChosenLocation;
  place: PlaceSummary | null;
}

export type SelectionListener = (selection: Selection) => void;

export interface AppViews {
  map: MapView;
  location: LocationView;
  stationCard: CardView;
  modelCard: CardView;
}

/**
 * Coordinates the views and data services. Each new selection cancels the
 * previous one's in-flight requests, so a slow response for an old pin can
 * never overwrite data for the current pin.
 *
 * The place name lookup runs separately from the weather requests: it is
 * debounced (Nominatim allows one request per second) and its failure only
 * hides the ZIP, never the conditions.
 */
export class App {
  private current: ChosenLocation | null = null;
  private controller: AbortController | null = null;
  private placeController: AbortController | null = null;
  private placeTimer: ReturnType<typeof setTimeout> | undefined;
  private place: PlaceSummary | null = null;
  private views: AppViews | null = null;
  private readonly listeners = new Set<SelectionListener>();

  attach(views: AppViews): void {
    this.views = views;
    const saved = loadSavedLocation();
    if (saved == null) {
      views.stationCard.showPlaceholder('Search for a place or tap the map to see conditions.');
      views.modelCard.showPlaceholder('A model estimate for the exact spot will appear here.');
    } else {
      this.select(saved, { recenter: true, persist: false });
    }
  }

  get selection(): Selection | null {
    return this.current == null ? null : { location: this.current, place: this.place };
  }

  /** Notifies on every new selection and again when its place name arrives. */
  onSelectionChange(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Called when the user taps the map. */
  pickPoint(point: LatLon): void {
    this.select(
      { ...point, label: DROPPED_PIN_LABEL, detail: formatCoordinates(point.lat, point.lon) },
      { recenter: false },
    );
  }

  select(location: ChosenLocation, options: { recenter: boolean; persist?: boolean }): void {
    if (!isValidLatLon(location) || this.views == null) return;
    this.current = location;
    this.views.map.setPin(location, { recenter: options.recenter, zoom: PLACE_ZOOM });
    this.views.location.showLocation(location);
    if (options.persist !== false) writeJson(STORAGE_KEYS.lastLocation, location);
    this.load();
    this.loadPlace();
    this.notify();
  }

  refresh(): void {
    if (this.current == null) return;
    this.load();
    // Place names do not change; only retry the lookup if it has not succeeded yet.
    if (this.place == null) this.loadPlace();
  }

  private loadPlace(): void {
    const views = this.views;
    const location = this.current;
    if (views == null || location == null) return;

    clearTimeout(this.placeTimer);
    this.placeController?.abort();
    this.placeController = null;
    this.place = null;

    const cached = getCachedPlace(location);
    if (cached != null) {
      this.showPlace(cached);
      return;
    }

    views.location.setPlace({ kind: 'loading' });
    this.placeTimer = setTimeout(() => {
      const controller = new AbortController();
      this.placeController = controller;
      reverseGeocode(location, { signal: controller.signal }).then(
        (place) => {
          if (!controller.signal.aborted) this.showPlace(place);
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          views.location.setPlace({ kind: 'unavailable' });
        },
      );
    }, REVERSE_GEOCODE_DEBOUNCE_MS);
  }

  private showPlace(place: PlaceSummary): void {
    this.place = place;
    this.views?.location.setPlace({ kind: 'ready', place });
    this.notify();
  }

  private notify(): void {
    const selection = this.selection;
    if (selection == null) return;
    for (const listener of this.listeners) listener(selection);
  }

  private load(): void {
    const views = this.views;
    const location = this.current;
    if (views == null || location == null) return;

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;

    views.location.setRefreshing(true);
    views.location.setElevation({ kind: 'loading' });
    views.stationCard.showLoading();
    views.modelCard.showLoading();

    const station = getNearestStation(location, { signal }).then(
      (result) => {
        if (!signal.aborted) this.renderStation(result);
      },
      (error: unknown) => {
        if (signal.aborted || isAbortError(error)) return;
        views.stationCard.showError(describeError(error), () => {
          this.load();
        });
      },
    );

    const model = getModelEstimate(location, { signal }).then(
      (estimate) => {
        if (!signal.aborted) this.renderModel(estimate);
      },
      (error: unknown) => {
        if (signal.aborted || isAbortError(error)) return;
        views.location.setElevation({ kind: 'unavailable' });
        views.modelCard.showError(describeError(error), () => {
          this.load();
        });
      },
    );

    void Promise.allSettled([station, model]).then(() => {
      if (this.controller === controller) {
        this.controller = null;
        views.location.setRefreshing(false);
      }
    });
  }

  private renderStation(result: StationsResult): void {
    const card = this.views?.stationCard;
    if (card == null) return;
    switch (result.status) {
      case 'ok':
        card.showContent(
          ...renderStationObservation(result.observation, {
            spotElevationFt: result.spotElevationFt,
            synopticUnavailable: result.synopticUnavailable,
          }),
        );
        break;
      case 'outside-coverage':
        card.showNotice(
          'No weather stations here',
          'This spot is outside the station networks we search. Use the model estimate below.',
        );
        break;
      case 'no-recent-data':
        card.showNotice(
          'No recent station readings',
          result.stationsChecked > 0
            ? `None of the ${result.stationsChecked} nearest stations reported in the last 2 hours. Use the model estimate below.`
            : 'No nearby station reported in the last 2 hours. Use the model estimate below.',
        );
        break;
    }
  }

  private renderModel(estimate: ModelEstimate): void {
    const views = this.views;
    if (views == null) return;
    views.location.setElevation({ kind: 'ready', feet: estimate.elevationFt });
    views.modelCard.showContent(...renderModelEstimate(estimate));
  }
}

/** Restores the last chosen spot, ignoring anything malformed in storage. */
function loadSavedLocation(): ChosenLocation | null {
  const record = asRecord(readJson(STORAGE_KEYS.lastLocation));
  const lat = asNumber(record.lat);
  const lon = asNumber(record.lon);
  const label = asString(record.label);
  if (lat == null || lon == null || label == null || !isValidLatLon({ lat, lon })) return null;
  const detail = asString(record.detail);
  return detail == null ? { lat, lon, label } : { lat, lon, label, detail };
}
