/**
 * Central place for tunable values and third-party endpoints.
 * Keeping these together makes it easy to audit which services the app talks to.
 */
export const ENDPOINTS = {
  nwsBase: 'https://api.weather.gov',
  openMeteoForecast: 'https://api.open-meteo.com/v1/forecast',
  openMeteoGeocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  zippopotam: 'https://api.zippopotam.us/us',
  nominatimSearch: 'https://nominatim.openstreetmap.org/search',
  nominatimReverse: 'https://nominatim.openstreetmap.org/reverse',
  openMeteoElevation: 'https://api.open-meteo.com/v1/elevation',
  synopticLatest: 'https://api.synopticdata.com/v2/stations/latest',
} as const;

/**
 * Synoptic Data public token, injected at build time from VITE_SYNOPTIC_TOKEN.
 * Without one the app uses NWS stations only and hides the stations layer.
 */
export const SYNOPTIC_TOKEN: string | null = import.meta.env.VITE_SYNOPTIC_TOKEN?.trim() || null;

/** Per-request timeout. Generous because the app is often used on weak backcountry signal. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Number of extra attempts for transient failures (network errors, 429, 5xx). */
export const REQUEST_RETRIES = 1;

/** A station reading older than this is treated as stale and skipped. */
export const STATION_MAX_AGE_MINUTES = 120;

/** How many nearby stations are queried per batch, and the most we will ever try. */
export const STATION_BATCH_SIZE = 3;
export const STATION_MAX_CANDIDATES = 9;

/** Synoptic stations considered for "nearest station": the closest N within this radius. */
export const SYNOPTIC_SEARCH_RADIUS_MI = 50;
export const SYNOPTIC_SEARCH_LIMIT = 30;

/**
 * How much an elevation difference counts against a station when choosing the
 * most representative one: 1,000 ft of difference weighs like 5 extra miles.
 * Temperature drops roughly 3 to 5 °F per 1,000 ft, so a nearby station far
 * above or below the spot is often less representative than a farther one at
 * a similar height.
 */
export const ELEVATION_PENALTY_MI_PER_1000_FT = 5;

/** Weather stations layer: smallest zoom that loads stations, and the largest area per request. */
export const STATIONS_LAYER_MIN_ZOOM = 8;
export const STATIONS_LAYER_MAX_AREA_SQ_DEG = 6;
/** Station readings for the layer are reused for this long before being refetched. */
export const STATIONS_LAYER_CACHE_MS = 10 * 60_000;
/** Wait after the map stops moving before loading stations for the new view. */
export const STATIONS_LAYER_DEBOUNCE_MS = 600;
/** The layer shows stations that reported within this window; older than 2 hours is drawn as stale. */
export const STATIONS_LAYER_WITHIN_MINUTES = 24 * 60;

/** Maximum number of place search results shown to the user. */
export const SEARCH_RESULT_LIMIT = 8;

/** Default map view when nothing has been chosen yet: North Las Vegas, NV. */
export const DEFAULT_VIEW = { lat: 36.24, lon: -115.12, zoom: 9 } as const;

/** Zoom level used after a place is chosen from search. */
export const PLACE_ZOOM = 11;

/**
 * Nominatim's usage policy allows at most one request per second from a client.
 * Shared by place search and reverse lookups so the two can never burst together.
 */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/** Delay before looking up a tapped point's place name, so rapid taps send one request. */
export const REVERSE_GEOCODE_DEBOUNCE_MS = 400;

/** Reverse lookups are cached per ~100 m cell (3 decimal places) for the session. */
export const REVERSE_GEOCODE_CACHE_SIZE = 100;

/** Most favorites a device can hold. Also keeps the batched weather request URL short. */
export const MAX_FAVORITES = 25;

/** Longest allowed favorite name, in characters. */
export const FAVORITE_NAME_MAX_LENGTH = 60;

/** Favorites conditions older than this are refetched when the list is opened. */
export const FAVORITES_STALE_AFTER_MS = 5 * 60_000;

export const STORAGE_KEYS = {
  lastLocation: 'hunting-map:last-location',
  baseLayer: 'hunting-map:base-layer',
  favorites: 'hunting-map:favorites',
  stationsLayer: 'hunting-map:stations-layer',
} as const;
