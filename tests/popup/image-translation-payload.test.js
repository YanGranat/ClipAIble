// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { initProcessing } from '../../popup/core/processing.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { t } from '../../scripts/locales.js';

let elements, processing, decrypt, toast;
beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  elements.languageSelect.value = 'fr'; elements.translateImages.checked = true;
  elements.imageTranslationProvider.value = 'openai'; elements.modeSelect.value = 'automatic';
  elements.apiProviderSelect.value = 'claude'; elements.apiKey.value = 'synthetic-claude-key'; elements.apiKey.dataset.provider = 'claude';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en', openai_api_key: 'synthetic-saved-openai-key' });
  chrome.tabs.query = vi.fn(async () => [{ id: 1, url: 'https://example.test/article', title: 'Sample article' }]);
  chrome.tabs.sendMessage = vi.fn(async () => ({ html: '<article>Sample article</article>', url: 'https://example.test/article', title: 'Sample article' }));
  chrome.runtime.sendMessage.mockResolvedValue({ started: true });
  decrypt = vi.fn(async value => value);
  toast = vi.fn();
  const noop = vi.fn();
  processing = initProcessing({ elements, t, log: noop, logError: noop, logWarn: noop, showToast: toast, setStatus: noop,
    setProgress: noop, stopTimerDisplay: noop, decryptApiKey: decrypt, getProviderFromModel: () => 'openai',
    startStatePolling: noop, checkProcessingState: async () => {}, stateRefs: {} });
});
const packet = () => chrome.runtime.sendMessage.mock.calls.find(([value]) => value.action === 'processArticle')?.[0]?.data;

it.each(['elevenlabsApiKey', 'googleTtsApiKey', 'qwenApiKey', 'respeecherApiKey'])('dispatches the current %s speech draft without requiring a save', async field => {
  elements.mainFormatSelect.value = 'audio';
  elements[field].value = 'synthetic-unsaved-speech-key';
  elements[field].dataset.encrypted = 'ENC:v2:stale-ciphertext';
  await processing.handleSavePdf();
  expect(packet()?.[field]).toBe('synthetic-unsaved-speech-key');
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('uses the saved OpenAI image key while article processing stays with Claude', async () => {
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'claude', apiKey: 'synthetic-claude-key', imageTranslationProvider: 'openai', imageApiKey: 'synthetic-saved-openai-key', translateImages: true });
});

it.each([['openai', 'synthetic-openai-draft'], ['claude', 'synthetic-saved-openai-key']])('accepts an OpenAI draft only with its %s input owner', async (owner, expected) => {
  elements.apiProviderSelect.value = 'openai'; elements.apiKey.dataset.provider = owner; elements.apiKey.value = 'synthetic-openai-draft';
  await processing.handleSavePdf();
  expect(packet()?.imageApiKey).toBe(expected);
  expect(packet()?.apiKey).toBe(expected);
});

it('does not send an OpenAI draft to the Claude article endpoint when the field is unowned', async () => {
  elements.apiKey.value = 'synthetic-openai-draft'; elements.apiKey.dataset.provider = 'openai';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en', claude_api_key: 'synthetic-saved-claude-key', openai_api_key: 'synthetic-saved-openai-key' });
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'claude', apiKey: 'synthetic-saved-claude-key', imageApiKey: 'synthetic-saved-openai-key' });
});

it('abandons a captured article provider when its key read resolves after a provider change', async () => {
  let entered = false, release;
  elements.apiKey.dataset.provider = 'openai';
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys.includes('claude_api_key')) { entered = true; await new Promise(resolve => { release = resolve; }); return { claude_api_key: 'synthetic-claude-key' }; }
    return { ui_language: 'en' };
  });
  const pending = processing.handleSavePdf();
  await vi.waitFor(() => expect(entered).toBe(true));
  elements.apiProviderSelect.value = 'openai';
  release(); await pending;
  expect(packet()).toBeUndefined();
});

it('presents a typed saved-key read failure without sending a processing request', async () => {
  elements.apiKey.dataset.provider = 'openai';
  chrome.storage.local.get.mockRejectedValue(new Error('Synthetic storage failure'));
  await expect(processing.handleSavePdf()).resolves.toBeUndefined();
  expect(packet()).toBeUndefined();
  expect(toast).toHaveBeenCalledWith(expect.any(String), 'error', { key: 'errorApiKeyRead', params: {} });
});

it('retains the Gemini image key path and editor choice', async () => {
  elements.imageTranslationProvider.value = 'gemini';
  elements.geminiImageModel.value = 'gemini-nano-banana-2.1';
  elements.googleApiKey.value = 'synthetic-google-key';
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ imageTranslationProvider: 'gemini', geminiImageModel: 'gemini-nano-banana-2.1', imageApiKey: 'synthetic-google-key', googleApiKey: 'synthetic-google-key', translateImages: true });
});

it('captures the selected Google editor before loading the active page', async () => {
  elements.imageTranslationProvider.value = 'gemini';
  elements.geminiImageModel.value = 'gemini-3.1-flash-lite-image';
  elements.googleApiKey.value = 'synthetic-google-key';
  const readPage = chrome.tabs.sendMessage.getMockImplementation();
  chrome.tabs.sendMessage.mockImplementation(async (...args) => {
    elements.geminiImageModel.value = 'gemini-nano-banana-2.1';
    return readPage(...args);
  });
  await processing.handleSavePdf();
  expect(packet()?.geminiImageModel).toBe('gemini-3.1-flash-lite-image');
});

it.each(['markdown', 'audio'])('does not request image editing for a hidden %s workflow', async format => {
  elements.mainFormatSelect.value = format;
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ translateImages: false, imageApiKey: '' });
});
