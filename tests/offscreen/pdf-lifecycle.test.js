import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { PDF_PARSE_TIMEOUT_MS: 800 } }));
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: async () => pdfjs }));

import { parsePdfDocument } from '../../scripts/offscreen/pdf/utils/pdf-parser.js';
import { destroyPdfDocument } from '../../scripts/offscreen/pdf/core/pdf-loader.js';

const bytes = () => new TextEncoder().encode('%PDF-1.7\n').buffer;
function task(promise = Promise.resolve({ numPages: 1 })) {
  return { promise, destroy: vi.fn(async () => {}) };
}

describe('PDF document lifecycle', () => {
  beforeEach(() => { vi.stubGlobal('document', { fonts: {} }); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('waits for task disposal and shares repeated release requests', async () => {
    let complete;
    const loading = task();
    loading.destroy.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    pdfjs.getDocument.mockReturnValue(loading);
    const pdf = await parsePdfDocument(bytes());
    let released = false;
    const first = destroyPdfDocument(pdf).then(() => { released = true; });
    const second = destroyPdfDocument(pdf);
    await Promise.resolve();
    expect(loading.destroy).toHaveBeenCalledOnce();
    expect(released).toBe(false);
    complete();
    await Promise.all([first, second]);
    await destroyPdfDocument(pdf);
    expect(released).toBe(true);
    expect(loading.destroy).toHaveBeenCalledOnce();
  });

  it('releases only its owning task while another document remains usable', async () => {
    const a = task(), b = task();
    pdfjs.getDocument.mockReturnValueOnce(a).mockReturnValueOnce(b);
    const first = await parsePdfDocument(bytes()), second = await parsePdfDocument(bytes());
    await destroyPdfDocument(first);
    expect(a.destroy).toHaveBeenCalledOnce();
    expect(b.destroy).not.toHaveBeenCalled();
    expect(second.numPages).toBe(1);
    await destroyPdfDocument(second);
    expect(b.destroy).toHaveBeenCalledOnce();
  });

  it('copies caller-owned bytes and supplies local fonts, CMaps and decoders', async () => {
    const input = bytes();
    const loading = task();
    pdfjs.getDocument.mockImplementation(options => {
      structuredClone(options.data.buffer, { transfer: [options.data.buffer] });
      return loading;
    });
    const pdf = await parsePdfDocument(input);
    expect(new TextDecoder().decode(input)).toBe('%PDF-1.7\n');
    const options = pdfjs.getDocument.mock.calls[0][0];
    expect(options).toMatchObject({ isEvalSupported: false, fontExtraProperties: true, cMapPacked: true, useWorkerFetch: true, ownerDocument: document });
    for (const [key, directory] of [['cMapUrl','cmaps'], ['iccUrl','iccs'], ['standardFontDataUrl','standard_fonts'], ['wasmUrl','wasm']]) {
      expect(options[key]).toBe(chrome.runtime.getURL(`lib/pdfjs/${directory}/`));
    }
    expect(options).not.toHaveProperty('disableWorker');
    await destroyPdfDocument(pdf);
  });

  it('disposes a rejected parse while preserving its original error', async () => {
    const error = new Error('Malformed document');
    const loading = task(Promise.reject(error));
    loading.destroy.mockRejectedValue(new Error('Disposal failed'));
    pdfjs.getDocument.mockReturnValue(loading);
    await expect(parsePdfDocument(bytes())).rejects.toBe(error);
    expect(loading.destroy).toHaveBeenCalledOnce();
  });

  it('disposes password-protected loading tasks promptly', async () => {
    const loading = task(new Promise(() => {}));
    pdfjs.getDocument.mockReturnValue(loading);
    const pending = expect(parsePdfDocument(bytes())).rejects.toThrow('password-protected');
    await vi.waitFor(() => expect(loading.onPassword).toBeTypeOf('function'));
    loading.onPassword(() => {}, 1);
    await pending;
    expect(loading.destroy).toHaveBeenCalledOnce();
  });

  it('bounds a stalled parse and disposes its worker', async () => {
    vi.useFakeTimers();
    const loading = task(new Promise(() => {}));
    pdfjs.getDocument.mockReturnValue(loading);
    const pending = expect(parsePdfDocument(bytes())).rejects.toThrow('parsing timeout');
    await vi.advanceTimersByTimeAsync(800);
    await pending;
    expect(loading.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases a no-page document before rejecting it', async () => {
    const loading = task(Promise.resolve({ numPages: 0 }));
    pdfjs.getDocument.mockReturnValue(loading);
    await expect(parsePdfDocument(bytes())).rejects.toThrow('no pages');
    expect(loading.destroy).toHaveBeenCalledOnce();
  });

  it('preserves the operation result when worker disposal fails', async () => {
    const loading = task();
    loading.destroy.mockRejectedValue(new Error('Disposal failed'));
    pdfjs.getDocument.mockReturnValue(loading);
    const pdf = await parsePdfDocument(bytes());
    await expect(destroyPdfDocument(pdf)).resolves.toBeUndefined();
    await expect(destroyPdfDocument(null)).resolves.toBeUndefined();
    expect(loading.destroy).toHaveBeenCalledOnce();
  });
});
