import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ current: 'a', entries: new Map(), save: null, handler: null, localize: null }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { PDF_PARSE_TIMEOUT_MS: 200, PDF_FIRST_PAGE_RENDER_TIMEOUT_MS: 200, PDF_RENDER_TIMEOUT_MS: 200 } }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: owner => owner !== state.current }));
vi.mock('../../scripts/utils/pdf-errors.js', () => ({
  createPdfError: (message, translationKey, translationParams) => Object.assign(new Error(message), { translationKey, translationParams }),
  localizePdfError: async error => state.localize ? state.localize(error) : error
}));
vi.mock('../../scripts/api/pdf-storage.js', () => ({
  validatePdfData: bytes => { if (new TextDecoder().decode(bytes).slice(0, 4) !== '%PDF') throw new Error('Invalid'); },
  savePdfData: vi.fn(async (key, bytes) => { if (state.save) await state.save(); state.entries.set(key, bytes.slice(0)); }),
  removePdfData: vi.fn(async key => { state.entries.delete(key); })
}));

import { getPdfMetadata, renderAllPdfPages, renderPdfPageImage } from '../../scripts/api/pdf-offscreen.js';
import { savePdfData, removePdfData } from '../../scripts/api/pdf-storage.js';
const bytes = () => new TextEncoder().encode('%PDF-1.7\nSynthetic bytes').buffer;
const image = { imageData: 'data:image/jpeg;base64,AQ==', width: 600, height: 800 };
const messages = () => chrome.runtime.sendMessage.mock.calls.map(([message]) => message);
const renders = () => messages().filter(message => message.type.startsWith('RENDER_'));
const tick = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  state.current = 'a'; state.entries.clear(); state.save = null; state.handler = null; state.localize = null;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network fetch'); }));
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: path => `chrome-extension://test-extension-id/${path}`,
      getContexts: vi.fn(async () => [{}]),
      sendMessage: vi.fn((message, callback) => {
        if (state.handler?.(message, callback)) return;
        callback(message.type === 'RENDER_ALL_PDF_PAGES'
          ? { success: true, images: Array.from({ length: message.data.totalPages }, (_, i) => ({ pageNum: i + 1, base64: 'AQ==', width: 600, height: 800 })) }
          : { success: true, ...image });
      })
    },
    offscreen: { createDocument: vi.fn(), closeDocument: vi.fn() },
    tabs: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    debugger: { attach: vi.fn(), sendCommand: vi.fn() }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PDF page rendering transport', () => {
  it('reads metadata from the acquired bytes with the same ownership and cleanup contract', async () => {
    state.handler = (message, callback) => {
      expect(message.type).toBe('GET_PDF_METADATA');
      expect(message.data.pdfDataRef).toBe(`pdf-render:${message.data.operationId}`);
      expect(state.entries.has(message.data.pdfDataRef)).toBe(true);
      callback({ success: true, numPages: 3, metadata: { title: 'Survey' } }); return true;
    };
    const input = bytes();
    await expect(getPdfMetadata('file:///document.pdf', input, { processingRunId: 'a' })).resolves.toEqual({ numPages: 3, metadata: { title: 'Survey' } });
    expect(savePdfData).toHaveBeenCalledOnce(); expect(state.entries.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled(); expect(input.byteLength).toBe(bytes().byteLength);
  });
  it('preserves a producer error when cleanup fails', async () => {
    removePdfData.mockRejectedValueOnce(new Error('Storage deletion failed'));
    state.handler = (_message, callback) => { callback({ success: false, error: 'Password needed', translationKey: 'errorPdfPasswordProtected' }); return true; };
    await expect(renderPdfPageImage('file:///document.pdf', 1, 1, bytes())).rejects.toMatchObject({ translationKey: 'errorPdfPasswordProtected' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves cancellation identity when cleanup fails', async () => {
    const cancellation = new Error('Job cancelled'); let cancelled = false;
    state.handler = (_message, callback) => true;
    removePdfData.mockRejectedValueOnce(new Error('Storage deletion failed'));
    const pending = renderPdfPageImage('file:///document.pdf', 1, 1, bytes(), { checkCancelled: () => { if (cancelled) throw cancellation; } });
    const rejected = expect(pending).rejects.toBe(cancellation);
    await tick(); cancelled = true; await vi.advanceTimersByTimeAsync(50); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a successful render if its data cannot be removed', async () => {
    removePdfData.mockRejectedValueOnce(new Error('Storage deletion failed'));
    await expect(renderPdfPageImage('file:///document.pdf', 1, 1, bytes())).rejects.toThrow('Storage deletion failed');
  });
  it.each(['file:///document.pdf', 'https://example.org/protected.pdf'])('renders exact supplied bytes without revisiting the source: %s', async url => {
    const input = bytes(); const original = new Uint8Array(input).slice();
    await expect(renderPdfPageImage(url, 2, 1.5, input, { processingRunId: 'a' })).resolves.toEqual(image);
    const request = renders()[0];
    expect(request.data).toMatchObject({ pdfUrl: url, pageNum: 2, scale: 1.5 });
    expect(new Uint8Array(savePdfData.mock.calls[0][1])).toEqual(original);
    expect(new Uint8Array(input)).toEqual(original);
    expect(request.data.pdfDataRef).toBe(`pdf-render:${request.data.operationId}`);
    expect(removePdfData).toHaveBeenCalledExactlyOnceWith(request.data.pdfDataRef);
    expect(state.entries.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sorts complete page results and preserves per-page failures', async () => {
    state.handler = (message, callback) => {
      callback({ success: true, images: [{ pageNum: 2, error: 'Page unavailable' }, { pageNum: 1, base64: 'AQ==', width: 20, height: 30 }] }); return true;
    };
    await expect(renderAllPdfPages('file:///document.pdf', 2, 1, bytes())).resolves.toEqual([
      { pageNum: 1, base64: 'AQ==', imageData: image.imageData, width: 20, height: 30 }, { pageNum: 2, error: 'Page unavailable' }
    ]);
  });

  it.each([[[1]], [[1, 1]], [[1, 3]]])('rejects missing, duplicate or out-of-range page results: %j', async pages => {
    state.handler = (_message, callback) => { callback({ success: true, images: pages.map(pageNum => ({ pageNum, base64: 'AQ==', width: 1, height: 1 })) }); return true; };
    await expect(renderAllPdfPages('file:///document.pdf', 2, 1, bytes())).rejects.toMatchObject({ translationKey: 'errorPdfRenderFailed' });
    expect(state.entries.size).toBe(0);
  });

  it('requires valid supplied bytes before creating an operation', async () => {
    await expect(renderPdfPageImage('https://example.org/document.pdf', 1)).rejects.toMatchObject({ translationKey: 'errorPdfDataUnavailable' });
    await expect(renderPdfPageImage('file:///document.pdf', 1, 1, new ArrayBuffer(4))).rejects.toMatchObject({ translationKey: 'errorPdfInvalid' });
    expect(savePdfData).not.toHaveBeenCalled(); expect(renders()).toHaveLength(0);
  });

  it('does not admit an already cancelled owner', async () => {
    state.current = 'b';
    await expect(renderPdfPageImage('file:///document.pdf', 1, 1, bytes(), { processingRunId: 'a' })).rejects.toMatchObject({ translationKey: 'statusCancelled' });
    expect(savePdfData).not.toHaveBeenCalled(); expect(renders()).toHaveLength(0);
  });

  it('removes a delayed write after cancellation without admitting a producer', async () => {
    let release;
    state.save = () => new Promise(resolve => { release = resolve; });
    const pending = renderPdfPageImage('file:///document.pdf', 1, 1, bytes(), { processingRunId: 'a' });
    const rejected = expect(pending).rejects.toMatchObject({ translationKey: 'statusCancelled' });
    await tick(); expect(release).toBeTypeOf('function');
    state.current = 'b'; await vi.advanceTimersByTimeAsync(50); await rejected;
    release(); await tick();
    expect(state.entries.size).toBe(0); expect(renders()).toHaveLength(0);
    expect(messages().some(message => message.type === 'CANCEL_PDF_RENDER')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks ownership again after shared-document setup finishes', async () => {
    let release;
    chrome.runtime.getContexts.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = renderPdfPageImage('file:///document.pdf', 1, 1, bytes(), { processingRunId: 'a' });
    const rejected = expect(pending).rejects.toMatchObject({ translationKey: 'statusCancelled' });
    await tick(); state.current = 'b'; await vi.advanceTimersByTimeAsync(50); await rejected;
    release([{}]); await tick();
    expect(renders()).toHaveLength(0); expect(state.entries.size).toBe(0);
  });

  it('cancels only its own operation while a same-source replacement and TTS remain usable', async () => {
    const callbacks = new Map(); let cancelled = false;
    state.entries.set('file:///document.pdf', bytes());
    state.handler = (message, callback) => {
      if (message.type.startsWith('RENDER_')) { callbacks.set(message.data.operationId, callback); return true; }
      if (message.type === 'CANCEL_PDF_RENDER') { callback({ success: true }); return true; }
      return false;
    };
    const a = renderPdfPageImage('file:///document.pdf', 1, 1, bytes(), { checkCancelled: () => { if (cancelled) throw new Error('A cancelled'); } });
    const rejected = expect(a).rejects.toThrow('A cancelled');
    await tick();
    const b = renderPdfPageImage('file:///document.pdf', 2, 1, bytes()); await tick();
    const [first, second] = renders();
    expect(first.data.pdfDataRef).not.toBe(second.data.pdfDataRef);
    cancelled = true; await vi.advanceTimersByTimeAsync(50); await rejected;
    expect(messages().filter(message => message.type === 'CANCEL_PDF_RENDER')).toEqual([{ target: 'offscreen', type: 'CANCEL_PDF_RENDER', data: { operationId: first.data.operationId } }]);
    callbacks.get(second.data.operationId)({ success: true, ...image }); await expect(b).resolves.toEqual(image);
    expect(state.entries.has(first.data.pdfDataRef)).toBe(false);
    callbacks.get(first.data.operationId)({ success: false, error: 'Cancelled', translationKey: 'statusCancelled' }); await tick();
    expect([...state.entries.keys()]).toEqual(['file:///document.pdf']);
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(messages().some(message => /TTS|CLEANUP/.test(message.type))).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a stalled producer and cancels only the admitted render', async () => {
    let reply;
    state.handler = (message, callback) => { if (message.type.startsWith('RENDER_')) reply = callback; else callback({ success: true }); return true; };
    const pending = renderPdfPageImage('file:///document.pdf', 1, 1, bytes());
    const rejected = expect(pending).rejects.toMatchObject({ translationKey: 'errorTimeout' });
    await vi.advanceTimersByTimeAsync(400); await rejected;
    expect(messages().at(-1)).toMatchObject({ type: 'CANCEL_PDF_RENDER', data: { operationId: renders()[0].data.operationId } });
    expect(state.entries.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    reply({ success: false, error: 'Cancelled' }); await tick();
    expect(state.entries.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
  });

  it('cleans data and deadlines before awaiting error localization', async () => {
    let release;
    state.localize = error => new Promise(resolve => { release = () => resolve(error); });
    state.handler = (_message, callback) => { callback({ success: false, error: 'Password needed', translationKey: 'errorPdfPasswordProtected' }); return true; };
    const pending = renderPdfPageImage('file:///document.pdf', 1, 1, bytes());
    const rejected = expect(pending).rejects.toMatchObject({ translationKey: 'errorPdfPasswordProtected' });
    await tick(); expect(release).toBeTypeOf('function');
    expect(state.entries.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    release(); await rejected;
  });
});
