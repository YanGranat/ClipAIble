// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { initHandlers } from '../../popup/handlers.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { initApiKeys } from '../../popup/settings/api-keys.js';

afterEach(() => vi.unstubAllGlobals());

it('does not let an earlier provider load replace the current key presentation', async () => {
  document.body.innerHTML = '<select id="provider"><option>openai</option><option>claude</option></select><input id="key">';
  const provider = document.getElementById('provider');
  const key = document.getElementById('key');
  key.dataset.decrypted = 'synthetic-old-plaintext';
  let release, waiting = false, reads = 0;
  chrome.storage.local.get.mockImplementation(async () => {
    const result = { openai_api_key: 'synthetic-openai', claude_api_key: 'synthetic-claude' };
    if (++reads === 1) { waiting = true; await new Promise(resolve => { release = resolve; }); }
    return result;
  });
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
  const noOp = vi.fn();
  const settings = { updateApiProviderUI: vi.fn(async () => {}), updateTranslationVisibility: vi.fn(async () => {}) };
  initHandlers({ elements: { apiProviderSelect: provider, apiKey: key }, STORAGE_KEYS, STYLE_PRESETS: {},
    log: noOp, logError: noOp, logWarn: noOp, showToast: noOp, decryptApiKey: async value => value,
    maskApiKey: value => `****${value}`, t: async value => value, debouncedSaveSettings: noOp,
    settingsModule: settings }).setupEventListeners();
  provider.dispatchEvent(new Event('change'));
  expect(key.dataset.decrypted).toBeUndefined();
  await vi.waitFor(() => expect(waiting).toBe(true));
  provider.value = 'claude';
  provider.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(key.value).toBe('****synthetic-claude'));
  release();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(key.value).toBe('****synthetic-claude');
  expect(key.dataset.provider).toBe('claude');
  expect(settings.updateApiProviderUI).toHaveBeenCalledOnce();
});

it('preserves a newly typed provider-bound draft while the saved key is loading', async () => {
  document.body.innerHTML = '<select id="provider"><option>openai</option><option>claude</option></select><input id="key">';
  const provider = document.getElementById('provider'); const key = document.getElementById('key');
  let release, waiting = false;
  chrome.storage.local.get.mockImplementation(async () => { waiting = true; await new Promise(resolve => { release = resolve; }); return { openai_api_key: 'synthetic-stored-key' }; });
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 1; });
  const noOp = vi.fn();
  const settings = { updateApiProviderUI: vi.fn(async () => {}), updateTranslationVisibility: vi.fn(async () => {}) };
  initHandlers({ elements: { apiProviderSelect: provider, apiKey: key }, STORAGE_KEYS, STYLE_PRESETS: {},
    log: noOp, logError: noOp, logWarn: noOp, showToast: noOp, decryptApiKey: async value => value,
    maskApiKey: value => `****${value}`, t: async value => value, debouncedSaveSettings: noOp,
    settingsModule: settings }).setupEventListeners();
  provider.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(waiting).toBe(true));
  key.value = 'synthetic-new-draft'; key.dispatchEvent(new Event('input'));
  release();
  await vi.waitFor(() => expect(settings.updateApiProviderUI).toHaveBeenCalledOnce());
  expect(key.value).toBe('synthetic-new-draft'); expect(key.dataset.provider).toBe('openai');
  expect(key.dataset.encrypted).toBeUndefined();
});

it('does not relabel the key field after an earlier provider locale read finishes', async () => {
  document.body.innerHTML = '<select id="provider"><option>openai</option><option>claude</option></select><label id="label">Current label</label><input id="key" placeholder="Current placeholder">';
  const provider = document.getElementById('provider'), key = document.getElementById('key'), label = document.getElementById('label');
  let release;
  chrome.storage.local.get.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const api = initApiKeys({ elements: { apiProviderSelect: provider, apiKey: key, apiKeyLabel: label }, STORAGE_KEYS, showToast: vi.fn() });
  const pending = api.updateApiProviderUI();
  provider.value = 'claude'; release({ ui_language: 'en' }); await pending;
  expect(label.textContent).toBe('Current label'); expect(key.placeholder).toBe('Current placeholder');
});
