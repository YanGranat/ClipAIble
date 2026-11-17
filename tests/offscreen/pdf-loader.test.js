import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const criticalLog = vi.hoisted(() => vi.fn());
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog }));

describe('PDF library loader diagnostics', () => {
  beforeEach(() => { vi.resetModules(); criticalLog.mockClear(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([
    [undefined, 'PDF_NOT_FOUND', 'PDF.js not found'],
    [{}, 'PDF_GETDOCUMENT_MISSING', 'getDocument is missing']
  ])('reports a failed initialization with error severity', async (library, marker, message) => {
    vi.stubGlobal('pdfjsLib', library);
    vi.stubGlobal('__PDF_READY_PROMISE__', Promise.resolve(library));
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    await expect(loadPdfJs()).rejects.toThrow(message);
    expect(criticalLog).toHaveBeenCalledWith(expect.any(String), marker, expect.any(Object), 'error');
  });

  it('keeps successful initialization as a diagnostic event', async () => {
    const library = { getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: 'local-worker.mjs' } };
    vi.stubGlobal('pdfjsLib', library);
    vi.stubGlobal('__PDF_READY_PROMISE__', Promise.resolve(library));
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    await expect(loadPdfJs()).resolves.toBe(library);
    expect(criticalLog).toHaveBeenCalledWith(expect.any(String), 'PDF_LOADER_SUCCESS', expect.any(Object));
    await expect(loadPdfJs()).resolves.toBe(library);
  });

  it('waits for module initialization and clears its readiness deadline', async () => {
    vi.useFakeTimers();
    let ready;
    vi.stubGlobal('__PDF_READY_PROMISE__', new Promise(resolve => { ready = resolve; }));
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    const library = { getDocument: vi.fn() };
    const pending = loadPdfJs();
    vi.stubGlobal('pdfjsLib', library);
    ready(library);
    await expect(pending).resolves.toBe(library);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects initialization failures rather than using an incomplete global', async () => {
    const error = new Error('Module unavailable');
    vi.stubGlobal('__PDF_INIT_ERROR__', error);
    vi.stubGlobal('__PDF_READY_PROMISE__', Promise.resolve(null));
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    await expect(loadPdfJs()).rejects.toMatchObject({ translationKey: 'errorPdfJsLoadFailed', message: 'PDF.js initialization failed' });
  });

  it('bounds a stalled initialization', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('__PDF_READY_PROMISE__', new Promise(() => {}));
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    const pending = expect(loadPdfJs()).rejects.toThrow('initialization timed out');
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
