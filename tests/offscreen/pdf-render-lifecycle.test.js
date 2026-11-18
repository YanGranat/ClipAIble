import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const library = vi.hoisted(() => ({ getDocument: vi.fn(), ready: null, stored: vi.fn() }));
vi.mock('../../scripts/api/pdf-storage.js', () => ({ getPdfData: library.stored }));
vi.mock('../../scripts/api/pdf-operation-storage.js', () => ({ putPdfOperationBlob: vi.fn(async (id, _run, page) => `${id}:${page}`) }));
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: () => library.ready || Promise.resolve(library) }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { PDF_PARSE_TIMEOUT_MS: 500, PDF_FIRST_PAGE_RENDER_TIMEOUT_MS: 500, PDF_RENDER_TIMEOUT_MS: 500 } }));

import { handleGetPdfMetadata, handleRenderAllPdfPages, handleCancelPdfRender } from '../../scripts/offscreen/message-handlers.js';
import { startPdfRender, cancelPdfRender } from '../../scripts/offscreen/pdf/render-operations.js';
const data = operationId => ({ operationId, pdfData: btoa('%PDF-1.7\n'), pdfUrl: 'file:///document.pdf', pageNum: 1, totalPages: 1, scale: 1 });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => vi.advanceTimersByTimeAsync(0);
function documentTask() {
  const page = { getViewport: () => ({ width: 600, height: 800 }), cleanup: vi.fn(), render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })) };
  const pdf = { numPages: 1, getMetadata: vi.fn(async () => ({ info: {} })), getOutline: vi.fn(async () => null), getPage: vi.fn(async () => page) };
  return { page, pdf, task: { promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) } };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); library.getDocument.mockReset(); library.stored.mockReset(); library.ready = null;
  chrome.runtime.sendMessage.mockResolvedValue({});
  vi.stubGlobal('document', { fonts: {}, createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,AQ==', toBlob: callback => callback(new Blob([new Uint8Array([1])], { type: 'image/jpeg' })) })) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PDF rendering ownership', () => {
  it('reads metadata from an explicit data reference without fetching the source', async () => {
    const input = new TextEncoder().encode('%PDF-1.7\n').buffer;
    library.stored.mockResolvedValue(input);
    const { task } = documentTask(); library.getDocument.mockReturnValue(task);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected source fetch'); }));
    const reply = vi.fn(() => expect(task.destroy).toHaveBeenCalledOnce());
    await handleGetPdfMetadata('metadata', { ...data(crypto.randomUUID()), pdfData: undefined, pdfDataRef: 'pdf-render:metadata' }, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, numPages: 1 }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([handleRenderAllPdfPages])('allocates a bounded complete-page canvas for oversized geometry', async handler => {
    const { page, task } = documentTask();
    page.getViewport = ({ scale }) => ({ width: 40000 * scale, height: 200 * scale, scale });
    library.getDocument.mockReturnValue(task);
    const reply = vi.fn(); await handler('render', { ...data(crypto.randomUUID()), scale: 2 }, reply);
    const payload = reply.mock.calls[0][0], result = payload.images?.[0] || payload;
    expect(payload.success).toBe(true);
    expect(result).toMatchObject({ width: 32767, height: 164 });
    const viewport = page.render.mock.calls[0][0].viewport;
    expect(viewport.scale).toBeLessThan(2);
    expect(viewport.width).toBeLessThanOrEqual(32767);
    expect(task.destroy).toHaveBeenCalledOnce();
  });
  it.each([null, new Error('Storage unavailable')])('does not revisit the source when an explicit data reference cannot be read: %j', async stored => {
    if (stored instanceof Error) library.stored.mockRejectedValue(stored);
    else library.stored.mockResolvedValue(stored);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected source fetch'); }));
    for (const handler of [handleRenderAllPdfPages]) {
      const reply = vi.fn(); await handler('render', { ...data(crypto.randomUUID()), pdfData: undefined, pdfDataRef: 'pdf-render:missing' }, reply);
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'errorPdfDataUnavailable' }));
    }
    expect(fetch).not.toHaveBeenCalled(); expect(library.getDocument).not.toHaveBeenCalled();
  });
  it.each([handleRenderAllPdfPages])('releases its document and canvas before replying', async handler => {
    const { page, task } = documentTask(); library.getDocument.mockReturnValue(task);
    const reply = vi.fn(() => {
      expect(task.destroy).toHaveBeenCalledOnce();
      for (const result of document.createElement.mock.results) expect(result.value).toMatchObject({ width: 0, height: 0 });
    });
    await handler('render', data(crypto.randomUUID()), reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(page.render).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('consumes cancellation arriving before admission without loading PDF.js', async () => {
    const id = crypto.randomUUID();
    handleCancelPdfRender('cancel', { operationId: id }, vi.fn());
    const reply = vi.fn(); await handleRenderAllPdfPages('render', data(id), reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'statusCancelled' }));
    expect(library.getDocument).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled library wait without admitting a late loading task', async () => {
    const ready = deferred(); library.ready = ready.promise;
    const id = crypto.randomUUID(), reply = vi.fn();
    const pending = handleRenderAllPdfPages('render', data(id), reply); await tick();
    cancelPdfRender(id); await pending;
    ready.resolve(library); await tick();
    expect(library.getDocument).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'statusCancelled' }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['parse', 'metadata', 'outline'])('cancels a stalled %s while a replacement document stays usable', async stage => {
    const a = documentTask(), b = documentTask(), stalled = deferred();
    if (stage === 'parse') a.task.promise = stalled.promise;
    if (stage === 'metadata') a.pdf.getMetadata.mockReturnValue(stalled.promise);
    if (stage === 'outline') a.pdf.getOutline.mockReturnValue(stalled.promise);
    library.getDocument.mockReturnValueOnce(a.task).mockReturnValueOnce(b.task);
    const id = crypto.randomUUID(), oldReply = vi.fn();
    const old = handleRenderAllPdfPages('old', data(id), oldReply); await tick();
    cancelPdfRender(id); await old;
    expect(a.task.destroy).toHaveBeenCalledOnce();
    expect(oldReply).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'statusCancelled' }));
    const nextReply = vi.fn(); await handleRenderAllPdfPages('new', data(crypto.randomUUID()), nextReply);
    expect(nextReply).toHaveBeenCalledWith(expect.objectContaining({ success: true, images: [expect.objectContaining({ width: 600, height: 800 })] }));
    expect(b.page.render).toHaveBeenCalledOnce(); expect(b.task.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([handleRenderAllPdfPages])('cancels only its active render task and cleans its canvas', async handler => {
    const a = documentTask(), b = documentTask(), rendering = deferred();
    const renderTask = { promise: rendering.promise, cancel: vi.fn(() => rendering.reject(Object.assign(new Error('Cancelled'), { name: 'RenderingCancelledException' }))) };
    a.page.render.mockReturnValue(renderTask);
    library.getDocument.mockReturnValueOnce(a.task).mockReturnValueOnce(b.task);
    const id = crypto.randomUUID(), reply = vi.fn();
    const pending = handler('old', data(id), reply); await tick();
    expect(a.page.render).toHaveBeenCalledOnce();
    cancelPdfRender(id); await pending;
    expect(renderTask.cancel).toHaveBeenCalled(); expect(a.task.destroy).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'statusCancelled' }));
    const replacement = vi.fn(); await handler('new', data(crypto.randomUUID()), replacement);
    expect(replacement).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(b.task.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replace an active owner when a duplicate identifier arrives', async () => {
    const id = crypto.randomUUID(), first = startPdfRender(id), duplicate = startPdfRender(id);
    expect(() => duplicate.check()).toThrow('already exists');
    await duplicate.finish(); expect(() => first.check()).not.toThrow();
    cancelPdfRender(id); expect(() => first.check()).toThrow('cancelled');
    await first.finish(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the tracked render before releasing its document', async () => {
    const operationId = crypto.randomUUID(), operation = startPdfRender(operationId);
    const task = { promise: Promise.resolve(), cancel: vi.fn() };
    operation.track(task); cancelPdfRender(operationId);
    expect(task.cancel).toHaveBeenCalledOnce();
    expect(operation.signal.aborted).toBe(true);
    await operation.finish();
  });
});
