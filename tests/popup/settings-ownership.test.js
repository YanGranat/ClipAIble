import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initSettings } from '../../popup/settings.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { DEFAULT_STYLES, STORAGE_KEYS, STYLE_PRESETS } from '../../popup/constants.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ t: async key => key, tSync: key => key, getUILanguage: async () => 'en', UI_LOCALES: { en: {} } }));
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
      expect(elements.generateSummaryBtn.disabled).toBe(true);
      expect(elements.uiLanguageSelect.value).toBe('de');
      expect(chrome.storage.local.set.mock.calls.every(([updates]) => !('summary_generating' in updates))).toBe(true);
    });
  }
});
