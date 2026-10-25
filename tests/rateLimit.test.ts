import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '../src/lib/http';
import { createRateLimiter } from '../src/lib/rateLimit';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimiter', () => {
  it('lets the first call through immediately', async () => {
    const limiter = createRateLimiter(1000);
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it('queues concurrent callers one interval apart', async () => {
    const limiter = createRateLimiter(1000);
    const released: number[] = [];
    const start = Date.now();
    const calls = [0, 1, 2].map((index) =>
      limiter.acquire().then(() => released.push(index) && Date.now() - start),
    );
    await vi.advanceTimersByTimeAsync(2000);
    await expect(Promise.all(calls)).resolves.toEqual([0, 1000, 2000]);
    expect(released).toEqual([0, 1, 2]);
  });

  it('does not delay calls that are already far enough apart', async () => {
    const limiter = createRateLimiter(1000);
    await limiter.acquire();
    vi.advanceTimersByTime(1500);
    let done = false;
    void limiter.acquire().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('rejects a waiting caller as aborted when its signal fires', async () => {
    const limiter = createRateLimiter(1000);
    await limiter.acquire();
    const controller = new AbortController();
    const waiting = limiter.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toSatisfy(
      (error) => error instanceof RequestError && error.kind === 'aborted',
    );
  });

  it('rejects immediately for an already aborted signal', async () => {
    const limiter = createRateLimiter(1000);
    const controller = new AbortController();
    controller.abort();
    await expect(limiter.acquire(controller.signal)).rejects.toBeInstanceOf(RequestError);
  });
});
