import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const criticalLog = vi.hoisted(() => vi.fn());
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog }));

describe('PDF library loader diagnostics', () => {
  beforeEach(() => { vi.resetModules(); criticalLog.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [undefined, 'PDF_NOT_FOUND', 'PDF.js not found'],
    [{}, 'PDF_GETDOCUMENT_MISSING', 'getDocument is missing']
  ])('reports a failed initialization with error severity', async (library, marker, message) => {
    const context = { __PDF_READY__: true, pdfjsLib: library };
    vi.stubGlobal('window', context);
    vi.stubGlobal('self', context);
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    await expect(loadPdfJs()).rejects.toThrow(message);
    expect(criticalLog).toHaveBeenCalledWith(expect.any(String), marker, expect.any(Object), 'error');
  });

  it('keeps successful initialization as a diagnostic event', async () => {
    const library = { getDocument: vi.fn(), GlobalWorkerOptions: { disableWorker: true } };
    const context = { __PDF_READY__: true, pdfjsLib: library };
    vi.stubGlobal('window', context);
    vi.stubGlobal('self', context);
    const { loadPdfJs } = await import('../../scripts/offscreen/pdf/utils/pdf-loader.js');
    await expect(loadPdfJs()).resolves.toBe(library);
    expect(criticalLog).toHaveBeenCalledWith(expect.any(String), 'PDF_LOADER_SUCCESS', expect.any(Object));
    await expect(loadPdfJs()).resolves.toBe(library);
  });
});
