// @ts-check
// PDF extraction using Offscreen Document API
// This is the proper way to use PDF.js in Manifest V3 service worker

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { savePdfData } from './pdf-storage.js';
import { renderPdfPageImageCdp, renderAllPdfPagesCdp } from './pdf-cdp-render.js';

let creating = null;
let offscreenReady = false;

/**
 * Setup offscreen document for PDF extraction
 * Reuses existing offscreen document if available
 */
async function setupOffscreenDocument() {
  if (offscreenReady) {
    return;
  }
  
  if (creating) {
    await creating;
    return;
  }
  
  creating = (async () => {
    try {
      if (!chrome.offscreen) {
        throw new Error('Offscreen API not available');
      }
      
      const offscreenUrl = chrome.runtime.getURL('offscreen.html');
      
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      
      if (existingContexts.length > 0) {
        log('[ClipAIble PDF Offscreen] Offscreen document already exists - FORCING CLOSE to reload bundle');
        // CRITICAL: Always close and recreate to ensure fresh bundle is loaded
        // Chrome caches offscreen documents aggressively, so we need to force reload
        try {
          await chrome.offscreen.closeDocument();
          // Wait for cleanup to ensure document is fully closed
          // Check if document is actually closed instead of fixed delay
          let closed = false;
          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
            const contexts = await chrome.runtime.getContexts({
              contextTypes: ['OFFSCREEN_DOCUMENT'],
              documentUrls: [offscreenUrl]
            });
            if (contexts.length === 0) {
              closed = true;
              break;
            }
          }
          if (!closed) {
            // If still not closed after 500ms, wait a bit more but log warning
            logWarn('[ClipAIble PDF Offscreen] Document not closed after 500ms, waiting additional 200ms');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          log('[ClipAIble PDF Offscreen] Existing document closed, will create fresh one');
        } catch (closeError) {
          logWarn('[ClipAIble PDF Offscreen] Failed to close existing offscreen document', closeError);
          // Try to continue anyway - might work if document was already closed
        }
      }
      
      // Create offscreen document
      // Note: We reuse the existing offscreen document created by TTS module
      // Both TTS and PDF extraction can use the same offscreen document
      // The document is created with reasons: ['BLOBS', 'DOM_SCRAPING']
      // BLOBS: for TTS audio generation
      // DOM_SCRAPING: for PDF.js (needs DOM and ES modules)
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['BLOBS', 'DOM_SCRAPING'],
        justification: 'PDF extraction and TTS require DOM and ES modules support. PDF.js needs DOM for parsing, TTS needs DOM for WASM.'
      });
      
      // Wait for document to initialize
      await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_SETUP_DELAY || 500));
      
      offscreenReady = true;
      log('[ClipAIble PDF Offscreen] Offscreen document created successfully');
    } catch (error) {
      logError('[ClipAIble PDF Offscreen] Failed to setup offscreen document', error);
      throw error;
    } finally {
      creating = null;
    }
  })();
  
  await creating;
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
export async function extractPdfViaOffscreen(pdfUrl) {
  log('[ClipAIble PDF Offscreen] === EXTRACT PDF VIA OFFScreen START ===', { pdfUrl });
  
  try {
    await setupOffscreenDocument();
    
    // Send message to offscreen document
    return new Promise((resolve, reject) => {
      const messageId = `EXTRACT_PDF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      log('[ClipAIble PDF Offscreen] Sending EXTRACT_PDF message', { messageId, pdfUrl });
      
      chrome.runtime.sendMessage(
        {
          target: 'offscreen',
          type: 'EXTRACT_PDF',
          data: { pdfUrl }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen');
            reject(new Error('No response from offscreen document'));
            return;
          }
          
          if (response.success) {
            log('[ClipAIble PDF Offscreen] PDF extraction successful', {
              messageId,
              title: response.result?.title,
              contentItems: response.result?.content?.length || 0
            });
            
            // CRITICAL: Log font formatting information for debugging g_d0_f3 issue
            if (response.result?.content && Array.isArray(response.result.content)) {
              const itemsWithG_d0_f3 = [];
              response.result.content.forEach((element, elIdx) => {
                if (element.lines && Array.isArray(element.lines)) {
                  element.lines.forEach((line, lineIdx) => {
                    if (line.items && Array.isArray(line.items)) {
                      line.items.forEach((item, itemIdx) => {
                        if (item.fontName === 'g_d0_f3' || item.originalFontName === 'g_d0_f3') {
                          itemsWithG_d0_f3.push({
                            elementIndex: elIdx,
                            elementType: element.type,
                            elementText: element.text?.substring(0, 50),
                            lineIndex: lineIdx,
                            itemIndex: itemIdx,
                            itemText: (item.str || '').substring(0, 30),
                            fontName: item.fontName,
                            originalFontName: item.originalFontName,
                            realFontName: item.realFontName,
                            fontWeight: item.fontWeight,
                            fontStyle: item.fontStyle,
                            isBold: item.isBold,
                            isItalic: item.isItalic,
                            widthHeightRatio: item.widthHeightRatio?.toFixed(3),
                            fontSize: item.fontSize?.toFixed(2)
                          });
                        }
                      });
                    }
                  });
                }
              });
              
              if (itemsWithG_d0_f3.length > 0) {
                log('[ClipAIble PDF Offscreen] CRITICAL: Found items with g_d0_f3 font', {
                  totalItems: itemsWithG_d0_f3.length,
                  sampleItems: itemsWithG_d0_f3.slice(0, 10),
                  boldCount: itemsWithG_d0_f3.filter(item => item.isBold).length,
                  notBoldCount: itemsWithG_d0_f3.filter(item => !item.isBold).length,
                  withFontWeight: itemsWithG_d0_f3.filter(item => item.fontWeight).length,
                  withRealFontName: itemsWithG_d0_f3.filter(item => item.realFontName && item.realFontName !== 'g_d0_f3').length
                });
              }
            }
            
            resolve(response.result);
          } else {
            logError('[ClipAIble PDF Offscreen] PDF extraction failed', {
              messageId,
              error: response.error
            });
            (async () => {
              const uiLang = await getUILanguageCached();
              reject(new Error(response.error || tSync('errorPdfExtractionFailed', uiLang)));
            })();
          }
        }
      );
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] PDF extraction via offscreen failed', error);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorPdfExtractionFailed', uiLang)?.replace('{error}', error.message) || error.message);
  }
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
      
      chrome.runtime.sendMessage(
        {
          target: 'offscreen',
          type: 'EXTRACT_PDF_PAGE_TEXT',
          data: { pdfUrl, pageNum }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen');
            reject(new Error('No response from offscreen document'));
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
            reject(new Error(response.error || 'Failed to extract page text'));
          }
        }
      );
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
export async function getPdfMetadata(pdfUrl) {
  log('[ClipAIble PDF Offscreen] Getting PDF metadata', { pdfUrl });
  
  try {
    await setupOffscreenDocument();
    
    return new Promise((resolve, reject) => {
      const messageId = `GET_PDF_METADATA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // CRITICAL: Add timeout to prevent hanging forever
      const TIMEOUT_MS = 60000; // 60 seconds - PDF loading can take time for large files
      const timeoutId = setTimeout(() => {
        logError('[ClipAIble PDF Offscreen] PDF metadata retrieval timeout', {
          messageId,
          pdfUrl,
          timeoutMs: TIMEOUT_MS
        });
        reject(new Error(`PDF metadata retrieval timed out after ${TIMEOUT_MS / 1000} seconds. The PDF may be too large or the server may be slow.`));
      }, TIMEOUT_MS);
      
      chrome.runtime.sendMessage(
        {
          target: 'offscreen',
          type: 'GET_PDF_METADATA',
          data: { pdfUrl }
        },
        (response) => {
          clearTimeout(timeoutId); // Clear timeout on response
          
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen');
            reject(new Error('No response from offscreen document'));
            return;
          }
          
          if (response.success) {
            log('[ClipAIble PDF Offscreen] PDF metadata retrieved', {
              messageId,
              numPages: response.numPages,
              hasMetadata: !!response.metadata
            });
            resolve({
              numPages: response.numPages || 0,
              metadata: response.metadata || {}
            });
          } else {
            logError('[ClipAIble PDF Offscreen] PDF metadata retrieval failed', {
              messageId,
              error: response.error
            });
            reject(new Error(response.error || 'Failed to get PDF metadata'));
          }
        }
      );
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] PDF metadata retrieval via offscreen failed', error);
    throw error;
  }
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
      
      chrome.runtime.sendMessage(
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
      );
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
      
      chrome.runtime.sendMessage(
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
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen', {
              messageId,
              messageType: messageToSend.type,
              messageTarget: messageToSend.target,
              note: 'Message may not have reached offscreen handler'
            });
            reject(new Error('No response from offscreen document'));
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
            reject(new Error(response.error || 'Failed to get PDF page dimensions'));
          }
        }
      );
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] PDF page dimensions retrieval via offscreen failed', error);
    throw error;
  }
}

/**
 * Render PDF page as image (base64) via CDP (Chrome DevTools Protocol)
 * 
 * CRITICAL: This now uses CDP instead of offscreen document rendering
 * because offscreen rendering hangs due to Worker issues in null origin context
 * 
 * @param {string} pdfUrl - PDF file URL
 * @param {number} pageNum - Page number (1-based)
 * @param {number} [scale=2.0] - Scale factor (not used in CDP, kept for API compatibility)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data (not used in CDP, kept for API compatibility)
 * @returns {Promise<Object>} { imageData (base64), width, height }
 */
export async function renderPdfPageImage(pdfUrl, pageNum, scale = 2.0, pdfData = null) {
  // Use CDP rendering instead of offscreen (which hangs)
  return await renderPdfPageImageCdp(pdfUrl, pageNum, scale, pdfData);
}

/**
 * Render all PDF pages as images (base64) via CDP
 * 
 * CRITICAL: This now uses CDP instead of offscreen document rendering
 * because offscreen rendering hangs due to Worker issues in null origin context
 * 
 * @param {string} pdfUrl - PDF file URL
 * @param {number} totalPages - Total number of pages
 * @param {number} [scale=2.0] - Scale factor (not used in CDP, kept for API compatibility)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data (not used in CDP, kept for API compatibility)
 * @param {{width: number, height: number}} [pdfPageDimensions] - Optional: PDF page dimensions from PDF.js API
 * @returns {Promise<Array>} Array of { pageNum, imageData (base64), width, height } or { pageNum, error }
 */
export async function renderAllPdfPages(pdfUrl, totalPages, scale = 2.0, pdfData = null, pdfPageDimensions = null, originalTabLayout = null) {
  // Use CDP rendering instead of offscreen (which hangs)
  try {
    const images = await renderAllPdfPagesCdp(pdfUrl, totalPages, scale, pdfData, pdfPageDimensions, originalTabLayout);
    
    // Convert to expected format (with base64 field for compatibility)
    const result = [];
    const successfulPageNums = new Set(images.map(img => img.pageNum));
    
    // Add successful pages
    for (const img of images) {
      // CRITICAL: imageData from renderAllPdfPagesCdp already has full data URL prefix
      // (e.g., "data:image/png;base64,...") - use it directly, no processing needed
      // Only extract base64 part if needed for backward compatibility
      const imageData = img.imageData; // Already has prefix from CDP render
      const hasDataUrlPrefix = imageData && imageData.includes(',');
      const base64Part = hasDataUrlPrefix ? imageData.split(',')[1] : imageData; // Extract only if needed for compatibility
      
      result.push({
        pageNum: img.pageNum,
        base64: base64Part, // Extract base64 without data URL prefix (for backward compatibility only)
        imageData: imageData, // Use imageData directly - it already has prefix from CDP
        width: img.width,
        height: img.height
      });
    }
    
    // Add error entries for missing pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (!successfulPageNums.has(pageNum)) {
        result.push({
          pageNum,
          error: `Page ${pageNum} was not captured`
        });
      }
    }
    
    // Sort by page number
    result.sort((a, b) => a.pageNum - b.pageNum);
    
    return result;
  } catch (error) {
    logError('[CDP Render] Failed to render all pages, returning error for all', error);
    // Return error for all pages
    return Array.from({ length: totalPages }, (_, i) => ({
      pageNum: i + 1,
      error: error.message
    }));
  }
}

