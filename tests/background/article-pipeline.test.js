import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initOrchestration } from '../../scripts/background/orchestration.js';
import { handleProcessArticle } from '../../scripts/message-handlers/processing.js';
import { validateAndInitializeProcessing, handleStandardArticleProcessing, handleVideoPageProcessing } from '../../scripts/utils/processing/processing-helpers.js';
import { checkCancellation, updateProgress, getUILanguageCached, handleTranslation, handleAbstractGeneration, detectEffectiveLanguage } from '../../scripts/utils/processing/pipeline-helpers.js';
import { processWithoutAI, processWithSelectorMode, processWithExtractMode } from '../../scripts/processing/modes.js';
import { processVideoPage } from '../../scripts/processing/video.js';
import { getProcessingState, getProcessingRunId, startProcessing, resetState, cancelProcessing, setError, updateState, ERROR_CODES, PROCESSING_STAGES } from '../../scripts/state/processing.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { tSync } from '../../scripts/locales.js';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';

vi.mock('../../scripts/processing/modes.js', () => ({ processWithoutAI: vi.fn(), processWithSelectorMode: vi.fn(), processWithExtractMode: vi.fn() }));
vi.mock('../../scripts/processing/video.js', () => ({ processVideoPage: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('../../scripts/stats/index.js', () => ({ recordSave: vi.fn(async () => {}) }));

const content = {
  title: 'Independent article', author: 'Example Author', publishDate: '2032-06-19', detectedLanguage: 'en',
  content: [{ type: 'heading', level: 2, text: 'Notes', format: 'text' }, { type: 'paragraph', text: '<p>Retained content.</p>', html: '<p>Retained content.</p>' }]
};
let deps, start, generate;
beforeEach(async () => {
  vi.clearAllMocks();
  await cancelProcessing(vi.fn());
  resetState();
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en', statistics_enabled: false });
  chrome.tabs.get.mockResolvedValue({ id: 7, url: 'https://example.org/article' });
  chrome.scripting.executeScript.mockResolvedValue([]);
  for (const process of [processWithoutAI, processWithSelectorMode, processWithExtractMode]) process.mockResolvedValue(structuredClone(content));
  generate = vi.spyOn(DocumentGeneratorFactory, 'generate').mockResolvedValue({ success: true });
  deps = {
    log: vi.fn(), logWarn: vi.fn(), CONFIG, getProcessingState, setError, updateState, ERROR_CODES, PROCESSING_STAGES,
    validateAndInitializeProcessing, handlePdfPageProcessing: vi.fn(async () => true), handleVideoPageProcessing: vi.fn(async () => true),
    handleStandardArticleProcessing, checkCancellation, updateProgress, getUILanguageCached, handleTranslation, handleAbstractGeneration,
    detectEffectiveLanguage, translateContent: vi.fn(async result => result), translateImages: vi.fn(async items => items),
    detectSourceLanguage: vi.fn(() => 'en'), generateAbstract: vi.fn(), detectContentLanguage: vi.fn(async () => 'en'),
    DocumentGeneratorFactory, detectPdfPage: vi.fn(() => ({ isPdf: false })), getOriginalPdfUrl: vi.fn(),
    detectVideoPlatform: vi.fn(() => null), tSync, startKeepAlive: vi.fn(), stopKeepAlive: vi.fn(async () => {})
  };
  start = initOrchestration(deps).startArticleProcessing;
});
afterEach(async () => { await cancelProcessing(vi.fn()); generate.mockRestore(); });

function request(mode = 'automatic', extra = {}) {
  const data = { mode, url: 'https://example.org/article', tabId: 7, html: '<article><p>Captured content.</p></article>', outputFormat: 'markdown', language: 'auto', ...extra };
  let resolve;
  const reply = new Promise(done => { resolve = done; });
  const sendResponse = vi.fn(resolve);
  const inline = function extractPage() {};
  expect(handleProcessArticle({ action: 'processArticle', data }, {}, sendResponse, value => start(value, inline), deps.stopKeepAlive)).toBe(true);
  return { data, reply, sendResponse, inline };
}

function liveArticlePage({ html, url = 'https://example.org/article', responseStatus = 200, navigationUrl = url }) {
  const dom = new JSDOM(`<!doctype html>${html}`, { url, runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
  for (const heading of dom.window.document.querySelectorAll('h1')) {
    Object.defineProperty(heading, 'innerText', { value: heading.textContent });
  }
  dom.window.performance.getEntriesByType = kind => kind === 'navigation' ? [{ name: navigationUrl, responseStatus }] : [];
  chrome.scripting.executeScript.mockImplementationOnce(async ({ func, args, target }) => {
    expect(target).toEqual({ tabId: 7 });
    try {
      return [{ frameId: 0, result: dom.window.eval(`(${func.toString()})(...${JSON.stringify(args)})`) }];
    } finally {
      dom.window.close();
    }
  });
}

it.each([true, false])('checks the source page before video extraction (verification: %s)', async verification => {
  const html = verification
    ? '<title>Instrument Setup</title><script src="/cdn-cgi/challenge-platform/check.js"></script><h1>Verify to continue</h1>'
    : '<title>Instrument Setup</title><h1>Instrument Setup</h1><video controls></video>';
  liveArticlePage({ html });
  processVideoPage.mockResolvedValue(structuredClone(content));
  deps.detectVideoPlatform.mockReturnValue({ platform: 'vimeo', videoId: 'synthetic-id' });
  deps.handleVideoPageProcessing = handleVideoPageProcessing;
  start = initOrchestration(deps).startArticleProcessing;
  expect(await request().reply).toEqual({ started: true });
  if (verification) {
    await vi.waitFor(() => expect(getProcessingState().errorTranslationKey).toBe('errorSourcePageUnavailable'));
    expect(processVideoPage).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  } else {
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect(processVideoPage).toHaveBeenCalledOnce();
  }
});

it.each([
  ['automatic', 403], ['selector', 401], ['extract', 429], ['automatic', 503]
])('stops %s before extraction when the active document returned %i', async (mode, responseStatus) => {
  liveArticlePage({ html: '<title>Resource unavailable</title><main>Request could not be completed.</main>', responseStatus });
  const { reply } = request(mode);
  expect(await reply).toEqual({ started: true });
  await vi.waitFor(() => expect(getProcessingState()).toMatchObject({
    isProcessing: false, errorTranslationKey: 'errorSourcePageUnavailable', errorCode: 'validation_error'
  }));
  for (const processor of [processWithoutAI, processWithSelectorMode, processWithExtractMode]) expect(processor).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it.each([
  ['https://example.org/article', '<title>Verify to continue</title><main><iframe src="https://security.example/turnstile/widget"></iframe></main>'],
  ['https://example.org/sign-in', '<main><h1>Sign in to continue</h1><form><input type="password"></form></main>']
])('rejects a %s access shell even when it returns a success status', async (url, html) => {
  liveArticlePage({ html, url });
  const { reply } = request('selector', { url });
  expect(await reply).toEqual({ started: true });
  await vi.waitFor(() => expect(getProcessingState().errorTranslationKey).toBe('errorSourcePageUnavailable'));
  expect(processWithSelectorMode).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it.each([
  ['same document with unrelated previous navigation', {
    html: '<main><h1>Highlights</h1><div>Short authored text.</div></main>',
    responseStatus: 403, navigationUrl: 'https://example.org/previous'
  }],
  ['an unrelated document now in the tab', {
    html: '<title>Unavailable</title><main>Request could not be completed.</main>',
    responseStatus: 403, url: 'https://example.org/other'
  }],
  ['an authored article with a sign-in prompt', {
    html: '<title>Verify to continue</title><article><h1>Verify to continue</h1><p>Discussion of sign in prompts.</p><iframe src="https://security.example/turnstile/widget"></iframe></article>'
  }],
  ['a title alone', {
    html: '<title>Just a moment…</title><main><h1>Just a moment</h1><div>A brief note written by the author.</div></main>'
  }],
  ['a readable preview', {
    html: '<article><h1>Field notes</h1><p>Public preview of the author’s work.</p></article><aside>Sign in to continue.</aside>'
  }]
])('continues through %s', async (_title, page) => {
  liveArticlePage(page);
  expect(await request('automatic').reply).toEqual({ started: true });
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
  expect(processWithoutAI).toHaveBeenCalledOnce();
});

it('does not apply a late source check to a newer processing run', async () => {
  let releaseProbe;
  chrome.scripting.executeScript.mockImplementationOnce(() => new Promise(resolve => { releaseProbe = resolve; }));
  expect(await request().reply).toEqual({ started: true });
  await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalledOnce());
  await cancelProcessing(vi.fn());
  await startProcessing(vi.fn());
  const next = getProcessingRunId();
  releaseProbe([{ frameId: 0, result: true }]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(processWithoutAI).not.toHaveBeenCalled();
  expect(getProcessingRunId()).toBe(next);
  expect(getProcessingState()).toMatchObject({ isProcessing: true, error: null });
});

it.each([
  ['automatic', processWithoutAI], ['selector', processWithSelectorMode], ['extract', processWithExtractMode]
])('runs a %s request through admission, extraction, generation and completion', async (mode, processor) => {
  const { data, reply, sendResponse, inline } = request(mode);
  expect(await reply).toEqual({ started: true });
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(getProcessingState().isProcessing).toBe(false));
  expect(processor).toHaveBeenCalledOnce();
  expect(processor.mock.calls[0][0]).toBe(data);
  if (mode === 'extract') expect(processor.mock.calls[0]).toHaveLength(1);
  else expect(processor.mock.calls[0][1]).toBe(inline);
  for (const other of [processWithoutAI, processWithSelectorMode, processWithExtractMode].filter(item => item !== processor)) expect(other).not.toHaveBeenCalled();
  expect(generate.mock.calls[0].slice(0, 3)).toEqual(['markdown', { ...data, effectiveLanguage: 'en' }, content]);
  expect(data.processingRunId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(getProcessingState()).not.toHaveProperty('result');
  expect(sendResponse).toHaveBeenCalledOnce();
});

it('rejects an invalid format before extraction or generation', async () => {
  const { reply } = request('selector', { outputFormat: 'invalid' });
  expect(await reply).toMatchObject({ started: false, translationKey: 'errorProcessingNotStarted' });
  expect(getProcessingState().error).toBeTruthy();
  for (const process of [processWithoutAI, processWithSelectorMode, processWithExtractMode]) expect(process).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it.each(['pdf', 'video'])('routes a %s input before any article extraction mode', async kind => {
  if (kind === 'pdf') deps.detectPdfPage.mockReturnValue({ isPdf: true, originalUrl: 'https://example.org/document.pdf' });
  else deps.detectVideoPlatform.mockReturnValue({ platform: 'youtube', videoId: 'synthetic-id' });
  const { reply, data } = request('extract');
  expect(await reply).toEqual({ started: true });
  const selected = kind === 'pdf' ? deps.handlePdfPageProcessing : deps.handleVideoPageProcessing;
  expect(selected).toHaveBeenCalledOnce();
  expect(selected.mock.calls[0][0]).toBe(data);
  for (const process of [processWithoutAI, processWithSelectorMode, processWithExtractMode]) expect(process).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it('prevents a cancelled translation from generating a document or completing a newer run', async () => {
  let release;
  deps.translateContent.mockImplementation(result => new Promise(resolve => { release = () => resolve(result); }));
  const { reply } = request('selector', { language: 'fr', apiKey: 'synthetic-key', model: 'gpt-6.2-sol' });
  expect(await reply).toEqual({ started: true });
  await vi.waitFor(() => expect(deps.translateContent).toHaveBeenCalledOnce());
  await cancelProcessing(vi.fn());
  await startProcessing(vi.fn());
  const next = getProcessingRunId();
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(generate).not.toHaveBeenCalled();
  expect(getProcessingRunId()).toBe(next);
  expect(getProcessingState()).toMatchObject({ isProcessing: true, error: null });
});
