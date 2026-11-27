// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { initProcessing } from '../../popup/core/processing.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { t } from '../../scripts/locales.js';
import { initOpenRouterMedia } from '../../popup/settings/openrouter-media.js';

let elements, processing, decrypt, toast;
beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  elements.languageSelect.value = 'fr'; elements.translateImages.checked = true;
  elements.imageTranslationProvider.value = 'openai'; elements.modeSelect.value = 'automatic';
  elements.apiProviderSelect.value = 'claude'; elements.apiKey.value = 'synthetic-claude-key'; elements.apiKey.dataset.provider = 'claude';
  elements.modelSelect.replaceChildren(new Option('Example model', 'example-model'));
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

it.each([['elevenlabsApiKey','elevenlabs'], ['googleTtsApiKey','google'], ['qwenApiKey','qwen'], ['respeecherApiKey','respeecher']])('dispatches the current %s speech draft without requiring a save', async (field, provider) => {
  elements.mainFormatSelect.value = 'audio';
  elements.audioProvider.value = provider;
  elements.qwenWorkspaceId.value = 'example-workspace';
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

it('keeps an inline OpenAI key separate from another text provider and from storage until saved', async () => {
  elements.openaiImageKey.value = 'sk-synthetic-image-draft';
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'claude', apiKey: 'synthetic-claude-key', imageApiKey: 'sk-synthetic-image-draft' });
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it.each([
  ['sk-synthetic-image-draft', 'sk-synthetic-image-draft'],
  ['********', 'synthetic-saved-openai-key']
])('does not send the article draft for images with an independent %s field', async (imageValue, expected) => {
  elements.apiProviderSelect.value = 'openai';
  elements.apiKey.dataset.provider = 'openai';
  elements.apiKey.value = 'sk-synthetic-article-draft';
  elements.openaiImageKey.value = imageValue;
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ apiKey: 'sk-synthetic-article-draft', imageApiKey: expected });
});

it.each([
  ['invalid-key', { key: 'invalidOpenAiKeyFormat', params: {} }],
  ['********', { key: 'errorImageKeyRequired', params: { provider: 'OpenAI' } }]
])('blocks an unusable inline OpenAI key (%s) even when the article key is ready', async (value, error) => {
  elements.openaiImageKey.value = value;
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  await processing.handleSavePdf();
  expect(packet()).toBeUndefined();
  expect(toast).toHaveBeenCalledWith(expect.any(String), 'error', error);
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

it('routes OpenRouter image editing with its own key and model while Claude handles text', async () => {
  initOpenRouterMedia(elements, vi.fn()).restore({ openrouter_image_model: 'openai/gpt-image-2.6-sunburst' });
  elements.imageTranslationProvider.value = 'openrouter';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en', openrouter_image_api_key: 'ENC:synthetic-openrouter-key' });
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'claude', apiKey: 'synthetic-claude-key', googleApiKey: '',
    imageTranslationProvider: 'openrouter', openrouterImageModel: 'openai/gpt-image-2.6-sunburst',
    imageApiKey: 'ENC:synthetic-openrouter-key' });
  expect(packet()).not.toHaveProperty('openrouterTtsApiKey');
});

it('uses the OpenRouter speech draft and preserves the text key and separate Google voice', async () => {
  initOpenRouterMedia(elements, vi.fn()).restore({ openrouter_tts_model: 'google/gemini-3.8-flash-lite-tts', openrouter_tts_voice: 'Kore' });
  elements.mainFormatSelect.value = 'audio';
  elements.audioProvider.value = 'openrouter';
  elements.openrouterTtsKey.value = 'synthetic-openrouter-draft';
  elements.googleTtsVoice.value = 'Zephyr';
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'claude', apiKey: 'synthetic-claude-key', audioProvider: 'openrouter',
    openrouterTtsApiKey: 'synthetic-openrouter-draft', openrouterTtsModel: 'google/gemini-3.8-flash-lite-tts',
    openrouterTtsVoice: 'Kore', googleTtsVoice: 'Zephyr', translateImages: false, imageApiKey: '' });
});

it('captures the OpenRouter speech controls before awaiting export prerequisites', async () => {
  initOpenRouterMedia(elements, vi.fn()).restore({ openrouter_tts_model: 'google/gemini-3.8-flash-lite-tts', openrouter_tts_voice: 'Kore' });
  elements.mainFormatSelect.value = 'audio';
  elements.audioProvider.value = 'openrouter';
  elements.openrouterTtsKey.value = 'synthetic-openrouter-draft';
  const instructions = document.getElementById('openrouterTtsInstructions');
  instructions.value = 'Keep a measured pace.';
  const pending = processing.handleSavePdf();
  instructions.value = 'Read faster.';
  await pending;
  expect(packet()?.openrouterTtsOptions).toEqual({ instructions: 'Keep a measured pace.' });
});

it('exposes model-specific voice labels and dispatches the exact selected voice ID', async () => {
  const save = vi.fn();
  initOpenRouterMedia(elements, save).restore({ openrouter_tts_model: 'google/gemini-3.8-flash-lite-tts', openrouter_tts_voice: 'Kore' });
  elements.mainFormatSelect.value = 'audio';
  elements.audioProvider.value = 'openrouter';
  elements.openrouterTtsKey.value = 'synthetic-openrouter-draft';
  elements.openrouterTtsModel.value = 'mistralai/voxtral-mini-tts-3-0';
  elements.openrouterTtsModel.dispatchEvent(new Event('change'));
  expect(elements.openrouterTtsVoice.value).toBe('voice_3150');
  expect(elements.openrouterTtsVoice.querySelector('[value="Kore"]')).toBeNull();
  const tatiana = elements.openrouterTtsVoice.querySelector('[value="voice_3132"]');
  expect(tatiana.textContent).toBe('Tatiana (ru)');
  elements.openrouterTtsVoice.value = tatiana.value;
  elements.openrouterTtsVoice.dispatchEvent(new Event('change'));
  expect(save).toHaveBeenCalledWith('openrouter_tts_model', 'mistralai/voxtral-mini-tts-3-0');
  expect(save).toHaveBeenCalledWith('openrouter_tts_voice', 'voice_3132');
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({
    openrouterTtsModel: 'mistralai/voxtral-mini-tts-3-0', openrouterTtsVoice: 'voice_3132'
  });
});

it('does not start an OpenRouter speech export with only another provider key or a display mask', async () => {
  elements.mainFormatSelect.value = 'audio';
  elements.audioProvider.value = 'openrouter';
  elements.openrouterTtsKey.value = '********';
  elements.googleTtsApiKey.value = 'synthetic-google-key';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en',
    openrouter_api_key: 'synthetic-text-key', openrouter_image_api_key: 'synthetic-image-key' });
  await processing.handleSavePdf();
  expect(packet()).toBeUndefined();
  expect(toast).toHaveBeenCalledWith(expect.any(String), 'error',
    { key: 'errorAudioApiKeyRequired', params: { provider: 'OpenRouter' } });
});

it.each([
  ['pdf', 'openrouter_image_api_key', 'imageApiKey'],
  ['audio', 'openrouter_tts_api_key', 'openrouterTtsApiKey']
])('routes %s with separately saved credentials even when both services use OpenRouter', async (format, key, field) => {
  initOpenRouterMedia(elements, vi.fn()).restore({});
  elements.apiProviderSelect.value = 'openrouter';
  elements.apiKey.dataset.provider = 'openrouter';
  elements.apiKey.value = 'sk-synthetic-article-draft';
  elements.mainFormatSelect.value = format;
  elements.imageTranslationProvider.value = 'openrouter';
  elements.audioProvider.value = 'openrouter';
  elements.openrouterImageKey.value = '********';
  elements.openrouterTtsKey.value = '********';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en', [key]: 'ENC:synthetic-owned-key',
    openrouter_api_key: 'ENC:synthetic-old-text-key' });
  await processing.handleSavePdf();
  expect(packet()).toMatchObject({ provider: 'openrouter', apiKey: 'sk-synthetic-article-draft', [field]: 'ENC:synthetic-owned-key' });
  expect(chrome.storage.local.get).toHaveBeenCalledWith([key]);
  expect(chrome.storage.local.get).not.toHaveBeenCalledWith(['openrouter_api_key']);
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
