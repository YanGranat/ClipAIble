import { afterEach, describe, expect, it, vi } from 'vitest';
import { textToSpeech as elevenlabs } from '../../scripts/api/elevenlabs.js';
import { textToSpeech as qwen } from '../../scripts/api/qwen.js';
import { textToSpeech as respeecher } from '../../scripts/api/respeecher.js';
import { textToSpeech as google } from '../../scripts/api/google-tts.js';
import { log, logError, logWarn, logDebug } from '../../scripts/utils/logging.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options) => operation({ signal: options?.signal ?? new AbortController().signal, deadline: Date.now() + 600000 }) }));
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

describe('Google Gemini speech response diagnostics', () => {
  const echoedText = 'Example source passage reproduced by the provider.';

  it.each([
    ['HTTP rejection', 400, { error: { message: echoedText, status: 'INVALID_ARGUMENT' } }, 'errorApiRequestRejected'],
    ['error in a successful HTTP response', 200, { error: { message: echoedText } }, 'errorAudioGenerationFailed'],
    ['non-audio output', 200, { candidates: [{ content: { parts: [{ text: echoedText }] } }] }, 'errorNoAudioDataReturned'],
    ['malformed JSON', 200, echoedText, 'errorFailedToParseResponse'],
    ['invalid candidate', 200, { candidates: [{ message: echoedText }] }, 'errorFailedToParseResponse']
  ])('reports %s without exposing source text', async (_scenario, status, payload, translationKey) => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      typeof payload === 'string' ? payload : JSON.stringify(payload), { status }
    )));
    const error = await google(echoedText, 'synthetic-key').catch(failure => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error.translationKey).toBe(translationKey);
    if (status === 400) expect(error).toMatchObject({ status, providerCode: 'invalid_argument', retryable: false });
    expect(error.stack).not.toContain(echoedText);
    expect(JSON.stringify(error)).not.toContain(echoedText);
    for (const logger of [log, logError, logWarn, logDebug]) {
      expect(JSON.stringify(logger.mock.calls)).not.toContain(echoedText);
    }
  });
});
