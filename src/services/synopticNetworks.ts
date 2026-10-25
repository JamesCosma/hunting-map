/**
 * Station type labels for Synoptic networks. Network names and categories
 * come from a table generated from /v2/networks (see
 * scripts/generate-synoptic-networks.mjs), so labeling stations never costs
 * an API request.
 */
import { SYNOPTIC_NETWORKS } from '../data/synopticNetworks';
import type { StationKind } from '../types';

/** Synoptic network ids that deserve a more specific type than their category gives. */
const NETWORK_KINDS: Readonly<Record<string, StationKind>> = {
  '1': 'airport', // ASOS/AWOS
  '2': 'raws', // Interagency RAWS
  '25': 'snow', // NRCS SNOTEL
  '65': 'personal', // APRSWXNET/CWOP
};

/** Synoptic network categories from /v2/networktypes. */
const CATEGORY_KINDS: Readonly<Record<number, StationKind>> = {
  8: 'personal', // PUBLIC: CWOP and other citizen networks
  9: 'raws', // RAWS: fire weather
  10: 'road', // TRANS: road and rail weather
};

export interface NetworkInfo {
  name: string | null;
  kind: StationKind;
}

/** Looks up a network's short name and station type. Unknown networks are treated as mesonets. */
export function describeNetwork(
  networkId: string | null,
  table: Readonly<Record<string, readonly [string, number]>> = SYNOPTIC_NETWORKS,
): NetworkInfo {
  if (networkId == null) return { name: null, kind: 'other' };
  const entry = table[networkId];
  const kind = NETWORK_KINDS[networkId] ?? (entry ? CATEGORY_KINDS[entry[1]] : undefined);
  return { name: entry?.[0] ?? null, kind: kind ?? 'mesonet' };
}

export const STATION_KIND_LABELS: Readonly<Record<StationKind, string>> = {
  airport: 'Airport (ASOS/AWOS)',
  raws: 'Fire weather (RAWS)',
  personal: 'Personal (CWOP)',
  road: 'Road weather',
  snow: 'Snow (SNOTEL)',
  mesonet: 'Mesonet',
  other: 'Weather station',
};

/** NWS listings carry no type; four-letter K and P identifiers are airport (ICAO) stations. */
export function nwsStationKind(stationId: string): StationKind {
  return /^[KP][A-Z0-9]{3}$/.test(stationId) ? 'airport' : 'other';
}
