import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processPdfPageWithAI } from '../../scripts/processing/pdf.js';
import { callAIWithImageAndHistory } from '../../scripts/api/index.js';
import { getPdfMetadata, getPdfPageDimensions, renderAllPdfPages, renderPdfPageImage } from '../../scripts/api/pdf-offscreen.js';
import { getPdfData } from '../../scripts/api/pdf-storage.js';
import { measurePdfLayoutInOriginalTab } from '../../scripts/api/pdf-cdp-render.js';
import { LIMITS } from '../../scripts/offscreen/pdf/constants.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ tSync: key => key }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: vi.fn(), updateProgress: vi.fn(), getUILanguageCached: async () => 'en',
  getAIRequestOptions: data => ({ provider: data.provider, checkCancelled: data.checkCancelled }),
  getProcessingCallbacks: data => ({ updateState: vi.fn(), updateProgress: vi.fn(async () => {}), checkCancellation: async () => { await data.checkCancelled?.(); } })
}));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { EXTRACTING: { id: 'extracting' } }, updateState: vi.fn() }));
vi.mock('../../scripts/extraction/pdf.js', () => ({ extractPdfContent: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAIWithImageAndHistory: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/api/pdf-offscreen.js', () => ({ extractPdfViaOffscreen: vi.fn(), getPdfMetadata: vi.fn(), getPdfPageDimensions: vi.fn(), renderAllPdfPages: vi.fn(), renderPdfPageImage: vi.fn() }));
vi.mock('../../scripts/api/pdf-data-extractor.js', () => ({ extractPdfDataFromTab: vi.fn() }));
vi.mock('../../scripts/api/pdf-storage.js', () => ({ getPdfData: vi.fn(), savePdfData: vi.fn(async () => {}), removePdfData: vi.fn(), validatePdfData: vi.fn() }));
vi.mock('../../scripts/api/pdf-cdp-render.js', () => ({ measurePdfLayoutInOriginalTab: vi.fn() }));
vi.mock('../../scripts/offscreen/pdf/constants.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, LIMITS: { ...actual.LIMITS, MAX_FILE_SIZE: 64 } };
});

const image = { imageData: 'data:image/png;base64,c2FtcGxl', width: 595, height: 842 };
const pdfBytes = new TextEncoder().encode('%PDF-1.4\nsample').buffer;
const input = { tabId: 1, apiKey: 'sample-key', model: 'sample-model', provider: 'openrouter', processingRunId: 'd6ebd07b-048e-48fd-8d04-d15032dd7615' };
const response = text => ({ result: { text, mergeWithPrevious: 'paragraph', metadata: {} }, assistantMessage: text, userMessage: { role: 'user', content: [{ type: 'text', text: 'Sample page' }] } });
beforeEach(() => {
  vi.clearAllMocks();
  getPdfData.mockResolvedValue(pdfBytes);
  getPdfMetadata.mockResolvedValue({ numPages: 2, metadata: { title: 'Moon Landing' } });
  getPdfPageDimensions.mockResolvedValue({ width: 595, height: 842 });
  measurePdfLayoutInOriginalTab.mockResolvedValue({ pdfContentWidth: 595, pdfContentHeight: 842 });
  renderAllPdfPages.mockResolvedValue([{ pageNum: 1, ...image }, { pageNum: 2, ...image }]);
  renderPdfPageImage.mockResolvedValue(image);
  callAIWithImageAndHistory.mockImplementation(async () => response('## Section\n\nSample paragraph.'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle(operation) {
  const result = operation.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  return result;
}

describe('PDF pipeline integrity', () => {
  it.each(['AI_RESPONSE_REFUSED', 'AI_RESPONSE_TRUNCATED', 'AI_MODEL_UNSUPPORTED_IMAGE'].flatMap(code =>
    ['file:///sample.pdf', 'https://example.org/article.pdf'].map(url => [code, url])
  ))('preserves %s without repeating an incompatible PDF request: %s', async (code, url) => {
    vi.useFakeTimers();
    callAIWithImageAndHistory.mockRejectedValue(Object.assign(new Error('The selected model cannot complete this request.'), { code }));
    const result = await settle(processPdfPageWithAI(input, url));
    expect(result.error).toMatchObject({ code });
    expect(callAIWithImageAndHistory).toHaveBeenCalledTimes(1);
  });

  it.each(['file:///sample.pdf', 'https://example.org/article.pdf'])('retains signed assistant blocks between PDF pages: %s', async url => {
    const signed = [
      { type: 'thinking', thinking: 'A page comparison.', signature: 'sample-signature' },
      { type: 'text', text: '{"text":"Sample paragraph.","metadata":{}}', thoughtSignature: 'sample-thought-signature' }
    ];
    const histories = [];
    callAIWithImageAndHistory.mockImplementation(async (_system, _user, _image, history) => {
      histories.push(structuredClone(history));
      return { ...response('Sample paragraph.'), assistantMessage: signed };
    });
    await processPdfPageWithAI({ ...input, provider: 'gemini' }, url);
    expect(histories.map(history => history.length)).toEqual([0, 2]);
    expect(histories[1][1]).toEqual({ role: 'assistant', content: signed });
  });

  it('preserves an unrelated heading whose length resembles the document title', async () => {
    callAIWithImageAndHistory.mockResolvedValueOnce(response('# Star Systems\n\nSample paragraph.'));
    const result = await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(result.title).toBe('Moon Landing');
    expect(result.content.some(item => item.type === 'heading' && item.text === 'Star Systems')).toBe(true);
  });

  it('keeps a metadata title even when it equals the tab title', async () => {
    callAIWithImageAndHistory.mockResolvedValueOnce(response('# A chapter heading\n\nSample paragraph.'));
    const result = await processPdfPageWithAI({ ...input, title: 'Moon Landing' }, 'https://example.org/article.pdf');
    expect(result.title).toBe('Moon Landing');
    expect(result.content.some(item => item.type === 'heading' && item.text === 'A chapter heading')).toBe(true);
  });

  it.each([{}, { text: null }, { text: 7 }, '{broken json'])('rejects malformed page data instead of counting it as a blank page: %j', async malformed => {
    vi.useFakeTimers();
    callAIWithImageAndHistory.mockResolvedValue({ ...response(''), result: malformed });
    const result = await settle(processPdfPageWithAI(input, 'file:///sample.pdf'));
    expect(result.error).toBeInstanceOf(Error);
  });

  it.each(['file:///sample.pdf', 'https://example.org/article.pdf'])('rejects incomplete extraction after a page fails: %s', async url => {
    vi.useFakeTimers();
    renderAllPdfPages.mockResolvedValue([{ pageNum: 1, ...image }, { pageNum: 2, error: 'Render failed' }]);
    renderPdfPageImage.mockImplementation(async (_url, page) => { if (page === 2) throw new Error('Render failed'); return image; });
    const result = await settle(processPdfPageWithAI(input, url));
    expect(result.error).toBeInstanceOf(Error);
  });

  it('accepts an explicitly empty page without making repeated AI requests', async () => {
    vi.useFakeTimers();
    callAIWithImageAndHistory.mockResolvedValueOnce(response('## Section\n\nSample paragraph.')).mockResolvedValue(response(''));
    const result = await settle(processPdfPageWithAI(input, 'https://example.org/article.pdf'));
    expect(result.error).toBeUndefined();
    expect(callAIWithImageAndHistory).toHaveBeenCalledTimes(2);
    expect(result.value.content.some(item => item.text === 'Sample paragraph.')).toBe(true);
  });

  it('passes the selected provider and operation identity through capture and AI requests', async () => {
    const checkCancelled = vi.fn();
    await processPdfPageWithAI({ ...input, checkCancelled }, 'https://example.org/article.pdf');
    expect(measurePdfLayoutInOriginalTab.mock.calls[0][1]).toMatchObject({ processingRunId: input.processingRunId, checkCancelled });
    expect(renderAllPdfPages.mock.calls[0][6]).toMatchObject({ processingRunId: input.processingRunId, checkCancelled });
    expect(callAIWithImageAndHistory.mock.calls[0][7]).toMatchObject({ provider: 'openrouter', checkCancelled });
  });

  it('rejects an oversized web PDF before reading its body', async () => {
    getPdfData.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.4\nsample', { headers: { 'Content-Length': String(LIMITS.MAX_FILE_SIZE + 1) } })));
    await expect(processPdfPageWithAI(input, 'https://example.org/article.pdf')).rejects.toThrow(/too large/i);
  });

  it('applies the same size limit to cached local PDF data', async () => {
    getPdfData.mockResolvedValue(new ArrayBuffer(65));
    await expect(processPdfPageWithAI(input, 'file:///sample.pdf')).rejects.toThrow(/too large/i);
    expect(callAIWithImageAndHistory).not.toHaveBeenCalled();
  });

  it('preserves valid page content when optional metadata fields have invalid types', async () => {
    callAIWithImageAndHistory.mockResolvedValue({ ...response('Sample paragraph.'), result: { text: 'Sample paragraph.', metadata: { title: 7, author: {}, date: null } } });
    const result = await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(result.title).toBe('Moon Landing');
    expect(result.content.some(item => item.text === 'Sample paragraph.')).toBe(true);
    expect(callAIWithImageAndHistory).toHaveBeenCalledTimes(2);
  });

  it('omits empty assistant turns when a blank page appears between content pages', async () => {
    getPdfMetadata.mockResolvedValue({ numPages: 3, metadata: { title: 'Moon Landing' } });
    renderAllPdfPages.mockResolvedValue([1, 2, 3].map(pageNum => ({ pageNum, ...image })));
    const historySizes = [];
    callAIWithImageAndHistory.mockImplementation(async (_system, _user, _image, history) => {
      historySizes.push(history.length);
      return response(historySizes.length === 2 ? '' : 'Sample paragraph.');
    });
    await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(historySizes).toEqual([0, 2, 2]);
  });
});
