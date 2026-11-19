import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initApiKeys } from '../../popup/settings/api-keys.js';
import { setupTtsKeyHandlers } from '../../popup/handlers/tts-keys.js';
import * as encryption from '../../scripts/utils/encryption.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

vi.mock('../../scripts/locales.js', () => ({ t: async key => key, tSync: key => key, getUILanguage: async () => 'en', UI_LOCALES: { en: {} } }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/security/key-store.js', () => {
  let key;
  return { getInstallationKey: () => key ||= webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) };
});

const flows = [
  ['article', 'gemini_api_key'],
  ['speech', 'google_tts_api_key'],
  ['images', 'google_api_key']
];

function setup(flow, value) {
  const input = { value, type: 'password', dataset: { provider: 'gemini' } };
  const showToast = vi.fn();
  const provider = { value: 'gemini' };
  let save;
  if (flow === 'article') {
    save = initApiKeys({ elements: { apiProviderSelect: provider, apiKey: input }, STORAGE_KEYS, showToast }).saveApiKey;
  } else {
    const field = flow === 'speech' ? 'googleTtsApiKey' : 'googleApiKey';
    const button = flow === 'speech' ? 'saveGoogleTtsApiKey' : 'saveGoogleApiKey';
    setupTtsKeyHandlers({ elements: { [field]: input, [button]: { addEventListener: (_event, handler) => { save = handler; } } },
      STORAGE_KEYS, encryptApiKey: encryption.encryptApiKey, maskApiKey: encryption.maskApiKey,
      logError: vi.fn(), showToast, t: async key => key });
  }
  return { input, showToast, provider, save };
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, operation) => operation()) } });
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' }, storage: { local: { set: vi.fn(async () => {}) } } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(flows)('Google %s credential entry', (flow, storageKey) => {
  it('encrypts an opaque token into only its owned slot without a network check', async () => {
    const token = 'sample-auth-token_alpha.7~value';
    const { input, save } = setup(flow, ` ${token} `);
    await save();
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
    const stored = chrome.storage.local.set.mock.calls[0][0];
    expect(Object.keys(stored)).toEqual([storageKey]);
    expect(stored[storageKey]).toMatch(/^ENC:v2:/);
    expect(await encryption.decryptApiKey(stored[storageKey])).toBe(token);
    expect(fetch).not.toHaveBeenCalled();
    if (flow !== 'article') {
      expect(input.type).toBe('password');
      expect(input.value).toBe(encryption.maskApiKey(token));
      expect(input.dataset.encrypted).toBe(stored[storageKey]);
    }
  });

  it.each(['', '   ', '****saved', '••••saved', 'sample token', 'sample\tvalue', 'sample\nvalue', 'sample\u0000value'])('does not save empty, masked or non-token input %j', async value => {
    const { input, save } = setup(flow, value);
    input.dataset.encrypted = 'retained-ciphertext';
    await save();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(input.dataset.encrypted).toBe('retained-ciphertext');
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('does not store a Gemini draft bound to another article provider', async () => {
  const { input, save } = setup('article', 'sample-auth-token_alpha.7~value');
  input.dataset.provider = 'claude';
  await save();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('does not save a Gemini credential after the current article provider changes during encryption', async () => {
  const actualEncrypt = encryption.encryptApiKey;
  let release;
  let entered = false;
  vi.spyOn(encryption, 'encryptApiKey').mockImplementation(async value => {
    entered = true;
    await new Promise(resolve => { release = resolve; });
    return actualEncrypt(value);
  });
  const { input, provider, save } = setup('article', 'sample-auth-token_alpha.7~value');
  const pending = save();
  await vi.waitFor(() => expect(entered).toBe(true));
  provider.value = 'claude';
  input.dataset.provider = 'claude';
  release();
  await pending;
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});
