import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearUILanguageCache, getUILanguageCached, handleProcessingError, updateProgress } from '../../scripts/utils/processing/pipeline-helpers.js';
import { getProcessingRunId, getProcessingState, resetState, startProcessing, updateState, PROCESSING_STAGES } from '../../scripts/state/processing.js';
import { handleError, createErrorHandler, withErrorHandling } from '../../scripts/utils/error-handler.js';
import { prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { tSync } from '../../scripts/locales.js';

const storageChanges = vi.hoisted(() => {
  const listeners = [];
  chrome.storage.onChanged = { addListener: listener => listeners.push(listener) };
  return listeners;
});
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));

beforeEach(async () => {
  vi.useFakeTimers();
  chrome.storage.local.get.mockReset().mockResolvedValue({ ui_language: 'en' });
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.storage.local.remove.mockReset().mockResolvedValue(undefined);
  clearUILanguageCache();
  await resetState();
});
afterEach(async () => { await resetState(); vi.clearAllTimers(); vi.useRealTimers(); });

it('invalidates the language cache only for a local language change', async () => {
  expect(await getUILanguageCached()).toBe('en');
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'de' });
  for (const listener of storageChanges) listener({ unrelated: { newValue: true } }, 'local');
  expect(await getUILanguageCached()).toBe('en');
  for (const listener of storageChanges) listener({ ui_language: { newValue: 'de' } }, 'sync');
  expect(await getUILanguageCached()).toBe('en');
  for (const listener of storageChanges) listener({ ui_language: { newValue: 'de' } }, 'local');
  expect(await getUILanguageCached()).toBe('de');
});

it('discards a pending cache read from before a language change', async () => {
  let finishOldRead;
  chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve; }))
    .mockResolvedValue({ ui_language: 'fr' });
  const oldRead = getUILanguageCached();
  for (const listener of storageChanges) listener({ ui_language: { newValue: 'fr' } }, 'local');
  finishOldRead({ ui_language: 'en' });
  expect(await oldRead).toBe('fr');
  expect(await getUILanguageCached()).toBe('fr');
});

it('carries status parameters and clears the descriptor when raw status replaces it', async () => {
  await startProcessing(vi.fn());
  const runId = getProcessingRunId();
  await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingAudioChunks', 72, { params: { current: 2, total: 7 }, processingRunId: runId });
  expect(getProcessingState()).toMatchObject({ statusTranslationKey: 'statusGeneratingAudioChunks', statusTranslationParams: { current: 2, total: 7 } });
  updateState({ status: 'Provider status', progress: 75 }, runId);
  expect(getProcessingState()).toMatchObject({ status: 'Provider status', statusTranslationKey: null, statusTranslationParams: null });
});

it('preserves a typed error through normalization and promise wrappers', async () => {
  const error = Object.assign(new Error('A saved voice is unavailable.'), {
    translationKey: 'errorOpenaiVoiceUnavailable', translationParams: { voice: 'nova' }
  });
  const normalized = await handleError(error, { logError: false });
  expect(normalized).toMatchObject({ translationKey: error.translationKey, translationParams: error.translationParams });
  expect(await createErrorHandler({ logError: false })(error)).toMatchObject({ translationKey: error.translationKey, translationParams: error.translationParams });
  await expect(withErrorHandling(async () => { throw error; }, { logError: false })()).rejects.toMatchObject({ translationKey: error.translationKey, translationParams: error.translationParams });
});

it('keeps the error descriptor through the processing boundary and serialized state', async () => {
  await startProcessing(vi.fn());
  const runId = getProcessingRunId();
  const error = Object.assign(new Error('A saved voice is unavailable.'), {
    translationKey: 'errorOpenaiVoiceUnavailable', translationParams: { voice: 'nova' }
  });
  await handleProcessingError(error, { processingRunId: runId, outputFormat: 'audio' }, vi.fn());
  const state = JSON.parse(JSON.stringify(getProcessingState()));
  expect(state).toMatchObject({ isProcessing: false, errorTranslationKey: 'errorOpenaiVoiceUnavailable', errorTranslationParams: { voice: 'nova' }, statusTranslationKey: 'statusError' });
  const saved = chrome.storage.local.set.mock.calls.map(([value]) => value.processingState).filter(Boolean).at(-1);
  expect(saved).toMatchObject({ errorTranslationKey: 'errorOpenaiVoiceUnavailable', errorTranslationParams: { voice: 'nova' } });
});

it('reports missing narration text even when the source contained an image', async () => {
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'de' });
  await startProcessing(vi.fn());
  const document = [{ type: 'image', src: 'https://example.test/figure.png' }];
  await expect(prepareContentForAudio(document, '', '', '', 'de', vi.fn(), 'offline', getProcessingRunId()))
    .rejects.toMatchObject({ translationKey: 'errorNoContentToConvert', message: tSync('errorNoContentToConvert', 'de') });
});

it('keeps a narration splitting error separate from page extraction', async () => {
  const localized = await handleError(new Error('Unable to split narration'), { errorType: 'splitError', createUserMessage: true, logError: false });
  expect(localized).toMatchObject({ translationKey: 'errorFailedToPrepareContent', userMessage: tSync('errorFailedToPrepareContent', 'en') });
});
