import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initOrchestration } from '../../scripts/background/orchestration.js';
import { handleProcessArticle } from '../../scripts/message-handlers/processing.js';
import { validateAndInitializeProcessing, handleStandardArticleProcessing } from '../../scripts/utils/processing/processing-helpers.js';
import { checkCancellation, updateProgress, getUILanguageCached, handleTranslation, handleAbstractGeneration, detectEffectiveLanguage } from '../../scripts/utils/processing/pipeline-helpers.js';
import { processWithoutAI, processWithSelectorMode, processWithExtractMode } from '../../scripts/processing/modes.js';
import { getProcessingState, getProcessingRunId, startProcessing, resetState, cancelProcessing, setError, updateState, ERROR_CODES, PROCESSING_STAGES } from '../../scripts/state/processing.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { tSync } from '../../scripts/locales.js';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';

vi.mock('../../scripts/processing/modes.js', () => ({ processWithoutAI: vi.fn(), processWithSelectorMode: vi.fn(), processWithExtractMode: vi.fn() }));
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
