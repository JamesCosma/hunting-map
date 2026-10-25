/*
 * Leaflet's stylesheet comes first so the app's own rules win where the two
 * overlap. Imported from mapView.ts it would land last in the bundle, and
 * Leaflet's white control backgrounds would override the dark theme.
 */
import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { App } from './app';
import { requireElement } from './lib/dom';
import { CardView } from './ui/cardView';
import { refreshAgeLabels } from './ui/conditionsView';
import { LocationView } from './ui/locationView';
import { MapView } from './ui/mapView';
import { SearchBox } from './ui/searchBox';
import { ThemeToggle } from './ui/themeToggle';

function bootstrap(): void {
  const app = new App();

  new ThemeToggle(requireElement<HTMLElement>('#theme-toggle'));

  const map = new MapView(requireElement<HTMLElement>('#map'), {
    onPick: (point) => {
      app.pickPoint(point);
    },
  });

  new SearchBox(requireElement<HTMLFormElement>('#search-form'), {
    onSelect: (place) => {
      app.select(
        { lat: place.lat, lon: place.lon, label: place.name, detail: place.region },
        { recenter: true },
      );
    },
  });

  app.attach({
    map,
    location: new LocationView(requireElement<HTMLElement>('#location-summary'), () => {
      app.refresh();
    }),
    stationCard: new CardView(requireElement<HTMLElement>('#station-card')),
    modelCard: new CardView(requireElement<HTMLElement>('#model-card')),
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
