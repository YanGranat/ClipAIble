import { beforeEach, expect, it, vi } from 'vitest';
import { extractPageContent, handleQuickSaveError, showQuickSaveNotification } from '../../scripts/utils/processing/processing-helpers.js';
import { clearUILanguageCache } from '../../scripts/utils/processing/pipeline-helpers.js';
import { tSync } from '../../scripts/locales.js';

beforeEach(() => { clearUILanguageCache(); });

it.each([
  ['en', 'pdf', 'PDF'],
  ['ja', 'pdf', 'PDF'],
  ['zh', 'markdown', 'Markdown']
])('uses a format name in the Quick Save notification in %s', async (language, format, label) => {
  await chrome.storage.local.set({ ui_language: language });
  const notify = vi.fn();
  await showQuickSaveNotification(format, notify);
  expect(notify).toHaveBeenCalledWith(tSync('quickSaveStarted', language, { format: label }));
});

it('uses a standalone action for audio rather than inserting a noun into the format message', async () => {
  await chrome.storage.local.set({ ui_language: 'ko' });
  const notify = vi.fn();
  await showQuickSaveNotification('audio', notify);
  expect(notify).toHaveBeenCalledWith('오디오 저장 중…');
});

it('retains the localized instruction when the source tab closes mid-capture', async () => {
  await chrome.storage.local.set({ ui_language: 'ua' });
  chrome.tabs.get.mockResolvedValueOnce({ id:7, url:'https://example.test/article' }).mockRejectedValueOnce(new Error('No tab with id: 7'));
  const error = await extractPageContent(7).catch(error => error);
  const notify = vi.fn();
  await handleQuickSaveError(error, notify);
  expect(notify).toHaveBeenCalledWith(tSync('errorTabClosedDuringProcessing', 'ua'));
});

it('supplies the native PDF MIME for Quick Save when capture cannot access the viewer', async () => {
  const tab = { id: 7, url: 'https://example.test/storage/report', title: 'Report' };
  chrome.tabs.get.mockResolvedValueOnce(tab).mockResolvedValueOnce(tab).mockResolvedValueOnce(tab);
  chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access contents'));
  const existingNavigation = chrome.webNavigation;
  chrome.webNavigation = { getAllFrames: vi.fn(async () => [
    { frameId: 0, parentFrameId: -1, url: tab.url },
    { frameId: 1, parentFrameId: 0, url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html' }
  ]) };
  try {
    expect(await extractPageContent(7)).toMatchObject({ html: '', url: tab.url, title: tab.title,
      tabId: 7, sourceContentType: 'application/pdf' });
  } finally {
    chrome.webNavigation = existingNavigation;
  }
});

it('admits the built-in PDF viewer through the native file acquisition flow for Quick Save', async () => {
  const url = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=file%3A%2F%2F%2Freports%2Fsurvey.pdf';
  chrome.tabs.get.mockResolvedValueOnce({ id: 7, url, title: 'Survey' });
  expect(await extractPageContent(7)).toMatchObject({ html: '', url, title: 'Survey', sourceContentType: 'application/pdf' });
});

it('localizes both a typed failure and an unexpected browser error', async () => {
  await chrome.storage.local.set({ ui_language: 'ja' });
  const notify = vi.fn();
  await handleQuickSaveError(new Error('Receiving end does not exist.'), notify);
  await handleQuickSaveError(Object.assign(new Error('Details'), { translationKey: 'errorProcessingNotStarted' }), notify);
  expect(notify.mock.calls).toEqual([[tSync('errorUnknown', 'ja')], [tSync('errorProcessingNotStarted', 'ja')]]);
});
