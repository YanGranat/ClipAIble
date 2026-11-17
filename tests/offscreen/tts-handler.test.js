import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/offscreen/tts/voice-selection.js', () => ({
  normalizeLanguageCode: language => language,
  getBaseLangCode: language => language,
  selectVoice: async () => ({ voiceId: 'en_US-lessac-medium' })
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
        getTTSWorker: () => worker, setUseWorker: vi.fn(), getTTSModule: () => null
      }
    });
    expect(initTTSWorker).toHaveBeenCalledOnce();
    expect(initPiperTTS).toHaveBeenCalledOnce();
    expect(synthesizeText).toHaveBeenCalledWith(expect.objectContaining({ processingRunId: 'current' }));
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
