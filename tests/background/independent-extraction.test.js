import { beforeEach, expect, it, vi } from 'vitest';
import { handleExtractContentOnly } from '../../scripts/message-handlers/complex.js';
import { generateSummary, generateKeyTheses } from '../../scripts/translation/index.js';
import { processPdfPageWithAI } from '../../scripts/processing/pdf.js';
import { setError } from '../../scripts/state/processing.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async error => error }));
vi.mock('../../scripts/state/processing.js', () => ({ getProcessingState: () => ({ isProcessing: true }), setError: vi.fn() }));
vi.mock('../../scripts/translation/index.js', () => ({ generateSummary: vi.fn(), generateKeyTheses: vi.fn() }));
vi.mock('../../scripts/processing/pdf.js', () => ({ processPdfPageWithAI: vi.fn(), processPdfPage: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ getProviderFromModel: () => 'openai' }));
vi.mock('../../scripts/utils/pdf.js', () => ({ detectPdfPage: url => ({ isPdf: url.endsWith('.pdf'), originalUrl: url }), getOriginalPdfUrl: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => true }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn() }));

const result = { title: 'Extracted title', content: [{ type: 'paragraph', text: 'Article content.' }] };
const data = { url: 'https://example.com/article', title: 'Article', html: '<main>Article</main>', apiKey: 'synthetic-key', provider: 'openrouter', model: 'custom-model', mode: 'selector' };
let stored;
beforeEach(() => {
  vi.clearAllMocks();
  stored = { processingState: { isProcessing: true, processingRunId: 'document-owner' } };
  chrome.storage.local.set.mockImplementation(async updates => Object.assign(stored, structuredClone(updates)));
  generateSummary.mockResolvedValue({ summary: 'Summary' });
  generateKeyTheses.mockResolvedValue({ keyTheses: 'Theses' });
});
const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };

it('shares one extraction between two explicitly requested generation kinds', async () => {
  let release;
  const extract = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const respond = vi.fn();
  handleExtractContentOnly({ data: { ...data, autoGenerateSummary: true, autoGenerateKeyTheses: true } }, {}, respond, extract, vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await flush();
  expect(extract).toHaveBeenCalledTimes(1);
  expect(stored).toMatchObject({ summary_generating: true, key_theses_generating: true });
  release(result);
  await vi.waitFor(() => expect(stored).toMatchObject({ summary_text: 'Summary', key_theses_text: 'Theses', summary_generating: false, key_theses_generating: false }));
  expect(generateSummary).toHaveBeenCalledTimes(1);
  expect(generateKeyTheses).toHaveBeenCalledTimes(1);
  expect(generateSummary.mock.calls[0][0]).toMatchObject({ provider: 'openrouter', contentItems: result.content });
  expect(respond).toHaveBeenCalledTimes(1);
  expect(stored.processingState).toEqual({ isProcessing: true, processingRunId: 'document-owner' });
});

it('starts PDF key theses only when their existing request flag is enabled', async () => {
  processPdfPageWithAI.mockResolvedValue(result);
  handleExtractContentOnly({ data: { ...data, url: 'https://example.com/document.pdf', html: '', autoGenerateKeyTheses: true } }, {}, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await vi.waitFor(() => expect(stored.key_theses_text).toBe('Theses'));
  expect(processPdfPageWithAI).toHaveBeenCalledTimes(1);
  expect(processPdfPageWithAI.mock.calls[0][0]).toMatchObject({ extractionOnly: true, provider: 'openrouter' });
  expect(generateSummary).not.toHaveBeenCalled();
});

it('returns pure extraction without starting generation', async () => {
  const respond = vi.fn();
  handleExtractContentOnly({ data }, {}, respond, vi.fn().mockResolvedValue(result), vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await flush();
  expect(respond).toHaveBeenCalledWith({ success: true, result });
  expect(generateSummary).not.toHaveBeenCalled();
  expect(generateKeyTheses).not.toHaveBeenCalled();
});

it('keeps independent extraction errors out of the current document state', async () => {
  handleExtractContentOnly({ data: { ...data, autoGenerateKeyTheses: true } }, {}, vi.fn(), vi.fn().mockRejectedValue(new Error('Extraction failed')), vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await vi.waitFor(() => expect(stored).toMatchObject({ key_theses_error: 'Extraction failed', key_theses_generating: false }));
  expect(setError).not.toHaveBeenCalled();
  expect(stored.processingState).toEqual({ isProcessing: true, processingRunId: 'document-owner' });
});
