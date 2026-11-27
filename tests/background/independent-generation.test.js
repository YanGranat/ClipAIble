import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSummaryGeneration } from '../../scripts/message-handlers/summary.js';
import { startKeyThesesGeneration, requestCancelKeyThesesGeneration } from '../../scripts/message-handlers/key-theses.js';
import { generateSummary, generateKeyTheses } from '../../scripts/translation/index.js';
import { handleError } from '../../scripts/utils/error-handler.js';
import { createPdfSelectionCancelledError } from '../../scripts/utils/pdf-errors.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', async importOriginal => ({ ...(await importOriginal()), handleError: vi.fn(async error => error) }));
vi.mock('../../scripts/state/processing.js', () => ({ getProcessingState: () => ({ isProcessing: false }) }));
vi.mock('../../scripts/translation/index.js', () => ({ generateSummary: vi.fn(), generateKeyTheses: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => true }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn() }));
let stored;
const data = { contentItems: [{ type: 'paragraph', text: 'Article text' }], apiKey: 'synthetic-key', model: 'gpt-example', url: 'https://example.com/', language: 'en' };
beforeEach(() => {
  vi.useFakeTimers();
  stored = {};
  chrome.storage.local.get.mockReset().mockImplementation(async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in stored).map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockReset().mockImplementation(async values => { Object.assign(stored, structuredClone(values)); });
  generateSummary.mockReset(); generateKeyTheses.mockReset();
  handleError.mockReset().mockImplementation(async error => error);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('independent generation ownership', () => {
  it.each([
    ['summary', startSummaryGeneration, generateSummary, 'abstractGenerationFailed'],
    ['key_theses', startKeyThesesGeneration, generateKeyTheses, 'keyThesesGenerationFailed']
  ])('attributes an unexpected failure to the %s task', async (prefix, start, generate, errorType) => {
    const failure = new Error('No usable input.');
    generate.mockRejectedValueOnce(failure);
    await expect(start(data, vi.fn(), vi.fn())).rejects.toBe(failure);
    expect(handleError).toHaveBeenCalledWith(failure, expect.objectContaining({ errorType }));
    expect(stored[`${prefix}_generating`]).toBe(false);
  });
  it.each([['summary', startSummaryGeneration, generateSummary], ['key theses', startKeyThesesGeneration, generateKeyTheses]])('ends %s quietly after explicit PDF picker dismissal', async (_kind, start, generate) => {
    const result = await start({ ...data, getContent: async () => { throw createPdfSelectionCancelledError(); } }, vi.fn(), vi.fn());
    const prefix = _kind === 'summary' ? 'summary' : 'key_theses';
    expect(result).toEqual({ cancelled: true });
    expect(stored[`${prefix}_generating`]).toBe(false);
    expect(stored[`${prefix}_error`]).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(handleError).not.toHaveBeenCalled();
  });
  it.each([
    ['summary', startSummaryGeneration, generateSummary, { summary: 'Summary' }],
    ['key theses', startKeyThesesGeneration, generateKeyTheses, { keyTheses: 'Theses' }]
  ])('admits one %s request before the first response arrives', async (_kind, start, generate, result) => {
    const releases = [];
    generate.mockImplementation(() => new Promise(resolve => releases.push(resolve)));
    const firstResponse = vi.fn(); const secondResponse = vi.fn();
    const first = start(data, vi.fn(), vi.fn(), firstResponse);
    const second = start(data, vi.fn(), vi.fn(), secondResponse);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(generate).toHaveBeenCalledTimes(1);
      const translationKey = _kind === 'summary' ? 'summaryAlreadyGenerating' : 'keyThesesAlreadyGenerating';
      expect(secondResponse).toHaveBeenCalledWith({ error: translationKey, translationKey, translationParams: {} });
    } finally {
      releases.forEach(release => release(result));
      await Promise.allSettled([first, second]);
    }
  });

  it('captures a prompt revision before extraction and applies edits to the next generation', async () => {
    stored.prompt_override_summary = 'First instruction in {{targetLanguage}}.';
    let deliverContent;
    const readContent = () => new Promise(resolve => { deliverContent = resolve; });
    generateSummary.mockResolvedValue({ summary: 'Sample result' });
    const beforeEdit = startSummaryGeneration({ ...data, getContent: readContent }, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    stored.prompt_override_summary = 'New instruction in {{targetLanguage}}.';
    deliverContent({ contentItems: data.contentItems });
    await beforeEdit;
    expect(generateSummary.mock.calls[0][0].promptOverrides.summary).toBe('First instruction in {{targetLanguage}}.');
    await startSummaryGeneration(data, vi.fn(), vi.fn());
    expect(generateSummary.mock.calls[1][0].promptOverrides.summary).toBe('New instruction in {{targetLanguage}}.');
  });

  it('cancels extraction before starting a paid generation request', async () => {
    let releaseContent;
    const first = startKeyThesesGeneration({ ...data, getContent: () => new Promise(resolve => { releaseContent = resolve; }) }, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    requestCancelKeyThesesGeneration(stored.key_theses_generation_id);
    await first;
    releaseContent({ contentItems: data.contentItems });
    await vi.advanceTimersByTimeAsync(0);
    expect(generateKeyTheses).not.toHaveBeenCalled();
    expect(stored.key_theses_generating).toBe(false);
  });

  it('preserves a replacement job and its cancellation after the old job unwinds', async () => {
    let releaseOld;
    let releaseNew;
    generateKeyTheses.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { releaseNew = resolve; }));
    const old = startKeyThesesGeneration(data, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    const oldId = stored.key_theses_generation_id;
    requestCancelKeyThesesGeneration(oldId);
    const replacement = startKeyThesesGeneration(data, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    await old;
    expect(stored.key_theses_generation_id).not.toBe(oldId);
    expect(stored.key_theses_generating).toBe(true);
    releaseOld({ keyTheses: 'Obsolete result' });
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.key_theses_text).toBeUndefined();
    expect(requestCancelKeyThesesGeneration(oldId)).toMatchObject({ ignored: true });
    expect(requestCancelKeyThesesGeneration()).toMatchObject({ ignored: true });
    expect(stored.key_theses_generating).toBe(true);
    requestCancelKeyThesesGeneration(stored.key_theses_generation_id);
    await replacement;
    expect(stored.key_theses_generating).toBe(false);
    releaseNew({ keyTheses: 'Cancelled replacement' });
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.key_theses_text).toBeUndefined();
  });

  it('serializes an outstanding old flag write before a replacement starts', async () => {
    let releaseWrite;
    chrome.storage.local.set.mockImplementationOnce(async values => {
      await new Promise(resolve => { releaseWrite = resolve; });
      Object.assign(stored, structuredClone(values));
    });
    generateKeyTheses.mockResolvedValue({ keyTheses: 'Current result' });
    const old = startKeyThesesGeneration(data, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    requestCancelKeyThesesGeneration(chrome.storage.local.set.mock.calls[0][0].key_theses_generation_id);
    const current = startKeyThesesGeneration(data, vi.fn(), vi.fn());
    expect(generateKeyTheses).not.toHaveBeenCalled();
    releaseWrite();
    await Promise.all([old, current]);
    expect(generateKeyTheses).toHaveBeenCalledTimes(1);
    expect(stored).toMatchObject({ key_theses_text: 'Current result', key_theses_generating: false });
  });

  it('keeps the current error message and its translation identity together after an older failure resumes', async () => {
    let finishOldNormalization, failCurrent;
    const oldError = Object.assign(new Error('Old failure'), { translationKey: 'errorNetwork', translationParams: {} });
    const currentError = Object.assign(new Error('Current failure'), { translationKey: 'errorOpenaiVoiceUnavailable', translationParams: { voice: 'sample-voice' } });
    handleError.mockImplementationOnce(() => new Promise(resolve => { finishOldNormalization = resolve; }));
    generateKeyTheses.mockRejectedValueOnce(oldError).mockImplementationOnce(() => new Promise((_resolve, reject) => { failCurrent = reject; }));
    const old = startKeyThesesGeneration(data, vi.fn(), vi.fn()).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(finishOldNormalization).toEqual(expect.any(Function));
    const current = startKeyThesesGeneration(data, vi.fn(), vi.fn()).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.key_theses_error_translation).toBeNull();
    finishOldNormalization(oldError);
    await old;
    expect(stored.key_theses_error).toBeNull();
    expect(stored.key_theses_error_translation).toBeNull();
    failCurrent(currentError);
    await current;
    expect(stored).toMatchObject({ key_theses_error: 'Current failure', key_theses_error_translation: { key: 'errorOpenaiVoiceUnavailable', params: { voice: 'sample-voice' } } });
  });
});
