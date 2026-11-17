import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initApiKeys } from '../../popup/settings/api-keys.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { decryptApiKey } from '../../scripts/utils/encryption.js';

vi.mock('../../scripts/locales.js', () => ({ t: async key => key, tSync: key => key, getUILanguage: async () => 'en', UI_LOCALES: { en: {} } }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, operation) => operation()) } });
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' }, storage: { local: { set: vi.fn(async () => {}) } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('API key settings storage', () => {
  it('uses the shared storage transaction after validating and encrypting a new key', async () => {
    const key = 'sk-synthetic-settings-key';
    const settings = initApiKeys({ elements: { apiProviderSelect: { value: 'openai' }, apiKey: { value: key } }, STORAGE_KEYS, showToast: vi.fn() });
    await settings.saveApiKey();
    expect(navigator.locks.request).toHaveBeenCalledWith('clipaible-api-key-storage', expect.any(Function));
    const stored = chrome.storage.local.set.mock.calls[0][0];
    expect(stored.api_provider).toBe('openai');
    expect(await decryptApiKey(stored.openai_api_key)).toBe(key);
  });

  it('does not enter a storage transaction for an invalid key', async () => {
    const settings = initApiKeys({ elements: { apiProviderSelect: { value: 'openai' }, apiKey: { value: 'invalid' } }, STORAGE_KEYS, showToast: vi.fn() });
    await settings.saveApiKey();
    expect(navigator.locks.request).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
