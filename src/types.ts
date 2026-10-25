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

/** Where a station reading came from. */
export type StationSource = 'nws' | 'synoptic';

/**
 * What kind of station took a reading, which says a lot about how it is sited:
 * airport sensors are well maintained, fire weather stations sit in remote
 * terrain, personal stations are often in backyards or on roofs.
 */
export type StationKind = 'airport' | 'raws' | 'personal' | 'road' | 'snow' | 'mesonet' | 'other';

/**
 * Result of comparing a station's listed elevation with the terrain model at
 * its coordinates, for stations whose listing cannot be trusted as is.
 * - `meters`: the listed number matches terrain only when read as meters.
 * - `mismatch`: the listed number disagrees with terrain; terrain is used.
 * - `terrain`: the station lists no elevation; terrain is used.
 */
export interface ElevationCheck {
  kind: 'meters' | 'mismatch' | 'terrain';
  listedFt: number | null;
  terrainFt: number;
}

/** Latest measured observation from a physical station (NWS or Synoptic). */
export interface StationObservation extends LatLon {
  stationId: string;
  stationName: string;
  source: StationSource;
  kind: StationKind;
  /** Network short name, for example "RAWS" or "NV-ENERGY". Null for plain NWS listings. */
  network: string | null;
  /** Great-circle distance from the chosen point, in miles. */
  distanceMi: number;
  /** Best known station elevation in feet (corrected when the listing looks wrong). */
  elevationFt: number | null;
  /** Set when the listed elevation was missing or did not agree with terrain. */
  elevationCheck: ElevationCheck | null;
  /** When the observation was taken. */
  observedAt: Date;
  conditions: Conditions;
  /** Readings dropped by quality control, for example "wind speed failed quality control". */
  qcNotes: string[];
  /** How many closer stations were skipped because they were stale or incomplete. */
  skippedCloser: number;
  /** How many closer, usable stations were passed over for a better elevation match. */
  passedOverCloser: number;
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

/** A spot the user saved on this device. */
export interface Favorite extends LatLon {
  id: string;
  /** User editable name, for example "North ridge stand". */
  name: string;
  /** Place label from the reverse lookup at save time, shown under the name. */
  place: string | null;
  zip: string | null;
  /** When it was saved, in milliseconds since the epoch. */
  createdAt: number;
}
