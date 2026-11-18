import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

let connected;
beforeEach(() => {
  vi.resetModules();
  chrome.runtime.onConnect = { addListener: callback => { connected = callback; } };
});

function port(sender, name = 'clipaible_popup') {
  const listeners = [];
  return { sender, name, disconnect: vi.fn(), onDisconnect: { addListener: callback => listeners.push(callback) }, close: () => listeners.forEach(callback => callback()) };
}

it('does not count an untrusted web port as an open popup', async () => {
  const { initPopupConnectionListener, isPopupOpen } = await import('../../scripts/background/popup-connection.js');
  initPopupConnectionListener();
  const external = port({ id: 'test-extension-id', tab: { id: 1 }, url: 'https://example.org/' });
  connected(external);
  expect(external.disconnect).toHaveBeenCalledOnce();
  expect(isPopupOpen()).toBe(false);
});

it('keeps the replacement popup open when an older trusted popup closes', async () => {
  const { initPopupConnectionListener, isPopupOpen } = await import('../../scripts/background/popup-connection.js');
  initPopupConnectionListener();
  const sender = { id: 'test-extension-id', url: 'chrome-extension://test-extension-id/popup/popup.html' };
  const first = port(sender), second = port(sender), logs = port(sender, 'clipaible_logs');
  connected(first); connected(second); connected(logs);
  expect(isPopupOpen()).toBe(true);
  first.close();
  expect(isPopupOpen()).toBe(true);
  second.close();
  expect(isPopupOpen()).toBe(false);
  logs.close();
  expect(isPopupOpen()).toBe(false);
});
