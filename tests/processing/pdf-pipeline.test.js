import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processPdfPageWithAI } from '../../scripts/processing/pdf.js';
import { callAIWithImageAndHistory } from '../../scripts/api/index.js';
import { getPdfMetadata, renderAllPdfPages, readRenderedPdfPage } from '../../scripts/api/pdf-offscreen.js';
import { getPdfData } from '../../scripts/api/pdf-storage.js';
import { extractPdfDataFromTab } from '../../scripts/api/pdf-data-extractor.js';
import { LIMITS } from '../../scripts/offscreen/pdf/constants.js';
import { tSync } from '../../scripts/locales.js';
import { removePdfOperation } from '../../scripts/api/pdf-operation-storage.js';

const progressState = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/locales.js', async importOriginal => ({ ...(await importOriginal()), getUILanguage: async () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: vi.fn(), updateProgress: vi.fn(), getUILanguageCached: async () => 'en',
  getAIRequestOptions: data => ({ provider: data.provider, checkCancelled: data.checkCancelled }),
  getProcessingCallbacks: data => ({ updateState: progressState.update, updateProgress: vi.fn(async () => {}), checkCancellation: async () => { await data.checkCancelled?.(); } })
}));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { EXTRACTING: { id: 'extracting' } }, updateState: vi.fn() }));
vi.mock('../../scripts/extraction/pdf.js', () => ({ extractPdfContent: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAIWithImageAndHistory: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/api/pdf-offscreen.js', () => ({ extractPdfViaOffscreen: vi.fn(), getPdfMetadata: vi.fn(), renderAllPdfPages: vi.fn(), readRenderedPdfPage: vi.fn() }));
vi.mock('../../scripts/api/pdf-operation-storage.js', () => ({ removePdfOperation: vi.fn(async () => {}) }));
vi.mock('../../scripts/api/pdf-data-extractor.js', () => ({ extractPdfDataFromTab: vi.fn() }));
vi.mock('../../scripts/api/pdf-storage.js', () => ({ getPdfData: vi.fn(), savePdfData: vi.fn(async () => {}), removePdfData: vi.fn(), validatePdfData: vi.fn() }));
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
  extractPdfDataFromTab.mockResolvedValue(pdfBytes);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(pdfBytes)));
  getPdfMetadata.mockResolvedValue({ numPages: 2, metadata: { title: 'Moon Landing' } });
  renderAllPdfPages.mockResolvedValue({ operationId: 'sample-operation', pages: [{ pageNum: 1, ref: 'sample-operation:1', ...image }, { pageNum: 2, ref: 'sample-operation:2', ...image }] });
  readRenderedPdfPage.mockResolvedValue(image.imageData);
  callAIWithImageAndHistory.mockImplementation(async () => response('## Section\n\nSample paragraph.'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function settle(operation) {
  const result = operation.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  return result;
}

describe('PDF pipeline integrity', () => {
  it('reads an allowed local PDF directly without requesting a picker or viewer extraction', async () => {
    vi.stubGlobal('chrome', { ...chrome, extension: { ...chrome.extension, isAllowedFileSchemeAccess: async () => true } });
    await processPdfPageWithAI(input, 'file:///sample.pdf');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('file:///sample.pdf');
    expect(extractPdfDataFromTab).not.toHaveBeenCalled();
    expect(getPdfMetadata.mock.calls[0][1]).toEqual(pdfBytes);
  });

  it('retains the local viewer path when file access is denied', async () => {
    vi.stubGlobal('chrome', { ...chrome, extension: { ...chrome.extension, isAllowedFileSchemeAccess: async () => false } });
    await processPdfPageWithAI(input, 'file:///sample.pdf');
    expect(fetch).not.toHaveBeenCalled();
    expect(extractPdfDataFromTab).toHaveBeenCalledExactlyOnceWith('file:///sample.pdf', input.tabId);
  });

  it('does not turn an oversized allowed local PDF into a picker request', async () => {
    vi.stubGlobal('chrome', { ...chrome, extension: { ...chrome.extension, isAllowedFileSchemeAccess: async () => true } });
    fetch.mockResolvedValue(new Response(pdfBytes, { headers: { 'Content-Length': '65' } }));
    await expect(processPdfPageWithAI(input, 'file:///sample.pdf')).rejects.toMatchObject({ translationKey: 'errorPdfTooLarge' });
    expect(extractPdfDataFromTab).not.toHaveBeenCalled();
    expect(callAIWithImageAndHistory).not.toHaveBeenCalled();
  });

  it('retains code fences and keeps prose containing pipes outside tables', async () => {
    getPdfMetadata.mockResolvedValue({ numPages: 1, metadata: {} });
    renderAllPdfPages.mockResolvedValue({ operationId: 'sample-operation', pages: [{ pageNum: 1, ref: 'sample-operation:1' }] });
    callAIWithImageAndHistory.mockResolvedValue(response('```js\nconst pipe = "a|b|c";\n```\n\nThe values a | b | c are alternatives.\n\n| Name | Value |\n| --- | --- |\n| A | B |'));
    const result = await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'code', language: 'js', text: 'const pipe = "a|b|c";' }),
      expect.objectContaining({ type: 'paragraph', text: 'The values a | b | c are alternatives.' }),
      expect.objectContaining({ type: 'table', headers: ['Name', 'Value'], rows: [['A', 'B']] })
    ]));
  });
  it('retains one previous text turn, consumes page references in order, and disposes the result job', async () => {
    getPdfMetadata.mockResolvedValue({ numPages: 3, metadata: { title: 'Document title' } });
    renderAllPdfPages.mockResolvedValue({ operationId: 'sample-operation', pages: [1, 2, 3].map(pageNum => ({ pageNum, ref: `sample-operation:${pageNum}` })) });
    const histories = [];
    let page = 0;
    callAIWithImageAndHistory.mockImplementation(async (_system, _user, _image, history) => {
      histories.push(structuredClone(history));
      return response(`Page ${++page} content.`);
    });
    const result = await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(renderAllPdfPages).toHaveBeenCalledOnce();
    expect(readRenderedPdfPage.mock.calls.map(([ref]) => ref)).toEqual(['sample-operation:1', 'sample-operation:2', 'sample-operation:3']);
    expect(histories.map(value => value.length)).toEqual([0, 2, 2]);
    expect(histories[2][1]).toEqual({ role: 'assistant', content: 'Page 2 content.' });
    expect(histories.slice(1).every(value => typeof value[0].content === 'string' && !JSON.stringify(value).includes('data:image/'))).toBe(true);
    expect(result.markdown).toBe('Page 1 content.\n\nPage 2 content.\n\nPage 3 content.');
    expect(removePdfOperation).toHaveBeenCalledWith('sample-operation');
  });

  it('preserves an exhausted request error and never admits later pages', async () => {
    getPdfMetadata.mockResolvedValue({ numPages: 3, metadata: {} });
    renderAllPdfPages.mockResolvedValue({ operationId: 'sample-operation', pages: [1, 2, 3].map(pageNum => ({ pageNum, ref: `sample-operation:${pageNum}` })) });
    const failure = Object.assign(new Error('Service unavailable'), { status: 503, retryExhausted: true });
    callAIWithImageAndHistory.mockResolvedValueOnce(response('First page.')).mockRejectedValue(failure);
    await expect(processPdfPageWithAI(input, 'https://example.org/article.pdf')).rejects.toBe(failure);
    expect(callAIWithImageAndHistory).toHaveBeenCalledTimes(2);
    expect(readRenderedPdfPage).toHaveBeenCalledTimes(2);
    expect(removePdfOperation).toHaveBeenCalledWith('sample-operation');
  });
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

  it('retains translatable page counts and page ownership in progress updates', async () => {
    await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    const updates = progressState.update.mock.calls.map(([state]) => state).filter(state => state.statusTranslationKey);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ progress: 10, statusTranslationKey: 'statusRenderingPdfPages', statusTranslationParams: { pages: 2, count: 2 },
        status: tSync('statusRenderingPdfPages', 'en', { pages: 2, count: 2 }) }),
      ...[1, 2].map(page => expect.objectContaining({ statusTranslationKey: 'statusProcessingPdfPage', statusTranslationParams: { page, pages: 2 },
        status: tSync('statusProcessingPdfPage', 'en', { page, pages: 2 }) }))
    ]));
    expect(updates.every(state => state.status !== state.statusTranslationKey)).toBe(true);
  });

  it.each(['file:///sample.pdf', 'https://example.org/article.pdf'])('rejects incomplete extraction after a page fails: %s', async url => {
    vi.useFakeTimers();
    renderAllPdfPages.mockRejectedValue(Object.assign(new Error('PDF render incomplete'), { translationKey: 'errorPdfIncomplete', translationParams: { pages: '2' } }));
    const result = await settle(processPdfPageWithAI(input, url));
    expect(result.error).toMatchObject({ translationKey: 'errorPdfIncomplete', translationParams: { pages: '2' } });
  });

  it('stops before AI admission when a complete one-parse render cannot be produced', async () => {
    getPdfMetadata.mockResolvedValue({ numPages: 4, metadata: { title: 'Moon Landing' } });
    renderAllPdfPages.mockRejectedValue(Object.assign(new Error('PDF render incomplete'), { translationKey: 'errorPdfIncomplete', translationParams: { pages: '2, 4' } }));
    await expect(processPdfPageWithAI(input, 'https://example.org/article.pdf')).rejects.toMatchObject({ translationKey: 'errorPdfIncomplete', translationParams: { pages: '2, 4' } });
    expect(renderAllPdfPages).toHaveBeenCalledOnce();
    expect(readRenderedPdfPage).not.toHaveBeenCalled();
    expect(callAIWithImageAndHistory).not.toHaveBeenCalled();
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
    expect(renderAllPdfPages.mock.calls[0][4]).toMatchObject({ processingRunId: input.processingRunId, checkCancelled });
    expect(callAIWithImageAndHistory.mock.calls[0][7]).toMatchObject({ provider: 'openrouter', checkCancelled });
  });

  it('rejects an oversized web PDF before reading its body', async () => {
    getPdfData.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.4\nsample', { headers: { 'Content-Length': String(LIMITS.MAX_FILE_SIZE + 1) } })));
    await expect(processPdfPageWithAI(input, 'https://example.org/article.pdf')).rejects.toThrow(/too large/i);
  });

  it('applies the same size limit to bytes extracted from a local PDF tab', async () => {
    extractPdfDataFromTab.mockResolvedValue(new TextEncoder().encode('%PDF' + 'x'.repeat(61)).buffer);
    await expect(processPdfPageWithAI(input, 'file:///sample.pdf')).rejects.toThrow(/too large/i);
    expect(renderAllPdfPages).not.toHaveBeenCalled();
    expect(readRenderedPdfPage).not.toHaveBeenCalled();
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
    renderAllPdfPages.mockResolvedValue({ operationId: 'sample-operation', pages: [1, 2, 3].map(pageNum => ({ pageNum, ref: `sample-operation:${pageNum}`, ...image })) });
    const historySizes = [];
    callAIWithImageAndHistory.mockImplementation(async (_system, _user, _image, history) => {
      historySizes.push(history.length);
      return response(historySizes.length === 2 ? '' : 'Sample paragraph.');
    });
    await processPdfPageWithAI(input, 'https://example.org/article.pdf');
    expect(historySizes).toEqual([0, 2, 2]);
  });
});
