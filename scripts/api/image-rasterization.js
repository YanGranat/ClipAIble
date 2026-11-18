// @ts-check
import { putRasterJob, takeRasterJob, removeRasterJob, pruneExpiredRasterJobs } from './image-raster-storage.js';
import { MAX_IMAGE_BYTES, imageDataError } from '../utils/html/image-bytes.js';
import { CONFIG } from '../utils/config.js';
import { logWarn } from '../utils/logging.js';
import { setupOffscreenDocument } from './offscreen-document.js';
import { isCancelled as isRunCancelled, getProcessingSignal } from '../state/processing.js';

/** Validate image decoding and normalize non-core formats without large IPC payloads. */
export async function normalizeImageBlob(blob, options = {}) {
  const id = crypto.randomUUID();
  const processingRunId = options.processingRunId ?? null;
  const signals = [];
  const expiresAt = Date.now() + CONFIG.API_TIMEOUT_MS;
  let failure;
  /** @type {typeof isRunCancelled} */
  let isCancelled = () => false;
  const check = () => {
    if (failure) throw failure;
    if (signals.some(signal => signal.aborted) || (processingRunId && isCancelled(processingRunId))) throw imageDataError('IMAGE_CANCELLED');
  };
  let admitted = false, completed = false;
  const cancel = () => {
    if (admitted) chrome.runtime.sendMessage({ target: 'offscreen', type: 'CANCEL_IMAGE_RASTER', data: { id, processingRunId } }).catch(() => {});
  };
  let rejectLifetime;
  const lifetime = new Promise((_, reject) => { rejectLifetime = reject; });
  // A setup or IDB promise may finish after cancellation. Its owned record is still released.
  lifetime.catch(() => {});
  const stop = code => {
    if (failure) return;
    failure = imageDataError(code);
    cancel();
    rejectLifetime(failure);
  };
  const onAbort = () => stop('IMAGE_CANCELLED');
  const addSignal = signal => {
    if (!signal) return;
    signals.push(signal);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  };
  const timer = setTimeout(() => stop('IMAGE_TIMEOUT'), CONFIG.API_TIMEOUT_MS);
  const wait = promise => Promise.race([promise, lifetime]);
  try {
    addSignal(options.signal);
    check();
    if (processingRunId) {
      isCancelled = isRunCancelled;
      addSignal(getProcessingSignal(processingRunId));
      check();
    }
    if (!(blob instanceof Blob)) throw imageDataError('IMAGE_UNSUPPORTED_TYPE');
    if (!blob.size) throw imageDataError('IMAGE_EMPTY');
    if (blob.size > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
    await wait(pruneExpiredRasterJobs());
    await wait(putRasterJob(id, { input: blob, processingRunId, expiresAt }).then(async () => {
      if (failure) await removeRasterJob(id);
    }));
    check();
    await wait(setupOffscreenDocument());
    check();
    admitted = true;
    const response = await wait(chrome.runtime.sendMessage({ target: 'offscreen', type: 'RASTERIZE_IMAGE', data: { id, processingRunId } }));
    check();
    if (!response?.success) throw imageDataError(response?.code || 'IMAGE_DECODE_FAILED');
    const result = await wait(takeRasterJob(id));
    check();
    if (result?.processingRunId !== processingRunId || !(result?.result instanceof Blob)) throw imageDataError('IMAGE_RESULT_UNAVAILABLE');
    completed = true;
    return result.result;
  } finally {
    if (!completed) cancel();
    clearTimeout(timer);
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
    await removeRasterJob(id).catch(error => logWarn('Image operation cleanup failed', { error: error.message }));
  }
}
