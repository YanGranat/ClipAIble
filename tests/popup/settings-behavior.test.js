import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initUI } from '../../popup/ui.js';
import { initStyles } from '../../popup/settings/styles.js';
import { initializeModules } from '../../popup/utils/init-helpers.js';
import { DEFAULT_STYLES, STORAGE_KEYS } from '../../popup/constants.js';

vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', t: async key => key, UI_LOCALES: { en: {} } }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));

describe('popup settings behavior', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('forwards the font selection dependency through grouped initialization', () => {
    const setCustomSelectValue = vi.fn();
    const initSettings = vi.fn(() => ({}));
    initializeModules({
      setCustomSelectValue, initSettings,
      initUI: () => ({}), initStats: () => ({}), initCore: () => ({}), initHandlers: () => ({})
    });
    expect(initSettings.mock.calls[0][0].setCustomSelectValue).toBe(setCustomSelectValue);
  });

  for (const [type, key] of [
    ['bgColor', STORAGE_KEYS.CUSTOM_BG_COLOR], ['textColor', STORAGE_KEYS.CUSTOM_TEXT_COLOR],
    ['headingColor', STORAGE_KEYS.CUSTOM_HEADING_COLOR], ['linkColor', STORAGE_KEYS.CUSTOM_LINK_COLOR]
  ]) {
    it(`persists the reset ${type} in the custom palette`, async () => {
      const store = { [key]: '#123456', pdf_style_preset: 'light', unrelated: 'kept' };
      chrome.storage.local.set = vi.fn(async values => Object.assign(store, values));
      const elements = { [type]: {}, [`${type}Text`]: {}, stylePreset: {} };
      const styles = initStyles({ elements, STORAGE_KEYS, DEFAULT_STYLES, showToast: vi.fn(), setCustomSelectValue: vi.fn() });
      await styles.resetStyleSetting(type);
      expect(elements[type].value).toBe(DEFAULT_STYLES[type]);
      expect(elements[`${type}Text`].value).toBe(DEFAULT_STYLES[type]);
      expect(elements.stylePreset.value).toBe('custom');
      expect(store[key]).toBe(DEFAULT_STYLES[type]);
      expect(store.pdf_style_preset).toBe('custom');
      expect(store.unrelated).toBe('kept');
    });
  }

  it('resets the font to the empty default value', async () => {
    const input = document.createElement('input');
    input.value = 'Georgia';
    const setCustomSelectValue = vi.fn();
    const styles = initStyles({ elements: { fontFamily: input }, STORAGE_KEYS, DEFAULT_STYLES, showToast: vi.fn(), setCustomSelectValue });
    await styles.resetStyleSetting('fontFamily');
    expect(input.value).toBe('');
    expect(setCustomSelectValue).toHaveBeenCalledWith('');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([STORAGE_KEYS.FONT_FAMILY]);
  });

  it('stops following system theme after a manual selection', () => {
    const queries = [];
    window.matchMedia = () => {
      const listeners = new Set();
      const query = {
        matches: false,
        addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
        change: matches => listeners.forEach(fn => fn({ matches })), listeners
      };
      queries.push(query);
      return query;
    };
    const elements = { themeSelect: { value: 'auto' } };
    const ui = initUI({ elements });
    ui.applyTheme();
    elements.themeSelect.value = 'light';
    ui.applyTheme();
    queries.forEach(query => query.change(true));
    expect(document.body.dataset.theme).toBe('light');
    expect(queries.reduce((n, query) => n + query.listeners.size, 0)).toBe(0);
    elements.themeSelect.value = 'auto';
    ui.applyTheme();
    ui.applyTheme();
    expect(queries.reduce((n, query) => n + query.listeners.size, 0)).toBe(1);
  });
});
