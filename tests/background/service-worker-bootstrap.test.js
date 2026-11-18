import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const startup = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock('../../scripts/background/initialization.js', async original => ({
  ...(await original()), initInitialization: () => startup.initialize
}));
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

beforeEach(() => {
  vi.clearAllMocks();
  startup.initialize.mockReset().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('self', new EventTarget());
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/116.0.0.0' });
  vi.stubGlobal('chrome', { ...chrome,
    tabs: { ...chrome.tabs, onRemoved: { addListener: vi.fn() } },
    runtime: { ...chrome.runtime, onConnect: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
    contextMenus: { ...chrome.contextMenus, removeAll: vi.fn().mockResolvedValue(undefined), onClicked: { addListener: vi.fn() } }
  });
  vi.resetModules();
});

it('registers menu and startup listeners while asynchronous initialization is still pending', async () => {
  vi.useFakeTimers();
  await import('../../scripts/background.js');
  expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledOnce();
  expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledOnce();
  expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledOnce();
  expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
}, 20000);

it('shows one startup error for a failed context click and preserves another active run', async () => {
  startup.initialize.mockRejectedValue(new Error('Storage unavailable'));
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'fr' });
  chrome.notifications.create.mockImplementation((_options, callback) => callback('sample-notification'));
  await import('../../scripts/background.js');
  await vi.waitFor(() => expect(startup.initialize).toHaveBeenCalledOnce());
  const state = await import('../../scripts/state/processing.js');
  await state.startProcessing(vi.fn());
  const activeRun = state.getProcessingRunId();
  try {
    chrome.contextMenus.onClicked.addListener.mock.calls[0][0]({ menuItemId: 'save-as-markdown' }, { id: 7, url: 'https://example.org/article' });
    await vi.waitFor(() => expect(chrome.notifications.create).toHaveBeenCalledOnce());
    const { tSync } = await import('../../scripts/locales.js');
    expect(chrome.notifications.create.mock.calls[0][0].message).toBe(tSync('errorBackgroundInitializationFailed', 'fr'));
    expect(startup.initialize).toHaveBeenCalledTimes(2);
    expect(state.getProcessingRunId()).toBe(activeRun);
    expect(state.getProcessingState()).toMatchObject({ isProcessing: true, error: null });
    const respond = vi.fn();
    chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0]({ action: 'getState' }, { id: chrome.runtime.id }, respond);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0]).toMatchObject({ translationKey: 'errorBackgroundInitializationFailed' });
    expect(startup.initialize).toHaveBeenCalledTimes(2);
    expect(chrome.notifications.create).toHaveBeenCalledOnce();
  } finally { state.resetState(); }
}, 20000);
