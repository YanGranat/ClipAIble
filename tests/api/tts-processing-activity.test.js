import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chunksToSpeech } from '../../scripts/api/tts.js';
import { textToSpeech as openaiTTS } from '../../scripts/api/openai-tts.js';
import { textToSpeech as offlineTTS } from '../../scripts/api/offline-tts-offscreen.js';
import { cancelProcessing, getProcessingRunId, getProcessingSignal, getProcessingState, getScopedUpdateState, resetState, startProcessing, updateState } from '../../scripts/state/processing.js';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: fn => fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn() }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => false }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en',
  checkCancellation: async (_context, runId) => { if (getProcessingSignal(runId).aborted) throw getProcessingSignal(runId).reason; }
}));
vi.mock('../../scripts/generation/audio-prep.js', () => ({ AUDIO_CONFIG: { DEFAULT_VOICE: 'synthetic-voice', DEFAULT_SPEED: 1, TTS_MAX_INPUT: 6000 } }));
vi.mock('../../scripts/api/openai-tts.js', () => ({ textToSpeech: vi.fn() }));
vi.mock('../../scripts/api/elevenlabs.js', () => ({ textToSpeech: vi.fn(), ELEVENLABS_CONFIG: {} }));
vi.mock('../../scripts/api/qwen.js', () => ({ textToSpeech: vi.fn(), QWEN_CONFIG: {} }));
vi.mock('../../scripts/api/respeecher.js', () => ({ textToSpeech: vi.fn(), RESPEECHER_CONFIG: {} }));
vi.mock('../../scripts/api/google-tts.js', () => ({ textToSpeech: vi.fn(), GOOGLE_TTS_CONFIG: {} }));
vi.mock('../../scripts/api/offline-tts-offscreen.js', () => ({ textToSpeech: vi.fn(), OFFLINE_TTS_CONFIG: { MAX_INPUT: 6000, DEFAULT_SPEED: 1 } }));

const chunks = [{ text: 'First observation.', index: 0 }, { text: 'Second observation.', index: 1 }, { text: 'Final observation.', index: 2 }];
const buffer = () => new Uint8Array([1]).buffer;
let responses, outcomes;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2031-04-08T00:00:00Z'));
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.storage.local.remove.mockReset().mockResolvedValue(undefined);
  await resetState();
  await startProcessing(vi.fn());
  updateState({ stage: 'generating', progress: 94, outputFormat: 'audio' }, getProcessingRunId());
  responses = [];
  outcomes = [];
  const pending = () => new Promise(resolve => { responses.push(resolve); });
  openaiTTS.mockReset().mockImplementation(pending);
  offlineTTS.mockReset().mockImplementation(pending);
});
afterEach(async () => {
  await resetState();
  for (const resolve of responses.splice(0)) resolve(buffer());
  await vi.advanceTimersByTimeAsync(0);
  await Promise.all(outcomes);
  vi.clearAllTimers();
  vi.useRealTimers();
});

function begin(options, selected = chunks) {
  const promise = chunksToSpeech(selected, 'synthetic-key', options, getScopedUpdateState(getProcessingRunId()));
  const outcome = promise.then(value => ({ value }), error => ({ error }));
  outcomes.push(outcome);
  return outcome;
}

describe('Owned TTS processing activity', () => {
  it.each(['openai', 'offline'])('refreshes the existing deadline at %s request admission while displayed progress stays at 94', async provider => {
    const initial = getProcessingState().inactivityDeadlineAt;
    await vi.advanceTimersByTimeAsync(1000);
    begin({ provider, processingRunId: getProcessingRunId() });
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState()).toMatchObject({ progress: 94, inactivityDeadlineAt: initial + 1000, isProcessing: true });
    expect(provider === 'openai' ? openaiTTS : offlineTTS).toHaveBeenCalledOnce();
  });

  it('keeps a long conversion alive through actual completed chunks without increasing the progress percentage', async () => {
    const run = getProcessingRunId();
    const outcome = begin({ provider: 'offline', processingRunId: run });
    await vi.advanceTimersByTimeAsync(0);
    const initial = getProcessingState().inactivityDeadlineAt;
    const half = CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS / 2;
    await vi.advanceTimersByTimeAsync(half);
    expect(getProcessingState().inactivityDeadlineAt).toBe(initial);
    responses.shift()(buffer());
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState()).toMatchObject({ progress: 94, inactivityDeadlineAt: initial + half });
    await vi.advanceTimersByTimeAsync(half + 1);
    expect(getProcessingState().isProcessing).toBe(true);
    expect(getProcessingSignal(run).aborted).toBe(false);
    responses.shift()(buffer());
    await vi.advanceTimersByTimeAsync(0);
    responses.shift()(buffer());
    expect((await outcome).value.byteLength).toBe(3);
  });

  it('records the final completed chunk even without a UI progress callback', async () => {
    const run = getProcessingRunId();
    const promise = chunksToSpeech([chunks[0]], 'synthetic-key', { provider: 'offline', processingRunId: run });
    const outcome = promise.then(value => ({ value }), error => ({ error }));
    outcomes.push(outcome);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    responses.shift()(buffer());
    expect((await outcome).value.byteLength).toBe(1);
    expect(getProcessingState()).toMatchObject({ progress: 94, inactivityDeadlineAt: Date.now() + CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS });
  });

  it('still expires a stalled request after the unchanged inactivity limit despite periodic UI status updates', async () => {
    expect(CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS).toBe(10 * 60 * 1000);
    const run = getProcessingRunId();
    const outcome = begin({ provider: 'offline', processingRunId: run });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS + 1);
    expect(getProcessingState()).toMatchObject({ isProcessing: false, errorTranslationKey: 'errorTimeout', inactivityDeadlineAt: null });
    expect(getProcessingSignal(run).aborted).toBe(true);
    expect(offlineTTS).toHaveBeenCalledOnce();
    responses.shift()(buffer());
    expect((await outcome).error.name).toBe('TimeoutError');
    expect(getProcessingState().inactivityDeadlineAt).toBeNull();
  });

  it('does not refresh a replacement operation after an obsolete chunk finishes', async () => {
    const oldRun = getProcessingRunId();
    const outcome = begin({ provider: 'offline', processingRunId: oldRun });
    await vi.advanceTimersByTimeAsync(0);
    await cancelProcessing(vi.fn());
    await startProcessing(vi.fn());
    const current = getProcessingRunId();
    updateState({ stage: 'generating', progress: 94, outputFormat: 'audio' }, current);
    const deadline = getProcessingState().inactivityDeadlineAt;
    await vi.advanceTimersByTimeAsync(1000);
    responses.shift()(buffer());
    expect((await outcome).error).toBeInstanceOf(Error);
    expect(getProcessingState()).toMatchObject({ processingRunId: current, inactivityDeadlineAt: deadline, isProcessing: true, progress: 94 });
    expect(offlineTTS).toHaveBeenCalledOnce();
  });

  it('does not attribute an unscoped direct conversion to the active document owner', async () => {
    const deadline = getProcessingState().inactivityDeadlineAt;
    await vi.advanceTimersByTimeAsync(1000);
    const outcome = begin({ provider: 'openai' }, [chunks[0]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(getProcessingState().inactivityDeadlineAt).toBe(deadline);
    responses.shift()(buffer());
    expect((await outcome).value.byteLength).toBe(1);
  });
});
