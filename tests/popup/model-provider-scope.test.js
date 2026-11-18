import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initModels } from '../../popup/settings/models.js';
import { setupModelHandlers } from '../../popup/handlers/model.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

vi.mock('../../scripts/locales.js', async importOriginal => ({ ...(await importOriginal()), getUILanguage: async () => 'en' }));

let dom, elements, stored, models;
beforeEach(() => {
  dom = new JSDOM('<select id="provider"><option>openai</option><option>claude</option></select><select id="model"></select><div id="dropdown" class="hidden"><div id="options"></div></div>');
  for (const name of ['document', 'Element', 'Event']) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('window', dom.window);
  stored = { api_provider: 'openai' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, structuredClone(values)));
  elements = { apiProviderSelect: document.getElementById('provider'), modelSelect: document.getElementById('model'), customModelDropdown: document.getElementById('dropdown'), customModelOptions: document.getElementById('options') };
  models = initModels({ elements, STORAGE_KEYS, formatModelLabel: value => value });
  setupModelHandlers({ elements, settingsModule: models });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('provider ownership of model actions', () => {
  it('allows a pending provider render to finish after an earlier add dialog is confirmed', async () => {
    await models.updateModelList();
    vi.stubGlobal('prompt', vi.fn(() => 'synthetic-custom-model'));
    let releaseDialog, releaseList, dialogWaiting = false, listWaiting = false;
    const blockedDialog = new Promise(resolve => { releaseDialog = resolve; });
    const blockedList = new Promise(resolve => { releaseList = resolve; });
    chrome.storage.local.get.mockImplementation(async keys => {
      const result = Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])]));
      if (keys.length === 2 && keys.includes(STORAGE_KEYS.CUSTOM_MODELS) && keys.includes(STORAGE_KEYS.HIDDEN_MODELS)) { dialogWaiting = true; await blockedDialog; }
      else if (elements.apiProviderSelect.value === 'claude' && keys.includes(STORAGE_KEYS.MODEL_BY_PROVIDER) && keys.includes(STORAGE_KEYS.CUSTOM_MODELS)) { listWaiting = true; await blockedList; }
      return result;
    });
    const dialog = models.showAddModelDialog();
    await vi.waitFor(() => expect(dialogWaiting).toBe(true));
    elements.apiProviderSelect.value = 'claude';
    stored.api_provider = 'claude';
    const list = models.updateModelList();
    await vi.waitFor(() => expect(listWaiting).toBe(true));
    releaseDialog();
    await dialog;
    releaseList();
    await list;
    expect(stored.custom_models.openai).toEqual(['synthetic-custom-model']);
    expect(elements.modelSelect.value).toBe('claude-sonnet-5-5');
    expect(stored.model_by_provider.claude).toBe('claude-sonnet-5-5');
  });

  it('keeps an add-model dialog bound to the provider that opened it', async () => {
    vi.stubGlobal('prompt', vi.fn(() => 'synthetic-custom-model'));
    let release, waiting = false;
    const blocked = new Promise(resolve => { release = resolve; });
    chrome.storage.local.get.mockImplementation(async keys => {
      const result = Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])]));
      if (keys.length === 2 && keys.includes(STORAGE_KEYS.CUSTOM_MODELS) && keys.includes(STORAGE_KEYS.HIDDEN_MODELS)) { waiting = true; await blocked; }
      return result;
    });
    const pending = models.showAddModelDialog();
    await vi.waitFor(() => expect(waiting).toBe(true));
    elements.apiProviderSelect.value = 'claude';
    stored.api_provider = 'claude';
    release();
    await pending;
    expect(stored.custom_models.openai).toEqual(['synthetic-custom-model']);
    expect(stored.custom_models.claude).toBeUndefined();
  });

  it('ignores an old provider option while the next provider list is loading', async () => {
    await models.updateModelList();
    await models.showCustomModelDropdown();
    const staleOption = elements.customModelOptions.querySelector('[data-model-value="gpt-6.1-sol-high"]');
    expect(staleOption).toBeTruthy();
    let release, waiting = false;
    const blocked = new Promise(resolve => { release = resolve; });
    chrome.storage.local.get.mockImplementation(async keys => {
      const result = Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])]));
      if (!waiting && keys.includes(STORAGE_KEYS.CUSTOM_MODELS)) { waiting = true; await blocked; }
      return result;
    });
    elements.apiProviderSelect.value = 'claude';
    stored.api_provider = 'claude';
    const pending = models.updateModelList();
    await vi.waitFor(() => expect(waiting).toBe(true));
    const previousSelection = elements.modelSelect.value;
    staleOption.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(elements.modelSelect.value).toBe(previousSelection);
    await Promise.resolve();
    release();
    await pending;
    await vi.waitFor(() => expect(elements.modelSelect.value).toBe('claude-sonnet-5-5'));
    expect(stored.model_by_provider.claude).toBe('claude-sonnet-5-5');
  });
});
