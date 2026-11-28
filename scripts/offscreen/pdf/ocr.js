// @ts-check
import { CONFIG } from '../../utils/config.js';
import { createPdfError } from '../../utils/pdf-errors.js';
import { loadPdfDocument } from './core/pdf-loader.js';
import { renderPdfPage } from './render-page.js';

const LANGUAGES = ['eng', 'rus', 'ukr'];

/** Send one command to the pinned Tesseract worker. */
function request(worker, signal, action, jobId, payload) {
  return new Promise((resolve, reject) => {
    function finish(error, data = undefined) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', fail);
      worker.removeEventListener('messageerror', fail);
      if (error) reject(error);
      else resolve(data);
    }
    const abort = () => finish(signal.reason);
    const fail = () => finish(createPdfError('OCR worker failed', 'errorPdfOcrFailed'));
    const receive = ({ data }) => {
      if (data?.jobId !== jobId || data.action !== action) return;
      if (data.status === 'resolve') finish(null, data.data);
      if (data.status === 'reject') fail();
    };
    const timer = setTimeout(fail, CONFIG.PDF_PARSE_TIMEOUT_MS);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', receive);
    worker.addEventListener('error', fail);
    worker.addEventListener('messageerror', fail);
    try { worker.postMessage({ workerId: 'pdf-ocr', jobId, action, payload }); }
    catch { fail(); }
  });
}

/** Read each full page from its rendered pixels. */
export async function recognizePdfPages(url, pdfData, operation, onProgress) {
  const { pdf, numPages, metadata } = await loadPdfDocument(url, pdfData, {
    signal: operation.signal, checkCancelled: operation.check
  });
  operation.adopt(pdf);
  let worker;
  try {
    worker = new Worker(chrome.runtime.getURL('dist/ocr/worker.min.js'));
    let id = 0;
    const run = (action, payload) => request(worker, operation.signal, action, String(++id), payload);
    const corePath = chrome.runtime.getURL('dist/ocr/tesseract-core-simd-lstm.wasm.js');
    const langPath = chrome.runtime.getURL('lib/ocr');
    await run('load', { options: { corePath, lstmOnly: true, logging: false } });
    await run('loadLanguage', {
      langs: LANGUAGES, options: { langPath, gzip: true, cacheMethod: 'none', lstmOnly: true }
    });
    await run('initialize', { langs: LANGUAGES, oem: 1, config: {} });
    const content = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      operation.check();
      const page = await pdf.getPage(pageNum);
      try {
        const rendered = await renderPdfPage(page, pageNum, 4, operation, false, undefined, 'image/png');
        if (!rendered) throw createPdfError('PDF page could not be rendered', 'errorPdfRenderFailed');
        const image = new Uint8Array(await rendered.blob.arrayBuffer());
        const result = await run('recognize', { image, options: {}, output: { text: true } });
        if (typeof result?.text !== 'string') throw createPdfError('OCR returned no text result', 'errorPdfOcrFailed');
        for (const part of result.text.split(/\r?\n[ \t]*\r?\n/)) {
          const text = part.replace(/[ \t]*\r?\n[ \t]*/g, ' ').trim();
          if (text) content.push({ type: 'paragraph', format: 'text', text, pageNum });
        }
        operation.check();
        onProgress(pageNum, numPages);
      } finally {
        page.cleanup();
      }
    }
    if (!content.length) throw createPdfError('No text recognized in PDF', 'errorPdfOcrNoText');
    return { title: metadata.title || '', author: metadata.author || '', publishDate: metadata.publishDate || '', content };
  } catch (error) {
    operation.check();
    if (error?.translationKey) throw error;
    throw createPdfError('Local PDF OCR failed', 'errorPdfOcrFailed');
  } finally {
    worker?.terminate();
  }
}
