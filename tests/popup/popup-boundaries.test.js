// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { initState } from '../../popup/core/state.js';
import { initSummary } from '../../popup/core/summary.js';
import { initKeyTheses } from '../../popup/core/key-theses.js';
import { setupPanelHandlers } from '../../popup/handlers/panels.js';
import { setupKeyThesesHandlers } from '../../popup/handlers/key-theses.js';
import { initUI } from '../../popup/ui.js';
import { initModels } from '../../popup/settings/models.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { createGenerationErrorPresenter } from '../../popup/utils/generation-status.js';

vi.mock('../../scripts/locales.js', () => ({
  t: async key => key, tSync: key => key, getUILanguage: async () => 'en',
  UI_LOCALES: { en: {} }, formatMessage: key => key, getLocaleTag: () => 'en'
}));

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });
const noop = () => {};

function generation(initializer, prefix) {
  document.body.innerHTML = `<button id="generate"></button><section id="container"><div id="content"><div id="text"></div></div></section>`;
  const elements = {
    [prefix === 'summary' ? 'generateSummaryBtn' : 'generateKeyThesesBtn']: document.querySelector('#generate'),
    [prefix === 'summary' ? 'summaryContainer' : 'keyThesesContainer']: document.querySelector('#container'),
    [prefix === 'summary' ? 'summaryContent' : 'keyThesesContent']: document.querySelector('#content'),
    [prefix === 'summary' ? 'summaryText' : 'keyThesesText']: document.querySelector('#text')
  };
  const showToast = vi.fn();
  const module = initializer({ elements, STORAGE_KEYS, t: async key => key,
    getUILanguage: async () => 'en', log: noop, logError: noop, logWarn: noop,
    showToast, markdownToHtmlFn: text => text, sanitizeMarkdownHtml: text => text });
  return { module, elements, showToast, check: prefix === 'summary' ? 'checkSummaryStatus' : 'checkKeyThesesStatus' };
}

it('keeps one timer for an unchanged background start and restarts a stopped timer', async () => {
  const stateRefs = { currentStartTime: { current: 100 }, timerInterval: { current: 7 } };
  const startTimerDisplay = vi.fn(start => { stateRefs.currentStartTime.current = start; stateRefs.timerInterval.current = 8; });
  const setStatus = vi.fn();
  const module = initState({ elements: {}, stateRefs, startTimerDisplay, setStatus,
    t: async key => key, setProgress: noop, log: noop, logWarn: noop, logError: noop });
  await module.updateUIFromState({ isProcessing: true, startTime: 100 });
  await module.updateUIFromState({ isProcessing: true, startTime: 100 });
  expect(startTimerDisplay).not.toHaveBeenCalled();
  stateRefs.timerInterval.current = null;
  await module.updateUIFromState({ isProcessing: true, startTime: 100 });
  expect(startTimerDisplay).toHaveBeenCalledTimes(1);
  await module.updateUIFromState({ isProcessing: true, startTime: 200 });
  expect(startTimerDisplay).toHaveBeenCalledTimes(2);
  expect(startTimerDisplay).toHaveBeenLastCalledWith(200);
  expect(setStatus.mock.calls.at(-1)[2]).toBe(200);
});

it('uses the current timer value when processing state omits a start', async () => {
  const setStatus = vi.fn();
  const module = initState({ elements: {}, stateRefs: { currentStartTime: { current: 100 }, timerInterval: { current: 7 } },
    startTimerDisplay: vi.fn(), setStatus, t: async key => key, setProgress: noop, log: noop });
  await module.updateUIFromState({ isProcessing: true });
  expect(setStatus.mock.calls.at(-1)[2]).toBe(100);
});

it('makes closed panels inert, restores them when opened, and returns focus before closing', async () => {
  document.body.innerHTML = '<button id="toggleSettings"></button><section id="settingsPanel"><input id="inside"></section><button id="toggleStats"></button><section id="statsPanel"><button>Clear</button></section>';
  const elements = Object.fromEntries(['toggleSettings', 'settingsPanel', 'toggleStats', 'statsPanel'].map(id => [id, document.getElementById(id)]));
  setupPanelHandlers({ elements });
  expect(elements.settingsPanel.inert).toBe(true);
  expect(elements.statsPanel.inert).toBe(true);
  expect(elements.settingsPanel.getAttribute('aria-hidden')).toBe('true');
  elements.settingsPanel.classList.add('open');
  await Promise.resolve();
  expect(elements.settingsPanel.inert).toBe(false);
  expect(elements.toggleSettings.getAttribute('aria-expanded')).toBe('true');
  document.querySelector('#inside').focus();
  elements.settingsPanel.classList.remove('open');
  await Promise.resolve();
  expect(document.activeElement).toBe(elements.toggleSettings);
  expect(elements.settingsPanel.inert).toBe(true);
});

for (const [initializer, prefix] of [[initSummary, 'summary'], [initKeyTheses, 'key_theses']]) {
  it(`${prefix} acknowledges one failed generation across popup instances without redisplaying an older result`, async () => {
    await chrome.storage.local.set({ [`${prefix}_error`]: 'Earlier attempt failed', [`${prefix}_generation_id`]: 'attempt-a', [`${prefix}_text`]: 'Older article result' });
    const first = generation(initializer, prefix);
    await first.module[first.check]();
    expect(first.showToast).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#container').style.display).toBe('none');
    expect(document.querySelector('#text').textContent).toBe('');
    const reopened = generation(initializer, prefix);
    await reopened.module[reopened.check]();
    expect(reopened.showToast).not.toHaveBeenCalled();
    expect(document.querySelector('#container').style.display).toBe('none');
    await chrome.storage.local.set({ [`${prefix}_generation_id`]: 'attempt-b' });
    await reopened.module[reopened.check]();
    expect(reopened.showToast).toHaveBeenCalledTimes(1);
    await chrome.storage.local.set({ [`${prefix}_error`]: null, [`${prefix}_text`]: 'New successful result' });
    await reopened.module[reopened.check]();
    expect(document.querySelector('#text').textContent).toBe('New successful result');
    expect((await chrome.storage.local.get(`${prefix}_text`))[`${prefix}_text`]).toBe('New successful result');
  });
}

it('allows keyboard activation of the generating button to cancel its exact generation', async () => {
  await chrome.storage.local.set({ key_theses_generating: true, key_theses_generation_id: 'owned-attempt' });
  const { module, elements, check } = generation(initKeyTheses, 'key_theses');
  setupKeyThesesHandlers({ elements, handleGenerateKeyTheses: module.handleGenerateKeyTheses });
  chrome.runtime.sendMessage.mockResolvedValue({ success: true });
  await module[check]();
  const button = elements.generateKeyThesesBtn;
  expect(button.querySelector('[role="button"]')).toBeNull();
  expect(button.getAttribute('aria-label')).toContain('cancel');
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'cancelKeyThesesGeneration', data: { generationId: 'owned-attempt' } }));
});

it('announces transient statuses without taking focus', () => {
  document.body.innerHTML = '<button id="focus">Focused</button>';
  document.querySelector('#focus').focus();
  const module = initUI({ elements: {} });
  module.showToast('Saved');
  const toast = document.querySelector('.toast');
  expect(toast.getAttribute('role')).toBe('status');
  expect(toast.getAttribute('aria-live')).toBe('polite');
  expect(toast.getAttribute('aria-atomic')).toBe('true');
  expect(document.activeElement.id).toBe('focus');
});

it('ignores an old failure snapshot after a replacement generation starts', async () => {
  const showToast = vi.fn();
  const present = createGenerationErrorPresenter('summary', showToast, vi.fn());
  const old = { summary_error: 'Failed', summary_generation_id: 'attempt-a' };
  await chrome.storage.local.set({ summary_generating: true, summary_generation_id: 'attempt-b', summary_error: null });
  await expect(present(old)).resolves.toBeNull();
  expect(showToast).not.toHaveBeenCalled();
  const stored = await chrome.storage.local.get(null);
  expect(stored.summary_generating).toBe(true);
  expect(stored.summary_generation_id).toBe('attempt-b');
  expect(stored.summary_error_seen).toBeUndefined();
});

it('does not show an old toast when a newer generation starts during acknowledgment', async () => {
  const old = { summary_error: 'Failed', summary_generation_id: 'attempt-a' };
  await chrome.storage.local.set(old);
  const showToast = vi.fn();
  const present = createGenerationErrorPresenter('summary', showToast, vi.fn());
  const set = chrome.storage.local.set.getMockImplementation();
  chrome.storage.local.set.mockImplementationOnce(async values => {
    await set(values);
    await set({ summary_generating: true, summary_generation_id: 'attempt-b', summary_error: null });
  });
  await expect(present(old)).resolves.toBeNull();
  expect(showToast).not.toHaveBeenCalled();
  expect((await chrome.storage.local.get('summary_generation_id')).summary_generation_id).toBe('attempt-b');
});

it('restores a hidden built-in through Add without changing its catalog identity', async () => {
  document.body.innerHTML = '<select id="provider"><option>openai</option></select><select id="model"></select>';
  const elements = { apiProviderSelect: document.querySelector('#provider'), modelSelect: document.querySelector('#model') };
  const builtin = 'gpt-6.2-sol';
  await chrome.storage.local.set({ hidden_models: { openai: [builtin], deepseek: ['other-model'] } });
  const models = initModels({ elements, STORAGE_KEYS, formatModelLabel: value => value });
  await models.addCustomModel(builtin);
  const saved = await chrome.storage.local.get(['hidden_models', 'custom_models']);
  expect(saved.hidden_models.openai).not.toContain(builtin);
  expect(saved.hidden_models.deepseek).toEqual(['other-model']);
  expect(saved.custom_models?.openai || []).not.toContain(builtin);
  expect(elements.modelSelect.value).toBe(builtin);
  expect(elements.modelSelect.selectedOptions[0].dataset.isCustom).toBe('false');
});
