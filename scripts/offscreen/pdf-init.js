// @ts-check
// Configure the local PDF.js worker before the offscreen bundle loads.
(() => {
  globalThis.__PDF_READY__ = false;
  const pdf = globalThis.pdfjsLib || globalThis.PDFJS;

  if (!pdf || typeof pdf.getDocument !== 'function' || !pdf.GlobalWorkerOptions) {
    throw new Error('PDF.js is unavailable in the offscreen document');
  }

  pdf.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.js');
  globalThis.pdfjsLib = pdf;
  globalThis.PDFJS = pdf;
  globalThis.__PDF_READY__ = true;
})();

