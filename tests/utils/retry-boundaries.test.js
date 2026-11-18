import { afterEach, describe, expect, it, vi } from 'vitest';
import { callWithRetry } from '../../scripts/utils/retry.js';
import { fetchBufferedResponse } from '../../scripts/api/fetch-buffered-response.js';
import { createApiError } from '../../scripts/api/http-errors.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bounded transport retries', () => {
  it('honors a typed transient request-timeout response', async () => {
    vi.useFakeTimers();
    const error = await createApiError(new Response('{}', { status: 408 }), 'openai');
    const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ready');
    const result = callWithRetry(request, { delays: [1] }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toBe('ready');
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    new DOMException('Cancelled', 'AbortError'),
    Object.assign(new Error('Admitted generation failed'), { status: 503, retryable: false }),
    Object.assign(new Error('Refused'), { code: 'AI_RESPONSE_REFUSED' })
  ])('preserves a terminal error even when a custom predicate requests retries', async error => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(error);
    const result = callWithRetry(request, { shouldRetry: () => true }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toBe(error);
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not retry a billing quota response', async () => {
    vi.useFakeTimers();
    const error = await createApiError(new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 }), 'openai');
    const request = vi.fn().mockRejectedValue(error);
    const result = callWithRetry(request).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ status: 429, retryable: false, translationKey: 'errorApiQuotaExceeded' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not multiply an exhausted inner transport budget', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(Object.assign(new Error('Unavailable'), { status: 503 }));
    const result = callWithRetry(() => callWithRetry(request, { maxRetries: 2, delays: [1] }), { maxRetries: 2, delays: [1] }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ status: 503, retryExhausted: true });
    expect(request).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('declines a server delay beyond the supported budget without retrying early', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const error = Object.assign(new Error('Rate limited'), { status: 429, response: new Response('', { headers: { 'Retry-After': '999999999' } }) });
    const request = vi.fn().mockRejectedValue(error);
    let settled = false;
    const result = callWithRetry(request).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(await result).toBe(error);
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits at least the Retry-After duration', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce({ status: 429, response: new Response('', { headers: { 'Retry-After': '2' } }) }).mockResolvedValue('ready');
    const result = callWithRetry(request, { delays: [1] });
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an in-progress backoff without another HTTP attempt', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = vi.fn().mockRejectedValue({ status: 503 });
    let settled = false;
    const result = callWithRetry(request, { signal: controller.signal, delays: [10000] }).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect((await result).name).toBe('AbortError');
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and settles a stalled complete operation at its deadline', async () => {
    vi.useFakeTimers();
    let signal, settled = false;
    const request = vi.fn(context => { signal = context.signal; return new Promise(() => {}); });
    const result = callWithRetry(request, { timeoutMs: 100 }).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(101);
    expect(settled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(await result).toMatchObject({ name: 'TimeoutError', translationKey: 'errorTimeout' });
    expect(request).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('actively cancels a stalled body when an asynchronous owner check fails', async () => {
    vi.useFakeTimers();
    let obsolete = false, signal, settled = false;
    const cancelled = new DOMException('Replaced', 'AbortError');
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }));
    const result = fetchBufferedResponse('https://api.example.org/request', {}, 1000, {
      async checkCancelled() { if (obsolete) throw cancelled; }
    }).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    obsolete = true;
    await vi.advanceTimersByTimeAsync(51);
    expect(settled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(await result).toBe(cancelled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['request', 'retry'])('retains both cancellation parents when the %s signal aborts', async parent => {
    vi.useFakeTimers();
    const request = new AbortController(), retry = new AbortController();
    let signal, settled = false;
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); }));
    const result = fetchBufferedResponse('https://api.example.org/request', { signal: retry.signal }, 1000, { signal: request.signal }).catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(0);
    (parent === 'request' ? request : retry).abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect((await result).name).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });
});
