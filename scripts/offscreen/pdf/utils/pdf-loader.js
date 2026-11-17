// @ts-check
import { criticalLog } from '../../../utils/logging.js';
import { createPdfError } from '../../../utils/pdf-errors.js';

let pdfJsLoaded = false;

/** Wait for the extension-owned PDF API initialization. */
export async function loadPdfJs() {
  let timeout;
  try {
    const ready = globalThis.__PDF_READY_PROMISE__;
    if (ready) {
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(createPdfError('PDF.js initialization timed out', 'errorTimeout')), 10000);
        })
      ]);
    }
    if (globalThis.__PDF_INIT_ERROR__) throw createPdfError('PDF.js initialization failed', 'errorPdfJsLoadFailed');
    const pdf = globalThis.pdfjsLib;
    if (!pdf) {
      criticalLog('[PDF] Library unavailable', 'PDF_NOT_FOUND', {}, 'error');
      throw createPdfError('PDF.js not found', 'errorPdfJsLoadFailed');
    }
    if (typeof pdf.getDocument !== 'function') {
      criticalLog('[PDF] Document API unavailable', 'PDF_GETDOCUMENT_MISSING', {}, 'error');
      throw createPdfError('PDF.js getDocument is missing', 'errorPdfJsLoadFailed');
    }
    if (!pdfJsLoaded) {
      criticalLog('[PDF] Library ready', 'PDF_LOADER_SUCCESS', { version: pdf.version });
      pdfJsLoaded = true;
    }
    return pdf;
  } finally {
    clearTimeout(timeout);
  }
}

export function isPdfJsLoaded() {
  return pdfJsLoaded && typeof globalThis.pdfjsLib?.getDocument === 'function';
}
