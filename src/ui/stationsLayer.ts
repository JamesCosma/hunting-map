/**
 * "Weather stations" map overlay: every Synoptic station in view, colored by
 * type, clustered at lower zooms, with a legend that doubles as the layer's
 * status line. Pins are 44 px touch targets, focusable, and open a popup
 * with the latest reading on tap, click, or Enter.
 */
import L from 'leaflet';
import { STATIONS_LAYER } from '../config';
import { clusterPoints, type Cluster } from '../lib/cluster';
import { h } from '../lib/dom';
import {
  formatElevation,
  formatHumidity,
  formatSpeed,
  formatTemperature,
  formatWindShort,
} from '../lib/format';
import { describeError, isAbortError } from '../lib/http';
import { STATION_KIND_LABELS } from '../services/synopticNetworks';
import {
  canLoadView,
  type LayerStation,
  type StationBoxLoader,
} from '../services/stationsLayerData';
import type { Bounds, StationKind } from '../types';
import { ageLabel, renderStationType, stationTypeLabel } from './conditionsView';

/** Legend order: most common and most trustworthy first. */
const LEGEND_KINDS: readonly StationKind[] = [
  'airport',
  'raws',
  'snow',
  'road',
  'mesonet',
  'personal',
  'other',
];

const PIN_SIZE = 44;

function readingRow(label: string, value: string): HTMLElement {
  return h('div', { className: 'station-popup__row' }, [
    h('dt', { text: label }),
    h('dd', { text: value }),
  ]);
}

function windText(station: LayerStation): string {
  const { speedMph, gustMph, directionDeg } = station.conditions.wind;
  const base = formatWindShort(speedMph, directionDeg);
  return gustMph != null && (speedMph == null || gustMph > speedMph)
    ? `${base}, gusts ${formatSpeed(gustMph)}`
    : base;
}

/** Popup content for one station, built without innerHTML. */
export function renderStationPopup(station: LayerStation): HTMLElement {
  const elevation =
    station.elevationFt == null
      ? 'Elevation not listed'
      : `Elevation ${formatElevation(station.elevationFt)}${station.elevationCheck == null ? '' : ' (corrected from terrain)'}`;
  return h('div', { className: 'station-popup' }, [
    h('p', { className: 'station-popup__title' }, [
      h('span', { className: 'station-popup__name', text: station.name }),
      h('span', { className: 'card__source-id', text: station.id }),
    ]),
    h('p', { className: 'station-popup__type' }, [renderStationType(station)]),
    h('p', { className: 'station-popup__detail', text: elevation }),
    h('dl', { className: 'station-popup__readings' }, [
      readingRow('Temperature', formatTemperature(station.conditions.temperatureF)),
      readingRow('Humidity', formatHumidity(station.conditions.relativeHumidity)),
      readingRow('Wind', windText(station)),
    ]),
    station.observedAt == null
      ? h('p', { className: 'station-popup__detail', text: 'No recent reading' })
      : h('p', { className: 'station-popup__detail' }, [
          'Reported ',
          ageLabel(station.observedAt),
          station.stale ? ' (older than 2 hours)' : null,
        ]),
  ]);
}

/** Accessible name for a pin: name, type and temperature. */
export function stationPinLabel(station: LayerStation): string {
  const reading = station.stale
    ? 'no recent reading'
    : formatTemperature(station.conditions.temperatureF);
  return `${station.name}, ${stationTypeLabel(station)}, ${reading}`;
}

function stationIcon(station: LayerStation): L.DivIcon {
  const element = h('span', {
    className: `station-pin__dot${station.stale ? ' station-pin__dot--stale' : ''}`,
    attrs: { 'data-kind': station.kind },
  });
  return L.divIcon({
    className: 'station-pin',
    html: element,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -10],
  });
}

function clusterIcon(count: number): L.DivIcon {
  const size = count >= 100 ? 'large' : count >= 10 ? 'medium' : 'small';
  return L.divIcon({
    className: 'station-cluster',
    html: h('span', {
      className: `station-cluster__count station-cluster__count--${size}`,
      text: String(count),
    }),
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
  });
}

/** Gives a marker's element button semantics once Leaflet has created it. */
function labelMarker(marker: L.Marker, label: string): void {
  const element = marker.getElement();
  if (element == null) return;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
  element.removeAttribute('title');
}

export type LegendState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'zoom' }
  | { kind: 'ready'; count: number }
  | { kind: 'error'; message: string };

export function legendStatusText(state: LegendState): string {
  switch (state.kind) {
    case 'idle':
      return 'Weather stations';
    case 'loading':
      return 'Loading stations…';
    case 'zoom':
      return 'Zoom in to see stations';
    case 'ready':
      if (state.count === 0) return 'No stations in view';
      return `${state.count.toLocaleString('en-US')} ${state.count === 1 ? 'station' : 'stations'} in view`;
    case 'error':
      return `Couldn’t load stations. ${state.message}`;
  }
}

/** Legend and status as a Leaflet control. Collapsed by default on phones. */
class LegendControl extends L.Control {
  private readonly root: HTMLDetailsElement;
  private readonly status: HTMLElement;
  private readonly retry: HTMLButtonElement;

  constructor(onRetry: () => void) {
    super({ position: 'bottomright' });
    this.status = h('span', {
      className: 'stations-legend__status',
      attrs: { 'aria-live': 'polite' },
    });
    this.retry = h('button', {
      className: 'stations-legend__retry',
      text: 'Retry',
      attrs: { type: 'button', hidden: '' },
      on: { click: onRetry },
    });
    this.root = h('details', { className: 'stations-legend leaflet-control' }, [
      h('summary', { className: 'stations-legend__summary' }, [
        h('span', { className: 'stations-legend__title', text: 'Stations' }),
        this.status,
      ]),
      h(
        'ul',
        { className: 'stations-legend__list' },
        LEGEND_KINDS.map((kind) =>
          h('li', { className: 'station-type', attrs: { 'data-kind': kind } }, [
            h('span', { className: 'station-type__dot', attrs: { 'aria-hidden': 'true' } }),
            STATION_KIND_LABELS[kind],
          ]),
        ),
      ),
      h('p', { className: 'stations-legend__note' }, [
        h('span', {
          className: 'station-type__dot station-type__dot--stale',
          attrs: { 'aria-hidden': 'true' },
        }),
        'Hollow: no reading in 2 hours',
      ]),
      this.retry,
    ]);
    this.root.open = window.matchMedia('(min-width: 721px)').matches;
    L.DomEvent.disableClickPropagation(this.root);
    L.DomEvent.disableScrollPropagation(this.root);
  }

  override onAdd(): HTMLElement {
    return this.root;
  }

  setState(state: LegendState): void {
    this.status.textContent = legendStatusText(state);
    this.root.dataset.state = state.kind;
    this.retry.hidden = state.kind !== 'error';
    // An error needs the Retry button, which lives inside the panel.
    if (state.kind === 'error') this.root.open = true;
  }
}

function viewBounds(map: L.Map): Bounds {
  const bounds = map.getBounds();
  return {
    south: Math.max(-90, bounds.getSouth()),
    north: Math.min(90, bounds.getNorth()),
    west: Math.max(-180, bounds.getWest()),
    east: Math.min(180, bounds.getEast()),
  };
}

export interface StationsLayerOptions {
  map: L.Map;
  loader: StationBoxLoader;
}

export class StationsLayer {
  /** The overlay the layers control toggles. */
  readonly group = L.layerGroup();
  private readonly legend: LegendControl;
  private active = false;
  private stations: LayerStation[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  /** Station id for each single-station marker, used to keep an open popup across redraws. */
  private readonly markerStations = new WeakMap<L.Layer, string>();

  constructor(private readonly options: StationsLayerOptions) {
    this.legend = new LegendControl(() => {
      void this.refresh();
    });
    this.group.on('add', () => {
      this.enable();
    });
    this.group.on('remove', () => {
      this.disable();
    });
  }

  private readonly onMoveEnd = (): void => {
    // Re-cluster right away from what is loaded, then load the new view after a pause.
    this.render();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.refresh();
    }, STATIONS_LAYER.debounceMs);
  };

  private get map(): L.Map | null {
    return this.active ? this.options.map : null;
  }

  private enable(): void {
    this.active = true;
    this.legend.addTo(this.options.map);
    this.options.map.on('moveend', this.onMoveEnd);
    void this.refresh();
  }

  private disable(): void {
    this.active = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
    this.options.map.off('moveend', this.onMoveEnd);
    this.legend.remove();
    this.group.clearLayers();
  }

  private async refresh(): Promise<void> {
    const map = this.map;
    if (map == null) return;
    const view = viewBounds(map);
    if (!canLoadView(view, map.getZoom())) {
      this.controller?.abort();
      this.stations = [];
      this.group.clearLayers();
      this.legend.setState({ kind: 'zoom' });
      return;
    }

    const cached = this.options.loader.cached(view);
    if (cached != null) {
      this.show(cached);
      return;
    }

    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.legend.setState({ kind: 'loading' });
    try {
      const stations = await this.options.loader.load(view, controller.signal);
      if (this.controller === controller) {
        this.controller = null;
        this.show(stations);
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      this.legend.setState({ kind: 'error', message: describeError(error) });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private show(stations: LayerStation[]): void {
    this.stations = stations;
    this.render();
  }

  /**
   * Draws the loaded stations that fall in the padded view, clustered for the
   * current zoom. A pin whose popup is open is kept as is, so the popup
   * survives the map panning to fit it.
   */
  private render(): void {
    const map = this.map;
    if (map == null) return;
    const zoom = map.getZoom();
    if (!canLoadView(viewBounds(map), zoom)) {
      this.group.clearLayers();
      this.legend.setState({ kind: 'zoom' });
      return;
    }

    const bounds = map.getBounds();
    const paddedView = bounds.pad(0.2);
    const visible = this.stations.filter((station) =>
      paddedView.contains([station.lat, station.lon]),
    );
    const clusters: Cluster<LayerStation>[] =
      zoom > STATIONS_LAYER.clusterMaxZoom
        ? visible.map((station) => ({ x: 0, y: 0, items: [station] }))
        : clusterPoints(
            visible.map((station) => {
              const point = map.latLngToLayerPoint([station.lat, station.lon]);
              return { x: point.x, y: point.y, item: station };
            }),
            STATIONS_LAYER.clusterRadiusPx,
          );

    let keptId: string | null = null;
    for (const layer of this.group.getLayers()) {
      const id = this.markerStations.get(layer);
      if (id != null && layer.isPopupOpen()) keptId = id;
      else this.group.removeLayer(layer);
    }
    for (const cluster of clusters) {
      const [first] = cluster.items;
      if (first == null) continue;
      if (cluster.items.length > 1) this.addCluster(map, cluster);
      else if (first.id !== keptId) this.addStation(first);
    }

    if (this.controller == null) {
      this.legend.setState({
        kind: 'ready',
        count: visible.filter((station) => bounds.contains([station.lat, station.lon])).length,
      });
    }
  }

  private addStation(station: LayerStation): void {
    const marker = L.marker([station.lat, station.lon], {
      icon: stationIcon(station),
      keyboard: true,
      riseOnHover: true,
    });
    marker.bindPopup(() => renderStationPopup(station), {
      className: 'station-popup-container',
      maxWidth: 280,
      // Keep clear of the zoom buttons (top left) and the legend (bottom right).
      autoPanPaddingTopLeft: [56, 16],
      autoPanPaddingBottomRight: [16, 60],
    });
    marker.on('add', () => {
      labelMarker(marker, stationPinLabel(station));
    });
    this.markerStations.set(marker, station.id);
    this.group.addLayer(marker);
  }

  private addCluster(map: L.Map, cluster: Cluster<LayerStation>): void {
    const center = map.layerPointToLatLng([cluster.x, cluster.y]);
    const count = cluster.items.length;
    const marker = L.marker(center, { icon: clusterIcon(count), keyboard: true });
    marker.on('click', () => {
      const bounds = L.latLngBounds(cluster.items.map((s) => [s.lat, s.lon] as [number, number]));
      map.fitBounds(bounds.pad(0.3), { maxZoom: STATIONS_LAYER.clusterMaxZoom + 1 });
    });
    marker.on('add', () => {
      labelMarker(marker, `${count} weather stations. Zoom in to see them.`);
    });
    this.group.addLayer(marker);
  }
}
