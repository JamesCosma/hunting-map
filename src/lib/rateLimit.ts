import { RequestError } from './http';

export interface RateLimiter {
  /** Resolves when the caller may send its request. Rejects with an aborted `RequestError`. */
  acquire(signal?: AbortSignal): Promise<void>;
  /** Test hook: forgets previous requests. */
  reset(): void;
}

/**
 * Spaces calls at least `minIntervalMs` apart. Each caller reserves the next
 * free slot up front, so concurrent callers queue one after another instead
 * of all waking at the same moment.
 */
export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
): RateLimiter {
  let nextSlot = 0;

  return {
    acquire(signal) {
      if (signal?.aborted)
        return Promise.reject(new RequestError('aborted', 'Request was cancelled'));
      const current = now();
      const slot = Math.max(current, nextSlot);
      nextSlot = slot + minIntervalMs;
      const wait = slot - current;
      if (wait <= 0) return Promise.resolve();

      return new Promise((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new RequestError('aborted', 'Request was cancelled'));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, wait);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    reset() {
      nextSlot = 0;
    },
  };
}
