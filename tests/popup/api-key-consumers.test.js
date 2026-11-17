// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initSummary } from '../../popup/core/summary.js';
import { initKeyTheses } from '../../popup/core/key-theses.js';
import { setupApiKeyToggle, setupAllApiKeyToggles } from '../../popup/handlers/api-keys.js';
import { initApiKeys } from '../../popup/settings/api-keys.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { resolveProviderApiKey } from '../../popup/utils/settings-helpers.js';

let elements, deps, store;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => operation() } });
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  elements.apiProviderSelect.value = 'openai';
  elements.modelSelect.add(new Option('Sample model', 'sample-model'));
  elements.modelSelect.value = 'sample-model';
  elements.apiKey.value = 'sk-ant-synthetic-foreign-key';
  elements.apiKey.dataset.provider = 'claude';
  store = { ui_language: 'en', openai_api_key: 'sk-synthetic-openai-key' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, store[key]])));
  chrome.tabs.query = vi.fn(async () => [{ id: 7, url: 'https://example.test/article', title: 'Sample article' }]);
  chrome.tabs.sendMessage = vi.fn(async () => ({ success: true }));
  chrome.scripting.executeScript.mockResolvedValue([{ result: { html: '<article>Sample article</article>', url: 'https://example.test/article' } }]);
  chrome.runtime.sendMessage.mockImplementation(async message => message.action === 'extractYouTubeSubtitlesForSummary'
    ? { result: { subtitles: [{ text: 'Sample explanation.' }] } }
    : { success: true, started: true, extracting: true, generationId: 'sample-generation' });
  const noop = vi.fn();
  deps = { elements, STORAGE_KEYS, t: async key => key, getUILanguage: async () => 'en',
    log: noop, logWarn: noop, logError: noop, showToast: vi.fn(), decryptApiKey: vi.fn(async value => value),
    getProviderFromModel: () => 'openai', detectVideoPlatform: () => null,
    markdownToHtmlFn: text => text, sanitizeMarkdownHtml: text => text, CONFIG: {} };
});

for (const [name, initialize, method] of [
  ['summary', initSummary, 'handleGenerateSummary'],
  ['key claims', initKeyTheses, 'handleGenerateKeyTheses']
]) {
  for (const video of [false, true]) {
    it(`${name} uses its own saved key for ${video ? 'video' : 'article'} content when the draft belongs to another provider`, async () => {
      if (video) deps.detectVideoPlatform = () => ({ platform: 'youtube' });
      await initialize(deps)[method]();
      const requests = chrome.runtime.sendMessage.mock.calls.map(([message]) => message).filter(message => message.data?.apiKey);
      expect(requests).toHaveLength(1);
      expect(requests[0].data).toMatchObject({ provider: 'openai', apiKey: 'sk-synthetic-openai-key', model: 'sample-model' });
      expect(deps.decryptApiKey).toHaveBeenCalledWith('sk-synthetic-openai-key', 'openai');
    });
  }

  it(`${name} abandons its captured provider when it changes during key decryption`, async () => {
    let release, entered = false;
    elements.apiKey.value = '****'; elements.apiKey.dataset.provider = 'openai'; elements.apiKey.dataset.encrypted = 'ENC:sample';
    deps.decryptApiKey.mockImplementation(async () => { entered = true; await new Promise(resolve => { release = resolve; }); return 'sk-synthetic-openai-key'; });
    const pending = initialize(deps)[method]();
    await vi.waitFor(() => expect(entered).toBe(true));
    elements.apiProviderSelect.value = 'claude';
    release(); await pending;
    expect(chrome.runtime.sendMessage.mock.calls.some(([message]) => message.data?.apiKey)).toBe(false);
  });

  it(`${name} rechecks its captured provider immediately before dispatch`, async () => {
    elements.apiKey.dataset.provider = 'openai'; elements.apiKey.value = 'sk-synthetic-openai-key';
    deps.getUILanguage = async () => { elements.apiProviderSelect.value = 'claude'; return 'en'; };
    await initialize(deps)[method]();
    expect(chrome.runtime.sendMessage.mock.calls.some(([message]) => message.data?.apiKey)).toBe(false);
  });

  it(`${name} does not dispatch an orphaned masked key without ciphertext`, async () => {
    elements.apiKey.dataset.provider = 'openai'; elements.apiKey.value = '****missing';
    await initialize(deps)[method]();
    expect(chrome.runtime.sendMessage.mock.calls.some(([message]) => message.data?.apiKey)).toBe(false);
    expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error', { key: 'pleaseEnterOpenAiApiKey' });
  });
}

it('does not let a pending key reveal overwrite the new provider field', async () => {
  let release;
  elements.apiKey.type = 'password'; elements.apiKey.value = '****old'; elements.apiKey.dataset.encrypted = 'ENC:old';
  const decrypt = vi.fn(() => new Promise(resolve => { release = resolve; }));
  setupApiKeyToggle(elements.toggleApiKey, elements.apiKey, decrypt, value => `****${value}`, vi.fn());
  elements.toggleApiKey.click();
  elements.apiKey.value = '****new'; elements.apiKey.dataset.provider = 'openai'; elements.apiKey.dataset.encrypted = 'ENC:new';
  release('sk-ant-synthetic-old-key');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(elements.apiKey.value).toBe('****new');
  expect(elements.apiKey.dataset.decrypted).toBeUndefined();
  expect(elements.apiKey.type).toBe('password');
});

it('does not save a foreign provider draft into the selected provider key slot', async () => {
  const api = initApiKeys({ elements, STORAGE_KEYS, showToast: vi.fn() });
  await api.saveApiKey();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('invalidates a pending reveal after switching away and restoring the same provider presentation', async () => {
  let release;
  elements.apiKey.type = 'password'; elements.apiKey.value = '****same'; elements.apiKey.dataset.provider = 'openai'; elements.apiKey.dataset.encrypted = 'ENC:same';
  setupAllApiKeyToggles(elements, () => new Promise(resolve => { release = resolve; }), value => `****${value}`, vi.fn());
  elements.toggleApiKey.click();
  elements.apiProviderSelect.value = 'claude'; elements.apiProviderSelect.dispatchEvent(new Event('change'));
  elements.apiKey.value = ''; delete elements.apiKey.dataset.provider; delete elements.apiKey.dataset.encrypted;
  elements.apiKey.value = '****other'; elements.apiKey.dataset.provider = 'claude'; elements.apiKey.dataset.encrypted = 'ENC:other';
  elements.apiProviderSelect.value = 'openai'; elements.apiProviderSelect.dispatchEvent(new Event('change'));
  elements.apiKey.value = ''; delete elements.apiKey.dataset.provider; delete elements.apiKey.dataset.encrypted;
  elements.apiKey.value = '****same'; elements.apiKey.dataset.provider = 'openai'; elements.apiKey.dataset.encrypted = 'ENC:same';
  release('sk-synthetic-openai-key');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(elements.apiKey.value).toBe('****same'); expect(elements.apiKey.type).toBe('password');
  expect(elements.apiKey.dataset.decrypted).toBeUndefined();
});

it('does not write a key after its selected provider changes during encryption', async () => {
  let release, entered = false;
  elements.apiKey.dataset.provider = 'openai'; elements.apiKey.value = 'sk-synthetic-openai-key';
  vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async () => {
    entered = true;
    await new Promise(resolve => { release = resolve; });
    return new ArrayBuffer(16);
  });
  const pending = initApiKeys({ elements, STORAGE_KEYS, showToast: vi.fn() }).saveApiKey();
  await vi.waitFor(() => expect(entered).toBe(true));
  elements.apiProviderSelect.value = 'claude'; elements.apiKey.dataset.provider = 'claude';
  release(); await pending;
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('keeps an edited unsaved draft usable after showing and hiding it', async () => {
  elements.apiKey.type = 'password'; elements.apiKey.dataset.provider = 'openai'; elements.apiKey.dataset.encrypted = 'ENC:old';
  const decrypt = vi.fn(async () => 'sk-synthetic-old-key');
  setupAllApiKeyToggles(elements, decrypt, value => `****${value.slice(-4)}`, vi.fn());
  elements.apiKey.value = 'sk-synthetic-new-key'; elements.apiKey.dispatchEvent(new Event('input'));
  elements.toggleApiKey.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  elements.toggleApiKey.click();
  expect(elements.apiKey.type).toBe('password');
  expect(await resolveProviderApiKey(elements.apiKey, 'openai', decrypt, deps.t)).toBe('sk-synthetic-new-key');
  expect(decrypt).not.toHaveBeenCalled();
  expect(elements.apiKey.dataset.decrypted).toBeUndefined();
  await initApiKeys({ elements, STORAGE_KEYS, showToast: vi.fn() }).saveApiKey();
  expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ openai_api_key: expect.stringMatching(/^ENC:/) }));
});

it('saves only the captured key slot when the provider changes while its storage lock is pending', async () => {
  let release, entered = false;
  navigator.locks.request = vi.fn(async (_name, operation) => { entered = true; await new Promise(resolve => { release = resolve; }); return operation(); });
  elements.apiKey.dataset.provider = 'openai'; elements.apiKey.value = 'sk-synthetic-openai-key';
  const pending = initApiKeys({ elements, STORAGE_KEYS, showToast: vi.fn() }).saveApiKey();
  await vi.waitFor(() => expect(entered).toBe(true));
  elements.apiProviderSelect.value = 'claude'; elements.apiKey.dataset.provider = 'claude';
  release(); await pending;
  const writes = chrome.storage.local.set.mock.calls.map(([values]) => values);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toHaveProperty('openai_api_key');
  expect(writes[0]).not.toHaveProperty('api_provider');
  expect(writes[0]).not.toHaveProperty('claude_api_key');
});
