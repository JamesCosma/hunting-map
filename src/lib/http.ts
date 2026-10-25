import { REQUEST_RETRIES, REQUEST_TIMEOUT_MS } from '../config';

export type RequestErrorKind = 'offline' | 'timeout' | 'http' | 'parse' | 'aborted';

/** Error type for every failed network request, so callers can branch on `kind`. */
export class RequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly status: number | undefined;

  constructor(kind: RequestErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'RequestError';
    this.kind = kind;
    this.status = status;
  }

  /** Network failures, timeouts, rate limits and server errors are worth retrying. */
  get isTransient(): boolean {
    if (this.kind === 'offline' || this.kind === 'timeout') return true;
    return (
      this.kind === 'http' && this.status != null && (this.status === 429 || this.status >= 500)
    );
  }
}

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new RequestError('aborted', 'Request was cancelled'));
      },
      { once: true },
    );
  });

async function attempt(
  url: string,
  options: Required<Pick<FetchJsonOptions, 'timeoutMs'>> & FetchJsonOptions,
): Promise<unknown> {
  const controller = new AbortController();
  // An object rather than a `let` so TypeScript does not narrow it inside the closures below.
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  // AbortSignal.any is not available in older Safari, so forward the caller's signal manually.
  const forwardAbort = (): void => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: options.headers ?? {},
        // No credentials and only CORS-safelisted headers, so requests stay "simple"
        // and avoid a preflight round trip on slow connections.
        credentials: 'omit',
      });
    } catch {
      if (options.signal?.aborted) throw new RequestError('aborted', 'Request was cancelled');
      if (state.timedOut) throw new RequestError('timeout', 'The request timed out');
      throw new RequestError('offline', 'Could not reach the server');
    }

    if (!response.ok) {
      throw new RequestError('http', `Server responded with ${response.status}`, response.status);
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      if (state.timedOut) throw new RequestError('timeout', 'The request timed out');
      throw new RequestError('parse', 'Received an unreadable response');
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * GETs a JSON document with a timeout and a small number of retries with
 * backoff for transient failures. Always rejects with a `RequestError`.
 */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const retries = options.retries ?? REQUEST_RETRIES;
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS };

  for (let tryIndex = 0; ; tryIndex++) {
    try {
      return await attempt(url, resolved);
    } catch (error) {
      const requestError =
        error instanceof RequestError ? error : new RequestError('offline', String(error));
      if (!requestError.isTransient || tryIndex >= retries) throw requestError;
      await sleep(600 * 2 ** tryIndex, options.signal);
    }
  }
}

/** Builds a URL with properly encoded query parameters. */
export function buildUrl(base: string, params: Record<string, string | number>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof RequestError && error.kind === 'aborted';
}

/** Turns any error into a short sentence suitable for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof RequestError) {
    switch (error.kind) {
      case 'offline':
        return 'No connection. Check your signal and try again.';
      case 'timeout':
        return 'The request took too long, likely due to a weak signal. Try again.';
      case 'http':
        return error.status === 429
          ? 'The service is busy right now. Wait a moment and try again.'
          : 'The service returned an error. Try again shortly.';
      case 'parse':
        return 'The service sent an unexpected response.';
      case 'aborted':
        return 'Cancelled.';
    }
  }
  return 'Something went wrong. Try again.';
}
