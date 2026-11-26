// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initUI } from '../../popup/ui.js';
import { UI_LOCALES, tSync, formatMessage, getLocaleTag } from '../../scripts/locales.js';
import { t } from '../../scripts/locales.js';
import { initKeyTheses } from '../../popup/core/key-theses.js';
import { initSummary } from '../../popup/core/summary.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { initState } from '../../popup/core/state.js';
import { formatRelativeDate } from '../../popup/utils/format-helpers.js';
import { formatModelLabel, normalizeModelSelection } from '../../scripts/utils/model-catalog.js';

let language;
let ui;
let elements;
beforeEach(() => {
  language = 'en';
  document.documentElement.lang = 'en';
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({ ui_language: language })) } }, i18n: { getUILanguage: () => 'en' } });
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 0; });
  document.body.innerHTML = `
    <span id="statusDot"></span><span id="statusText" data-i18n="ready">Ready</span>
    <select id="uiLanguageSelect"><option value="en">EN</option><option value="ru">RU</option><option value="ua">UA</option></select>
    <span id="saveText" data-i18n="save"></span>
    <input id="voiceInput" data-i18n-placeholder="voiceUnavailable" data-i18n-params='{"voice":"sample-voice"}'>
    <button id="voiceAction" data-i18n-title="voiceUnavailable" data-i18n-aria-label="voiceUnavailable" data-i18n-params='{"voice":"sample-voice"}'></button>
    <select id="voice"><option value="legacy-voice" data-i18n="voiceUnavailable" data-i18n-params='{"voice":"sample-voice"}'></option></select>`;
  elements = Object.fromEntries(['statusDot', 'statusText', 'uiLanguageSelect', 'saveText'].map(id => [id, document.getElementById(id)]));
  ui = initUI({ elements, formatTime: () => '00:01', startTimerDisplay: vi.fn(), currentStartTime: { current: null }, timerInterval: { current: null } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live localized messages', () => {
  it('keeps the visible error and translates it on language change', async () => {
    ui.setStatus('error', tSync('errorApiKeyInvalid', 'en'), null, { key: 'errorApiKeyInvalid' });
    language = 'ru';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toBe(UI_LOCALES.ru.errorApiKeyInvalid);
    expect(elements.statusDot.classList.contains('error')).toBe(true);
  });

  it('tracks the latest error type through unrelated refreshes', async () => {
    ui.setStatus('error', tSync('errorApiKeyInvalid', 'en'), null, { key: 'errorApiKeyInvalid' });
    ui.setStatus('error', tSync('errorNetwork', 'en'), null, { key: 'errorNetwork' });
    await ui.applyLocalization();
    language = 'ru';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toBe(UI_LOCALES.ru.errorNetwork);
  });

  it('preserves an untyped service error instead of replacing it with Ready', async () => {
    ui.setStatus('error', 'Sample service failure');
    language = 'ru';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toBe('Sample service failure');
  });

  it('translates a visible toast without restarting its lifetime', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    ui.showToast(tSync('copyFailed', 'en'), 'error', { key: 'copyFailed' });
    await vi.advanceTimersByTimeAsync(1500);
    language = 'ru';
    await ui.applyLocalization();
    expect(document.querySelector('.toast').textContent).toBe(UI_LOCALES.ru.copyFailed);
    await vi.advanceTimersByTimeAsync(1499);
    expect(document.querySelector('.toast')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('formats dynamic options, placeholders and accessible descriptions without changing values', async () => {
    language = 'ru';
    await ui.applyLocalization();
    const expected = formatMessage('voiceUnavailable', 'ru', { voice: 'sample-voice' });
    expect(document.querySelector('#voice option').textContent).toBe(expected);
    expect(document.querySelector('#voice').value).toBe('legacy-voice');
    expect(document.querySelector('#voiceInput').placeholder).toBe(expected);
    expect(document.querySelector('#voiceAction').getAttribute('aria-label')).toBe(expected);
    expect(document.querySelector('#voiceAction').title).toBe(expected);
  });

  it('uses Ukrainian HTML language metadata while preserving the stored selection code', async () => {
    language = 'ua';
    await ui.applyLocalization();
    expect(document.documentElement.lang).toBe('uk');
    expect(elements.uiLanguageSelect.value).toBe('ua');
  });

  it('does not let a late language read overwrite a newer language render', async () => {
    let release;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const oldRender = ui.applyLocalization();
    language = 'ru';
    await ui.applyLocalization();
    release({ ui_language: 'en' });
    await oldRender;
    expect(elements.saveText.textContent).toBe(UI_LOCALES.ru.save);
    expect(document.documentElement.lang).toBe('ru');
  });

  it('translates every part of a count-bearing toast without interpreting text as markup', async () => {
    const parts = [{ key: 'importSettingsCount', params: { count: 1 } }, { text: '; ' }, { key: 'warningImportValue', params: { setting: '<sample>' } }];
    ui.showToast('Import result', 'warning', { parts });
    language = 'ru';
    await ui.applyLocalization();
    const toast = document.querySelector('.toast');
    expect(toast.textContent).toBe('Импортирован 1 параметр; Пропущен параметр с неверным значением: <sample>.');
    expect(toast.querySelector('sample')).toBeNull();
  });

  it('preserves the key-claims cancel action when the language changes during generation', async () => {
    const button = document.createElement('button');
    button.dataset.i18n = 'generateKeyTheses';
    elements.generateKeyThesesBtn = button;
    document.body.appendChild(button);
    chrome.storage.local.get.mockImplementation(async keys => keys.includes('key_theses_generating') ? { key_theses_generating: true } : { ui_language: language });
    const module = initKeyTheses({ elements, STORAGE_KEYS: { KEY_THESES_GENERATING: 'key_theses_generating' }, t, getUILanguage: async () => language, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), showToast: vi.fn() });
    await module.checkKeyThesesStatus();
    const cancel = button.querySelector('.key-theses-cancel');
    expect(cancel).not.toBeNull();
    language = 'ru';
    await ui.applyLocalization();
    expect(button.querySelector('.key-theses-cancel')).toBe(cancel);
    expect(button.querySelector('.key-theses-generating-text').textContent).toBe(UI_LOCALES.ru.generatingKeyTheses);
    expect(cancel.title).toBe(UI_LOCALES.ru.cancel);
    expect(button.disabled).toBe(false);
  });

  it('retains a specific terminal error descriptor instead of reducing it to an error category', async () => {
    elements.savePdfBtn = document.createElement('button');
    elements.cancelBtn = document.createElement('button');
    const state = initState({ elements, t, setStatus: ui.setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(), startTimerDisplay: vi.fn(), stateRefs: {}, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });
    await state.updateUIFromState({ error: 'Saved voice is unavailable', errorCode: 'validation_error', errorTranslationKey: 'errorOpenaiVoiceUnavailable', errorTranslationParams: { voice: 'sample-voice' } });
    language = 'de';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toBe(formatMessage('errorOpenaiVoiceUnavailable', 'de', { voice: 'sample-voice' }));
  });

  it('retranslates the saved format when the interface language changes', async () => {
    elements.savePdfBtn = document.createElement('button');
    const state = initState({ elements, t, setStatus: ui.setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(), stateRefs: {} });
    await state.updateUIFromState({ isProcessing: false, statusTranslationKey: 'statusDone', outputFormat: 'audio' });
    expect(elements.statusText.textContent).toBe('Ready: Audio');

    language = 'ru';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toBe(formatMessage('notificationReady', 'ru', { format: UI_LOCALES.ru.formatAudio }));
  });

  it('keeps parameterized progress more specific than its generic stage', async () => {
    elements.savePdfBtn = document.createElement('button');
    elements.cancelBtn = document.createElement('button');
    const state = initState({ elements, t, setStatus: ui.setStatus, setProgress: vi.fn(), stopTimerDisplay: vi.fn(), startTimerDisplay: vi.fn(), stateRefs: {}, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });
    await state.updateUIFromState({ isProcessing: true, currentStage: 'generating', status: 'Generating', statusTranslationKey: 'statusGeneratingAudioChunks', statusTranslationParams: { current: 2, total: 7 } });
    language = 'ru';
    await ui.applyLocalization();
    expect(elements.statusText.textContent).toContain(formatMessage('statusGeneratingAudioChunks', 'ru', { current: 2, total: 7 }));
    expect(elements.statusDot.classList.contains('processing')).toBe(true);
  });
});

describe('translation parameters and language tags', () => {
  it('accepts Ukrainian BCP47 aliases without renaming stored language IDs', () => {
    expect(tSync('settings', 'uk')).toBe(UI_LOCALES.ua.settings);
    expect(tSync('settings', 'uk-UA')).toBe(UI_LOCALES.ua.settings);
    expect(getLocaleTag('ua')).toBe('uk');
  });

  it('keeps parameter contents opaque and replaces repeated placeholders', () => {
    expect(formatMessage('voiceUnavailable', 'en', { voice: '<sample>&$1' })).toBe('<sample>&$1 (unavailable)');
    expect(tSync('unknown_translation_key', 'ru')).toBe('unknown_translation_key');
  });

  it('treats prototype property names as unknown keys', () => {
    expect(tSync('constructor', 'en')).toBe('constructor');
    expect(tSync('toString', 'ru')).toBe('toString');
  });

  it('uses the selected language for dates in both time directions', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const now = Date.now();
    expect(formatRelativeDate(now - 3600000, 'ru')).toBe('1 час назад');
    expect(formatRelativeDate(now + 7200000, 'de')).toBe('in 2 Stunden');
    expect(formatRelativeDate(new Date('invalid'), 'ru')).toBe('');
  });

  it('uses cardinal forms instead of joining every count to the same plural label', () => {
    expect([1, 2, 5, 21].map(count => formatMessage('domainsCached', 'ru', { count }))).toEqual(['домен в кэше', 'домена в кэше', 'доменов в кэше', 'домен в кэше']);
    expect(formatMessage('importSettingsCount', 'en', { count: 1 })).toBe('Imported 1 setting');
    expect(formatMessage('importSettingsCount', 'en', { count: 2 })).toBe('Imported 2 settings');
    expect(formatMessage('statusRenderingPdfPages', 'en', { count: 1, pages: 1 })).toBe('Rendering 1 PDF page...');
  });

  it('keeps provider reasoning annotations in English and arbitrary IDs literal', () => {
    const translate = (key, params) => tSync(key, 'ru', params);
    expect(formatModelLabel('openai', 'gpt-6.1-sol-high', translate)).toBe('gpt-6.1-sol (reasoning: high)');
    expect(formatModelLabel('openai', 'sample-model-high', translate)).toBe('sample-model-high');
  });

  it.each(Object.keys(UI_LOCALES))('round-trips the same API ID and reasoning annotation in %s', locale => {
    const translate = (key, params) => tSync(key, locale, params);
    const selection = 'example-vendor/custom-model (reasoning: xhigh)';
    const label = formatModelLabel('openrouter', selection, translate);
    expect(label).toBe(selection);
    expect(normalizeModelSelection('openrouter', label, translate)).toBe(selection);
    expect(translate('addModelPrompt')).toContain('(reasoning: high)');
    expect(translate('errorModelReasoningInvalid')).toContain('(reasoning: high)');
  });
});

describe('independent generation errors', () => {
  const cases = [
    ['summary', 'Summary', initSummary],
    ['key claims', 'KeyTheses', initKeyTheses]
  ];

  function prepareGeneration(suffix, init, isVideo, failure) {
    const url = isVideo ? 'https://www.youtube.com/watch?v=sample-video' : 'https://example.test/observations';
    const article = { url, title: 'River observations', html: '<main><h1>River observations</h1><p>Water slows near the bank.</p></main>' };
    Object.assign(elements, {
      [`generate${suffix}Btn`]: document.createElement('button'),
      [suffix === 'Summary' ? 'summaryContainer' : 'keyThesesContainer']: document.createElement('section'),
      modelSelect: { value: 'sample-model', dataset: { provider: 'openai' } },
      apiProviderSelect: { value: 'openai' },
      apiKey: { value: 'synthetic-key', dataset: { provider: 'openai' } },
      modeSelect: { value: 'selector' },
      useCache: { checked: false }
    });
    chrome.tabs = { query: vi.fn(async () => [{ id: 1, url, title: article.title }]), sendMessage: vi.fn(async () => ({ success: true })) };
    chrome.scripting = { executeScript: vi.fn(async () => [{ result: article }]) };
    chrome.runtime = { sendMessage: vi.fn(async ({ action }) => action === 'extractYouTubeSubtitlesForSummary'
      ? { success: true, result: { subtitles: [{ text: 'Water slows near the bank.' }] } }
      : failure) };
    const deps = { elements, STORAGE_KEYS, t, getUILanguage: async () => language, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(),
      showToast: ui.showToast, detectVideoPlatform: () => isVideo ? { platform: 'youtube' } : null };
    return init(deps)[`handleGenerate${suffix}`]();
  }

  for (const [name, suffix, init] of cases) {
    it.each([false, true])(`retains a typed ${name} failure after language changes (video=%s)`, async video => {
      language = 'ru';
      await ui.applyLocalization();
      await prepareGeneration(suffix, init, video, { error: 'Synthetic diagnostics', translationKey: 'errorApiError', translationParams: { status: 503 } });
      const toast = document.querySelector('.toast');
      expect(toast.dataset.i18n).toBe('errorApiError');
      expect(toast.textContent).toBe(tSync('errorApiError', 'ru', { status: 503 }));
      language = 'ua';
      await ui.applyLocalization();
      expect(toast.textContent).toBe(tSync('errorApiError', 'ua', { status: 503 }));
      expect(toast.textContent).not.toContain('Synthetic diagnostics');
    });
  }

  it('uses a key-claims error instead of a summary error when generation is not admitted', async () => {
    language = 'ru';
    await ui.applyLocalization();
    await prepareGeneration('KeyTheses', initKeyTheses, true, { started: false });
    const toast = document.querySelector('.toast');
    expect(toast.dataset.i18n).toBe('keyThesesGenerationError');
    expect(toast.textContent).toBe(tSync('keyThesesGenerationError', 'ru'));
  });
});
