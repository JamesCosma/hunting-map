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

/** Returns false when storage rejected the write (quota exceeded, privacy mode). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage is a convenience only; callers that care can check the result.
    return false;
  }
}
