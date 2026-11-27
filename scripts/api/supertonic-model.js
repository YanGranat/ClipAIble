// @ts-check
import { setupOffscreenDocument } from './offscreen-document.js';
import { getDownload, removeDownload } from './download-storage.js';
import { isSupertonicInstalled } from '../offscreen/supertonic/assets.js';
import { SUPERTONIC_DOWNLOAD_BYTES, SUPERTONIC_MODEL_STATUS_KEY } from './supertonic-config.js';

/** @typedef {{state:'missing'|'downloading'|'ready'|'deleting'|'error', loaded?:number, total?:number}} SupertonicModelStatus */

export async function getSupertonicModelStatus() {
  const stored = await chrome.storage.local.get(SUPERTONIC_MODEL_STATUS_KEY);
  const status = /** @type {SupertonicModelStatus|undefined} */ (stored[SUPERTONIC_MODEL_STATUS_KEY]);
  if (['downloading', 'deleting'].includes(status?.state)) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
    if (contexts.length) {
      const active = await supertonicMessage('SUPERTONIC_STATUS', null).catch(() => null);
      if (active?.status) return /** @type {SupertonicModelStatus} */ (active.status);
    }
  }
  if (await isSupertonicInstalled()) return /** @type {SupertonicModelStatus} */ ({ state: 'ready', loaded: SUPERTONIC_DOWNLOAD_BYTES, total: SUPERTONIC_DOWNLOAD_BYTES });
  return /** @type {SupertonicModelStatus} */ ({ state: status?.state === 'error' ? 'error' : 'missing', total: SUPERTONIC_DOWNLOAD_BYTES });
}

function supertonicMessage(type, data) {
  return chrome.runtime.sendMessage({ target: 'offscreen', type, data });
}

function operationError(key, message) {
  return Object.assign(new Error(message), { translationKey: key, translationParams: {}, retryable: false });
}

/** @param {'download'|'cancel'|'delete'} action @returns {Promise<SupertonicModelStatus>} */
export async function changeSupertonicModel(action) {
  await setupOffscreenDocument();
  const response = await supertonicMessage('SUPERTONIC_MODEL', { action });
  if (!response?.ok) throw operationError(response?.key || 'supertonicOperationFailed', 'Supertonic model operation failed');
  return response.status;
}

/** Run the installed model on the offscreen worker and read its WAV by operation ID. */
export async function synthesizeSupertonic(text, options) {
  const { signal, processingRunId = null, voice, speed, language } = options;
  signal?.throwIfAborted();
  if ((await getSupertonicModelStatus()).state !== 'ready') throw operationError('supertonicDownloadRequired', 'Download Supertonic before saving audio');
  await setupOffscreenDocument();
  signal?.throwIfAborted();
  const id = crypto.randomUUID();
  let rejectWait;
  const cancelled = new Promise((_, reject) => { rejectWait = reject; });
  const abort = () => rejectWait(signal.reason || new DOMException('Supertonic synthesis cancelled', 'AbortError'));
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => rejectWait(operationError('errorTimeout', 'Supertonic synthesis timed out')), 180_000);
  let success = false;
  try {
    const response = await Promise.race([cancelled, supertonicMessage('SUPERTONIC_SYNTHESIZE', { id, processingRunId, text, voice, speed, language })]);
    signal?.throwIfAborted();
    if (!response?.ok) throw operationError(response?.key || 'supertonicSynthesisFailed', 'Supertonic did not produce audio');
    const item = await getDownload(id);
    if (!item || item.processingRunId !== processingRunId || !(item.blob instanceof Blob)) throw operationError('supertonicSynthesisFailed', 'Supertonic audio is unavailable');
    const bytes = await item.blob.arrayBuffer();
    signal?.throwIfAborted();
    success = true;
    return bytes;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    if (!success) await supertonicMessage('SUPERTONIC_CANCEL', { id }).catch(() => {});
    await removeDownload(id).catch(() => {});
  }
}
