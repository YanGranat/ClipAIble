import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn(), version: '2.6.347' }));
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), criticalLog: vi.fn()
}));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { PDF_PARSE_TIMEOUT_MS: 1000, PDF_RENDER_TIMEOUT_MS: 1000 } }));
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: async () => pdfjs }));
vi.mock('../../scripts/offscreen/pdf/core/pdf-loader.js', () => ({
  loadPdfDocument: vi.fn(),
  destroyPdfDocument: vi.fn(async pdf => { if (pdf) await pdf.destroy(); })
}));
vi.mock('../../scripts/offscreen/pdf/extract.js', () => ({ extractPdfContent: vi.fn() }));

import { parsePdfDocument } from '../../scripts/offscreen/pdf/utils/pdf-parser.js';
import { handleGetPdfPageDimensions, handleGetVoices, handleGetStoredVoices, handleRenderPdfPageImage, handleRenderAllPdfPages, handleGetPdfMetadata, handleExtractPdfPageText } from '../../scripts/offscreen/message-handlers.js';
import { loadPdfDocument } from '../../scripts/offscreen/pdf/core/pdf-loader.js';

describe('PDF loading options', () => {
  let pdf;
  beforeEach(() => {
    vi.stubGlobal('document', { fonts: {}, createElement: vi.fn() });
    pdf = {
      numPages: 1,
      destroy: vi.fn(async () => {}),
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({ items: [{ str: 'Sample text' }] }),
        cleanup: vi.fn()
      }))
    };
    loadPdfDocument.mockResolvedValue({ pdf, numPages: 1, metadata: { title: 'Sample document' } });
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve(pdf) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('disables generated evaluation while parsing PDF data', async () => {
    const data = new TextEncoder().encode('%PDF-1.4\n').buffer;
    await expect(parsePdfDocument(data)).resolves.toBe(pdf);
    expect(pdfjs.getDocument).toHaveBeenCalledWith(expect.objectContaining({ data, isEvalSupported: false }));
  });

  it('disables generated evaluation while loading page dimensions from data', async () => {
    const reply = vi.fn();
    await handleGetPdfPageDimensions('request', { pdfData: btoa('%PDF-1.4\n'), pageNum: 1 }, reply);
    expect(pdfjs.getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, width: 600, height: 800 }));
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('clears a completed page render deadline', async () => {
    vi.useFakeTimers();
    const task = { promise: Promise.resolve(), cancel: vi.fn() };
    const page = {
      getViewport: () => ({ width: 600, height: 800 }),
      render: vi.fn(() => task),
      cleanup: vi.fn()
    };
    pdf.getPage.mockResolvedValue(page);
    loadPdfDocument.mockResolvedValue({ pdf, numPages: 1 });
    document.createElement.mockReturnValue({
      getContext: () => ({}),
      toDataURL: () => 'data:image/jpeg;base64,AQ=='
    });
    const reply = vi.fn();
    await handleRenderPdfPageImage('request', { pdfUrl: 'https://example.com/document.pdf', pageNum: 1 }, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, width: 600, height: 800 }));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task.cancel).not.toHaveBeenCalled();
    expect(pdf.destroy).toHaveBeenCalledOnce();
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({ intent: 'print' }));
  });

  it.each([handleGetPdfMetadata, handleExtractPdfPageText, handleGetPdfPageDimensions])
    ('releases request-owned documents after reading PDF information', async handler => {
      const reply = vi.fn();
      await handler('request', { pdfUrl: 'https://example.com/document.pdf', pageNum: 1 }, reply);
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(pdf.destroy).toHaveBeenCalledOnce();
    });

  it('releases a document after rendering all requested pages', async () => {
    const page = {
      getViewport: () => ({ width: 600, height: 800 }),
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      cleanup: vi.fn()
    };
    pdf.getPage.mockResolvedValue(page);
    document.createElement.mockReturnValue({
      getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,AQ=='
    });
    const reply = vi.fn();
    await handleRenderAllPdfPages('request', { pdfData: btoa('%PDF-1.4\n'), totalPages: 1 }, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: true, images: [expect.objectContaining({ pageNum: 1, base64: 'AQ==' })] }));
    expect(pdf.destroy).toHaveBeenCalledOnce();
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({ intent: 'print' }));
  });

  it.each([handleExtractPdfPageText, handleGetPdfPageDimensions, handleRenderPdfPageImage])
    ('releases request-owned documents after a page failure', async handler => {
      pdf.getPage.mockRejectedValue(new Error('Page unavailable'));
      const reply = vi.fn();
      await handler('request', { pdfUrl: 'https://example.com/document.pdf', pageNum: 1 }, reply);
      expect(reply).toHaveBeenCalledWith({ success: false, error: 'Page unavailable' });
      expect(pdf.destroy).toHaveBeenCalledOnce();
    });
});

describe('Voice metadata requests', () => {
  it.each([handleGetVoices, handleGetStoredVoices])('uses the worker returned by initialization', async handler => {
    const worker = {};
    const init = vi.fn(async () => worker);
    const get = vi.fn(async () => []);
    const reply = vi.fn();
    await expect(handler('request', init, get, null, reply)).resolves.toBeUndefined();
    expect(init).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(worker);
    expect(reply).toHaveBeenCalledWith({ success: true, voices: [] });
  });

  it.each([handleGetVoices, handleGetStoredVoices])('reuses an existing worker', async handler => {
    const worker = {};
    const init = vi.fn();
    const get = vi.fn(async () => []);
    await handler('request', init, get, worker, vi.fn());
    expect(init).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(worker);
  });

  it.each([handleGetVoices, handleGetStoredVoices])('rejects unavailable worker initialization', async handler => {
    const get = vi.fn();
    await expect(handler('request', async () => null, get, null, vi.fn())).rejects.toThrow('TTS Worker is not available');
    expect(get).not.toHaveBeenCalled();
  });
});
