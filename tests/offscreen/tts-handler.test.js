import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/offscreen/tts/voice-selection.js', () => ({
  normalizeLanguageCode: language => language,
  getBaseLangCode: language => language,
  selectVoice: async ({ requestedVoice }) => ({ voiceId: requestedVoice || 'en_US-lessac-medium' })
}));
vi.mock('../../scripts/offscreen/tts/voice-download.js', () => ({ ensureVoiceDownloaded: async ({ voiceId }) => voiceId }));
vi.mock('../../scripts/offscreen/tts/voice-switching.js', () => ({ handleVoiceSwitching: async ({ tts }) => ({ tts }) }));
vi.mock('../../scripts/offscreen/tts/synthesis.js', () => ({ synthesizeText: vi.fn(async () => new Blob(['audio'])) }));
vi.mock('../../scripts/offscreen/tts/response.js', () => ({ sendTTSResponse: async ({ sendResponse }) => sendResponse({ success: true }) }));

import { handlePiperTTS } from '../../scripts/offscreen/tts/handler.js';
import { synthesizeText } from '../../scripts/offscreen/tts/synthesis.js';

describe('Piper request initialization', () => {
  it('initializes the worker and module on the first synthesis request', async () => {
    let worker = null;
    const module = {};
    const initTTSWorker = vi.fn(async () => { worker = {}; return worker; });
    const initPiperTTS = vi.fn(async () => module);
    const sendResponse = vi.fn();
    await handlePiperTTS('request', { text: 'A short sentence.', processingRunId: 'current' }, sendResponse, {
      initTTSWorker, initPiperTTS,
      state: {
        shouldUseWorker: () => true, hasTTSWorker: () => !!worker,
        getTTSWorker: () => worker, setUseWorker: vi.fn(), getTTSModule: () => null,
        getProcessingRunId: () => 'current'
      }
    });
    expect(initTTSWorker).toHaveBeenCalledOnce();
    expect(initPiperTTS).toHaveBeenCalledOnce();
    expect(synthesizeText).toHaveBeenCalledWith(expect.objectContaining({ processingRunId: 'current' }));
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('does not synthesize a different voice before processing a long article', async () => {
    const predictWithWorker = vi.fn(async () => new Blob(['probe']));
    const sendResponse = vi.fn();
    await handlePiperTTS('long-request', {
      text: 'A sensor records another observation. '.repeat(160),
      options: { voice: 'en_US-ljspeech-medium', language: 'en' }
    }, sendResponse, {
      initTTSWorker: vi.fn(), initPiperTTS: vi.fn(async () => ({})), predictWithWorker,
      state: { shouldUseWorker: () => true, hasTTSWorker: () => true,
        getTTSWorker: () => ({}), getTTSModule: () => ({}) }
    });
    expect(predictWithWorker).not.toHaveBeenCalled();
    expect(synthesizeText).toHaveBeenCalledWith(expect.objectContaining({ voiceId: 'en_US-ljspeech-medium' }));
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
