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
} as const;

/** Per-request timeout. Generous because the app is often used on weak backcountry signal. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Number of extra attempts for transient failures (network errors, 429, 5xx). */
export const REQUEST_RETRIES = 1;

/** A station reading older than this is treated as stale and skipped. */
export const STATION_MAX_AGE_MINUTES = 120;

/** How many nearby stations are queried per batch, and the most we will ever try. */
export const STATION_BATCH_SIZE = 3;
export const STATION_MAX_CANDIDATES = 9;

/** Maximum number of place search results shown to the user. */
export const SEARCH_RESULT_LIMIT = 8;

/** Default map view when nothing has been chosen yet: North Las Vegas, NV. */
export const DEFAULT_VIEW = { lat: 36.24, lon: -115.12, zoom: 9 } as const;

/** Zoom level used after a place is chosen from search. */
export const PLACE_ZOOM = 11;

export const STORAGE_KEYS = {
  lastLocation: 'hunting-map:last-location',
  baseLayer: 'hunting-map:base-layer',
} as const;
