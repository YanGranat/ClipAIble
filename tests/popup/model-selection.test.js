import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { initModels } from '../../popup/settings/models.js';
import { initSettings } from '../../popup/settings.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { setupModelHandlers } from '../../popup/handlers/model.js';
import { STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS } from '../../popup/constants.js';
import { getModelCatalog, getModelMetadata, getDefaultModel, resolveSavedModel, resolveStoredModelSelection, formatModelLabel } from '../../scripts/utils/model-catalog.js';
import { determineProviderAndModel } from '../../scripts/utils/storage/settings-helpers.js';

let dom, elements, stored, models;
const clone = value => structuredClone(value);

beforeEach(() => {
  dom = new JSDOM('<select id="provider"><option>openai</option><option>grok</option><option>openrouter</option><option>claude</option><option>gemini</option><option>deepseek</option></select><select id="model"></select><div id="dropdown" class="hidden"><div id="options"></div></div>');
  for (const name of ['document', 'window', 'Element', 'Event', 'Option', 'HTMLElement', 'HTMLSelectElement']) vi.stubGlobal(name, dom.window[name]);
  stored = { ui_language: 'en', api_provider: 'openai' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, clone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, clone(values)));
  elements = { apiProviderSelect: document.getElementById('provider'), modelSelect: document.getElementById('model'),
    customModelDropdown: document.getElementById('dropdown'), customModelOptions: document.getElementById('options') };
  models = initModels({ elements, STORAGE_KEYS, formatModelLabel: value => value });
});

afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('model selection persistence', () => {
  it('starts with the current catalog and offers managed reasoning variants', async () => {
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('gpt-6.2-sol');
    expect([...elements.modelSelect.options].map(option => option.value)).toContain('gpt-6.2-sol-high');
    expect([...elements.modelSelect.options].map(option => option.value)).toContain('gpt-6.1-sol-high');
    expect([...elements.modelSelect.options].map(option => option.value)).toContain('gpt-6.1-terra-none');
    expect(stored.model_by_provider.openai).toBe(stored.openai_model);
  });

  it('keeps an added custom model in the popup, QuickSave and the reopened selector', async () => {
    stored.model_by_provider = { openai: 'gpt-5.2' };
    stored.openai_model = 'gpt-5.2';
    await models.updateModelList();
    await models.addCustomModel('synthetic-custom-model');
    expect(elements.modelSelect.value).toBe('synthetic-custom-model');
    expect(stored.openai_model).toBe('synthetic-custom-model');
    expect(stored.model_by_provider.openai).toBe('synthetic-custom-model');
    expect(determineProviderAndModel(stored)).toEqual({ provider: 'openai', model: 'synthetic-custom-model' });
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('synthetic-custom-model');
  });

  it('refreshes a saved built-in while retaining the selected reasoning role', async () => {
    stored.openai_model = 'gpt-5.2-high';
    stored.model_by_provider = { openai: 'gpt-5.2-high' };
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('gpt-6.2-sol-high');
    expect(stored.openai_model).toBe('gpt-6.2-sol-high');
    expect(stored.model_by_provider.openai).toBe('gpt-6.2-sol-high');
  });

  it('preserves an explicit custom ID even when it matches a replaced built-in', async () => {
    stored.openai_model = 'gpt-5.2';
    stored.custom_models = { openai: ['gpt-5.2'] };
    stored.model_by_provider = { openai: 'gpt-5.2' };
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('gpt-5.2');
    expect(stored.openai_model).toBe('gpt-5.2');
    expect(getModelMetadata('openai', 'gpt-5.2').apiModel).toBe('gpt-5.2');
  });

  it('keeps an OpenRouter custom ID bound to its selected provider', async () => {
    elements.apiProviderSelect.value = 'openrouter';
    Object.assign(stored, { api_provider: 'openrouter', custom_models: { openrouter: ['claude-synthetic-model'] },
      model_by_provider: { openrouter: 'claude-synthetic-model' } });
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('claude-synthetic-model');
    expect(determineProviderAndModel(stored)).toEqual({ provider: 'openrouter', model: 'claude-synthetic-model' });
  });

  it('renders one option per model in both native and custom dropdowns', async () => {
    stored.custom_models = { openai: ['gpt-6.1-sol', 'synthetic-custom-model'] };
    await models.updateModelList();
    await models.showCustomModelDropdown();
    const native = [...elements.modelSelect.options].map(option => option.value);
    const custom = [...elements.customModelOptions.children].map(option => option.dataset.modelValue);
    expect(custom).toEqual(native);
    expect(new Set(native).size).toBe(native.length);
  });

  it('keeps hidden choices hidden after a built-in ID is refreshed', async () => {
    stored.hidden_models = { openai: ['gpt-5.2'] };
    stored.openai_model = 'gpt-5.2';
    stored.model_by_provider = { openai: 'gpt-5.2' };
    await models.updateModelList();
    expect([...elements.modelSelect.options].map(option => option.value)).not.toContain('gpt-6.2-sol');
    expect(elements.modelSelect.value).not.toBe('gpt-5.2');
  });

  it('retains a saved unavailable free model without switching it to a paid model', async () => {
    elements.apiProviderSelect.value = 'openrouter';
    stored.api_provider = 'openrouter';
    stored.openai_model = 'mistralai/devstral-2512:free';
    stored.model_by_provider = { openrouter: stored.openai_model };
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('mistralai/devstral-2512:free');
    expect(elements.modelSelect.selectedOptions[0].textContent).toMatch(/unavailable/i);
    expect(stored.openai_model).toBe('mistralai/devstral-2512:free');
  });

  it('does not apply a stock availability badge to an explicit custom model ID', async () => {
    elements.apiProviderSelect.value = 'openrouter';
    stored.api_provider = 'openrouter';
    stored.custom_models = { openrouter: ['mistralai/devstral-2512:free'] };
    stored.model_by_provider = { openrouter: 'mistralai/devstral-2512:free' };
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe('mistralai/devstral-2512:free');
    expect(elements.modelSelect.selectedOptions[0].textContent).not.toMatch(/unavailable/i);
  });

  it('does not let a late provider read overwrite a newer provider selection', async () => {
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    let delayed = false;
    chrome.storage.local.get.mockImplementation(async keys => {
      const value = Object.fromEntries(keys.map(key => [key, clone(stored[key])]));
      if (keys.includes(STORAGE_KEYS.CUSTOM_MODELS) && !delayed) { delayed = true; await blocked; }
      return value;
    });
    const old = models.updateModelList();
    await vi.waitFor(() => expect(delayed).toBe(true));
    elements.apiProviderSelect.value = 'grok';
    stored.api_provider = 'grok';
    await models.updateModelList();
    release();
    await old;
    expect(elements.modelSelect.value).toBe('grok-4.7');
    expect(stored.openai_model).toBe('grok-4.7');
    expect(stored.model_by_provider.grok).toBe('grok-4.7');
  });

  it('persists native selection changes through the same selection owner', async () => {
    await models.updateModelList();
    setupModelHandlers({ elements, STORAGE_KEYS, settingsModule: models, debouncedSaveSettings: vi.fn() });
    elements.modelSelect.value = 'gpt-6.1-sol-high';
    elements.modelSelect.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(stored.model_by_provider.openai).toBe('gpt-6.1-sol-high'));
    expect(stored.openai_model).toBe('gpt-6.1-sol-high');
  });

  it('persists the same replacement after removing a selected custom model', async () => {
    stored.custom_models = { openai: ['synthetic-custom-model'] };
    stored.model_by_provider = { openai: 'synthetic-custom-model' };
    await models.updateModelList();
    await models.removeCustomModel('synthetic-custom-model');
    expect(elements.modelSelect.value).toBe(getDefaultModel('openai'));
    expect(stored.openai_model).toBe(elements.modelSelect.value);
    expect(stored.model_by_provider.openai).toBe(elements.modelSelect.value);
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe(getDefaultModel('openai'));
  });

  it('can persist a later selection after a failed storage write', async () => {
    await models.updateModelList();
    chrome.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(models.selectModel('gpt-6.1-sol-high')).rejects.toThrow('Storage unavailable');
    await models.selectModel('gpt-6.1-sol-low');
    expect(stored.openai_model).toBe('gpt-6.1-sol-low');
    expect(stored.model_by_provider.openai).toBe('gpt-6.1-sol-low');
  });

  it('retains another provider selection while serializing rapid changes', async () => {
    stored.model_by_provider = { grok: 'grok-4.3' };
    await models.updateModelList();
    await Promise.all([models.selectModel('gpt-6.1-sol-high'), models.selectModel('gpt-6.1-sol-low')]);
    expect(stored.model_by_provider).toMatchObject({ openai: 'gpt-6.1-sol-low', grok: 'grok-4.3' });
    expect(stored.openai_model).toBe('gpt-6.1-sol-low');
  });

  it.each(['openai', 'claude', 'gemini', 'grok', 'deepseek', 'openrouter'])('provides unique API-bound entries for %s', provider => {
    const catalog = getModelCatalog(provider);
    expect(catalog.length).toBeGreaterThan(0);
    expect(new Set(catalog.map(entry => entry.id)).size).toBe(catalog.length);
    for (const entry of catalog) {
      expect(entry.provider).toBe(provider);
      expect(entry.apiModel).toBeTruthy();
      if (entry.reasoningEffort) expect(entry.reasoningEfforts).toContain(entry.reasoningEffort);
    }
  });

  it('preserves compatible presets and migrates a removed DeepSeek default', () => {
    expect(resolveSavedModel('openai', 'gpt-5.1')).toBe('gpt-6.1-terra-none');
    expect(getModelMetadata('openai', 'gpt-6.1-terra-none')).toMatchObject({ apiModel: 'gpt-6.1-terra', reasoningEffort: 'none' });
    expect(resolveSavedModel('deepseek', 'deepseek-chat')).toBe('deepseek-flash');
    expect(getModelMetadata('deepseek', 'deepseek-flash-no-thinking')).toMatchObject({ apiModel: 'deepseek-flash', reasoningEnabled: false });
    expect(resolveSavedModel('deepseek', 'deepseek-chat', ['deepseek-chat'])).toBe('deepseek-chat');
    expect(getModelMetadata('deepseek', 'deepseek-chat')).toBeNull();
    expect(getModelMetadata('openai', 'gpt-6.1-sol-none')).toBeNull();
  });

  it('uses exact metadata for managed variants and preserves arbitrary custom suffixes', () => {
    expect(getModelMetadata('openai', 'gpt-6.1-sol-high')).toMatchObject({ apiModel: 'gpt-6.1-sol', reasoningEffort: 'high' });
    expect(getModelMetadata('openrouter', 'qwen/qwen3.8-flash-no-thinking')).toMatchObject({ apiModel: 'qwen/qwen3.8-flash', reasoningEnabled: false });
    expect(formatModelLabel('openrouter', 'sample-vendor/custom-high')).toBe('sample-vendor/custom-high');
    expect(getModelMetadata('openrouter', 'sample-vendor/custom-high')).toBeNull();
    expect(getModelMetadata('openai', 'gpt-5.1-2025-11-13').reasoningEfforts).toEqual(['none', 'low', 'medium', 'high']);
    expect(getModelMetadata('openai', 'gpt-5.2-2025-12-11').reasoningEfforts).toContain('xhigh');
    expect(getModelMetadata('openai', 'gpt-5.2').apiModel).toBe('gpt-5.2');
  });

  it('restores a legacy provider and current model consistently in the real settings facade', async () => {
    dom.window.close();
    dom = new JSDOM(readFileSync(new URL('../../popup/popup.html', import.meta.url), 'utf8'));
    for (const name of ['document', 'window', 'Element', 'Event', 'Option', 'HTMLElement', 'HTMLSelectElement']) vi.stubGlobal(name, dom.window[name]);
    stored = { ui_language: 'en', openai_model: 'claude-sonnet-4-5', use_selector_cache: true, enable_selector_caching: true, enable_statistics: true };
    elements = {};
    initializeDOMElements(elements);
    const settings = initSettings({ elements, STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS,
      debouncedSaveSettings: vi.fn(), showToast: vi.fn(), setCustomSelectValue: vi.fn(),
      getElement: id => document.getElementById(id), setElementDisplay: vi.fn(), setElementGroupDisplay: vi.fn(),
      setDisplayForIds: vi.fn(), applyTheme: vi.fn(), markdownToHtml: value => value,
      audioVoiceMap: {}, t: async key => key, getUILanguage: async () => 'en' });
    await settings.loadSettings();
    expect(elements.apiProviderSelect.value).toBe('claude');
    expect(elements.modelSelect.value).toBe('claude-sonnet-5-5');
    expect(resolveStoredModelSelection(stored)).toEqual({ provider: 'claude', model: 'claude-sonnet-5-5' });
    expect(determineProviderAndModel(stored)).toEqual({ provider: 'claude', model: 'claude-sonnet-5-5' });
  });

  it('resolves explicit custom provider bindings and rejects unsupported providers', () => {
    const settings = { api_provider: 'openrouter', openai_model: 'gpt-5.2',
      model_by_provider: { openrouter: 'claude-synthetic-model' }, custom_models: { openrouter: ['claude-synthetic-model'] } };
    const before = clone(settings);
    expect(resolveStoredModelSelection(settings)).toEqual({ provider: 'openrouter', model: 'claude-synthetic-model' });
    expect(settings).toEqual(before);
    expect(() => resolveStoredModelSelection({ api_provider: 'unsupported', openai_model: 'gpt-5.2' })).toThrow('Unsupported AI provider');
    expect(resolveStoredModelSelection({ api_provider: 'deepseek', openai_model: 'deepseek-chat', custom_models: { deepseek: ['deepseek-chat'] } })).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });
});
