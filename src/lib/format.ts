import { toCompassPoint } from './geo';

/** Shown wherever a source did not report a value. */
export const NOT_REPORTED = 'Not reported';

export function formatTemperature(f: number | null): string {
  return f == null ? NOT_REPORTED : `${Math.round(f)}°F`;
}

export function formatHumidity(pct: number | null): string {
  return pct == null ? NOT_REPORTED : `${Math.round(pct)}%`;
}

export function formatSpeed(mph: number | null): string {
  return mph == null ? NOT_REPORTED : `${Math.round(mph)} mph`;
}

export function formatElevation(ft: number | null): string {
  return ft == null ? NOT_REPORTED : `${Math.round(ft).toLocaleString('en-US')} ft`;
}

export function formatDistance(mi: number): string {
  if (mi < 0.1) return 'under 0.1 mi';
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString('en-US')} mi`;
}

export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

/** "ZIP 89018", or "No ZIP" for points outside any ZIP code (common in the backcountry). */
export function formatZip(zip: string | null): string {
  return zip == null ? 'No ZIP' : `ZIP ${zip}`;
}

/** Wind speeds below this many mph are reported as calm, matching NWS practice. */
export const CALM_THRESHOLD_MPH = 1;

export function isCalm(speedMph: number | null): boolean {
  return speedMph != null && speedMph < CALM_THRESHOLD_MPH;
}

/** "From SW (225°)" style text, or "Calm" / a not-reported message when there is no direction. */
export function formatWindDirection(deg: number | null, speedMph: number | null): string {
  if (isCalm(speedMph)) return 'Calm';
  if (deg == null) return 'Direction not reported';
  return `From ${toCompassPoint(deg)} (${Math.round(deg)}°)`;
}

/** Compact wind for list rows: "12 mph SW", "12 mph", "Calm" or the not-reported text. */
export function formatWindShort(speedMph: number | null, deg: number | null): string {
  if (isCalm(speedMph)) return 'Calm';
  if (speedMph == null) return NOT_REPORTED;
  return deg == null ? formatSpeed(speedMph) : `${formatSpeed(speedMph)} ${toCompassPoint(deg)}`;
}

/**
 * Relative age such as "just now", "12 min ago", "3 hr 5 min ago".
 * `now` is injectable to keep the function pure and testable.
 */
export function formatAge(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} hr ago` : `${hours} hr ${rest} min ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Local clock time, for example "5:15 PM". */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
