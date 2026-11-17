// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { tSync } from '../../scripts/locales.js';
import { getLargeData, removeLargeData } from '../../scripts/utils/storage.js';

vi.mock('../../scripts/utils/storage.js', () => ({ getLargeData: vi.fn(), removeLargeData: vi.fn(async () => {}) }));
afterEach(() => vi.unstubAllGlobals());

it('localizes a missing print document and forwards its identity in the owned failure packet', async () => {
  const job = '00000000-0000-4000-8000-000000000001';
  const run = '00000000-0000-4000-8000-000000000002';
  vi.stubGlobal('location', { href: `chrome-extension://sample/print/print.html?job=${job}` });
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'ru' });
  chrome.runtime.sendMessage.mockResolvedValue({ success: true });
  getLargeData.mockResolvedValue({ html: '', processingRunId: run });
  document.body.innerHTML = '<h1 id="pageTitle"></h1><p id="loadingText"></p>';
  await import('../../print/print.js');
  await vi.waitFor(() => expect(document.body.textContent).toContain(tSync('errorPrintContentUnavailable', 'ru')));
  const packets = chrome.runtime.sendMessage.mock.calls.map(([value]) => value).filter(value => value.action === 'printJobFailed');
  expect(packets).toEqual([{ action: 'printJobFailed', data: { printJobId: job, processingRunId: run, error: 'No content in storage', translationKey: 'errorPrintContentUnavailable', translationParams: {} } }]);
  expect(document.documentElement.lang).toBe('ru');
  expect(document.body.textContent).not.toContain('No content in storage');
  expect(removeLargeData).toHaveBeenCalledWith(`printJob:${job}`);
});
