// Initialize the extension-local API and module worker before PDF requests run.
globalThis.__PDF_READY__ = false;
globalThis.__PDF_READY_PROMISE__ = import(chrome.runtime.getURL('lib/pdfjs/compatibility.mjs'))
  .then(() => import(chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs')))
  .then(pdf => {
    pdf.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/worker.mjs');
    globalThis.pdfjsLib = pdf;
    globalThis.__PDF_READY__ = true;
    return pdf;
  })
  .catch(error => {
    globalThis.__PDF_INIT_ERROR__ = error;
    return null;
  });
