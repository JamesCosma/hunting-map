import { PLACE_ZOOM, STORAGE_KEYS } from './config';
import { formatCoordinates } from './lib/format';
import { isValidLatLon } from './lib/geo';
import { describeError, isAbortError } from './lib/http';
import { asNumber, asRecord, asString } from './lib/json';
import { readJson, writeJson } from './lib/storage';
import { getModelEstimate } from './services/openMeteo';
import { getNearestObservation, type NwsResult } from './services/nws';
import type { ChosenLocation, LatLon, ModelEstimate } from './types';
import { CardView } from './ui/cardView';
import { renderModelEstimate, renderStationObservation } from './ui/conditionsView';
import { LocationView } from './ui/locationView';
import type { MapView } from './ui/mapView';

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
 */
export class App {
  private current: ChosenLocation | null = null;
  private controller: AbortController | null = null;
  private views: AppViews | null = null;

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

  /** Called when the user taps the map. */
  pickPoint(point: LatLon): void {
    this.select(
      { ...point, label: 'Dropped pin', detail: formatCoordinates(point.lat, point.lon) },
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
  }

  refresh(): void {
    if (this.current != null) this.load();
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

    const station = getNearestObservation(location, { signal }).then(
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

  private renderStation(result: NwsResult): void {
    const card = this.views?.stationCard;
    if (card == null) return;
    switch (result.status) {
      case 'ok':
        card.showContent(...renderStationObservation(result.observation));
        break;
      case 'outside-coverage':
        card.showNotice(
          'No NWS stations here',
          'This spot is outside National Weather Service coverage. Use the model estimate below.',
        );
        break;
      case 'no-recent-data':
        card.showNotice(
          'No recent station readings',
          `None of the ${result.stationsChecked} nearest stations reported in the last 2 hours. Use the model estimate below.`,
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
