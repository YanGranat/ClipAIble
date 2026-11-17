// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { initSettings } from '../../popup/settings.js';
import { setupThemeHandlers } from '../../popup/handlers/theme.js';
import { setupAudioHandlers } from '../../popup/handlers/audio.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { DEFAULT_STYLES, STORAGE_KEYS, STYLE_PRESETS } from '../../popup/constants.js';
import { t, getUILanguage, setUILanguage, tSync } from '../../scripts/locales.js';

afterEach(() => vi.restoreAllMocks());

it('keeps accepted audio choices when a language change is pending without reloading stored values', async () => {
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  const elements = {};
  initializeDOMElements(elements);
  const stored = { ui_language: 'en', audio_provider: 'openai', output_format: 'audio', audio_speed: 1.3,
    audio_voice_map: { current: { openai: 'nova', qwen: 'Cherry' } },
    use_selector_cache: true, enable_selector_caching: true, enable_statistics: true };
  const unchanged = structuredClone({ voiceMap: stored.audio_voice_map, speed: stored.audio_speed });
  let pendingSnapshot = false, release, snapshotEntered = false;
  chrome.storage.local.get.mockImplementation(async keys => {
    const values = Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(stored[key])]));
    if (pendingSnapshot && Array.isArray(keys) && keys.includes('audio_provider')) {
      snapshotEntered = true;
      await new Promise(resolve => { release = resolve; });
    }
    return values;
  });
  chrome.storage.local.set.mockImplementation(async updates => Object.assign(stored, structuredClone(updates)));
  const save = (key, value, callback) => { stored[key] = structuredClone(value); callback?.(); };
  const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS,
    debouncedSaveSettings: save, showToast: vi.fn(), setCustomSelectValue: vi.fn(),
    getElement: id => document.getElementById(id), setElementDisplay: vi.fn(), setElementGroupDisplay: vi.fn(),
    setDisplayForIds: vi.fn(), applyTheme: vi.fn(), markdownToHtml: value => value,
    audioVoiceMap: { current: {} }, t, getUILanguage });
  await settings.loadSettings();
  elements.apiKey.value = 'sample-unsaved-key';
  const complete = vi.fn();
  setupThemeHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: save, applyTheme: vi.fn(),
    setUILanguage, applyLocalization: vi.fn(async () => {}), settingsModule: settings,
    initAllCustomSelects: complete });
  setupAudioHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: save, settingsModule: settings,
    log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });
  pendingSnapshot = true;
  elements.uiLanguageSelect.value = 'de';
  elements.uiLanguageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(snapshotEntered || complete.mock.calls.length > 0).toBe(true));
  expect(elements.audioProvider.disabled).toBe(false);
  elements.audioProvider.value = 'qwen';
  elements.audioProvider.dispatchEvent(new Event('change', { bubbles: true }));
  release?.();
  await vi.waitFor(() => expect(complete).toHaveBeenCalled());
  expect(elements.audioProvider.value).toBe('qwen');
  expect(stored.audio_provider).toBe('qwen');
  expect(elements.apiKey.value).toBe('sample-unsaved-key');
  expect(stored.audio_speed).toBe(unchanged.speed);
  expect(stored.audio_voice_map).toEqual(unchanged.voiceMap);
  expect(elements.modelSelect.selectedOptions[0].textContent).toContain(tSync('reasoningEffort_medium', 'de'));
});
