/**
 * Shared access to OpenStreetMap Nominatim, used by place search (fallback)
 * and by reverse lookups for tapped points.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * - At most one request per second: every call goes through one rate limiter.
 * - Identify the application: browsers may not set User-Agent, so we rely on
 *   the Referer header. The page uses the default referrer policy
 *   (strict-origin-when-cross-origin), which sends the site origin.
 * - Cache results and do not retry aggressively: callers cache, and requests
 *   here are never retried automatically.
 */
import { NOMINATIM_MIN_INTERVAL_MS } from '../config';
import { buildUrl, fetchJson, type FetchJsonOptions } from '../lib/http';
import { createRateLimiter } from '../lib/rateLimit';

export type NominatimRequestOptions = Pick<FetchJsonOptions, 'signal' | 'fetchImpl'>;

const limiter = createRateLimiter(NOMINATIM_MIN_INTERVAL_MS);

/** GETs a Nominatim endpoint once its rate limit slot comes up. */
export async function requestNominatim(
  endpoint: string,
  params: Record<string, string | number>,
  options: NominatimRequestOptions = {},
): Promise<unknown> {
  await limiter.acquire(options.signal);
  return fetchJson(buildUrl(endpoint, params), { ...options, retries: 0 });
}

/** Test hook: resets the shared Nominatim rate limiter. */
export function resetNominatimThrottle(): void {
  limiter.reset();
}
