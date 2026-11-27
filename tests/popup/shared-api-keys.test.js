// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { initSharedApiKeys } from '../../popup/settings/shared-api-keys.js';
import { setupTtsKeyHandlers } from '../../popup/handlers/tts-keys.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

let elements, shared, set, encrypt, toast, changed;
beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  vi.stubGlobal('navigator', { locks: { request: (_, operation) => operation() } });
  set = vi.fn(async () => {});
  vi.stubGlobal('chrome', { storage: { local: { set, get: vi.fn(async () => ({ openrouter_keys_separated: true })) },
    onChanged: { addListener: listener => { changed = listener; } } } });
  shared = initSharedApiKeys(elements);
  encrypt = vi.fn(async () => 'ENC:sample');
  toast = vi.fn();
  setupTtsKeyHandlers({ elements, STORAGE_KEYS, encryptApiKey: encrypt, maskApiKey: () => '********',
    showToast: toast, logError: vi.fn(), t: async key => key });
});
afterEach(() => vi.unstubAllGlobals());

it('saves the inline key to the existing encrypted OpenAI slot and leaves the DeepSeek draft alone', async () => {
  elements.apiProviderSelect.value = 'deepseek';
  elements.apiKey.dataset.provider = 'deepseek';
  elements.apiKey.value = 'sk-synthetic-article';
  elements.openaiImageKey.value = 'sk-synthetic-image';
  elements.saveOpenaiImageKey.click();
  await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('apiKeySaved', 'success', { key: 'apiKeySaved' }));
  expect(encrypt).toHaveBeenCalledExactlyOnceWith('sk-synthetic-image');
  expect(set).toHaveBeenCalledExactlyOnceWith({ openai_api_key: 'ENC:sample' });
  changed({ openai_api_key: { newValue: 'ENC:sample' } }, 'local');
  expect(elements.openaiImageKey.value).toBe('********');
  expect(elements.openaiImageKey.type).toBe('password');
  expect(elements.apiProviderSelect.value).toBe('deepseek');
  expect(elements.apiKey.value).toBe('sk-synthetic-article');
  expect(elements.apiKey.dataset.provider).toBe('deepseek');
});

it('rejects malformed inline OpenAI values without touching storage', async () => {
  for (const value of ['sk-invalid whitespace', 'wrong-prefix', 'sk-']) {
    toast.mockClear();
    elements.openaiImageKey.value = value;
    elements.saveOpenaiImageKey.click();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('invalidOpenAiKeyFormat', 'error', { key: 'invalidOpenAiKeyFormat' }));
  }
  expect(encrypt).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
});

it.each([['openai', 'openai_api_key', 'openaiImageKey']])(
  'mirrors stored %s keys without revealing them or replacing either unfinished draft',
  (provider, key, field) => {
    shared.restore({ [key]: 'ENC:original' });
    const media = elements[field];
    expect(media.type).toBe('password');
    expect(media.value).toBe('********');
    media.setSelectionRange(4, 4);
    media.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 's' }));
    expect(media.selectionStart).toBe(0);
    expect(media.selectionEnd).toBe(8);

    elements.apiProviderSelect.value = provider;
    elements.apiKey.dataset.provider = provider;
    elements.apiKey.value = 'sk-synthetic-revealed';
    elements.apiKey.dataset.decrypted = elements.apiKey.value;
    elements.apiKey.type = 'text';
    elements.toggleApiKey.setAttribute('aria-pressed', 'true');
    changed({ [key]: { newValue: 'ENC:updated' } }, 'local');
    expect(elements.apiKey.value).toBe('********');
    expect(elements.apiKey.type).toBe('password');
    expect(elements.apiKey.dataset.decrypted).toBeUndefined();
    expect(elements.apiKey.dataset.encrypted).toBe('ENC:updated');
    expect(elements.toggleApiKey.getAttribute('aria-pressed')).toBe('false');

    media.value = 'sk-synthetic-media-draft';
    elements.apiKey.value = 'sk-synthetic-article-draft';
    changed({ [key]: { newValue: 'ENC:concurrent' } }, 'local');
    expect(media.value).toBe('sk-synthetic-media-draft');
    expect(elements.apiKey.value).toBe('sk-synthetic-article-draft');
    media.value = '********';
    changed({ [key]: {} }, 'local');
    expect(media.value).toBe('');
  }
);

it.each([
  ['openrouterImageKey', 'saveOpenrouterImageKey', 'openrouter_image_api_key', 'openrouterTtsKey'],
  ['openrouterTtsKey', 'saveOpenrouterTtsKey', 'openrouter_tts_api_key', 'openrouterImageKey']
])('saves %s independently from the article and other media field', async (field, button, storageKey, other) => {
  shared.restore({ openrouter_api_key: 'ENC:article', openrouter_tts_api_key: 'ENC:speech', openrouter_image_api_key: 'ENC:image' });
  elements.apiProviderSelect.value = 'openrouter';
  elements.apiKey.dataset.provider = 'openrouter';
  elements.apiKey.value = 'sk-synthetic-article-draft';
  elements[other].value = 'sk-synthetic-unrelated-draft';
  elements[field].value = 'sk-synthetic-media-replacement';
  elements[button].click();
  await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('apiKeySaved', 'success', { key: 'apiKeySaved' }));
  expect(encrypt).toHaveBeenCalledExactlyOnceWith('sk-synthetic-media-replacement');
  expect(set).toHaveBeenCalledExactlyOnceWith({ [storageKey]: 'ENC:sample' });
  changed({ [storageKey]: { newValue: 'ENC:sample' } }, 'local');
  expect(elements[field].value).toBe('********');
  expect(elements[field].type).toBe('password');
  expect(elements[other].value).toBe('sk-synthetic-unrelated-draft');
  expect(elements.apiKey.value).toBe('sk-synthetic-article-draft');
});
