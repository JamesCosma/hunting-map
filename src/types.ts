/** A geographic point in decimal degrees (WGS84). */
export interface LatLon {
  lat: number;
  lon: number;
}

/** A location the user has chosen, from search or by dropping a pin. */
export interface ChosenLocation extends LatLon {
  /** Human friendly label, for example "Tonopah, Nevada" or "Dropped pin". */
  label: string;
  /** Optional secondary text such as county or ZIP. */
  detail?: string;
}

/** Wind as normalized for display. Speeds are mph, direction is degrees the wind blows FROM. */
export interface Wind {
  speedMph: number | null;
  gustMph: number | null;
  directionDeg: number | null;
}

/** The common set of conditions both data sources are reduced to. */
export interface Conditions {
  temperatureF: number | null;
  relativeHumidity: number | null;
  wind: Wind;
}

/** Latest measured observation from a physical NWS station. */
export interface StationObservation {
  stationId: string;
  stationName: string;
  /** Great-circle distance from the chosen point, in miles. */
  distanceMi: number;
  /** Station elevation in feet, when reported. */
  elevationFt: number | null;
  /** When the observation was taken. */
  observedAt: Date;
  conditions: Conditions;
  /** How many closer stations were skipped because they were stale or incomplete. */
  skippedCloser: number;
}

/** Open-Meteo model estimate for the exact chosen point. */
export interface ModelEstimate {
  /** Elevation of the chosen point in feet (90 m digital elevation model). */
  elevationFt: number | null;
  /** Model time step the values are valid for. */
  validAt: Date;
  conditions: Conditions;
}

/** A single geocoding match. */
export interface PlaceResult extends LatLon {
  id: string;
  name: string;
  /** Region text, for example "Nye County, Nevada". */
  region: string;
  source: 'open-meteo' | 'zippopotam' | 'nominatim';
}

/** What a reverse lookup says about a point: the area's name and its ZIP code. */
export interface PlaceSummary {
  /**
   * Readable area, for example "Near Indian Springs, Clark County, NV", or just
   * "Nye County, NV" where there is no town. Null when nothing is named here (offshore).
   */
  label: string | null;
  /** Five digit US ZIP code, or null where the point has none. */
  zip: string | null;
}
