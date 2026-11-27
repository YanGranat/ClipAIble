import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initModels } from '../../popup/settings/models.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { determineProviderAndModel } from '../../scripts/utils/storage/settings-helpers.js';
import { formatModelLabel, getModelMetadata, getModelCatalog } from '../../scripts/utils/model-catalog.js';

let dom;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); });

it('shows the served DeepSeek version while retaining its API ID in the selection and settings', async () => {
  dom = new JSDOM('<select id="provider"><option value="deepseek">DeepSeek</option></select><select id="model"></select>');
  for (const name of ['document', 'window', 'Option', 'Element', 'Event', 'HTMLElement', 'HTMLSelectElement']) {
    vi.stubGlobal(name, dom.window[name]);
  }
  const stored = { api_provider: 'deepseek' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, structuredClone(values)));
  const elements = { apiProviderSelect: document.getElementById('provider'), modelSelect: document.getElementById('model') };
  const models = initModels({ elements, STORAGE_KEYS, formatModelLabel: id => formatModelLabel('deepseek', id) });
  await models.updateModelList();

  expect(elements.modelSelect.selectedOptions[0].textContent).toBe('DeepSeek V4.1 Flash');
  expect(elements.modelSelect.value).toBe('deepseek-flash');
  expect(stored.model_by_provider.deepseek).toBe('deepseek-flash');
  expect(determineProviderAndModel(stored)).toEqual({ provider: 'deepseek', model: 'deepseek-flash' });
  expect(getModelMetadata('deepseek', elements.modelSelect.value).apiModel).toBe('deepseek-flash');
  expect([...elements.modelSelect.options].map(option => option.value)).toEqual(['deepseek-flash']);
});

it.each([
  ['deepseek', 'deepseek-flash-no-thinking', 'deepseek-v4-pro', 'deepseek-flash', 'deepseek'],
  ['openrouter', 'deepseek/deepseek-v4.1-flash-no-thinking', 'deepseek/deepseek-v4-pro-0813', 'deepseek/deepseek-v4.1-flash-1017', 'deepseek'],
  ['grok', 'grok-4-1-fast-reasoning', 'grok-4.3', 'grok-4.7', 'grok-'],
  ['openrouter', 'x-ai/grok-4.3', 'x-ai/grok-4.3', 'x-ai/grok-4.7', 'x-ai/grok-']
])('removes old %s presets without applying their hide preference to the fallback', async (provider, oldHidden, oldSelection, current, family) => {
  dom = new JSDOM('<select id="provider"></select><select id="model"></select>');
  for (const name of ['document', 'window', 'Option', 'Element', 'Event', 'HTMLElement', 'HTMLSelectElement']) {
    vi.stubGlobal(name, dom.window[name]);
  }
  const elements = { apiProviderSelect: document.getElementById('provider'), modelSelect: document.getElementById('model') };
  elements.apiProviderSelect.add(new Option(provider, provider));
  const stored = { api_provider: provider, openai_model: oldSelection, model_by_provider: { [provider]: oldSelection },
    hidden_models: { [provider]: [oldHidden] } };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, structuredClone(stored[key])])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, structuredClone(values)));
  const models = initModels({ elements, STORAGE_KEYS, formatModelLabel: id => formatModelLabel(provider, id) });
  await models.updateModelList();
  expect(elements.modelSelect.value).toBe(current);
  expect(stored.model_by_provider[provider]).toBe(current);
  const relevant = [...elements.modelSelect.options].map(option => option.value).filter(id => id.includes(family));
  expect(relevant).toEqual([current]);
  expect(getModelCatalog(provider).some(entry => entry.id === oldHidden || entry.id === oldSelection)).toBe(false);
  expect(stored.hidden_models[provider]).toEqual([oldHidden]);

  stored.custom_models = { [provider]: [oldSelection] };
  stored.hidden_models[provider] = [];
  await models.updateModelList(oldSelection);
  expect(elements.modelSelect.value).toBe(oldSelection);
  expect(elements.modelSelect.selectedOptions[0].dataset.isCustom).toBe('true');
});

it('keeps an arbitrary custom model name literal', () => {
  expect(formatModelLabel('deepseek', 'sample-private-model-high')).toBe('sample-private-model-high');
});
