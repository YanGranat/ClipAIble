// @ts-check
import { beginPdfOperation, takePdfOperationBlob, removePdfOperation } from './pdf-operation-storage.js';
import { CONFIG } from '../utils/config.js';
import { LIMITS } from '../offscreen/pdf/constants.js';
import { createPdfError } from '../utils/pdf-errors.js';
import { validatePdfData } from './pdf-storage.js';
import { logWarn } from '../utils/logging.js';

/** The popup transfers file bytes through extension-origin storage, never IPC. */
export async function requestPdfFileSelectionViaMessage(expectedPdfUrl, options = {}) {
  const operationId = crypto.randomUUID();
  const runId = options.processingRunId ?? null;
  let finished = false;
  let timer;
  let poll;
  let rejectPending;
  const failure = () => createPdfError('PDF file selection unavailable', 'errorPdfDataUnavailable');
  const check = async () => {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Processing cancelled', 'AbortError');
    await options.checkCancelled?.();
  };
  const abort = () => rejectPending?.(options.signal.reason || new DOMException('Processing cancelled', 'AbortError'));
  const interrupted = new Promise((_, reject) => { rejectPending = reject; });
  const work = (async () => {
    await check();
    await beginPdfOperation(operationId, runId, 'selection');
    if (finished) { await removePdfOperation(operationId); throw failure(); }
    await check();
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'selectPdfFile', expectedPdfUrl, operationId, processingRunId: runId }, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) reject(failure());
        else resolve(response);
      });
    });
    await check();
    if (response?.cancelled) return null;
    if (!response?.success || response.ref !== `${operationId}:0`) {
      throw createPdfError(response?.error || 'PDF file selection unavailable', response?.translationKey || 'errorPdfDataUnavailable', response?.translationParams || {});
    }
    const blob = await takePdfOperationBlob(response.ref, runId, 'selection');
    await check();
    if (!(blob instanceof Blob) || !blob.size || blob.size > LIMITS.MAX_FILE_SIZE) throw failure();
    const bytes = await blob.arrayBuffer();
    await check();
    return validatePdfData(bytes, 'PDF file selection');
  })();
  options.signal?.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => rejectPending(createPdfError('PDF file selection timed out', 'errorTimeout')), CONFIG.API_TIMEOUT_MS);
  poll = setInterval(() => { check().catch(rejectPending); }, 100);
  try { return await Promise.race([work, interrupted]); }
  finally {
    finished = true;
    clearTimeout(timer); clearInterval(poll);
    options.signal?.removeEventListener('abort', abort);
    await removePdfOperation(operationId).catch(error => logWarn('PDF selection cleanup failed', { error: error.message }));
  }
}
