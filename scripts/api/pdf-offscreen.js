// @ts-check
// PDF extraction using Offscreen Document API
// This is the proper way to use PDF.js in Manifest V3 service worker

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { savePdfData, removePdfData, validatePdfData } from './pdf-storage.js';
import { isCancelled } from '../state/processing.js';
import { fetchPdfFile } from '../offscreen/pdf/utils/pdf-fetcher.js';
import { withOffscreenDocumentLock } from './offscreen-document.js';
import { createPdfError, localizePdfError } from '../utils/pdf-errors.js';

function rejectPdfError(reject, error) {
  localizePdfError(error).then(reject, reject);
}
function responseError(response) {
  return Object.assign(new Error(response?.error || ''), {
    translationKey: response?.translationKey, translationParams: response?.translationParams
  });
}

/**
 * Setup offscreen document for PDF extraction
 * Reuses existing offscreen document if available
 */
async function setupOffscreenDocument() {
  return withOffscreenDocumentLock(setupOffscreenDocumentUnlocked);
}

async function setupOffscreenDocumentUnlocked() {
  if (!chrome.offscreen) throw createPdfError('Offscreen API not available', 'errorPdfJsLoadFailed');
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['BLOBS', 'DOM_SCRAPING'],
    justification: 'PDF extraction and TTS require DOM and WASM support.'
  });
  await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_SETUP_DELAY || 500));
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
    Math.min(2147483647, CONFIG.MAX_OPERATION_TIMEOUT_MS || 2147483647), true);
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
export async function extractPdfPageText(pdfUrl, pageNum) {
  log('[ClipAIble PDF Offscreen] Extracting text from page', { pdfUrl, pageNum });
  
  try {
    await setupOffscreenDocument();
    
    return new Promise((resolve, reject) => {
      const messageId = `EXTRACT_PDF_PAGE_TEXT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      sendOffscreenMessage(
        {
          target: 'offscreen',
          type: 'EXTRACT_PDF_PAGE_TEXT',
          data: { pdfUrl, pageNum }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', chrome.runtime.lastError);
            rejectPdfError(reject, createPdfError(chrome.runtime.lastError.message, 'errorPdfJsLoadFailed'));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen');
            rejectPdfError(reject, createPdfError('No response from offscreen document', 'errorPdfJsLoadFailed'));
            return;
          }
          
          if (response.success) {
            log('[ClipAIble PDF Offscreen] Page text extracted', {
              messageId,
              pageNum,
              textLength: response.text?.length || 0
            });
            resolve(response.text || '');
          } else {
            logError('[ClipAIble PDF Offscreen] Page text extraction failed', {
              messageId,
              pageNum,
              error: response.error
            });
            rejectPdfError(reject, responseError(response));
          }
        }
      ).catch(reject);
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] Page text extraction via offscreen failed', error);
    throw error;
  }
}

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
export async function getPdfPageDimensions(pdfUrl, pageNum = 1, pdfData = null) {
  log('[ClipAIble PDF Offscreen] Getting PDF page dimensions', { pdfUrl, pageNum });
  
  try {
    await setupOffscreenDocument();
    
    // CRITICAL: Wait for offscreen to be ready to receive messages
    // Send ping to ensure message handler is registered
    await new Promise((resolve, reject) => {
      const pingId = `PING_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeout = setTimeout(() => {
        logWarn('[ClipAIble PDF Offscreen] Ping timeout - offscreen may not be ready, but continuing anyway');
        resolve(); // Continue anyway - might work
      }, 1000); // Reduced from 2000ms to 1000ms - ping should respond quickly
      
      sendOffscreenMessage(
        {
          target: 'offscreen',
          type: 'PING',
          data: { pingId }
        },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            logWarn('[ClipAIble PDF Offscreen] Ping failed, but continuing anyway', chrome.runtime.lastError);
            resolve(); // Continue anyway
            return;
          }
          log('[ClipAIble PDF Offscreen] Ping successful - offscreen is ready');
          // CRITICAL: Add small delay after ping to ensure offscreen is fully ready
          setTimeout(() => {
            resolve();
          }, 50); // Reduced from 100ms to 50ms - minimal delay for readiness
        }
      ).catch(reject);
    });
    
    // CRITICAL: For local files, PDF data should already be in IndexedDB
    // (saved in pdf.js before calling getPdfPageDimensions)
    // Use pdfDataRef (URL) instead of sending base64 to avoid message size limits
    // Offscreen document can load PDF data directly from IndexedDB using the URL
    // NOTE: We don't try to save here because:
    // 1. Dynamic import() is not allowed in service worker
    // 2. PDF data is already saved in pdf.js before this function is called
    let pdfDataRef = null;
    if (pdfData instanceof ArrayBuffer) {
      // PDF data is provided - it should already be in IndexedDB from pdf.js
      // Just use the URL as reference for offscreen document
      pdfDataRef = pdfUrl;
      log('[ClipAIble PDF Offscreen] Using PDF data reference (should already be in IndexedDB)', {
        pdfUrl,
        size: pdfData.byteLength,
        note: 'PDF data was saved to IndexedDB in pdf.js before calling this function'
      });
    }
    
    return new Promise((resolve, reject) => {
      const messageId = `GET_PDF_PAGE_DIMENSIONS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const messageToSend = {
        target: 'offscreen',
        type: 'GET_PDF_PAGE_DIMENSIONS',
        data: { 
          pdfUrl, 
          pageNum,
          pdfDataRef // Will be null if pdfData is not provided or save failed
        }
      };
      
      log('[ClipAIble PDF Offscreen] Sending GET_PDF_PAGE_DIMENSIONS message', {
        messageId,
        pdfUrl,
        pageNum,
        hasPdfData: !!pdfData,
        hasPdfDataRef: !!messageToSend.data.pdfDataRef,
        pdfDataRef: messageToSend.data.pdfDataRef,
        messageType: messageToSend.type,
        messageTarget: messageToSend.target,
        messageKeys: Object.keys(messageToSend)
      });
      
      // CRITICAL: Don't use JSON.stringify for logging - it may truncate large base64 strings
      // Just log metadata, not the actual data (only in DEBUG mode)
      if (CONFIG.LOG_LEVEL === 0) {
        console.log('[PDF_OFFSCREEN] About to send message:', {
          target: messageToSend.target,
          type: messageToSend.type,
          pdfUrl: messageToSend.data.pdfUrl,
          pageNum: messageToSend.data.pageNum,
          hasPdfData: !!messageToSend.data.pdfData,
          pdfDataLength: messageToSend.data.pdfData?.length || 0,
          pdfDataPreview: messageToSend.data.pdfData?.substring(0, 50) || 'null'
        });
      }
      
      sendOffscreenMessage(
        messageToSend,
        (response) => {
          // CRITICAL: Log response immediately (only in DEBUG mode)
          if (CONFIG.LOG_LEVEL === 0) {
            console.log('[PDF_OFFSCREEN] Response received:', {
              hasResponse: !!response,
              response: response,
              lastError: chrome.runtime.lastError?.message,
              responseSuccess: response?.success,
              responseError: response?.error
            });
          }
          
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', {
              error: chrome.runtime.lastError.message,
              messageId,
              messageType: messageToSend.type,
              messageTarget: messageToSend.target
            });
            rejectPdfError(reject, createPdfError(chrome.runtime.lastError.message, 'errorPdfJsLoadFailed'));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen', {
              messageId,
              messageType: messageToSend.type,
              messageTarget: messageToSend.target,
              note: 'Message may not have reached offscreen handler'
            });
            rejectPdfError(reject, createPdfError('No response from offscreen document', 'errorPdfJsLoadFailed'));
            return;
          }
          
          if (response.success) {
            log('[ClipAIble PDF Offscreen] PDF page dimensions retrieved', {
              messageId,
              pageNum,
              width: response.width,
              height: response.height
            });
            resolve({
              width: response.width,
              height: response.height,
              mediaBox: response.mediaBox,
              cropBox: response.cropBox
            });
          } else {
            logError('[ClipAIble PDF Offscreen] PDF page dimensions retrieval failed', {
              messageId,
              error: response.error
            });
            rejectPdfError(reject, responseError(response));
          }
        }
      ).catch(reject);
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] PDF page dimensions retrieval via offscreen failed', error);
    throw error;
  }
}

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
  const deadlineTimer = setTimeout(() => cancel(createPdfError('PDF rendering timed out', 'errorTimeout')), deadline);
  const work = (async () => {
    let workFailure;
    try {
      if (hasData) {
        await savePdfData(pdfDataRef, pdfData);
        saved = true;
      }
      await checkAdmission();
      return await new Promise((resolve, reject) => {
        sendOffscreenMessage({ target: 'offscreen', type, data: { ...fields, pdfUrl, pdfDataRef, operationId } }, response => {
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
  }
  if (failed) {
    if (failure === cancellationError) {
      try { await cleanupOwnedData(); }
      catch (error) { logWarn('[PDF] Failed to remove cancelled render data', { error: error.message }); }
      throw failure;
    }
    throw await localizePdfError(failure, 'errorPdfRenderFailed');
  }
  return result;
}

/** Render one complete PDF page from its supplied bytes. */
export async function renderPdfPageImage(pdfUrl, pageNum, scale = 2, pdfData = null, cancellationOptions) {
  const response = await requestPdfOperation('RENDER_PDF_PAGE_IMAGE', pdfUrl, pdfData, { pageNum, scale }, cancellationOptions);
  if (typeof response.imageData !== 'string' || !response.imageData.startsWith('data:image/') ||
    !(response.width > 0) || !(response.height > 0)) throw createPdfError('Invalid PDF render response', 'errorPdfRenderFailed');
  return { imageData: response.imageData, width: response.width, height: response.height };
}

/** Render complete pages in document order from one request-owned document. */
export async function renderAllPdfPages(pdfUrl, totalPages, scale = 2, pdfData = null, cancellationOptions) {
  if (!Number.isInteger(totalPages) || totalPages < 1) throw createPdfError('Invalid PDF page count', 'errorPdfInvalid');
  const response = await requestPdfOperation('RENDER_ALL_PDF_PAGES', pdfUrl, pdfData, { totalPages, scale }, cancellationOptions);
  const images = response.images;
  if (!Array.isArray(images) || images.length !== totalPages ||
    new Set(images.map(image => image.pageNum)).size !== totalPages ||
    images.some(image => !Number.isInteger(image.pageNum) || image.pageNum < 1 || image.pageNum > totalPages)) {
    throw createPdfError('Incomplete PDF render response', 'errorPdfRenderFailed');
  }
  return [...images].sort((a, b) => a.pageNum - b.pageNum).map(image => {
    if (image.error) return { ...image };
    if (!image.base64 || !(image.width > 0) || !(image.height > 0)) throw createPdfError('Invalid PDF page image', 'errorPdfRenderFailed');
    return { ...image, imageData: `data:image/jpeg;base64,${image.base64}` };
  });
}
