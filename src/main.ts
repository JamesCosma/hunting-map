import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { App } from './app';
import { STORAGE_KEYS, SYNOPTIC_TOKEN } from './config';
import { FavoritesController, type ResultsTab } from './favoritesController';
import { requireElement } from './lib/dom';
import { FavoritesStore } from './lib/favoritesStore';
import { readJson, writeJson } from './lib/storage';
import { StationBoxLoader, synopticBoxFetcher } from './services/stationsLayerData';
import { CardView } from './ui/cardView';
import { refreshAgeLabels } from './ui/conditionsView';
import { FavoritesView } from './ui/favoritesView';
import { LocationView } from './ui/locationView';
import { MapView } from './ui/mapView';
import { SaveFavoriteView } from './ui/saveFavoriteView';
import { SearchBox } from './ui/searchBox';
import { StationsLayer } from './ui/stationsLayer';
import { Tabs } from './ui/tabs';

function bootstrap(): void {
  const app = new App();

  const map = new MapView(requireElement<HTMLElement>('#map'), {
    onPick: (point) => {
      app.pickPoint(point);
    },
  });

  // The stations layer needs Synoptic; builds without a token simply do not offer it.
  if (SYNOPTIC_TOKEN != null) {
    const stations = new StationsLayer({
      map: map.leafletMap,
      loader: new StationBoxLoader(synopticBoxFetcher(SYNOPTIC_TOKEN)),
    });
    map.addOverlay(
      'Weather stations',
      stations.group,
      readJson(STORAGE_KEYS.stationsLayer) === true,
    );
    stations.group.on('add remove', (event) => {
      writeJson(STORAGE_KEYS.stationsLayer, event.type === 'add');
    });
  }

  new SearchBox(requireElement<HTMLFormElement>('#search-form'), {
    onSelect: (place) => {
      app.select(
        { lat: place.lat, lon: place.lon, label: place.name, detail: place.region },
        { recenter: true },
      );
    },
  });

  const favorites = new FavoritesController(app, new FavoritesStore());
  const locationSummary = requireElement<HTMLElement>('#location-summary');
  const tabs = new Tabs<ResultsTab>(requireElement<HTMLElement>('#results-tabs'), (tab) => {
    favorites.setVisible(tab === 'favorites');
  });

  // Favorites attach first so they hear the selection restored by app.attach().
  favorites.attach({
    tabs,
    list: new FavoritesView(requireElement<HTMLElement>('#favorites'), {
      onOpen: (favorite) => {
        favorites.open(favorite);
      },
      onRename: (id, name) => favorites.rename(id, name),
      onDelete: (id) => {
        favorites.remove(id);
      },
      onUndo: () => {
        favorites.undo();
      },
      onRefresh: () => {
        favorites.refresh();
      },
    }),
    save: new SaveFavoriteView(locationSummary, {
      onSave: (name) => favorites.saveCurrent(name),
      onShowSaved: () => {
        favorites.showCurrent();
      },
    }),
    count: requireElement<HTMLElement>('[data-favorites-count]'),
    results: requireElement<HTMLElement>('#conditions'),
  });

  app.attach({
    map,
    location: new LocationView(locationSummary, () => {
      app.refresh();
    }),
    stationCard: new CardView(requireElement<HTMLElement>('#station-card')),
    modelCard: new CardView(requireElement<HTMLElement>('#model-card')),
  });

  // Keep favorites in sync when they are edited in another tab or window.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.favorites || event.key === null) favorites.reloadFromStorage();
  });

  // Keep "x min ago" labels honest while the page stays open.
  window.setInterval(() => {
    refreshAgeLabels();
  }, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAgeLabels();
  });

  // Leaflet measures its container once; re-measure after rotation or resize.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      map.invalidateSize();
    });
  });
}

bootstrap();
