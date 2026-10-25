import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestError, buildUrl, describeError, fetchJson } from '../src/lib/http';
import { jsonResponse, stubFetch } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchJson', () => {
  it('returns parsed JSON', async () => {
    const fetchImpl = stubFetch([['example.test', () => jsonResponse({ ok: true })]]);
    await expect(fetchJson('https://example.test/a', { fetchImpl })).resolves.toEqual({ ok: true });
  });

  it('does not retry client errors', async () => {
    const fetchImpl = stubFetch([['example.test', () => jsonResponse({}, 404)]]);
    const error = await fetchJson('https://example.test/a', { fetchImpl, retries: 2 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({ kind: 'http', status: 404 });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('retries server errors and then succeeds', async () => {
    let attempts = 0;
    const fetchImpl = stubFetch([
      ['example.test', () => (++attempts === 1 ? jsonResponse({}, 503) : jsonResponse([1]))],
    ]);
    await expect(fetchJson('https://example.test/a', { fetchImpl, retries: 1 })).resolves.toEqual([
      1,
    ]);
    expect(attempts).toBe(2);
  });

  it('reports network failures as offline', async () => {
    const fetchImpl = stubFetch([]);
    await expect(
      fetchJson('https://example.test/a', { fetchImpl, retries: 0 }),
    ).rejects.toMatchObject({ kind: 'offline' });
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as typeof fetch;
    const pending = fetchJson('https://example.test/slow', {
      fetchImpl,
      timeoutMs: 1000,
      retries: 0,
    });
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('reports caller cancellation as aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as typeof fetch;
    const pending = fetchJson('https://example.test/a', { fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('flags unreadable bodies as parse errors', async () => {
    const fetchImpl = stubFetch([['example.test', () => new Response('<html>', { status: 200 })]]);
    await expect(fetchJson('https://example.test/a', { fetchImpl })).rejects.toMatchObject({
      kind: 'parse',
    });
  });
});

describe('helpers', () => {
  it('encodes query parameters', () => {
    expect(buildUrl('https://example.test/search', { name: 'Ely, NV', count: 5 })).toBe(
      'https://example.test/search?name=Ely%2C+NV&count=5',
    );
  });

  it('gives friendly error text', () => {
    expect(describeError(new RequestError('offline', 'x'))).toMatch(/No connection/);
    expect(describeError(new RequestError('http', 'x', 429))).toMatch(/busy/);
    expect(describeError(new Error('boom'))).toMatch(/Something went wrong/);
  });
});
