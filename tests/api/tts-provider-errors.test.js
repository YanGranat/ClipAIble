import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVoices as elevenLabsVoices, textToSpeech as elevenlabs } from '../../scripts/api/elevenlabs.js';
import { textToSpeech as qwen } from '../../scripts/api/qwen.js';
import { getVoicesFromAPI as respeecherVoices, textToSpeech as respeecher } from '../../scripts/api/respeecher.js';
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
    ['network', () => new TypeError('Private transport diagnostics')],
    ['timeout', () => new DOMException('Request aborted', 'AbortError')]
  ])('rejects with an Error after %s failure', async (_kind, createError) => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(createError()));
    const error = await convert('Example text.', 'synthetic-key', { language: 'en', qwenWorkspaceId: 'sample-workspace' }).catch((failure) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(name);
    expect(error).not.toBeInstanceOf(Promise);
    expect(error.stack).not.toContain('Private transport diagnostics');
    expect(JSON.stringify(logError.mock.calls)).not.toContain('Private transport diagnostics');
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

describe('speech provider error boundaries', () => {
  const echoed = 'Sample private narration and credential echoed by the service';

  it.each([
    ['ElevenLabs legacy quota', elevenlabs, 401, { detail: { status: 'quota_exceeded', message: echoed } }, 'errorApiQuotaExceeded', false],
    ['ElevenLabs credits', elevenlabs, 402, { detail: { code: 'insufficient_credits', message: echoed } }, 'errorApiQuotaExceeded', false],
    ['ElevenLabs concurrency', elevenlabs, 429, { detail: { code: 'concurrent_limit_exceeded', message: echoed } }, 'errorRateLimit', true],
    ['ElevenLabs authentication', elevenlabs, 401, { detail: { status: 'invalid_api_key', message: echoed } }, 'errorApiKeyInvalid', false],
    ['Qwen application error', qwen, 200, { code: 'InvalidParameter', message: echoed, output: { text: echoed } }, 'errorAudioGenerationFailed', false],
    ['Qwen budget', qwen, 403, { code: 'BudgetLimitExceeded', message: echoed }, 'errorApiQuotaExceeded', false],
    ['Qwen billing error in an HTTP success', qwen, 200, { code: 'Arrearage', message: echoed }, 'errorApiQuotaExceeded', false],
    ['Qwen transient capacity', qwen, 429, { code: 'insufficient_quota', message: echoed }, 'errorRateLimit', true],
    ['Respeecher balance', respeecher, 402, { error: { message: echoed } }, 'errorApiQuotaExceeded', false]
  ])('retains the error meaning and protects private response content for %s', async (_label, convert, status, payload, key, retryable) => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
      status, headers: { 'retry-after': '4', 'x-vendor-trace': echoed }
    })));

    const error = await convert(echoed, 'synthetic-key', { language: 'en', qwenWorkspaceId: 'sample-workspace' }).catch(failure => failure);

    expect(error).toMatchObject({ status, translationKey: key, retryable });
    expect(error.response.body).toBeNull();
    expect(error.response.headers.get('retry-after')).toBe('4');
    expect(error.response.headers.get('x-vendor-trace')).toBeNull();
    expect(error.stack).not.toContain(echoed);
    expect(JSON.stringify(error)).not.toContain(echoed);
    for (const logger of [log, logError, logWarn, logDebug]) {
      expect(JSON.stringify(logger.mock.calls)).not.toContain(echoed);
    }
  });

  it('uses the standard ElevenLabs voice list when parsing fails without logging the response', async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(echoed)));
    const voices = await elevenLabsVoices('synthetic-key');
    expect(voices.length).toBeGreaterThan(0);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(echoed);
  });

  it('does not expose Respeecher voice response bodies', async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(echoed, { status: 403 })));
    const error = await respeecherVoices('synthetic-key').catch(failure => failure);
    expect(error).toMatchObject({ status: 403, translationKey: 'errorApiAccessForbidden' });
    expect(error.stack).not.toContain(echoed);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(echoed);
  });

  it('excludes a rejected audio URL from Qwen errors and logs', async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: { audio: { url: echoed } } }))));
    const error = await qwen('Article.', 'synthetic-key', { qwenWorkspaceId: 'sample-workspace' }).catch(failure => failure);
    expect(error).toMatchObject({ translationKey: 'errorTtsInvalidAudio' });
    expect(error.stack).not.toContain(echoed);
    expect(fetch).toHaveBeenCalledOnce();
    for (const logger of [log, logError, logWarn, logDebug]) {
      expect(JSON.stringify(logger.mock.calls)).not.toContain(echoed);
    }
  });

  it('preserves the complete Qwen audio URL for a valid provider download', async () => {
    const url = 'https://example.com/audio.wav?authorization=synthetic-signature';
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({ output: { audio: { url } } })))
      .mockImplementationOnce(async () => new Response(new Uint8Array([1, 2]))));
    const result = await qwen('Article.', 'synthetic-key', { qwenWorkspaceId: 'sample-workspace' });
    expect([...new Uint8Array(result)]).toEqual([1, 2]);
    expect(fetch.mock.calls[1][0]).toBe(url);
  });
});
