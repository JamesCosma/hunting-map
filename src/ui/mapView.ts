import L from 'leaflet';
import { DEFAULT_VIEW, STORAGE_KEYS } from '../config';
import { wrapLongitude } from '../lib/geo';
import { readJson, writeJson } from '../lib/storage';
import type { LatLon } from '../types';

interface BaseLayerDefinition {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
}

/**
 * Free tile sources that permit this kind of low-volume, non-commercial use.
 * Each carries the attribution its provider requires.
 */
const BASE_LAYERS: readonly BaseLayerDefinition[] = [
  {
    name: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    name: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
      '<a href="http://viewfinderpanoramas.org">SRTM</a> | Map style &copy; ' +
      '<a href="https://opentopomap.org">OpenTopoMap</a> ' +
      '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    maxNativeZoom: 18,
  },
];

const PIN_ICON = L.divIcon({
  className: 'map-pin',
  html:
    '<svg viewBox="0 0 32 44" width="32" height="44" aria-hidden="true" focusable="false">' +
    '<path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z"/>' +
    '<circle cx="16" cy="16" r="5.5"/></svg>',
  iconSize: [32, 44],
  iconAnchor: [16, 43],
});

export interface MapViewOptions {
  onPick: (point: LatLon) => void;
}

/** Wraps Leaflet: base layers, the single location pin, and click or keyboard picking. */
export class MapView {
  private readonly map: L.Map;
  private marker: L.Marker | null = null;

  constructor(container: HTMLElement, options: MapViewOptions) {
    this.map = L.map(container, {
      center: [DEFAULT_VIEW.lat, DEFAULT_VIEW.lon],
      zoom: DEFAULT_VIEW.zoom,
      zoomControl: true,
      worldCopyJump: true,
      // Keyboard panning stays enabled; Enter drops a pin at the center (see below).
      keyboard: true,
    });

    // Plain prefix: keeps the required Leaflet credit without the default flag graphic.
    this.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    this.addBaseLayers();
    L.control.scale({ imperial: true, metric: false }).addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      options.onPick({ lat: event.latlng.lat, lon: wrapLongitude(event.latlng.lng) });
    });

    // Keyboard users cannot click a point, so Enter or Space drops the pin at the map center.
    container.addEventListener('keydown', (event) => {
      if (event.target !== container || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      const center = this.map.getCenter();
      options.onPick({ lat: center.lat, lon: wrapLongitude(center.lng) });
    });
  }

  private addBaseLayers(): void {
    const layers: Record<string, L.TileLayer> = {};
    for (const definition of BASE_LAYERS) {
      const layerOptions: L.TileLayerOptions = {
        attribution: definition.attribution,
        maxZoom: definition.maxZoom,
        crossOrigin: true,
      };
      if (definition.maxNativeZoom != null) layerOptions.maxNativeZoom = definition.maxNativeZoom;
      layers[definition.name] = L.tileLayer(definition.url, layerOptions);
    }

    const saved = readJson(STORAGE_KEYS.baseLayer);
    const initialName = typeof saved === 'string' && saved in layers ? saved : 'Streets';
    layers[initialName]?.addTo(this.map);
    this.setActiveLayerName(initialName);
    this.addLayerSwitcher(layers, initialName);
  }

  /** Swaps the visible base layer and records the choice. */
  private selectBaseLayer(layers: Record<string, L.TileLayer>, name: string): void {
    for (const [layerName, layer] of Object.entries(layers)) {
      if (layerName === name) layer.addTo(this.map);
      else this.map.removeLayer(layer);
    }
    this.setActiveLayerName(name);
    writeJson(STORAGE_KEYS.baseLayer, name);
  }

  /**
   * A segmented base-layer switcher, in place of Leaflet's default radio list.
   * Real radio inputs keep platform grouping and arrow-key navigation; the
   * control only supplies the styling and the layer swap.
   */
  private addLayerSwitcher(layers: Record<string, L.TileLayer>, initialName: string): void {
    const control = new L.Control({ position: 'topright' });
    control.onAdd = (): HTMLElement => {
      const container = L.DomUtil.create('div', 'layer-switcher');
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'Base map');

      const group = `base-layer-${Math.random().toString(36).slice(2, 8)}`;
      for (const name of Object.keys(layers)) {
        const id = `${group}-${name.toLowerCase()}`;
        const input = L.DomUtil.create('input', 'layer-switcher__input', container);
        input.type = 'radio';
        input.name = group;
        input.id = id;
        input.value = name;
        input.checked = name === initialName;

        const label = L.DomUtil.create('label', 'layer-switcher__option', container);
        label.htmlFor = id;
        label.textContent = name;

        L.DomEvent.on(input, 'change', () => {
          if (input.checked) this.selectBaseLayer(layers, name);
        });
      }

      // Without this, dragging or clicking the control pans the map underneath.
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    };
    control.addTo(this.map);
  }

  /**
   * Records the active layer on the container so the stylesheet can dim bright
   * street and topo tiles in the dark theme while leaving satellite alone.
   */
  private setActiveLayerName(name: string): void {
    this.map.getContainer().dataset.layer = name.toLowerCase();
  }

  /** Moves the pin. `recenter` pans the map, used for search results but not for taps. */
  setPin(point: LatLon, options: { recenter?: boolean; zoom?: number } = {}): void {
    const latLng = L.latLng(point.lat, point.lon);
    if (this.marker == null) {
      this.marker = L.marker(latLng, {
        icon: PIN_ICON,
        keyboard: false,
        interactive: false,
      }).addTo(this.map);
    } else {
      this.marker.setLatLng(latLng);
    }
    if (options.recenter) {
      this.map.setView(latLng, options.zoom ?? Math.max(this.map.getZoom(), 10));
    }
    // The "tap to drop a pin" hint has served its purpose once a pin exists.
    this.map.getContainer().closest('.map-pane')?.setAttribute('data-has-pin', 'true');
  }

  /** Leaflet needs a nudge after its container changes size (orientation change, layout shift). */
  invalidateSize(): void {
    this.map.invalidateSize();
  }
}
