import { beforeEach, expect, it, vi } from 'vitest';
import { handleImportSettings } from '../../scripts/message-handlers/settings.js';
import { clearUILanguageCache } from '../../scripts/utils/processing/pipeline-helpers.js';
import { tSync } from '../../scripts/locales.js';
import { withSuccessResponse } from '../../scripts/message-handlers/utils.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
beforeEach(() => {
  clearUILanguageCache();
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'ru' });
  chrome.storage.local.set.mockClear();
  chrome.runtime.lastError = undefined;
});

it('keeps a malformed import translatable through the real asynchronous handler', async () => {
  const response = vi.fn();
  expect(handleImportSettings({ jsonData: '{invalid' }, {}, response)).toBe(true);
  await vi.waitFor(() => expect(response).toHaveBeenCalledTimes(1));
  expect(response).toHaveBeenCalledWith({ error: tSync('errorImportJsonParseFailed', 'ru'), translationKey: 'errorImportJsonParseFailed', translationParams: {} });
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('carries typed warnings for skipped settings without changing validation', async () => {
  const response = vi.fn();
  expect(handleImportSettings({ jsonData: JSON.stringify({ settings: { unrecognized_setting: 'sample', pdf_font_size: 1 } }), options: { overwriteExisting: true } }, {}, response)).toBe(true);
  await vi.waitFor(() => expect(response).toHaveBeenCalledTimes(1));
  const result = response.mock.calls[0][0].result;
  expect(result.settingsImported).toBe(0);
  expect(result.warningTranslations).toEqual([{ key: 'warningImportUnknown', params: { count: 1 } }, { key: 'warningImportRange', params: { setting: 'pdf_font_size', min: 8, max: 72 } }]);
  expect(result.warnings).toEqual(result.warningTranslations.map(({ key, params }) => tSync(key, 'ru', params)));
  expect(chrome.storage.local.set.mock.calls.some(([value]) => Object.hasOwn(value, 'pdf_font_size'))).toBe(false);
});

it('preserves message identity in the simple asynchronous response wrapper', async () => {
  const response = vi.fn();
  const error = Object.assign(new Error('Service detail'), { translationKey: 'errorNetwork', translationParams: {} });
  await expect(withSuccessResponse(Promise.reject(error), 'networkError', response)).resolves.toBe(true);
  expect(response).toHaveBeenCalledExactlyOnceWith({ error: 'Service detail', translationKey: 'errorNetwork', translationParams: {} });
});
