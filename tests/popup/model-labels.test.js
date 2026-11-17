import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initModels } from '../../popup/settings/models.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { determineProviderAndModel } from '../../scripts/utils/storage/settings-helpers.js';
import { formatModelLabel, getModelMetadata } from '../../scripts/utils/model-catalog.js';

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
  expect([...elements.modelSelect.options].find(option => option.value === 'deepseek-flash-no-thinking').textContent)
    .toBe('DeepSeek V4.1 Flash (no reasoning)');
  expect([...elements.modelSelect.options].find(option => option.value === 'deepseek-v4-pro').textContent)
    .toBe('DeepSeek V4 Pro (text only)');
});

it('keeps an arbitrary custom model name literal', () => {
  expect(formatModelLabel('deepseek', 'sample-private-model-high')).toBe('sample-private-model-high');
});
