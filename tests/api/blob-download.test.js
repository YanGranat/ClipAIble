import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../scripts/api/blob-download.js';
import { putDownload, removeDownload } from '../../scripts/api/download-storage.js';
const owner = vi.hoisted(() => ({ controller: null }));
vi.mock('../../scripts/state/processing.js', () => ({ getProcessingSignal: () => owner.controller.signal }));
vi.mock('../../scripts/api/offscreen-document.js', () => ({ setupOffscreenDocument: async () => {} }));
vi.mock('../../scripts/api/download-storage.js', () => ({ putDownload: vi.fn(), removeDownload: vi.fn(), pruneExpiredDownloads: async () => {} }));
let listeners;
beforeEach(() => {
  vi.clearAllMocks(); owner.controller = new AbortController(); listeners = new Set();
  putDownload.mockResolvedValue(); removeDownload.mockResolvedValue();
  vi.stubGlobal('chrome', { runtime: {
    getURL: path => `chrome-extension://sample/${path}`,
    sendMessage: vi.fn(async message => ({ success: true, url: `blob:chrome-extension://sample/${message.data.operationId}` }))
  }, downloads: {
    download: vi.fn(async () => 7), search: vi.fn(async () => [{ id: 7, state: 'in_progress' }]), cancel: vi.fn(async () => {}),
    onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
  } });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the Blob alive after download admission and releases it only on completion', async () => {
  const pending = downloadBlob(new Blob(['sample']), 'example.wav', 'owner-a');
  await vi.waitFor(() => expect(chrome.downloads.download).toHaveBeenCalledOnce());
  expect(removeDownload).not.toHaveBeenCalled();
  expect(chrome.runtime.sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['CREATE_DOWNLOAD_URL']);
  for (const listener of listeners) listener({ id: 99, state: { current: 'complete' } });
  expect(removeDownload).not.toHaveBeenCalled();
  for (const listener of listeners) listener({ id: 7, state: { current: 'complete' } });
  await expect(pending).resolves.toBe(7);
  expect(chrome.runtime.sendMessage.mock.calls.at(-1)[0].type).toBe('RELEASE_DOWNLOAD_URL');
  expect(removeDownload).toHaveBeenCalledExactlyOnceWith(putDownload.mock.calls[0][0]);
  expect(listeners.size).toBe(0);
});

it('observes an already completed download when its terminal event preceded the returned id', async () => {
  chrome.downloads.search.mockResolvedValue([{ id: 7, state: 'complete' }]);
  await expect(downloadBlob(new Blob(['sample']), 'example.wav', 'owner-a')).resolves.toBe(7);
  expect(listeners.size).toBe(0);
});

it('cancels only its captured download and ignores a late start response', async () => {
  let start;
  chrome.downloads.download.mockImplementation(() => new Promise(resolve => { start = resolve; }));
  const pending = downloadBlob(new Blob(['sample']), 'example.wav', 'owner-a').catch(error => error);
  await vi.waitFor(() => expect(start).toBeTypeOf('function'));
  owner.controller.abort(); await pending;
  start(7);
  await vi.waitFor(() => expect(chrome.downloads.cancel).toHaveBeenCalledExactlyOnceWith(7));
  expect(listeners.size).toBe(0);
});
