import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chunksToSpeech } from '../../scripts/api/tts.js';
import { cancelProcessing, getProcessingRunId, getProcessingState, getScopedUpdateState, isCancelled, resetState, startProcessing, updateState } from '../../scripts/state/processing.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (fn) => fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: (key) => key }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en', checkCancellation: async (_context, runId) => { if (isCancelled(runId)) throw new Error('Cancelled'); } }));
vi.mock('../../scripts/generation/audio-prep.js', () => ({ AUDIO_CONFIG: { DEFAULT_VOICE: 'nova', DEFAULT_SPEED: 1, VOICES: ['nova'], MIN_SPEED: 0.25, MAX_SPEED: 4, TTS_MAX_INPUT: 4096 } }));
vi.mock('../../scripts/api/elevenlabs.js', () => ({ textToSpeech: vi.fn(), ELEVENLABS_CONFIG: {} }));
vi.mock('../../scripts/api/qwen.js', () => ({ textToSpeech: vi.fn(), QWEN_CONFIG: {} }));
vi.mock('../../scripts/api/respeecher.js', () => ({ textToSpeech: vi.fn(), RESPEECHER_CONFIG: {} }));
vi.mock('../../scripts/api/google-tts.js', () => ({ textToSpeech: vi.fn(), GOOGLE_TTS_CONFIG: {} }));
vi.mock('../../scripts/api/offline-tts-offscreen.js', () => ({ textToSpeech: vi.fn(), OFFLINE_TTS_CONFIG: {} }));

beforeEach(async () => {
  vi.useFakeTimers();
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.storage.local.remove.mockReset().mockResolvedValue(undefined);
  await resetState();
  await startProcessing(vi.fn());
});
afterEach(async () => {
  await resetState();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const chunks = [{ text: 'First.', index: 0 }, { text: 'Middle.', index: 1 }, { text: 'Last.', index: 2 }];

describe('TTS output integrity and ownership', () => {
  it('preserves every successful chunk in order', async () => {
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([++count]))));
    const output = await chunksToSpeech(chunks, 'synthetic-key', { provider: 'openai', processingRunId: getProcessingRunId() });
    expect([...new Uint8Array(output)]).toEqual([1, 2, 3]);
  });

  it('rejects an incomplete file when the middle chunk fails', async () => {
    let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      count++;
      return count === 2
        ? new Response(JSON.stringify({ error: { message: 'Example failure' } }), { status: 400 })
        : new Response(new Uint8Array([count]));
    }));
    await expect(chunksToSpeech(chunks, 'synthetic-key', { provider: 'openai', processingRunId: getProcessingRunId() })).rejects.toThrow('1 of 3 chunks');
  });

  it('stops after a late response and preserves a replacement operation', async () => {
    let releaseResponse;
    const fetch = vi.fn(() => new Promise((resolve) => { releaseResponse = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const oldRunId = getProcessingRunId();
    const conversion = chunksToSpeech(chunks, 'synthetic-key', { provider: 'openai', processingRunId: oldRunId }, getScopedUpdateState(oldRunId));
    const failure = conversion.catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await cancelProcessing(vi.fn());
    await startProcessing(vi.fn());
    updateState({ progress: 37, outputFormat: 'markdown' });
    await vi.advanceTimersByTimeAsync(2100);
    expect(getProcessingState()).toMatchObject({ progress: 37, outputFormat: 'markdown' });
    releaseResponse(new Response(new Uint8Array([1])));
    expect(await failure).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getProcessingState()).toMatchObject({ isProcessing: true, progress: 37, outputFormat: 'markdown' });
  });
});
