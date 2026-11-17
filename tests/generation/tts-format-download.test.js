import { afterEach, expect, it, vi } from 'vitest';
import { generateAudio } from '../../scripts/generation/audio.js';
import { AUDIO_CONFIG } from '../../scripts/generation/audio-prep.js';
import { prepareQuickSaveData } from '../../scripts/processing/quicksave.js';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';
import { pcmToWav } from '../../scripts/api/audio-format.js';
import { realtimeWebSocket } from '../helpers/realtime-websocket.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: operation => operation() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async importOriginal => ({ ...await importOriginal(), getUILanguageCached: async () => 'en', checkCancellation: async () => {} }));
vi.mock('../../scripts/utils/api-key-manager.js', () => ({ TTSApiKeyManager: { getDecryptedKey: async () => 'synthetic-tts-key' } }));
vi.mock('../../scripts/utils/security/encryption.js', async importOriginal => ({ ...await importOriginal(), decryptApiKey: async key => key }));
vi.mock('../../scripts/state/processing.js', async importOriginal => ({ ...await importOriginal(), getProcessingState: () => ({ progress: 0 }), isCancelled: () => false }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: key => key }));
vi.mock('../../scripts/generation/audio-prep.js', async importOriginal => ({ ...await importOriginal(), prepareContentForAudio: async () => [{ text: 'Article.', index: 0 }] }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([['pcm_24000', 'wav', 'audio/wav'], ['ulaw_8000', 'wav', 'audio/wav'], ['mp3_44100_128', 'mp3', 'audio/mpeg']])('downloads requested %s using the actual file format and MIME type', async (format, extension, mimeType) => {
  const bytes = format === 'ulaw_8000' ? [0xff, 0x80] : format.startsWith('pcm_') ? [1, 0, 2, 0] : [73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 0, 0];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(bytes))));
  let blob;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value; return 'blob:synthetic-audio'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  chrome.downloads.download.mockClear();
  await generateAudio({ content: [{ type: 'paragraph', text: 'Article.' }], title: 'Article', apiKey: 'synthetic-prep-key', ttsApiKey: 'synthetic-tts-key',
    model: 'synthetic-model', provider: 'elevenlabs', voice: 'saved-voice', speed: 1, format: 'mp3', language: 'en', elevenlabsFormat: format });
  expect(chrome.downloads.download).toHaveBeenCalledWith(expect.objectContaining({ filename: `Article.${extension}`, url: 'blob:synthetic-audio' }));
  expect(blob.type).toBe(mimeType);
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('output_format')).toBe(format);
  const result = new Uint8Array(await blob.arrayBuffer());
  if (extension === 'wav') {
    expect(String.fromCharCode(...result.slice(8, 12))).toBe('WAVE');
    expect(new DataView(result.buffer).getUint32(24, true)).toBe(format === 'ulaw_8000' ? 8000 : 24000);
  } else expect([...result]).toEqual(bytes);
  expect(AUDIO_CONFIG.VOICES).toEqual(expect.arrayContaining(['marin', 'cedar']));
  expect(AUDIO_CONFIG.VOICES).not.toContain('nova');
});

it('keeps Qwen workspace, region, model and voice from stored quick-save settings through the factory to the synthesis request', async () => {
  const settings = { extraction_mode: 'automatic', audio_provider: 'qwen', openai_api_key: 'synthetic-prep-key',
    qwen_model: 'qwen-audio-3.1-tts-plus', qwen_workspace_id: 'sample-workspace', qwen_region: 'beijing',
    audio_voice_map: { current: { qwen: 'xunanchuan_v3.1' } } };
  const data = await prepareQuickSaveData(settings, 'audio', 1, '<main>Article.</main>', 'https://example.com/article', 'Article');
  const wav = pcmToWav(new Uint8Array([1, 0]).buffer, 24000);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: { audio: { data: Buffer.from(wav).toString('base64') } } }))));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-audio');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await DocumentGeneratorFactory.generate('audio', data, { content: [{ type: 'paragraph', text: 'Article.' }], title: 'Article' }, undefined);
  expect(fetch.mock.calls[0][0]).toBe('https://sample-workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ model: settings.qwen_model, input: { voice: 'xunanchuan_v3.1' } });
  expect(chrome.downloads.download).toHaveBeenLastCalledWith(expect.objectContaining({ filename: 'Article.wav' }));
  expect(settings.qwen_region).toBe('beijing');
});

it('exports complete Realtime narration as WAV through the generation factory', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: 'ek_synthetic' }))));
  vi.stubGlobal('WebSocket', realtimeWebSocket(socket => socket.complete([3, 0, 4, 0])));
  let blob;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value; return 'blob:synthetic-audio'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await DocumentGeneratorFactory.generate('audio', { audioProvider: 'openai', audioVoice: 'marin', audioSpeed: 1,
    apiKey: 'synthetic-prep-key', openaiApiKey: 'synthetic-tts-key' }, { content: [{ type: 'paragraph', text: 'Article.' }], title: 'Article' }, undefined);
  expect(chrome.downloads.download).toHaveBeenLastCalledWith(expect.objectContaining({ filename: 'Article.wav' }));
  expect(blob.type).toBe('audio/wav');
  expect([...new Uint8Array(await blob.arrayBuffer()).subarray(44)]).toEqual([3, 0, 4, 0]);
});
