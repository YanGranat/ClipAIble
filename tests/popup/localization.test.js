import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LOCALES, getUILanguage, t, tSync } from '../../scripts/locales.js';

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } }, i18n: { getUILanguage: vi.fn(() => 'en') } });
});
afterEach(() => vi.unstubAllGlobals());

it('provides a neutral credential prompt and validation message in every UI locale', () => {
  const retired = ['enterGeminiApiKey', 'enterGoogleApiKey', 'invalidGeminiKeyFormat', 'invalidGoogleTtsKeyFormat', 'invalidGoogleKeyFormat'];
  for (const [language, locale] of Object.entries(UI_LOCALES)) {
    expect(tSync('pleaseEnterApiKey', language)).toBe(locale.pleaseEnterApiKey);
    expect(tSync('invalidKeyFormat', language)).toBe(locale.invalidKeyFormat);
    expect(locale.pleaseEnterApiKey).toBeTruthy();
    expect(locale.invalidKeyFormat).toBeTruthy();
    for (const key of retired) expect(locale).not.toHaveProperty(key);
  }
});

describe('localization fallback', () => {
  it('uses English when an existing locale has no translation', async () => {
    const key = 'errorOffscreenApiNotAvailable';
    const german = UI_LOCALES.de[key];
    delete UI_LOCALES.de[key];
    try {
      expect(tSync(key, 'de')).toBe(UI_LOCALES.en[key]);
      await expect(t(key, 'de')).resolves.toBe(UI_LOCALES.en[key]);
    } finally {
      UI_LOCALES.de[key] = german;
    }
  });

  it('preserves existing translations and supports unknown language codes', async () => {
    expect(tSync('settings', 'de')).toBe(UI_LOCALES.de.settings);
    expect(tSync('settings', 'unsupported')).toBe(UI_LOCALES.en.settings);
    await expect(t('settings', 'unsupported')).resolves.toBe(UI_LOCALES.en.settings);
  });

  it('returns the identifier for an unknown translation key', async () => {
    expect(tSync('unknown_translation_key', 'en')).toBe('unknown_translation_key');
    await expect(t('unknown_translation_key', 'de')).resolves.toBe('unknown_translation_key');
  });
});

describe('UI language selection', () => {
  it.each([['de-DE', 'de'], ['uk-UA', 'ua'], ['pt-BR', 'pt'], ['zz-ZZ', 'en']])('uses the browser language %s as %s without saving a preference', async (browser, expected) => {
    chrome.i18n.getUILanguage.mockReturnValue(browser);
    expect(await getUILanguage()).toBe(expected);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('preserves an explicit English choice over a different browser language', async () => {
    chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
    chrome.i18n.getUILanguage.mockReturnValue('de-DE');
    expect(await getUILanguage()).toBe('en');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('uses English if the browser language API is unavailable', async () => {
    chrome.i18n = {};
    expect(await getUILanguage()).toBe('en');
  });
});
