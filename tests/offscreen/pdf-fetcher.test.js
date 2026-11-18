import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/constants.js', () => ({ LIMITS: { MAX_FILE_SIZE: 12 } }));

import { fetchPdfFile } from '../../scripts/offscreen/pdf/utils/pdf-fetcher.js';

describe('PDF download bounds', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function head(length) {
    return { headers: { get: () => length == null ? null : String(length) } };
  }
  function body(chunks, cancel = vi.fn()) {
    let index = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(new Uint8Array(chunks[index++]));
        else controller.close();
      }, cancel
    }));
  }

  it('reads an exact-limit body without leaving a deadline', async () => {
    fetch.mockResolvedValueOnce(body([5, 7]));
    await expect(fetchPdfFile('https://example.com/document.pdf')).resolves.toHaveProperty('byteLength', 12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, 1])('cancels an oversized stream despite missing or understated headers', async length => {
    const cancel = vi.fn();
    const response = body([7, 7, 7], cancel);
    if (length !== null) response.headers.set('Content-Length', String(length));
    fetch.mockResolvedValueOnce(response);
    await expect(fetchPdfFile('https://example.com/document.pdf')).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetches the selected document once with its browser credentials', async () => {
    fetch.mockResolvedValueOnce(body([6]));
    await expect(fetchPdfFile('https://example.com/document.pdf')).resolves.toHaveProperty('byteLength', 6);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and cancels a body that stops producing bytes', async () => {
    const cancel = vi.fn();
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const download = fetchPdfFile('https://example.com/document.pdf');
    const rejected = expect(download).rejects.toThrow('PDF download timeout');
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fetch when supplied PDF data already exceeds the limit', async () => {
    await expect(fetchPdfFile('document', new ArrayBuffer(13))).rejects.toThrow('too large');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['headers', 'body'])('reacts to an AbortSignal while %s are stalled', async phase => {
    const controller = new AbortController(), reason = new Error('Owner cancelled');
    const cancel = vi.fn();
    if (phase === 'headers') fetch.mockImplementation(() => new Promise(() => {}));
    else fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const pending = fetchPdfFile('https://example.com/document.pdf', null, { signal: controller.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    expect(fetch.mock.calls.at(-1)[1].signal.aborted).toBe(true);
    await rejected;
    expect(fetch.mock.calls.at(-1)[1].signal.aborted).toBe(true);
    if (phase === 'body') expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives the body its own deadline after slow response headers', async () => {
    let deliverHeaders;
    fetch.mockImplementationOnce(() => new Promise(resolve => { deliverHeaders = resolve; }));
    const pending = fetchPdfFile('https://example.com/document.pdf');
    let settled = false;
    pending.catch(() => { settled = true; });
    const rejected = expect(pending).rejects.toThrow('PDF download timeout');
    await vi.advanceTimersByTimeAsync(599999);
    expect(deliverHeaders).toBeTypeOf('function');
    deliverHeaders(new Response(new ReadableStream({})));
    await vi.advanceTimersByTimeAsync(599999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks cancellation before fetching or accepting supplied data', async () => {
    const error = new Error('Cancelled');
    const options = { checkCancelled: () => { throw error; } };
    await expect(fetchPdfFile('https://example.com/document.pdf', null, options)).rejects.toBe(error);
    await expect(fetchPdfFile('local-document', new ArrayBuffer(1), options)).rejects.toBe(error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to GET after cancellation during response headers', async () => {
    let cancelled = false;
    const error = new Error('Cancelled');
    fetch.mockImplementationOnce(async () => { cancelled = true; throw new Error('Fetch unavailable'); });
    await expect(fetchPdfFile('https://example.com/document.pdf', null, {
      checkCancelled: () => { if (cancelled) throw error; }
    })).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the response body when cancellation follows GET headers', async () => {
    let cancelled = false;
    const cancel = vi.fn();
    const error = new Error('Cancelled');
    fetch.mockImplementationOnce(async () => {
      const response = new Response(new ReadableStream({ cancel }));
      cancelled = true;
      return response;
    });
    await expect(fetchPdfFile('file:///sample.pdf', null, {
      checkCancelled: () => { if (cancelled) throw error; }
    })).rejects.toBe(error);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops reading and releases the reader after cancellation during a chunk', async () => {
    let cancelled = false;
    const error = new Error('Cancelled');
    const reader = {
      read: vi.fn(async () => { cancelled = true; return { done: false, value: new Uint8Array(2) }; }),
      cancel: vi.fn(async () => {}), releaseLock: vi.fn()
    };
    fetch.mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } });
    await expect(fetchPdfFile('https://example.com/document.pdf', null, {
      checkCancelled: () => { if (cancelled) throw error; }
    })).rejects.toBe(error);
    expect(reader.read).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
