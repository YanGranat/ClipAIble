// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { initKeyTheses } from '../../popup/core/key-theses.js';
import { initSummary } from '../../popup/core/summary.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';

let elements, store, module, translate, deps;
beforeEach(() => {
  vi.resetAllMocks();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  store = { key_theses_generating: true, key_theses_generation_id: 'generation-a' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, store[key]])));
  chrome.runtime.sendMessage.mockImplementation(async request => {
    if (request.action === 'cancelKeyThesesGeneration') store.key_theses_generating = false;
    return { success: true, generationId: 'generation-a' };
  });
  const noop = vi.fn();
  translate = vi.fn(async key => key);
  deps = { elements, STORAGE_KEYS, t: (...args) => translate(...args), getUILanguage: async () => 'en',
    showToast: noop, log: noop, logWarn: noop, logError: noop, decryptApiKey: async value => value,
    getProviderFromModel: () => 'openai', detectVideoPlatform: () => null,
    markdownToHtmlFn: text => text, sanitizeMarkdownHtml: text => text };
  module = initKeyTheses(deps);
});

it('does not restore the generating view from a status read taken before confirmed cancellation', async () => {
  await module.checkKeyThesesStatus();
  expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(true);
  let release;
  const previous = { ...store };
  chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(previous); }));
  const oldRead = module.checkKeyThesesStatus();
  await module.handleGenerateKeyTheses({ target: elements.generateKeyThesesBtn.querySelector('.key-theses-cancel') });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'cancelKeyThesesGeneration', data: { generationId: 'generation-a' } });
  expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(false);
  release(); await oldRead;
  expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(false);
  expect(elements.generateKeyThesesBtn.textContent).toBe('generateKeyTheses');
});

it('does not repaint an old generating label when its translation arrives after cancellation', async () => {
  await module.checkKeyThesesStatus();
  let release;
  translate.mockImplementation(key => key === 'generatingKeyTheses'
    ? new Promise(resolve => { release = () => resolve(key); }) : Promise.resolve(key));
  const oldRead = module.checkKeyThesesStatus();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await module.handleGenerateKeyTheses({ target: elements.generateKeyThesesBtn.querySelector('.key-theses-cancel') });
  release(); await oldRead;
  expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(false);
  expect(elements.generateKeyThesesBtn.textContent).toBe('generateKeyTheses');
});

it('localizes a browser transport error while cancelling Key Theses', async () => {
  await module.checkKeyThesesStatus();
  chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
  await module.handleGenerateKeyTheses({ target: elements.generateKeyThesesBtn.querySelector('.key-theses-cancel') });
  expect(deps.showToast).toHaveBeenCalledWith('errorCommunicationFailed', 'error', { key: 'errorCommunicationFailed', params: {} });
});

it('keeps the latest completed result when an older generating status read arrives last', async () => {
  let release;
  const previous = { ...store };
  chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(previous); }));
  const oldRead = module.checkKeyThesesStatus();
  store.key_theses_generating = false;
  store.key_theses_text = 'Completed key claims.';
  await module.checkKeyThesesStatus();
  release(); await oldRead;
  expect(elements.generateKeyThesesBtn.classList.contains('key-theses-generating')).toBe(false);
  expect(elements.keyThesesText.dataset.originalMarkdown).toBe('Completed key claims.');
});

it('keeps the latest Summary result actionable when an older generating read arrives last', async () => {
  const summary = initSummary(deps);
  store.summary_generating = true;
  let release;
  const previous = { ...store };
  chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(previous); }));
  const oldRead = summary.checkSummaryStatus();
  store.summary_generating = false;
  store.summary_text = 'Completed summary.';
  await summary.checkSummaryStatus();
  release(); await oldRead;
  expect(elements.generateSummaryBtn.disabled).toBe(false);
  expect(elements.generateSummaryBtn.textContent).toBe('generateSummary');
  expect(elements.summaryText.dataset.originalMarkdown).toBe('Completed summary.');
});
