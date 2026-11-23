// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { initProcessing } from '../../popup/core/processing.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { t } from '../../scripts/locales.js';

let elements, processing, status, polling, toast;
const page = { html: '<article><p>A complete article observation.</p></article>', url: 'https://example.test/observation', title: 'Field observation' };
beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  elements.modeSelect.value = 'automatic';
  elements.mainFormatSelect.value = 'markdown';
  elements.apiProviderSelect.value = 'claude';
  elements.apiKey.value = 'synthetic-key'; elements.apiKey.dataset.provider = 'claude';
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'en' });
  chrome.tabs.query = vi.fn(async () => [{ id: 5, url: page.url, title: page.title }]);
  chrome.tabs.sendMessage = vi.fn(async () => page);
  chrome.runtime.sendMessage.mockResolvedValue({ started: true });
  status = vi.fn(); polling = vi.fn(); toast = vi.fn();
  const noop = vi.fn();
  processing = initProcessing({ elements, t, setStatus: status, setProgress: noop, showToast: toast,
    log: noop, logError: noop, logWarn: noop, stopTimerDisplay: noop, decryptApiKey: async value => value,
    getProviderFromModel: () => 'claude', startStatePolling: polling, checkProcessingState: async () => {}, stateRefs: {} });
});

it.each([{ started: false }, undefined, { error: { message: 'Unavailable' } }])('does not report admission for an unsuccessful response: %j', async response => {
  chrome.runtime.sendMessage.mockResolvedValue(response);
  await processing.handleSavePdf();
  expect(polling).not.toHaveBeenCalled();
  expect(status.mock.lastCall[0]).toBe('error');
  expect(status.mock.lastCall[3]).toMatchObject({ key: 'errorProcessingNotStarted' });
  expect(elements.savePdfBtn.disabled).toBe(false);
  expect(toast).toHaveBeenCalled();
});

it('restores the idle controls when the provider changes before admission', async () => {
  let release;
  chrome.tabs.sendMessage.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'), { timeout: 2000 });
  expect(elements.savePdfBtn.disabled).toBe(true);
  elements.apiProviderSelect.value = 'openai';
  release(page);
  await operation;
  expect(chrome.runtime.sendMessage.mock.calls.some(([packet]) => packet.action === 'processArticle')).toBe(false);
  expect(elements.savePdfBtn.disabled).toBe(false);
  expect(status.mock.lastCall[0]).toBe('ready');
  expect(polling).not.toHaveBeenCalled();
});

it('keeps an admitted operation active until its state is polled', async () => {
  await processing.handleSavePdf();
  expect(polling).toHaveBeenCalledOnce();
  expect(elements.savePdfBtn.disabled).toBe(true);
  expect(toast).not.toHaveBeenCalled();
});

it('keeps the current controls and shows an error when the worker rejects cancellation', async () => {
  elements.cancelBtn.classList.remove('hidden');
  elements.cancelBtn.style.display = 'block';
  elements.savePdfBtn.disabled = true;
  chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'Background initialization failed', translationKey: 'errorBackgroundInitializationFailed' });
  await processing.handleCancel();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'cancelProcessing' });
  expect(toast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error', { key: 'errorBackgroundInitializationFailed', params: {} });
  expect(status).not.toHaveBeenCalled();
  expect(elements.cancelBtn.disabled).toBe(false);
  expect(elements.cancelBtn.classList.contains('hidden')).toBe(false);
  expect(elements.savePdfBtn.disabled).toBe(true);
});

it('reports cancellation only after the worker confirms a run was cancelled', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true, cancelledRunId: 'run-id' });
  await processing.handleCancel();
  expect(toast).not.toHaveBeenCalled();
  await processing.handleCancel();
  expect(toast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'success', { key: 'processingCancelled' });
  expect(status).toHaveBeenCalledWith('ready', expect.any(String), undefined, { key: 'ready' });
});

it('continues tracking an admitted job when provider selection changes during its acknowledgement', async () => {
  let acknowledge;
  chrome.runtime.sendMessage.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'), { timeout: 2000 });
  elements.apiProviderSelect.value = 'openai';
  acknowledge({ started: true });
  await operation;
  expect(polling).toHaveBeenCalledOnce();
  expect(elements.savePdfBtn.disabled).toBe(true);
  expect(status.mock.calls.some(([kind]) => kind === 'ready')).toBe(false);
});

it.each(['file:///C:/samples/observations.pdf', 'file:///C:/samples/observations.PDF?download=1#page=2'])('admits a local PDF without requiring readable page HTML: %s', async url => {
  const tab = { id: 5, url, title: 'Independent observations' };
  chrome.tabs.query.mockResolvedValue([tab]);
  chrome.tabs.get = vi.fn(async () => tab);
  chrome.tabs.sendMessage.mockRejectedValue(new Error('File access is disabled'));
  chrome.scripting.executeScript.mockRejectedValue(new Error('File access is disabled'));
  await processing.handleSavePdf();
  const packet = chrome.runtime.sendMessage.mock.calls.find(([value]) => value.action === 'processArticle')?.[0];
  expect(packet?.data).toMatchObject({ url, title: tab.title, tabId: 5, mode: 'automatic' });
  expect(packet.data.html).toBe('<!doctype html><html><body></body></html>');
  expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(polling).toHaveBeenCalledOnce();
});

it.each([
  ['file:///C:/samples/observations.html', 'observations.pdf'],
  ['file:///C:/samples/observations.html?file=observations.pdf', 'PDF document'],
  ['file:///C:/samples/observations.html?type=pdf', 'PDF document'],
  ['https://example.org/observations.pdf', 'Independent observations']
])('continues to acquire HTML for a nonlocal-PDF URL %s', async (url, title) => {
  chrome.tabs.query.mockResolvedValue([{ id: 5, url, title }]);
  chrome.tabs.sendMessage.mockResolvedValue({ ...page, url, title });
  await processing.handleSavePdf();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { action: 'extractContent' });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'processArticle', data: expect.objectContaining({ url, html: page.html }) }));
});

it.each(['navigated', 'closed'])('does not dispatch a captured local PDF after its tab has %s', async outcome => {
  const tab = { id: 5, url: 'file:///C:/samples/observations.pdf', title: 'Independent observations' };
  chrome.tabs.query.mockResolvedValue([tab]);
  chrome.tabs.get = outcome === 'closed' ? vi.fn(async () => { throw new Error('Tab was closed'); }) : vi.fn(async () => ({ ...tab, url: 'file:///C:/samples/another.pdf' }));
  await processing.handleSavePdf();
  expect(chrome.runtime.sendMessage.mock.calls.some(([packet]) => packet.action === 'processArticle')).toBe(false);
  expect(polling).not.toHaveBeenCalled();
  expect(elements.savePdfBtn.disabled).toBe(false);
  expect(status.mock.lastCall[0]).toBe('error');
});

it('abandons local PDF admission when its provider changes during the tab check', async () => {
  const tab = { id: 5, url: 'file:///C:/samples/observations.pdf', title: 'Independent observations' };
  chrome.tabs.query.mockResolvedValue([tab]);
  let release;
  chrome.tabs.get = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'), { timeout: 2000 });
  elements.apiProviderSelect.value = 'openai';
  release(tab);
  await operation;
  expect(chrome.runtime.sendMessage.mock.calls.some(([packet]) => packet.action === 'processArticle')).toBe(false);
  expect(polling).not.toHaveBeenCalled();
  expect(elements.savePdfBtn.disabled).toBe(false);
  expect(status.mock.lastCall[0]).toBe('ready');
});
