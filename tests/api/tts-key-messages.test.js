import { beforeEach, expect, it } from 'vitest';
import { TTSApiKeyManager } from '../../scripts/utils/api/api-key-manager.js';
import { UI_LOCALES, tSync } from '../../scripts/locales.js';

beforeEach(() => chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' }));

it.each([
  ['elevenlabs', 'errorElevenlabsKeyRequired'],
  ['qwen', 'errorQwenKeyRequired'],
  ['respeecher', 'errorRespeecherKeyRequired'],
  ['google', 'errorAudioApiKeyRequired'],
  ['openai', 'errorAudioApiKeyRequired']
])('returns a translatable missing-key error for %s', async (provider, key) => {
  const error = await TTSApiKeyManager.getDecryptedKey(provider, {}).catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.translationKey).toBe(key);
  for (const language of Object.keys(UI_LOCALES)) {
    expect(tSync(key, language, error.translationParams)).not.toBe(key);
    expect(tSync(key, language, error.translationParams)).not.toContain('{provider}');
  }
});

it.each([
  ['elevenlabs', 'elevenlabsApiKey', 'errorElevenlabsKeyInvalid'],
  ['qwen', 'qwenApiKey', 'errorQwenKeyInvalid'],
  ['respeecher', 'respeecherApiKey', 'errorRespeecherKeyInvalid'],
  ['google', 'googleTtsApiKey', 'errorApiKeyInvalid']
])('preserves the error descriptor when a stored %s key cannot be decrypted', async (provider, field, key) => {
  const error = await TTSApiKeyManager.getDecryptedKey(provider, { [field]: 'ENC:v2:broken' }).catch(error => error);
  expect(error.translationKey).toBe(key);
  for (const language of Object.keys(UI_LOCALES)) expect(tSync(key, language)).not.toBe(key);
});

it('does not require a key for offline synthesis', async () => {
  await expect(TTSApiKeyManager.getDecryptedKey('offline', {})).resolves.toBeNull();
});
