import { afterEach, expect, it, vi } from 'vitest';
import { textToSpeech as openai } from '../../scripts/api/tts.js';
import { textToSpeech as elevenlabs, getVoices as elevenVoices } from '../../scripts/api/elevenlabs.js';
import { textToSpeech as qwen } from '../../scripts/api/qwen.js';
import { textToSpeech as respeecher, getVoicesFromAPI } from '../../scripts/api/respeecher.js';
import { textToSpeech as google } from '../../scripts/api/google-tts.js';
import { CONFIG } from '../../scripts/utils/config.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en', checkCancellation: async () => {} }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const requests = [
  ['OpenAI', () => openai('Article.', 'synthetic-key', { provider: 'openai' })],
  ['ElevenLabs', () => elevenlabs('Article.', 'synthetic-key')],
  ['Qwen', () => qwen('Article.', 'synthetic-key', { language: 'en', qwenWorkspaceId: 'sample-workspace' })],
  ['Respeecher', () => respeecher('Article.', 'synthetic-key', { language: 'en' })],
  ['Google', () => google('Article.', 'synthetic-key')],
  ['ElevenLabs voices', () => elevenVoices('synthetic-key')],
  ['Respeecher voices', () => getVoicesFromAPI('synthetic-key')]
];
it.each(requests)('%s bounds response-body reads by the configured request deadline', async (_name, request) => {
  vi.useFakeTimers();
  let body, signal, settled = false;
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { body = controller; } }));
  }));
  const result = request().then(value => { settled = true; return value; }, error => { settled = true; return error; });
  try {
    await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS + 1);
    expect(signal?.aborted).toBe(true);
    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await result;
  } finally { body?.error(new DOMException('Closed', 'AbortError')); await result; }
});

it.each(['audio', 'audio_url'])('bounds Qwen secondary %s downloads', async field => {
  vi.useFakeTimers();
  let body, signal, settled = false;
  const output = field === 'audio' ? { audio: { url: 'https://example.com/audio.wav' } } : { audio_url: 'https://example.com/audio.wav' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output }))).mockImplementationOnce(async (_url, options) => {
    signal = options?.signal;
    return new Response(new ReadableStream({ start(controller) { body = controller; } }));
  }));
  const result = qwen('Article.', 'synthetic-key', { qwenWorkspaceId: 'sample-workspace' }).then(value => { settled = true; return value; }, error => { settled = true; return error; });
  try {
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS + 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signal?.aborted).toBe(true);
    expect(settled).toBe(true);
    await result;
  } finally { body?.error(new DOMException('Closed', 'AbortError')); await result; }
});

it('bounds the Respeecher voice preflight before continuing with its existing default voice', async () => {
  vi.useFakeTimers();
  let body, signal;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) { body = controller; } }));
  }).mockImplementation(async () => new Response(new Uint8Array([1, 2]))));
  const result = respeecher('Article.', 'synthetic-key', { voice: 'olesia-media', language: 'ua' }).catch(error => error);
  try {
    await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS + 1);
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect([...new Uint8Array(await result)]).toEqual([1, 2]);
  } finally { body?.error(new DOMException('Closed', 'AbortError')); await result; }
});

it.each([
  ['ElevenLabs', elevenlabs], ['Respeecher', respeecher], ['Qwen', qwen], ['Google', google]
])('preserves a complete %s audio response', async (name, convert) => {
  const pcm = btoa(String.fromCharCode(1, 2));
  const payload = name === 'Qwen' ? { output: { audio: { data: pcm } } }
    : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] };
  vi.stubGlobal('fetch', vi.fn(async () => ['Qwen', 'Google'].includes(name)
    ? new Response(JSON.stringify(payload)) : new Response(new Uint8Array([1, 2]))));
  const output = await convert('Article.', 'synthetic-key', { language: 'en', qwenWorkspaceId: 'sample-workspace' });
  expect([...new Uint8Array(output).slice(-2)]).toEqual([1, 2]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
