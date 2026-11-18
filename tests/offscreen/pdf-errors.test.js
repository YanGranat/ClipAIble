import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const library = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/utils/pdf-loader.js', () => ({ loadPdfJs: async () => library }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/api/pdf-storage.js', async original => ({ ...(await original()),
  savePdfData: vi.fn(async () => {}), removePdfData: vi.fn(async () => {}),
  getPdfData: vi.fn(async () => new TextEncoder().encode('%PDF-1.7\n').buffer)
}));

import { handleGetPdfMetadata, handleRenderAllPdfPages } from '../../scripts/offscreen/message-handlers.js';
import { getPdfMetadata } from '../../scripts/api/pdf-offscreen.js';
import { processPdfPage } from '../../scripts/processing/pdf.js';
import { tSync } from '../../scripts/locales.js';
import { LIMITS } from '../../scripts/offscreen/pdf/constants.js';

let language;
let task;
let pdf;
beforeEach(() => {
  vi.clearAllMocks();
  language = 'ru';
  vi.stubGlobal('document', { fonts: {}, createElement: () => ({ getContext: () => null }) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.7\n')));
  chrome.storage.local.get.mockImplementation(async () => ({ ui_language: language }));
  chrome.runtime.getContexts = vi.fn(async () => [{ documentId: 'owned' }]);
  chrome.offscreen = { createDocument: vi.fn() };
  pdf = { numPages: 1, getMetadata: async () => ({ info: {} }), getOutline: async () => null,
    getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }), cleanup: vi.fn() }) };
  task = { promise: Promise.resolve(pdf), destroy: vi.fn(async () => {}) };
  library.getDocument.mockReturnValue(task);
  chrome.runtime.sendMessage.mockImplementation((message, callback) => {
    if (typeof callback !== 'function') return Promise.resolve({ success: true });
    const reply = payload => callback(JSON.parse(JSON.stringify(payload)));
    if (message.type === 'GET_PDF_METADATA') void handleGetPdfMetadata('metadata', message.data, reply);
    else if (message.type === 'EXTRACT_PDF') void handleGetPdfMetadata('extract', message.data, reply);
    else callback?.({ success: true });
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('PDF error descriptions across contexts', () => {
  it.each(['PasswordException', 'InvalidPDFException'])('preserves a typed %s across offscreen IPC', async name => {
    const key = name === 'PasswordException' ? 'errorPdfPasswordProtected' : 'errorPdfInvalid';
    expect(tSync(key, language)).not.toBe(key);
    expect(tSync(key, language)).toMatch(/[А-Яа-яЁё]/);
    task.promise = Promise.reject(Object.assign(new Error('Upstream diagnostic'), { name }));
    await expect(getPdfMetadata('https://example.com/sample.pdf')).rejects.toMatchObject({
      translationKey: key, translationParams: {}, message: tSync(key, language)
    });
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it('emits a typed render failure while releasing the request document', async () => {
    const reply = vi.fn();
    await handleRenderAllPdfPages('render', { operationId: crypto.randomUUID(), pdfUrl: 'https://example.com/sample.pdf', totalPages: 1, pdfData: new TextEncoder().encode('%PDF-1.7').buffer }, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ images: [expect.objectContaining({ pageNum: 1, error: expect.any(String) })] }));
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it('releases its worker without waiting for a stalled UI language read', async () => {
    chrome.storage.local.get.mockImplementation(() => new Promise(() => {}));
    task.promise = Promise.reject(Object.assign(new Error('Password required'), { name: 'PasswordException' }));
    const reply = vi.fn();
    await handleGetPdfMetadata('metadata', { pdfUrl: 'https://example.com/sample.pdf' }, reply);
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({ success: false, error: 'Password required',
      translationKey: 'errorPdfPasswordProtected', translationParams: {} });
  });

  it('localizes a size rejection without allocating a PDF worker', async () => {
    fetch.mockResolvedValue(new Response('', { headers: { 'Content-Length': String(LIMITS.MAX_FILE_SIZE + 1) } }));
    await expect(getPdfMetadata('https://example.com/sample.pdf')).rejects.toMatchObject({
      translationKey: 'errorPdfTooLarge', translationParams: { size: '500.0', max: '500' },
      message: tSync('errorPdfTooLarge', language, { size: '500.0', max: '500' })
    });
    expect(library.getDocument).not.toHaveBeenCalled();
  });

  it('retains a password descriptor through the extraction and processing boundaries', async () => {
    const { handleExtractPdf } = await import('../../scripts/offscreen/message-handlers.js');
    chrome.runtime.sendMessage.mockImplementation((message, callback) => { void handleExtractPdf('extract', message.data, payload => callback(JSON.parse(JSON.stringify(payload)))); });
    task.promise = Promise.reject(Object.assign(new Error('Upstream password diagnostic'), { name: 'PasswordException' }));
    await expect(processPdfPage({ extractionOnly: true, url: 'https://example.com/sample.pdf', tabId: 1 }, 'https://example.com/sample.pdf'))
      .rejects.toMatchObject({ translationKey: 'errorPdfPasswordProtected', translationParams: {}, message: tSync('errorPdfPasswordProtected', language) });
    expect(task.destroy).toHaveBeenCalledOnce();
  });
});
