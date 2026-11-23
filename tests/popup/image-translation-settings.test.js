// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initUIVisibility } from '../../popup/settings/ui-visibility.js';
import { setupFormatHandlers } from '../../popup/handlers/format.js';
import { initSettings } from '../../popup/settings.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { initCustomSelect } from '../../popup/utils/custom-select.js';
import { STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS } from '../../popup/constants.js';
import { getUILanguage, t, tSync } from '../../scripts/locales.js';
import { getImageTranslationModel } from '../../scripts/api/image-translation-catalog.js';
import { exportSettings, importSettings } from '../../scripts/settings/import-export.js';
import { clearUILanguageCache } from '../../scripts/utils/processing/pipeline-helpers.js';
import { getElement, setElementGroupDisplay } from '../../popup/utils/dom-helpers.js';
import { initUI } from '../../popup/ui.js';

let elements, stored, visibility;
afterEach(() => vi.unstubAllGlobals());
const group = (id, display) => setElementGroupDisplay(id, display, elements);
beforeEach(() => {
  clearUILanguageCache();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {};
  initializeDOMElements(elements);
  stored = { ui_language: 'en', api_provider: 'claude', output_format: 'pdf', pdf_language: 'fr', translate_images: true,
    use_selector_cache: true, enable_selector_caching: true, enable_statistics: true };
  chrome.storage.local.get.mockImplementation(async keys => keys === null ? structuredClone(stored) :
    Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, structuredClone(values)));
  elements.languageSelect.value = 'fr';
  elements.translateImages.checked = true;
  elements.apiProviderSelect.value = 'claude';
  visibility = initUIVisibility({ elements, getElement: id => getElement(id, elements),
    setElementGroupDisplay: group, setDisplayForIds: vi.fn(), hideAllAudioFields: vi.fn(), updateAudioProviderUI: vi.fn() });
});

it.each(['pdf', 'epub', 'fb2', 'markdown', 'audio'])('shows the image provider only for the enabled %s image workflow', async format => {
  elements.mainFormatSelect.value = format;
  await visibility.updateTranslationVisibility();
  expect(document.getElementById('imageTranslationProviderGroup').style.display).toBe(['pdf', 'epub', 'fb2'].includes(format) ? 'block' : 'none');
  expect(document.getElementById('geminiImageModelGroup').style.display).toBe(['pdf', 'epub', 'fb2'].includes(format) ? 'block' : 'none');
  expect(document.getElementById('geminiImageModelGroup').classList.contains('hidden')).toBe(!['pdf', 'epub', 'fb2'].includes(format));
  elements.translateImages.checked = false;
  await visibility.updateTranslationVisibility();
  expect(document.getElementById('geminiImageModelGroup').style.display).toBe('none');
  elements.translateImages.checked = true;
  elements.languageSelect.value = 'auto';
  await visibility.updateTranslationVisibility();
  expect(document.getElementById('translateImagesGroup').style.display).toBe('none');
  expect(document.getElementById('geminiImageModelGroup').style.display).toBe('none');
  expect(document.getElementById('googleApiGroup').style.display).toBe('none');
});

it('persists only the image-provider preference without changing article credentials or model choices', async () => {
  const saves = vi.fn();
  elements.apiKey.value = 'sample-article-key';
  elements.modelSelect.add(new Option('Sample article model', 'sample-article-model'));
  elements.modelSelect.value = 'sample-article-model';
  setupFormatHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: saves, deferAsyncWork: fn => fn(), settingsModule: visibility });
  elements.imageTranslationProvider.value = 'openai';
  elements.imageTranslationProvider.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesRequiresOpenAiKey'));
  expect(saves).toHaveBeenCalledExactlyOnceWith('image_translation_provider', 'openai');
  expect(elements.apiProviderSelect.value).toBe('claude');
  expect(elements.modelSelect.value).toBe('sample-article-model');
  expect(elements.apiKey.value).toBe('sample-article-key');
  expect(document.getElementById('googleApiGroup').style.display).toBe('none');
  expect(document.getElementById('geminiImageModelGroup').style.display).toBe('none');
  expect(document.getElementById('imageTranslationModelHint').textContent).toContain(getImageTranslationModel('openai'));
});

it('keeps Google model names in English and persists the selection from the visible dropdown', async () => {
  const saves = vi.fn();
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
  setupFormatHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: saves, deferAsyncWork: fn => fn(), settingsModule: visibility });
  const control = initCustomSelect('geminiImageModel');
  stored.ui_language = 'ru'; elements.uiLanguageSelect.value = 'ru';
  await visibility.updateTranslationVisibility();
  const ui = initUI({ elements, formatTime: () => '', startTimerDisplay: vi.fn(), currentStartTime: { current: null }, timerInterval: { current: null } });
  await ui.applyLocalization();
  const options = [...control.querySelectorAll('[role="option"]')];
  expect(options.map(option => option.textContent)).toEqual(['Gemini Nano Banana 2.1', 'Gemini 3.1 Flash Lite Image', 'Gemini 3 Pro Image']);
  expect(document.querySelector('label[for="geminiImageModel"]').textContent).toBe(tSync('imageTranslationModel', 'ru'));
  control.querySelector('[role="combobox"]').click();
  options[1].click();
  await vi.waitFor(() => expect(saves).toHaveBeenCalledExactlyOnceWith('gemini_image_model', 'gemini-3.1-flash-lite-image'));
  expect(control.querySelector('.custom-select-value').textContent).toBe('Gemini 3.1 Flash Lite Image');
});

it('requires the OpenAI key slot or a currently bound OpenAI draft instead of another provider key', async () => {
  elements.imageTranslationProvider.value = 'openai';
  elements.apiKey.value = 'synthetic-article-key';
  elements.apiKey.dataset.provider = 'claude';
  await visibility.updateTranslationVisibility();
  expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesRequiresOpenAiKey');
  elements.apiProviderSelect.value = 'openai';
  await visibility.updateTranslationVisibility();
  expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesRequiresOpenAiKey');
  elements.apiKey.dataset.provider = 'openai';
  await visibility.updateTranslationVisibility();
  expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesOpenAiHint');
  elements.apiProviderSelect.value = 'claude';
  stored.openai_api_key = 'synthetic-saved-openai-key';
  await visibility.updateTranslationVisibility();
  expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesOpenAiHint');
});

it('ignores an earlier missing-key response after the image provider changes', async () => {
  const original = chrome.storage.local.get.getMockImplementation();
  let entered = false, release;
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys.includes('google_api_key')) { entered = true; await new Promise(resolve => { release = resolve; }); return {}; }
    return original(keys);
  });
  const old = visibility.updateTranslationVisibility();
  await vi.waitFor(() => expect(entered).toBe(true));
  stored.openai_api_key = 'synthetic-saved-openai-key';
  elements.imageTranslationProvider.value = 'openai';
  await visibility.updateTranslationVisibility();
  release(); await old;
  expect(elements.translateImagesHint.dataset.i18n).toBe('translateImagesOpenAiHint');
  expect(elements.translateImagesHint.textContent).toBe(tSync('translateImagesOpenAiHint', 'en'));
});

it('keeps a visible missing-key hint translatable while its earlier storage read finishes', async () => {
  elements.imageTranslationProvider.value = 'openai';
  let waiting = false, release;
  const original = chrome.storage.local.get.getMockImplementation();
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys.includes('openai_api_key')) { waiting = true; await new Promise(resolve => { release = resolve; }); return {}; }
    return original(keys);
  });
  const pending = visibility.updateTranslationVisibility();
  await vi.waitFor(() => expect(waiting).toBe(true));
  stored.ui_language = 'ru'; elements.uiLanguageSelect.value = 'ru';
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
  const ui = initUI({ elements, formatTime: () => '', startTimerDisplay: vi.fn(), currentStartTime: { current: null }, timerInterval: { current: null } });
  await ui.applyLocalization();
  release(); await pending;
  expect(elements.translateImagesHint.textContent).toBe(tSync('translateImagesRequiresOpenAiKey', 'ru'));
  stored.ui_language = 'de'; elements.uiLanguageSelect.value = 'de';
  await ui.applyLocalization();
  expect(elements.translateImagesHint.textContent).toBe(tSync('translateImagesRequiresOpenAiKey', 'de'));
  expect(elements.imageTranslationProvider.value).toBe('openai');
});

it('restores the provider choice with the real settings facade and keeps Gemini as the unwritten default', async () => {
  const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS, debouncedSaveSettings: vi.fn(),
    showToast: vi.fn(), setCustomSelectValue: vi.fn(), getElement: id => getElement(id, elements),
    setElementDisplay: vi.fn(), setElementGroupDisplay: group, setDisplayForIds: vi.fn(), applyTheme: vi.fn(),
    markdownToHtml: value => value, audioVoiceMap: { current: {} }, t, getUILanguage });
  await settings.loadSettings();
  expect(elements.imageTranslationProvider.value).toBe('gemini');
  expect(stored.image_translation_provider).toBeUndefined();
  expect(elements.geminiImageModel.value).toBe('gemini-3-pro-image');
  expect(stored.gemini_image_model).toBeUndefined();
  const providerControl = initCustomSelect('imageTranslationProvider');
  const modelControl = initCustomSelect('geminiImageModel');
  const saved = vi.fn();
  setupFormatHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: saved, deferAsyncWork: fn => fn(), settingsModule: visibility });
  stored.image_translation_provider = 'openai';
  stored.gemini_image_model = 'gemini-nano-banana-2.1';
  await settings.loadSettings();
  expect(elements.imageTranslationProvider.value).toBe('openai');
  expect(providerControl.querySelector('.custom-select-value').textContent).toBe('OpenAI');
  expect(elements.geminiImageModel.value).toBe('gemini-nano-banana-2.1');
  expect(modelControl.querySelector('.custom-select-value').textContent).toBe('Gemini Nano Banana 2.1');
  expect(modelControl.querySelector('[aria-selected="true"]').dataset.value).toBe('gemini-nano-banana-2.1');
  expect(saved).not.toHaveBeenCalled();
});

it('round-trips the provider enum while excluding keys and rejecting an unsupported import value', async () => {
  stored.image_translation_provider = 'openai';
  stored.gemini_image_model = 'gemini-nano-banana-2.1';
  stored.openai_api_key = 'synthetic-openai-key'; stored.google_api_key = 'synthetic-google-key';
  const exported = JSON.parse(await exportSettings());
  expect(exported.settings.image_translation_provider).toBe('openai');
  expect(exported.settings.gemini_image_model).toBe('gemini-nano-banana-2.1');
  expect(exported.settings).not.toHaveProperty('openai_api_key');
  expect(exported.settings).not.toHaveProperty('google_api_key');
  stored.image_translation_provider = 'gemini';
  stored.gemini_image_model = 'gemini-3.1-flash-lite-image';
  await importSettings(JSON.stringify(exported), { overwriteExisting: true });
  expect(stored.image_translation_provider).toBe('openai');
  expect(stored.gemini_image_model).toBe('gemini-nano-banana-2.1');
  const invalid = await importSettings(JSON.stringify({ settings: { image_translation_provider: 'unsupported-provider', gemini_image_model: 'constructor' } }), { overwriteExisting: true });
  expect(invalid.settingsImported).toBe(0);
  expect(stored.image_translation_provider).toBe('openai');
  expect(stored.gemini_image_model).toBe('gemini-nano-banana-2.1');
  expect(stored.openai_api_key).toBe('synthetic-openai-key');
  expect(stored.google_api_key).toBe('synthetic-google-key');
});
