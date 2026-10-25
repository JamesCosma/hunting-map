# Hunting Map

Current conditions and elevation for any spot in the United States, built for hunting and off-road trips where signal is weak and the nearest town is far away.

**Live app:** https://jamescosma.github.io/hunting-map/

Pick a spot by searching for a place name or ZIP code, or by tapping the map. Hunting Map then shows two independent readings side by side:

- **Nearest station (measured):** the latest real observation from the closest National Weather Service station that has reported recently, with the station name, its distance from your spot, and how old the reading is.
- **This exact spot (model estimate):** an Open-Meteo weather model estimate for the exact coordinates you chose. This also covers places outside NWS coverage.

## Features

- Search by town, peak, range, or area name (for example `Tonopah, NV` or `Ruby Mountains`) or by 5 digit US ZIP code (`89031`).
- Tap or click the map to drop a pin. Keyboard users can pan with the arrow keys and press Enter to drop a pin at the map center.
- Temperature (°F), relative humidity, wind speed and gusts (mph), and wind direction shown both as a compass arrow and as text such as `From SW (225°)`.
- Elevation of the chosen spot in feet, plus the elevation of the reporting station.
- Automatic fallback past stale or empty stations to the next nearest one, with a note when closer stations were skipped.
- Streets, Topo (OpenTopoMap), and Satellite (Esri World Imagery) base maps. Your choice is remembered.
- Remembers your last spot, so reopening the app from the home screen shows it right away.
- Works in Safari on iPhone, including Add to Home Screen (web manifest, Apple touch icon, standalone mode, safe-area insets), and in desktop Chrome and Edge.
- Loading skeletons, clear "not reported" labels for missing values, and friendly error messages with a retry button.

## Data sources and why

| Need                         | Source                                                                                                                                                                                             | Why                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Measured observations        | [NWS API](https://www.weather.gov/documentation/services-web-api) (`api.weather.gov`)                                                                                                              | Official, free, no key, CORS enabled. Real sensor readings are the ground truth when a station is close.                                                                                                       |
| Model estimate and elevation | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)                                                                                                                                          | Free, no key, CORS enabled. Gives values for the exact coordinates (stations can be 30+ miles away in Nevada) and works outside NWS coverage. Its `elevation` field comes from a 90 m digital elevation model. |
| Place name search            | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)                                                                                                                               | Free, no key, CORS enabled, and its GeoNames data includes peaks, ranges, and other natural features, not just towns.                                                                                          |
| Name search fallback         | [Nominatim](https://nominatim.org/) (OpenStreetMap)                                                                                                                                                | Used only when Open-Meteo finds nothing. Called only on explicit submit and at most once per second, per the [usage policy](https://operations.osmfoundation.org/policies/nominatim/).                         |
| ZIP code search              | [Zippopotam.us](https://www.zippopotam.us/)                                                                                                                                                        | Free, no key, CORS enabled, returns coordinates for US ZIP codes.                                                                                                                                              |
| Map tiles                    | [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/), [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Free tile sources with attribution shown on the map.                                                                                                                                                           |

All of these were verified to return `Access-Control-Allow-Origin: *` and to work from a real browser (headless Chromium) against the production build.

### How the station is chosen

1. `GET /points/{lat},{lon}` returns the forecast grid and the URL of its observation stations. A 404 here means the spot is outside NWS coverage.
2. The station list is sorted by true great-circle distance from your spot (not the grid cell).
3. `GET /stations/{id}/observations/latest` is requested for the nearest 3 stations in parallel, then the next 3, up to 9.
4. The first station, in distance order, whose reading is at most 2 hours old and includes a temperature is shown. Other fields that the station does not measure (wind is often missing at small stations) are labeled "Not reported" rather than causing a skip.

## Architecture

Plain TypeScript with no UI framework. The app is small, and direct DOM rendering keeps the bundle light (about 54 kB gzipped including Leaflet) for slow connections.

```
src/
  main.ts               Entry point: wires views to the app controller
  app.ts                Controller: selection, request cancellation, rendering by state
  config.ts             Endpoints, timeouts, thresholds, storage keys
  types.ts              Shared domain types (Conditions, StationObservation, ...)
  lib/
    http.ts             fetchJson with timeout, retry with backoff, typed RequestError
    json.ts             Runtime guards for untyped API payloads
    units.ts            Unit conversions, including NWS WMO unit codes
    geo.ts              Haversine distance, 16 point compass, coordinate helpers
    format.ts           Display formatting (temperatures, ages, wind text)
    dom.ts              Tiny element builder (textContent only, never innerHTML)
    storage.ts          localStorage wrapper that never throws
    usStates.ts         State names and abbreviations for "Town, ST" search
  services/
    nws.ts              Nearest usable station observation
    openMeteo.ts        Model estimate and elevation for the exact point
    geocoding.ts        Query classification, ZIP, name, and fallback search
  ui/
    mapView.ts          Leaflet map, base layers, pin, click and keyboard picking
    searchBox.ts        Search form and keyboard navigable results
    cardView.ts         Card states: placeholder, loading, content, notice, error
    conditionsView.ts   Metric and wind rendering shared by both sources
    compass.ts          SVG wind compass with an accessible label
    locationView.ts     Selected spot summary and elevation
  styles/
    tokens.css          Spacing, type, color, and radius design tokens
    base.css, layout.css, components.css
tests/                  Vitest unit tests (services use stubbed fetch, no network)
public/                 Web manifest and icons
```

Design choices worth knowing:

- **Services are pure and testable.** Each service takes an optional `fetchImpl` and returns typed results. Expected outcomes such as "outside NWS coverage" are part of the return type, not exceptions.
- **Every API payload is treated as `unknown`** and narrowed field by field, so an upstream schema change shows "Not reported" instead of crashing.
- **Stale responses never win.** Each new selection aborts the previous one's requests through an `AbortController`.
- **Weak signal handling.** 15 second timeouts, one retry with backoff for transient failures (network errors, 429, 5xx), and no preflight requests (only CORS safelisted headers are sent).
- **Accessibility.** Labeled controls, a skip link, visible focus rings, 44 px tap targets, live regions for loading and errors, an accessible name on the compass, keyboard pin dropping, reduced motion support, and text colors that meet WCAG AA contrast.

## Local development

Requires Node.js 20.19 or newer (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173/hunting-map/
npm run lint       # ESLint (type aware) and Prettier check
npm test           # Vitest unit tests
npm run build      # Type check and production build into dist/
npm run preview    # Serve the production build at http://localhost:4173/hunting-map/
```

`npm run format` applies Prettier formatting.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: it installs dependencies, lints, tests, builds, and deploys `dist/` to GitHub Pages with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Pull requests run the same checks without deploying.

One time setup: in the repository settings, under **Pages**, set **Source** to **GitHub Actions**.

The Vite `base` is `/hunting-map/` to match the project Pages URL. If the repository is renamed, update `base` in `vite.config.ts`.

## Limitations

- Requires a connection to fetch data. There is no offline cache of readings or map tiles.
- NWS station coverage in remote areas is sparse; the nearest reporting station can be dozens of miles away and at a very different elevation. Compare it with the model estimate for your exact spot.
- Model estimates are interpolated from a weather model grid and can miss local effects such as canyon winds and cold air pooling.

## License

[MIT](LICENSE)
