import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initModels } from '../../popup/settings/models.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { UI_LOCALES, tSync } from '../../scripts/locales.js';
import { formatModelLabel, getModelCatalog } from '../../scripts/utils/model-catalog.js';
import { getOpenAIRequestConfig } from '../../scripts/api/openai.js';
import { getDeepSeekRequestConfig } from '../../scripts/api/deepseek.js';
import { getOpenRouterRequestConfig } from '../../scripts/api/openrouter.js';

let dom, elements, models;
const selection = 'Sample-NewModel (reasoning: xhigh)';
function initialize() {
  models = initModels({ elements, STORAGE_KEYS,
    formatModelLabel: (value, language) => formatModelLabel(elements.apiProviderSelect.value, value, (key, params) => tSync(key, language, params))
  });
}
beforeEach(async () => {
  dom = new JSDOM('<select id="provider"><option>openai</option><option>openrouter</option><option>claude</option><option>deepseek</option></select><select id="model"></select><div id="dropdown" class="hidden"><div id="options"></div></div>');
  for (const name of ['document', 'window', 'Element', 'Event', 'Option']) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('prompt', vi.fn());
  vi.stubGlobal('alert', vi.fn());
  elements = { apiProviderSelect: document.getElementById('provider'), modelSelect: document.getElementById('model'), customModelDropdown: document.getElementById('dropdown'), customModelOptions: document.getElementById('options') };
  await chrome.storage.local.set({ ui_language: 'ru', api_provider: 'openai' });
  initialize();
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('provider reasoning notation in model selection', () => {
  it.each(['ru', 'ua', 'fr'])('keeps parameter names and values in English in the %s interface', async language => {
    await chrome.storage.local.set({ ui_language: language });
    await models.updateModelList();
    await models.showCustomModelDropdown();
    const medium = elements.customModelOptions.querySelector('[data-model-value="gpt-6.2-sol"] .custom-model-label');
    const high = elements.customModelOptions.querySelector('[data-model-value="gpt-6.2-sol-high"] .custom-model-label');
    expect(medium.textContent).toBe('gpt-6.2-sol (reasoning: medium)');
    expect(high.textContent).toBe('gpt-6.2-sol (reasoning: high)');
    expect(elements.modelSelect.selectedOptions[0].textContent).toBe(medium.textContent);
  });

  it('adds an unknown ID and sends its explicit effort after saving and reopening', async () => {
    prompt.mockReturnValue('  Sample-NewModel (reasoning: XHIGH)  ');
    await models.showAddModelDialog();
    expect(alert).not.toHaveBeenCalled();
    const saved = await chrome.storage.local.get(null);
    expect(saved.custom_models.openai).toEqual([selection]);
    expect(saved.model_by_provider.openai).toBe(selection);
    initialize();
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe(selection);
    expect(elements.modelSelect.selectedOptions[0].textContent).toBe(selection);
    expect(getOpenAIRequestConfig(elements.modelSelect.value)).toMatchObject({ model: 'Sample-NewModel', reasoning_effort: 'xhigh' });
  });

  it('keeps annotated selections separate between providers', async () => {
    await models.addCustomModel(selection);
    elements.apiProviderSelect.value = 'openrouter';
    await chrome.storage.local.set({ api_provider: 'openrouter' });
    await models.updateModelList();
    prompt.mockReturnValue('sample-vendor/Next-Model (reasoning: high)');
    await models.showAddModelDialog();
    const routerSelection = 'sample-vendor/Next-Model (reasoning: high)';
    expect(elements.modelSelect.value).toBe(routerSelection);
    expect(getOpenRouterRequestConfig(routerSelection)).toMatchObject({ model: 'sample-vendor/Next-Model', reasoning: { effort: 'high' } });
    elements.apiProviderSelect.value = 'openai';
    await models.updateModelList();
    expect(elements.modelSelect.value).toBe(selection);
    const saved = await chrome.storage.local.get(null);
    expect(saved.custom_models).toMatchObject({ openai: [selection], openrouter: [routerSelection] });
  });

  it('restores an equivalent hidden preset without adding a custom duplicate', async () => {
    await chrome.storage.local.set({ hidden_models: { openai: ['gpt-5.2-high', 'gpt-6.2-astra-high'], openrouter: ['openai/gpt-6.2-sol-high'] } });
    await models.updateModelList();
    prompt.mockReturnValue('gpt-6.2-sol (reasoning: high)');
    await models.showAddModelDialog();
    const saved = await chrome.storage.local.get(null);
    expect(saved.custom_models?.openai || []).toEqual([]);
    expect(saved.hidden_models.openai).toEqual(['gpt-6.2-astra-high']);
    expect(saved.hidden_models.openrouter).toEqual(['openai/gpt-6.2-sol-high']);
    expect(elements.modelSelect.value).toBe('gpt-6.2-sol-high');
    expect([...elements.modelSelect.options].filter(option => option.value === 'gpt-6.2-sol-high')).toHaveLength(1);
  });

  it('selects an existing visible preset instead of classifying it as custom', async () => {
    await models.updateModelList();
    await models.addCustomModel('gpt-6.2-sol (reasoning: high)');
    expect(elements.modelSelect.value).toBe('gpt-6.2-sol-high');
    expect((await chrome.storage.local.get(null)).custom_models?.openai || []).toEqual([]);
  });

  it('detects duplicate annotations after effort spacing and case normalization', async () => {
    await models.addCustomModel(selection);
    prompt.mockReturnValue('Sample-NewModel ( Reasoning : XHIGH )');
    await models.showAddModelDialog();
    expect(alert).toHaveBeenCalledOnce();
    expect((await chrome.storage.local.get(null)).custom_models.openai).toEqual([selection]);
  });

  it('preserves an existing equivalent custom ID while restoring it', async () => {
    const previous = 'Sample-NewModel (reasoning: XHIGH)';
    await chrome.storage.local.set({ custom_models: { openai: [previous] }, hidden_models: { openai: [previous] } });
    prompt.mockReturnValue(selection);
    await models.showAddModelDialog();
    const saved = await chrome.storage.local.get(null);
    expect(saved.custom_models.openai).toEqual([previous]);
    expect(saved.hidden_models.openai).toEqual([]);
    expect(elements.modelSelect.value).toBe(previous);
    expect(elements.modelSelect.selectedOptions[0].textContent).toBe(selection);
  });

  it.each(['Sample-NewModel (reasoning: xhgh)', 'Sample-NewModel (reasoning:)', 'Sample-NewModel (reasoning: high) trailing'])('rejects malformed reserved input before changing storage: %s', async value => {
    const before = await chrome.storage.local.get(null);
    prompt.mockReturnValue(value);
    await models.showAddModelDialog();
    expect(alert).toHaveBeenCalledOnce();
    expect(await chrome.storage.local.get(null)).toEqual(before);
  });

  it('validates direct additions and the import-compatible total length', async () => {
    await expect(models.addCustomModel('Sample-NewModel (reasoning: xhgh)')).rejects.toThrow();
    await expect(models.addCustomModel('a'.repeat(4090) + ' (reasoning: high)')).rejects.toThrow();
    expect((await chrome.storage.local.get(null)).custom_models).toBeUndefined();
  });

  it('keeps malformed imported entries visible and removable', async () => {
    const malformed = 'Sample-NewModel (reasoning: xhgh)';
    await chrome.storage.local.set({ custom_models: { openai: [malformed] }, model_by_provider: { openai: malformed } });
    await expect(models.updateModelList()).resolves.toBeUndefined();
    await models.showCustomModelDropdown();
    expect(elements.modelSelect.value).toBe(malformed);
    expect(elements.customModelOptions.textContent).toContain(malformed);
    expect(() => getOpenAIRequestConfig(malformed)).toThrow();
    await models.removeCustomModel(malformed);
    expect((await chrome.storage.local.get(null)).custom_models.openai).toEqual([]);
  });

  it('tolerates malformed hidden entries while rendering a valid custom model', async () => {
    await chrome.storage.local.set({ hidden_models: { openai: ['BrokenModel (reasoning: typo)'] }, custom_models: { openai: [selection] } });
    await models.updateModelList();
    await models.showCustomModelDropdown();
    expect([...elements.modelSelect.options].map(option => option.value)).toContain(selection);
    expect(elements.customModelOptions.textContent).toContain(selection);
  });

  it('accepts the exact managed DeepSeek display label as the same preset', async () => {
    elements.apiProviderSelect.value = 'deepseek';
    await chrome.storage.local.set({ api_provider: 'deepseek' });
    await models.updateModelList();
    const preset = getModelCatalog('deepseek').find(entry => entry.reasoningEnabled === true);
    expect(preset).toBeTruthy();
    await models.hideDefaultModel(preset.id);
    prompt.mockReturnValue(formatModelLabel('deepseek', preset.id, (key, params) => tSync(key, 'ru', params)));
    await models.showAddModelDialog();
    const saved = await chrome.storage.local.get(null);
    expect(elements.modelSelect.value).toBe(preset.id);
    expect(saved.custom_models?.deepseek || []).toEqual([]);
    expect(saved.hidden_models.deepseek).not.toContain(preset.id);
    expect(alert).not.toHaveBeenCalled();
  });

  it('keeps explicitly entered DeepSeek reasoning settings separate from the built-in menu', async () => {
    elements.apiProviderSelect.value = 'deepseek';
    await chrome.storage.local.set({ api_provider: 'deepseek' });
    await models.updateModelList();
    expect([...elements.modelSelect.options].map(option => option.value)).toEqual(['deepseek-flash']);
    const custom = 'deepseek-flash (reasoning: none)';
    prompt.mockReturnValue(custom);
    await models.showAddModelDialog();
    expect(elements.modelSelect.value).toBe(custom);
    expect((await chrome.storage.local.get(null)).custom_models.deepseek).toEqual([custom]);
    expect(getDeepSeekRequestConfig(custom)).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' } });
  });

  it('rejects a known unsupported level instead of silently changing it', async () => {
    prompt.mockReturnValue('gpt-6.2-sol (reasoning: none)');
    await models.showAddModelDialog();
    expect(alert).toHaveBeenCalledWith(UI_LOCALES.ru.errorModelReasoningInvalid);
    expect((await chrome.storage.local.get(null)).custom_models).toBeUndefined();
  });

  it('explains the same literal annotation syntax in every existing locale', () => {
    for (const locale of Object.values(UI_LOCALES)) {
      expect(locale.addModelPrompt).toContain('(reasoning: high)');
      expect(locale.errorModelReasoningInvalid).toContain('(reasoning: high)');
    }
  });
});
