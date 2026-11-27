import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentGeneratorFactory } from '../../scripts/generation/factory.js';
import { generateAudio } from '../../scripts/generation/audio.js';
import { TTSApiKeyManager } from '../../scripts/utils/api/api-key-manager.js';
import { VoiceValidator } from '../../scripts/utils/validation/voice-validator.js';
import { pcmToWav } from '../../scripts/api/audio-format.js';
import { readWav } from '../../scripts/utils/wav.js';
import { downloadBlob } from '../../scripts/api/blob-download.js';
import { prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { decryptApiKey } from '../../scripts/utils/security/encryption.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/api/blob-download.js', () => ({ downloadBlob: vi.fn(async () => 1) }));
vi.mock('../../scripts/utils/security/encryption.js', async original => ({ ...await original(), decryptApiKey: vi.fn(async value => {
  if (value === 'ENC:v2:synthetic-router') return 'synthetic-router-key';
  throw new Error('Cannot decrypt this value');
}) }));
vi.mock('../../scripts/generation/audio-prep.js', async original => ({ ...await original(),
  prepareContentForAudio: vi.fn(async () => [{ text: 'First observation.', index: 0 }, { text: 'Second observation.', index: 1 }]) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async original => ({ ...await original(), getUILanguageCached: async () => 'en', checkCancellation: async () => {} }));
vi.mock('../../scripts/state/processing.js', async original => ({ ...await original(), getProcessingState: () => ({ progress: 0 }), isCancelled: () => false }));

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(pcmToWav(new Uint8Array([4, 0, 5, 0]).buffer, 24000))));
});
afterEach(() => { vi.unstubAllGlobals(); });

it('keeps the captured encrypted speech key and speech settings through the real factory and WAV download', async () => {
  const data = { apiKey: 'synthetic-text-key', model: 'example-text-model', audioProvider: 'openrouter',
    openrouterTtsApiKey: 'ENC:v2:synthetic-router', audioVoice: 'marin', audioSpeed: 1.2, audioFormat: 'mp3',
    openrouterTtsModel: 'google/gemini-3.8-flash-lite-tts', openrouterTtsVoice: 'Kore',
    openrouterTtsOptions: { instructions: 'Read slowly.' },
    googleTtsModel: 'gemini-3.8-flash-tts', googleTtsVoice: 'Puck', googleTtsApiKey: 'ENC:v2:synthetic-google' };
  const original = structuredClone(data);
  await DocumentGeneratorFactory.generate('audio', data, { title: 'Observations', content: [{ type: 'paragraph', text: 'A survey.' }] });
  expect(decryptApiKey).toHaveBeenCalledExactlyOnceWith('ENC:v2:synthetic-router');
  expect(prepareContentForAudio.mock.calls[0].slice(2, 4)).toEqual(['synthetic-text-key', 'example-text-model']);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetch.mock.calls) {
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(request.headers.Authorization).toBe('Bearer synthetic-router-key');
    expect(JSON.parse(request.body)).toMatchObject({ model: 'google/gemini-3.8-flash-lite-tts', voice: 'Kore', response_format: 'wav', instructions: 'Read slowly.' });
  }
  const [blob, filename] = downloadBlob.mock.calls[0];
  expect(filename).toBe('Observations.wav');
  expect(blob.type).toBe('audio/wav');
  expect([...readWav(await blob.arrayBuffer()).data]).toEqual([4, 0, 5, 0, 4, 0, 5, 0]);
  expect(data).toEqual(original);
});

it('uses an alternative model default instead of a Gemini voice in the factory', async () => {
  fetch.mockImplementation(async () => new Response(new Uint8Array([1, 0]), {
    headers: { 'Content-Type': 'audio/pcm;rate=24000;channels=1' }
  }));
  await DocumentGeneratorFactory.generate('audio', {
    apiKey: 'synthetic-text-key', model: 'example-text-model', audioProvider: 'openrouter',
    openrouterTtsApiKey: 'ENC:v2:synthetic-router', openrouterTtsModel: 'mistralai/voxtral-mini-tts-3-0'
  }, { title: 'Observations', content: [{ type: 'paragraph', text: 'A survey.' }] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    model: 'mistralai/voxtral-mini-tts-3-0', voice: 'voice_3150', response_format: 'pcm'
  });
  expect(downloadBlob.mock.calls[0][1]).toBe('Observations.wav');
});

it('does not borrow the text or direct Google key when the captured OpenRouter key is absent', async () => {
  await expect(TTSApiKeyManager.getDecryptedKey('openrouter', { apiKey: 'text-key', googleTtsApiKey: 'google-key' }))
    .rejects.toMatchObject({ translationKey: 'errorAudioApiKeyRequired', translationParams: { provider: 'OpenRouter' } });
  expect(decryptApiKey).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves the canonical decryption error descriptor for an invalid stored key', async () => {
  await expect(TTSApiKeyManager.getDecryptedKey('openrouter', { openrouterTtsApiKey: 'ENC:v2:broken' }))
    .rejects.toMatchObject({ translationKey: 'errorApiKeyInvalid' });
  expect(fetch).not.toHaveBeenCalled();
});

it('validates speech selections before any text preparation request', async () => {
  await expect(generateAudio({ title: 'Survey', content: [{ type: 'paragraph', text: 'A survey.' }],
    provider: 'openrouter', apiKey: 'synthetic-text-key', ttsApiKey: 'synthetic-router-key',
    openrouterTtsModel: 'example/text-only', openrouterTtsVoice: 'Kore' }))
    .rejects.toMatchObject({ translationKey: 'errorModelNotFound' });
  expect(prepareContentForAudio).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('uses only the provider-specific voice field or its own default', () => {
  expect(VoiceValidator.validate('openrouter', 'marin', 'Puck', 'marin', 'Kore')).toBe('Kore');
  expect(VoiceValidator.validate('openrouter', 'marin', 'Puck', 'marin')).toBe('Callirrhoe');
  expect(VoiceValidator.validate('google', 'marin', 'Puck', 'marin', 'Kore')).toBe('Puck');
});
