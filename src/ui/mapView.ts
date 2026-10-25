import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
  private layersControl: L.Control.Layers | null = null;

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

    this.layersControl = L.control
      .layers(layers, undefined, {
        position: 'topright',
        collapsed: window.matchMedia('(max-width: 720px)').matches,
      })
      .addTo(this.map);
    this.map.on('baselayerchange', (event: L.LayersControlEvent) => {
      writeJson(STORAGE_KEYS.baseLayer, event.name);
    });
  }

  /** The underlying Leaflet map, for overlays that manage their own markers. */
  get leafletMap(): L.Map {
    return this.map;
  }

  /** Adds a toggleable overlay to the layers control, switched on when `active`. */
  addOverlay(name: string, layer: L.Layer, active: boolean): void {
    this.layersControl?.addOverlay(layer, name);
    if (active) layer.addTo(this.map);
  }

  /** Moves the pin. `recenter` pans the map, used for search results but not for taps. */
  setPin(point: LatLon, options: { recenter?: boolean; zoom?: number } = {}): void {
    const latLng = L.latLng(point.lat, point.lon);
    if (this.marker == null) {
      this.marker = L.marker(latLng, {
        icon: PIN_ICON,
        keyboard: false,
        interactive: false,
        // Keep the chosen spot above station pins.
        zIndexOffset: 1000,
      }).addTo(this.map);
    } else {
      this.marker.setLatLng(latLng);
    }
    if (options.recenter) {
      this.map.setView(latLng, options.zoom ?? Math.max(this.map.getZoom(), 10));
    }
  }

  /** Leaflet needs a nudge after its container changes size (orientation change, layout shift). */
  invalidateSize(): void {
    this.map.invalidateSize();
  }
}
