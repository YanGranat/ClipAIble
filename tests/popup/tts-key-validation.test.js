import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTtsKeyHandlers } from '../../popup/handlers/tts-keys.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

describe('Google TTS key validation', () => {
  let save;
  let deps;

  beforeEach(() => {
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, operation) => operation()) } });
    globalThis.chrome = { storage: { local: { set: vi.fn(async () => {}) } } };
    deps = {
      elements: {
        googleTtsApiKey: { value: '', dataset: {} },
        saveGoogleTtsApiKey: { addEventListener: (_event, callback) => { save = callback; } }
      },
      STORAGE_KEYS, encryptApiKey: vi.fn(async () => 'encrypted-key'),
      maskApiKey: () => '****', logError: vi.fn(), showToast: vi.fn(),
      t: vi.fn(async key => key)
    };
    setupTtsKeyHandlers(deps);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not store a key rejected by asynchronous validation', async () => {
    deps.elements.googleTtsApiKey.value = 'invalid-key-value';
    await save();
    expect(deps.encryptApiKey).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('invalidGoogleTtsKeyFormat', 'error');
  });

  it('does not store a Google key that is too short', async () => {
    deps.elements.googleTtsApiKey.value = 'AIza-short';
    await save();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('keyTooShort', 'error');
  });

  it('stores a key accepted by asynchronous validation', async () => {
    deps.elements.googleTtsApiKey.value = 'AIza-synthetic-validation-input';
    await save();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ google_tts_api_key: 'encrypted-key' });
    expect(navigator.locks.request).toHaveBeenCalledWith('clipaible-api-key-storage', expect.any(Function));
    expect(deps.elements.googleTtsApiKey.dataset.encrypted).toBe('encrypted-key');
    expect(deps.elements.googleTtsApiKey.type).toBe('password');
    expect(deps.showToast).toHaveBeenCalledWith('googleTtsKeySaved', 'success');
  });
});
