import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBufferedResponse } from '../../scripts/api/fetch-buffered-response.js';
import { callWithRetry } from '../../scripts/utils/retry.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('non-streaming response deadlines', () => {
  it('does not schedule a transport retry after the operation was cancelled', async () => {
    vi.useFakeTimers();
    const cancelled = new Error('Processing cancelled');
    let obsolete = false;
    vi.stubGlobal('fetch', vi.fn(async () => { obsolete = true; throw new TypeError('Failed to fetch'); }));
    const onRetry = vi.fn();
    let settled = false;
    const result = callWithRetry(() => fetchBufferedResponse('https://api.example.org/request', {}, 5000, {
      checkCancelled: async () => { if (obsolete) throw cancelled; }
    }), { maxRetries: 1, delays: [1000], onRetry }).catch(error => { settled = true; return error; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(onRetry).not.toHaveBeenCalled();
      expect(settled).toBe(true);
      expect(await result).toBe(cancelled);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await vi.runAllTimersAsync();
      await result;
    }
  });

  it('retains status, retry headers, and the response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"busy"}', { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '7', 'Content-Type': 'application/json' } })));
    const response = await fetchBufferedResponse('https://api.example.org/request');
    expect(response.status).toBe(429);
    expect(response.statusText).toBe('Too Many Requests');
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(await response.json()).toEqual({ error: 'busy' });
  });

  it('aborts a body that stalls after headers arrive', async () => {
    vi.useFakeTimers();
    let body;
    const stream = new ReadableStream({ start(controller) { body = controller; } });
    let signal;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { signal = options.signal; return new Response(stream); }));
    let settled = false;
    const result = fetchBufferedResponse('https://api.example.org/request', {}, 1000).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(1001);
    expect(settled).toBe(true);
    expect((await result).name).toBe('TimeoutError');
    expect(signal.aborted).toBe(true);
    body.error(new DOMException('Stopped', 'AbortError'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds a fetch implementation that never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    let settled = false;
    const result = fetchBufferedResponse('https://api.example.org/request', {}, 1000).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(1001);
    expect(settled).toBe(true);
    expect((await result).name).toBe('TimeoutError');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates cancellation from the caller', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    let settled = false;
    const result = fetchBufferedResponse('https://api.example.org/request', { signal: parent.signal }, 1000).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    try {
      parent.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(true);
      expect((await result).name).toBe('AbortError');
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      await vi.advanceTimersByTimeAsync(1001);
    }
  });

  it('rejects an obsolete operation before sending a request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchBufferedResponse('https://api.example.org/request', {}, 1000, { checkCancelled() { throw new Error('Operation cancelled'); } })).rejects.toThrow('Operation cancelled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([2, 3])('rejects cancellation at response boundary %s', async boundary => {
    let checks = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Complete body')));
    await expect(fetchBufferedResponse('https://api.example.org/request', {}, 1000, {
      checkCancelled() { if (++checks === boundary) throw new Error('Operation cancelled'); }
    })).rejects.toThrow('Operation cancelled');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([204, 205, 304])('preserves an empty HTTP %s response', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
    const response = await fetchBufferedResponse('https://api.example.org/request');
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });
});
