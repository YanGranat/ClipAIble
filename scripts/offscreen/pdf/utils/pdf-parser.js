// @ts-check
import { logWarn } from '../../../utils/logging.js';
import { CONFIG } from '../../../utils/config.js';
import { loadPdfJs } from './pdf-loader.js';
import { createPdfError } from '../../../utils/pdf-errors.js';

const documents = new WeakMap();

/** Parse a request-owned copy; PDF.js transfers its input to the module worker. */
export async function parsePdfDocument(arrayBuffer, { signal } = {}) {
  if (signal?.aborted) throw signal.reason;
  const data = new Uint8Array(arrayBuffer.slice(0));
  if (String.fromCharCode(...data.subarray(0, 4)) !== '%PDF') {
    throw createPdfError('Invalid PDF file: expected a %PDF header', 'errorPdfInvalid');
  }
  let loadingTask;
  let disposal;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const dispose = () => disposal ||= Promise.resolve().then(() => loadingTask?.destroy()).catch(() => {});
  const onAbort = () => {
    rejectAbort(signal.reason);
    if (loadingTask) void dispose();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  let timer;
  try {
    const pdfjs = await Promise.race([loadPdfJs(), aborted]);
    if (signal?.aborted) throw signal.reason;
    loadingTask = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      verbosity: 0,
      stopAtErrors: false,
      ownerDocument: document,
      fontExtraProperties: true,
      useWorkerFetch: true,
      cMapUrl: chrome.runtime.getURL('lib/pdfjs/cmaps/'),
      cMapPacked: true,
      iccUrl: chrome.runtime.getURL('lib/pdfjs/iccs/'),
      standardFontDataUrl: chrome.runtime.getURL('lib/pdfjs/standard_fonts/'),
      wasmUrl: chrome.runtime.getURL('lib/pdfjs/wasm/')
    });
    const password = new Promise((_, reject) => {
      loadingTask.onPassword = () => reject(createPdfError('This PDF is password-protected. Please unlock it first.', 'errorPdfPasswordProtected'));
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(createPdfError(`PDF parsing timeout after ${CONFIG.PDF_PARSE_TIMEOUT_MS / 1000} seconds. The PDF may be too large or corrupted.`, 'errorTimeout')), CONFIG.PDF_PARSE_TIMEOUT_MS);
    });
    const pdf = await Promise.race([loadingTask.promise, password, timeout, aborted]);
    if (signal?.aborted) throw signal.reason;
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw createPdfError('PDF has no pages.', 'errorPdfInvalid');
    documents.set(pdf, { task: loadingTask, disposal: null });
    return pdf;
  } catch (error) {
    await dispose();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Dispose only the loading task that owns this document and worker. */
export async function releasePdfDocument(pdf) {
  const owner = pdf && documents.get(pdf);
  if (!owner) return;
  if (!owner.disposal) {
    owner.disposal = Promise.resolve().then(() => owner.task.destroy()).catch(error => {
      logWarn('[PDF] Failed to release document resources', { error: error.message });
    }).finally(() => documents.delete(pdf));
  }
  await owner.disposal;
}
