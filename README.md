# Hunting Map

Current conditions and elevation for any spot in the United States, built for hunting and off-road trips where signal is weak and the nearest town is far away.

**Live app:** https://jamescosma.github.io/hunting-map/

Pick a spot by searching for a place name or ZIP code, or by tapping the map. Hunting Map then shows two independent readings side by side:

- **Best nearby station (measured):** the latest real observation from the best nearby weather station that has reported recently. Stations come from the National Weather Service and, when a token is configured, Synoptic Data (MesoWest), which adds fire weather (RAWS), SNOTEL, road weather, mesonet, and personal stations. The card shows the station name, its type, its distance from your spot, its elevation compared with yours, and how old the reading is.
- **This exact spot (model estimate):** an Open-Meteo weather model estimate for the exact coordinates you chose. This also covers places outside NWS coverage.

## Features

- Search by town, peak, range, or area name (for example `Tonopah, NV` or `Ruby Mountains`) or by 5 digit US ZIP code (`89031`).
- Tap or click the map to drop a pin. Keyboard users can pan with the arrow keys and press Enter to drop a pin at the map center.
- Temperature (°F), relative humidity, wind speed and gusts (mph), and wind direction shown both as a compass arrow and as text such as `From SW (225°)`.
- Elevation of the chosen spot in feet, plus the elevation of the reporting station and how far above or below your spot it is.
- Station choice that weighs distance against elevation difference and skips stale, empty, or implausible readings, with a note when closer stations were passed over. See [How the station is chosen](#how-the-station-is-chosen).
- **Weather stations layer.** Turn on **Weather stations** in the layer menu to see a pin for every Synoptic station in view, color coded by type (airport, fire weather, SNOTEL, road, mesonet, personal) with a legend. Tap a pin for its name, type, elevation, latest reading, and how old it is. Hollow pins have no reading in the last 2 hours. Available when a Synoptic token is configured; the toggle is remembered.
- Streets, Topo (OpenTopoMap), and Satellite (Esri World Imagery) base maps. Your choice is remembered.
- Remembers your last spot, so reopening the app from the home screen shows it right away.
- Works in Safari on iPhone, including Add to Home Screen (web manifest, Apple touch icon, standalone mode, safe-area insets), and in desktop Chrome and Edge.
- **Place name and ZIP for any spot.** Tapping the map, picking a search result, or reopening the app shows the nearest named place and ZIP code, for example `Near Indian Springs, Clark County, NV` and `ZIP 89018`. Backcountry spots outside any town show the county and state with `No ZIP`. A slow or failed lookup never holds up the conditions.
- **Favorites.** Save the selected spot with **Save spot** (the name defaults to its place name and can be edited). The **Favorites** tab lists every saved spot with its temperature, wind speed and direction, humidity, and elevation, loaded for all spots in one request and refreshed when the list is more than 5 minutes old or on demand. Tap a favorite to jump to it on the map and load the full station and model detail. Rename or delete with **Edit**, with undo. Up to 25 favorites are kept on this device.
- Loading skeletons, clear "not reported" labels for missing values, and friendly error messages with a retry button.

## Data sources and why

| Need                          | Source                                                                                                                                                                                             | Why                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Measured observations         | [NWS API](https://www.weather.gov/documentation/services-web-api) (`api.weather.gov`)                                                                                                              | Official, free, no key, CORS enabled. Real sensor readings are the ground truth when a station is close.                                                                                                       |
| More stations (optional)      | [Synoptic Data](https://docs.synopticdata.com/services/latest) (MesoWest) `stations/latest`                                                                                                        | Aggregates hundreds of networks (RAWS, SNOTEL, road weather, mesonets, CWOP), so remote spots often have a much closer station than NWS lists. Needs a public token. CORS enabled.                             |
| Station terrain elevation     | [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api)                                                                                                                           | Free, no key. One batched request checks listed station elevations (some are in meters by mistake) and gives the spot's elevation for the comparison.                                                          |
| Model estimate and elevation  | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)                                                                                                                                          | Free, no key, CORS enabled. Gives values for the exact coordinates (stations can be 30+ miles away in Nevada) and works outside NWS coverage. Its `elevation` field comes from a 90 m digital elevation model. |
| Place name search             | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)                                                                                                                               | Free, no key, CORS enabled, and its GeoNames data includes peaks, ranges, and other natural features, not just towns.                                                                                          |
| Name search fallback          | [Nominatim](https://nominatim.org/) (OpenStreetMap)                                                                                                                                                | Used only when Open-Meteo finds nothing. Called only on explicit submit and at most once per second, per the [usage policy](https://operations.osmfoundation.org/policies/nominatim/).                         |
| Place name and ZIP for a spot | [Nominatim reverse](https://nominatim.org/release-docs/latest/api/Reverse/) (OpenStreetMap)                                                                                                        | Free, no key, CORS enabled, and returns town, county, state, and postcode in one call. See [Nominatim fair use](#nominatim-fair-use).                                                                          |
| ZIP code search               | [Zippopotam.us](https://www.zippopotam.us/)                                                                                                                                                        | Free, no key, CORS enabled, returns coordinates for US ZIP codes.                                                                                                                                              |
| Map tiles                     | [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org/), [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Free tile sources with attribution shown on the map.                                                                                                                                                           |

All of these were verified to return `Access-Control-Allow-Origin: *` and to work from a real browser (headless Chromium) against the production build.

### Nominatim fair use

Search fallback and place name lookups share one request queue that allows at most one Nominatim request per second for the whole app. Place lookups also:

- wait 400 ms after a selection settles, so panning between pins or tapping quickly does not send a request per tap, and cancel the lookup for a spot you have moved away from;
- are cached in memory for about 100 m around each looked up point (the last 100 points), so going back to a spot or reopening a favorite never asks again;
- are never retried automatically. A failure just hides the ZIP line, and the refresh button tries again.

Browsers do not allow pages to set a `User-Agent` header, so requests identify the app the way the usage policy asks of web apps: by the `Referer` the browser sends (the default `strict-origin-when-cross-origin` policy sends the site origin). Results are © OpenStreetMap contributors, credited in the app footer.

ZIP codes come from OpenStreetMap postcode data. They are accurate in towns, but for points between towns the nearest tagged postcode may differ from the USPS delivery ZIP.

### How the station is chosen

NWS and Synoptic are queried in parallel, and either can fail without breaking the other:

- **NWS:** `GET /points/{lat},{lon}` returns the station list (a 404 means the spot is outside NWS coverage). Stations are sorted by great-circle distance and `observations/latest` is requested for the nearest 3 in parallel, then the next 3, up to 9, until one has a usable reading.
- **Synoptic:** one `GET /v2/stations/latest` request for up to 30 active stations within 50 miles that reported in the last 2 hours, with Synoptic's quality control flags on. Synoptic codes come back in English units with wind in mph.

Then:

1. **Merge and dedupe.** Many stations (airports, RAWS) are in both sources under the same id. The fresher reading wins when they differ by more than 5 minutes, otherwise the more complete one, otherwise Synoptic. Synoptic's network label and terrain elevation are kept either way.
2. **Sanity checks.** Values outside physical limits are dropped rather than shown: temperature outside −80 to 135 °F, humidity outside 0 to 105 % (101 to 105 is shown as 100 %), wind speed over 150 mph, a gust more than 1 mph below the wind speed, and any value Synoptic's QC flagged as failed. A reading must be at most 2 hours old and still have a temperature to be usable.
3. **Elevation check.** Each station's listed elevation is compared with terrain elevation at its location (Synoptic's DEM value, otherwise Open-Meteo). If they differ by more than 250 ft or 8 %, whichever is larger, the terrain value is used. When the listed number times 3.28 matches the terrain, the listing was in meters (for example HADS station STCN2 lists `1763` at a 5,781 ft site), and the card says so.
4. **Score.** Each usable station gets `distance in miles + 5 × (elevation difference in thousands of feet) + 2 per missing humidity or wind reading`, and the lowest score wins, with ties going to the nearer station.
5. If no station is usable, the card says no recent readings were found and how many stations were checked.

**Judgment calls.** Temperature falls roughly 3.5 to 5.5 °F per 1,000 ft, and in the Great Basin ridges and basins a few miles apart differ more than stations 20 miles apart along the same bench. So a station 1,000 ft closer to your elevation is treated as worth about 5 miles of distance: a valley station 3 miles away does not beat a ridge station 12 miles away at your height, but elevation alone never pulls in a station that is far away. The penalty applies only when your spot's elevation is known; a station with no known elevation is treated as 500 ft off. A station without humidity or wind costs 2 miles per missing value, so a temperature-only air quality sensor next door does not beat a full weather station a mile farther away. When a closer station is passed over, the card says so.

### Synoptic token

Synoptic is optional. Without a token the app uses NWS only and hides the stations layer.

- **Local:** put `VITE_SYNOPTIC_TOKEN=your-public-token` in `.env.local` (gitignored), or export it in the shell that runs `npm run dev` or `npm run build`.
- **GitHub Pages:** add a repository secret named `SYNOPTIC_TOKEN`. The deploy workflow passes it to the build as `VITE_SYNOPTIC_TOKEN`.

Use a Synoptic **public token** (generated from your API key in the Synoptic account console), never the API key itself. The token is compiled into the JavaScript bundle and visible to anyone who opens the site, which is how Synoptic public tokens are meant to be used; restrict it to your Pages domain in the console if your plan allows that.

Station types come from a static table of Synoptic networks in `src/data/synopticNetworks.ts`, so no request is spent on labels. Regenerate it when Synoptic adds networks (unknown networks show as "Mesonet"):

```bash
SYNOPTIC_TOKEN=your-public-token node scripts/generate-synoptic-networks.mjs
```

### Weather stations layer

- Loads only at zoom 7 or closer and when the view covers at most 4 square degrees (about 240 by 270 miles in Nevada). Otherwise the legend says to zoom in.
- Requests wait 500 ms after the map stops moving. Each one asks for the view padded by 25 % and snapped to a 0.25° grid, and the last 6 responses are reused for 10 minutes while the view stays inside them, so panning and zooming within an area costs no extra requests.
- Shows stations that reported in the last 24 hours. Readings older than 2 hours or without a temperature get a hollow pin.
- Nearby pins merge into a numbered cluster below zoom 14; tapping a cluster zooms in on its stations.
- Pins, clusters, the popup close button, and the legend are 44 px touch targets with accessible names, and the legend announces loading and errors with a retry button.

### Synoptic free tier

Synoptic's open access plan has a monthly request and service unit allowance and allows one request at a time (check your account console for current numbers). The app keeps usage low:

- Choosing a spot costs one Synoptic request (plus one free Open-Meteo elevation request), and a newer selection cancels the previous one.
- The layer is off by default and costs one request per new area as described above; network labels cost nothing.
- Favorites use Open-Meteo only, not Synoptic.

One person checking a dozen spots and browsing the layer for an evening uses a few dozen requests, well inside a free allowance. A public site with many visitors shares one token and therefore one allowance; if that becomes a problem, the next step would be a small caching proxy.

## Architecture

Plain TypeScript with no UI framework. The app is small, and direct DOM rendering keeps the bundle light (about 71 kB gzipped including Leaflet) for slow connections.

```
src/
  main.ts               Entry point: wires views to the app controller
  app.ts                Controller: selection, request cancellation, rendering by state
  favoritesController.ts  Saving spots, the Favorites list, and batched conditions
  config.ts             Endpoints, timeouts, thresholds, storage keys, Synoptic token
  types.ts              Shared domain types (Conditions, StationObservation, Bounds, ...)
  vite-env.d.ts         Typed build-time environment variables
  lib/
    http.ts             fetchJson with timeout, retry with backoff, typed RequestError
    json.ts             Runtime guards for untyped API payloads
    units.ts            Unit conversions, including NWS WMO unit codes
    geo.ts              Haversine distance, 16 point compass, coordinate helpers
    format.ts           Display formatting (temperatures, ages, wind text)
    dom.ts              Tiny element builder (textContent only, never innerHTML)
    storage.ts          localStorage wrapper that never throws
    favoritesStore.ts   Versioned, validated favorites in localStorage
    rateLimit.ts        Queueing rate limiter (one Nominatim request per second)
    lruCache.ts         Small least-recently-used cache
    usStates.ts         State names and abbreviations for "Town, ST" search
    stationQuality.ts   Plausibility limits and the listed vs terrain elevation check
    stationSelection.ts Usable readings, dedupe, and distance plus elevation scoring
    bbox.ts             Bounding box padding, grid snapping, and containment
    cluster.ts          Screen-space marker clustering
  data/
    synopticNetworks.ts Generated Synoptic network names and categories
  services/
    nws.ts              Nearest usable NWS station observation
    synoptic.ts         Synoptic stations near a point or inside a box
    synopticNetworks.ts Station type labels for Synoptic networks and NWS ids
    elevation.ts        Batched terrain elevations from Open-Meteo
    stations.ts         Best nearby station across NWS and Synoptic
    stationsLayerData.ts  Layer view limits, request boxes, and caching
    openMeteo.ts        Model estimates for one point or a batch of points
    geocoding.ts        Query classification, ZIP, name, and fallback search
    nominatim.ts        Shared, rate limited access to Nominatim
    reverseGeocoding.ts Place name and ZIP for a point, with caching
  ui/
    mapView.ts          Leaflet map, base layers, overlays, pin, click and keyboard picking
    stationsLayer.ts    Weather stations overlay: pins, clusters, popups, legend
    searchBox.ts        Search form and keyboard navigable results
    cardView.ts         Card states: placeholder, loading, content, notice, error
    conditionsView.ts   Metric and wind rendering shared by both sources
    compass.ts          SVG wind compass and the small wind arrow
    locationView.ts     Selected spot summary, place name, ZIP, and elevation
    tabs.ts             Accessible Conditions and Favorites tabs
    saveFavoriteView.ts Save spot button and its naming form
    favoritesView.ts    Favorites list with per-row conditions and edit mode
  styles/
    tokens.css          Spacing, type, color, and radius design tokens
    base.css, layout.css, components.css
scripts/                Synoptic network table generator
tests/                  Vitest unit tests (services use stubbed fetch, no network)
public/                 Web manifest and icons
```

Design choices worth knowing:

- **Services are pure and testable.** Each service takes an optional `fetchImpl` and returns typed results. Expected outcomes such as "outside NWS coverage" are part of the return type, not exceptions.
- **Every API payload is treated as `unknown`** and narrowed field by field, so an upstream schema change shows "Not reported" instead of crashing.
- **Stale responses never win.** Each new selection aborts the previous one's requests through an `AbortController`.
- **Favorites storage is defensive.** Favorites are stored as `{ version: 1, favorites: [...] }` under `hunting-map:favorites`. Every entry is validated on load; invalid or duplicate entries are dropped instead of discarding the whole list, unreadable data starts an empty list, and a newer schema version is read best effort. If the browser refuses to store data (for example in some private browsing modes), the list still works for the session and says so.
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

To include Synoptic stations locally, add a token to `.env.local` first (see [Synoptic token](#synoptic-token)).

`npm run format` applies Prettier formatting.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: it installs dependencies, lints, tests, builds, and deploys `dist/` to GitHub Pages with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Pull requests run the same checks without deploying.

One time setup: in the repository settings, under **Pages**, set **Source** to **GitHub Actions**. Optionally add the `SYNOPTIC_TOKEN` repository secret under **Secrets and variables → Actions** to enable Synoptic stations.

The Vite `base` is `/hunting-map/` to match the project Pages URL. If the repository is renamed, update `base` in `vite.config.ts`.

## Limitations

- Requires a connection to fetch data. There is no offline cache of readings or map tiles.
- Station coverage in remote areas is sparse even with Synoptic; the best station can still be dozens of miles away. Compare it with the model estimate for your exact spot.
- Synoptic is searched within 50 miles (30 stations); NWS covers anything farther. Elevation scoring cannot account for slope aspect, inversions, or a ridge between you and the station.
- The stations layer shows Synoptic stations only. NWS stations that are not also in Synoptic (rare) appear only on the card.
- The Synoptic token is shared by every visitor to a deployed site, so heavy use can exhaust the free allowance; the app then falls back to NWS.
- Favorites live in this browser's local storage, so they do not sync between your iPhone and PC, and clearing site data removes them.
- The Favorites list shows the model estimate for each spot. Nearest station readings load when you open a favorite, which keeps the list to a single request.
- Place names come from what OpenStreetMap has nearby. In open country that is usually just the county and state; there is no "nearest town" distance.
- Model estimates are interpolated from a weather model grid and can miss local effects such as canyon winds and cold air pooling.

## License

[MIT](LICENSE)
