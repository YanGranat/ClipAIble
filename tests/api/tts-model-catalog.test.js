import { afterEach, describe, expect, it, vi } from 'vitest';
import { textToSpeech as google } from '../../scripts/api/google-tts.js';
import { textToSpeech as elevenlabs } from '../../scripts/api/elevenlabs.js';
import { textToSpeech as qwen } from '../../scripts/api/qwen.js';
import { buildTTSOptions } from '../../scripts/generation/audio-helpers.js';
import { normalizePiperVoiceId } from '../../scripts/api/piper-voices-mapping.js';
import { getVoiceFromSettings } from '../../scripts/utils/storage/settings-helpers.js';
import { textToSpeech, chunksToSpeech } from '../../scripts/api/tts.js';
import { prepareQuickSaveData } from '../../scripts/processing/quicksave.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options) => operation({ signal: options?.signal ?? new AbortController().signal, deadline: Date.now() + 600000 }) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ checkCancellation: async () => {}, getUILanguageCached: async () => 'en' }));
afterEach(() => vi.unstubAllGlobals());

function wav() {
  const data = new Uint8Array(48);
  const view = new DataView(data.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    [...text].forEach((char, index) => { data[offset + index] = char.charCodeAt(0); });
  }
  view.setUint32(4, 40, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, 4, true);
  data.set([1, 0, 2, 0], 44);
  return data;
}
function googleResponse(bytes, mimeType, finishReason = 'STOP') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason,
    content: { parts: [{ inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } }] } }
  ] }), { headers: { 'Content-Type': 'application/json' } })));
}
function requestBody() { return JSON.parse(fetch.mock.calls[0][1].body); }

describe('Gemini synthesis generations', () => {
  it('sends a verbatim transcript and separate style to Gemini 3.8 and preserves its WAV bytes', async () => {
    const bytes = wav(); googleResponse(bytes, 'audio/wav');
    expect(new Uint8Array(await google('An exact article.', 'synthetic-key', { voice: 'Kore', prompt: 'Read calmly.' }))).toEqual(bytes);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-tts:generateContent');
    expect(requestBody().contents[0].parts).toEqual([{ text: 'An exact article.', speech_metadata: { style: 'Read calmly.' } }]);
    expect(requestBody().generationConfig.speechConfig.voiceConfig).toEqual({ voice: 'Kore' });
  });
  it.each([
    'gemini-3.1-flash-tts-preview', 'gemini-2.5-pro-preview-tts'
  ])('upgrades a saved %s before one request and keeps the selected voice', async model => {
    googleResponse([1, 0, 2, 0], 'audio/L16;rate=22050');
    const result = new Uint8Array(await google('Article.', 'synthetic-key', { model, voice: 'kore', prompt: 'Calmly' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-tts:generateContent');
    expect(requestBody().contents[0].parts).toEqual([{ text: 'Article.', speech_metadata: { style: 'Calmly' } }]);
    expect(requestBody().generationConfig.speechConfig.voiceConfig).toEqual({ voice: 'Kore' });
    expect(new DataView(result.buffer).getUint32(24, true)).toBe(22050);
    expect([...result.slice(44)]).toEqual([1, 0, 2, 0]);
  });
  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-flash-lite-preview-tts'
  ])('replaces saved %s before sending a single current-schema request', async model => {
    googleResponse([1, 0, 2, 0], 'audio/L16;rate=24000');
    const result = new Uint8Array(await google('Article.', 'synthetic-key', { model, voice: 'Kore', prompt: 'Calmly' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-lite-tts:generateContent');
    expect(requestBody().contents[0].parts).toEqual([{ text: 'Article.', speech_metadata: { style: 'Calmly' } }]);
    expect(requestBody().generationConfig.speechConfig.voiceConfig).toEqual({ voice: 'Kore' });
    expect([...result.slice(44)]).toEqual([1, 0, 2, 0]);
  });
  it('preserves an explicitly selected Flash-Lite model and another prebuilt voice', async () => {
    googleResponse(wav(), 'audio/wav');
    await google('Article.', 'synthetic-key', { model: 'gemini-3.8-flash-lite-tts', voice: 'Leda' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-lite-tts:generateContent');
    expect(requestBody().generationConfig.speechConfig.voiceConfig).toEqual({ voice: 'Leda' });
  });
  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-flash-lite-preview-tts'
  ])('upgrades saved %s in Quick Save without changing its Gemini text model or saved voice', async model => {
    const settings = {
      api_provider: 'gemini', model_by_provider: { gemini: 'gemini-4-argon' },
      extraction_mode: 'automatic', audio_provider: 'google',
      gemini_api_key: 'synthetic-text-key',
      google_tts_api_key: 'synthetic-tts-key', google_tts_model: model,
      google_tts_voice: 'Charon', google_tts_prompt: 'Calmly'
    };
    const original = structuredClone(settings);
    const data = await prepareQuickSaveData(settings, 'audio', 1, '', 'https://example.com/article', 'Article');
    googleResponse(wav(), 'audio/wav');
    await textToSpeech('Article.', data.googleTtsApiKey, {
      provider: data.audioProvider, model: data.model, voice: data.googleTtsVoice,
      googleTtsModel: data.googleTtsModel, googleTtsPrompt: data.googleTtsPrompt
    });
    expect(data.model).toBe('gemini-4-argon');
    expect(data.googleTtsModel).toBe('gemini-3.8-flash-lite-tts');
    expect(settings).toEqual(original);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-lite-tts:generateContent');
    expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('synthetic-tts-key');
    expect(requestBody().generationConfig.speechConfig.voiceConfig).toEqual({ voice: 'Charon' });
  });
  it.each([
    [{ model: 'unknown-tts-model' }, 'errorModelNotFound'],
    [{ voice: 'Unavailable voice' }, 'selectNarratorVoice']
  ])('rejects the saved unsupported choice before a request: %o', async (options, translationKey) => {
    googleResponse(wav(), 'audio/wav');
    await expect(google('Article.', 'synthetic-key', options)).rejects.toMatchObject({ translationKey });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not fall back to a different model after an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await expect(google('Article.', 'synthetic-key', { model: 'gemini-3.8-flash-lite-tts' })).rejects.toMatchObject({
      status: 404, translationKey: 'errorModelNotFound', translationParams: { model: 'gemini-3.8-flash-lite-tts' }
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash-lite-tts:generateContent');
  });
  it.each([
    [[1, 0], 'audio/wav', 'STOP', /Invalid WAV/],
    [[1, 0], undefined, 'STOP', /Missing audio format/],
    [[1, 0], 'audio/L16;rate=0', 'STOP', /sample rate/],
    [[1], 'audio/L16;rate=24000', 'STOP', /Incomplete PCM/],
    [[1, 0], 'audio/mpeg', 'STOP', /Unsupported audio format/],
    [[1, 0], 'audio/L16', 'MAX_TOKENS', /Incomplete audio/]
  ])('rejects malformed or incomplete audio (%s, %s, %s)', async (bytes, mimeType, reason, error) => {
    googleResponse(bytes, mimeType, reason);
    await expect(google('Article.', 'synthetic-key')).rejects.toMatchObject({
      message: expect.stringMatching(error), translationKey: 'errorFailedToParseResponse'
    });
  });
  it('gives an empty speech response its own actionable localization', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [] }))));
    await expect(google('Article.', 'synthetic-key')).rejects.toMatchObject({ translationKey: 'errorNoAudioDataReturned' });
  });
});

describe('ElevenLabs model capabilities', () => {
  it('honors the public wrapper format option and gives an explicit provider format priority', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 0]))));
    await textToSpeech('Article.', 'synthetic-key', { provider: 'elevenlabs', format: 'pcm_24000' });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe('pcm_24000');
    await textToSpeech('Article.', 'synthetic-key', { provider: 'elevenlabs', format: 'pcm_24000', elevenlabsFormat: 'mp3_44100_128' });
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('output_format')).toBe('mp3_44100_128');
  });
  it.each([
    [undefined, { stability: 0.5, similarity_boost: 0.8 }],
    ['eleven_v3', { stability: 0.5 }],
    ['eleven_flash_v2_5', { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.2 }],
    ['eleven_turbo_v2_5', { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.2 }]
  ])('sends only parameters supported by %s', async (modelId, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2]))));
    await elevenlabs('Article.', 'synthetic-key', { modelId, voiceId: 'saved-custom-voice', stability: 0.5, similarityBoost: 0.8, style: 0.3, speed: 4 });
    expect(requestBody().model_id).toBe(modelId || 'eleven_v4');
    expect(requestBody().voice_settings).toEqual(expected);
    expect(fetch.mock.calls[0][0]).toContain('/saved-custom-voice');
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe('mp3_44100_192');
  });
  it.each([16000, 22050, 24000, 44100])('wraps requested PCM %s as mono signed 16-bit WAV without changing samples', async sampleRate => {
    const samples = new Uint8Array([0, 128, 255, 127, 1, 0, 255, 255]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(samples)));
    const result = await elevenlabs('Article.', 'synthetic-key', { format: `pcm_${sampleRate}` });
    const header = new DataView(result);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe(`pcm_${sampleRate}`);
    expect(String.fromCharCode(...new Uint8Array(result, 0, 4))).toBe('RIFF');
    expect(header.getUint32(4, true)).toBe(result.byteLength - 8);
    expect(header.getUint16(20, true)).toBe(1); expect(header.getUint16(22, true)).toBe(1);
    expect(header.getUint32(24, true)).toBe(sampleRate); expect(header.getUint32(28, true)).toBe(sampleRate * 2);
    expect(header.getUint16(34, true)).toBe(16); expect(header.getUint32(40, true)).toBe(samples.length);
    expect(new Uint8Array(result, 44)).toEqual(samples);
    expect(header.getUint32(40, true) / header.getUint32(28, true)).toBe(4 / sampleRate);
  });
  it('decodes G.711 mu-law endpoints, zeroes and low amplitudes to 8 kHz PCM WAV', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0xff, 0x7f, 0xfe, 0x7e, 0x80, 0x00, 0x8f, 0x0f, 0x9f, 0x1f]))));
    const result = await elevenlabs('Article.', 'synthetic-key', { format: 'ulaw_8000' });
    const view = new DataView(result);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe('ulaw_8000');
    expect(Array.from({ length: 10 }, (_, index) => view.getInt16(44 + index * 2, true))).toEqual([0, 0, 8, -8, 32124, -32124, 16764, -16764, 8316, -8316]);
    expect(view.getUint32(24, true)).toBe(8000); expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint32(40, true) / view.getUint32(28, true)).toBe(10 / 8000);
  });
  it('preserves MPEG bytes and the requested bitrate instead of silently downgrading', async () => {
    const bytes = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } })));
    expect(new Uint8Array(await elevenlabs('Article.', 'synthetic-key', { format: 'mp3_22050_32' }))).toEqual(bytes);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe('mp3_22050_32');
  });
  it('rejects an incomplete PCM sample', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]))));
    await expect(elevenlabs('Article.', 'synthetic-key', { format: 'pcm_16000' })).rejects.toThrow('Invalid PCM');
  });
});

describe('Qwen workspace synthesis', () => {
  it.each([[undefined, 'Auto'], ['auto', 'Auto'], ['pt-BR', 'Portuguese'], ['__proto__', 'Auto']])('preserves the legacy language intent %s', async (language, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: { audio: { data: Buffer.from(wav()).toString('base64') } } }))));
    await qwen('Sample text.', 'synthetic-key', { qwenModel: 'qwen3-tts-flash', voice: 'Elias', language });
    expect(requestBody().input.language_type).toBe(expected);
  });
  it('uses the selected legacy model voice default through the public wrapper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: { audio: { data: Buffer.from(wav()).toString('base64') } } }))));
    await textToSpeech('Article.', 'synthetic-key', { provider: 'qwen', qwenModel: 'qwen3-tts-flash' });
    expect(requestBody().input.voice).toBe('Elias');
  });
  it.each([['singapore', 'ap-southeast-1'], ['beijing', 'cn-beijing']])('captures the %s workspace and current model through TTS options', async (region, domain) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: { audio: { url: 'https://example.com/audio.wav' } } })))
      .mockResolvedValueOnce(new Response(wav())));
    const options = buildTTSOptions({ provider: 'qwen', speed: 1.3, qwenModel: 'qwen-audio-3.1-tts-plus', qwenWorkspaceId: 'sample-workspace', qwenRegion: region }, 'xunanchuan_v3.1', 'wav');
    await qwen('Article.', 'synthetic-key', options);
    expect(fetch.mock.calls[0][0]).toBe(`https://sample-workspace.${domain}.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`);
    expect(requestBody()).toEqual({ model: 'qwen-audio-3.1-tts-plus', input: { text: 'Article.', voice: 'xunanchuan_v3.1', format: 'wav', sample_rate: 24000, rate: 1.3 } });
  });
  it.each([
    [{}, /workspace/], [{ qwenWorkspaceId: 'https://example.com/' }, /workspace/],
    [{ qwenWorkspaceId: 'sample-workspace', qwenRegion: 'unknown' }, /region/],
    [{ qwenModel: 'qwen3-tts-flash-2025-11-27' }, /retired/],
    [{ qwenWorkspaceId: 'sample-workspace', voice: 'Elias' }, /3.1 voice/],
    [{ qwenModel: 'qwen3-tts-flash', voice: 'longanhuan_v3.1' }, /voice supported by the selected/]
  ])('rejects incompatible setup before sending a request: %s', async (options, error) => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(qwen('Article.', 'synthetic-key', options)).rejects.toThrow(error);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps an explicit undated legacy model on its own endpoint with its voice contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: { audio: { url: 'https://example.com/audio.wav' } } })))
      .mockResolvedValueOnce(new Response(wav())));
    await qwen('Article.', 'synthetic-key', { qwenModel: 'qwen3-tts-flash', voice: 'Elias', language: 'en' });
    expect(fetch.mock.calls[0][0]).toBe('https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(requestBody().input).toEqual({ text: 'Article.', voice: 'Elias', language_type: 'English' });
  });
  it.each(['qwen-audio-3.1-tts-flash', 'qwen3-tts-flash'])('preserves a provider-defined voice for %s', async qwenModel => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: { audio: { url: 'https://example.com/audio.wav' } } })))
      .mockResolvedValueOnce(new Response(wav())));
    const voice = 'sample-custom-voice';
    await qwen('Article.', 'synthetic-key', { qwenModel, qwenWorkspaceId: 'sample-workspace', voice });
    expect(requestBody().input.voice).toBe(voice);
  });
});

it('keeps one Respeecher endpoint across short mixed-language chunks', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(wav(), { headers: { 'Content-Type': 'audio/wav' } })));
  await chunksToSpeech([{ text: 'Цей приклад містить українські слова та пояснює роботу системи.', index: 0 },
    { text: 'A short quotation.', index: 1 }], 'synthetic-key', { provider: 'respeecher', voice: 'olesia-media', language: 'auto' });
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2);
  expect(fetch.mock.calls.every(([url]) => url.includes('/ua-rt/'))).toBe(true);
});

it('resolves provider defaults and the French Piper alias without replacing saved voices', () => {
  expect(getVoiceFromSettings('qwen', {})).toBe('longanhuan_v3.1');
  expect(getVoiceFromSettings('elevenlabs', {})).toBe('WQP7cQUF5aAS6Axh5yaa');
  expect(getVoiceFromSettings('qwen', { audio_voice_map: { current: { qwen: 'Elias' } } })).toBe('Elias');
  expect(getVoiceFromSettings('qwen', { audio_provider: 'openai', audio_voice: 'nova' })).toBe('longanhuan_v3.1');
  expect(normalizePiperVoiceId('fr_FR-mls_fr-medium')).toBe('fr_FR-mls-medium');
  expect(normalizePiperVoiceId('en_US-lessac-medium')).toBe('en_US-lessac-medium');
});
