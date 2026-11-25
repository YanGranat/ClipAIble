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
    deps.elements.googleTtsApiKey.value = 'invalid key value';
    await save();
    expect(deps.encryptApiKey).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('invalidKeyFormat', 'error', { key: 'invalidKeyFormat' });
  });

  it('does not store a Google key with control characters', async () => {
    deps.elements.googleTtsApiKey.value = 'synthetic\u0001token';
    await save();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('invalidKeyFormat', 'error', { key: 'invalidKeyFormat' });
  });

  it('stores a key accepted by asynchronous validation', async () => {
    deps.elements.googleTtsApiKey.value = 'synthetic-speech-token';
    await save();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ google_tts_api_key: 'encrypted-key' });
    expect(navigator.locks.request).toHaveBeenCalledWith('clipaible-api-key-storage', expect.any(Function));
    expect(deps.elements.googleTtsApiKey.dataset.encrypted).toBe('encrypted-key');
    expect(deps.elements.googleTtsApiKey.type).toBe('password');
    expect(deps.showToast).toHaveBeenCalledWith('googleTtsKeySaved', 'success', { key: 'googleTtsKeySaved' });
  });

  it('acknowledges the saved value without replacing a new draft entered during storage', async () => {
    const input = deps.elements.googleTtsApiKey;
    input.value = 'synthetic-first-key';
    input.type = 'text';
    let releaseStorage;
    chrome.storage.local.set.mockImplementation(() => new Promise(resolve => { releaseStorage = resolve; }));
    const pending = save();
    await vi.waitFor(() => expect(releaseStorage).toBeTypeOf('function'));
    input.value = 'synthetic-next-draft';
    releaseStorage();
    await pending;
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ google_tts_api_key: 'encrypted-key' });
    expect(input.value).toBe('synthetic-next-draft');
    expect(input.type).toBe('text');
    expect(input.dataset.encrypted).toBeUndefined();
    expect(deps.showToast).toHaveBeenCalledWith('googleTtsKeySaved', 'success', { key: 'googleTtsKeySaved' });
  });

  it('does not overwrite a newer accepted key if an earlier encryption finishes later', async () => {
    const input = deps.elements.googleTtsApiKey;
    let releaseOld;
    deps.encryptApiKey.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; }))
      .mockResolvedValueOnce('next-ciphertext');
    input.value = 'synthetic-first-key';
    const earlier = save();
    await vi.waitFor(() => expect(releaseOld).toBeTypeOf('function'));
    input.value = 'synthetic-next-key';
    await save();
    releaseOld('earlier-ciphertext');
    await earlier;
    expect(chrome.storage.local.set).toHaveBeenCalledExactlyOnceWith({ google_tts_api_key: 'next-ciphertext' });
    expect(input.dataset.encrypted).toBe('next-ciphertext');
    expect(deps.showToast).toHaveBeenCalledOnce();
  });

  it('keeps an editable key and shows a localized failure when storage rejects the save', async () => {
    const input = deps.elements.googleTtsApiKey;
    input.value = 'synthetic-next-draft';
    input.type = 'text';
    chrome.storage.local.set.mockRejectedValue(new Error('Storage unavailable'));
    await save();
    expect(input.value).toBe('synthetic-next-draft');
    expect(input.type).toBe('text');
    expect(input.dataset.encrypted).toBeUndefined();
    expect(deps.showToast).toHaveBeenCalledExactlyOnceWith('failedToSave', 'error', { key: 'failedToSave' });
  });
});
