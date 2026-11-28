import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { textToSpeech } from '../../scripts/api/openrouter-tts.js';
import { chunksToSpeech } from '../../scripts/api/tts.js';
import { DEFAULT_OPENROUTER_TTS_MODEL, OPENROUTER_TTS_MODELS, getOpenRouterTtsModel,
  resolveOpenRouterTtsSelection } from '../../scripts/api/tts-catalog.js';
import { pcmToWav } from '../../scripts/api/audio-format.js';
import { readWav } from '../../scripts/utils/wav.js';
import { CONFIG } from '../../scripts/utils/config.js';

const { checkCancelled } = vi.hoisted(() => ({ checkCancelled: vi.fn(async () => {}) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async original => ({ ...await original(),
  getUILanguageCached: async () => 'en', checkCancellation: (...args) => checkCancelled(...args) }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));

const key = 'synthetic-router-key';
const wav = () => pcmToWav(new Uint8Array([1, 0, 2, 0]).buffer, 24000);
beforeEach(() => {
  vi.clearAllMocks();
  checkCancelled.mockResolvedValue(undefined);
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(wav(), { headers: { 'Content-Type': 'audio/wav' } })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const pcmModels = [
  ['elevenlabs/eleven-v4', 'george', 10000],
  ['microsoft/mai-voice-2.1', 'en-US-Harper:MAI-Voice-2.1', 6000],
  ['x-ai/grok-voice-tts-1.0', 'eve', 15000],
  ['mistralai/voxtral-mini-tts-3-0', 'voice_3150', 4000]
];
const pcm = (...samples) => new Response(new Uint8Array(samples), {
  headers: { 'Content-Type': 'audio/pcm; rate=24000; channels=1' }
});

it('keeps both Gemini models and their voice IDs alongside the new models', () => {
  const geminiIds = ['google/gemini-3.8-flash-tts', 'google/gemini-3.8-flash-lite-tts'];
  expect(OPENROUTER_TTS_MODELS.map(model => model.id)).toEqual([...geminiIds, ...pcmModels.map(([id]) => id)]);
  for (const id of geminiIds) {
    const voices = getOpenRouterTtsModel(id).voices.map(v => v.id);
    expect(voices).toHaveLength(30);
    expect(voices).toContain('Callirrhoe');
    expect(voices).toContain('Zubenelgenubi');
  }
  expect(resolveOpenRouterTtsSelection(undefined, undefined)).toEqual({ model: DEFAULT_OPENROUTER_TTS_MODEL, voice: 'Callirrhoe' });
  expect(resolveOpenRouterTtsSelection(undefined, ' kore ')).toEqual({ model: DEFAULT_OPENROUTER_TTS_MODEL, voice: 'Kore' });
});

it.each(pcmModels)('requests %s with its own default voice and wraps PCM without changing samples', async (model, voice, limit) => {
  fetch.mockImplementationOnce(async () => pcm(1, 0, 3, 128)).mockImplementationOnce(async () => pcm(2, 0));
  const input = 'x'.repeat(limit + 3);
  const audio = await chunksToSpeech([{ text: input, index: 0 }], key, { provider: 'openrouter', openrouterTtsModel: model });
  expect(fetch).toHaveBeenCalledTimes(2);
  const requests = fetch.mock.calls.map(([, request]) => {
    expect(request.headers.Accept).toBe('audio/pcm');
    return JSON.parse(request.body);
  });
  expect(requests).toEqual([input.slice(0, limit), input.slice(limit)].map(input => ({
    model, input, voice, response_format: 'pcm'
  })));
  expect(readWav(audio).format).toMatchObject({ bits: 16, sampleRate: 24000, channels: 1 });
  expect([...readWav(audio).data]).toEqual([1, 0, 3, 128, 2, 0]);
});

it.each([
  ['google/gemini-3.8-flash-tts', 'Kore', { instructions: 'Read slowly.' }],
  ['google/gemini-3.8-flash-lite-tts', 'Puck', { instructions: 'Read slowly.' }],
  ['elevenlabs/eleven-v4', 'sarah', { provider: { options: { elevenlabs: { voice_settings: { stability: 0, similarity_boost: 0.85 } } } } }],
  ['microsoft/mai-voice-2.1', 'en-US-Harper:MAI-Voice-2.1', { speed: 1.4, provider: { options: { azure: { style: 'whispering' } } } }],
  ['microsoft/mai-voice-2.1', 'en-US-Iris:MAI-Voice-2.1', { speed: 1.4 }],
  ['x-ai/grok-voice-tts-1.0', 'eve', { speed: 1.4 }],
  ['mistralai/voxtral-mini-tts-3-0', 'en_paul_neutral', {}]
])('sends only supported options for %s with %s', async (model, voice, fields) => {
  const { responseFormat } = getOpenRouterTtsModel(model);
  if (responseFormat === 'pcm') fetch.mockResolvedValueOnce(pcm(1, 0, 2, 0));
  await textToSpeech('The room is open.', key, { openrouterTtsModel: model, openrouterTtsVoice: voice,
    openrouterTtsOptions: { instructions: '  Read slowly.  ', style: 'whispering', speed: 1.4, stability: 0, similarity: 0.85 } });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    model, input: 'The room is open.', voice, response_format: responseFormat, ...fields
  });
});

it('includes the compatibility presets and current native catalog for Voxtral TTS 3', () => {
  const voices = getOpenRouterTtsModel('mistralai/voxtral-mini-tts-3-0').voices;
  expect(new Set(voices.map(voice => voice.id)).size).toBe(66);
  expect(voices).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'voice_3132' }), expect.objectContaining({ id: 'voice_3140' }),
    expect.objectContaining({ id: 'en_paul_neutral' }), expect.objectContaining({ id: 'fr_marie_excited' })
  ]));
});

it.each([
  ['application/json', new TextEncoder().encode('{}')],
  ['audio/pcm;rate=16000;channels=1', new Uint8Array([2, 0])],
  ['audio/pcm;rate=24000;channels=2', new Uint8Array([2, 0, 3, 0])],
  ['audio/pcm', new Uint8Array([2, 0])],
  ['audio/pcm;rate=24000;channels=1', new Uint8Array([2])],
  ['audio/pcm;rate=24000;channels=1', new Uint8Array()]
])('rejects incorrect or empty PCM payloads (%#)', async (type, bytes) => {
  fetch.mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': type } }));
  await expect(textToSpeech('Article.', key, { openrouterTtsModel: 'x-ai/grok-voice-tts-1.0' }))
    .rejects.toMatchObject({ translationKey: 'errorTtsInvalidAudio', retryable: false });
  expect(fetch).toHaveBeenCalledOnce();
});

it('keeps hard cuts on Unicode character boundaries', async () => {
  fetch.mockImplementation(async () => pcm(1, 0));
  const input = 'x'.repeat(3999) + '🙌' + 'y'.repeat(5);
  await chunksToSpeech([{ text: input, index: 0 }], key, { provider: 'openrouter', openrouterTtsModel: 'mistralai/voxtral-mini-tts-3-0' });
  const parts = fetch.mock.calls.map(([, request]) => JSON.parse(request.body).input);
  expect(parts).toEqual(['x'.repeat(3999), '🙌' + 'y'.repeat(5)]);
});

it('preserves the sign in Russian MAI without changing values, ranges or other speech models', async () => {
  const input = 'Температура −2,5 °C. Отклонение: -0,05%. Диапазон 2−5; версия 2.3.4.';
  fetch.mockResolvedValueOnce(pcm(1, 0)).mockResolvedValueOnce(pcm(1, 0));
  await textToSpeech(input, key, { openrouterTtsModel: 'microsoft/mai-voice-2.1', openrouterTtsVoice: 'ru-RU-Masha:MAI-Voice-2.1' });
  await textToSpeech(input, key, { openrouterTtsModel: 'microsoft/mai-voice-2.1' });
  await textToSpeech(input, key, { openrouterTtsModel: 'google/gemini-3.8-flash-tts' });
  expect(fetch.mock.calls.map(([, request]) => JSON.parse(request.body).input)).toEqual([
    'Температура минус\u00a02,5 °C. Отклонение: минус\u00a00,05%. Диапазон 2−5; версия 2.3.4.', input, input
  ]);
});

it('splits Russian MAI input after adding spoken signs and stays within its request limit', async () => {
  const text = 'Показание: −0,05%. '.repeat(306).trim();
  expect(text.length).toBeLessThan(6000);
  fetch.mockImplementation(async () => pcm(1, 0));
  await chunksToSpeech([{ text, index: 0 }], key, { provider: 'openrouter', openrouterTtsModel: 'microsoft/mai-voice-2.1', openrouterTtsVoice: 'ru-RU-Masha:MAI-Voice-2.1' });
  const inputs = fetch.mock.calls.map(([, request]) => JSON.parse(request.body).input);
  expect(inputs).toHaveLength(2);
  expect(inputs.every(input => input.length <= 6000)).toBe(true);
  expect(inputs.join(' ')).toBe(text.replaceAll('−', 'минус\u00a0'));
});

it('uses the dedicated binary speech endpoint and the independent model and voice', async () => {
  const result = await textToSpeech('An independent observation.', key, {
    openrouterTtsModel: 'google/gemini-3.8-flash-lite-tts', openrouterTtsVoice: 'Kore',
    googleTtsModel: 'gemini-3.8-flash-tts', googleTtsVoice: 'Puck', voice: 'Leda',
    speed: 1.5, format: 'mp3', openaiInstructions: 'A separate setting.'
  });
  expect(result).toEqual(wav());
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
  expect(request.method).toBe('POST');
  expect(request.headers).toMatchObject({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
  expect(JSON.parse(request.body)).toEqual({ model: 'google/gemini-3.8-flash-lite-tts',
    input: 'An independent observation.', voice: 'Kore', response_format: 'wav' });
});

it.each([
  ['', key, {}, 'errorTtsNoText'],
  [' ', key, {}, 'errorTtsNoText'],
  ['Article.', '', {}, 'errorTtsNoApiKey'],
  ['Article.', '****masked', {}, 'errorApiKeyInvalid'],
  ['Article.', 'ENC:v2:example', {}, 'errorApiKeyInvalid'],
  ['Article.', key, { openrouterTtsModel: 'example/text-only' }, 'errorModelNotFound'],
  ['Article.', key, { openrouterTtsVoice: 'unknown-narrator' }, 'selectNarratorVoice'],
  ['x'.repeat(24001), key, {}, 'errorTtsTextTooLong'],
  ['x'.repeat(4001), key, { openrouterTtsModel: 'mistralai/voxtral-mini-tts-3-0' }, 'errorTtsTextTooLong'],
  ['Article.', key, { openrouterTtsModel: 'mistralai/voxtral-mini-tts-3-0', openrouterTtsVoice: 'Eve' }, 'selectNarratorVoice']
])('rejects an unusable speech selection before fetching (%#)', async (text, apiKey, options, translationKey) => {
  await expect(textToSpeech(text, apiKey, options)).rejects.toMatchObject({ translationKey });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([new ArrayBuffer(0), new Uint8Array([1, 0, 2, 0]).buffer,
  new TextEncoder().encode('{"url":"https://example.test/audio"}').buffer,
  wav().slice(0, 45)])('rejects missing, raw, JSON or truncated audio instead of labeling it WAV', async bytes => {
  fetch.mockResolvedValue(new Response(bytes));
  await expect(textToSpeech('Article.', key)).rejects.toMatchObject({ translationKey: 'errorTtsInvalidAudio', retryable: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([[401, 'errorApiKeyInvalid'], [403, 'errorApiAccessForbidden'], [402, 'errorApiQuotaExceeded'], [404, 'errorApiError']])(
  'preserves the localized HTTP %s failure without retrying or exposing a response message', async (status, translationKey) => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Untrusted diagnostic content.' } }), { status }));
    const error = await textToSpeech('Article.', key).catch(error => error);
    expect(error).toMatchObject({ status, translationKey, retryable: false });
    expect(error.message).not.toContain('Untrusted diagnostic content');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

it('retries a temporary provider failure with the same speech request', async () => {
  vi.useFakeTimers();
  fetch.mockResolvedValueOnce(new Response('{}', { status: 503 }));
  const result = textToSpeech('Article.', key);
  await vi.advanceTimersByTimeAsync(CONFIG.RETRY_DELAYS[0] * 2 + 1);
  expect(await result).toEqual(wav());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  expect(vi.getTimerCount()).toBe(0);
});

it('localizes an exhausted network failure and releases the retry timers', async () => {
  vi.useFakeTimers();
  fetch.mockRejectedValue(new TypeError('Network channel closed'));
  const result = textToSpeech('Article.', key).catch(error => error);
  await vi.advanceTimersByTimeAsync(CONFIG.RETRY_TIMEOUT_MS + 1);
  expect(await result).toMatchObject({ translationKey: 'errorNetwork', retryable: false });
  expect(fetch).toHaveBeenCalledTimes(CONFIG.RETRY_MAX_ATTEMPTS + 1);
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts an unfinished response body and preserves the caller cancellation', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const cancellation = new DOMException('Operation stopped', 'AbortError');
  let body, settled = false;
  fetch.mockResolvedValue(new Response(new ReadableStream({ start(stream) { body = stream; } })));
  const pending = textToSpeech('Article.', key, { signal: controller.signal }).catch(error => error)
    .then(result => { settled = true; return result; });
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledOnce();
    controller.abort(cancellation);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await pending).toBe(cancellation);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  } finally { body.close(); await pending; }
});

it('bounds a stalled speech response by the existing request deadline', async () => {
  vi.useFakeTimers();
  let body;
  fetch.mockResolvedValue(new Response(new ReadableStream({ start(stream) { body = stream; } })));
  const pending = textToSpeech('Article.', key).catch(error => error);
  await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS + CONFIG.RETRY_TIMEOUT_MS + 1);
  expect(await pending).toMatchObject({ name: 'TimeoutError', translationKey: 'errorTimeout' });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  body.close();
});

it('does not admit another segment after cancellation of the completed request', async () => {
  fetch.mockImplementation(async () => {
    checkCancelled.mockRejectedValue(new DOMException('Operation stopped', 'AbortError'));
    return new Response(wav());
  });
  await expect(chunksToSpeech([{ text: 'First.', index: 0 }, { text: 'Second.', index: 1 }], key, {
    provider: 'openrouter', openrouterTtsVoice: 'Kore'
  })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('splits an oversized segment, routes both requests and assembles a single valid WAV', async () => {
  const result = await chunksToSpeech([{ text: 'x'.repeat(24003), index: 0 }], key, {
    provider: 'openrouter', openrouterTtsVoice: 'Leda'
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  const texts = fetch.mock.calls.map(([, request]) => JSON.parse(request.body).input);
  expect(texts.map(text => text.length)).toEqual([24000, 3]);
  expect(texts.join('')).toBe('x'.repeat(24003));
  expect([...readWav(result).data]).toEqual([1, 0, 2, 0, 1, 0, 2, 0]);
});
