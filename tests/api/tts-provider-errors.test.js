import { afterEach, describe, expect, it, vi } from 'vitest';
import { textToSpeech as elevenlabs } from '../../scripts/api/elevenlabs.js';
import { textToSpeech as qwen } from '../../scripts/api/qwen.js';
import { textToSpeech as respeecher } from '../../scripts/api/respeecher.js';
import { textToSpeech as google } from '../../scripts/api/google-tts.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (fn) => fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ checkCancellation: async () => {} }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: (key) => `${key}: {provider} {error}` }));

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['ElevenLabs', elevenlabs], ['Qwen TTS', qwen], ['Respeecher', respeecher], ['Google Gemini TTS', google]
])('%s error responses', (name, convert) => {
  it.each([
    ['network', () => new TypeError('Network unavailable')],
    ['timeout', () => new DOMException('Request aborted', 'AbortError')]
  ])('rejects with an Error after %s failure', async (_kind, createError) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(createError()));
    const error = await convert('Example text.', 'synthetic-key', { language: 'en', qwenWorkspaceId: 'sample-workspace' }).catch((failure) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(name);
    expect(error).not.toBeInstanceOf(Promise);
  });
});
