/**
 * localStorage wrapper that never throws. Safari private browsing and
 * locked-down profiles can reject storage access; the app must still work.
 */
export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience only; ignore quota and privacy-mode errors.
  }
}
