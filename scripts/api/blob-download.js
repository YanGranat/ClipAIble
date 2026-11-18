// @ts-check
import { setupOffscreenDocument } from './offscreen-document.js';
import { putDownload, removeDownload, pruneExpiredDownloads } from './download-storage.js';
import { getProcessingSignal } from '../state/processing.js';
import { CONFIG } from '../utils/config.js';
import { logWarn } from '../utils/logging.js';

/** Keep the offscreen Blob URL alive until this exact download terminates. */
export async function downloadBlob(blob, filename, processingRunId) {
  const operationId = crypto.randomUUID();
  const runId = processingRunId ?? null;
  const signal = processingRunId === undefined ? null : getProcessingSignal(processingRunId);
  const check = () => {
    if (finished) throw new DOMException('Download operation ended', 'AbortError');
    if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError');
  };
  const message = type => chrome.runtime.sendMessage({ target: 'offscreen', type, data: { operationId, processingRunId: runId } });
  let downloadId;
  let listener;
  let timer;
  let rejectPending;
  const abort = () => rejectPending?.(signal.reason || new DOMException('Cancelled', 'AbortError'));
  const cancelled = new Promise((_, reject) => { rejectPending = reject; });
  let finished = false;
  const work = (async () => {
    check();
    await pruneExpiredDownloads(); check();
    await putDownload(operationId, { blob, processingRunId: runId, expiresAt: Date.now() + CONFIG.API_TIMEOUT_MS });
    if (finished) { await removeDownload(operationId); return; }
    check(); await setupOffscreenDocument(); check();
    const response = await message('CREATE_DOWNLOAD_URL'); check();
    if (!response?.success || typeof response.url !== 'string' || !response.url.startsWith(`blob:${chrome.runtime.getURL('')}`)) throw new Error('Download URL unavailable');
    return new Promise((resolve, reject) => {
      let terminal;
      const inspect = item => {
        if (!item || item.id !== downloadId) return;
        const state = item.state?.current || item.state;
        if (state === 'complete') resolve(downloadId);
        else if (state === 'interrupted') reject(Object.assign(new Error('Download interrupted'), { code: 'DOWNLOAD_INTERRUPTED' }));
      };
      listener = delta => { if (downloadId === undefined) terminal = delta; else inspect(delta); };
      chrome.downloads.onChanged.addListener(listener);
      chrome.downloads.download({ url: response.url, filename, saveAs: true }).then(async id => {
        downloadId = id;
        if (finished || signal?.aborted) { await chrome.downloads.cancel(id).catch(() => {}); return; }
        inspect(terminal);
        const [item] = await chrome.downloads.search({ id }); inspect(item);
      }).catch(reject);
    });
  })();
  signal?.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => rejectPending(Object.assign(new Error('Download timed out'), { translationKey: 'errorTimeout', translationParams: {} })), CONFIG.API_TIMEOUT_MS);
  let successful = false;
  try { const result = await Promise.race([work, cancelled]); successful = true; return result; }
  finally {
    finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
    if (listener) chrome.downloads.onChanged.removeListener(listener);
    if (downloadId !== undefined && !successful) await chrome.downloads.cancel(downloadId).catch(() => {});
    await message('RELEASE_DOWNLOAD_URL').catch(error => logWarn('Download URL cleanup failed', { error: error.message }));
    await removeDownload(operationId).catch(error => logWarn('Download data cleanup failed', { error: error.message }));
  }
}
