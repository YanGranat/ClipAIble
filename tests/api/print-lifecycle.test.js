import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeOwnedPrintTab } from '../../scripts/api/print-lifecycle.js';

describe('print tab cleanup', () => {
  beforeEach(() => {
    chrome.tabs.get = vi.fn(async () => ({ id: 12, url: `${chrome.runtime.getURL('print/print.html')}?job=owner-a` }));
    chrome.tabs.remove = vi.fn(async () => {});
  });
  it('closes the captured job', async () => {
    await closeOwnedPrintTab(12, 'owner-a'); expect(chrome.tabs.remove).toHaveBeenCalledWith(12);
  });
  it.each(['https://example.org/article', 'chrome-extension://another/print/print.html?job=owner-a'])('preserves a navigated or foreign tab: %s', async url => {
    chrome.tabs.get.mockResolvedValue({ id: 12, url });
    await closeOwnedPrintTab(12, 'owner-a'); expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
  it('preserves a replacement job in the same tab', async () => {
    chrome.tabs.get.mockResolvedValue({ id: 12, url: `${chrome.runtime.getURL('print/print.html')}?job=owner-b` });
    await closeOwnedPrintTab(12, 'owner-a'); expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
  it('is idempotent when the tab has already closed', async () => {
    chrome.tabs.get.mockRejectedValue(new Error('No tab'));
    await expect(closeOwnedPrintTab(12, 'owner-a')).resolves.toBeUndefined();
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });
});
