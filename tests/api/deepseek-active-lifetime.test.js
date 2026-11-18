import { afterEach, expect, it, vi } from 'vitest';
import { callDeepSeekAPI } from '../../scripts/api/deepseek.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('aborts DeepSeek while waiting for response headers', async () => {
  vi.useFakeTimers();
  const owner = new AbortController();
  let signal, settled = false;
  vi.stubGlobal('fetch', vi.fn((_url, init) => {
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }));
  const result = callDeepSeekAPI('', 'Sample reading', 'synthetic-key', 'deepseek-flash-no-thinking', false, { signal: owner.signal }).catch(error => { settled = true; return error; });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  owner.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(true);
  expect(signal.aborted).toBe(true);
  expect((await result).name).toBe('AbortError');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['signal', 'owner check', 'deadline'])('cancels a stalled DeepSeek stream through %s without another generation', async cause => {
  vi.useFakeTimers();
  const owner = new AbortController(), cancelled = new DOMException('Replaced', 'AbortError');
  let obsolete = false, settled = false;
  const cancel = vi.fn();
  const stream = new ReadableStream({ start() {}, cancel });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } })));
  const result = callDeepSeekAPI('', 'Sample reading', 'synthetic-key', 'deepseek-flash-no-thinking', false, {
    signal: owner.signal, async checkCancelled() { if (obsolete) throw cancelled; }
  }).catch(error => { settled = true; return error; });
  await vi.advanceTimersByTimeAsync(0);
  expect(stream.locked).toBe(true);
  if (cause === 'signal') owner.abort(cancelled);
  if (cause === 'owner check') obsolete = true;
  await vi.advanceTimersByTimeAsync(cause === 'deadline' ? 180001 : 51);
  expect(settled).toBe(true);
  expect(await result).toMatchObject({ name: cause === 'deadline' ? 'TimeoutError' : 'AbortError' });
  if (cause !== 'deadline') expect(await result).toBe(cancelled);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts the admitted connection when ownership changes as headers arrive', async () => {
  vi.useFakeTimers();
  let obsolete = false, signal;
  const cancelled = new DOMException('Replaced', 'AbortError');
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    signal = init.signal;
    obsolete = true;
    return new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream' } });
  }));
  const result = callDeepSeekAPI('', 'Sample reading', 'synthetic-key', 'deepseek-flash', false, {
    checkCancelled() { if (obsolete) throw cancelled; }
  }).catch(error => error);
  await vi.advanceTimersByTimeAsync(0);
  expect(await result).toBe(cancelled);
  expect(signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
