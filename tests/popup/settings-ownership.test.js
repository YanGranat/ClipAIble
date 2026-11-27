import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initSettings } from '../../popup/settings.js';
import { initSummary } from '../../popup/core/summary.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { DEFAULT_STYLES, STORAGE_KEYS, STYLE_PRESETS } from '../../popup/constants.js';
import { setupPanelHandlers } from '../../popup/handlers/panels.js';
import { importSettings } from '../../scripts/settings/import-export.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/locales.js', async importOriginal => ({ ...await importOriginal(), t: async key => key, tSync: key => key, getUILanguage: async () => 'en' }));
vi.mock('../../popup/settings/api-keys.js', () => ({ initApiKeys: () => ({ setUpdateModelList() {}, updateApiProviderUI: async () => {} }) }));
vi.mock('../../popup/settings/models.js', () => ({ initModels: () => ({}) }));
vi.mock('../../popup/settings/audio.js', async importOriginal => ({ ...await importOriginal(), initAudio: () => ({ hideAllAudioFields() {}, saveAudioVoice() {}, updateAudioProviderUI: async () => {}, updateVoiceList: async () => {} }) }));
vi.mock('../../popup/settings/ui-visibility.js', () => ({ initUIVisibility: () => ({ updateOutputFormatUI: async () => {}, updateModeHint() {}, updateCacheVisibility() {} }) }));

let dom;
beforeEach(() => {
  dom = new JSDOM(readFileSync(new URL('../../popup/popup.html', import.meta.url), 'utf8'));
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('settings load generation ownership', () => {
  it.each(['ENC:v2:unavailable-ciphertext', '****stored-mask'])('retains unreadable speech key settings %s', async value => {
    const fields = [['elevenlabs_api_key', 'elevenlabsApiKey'], ['qwen_api_key', 'qwenApiKey'], ['respeecher_api_key', 'respeecherApiKey']];
    const stored = Object.fromEntries(fields.map(([key]) => [key, value]));
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({ ...stored })), set: vi.fn(async values => Object.assign(stored, values)), remove: vi.fn() } } });
    const elements = {}; initializeDOMElements(elements);
    const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS,
      showToast: vi.fn(), setCustomSelectValue: vi.fn(), getElement: id => document.getElementById(id),
      setElementDisplay: vi.fn(), setElementGroupDisplay: vi.fn(), setDisplayForIds: vi.fn(), applyTheme: vi.fn(),
      markdownToHtml: value => value, audioVoiceMap: {}, t: async key => key, getUILanguage: async () => 'en' });
    await settings.loadSettings();
    for (const [key, field] of fields) {
      expect(stored[key]).toBe(value);
      expect(elements[field].dataset.encrypted).toBe(value);
      expect(elements[field].value).toMatch(/^\*{4}/);
    }
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
  for (const startTime of [undefined, 'invalid', Date.now() - 60 * 60 * 1000]) {
    it(`keeps background generation ownership with timestamp ${String(startTime)}`, async () => {
      const stored = { summary_generating: true, summary_generation_id: 'new-job', summary_generating_start_time: startTime,
        use_selector_cache: true, enable_selector_caching: true, enable_statistics: true };
      vi.stubGlobal('chrome', { storage: { local: {
        get: vi.fn(async () => ({ ...stored })),
        set: vi.fn(async values => Object.assign(stored, values))
      } } });
      const elements = {};
      initializeDOMElements(elements);
      const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS,
        showToast: vi.fn(), setCustomSelectValue: vi.fn(), getElement: id => document.getElementById(id),
        setElementDisplay: vi.fn(), setElementGroupDisplay: vi.fn(), setDisplayForIds: vi.fn(), applyTheme: vi.fn(),
        markdownToHtml: value => value, audioVoiceMap: {}, t: async key => key, getUILanguage: async () => 'de' });
      await settings.loadSettings();
      expect(stored.summary_generating).toBe(true);
      expect(stored.summary_generation_id).toBe('new-job');
      expect(elements.generateSummaryBtn.disabled).toBe(false);
      await initSummary({ elements, STORAGE_KEYS, t: async key => key,
        log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), showToast: vi.fn() }).checkSummaryStatus();
      expect(elements.generateSummaryBtn.disabled).toBe(true);
      expect(elements.uiLanguageSelect.value).toBe('de');
      expect(chrome.storage.local.set.mock.calls.every(([updates]) => !('summary_generating' in updates))).toBe(true);
    });
  }
});

it.each([false, null])('refreshes a checked table-of-contents control when an import sets it to %j', async value => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await chrome.storage.local.set({ generate_toc: true });
    const elements = {};
    initializeDOMElements(elements);
    const t = async key => key;
    const getUILanguage = async () => 'en';
    const noop = vi.fn();
    const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS,
      showToast: noop, setCustomSelectValue: noop, getElement: id => document.getElementById(id),
      setElementDisplay: noop, setElementGroupDisplay: noop, setDisplayForIds: noop, applyTheme: noop,
      markdownToHtml: value => value, audioVoiceMap: {}, t, getUILanguage });
    await settings.loadSettings();
    expect(elements.generateToc.checked).toBe(true);
    vi.stubGlobal('FileReader', dom.window.FileReader);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('HTMLFieldSetElement', dom.window.HTMLFieldSetElement);
    chrome.runtime.sendMessage.mockImplementation(async message => ({ success: true, result: await importSettings(message.jsonData, message.options) }));
    const loadAndDisplayStats = vi.fn(async () => {});
    const logError = vi.fn();
    setupPanelHandlers({ elements, log: noop, logError, logWarn: noop, showToast: noop, t,
      getUILanguage, UI_LOCALES: { en: {} }, settingsModule: { ...settings, updateModelList: async () => {} }, loadAndDisplayStats });
    const file = new dom.window.File([JSON.stringify({ settings: { generate_toc: value } })], 'settings.json');
    Object.defineProperty(elements.importFileInput, 'files', { value: [file] });
    elements.importFileInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('settingsTransferModal').classList.contains('hidden')).toBe(false));
    document.getElementById('settingsTransferOverwrite').checked = true;
    document.getElementById('settingsTransferConfirm').click();
    await vi.waitFor(() => expect(loadAndDisplayStats).toHaveBeenCalledOnce());
    expect(logError).not.toHaveBeenCalled();
    expect((await chrome.storage.local.get(['generate_toc'])).generate_toc).toBe(value ?? undefined);
    expect(elements.generateToc.checked).toBe(false);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
