// @ts-check
// PDF extraction using Offscreen Document API
// This is the proper way to use PDF.js in Manifest V3 service worker

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { savePdfData, removePdfData, validatePdfData } from './pdf-storage.js';
import { isCancelled } from '../state/processing.js';
import { fetchPdfFile } from '../offscreen/pdf/utils/pdf-fetcher.js';
import { withOffscreenDocumentLock, setupOffscreenDocumentUnlocked } from './offscreen-document.js';
import { createPdfError, localizePdfError } from '../utils/pdf-errors.js';
import { beginPdfOperation, takePdfOperationBlob, removePdfOperation } from './pdf-operation-storage.js';
import { isTrustedExtensionSender } from '../utils/security/message-sender.js';

function responseError(response) {
  return Object.assign(new Error(response?.error || ''), {
    translationKey: response?.translationKey, translationParams: response?.translationParams
  });
}

function sendOffscreenMessage(message, callback, admission) {
  return withOffscreenDocumentLock(async () => {
    await setupOffscreenDocumentUnlocked();
    await admission?.check();
    admission?.admit();
    chrome.runtime.sendMessage(message, callback);
  });
}

/**
 * Send message to offscreen document for PDF extraction
 * @param {string} pdfUrl - PDF file URL
 * @returns {Promise<import('../types.js').ExtractionResult>} Extracted content result
 * @throws {Error} If offscreen document setup fails
 * @throws {Error} If PDF extraction fails
 * @throws {Error} If message send fails
 * @throws {Error} If no response from offscreen document
 */
export async function extractPdfViaOffscreen(pdfUrl, pdfData = null, cancellationOptions) {
  const response = await requestPdfOperation('EXTRACT_PDF', pdfUrl, pdfData, {}, cancellationOptions,
    CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS, true);
  return response.result;
}

/**
 * Extract text from a single PDF page via offscreen
 * @param {string} pdfUrl - PDF file URL
 * @param {number} pageNum - Page number (1-based)
 * @returns {Promise<string>} Extracted text from the page
 * @throws {Error} If offscreen document setup fails
 * @throws {Error} If page text extraction fails
 * @throws {Error} If message send fails
 * @throws {Error} If no response from offscreen document
 */


/**
 * Get PDF metadata (number of pages) via offscreen
 * @param {string} pdfUrl - PDF file URL
 * @returns {Promise<{numPages: number, metadata: Object}>} PDF metadata with number of pages
 * @throws {Error} If offscreen document setup fails
 * @throws {Error} If PDF metadata retrieval fails
 * @throws {Error} If message send fails
 * @throws {Error} If no response from offscreen document
 * @throws {Error} If timeout occurs (after 60 seconds)
 */
export async function getPdfMetadata(pdfUrl, pdfData = null, cancellationOptions) {
  const response = await requestPdfOperation('GET_PDF_METADATA', pdfUrl, pdfData, {}, cancellationOptions, 60000, true);
  return { numPages: response.numPages || 0, metadata: response.metadata || {} };
}

/**
 * Get PDF page dimensions via PDF.js API in offscreen document
 * Returns exact page width and height from PDF metadata (not viewport)
 * 
 * @param {string} pdfUrl - PDF file URL
 * @param {number} pageNum - Page number (1-based, default: 1)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data
 * @returns {Promise<{width: number, height: number, mediaBox: Array<number>, cropBox: Array<number>}>} Page dimensions
 * @throws {Error} If offscreen document setup fails
 * @throws {Error} If PDF page dimensions retrieval fails
 * @throws {Error} If message send fails
 * @throws {Error} If no response from offscreen document
 */


/** Render request-owned PDF bytes without touching browser tabs. */
async function requestPdfOperation(type, pdfUrl, pdfData, fields, cancellationOptions = {}, timeoutMs, allowUrl = false) {
  const check = async () => {
    await cancellationOptions.checkCancelled?.();
    if (cancellationOptions.processingRunId !== undefined && isCancelled(cancellationOptions.processingRunId)) {
      throw createPdfError('PDF rendering cancelled', 'statusCancelled');
    }
  };
  await check();
  const hasData = pdfData instanceof ArrayBuffer;
  if (!hasData && !(allowUrl && pdfData === null)) throw createPdfError('PDF bytes are unavailable', 'errorPdfDataUnavailable');
  if (hasData) {
    try { validatePdfData(pdfData, 'PDF processing'); }
    catch { throw createPdfError('Invalid PDF data', 'errorPdfInvalid'); }
    await fetchPdfFile(pdfUrl, pdfData, { checkCancelled: check });
  }
  const operationId = crypto.randomUUID();
  const pdfDataRef = hasData ? `pdf-render:${operationId}` : undefined;
  let saved = false;
  let resultCreated = false;
  let cleanup;
  const cleanupOwnedData = () => {
    if (!saved) return cleanup || Promise.resolve();
    saved = false;
    cleanup = removePdfData(pdfDataRef);
    return cleanup;
  };
  let settled = false;
  let sent = false;
  let cancellationError;
  let rejectCancellation;
  let pollTimer;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const cancel = error => {
    if (settled || cancellationError) return;
    cancellationError = error;
    if (sent) {
      try {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'CANCEL_PDF_RENDER', data: { operationId } }, () => { void chrome.runtime.lastError; });
      } catch {}
    }
    rejectCancellation(error);
  };
  const checkAdmission = async () => {
    if (cancellationError) throw cancellationError;
    await check();
    if (cancellationError) throw cancellationError;
  };
  const poll = async () => {
    if (settled) return;
    try { await checkAdmission(); }
    catch (error) { cancel(error); return; }
    if (!settled) pollTimer = setTimeout(poll, 50);
  };
  const pages = fields.totalPages || 1;
  const deadline = timeoutMs ?? Math.min(2147483647, CONFIG.PDF_PARSE_TIMEOUT_MS + CONFIG.PDF_FIRST_PAGE_RENDER_TIMEOUT_MS +
    Math.max(0, pages - 1) * CONFIG.PDF_RENDER_TIMEOUT_MS);
  let deadlineTimer;
  const refreshDeadline = () => {
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(() => cancel(createPdfError('PDF processing timed out', 'errorTimeout')),
      Math.min(deadline, CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS || 600000));
  };
  refreshDeadline();
  let lastProgress = 0;
  const receiveProgress = (message, sender) => {
    const progress = message?.data;
    if (settled || message?.target !== 'pdf-progress' || message.type !== 'PDF_PROGRESS' ||
        !isTrustedExtensionSender(sender) || sender.url !== chrome.runtime.getURL('offscreen.html') ||
        progress?.operationId !== operationId || !Number.isInteger(progress.current) ||
        !Number.isInteger(progress.total) || progress.total < 1 || progress.current <= lastProgress ||
        progress.current > progress.total) return;
    lastProgress = progress.current;
    void checkAdmission().then(() => {
      if (settled) return;
      refreshDeadline();
      cancellationOptions.onProgress?.(progress.current, progress.total);
    }).catch(cancel);
  };
  chrome.runtime.onMessage.addListener(receiveProgress);
  const work = (async () => {
    let workFailure;
    try {
      if (type === 'RENDER_ALL_PDF_PAGES') {
        await beginPdfOperation(operationId, cancellationOptions.processingRunId ?? null);
        resultCreated = true;
      }
      if (hasData) {
        await savePdfData(pdfDataRef, pdfData, cancellationOptions.processingRunId ?? null);
        saved = true;
      }
      await checkAdmission();
      return await new Promise((resolve, reject) => {
        sendOffscreenMessage({ target: 'offscreen', type, data: { ...fields, pdfUrl, pdfDataRef, operationId, processingRunId: cancellationOptions.processingRunId } }, response => {
          sent = false;
          if (chrome.runtime.lastError) reject(createPdfError(chrome.runtime.lastError.message, 'errorPdfJsLoadFailed'));
          else if (!response) reject(createPdfError('No response from PDF renderer', 'errorPdfRenderFailed'));
          else if (!response.success) reject(responseError(response));
          else resolve(response);
        }, { check: checkAdmission, admit: () => {
          if (cancellationError) throw cancellationError;
          sent = true;
        } }).catch(reject);
      });
    } catch (error) {
      workFailure = error;
      if (resultCreated) await removePdfOperation(operationId).catch(cleanupError => logWarn('PDF result cleanup failed', { error: cleanupError.message }));
      throw error;
    } finally {
      try { await cleanupOwnedData(); }
      catch (error) {
        if (!workFailure) throw error;
        logWarn('[PDF] Failed to remove render data', { error: error.message });
      }
    }
  })();
  void poll();
  let result;
  let failure;
  let failed = false;
  try {
    result = await Promise.race([work, cancelled]);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    settled = true;
    clearTimeout(pollTimer);
    clearTimeout(deadlineTimer);
    chrome.runtime.onMessage.removeListener(receiveProgress);
  }
  if (failed) {
    if (resultCreated) await removePdfOperation(operationId).catch(cleanupError => logWarn('PDF result cleanup failed', { error: cleanupError.message }));
    if (failure === cancellationError) {
      try { await cleanupOwnedData(); }
      catch (error) { logWarn('[PDF] Failed to remove cancelled render data', { error: error.message }); }
      throw failure;
    }
    throw await localizePdfError(failure, 'errorPdfRenderFailed');
  }
  return { ...result, operationId };
}

/** Render one complete PDF page from its supplied bytes. */


/** Render complete pages in document order from one request-owned document. */
export async function renderAllPdfPages(pdfUrl, totalPages, scale = 2, pdfData = null, cancellationOptions) {
  if (!Number.isInteger(totalPages) || totalPages < 1) throw createPdfError('Invalid PDF page count', 'errorPdfInvalid');
  const response = await requestPdfOperation('RENDER_ALL_PDF_PAGES', pdfUrl, pdfData, { totalPages, scale }, cancellationOptions);
  const images = response.images;
  if (!Array.isArray(images) || images.length !== totalPages ||
    new Set(images.map(image => image.pageNum)).size !== totalPages ||
    images.some(image => !Number.isInteger(image.pageNum) || image.pageNum < 1 || image.pageNum > totalPages)) {
    await removePdfOperation(response.operationId);
    throw createPdfError('Incomplete PDF render response', 'errorPdfRenderFailed');
  }
  const failedPages = images.filter(image => image.error).map(image => image.pageNum);
  if (failedPages.length) {
    await removePdfOperation(response.operationId);
    throw createPdfError('PDF page rendering incomplete', 'errorPdfIncomplete', { pages: failedPages.join(', ') });
  }
  if (images.some(image => image.ref !== `${response.operationId}:${image.pageNum}` || !(image.width > 0) || !(image.height > 0))) {
    await removePdfOperation(response.operationId);
    throw createPdfError('Incomplete PDF page images', 'errorPdfRenderFailed');
  }
  return { operationId: response.operationId, pages: [...images].sort((a, b) => a.pageNum - b.pageNum) };
}

export async function readRenderedPdfPage(ref, processingRunId) {
  if (processingRunId !== undefined && isCancelled(processingRunId)) throw createPdfError('PDF processing cancelled', 'statusCancelled');
  const blob = await takePdfOperationBlob(ref, processingRunId ?? null);
  if (!(blob instanceof Blob)) throw createPdfError('PDF page result unavailable', 'errorPdfRenderFailed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (processingRunId !== undefined && isCancelled(processingRunId)) throw createPdfError('PDF processing cancelled', 'statusCancelled');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
