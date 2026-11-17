// Message handlers for offscreen document
// Provides handler functions for different message types to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { extractPdfContent } from './pdf/extract.js';
import { loadPdfDocument, destroyPdfDocument } from './pdf/core/pdf-loader.js';
import { parsePdfDocument } from './pdf/utils/pdf-parser.js';
import { createPdfError, pdfFailurePayload } from '../utils/pdf-errors.js';
import { startPdfRender, cancelPdfRender } from './pdf/render-operations.js';
import { getPdfData } from '../api/pdf-storage.js';
import { getPdfRenderViewport } from './pdf/render-viewport.js';

/**
 * Handle GET_VOICES message
 * @param {string} messageId - Message ID for logging
 * @param {import('../types.js').InitTTSWorkerFunction} initTTSWorker - Function to initialize TTS worker
 * @param {import('../types.js').GetVoicesWithWorkerFunction} getVoicesWithWorker - Function to get voices from worker
 * @param {Worker|null} ttsWorker - TTS worker instance (reference)
 * @param {import('../types.js').SendResponseFunction} sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function handleGetVoices(messageId, initTTSWorker, getVoicesWithWorker, ttsWorker, sendResponse) {
  const voicesStart = Date.now();

  log('[ClipAIble Offscreen] === handleGetVoices STARTED ===', {
    timestamp: voicesStart,
    messageId,
    hasTTSWorker: !!ttsWorker,
    hasInitTTSWorker: typeof initTTSWorker === 'function',
    hasGetVoicesWithWorker: typeof getVoicesWithWorker === 'function',
    hasSendResponse: typeof sendResponse === 'function',
    CONFIG_VERBOSE_LOGGING: CONFIG?.VERBOSE_LOGGING
  });

  // Only log if verbose (reduces log volume)
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] GET_VOICES request`, { messageId });
  }
  
  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
  if (!ttsWorker) {
    ttsWorker = await initTTSWorker();
  }
  if (!ttsWorker) {
    throw new Error('TTS Worker is not available. Cannot get available voices without Worker.');
  }
  const voices = await getVoicesWithWorker(ttsWorker);
  
  // CRITICAL: voices() returns Voice[] array, not an object!
  // Each Voice has structure: { key: VoiceId, name: string, language: {...}, quality: Quality, ... }
  // key is the voice ID like "ru_RU-irina-medium"
  
  // Supported languages: en, ru, uk, de, fr, es, it, pt, zh
  // Note: ja (Japanese) and ko (Korean) are not available in piper-tts-web library
  const supportedLanguages = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh'];
  
  // Filter voices:
  // 1. Only medium and high quality (exclude low and x_low)
  // 2. Only supported languages (extract base language code from CountryCode)
  const filteredVoices = voices.filter((voice) => {
    const quality = voice.quality || 'medium';
    const isLowQuality = quality === 'low' || quality === 'x_low';
    if (isLowQuality) {
      return false;
    }
    
    // Extract language code from voice key or use language property
    let langCode = '';
    if (voice.language?.code && typeof voice.language.code === 'string') {
      // CountryCode format: 'en_GB', 'en_US', 'ru_RU', etc.
      // Extract base language code (first 2 letters before underscore)
      const countryCode = voice.language.code.toLowerCase();
      langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
    } else {
      // Extract from voice key (e.g., "en_US-lessac-medium" -> "en")
      const langMatch = voice.key.match(/^([a-z]{2})_/i);
      langCode = langMatch ? langMatch[1].toLowerCase() : '';
    }
    
    // Check if language is supported
    return supportedLanguages.includes(langCode);
  });
  
  const result = filteredVoices.map((voice) => {
    // Extract base language code (en from en_GB, en_US, etc.)
    let langCode = '';
    if (voice.language?.code && typeof voice.language.code === 'string') {
      const countryCode = voice.language.code.toLowerCase();
      langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
    } else {
      const langMatch = voice.key.match(/^([a-z]{2})_/i);
      langCode = langMatch ? langMatch[1].toLowerCase() : 'unknown';
    }
    
    return {
      key: voice.key, // Use key directly for offline TTS
      id: voice.key, // Keep id for backward compatibility with UI code
      name: voice.name || voice.key,
      language: langCode, // Base language code (en, ru, etc.)
      quality: voice.quality || 'medium',
      gender: voice.gender || 'unknown'
    };
  });
  
  // Sort voices: first by language (in supported order), then by quality (high > medium), then by name
  const languageOrder = { 'en': 0, 'ru': 1, 'uk': 2, 'de': 3, 'fr': 4, 'es': 5, 'it': 6, 'pt': 7, 'zh': 8, 'ja': 9, 'ko': 10 };
  const qualityOrder = { 'high': 0, 'medium': 1 };
  result.sort((a, b) => {
    // First sort by language (in supported order)
    const aLangOrder = languageOrder[a.language] ?? 99;
    const bLangOrder = languageOrder[b.language] ?? 99;
    if (aLangOrder !== bLangOrder) {
      return aLangOrder - bLangOrder;
    }
    // Then by quality (high > medium)
    const aQuality = qualityOrder[a.quality] ?? 99;
    const bQuality = qualityOrder[b.quality] ?? 99;
    if (aQuality !== bQuality) {
      return aQuality - bQuality;
    }
    // Finally by name
    return a.name.localeCompare(b.name);
  });
  
  const voicesDuration = Date.now() - voicesStart;
  // CRITICAL: voices is Voice[] array, not an object!
  const totalVoices = Array.isArray(voices) ? voices.length : 0;
  const filteredOut = totalVoices - result.length;
  log(`[ClipAIble Offscreen] GET_VOICES complete for ${messageId}`, {
    messageId,
    totalVoices,
    returnedVoices: result.length,
    filteredOut,
    duration: voicesDuration,
    supportedLanguages: supportedLanguages,
    languages: [...new Set(result.map(v => v.language))],
    qualities: [...new Set(result.map(v => v.quality))],
    sampleVoices: result.slice(0, 5).map(v => ({ id: v.id, name: v.name, language: v.language, quality: v.quality }))
  });
  
  // CRITICAL: Log the exact structure being sent
  log(`[ClipAIble Offscreen] GET_VOICES: Sending response for ${messageId}`, {
    messageId,
    voicesDuration,
    resultCount: result.length,
    sampleResult: result.slice(0, 3).map(v => ({
      id: v.id,
      idType: typeof v.id,
      name: v.name,
      language: v.language,
      quality: v.quality,
      hasUnderscore: v.id && v.id.includes('_'),
      hasDash: v.id && v.id.includes('-'),
      fullObj: JSON.stringify(v)
    })),
    firstVoiceId: result[0]?.id,
    firstVoiceIdType: typeof result[0]?.id,
    isFirstVoiceIdValid: result[0]?.id && result[0].id.includes('_') && result[0].id.includes('-')
  });

  log('[ClipAIble Offscreen] === handleGetVoices COMPLETED ===', {
    timestamp: Date.now(),
    messageId,
    totalDuration: voicesDuration,
    resultCount: result.length,
    languagesFound: [...new Set(result.map(v => v.language))],
    qualitiesFound: [...new Set(result.map(v => v.quality))]
  });

  sendResponse({
    success: true,
    voices: result
  });
}

/**
 * Handle GET_STORED_VOICES message
 * @param {string} messageId - Message ID for logging
 * @param {import('../types.js').InitTTSWorkerFunction} initTTSWorker - Function to initialize TTS worker
 * @param {import('../types.js').GetStoredWithWorkerFunction} getStoredWithWorker - Function to get stored voices from worker
 * @param {Worker|null} ttsWorker - TTS worker instance (reference)
 * @param {import('../types.js').SendResponseFunction} sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function handleGetStoredVoices(messageId, initTTSWorker, getStoredWithWorker, ttsWorker, sendResponse) {
  const storedStart = Date.now();
  log(`[ClipAIble Offscreen] GET_STORED_VOICES request for ${messageId}`, {
    messageId
  });
  
  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
  if (!ttsWorker) {
    ttsWorker = await initTTSWorker();
  }
  if (!ttsWorker) {
    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
  }
  const stored = await getStoredWithWorker(ttsWorker);
  const storedDuration = Date.now() - storedStart;
  
  // Only log if verbose
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] GET_STORED_VOICES complete`, {
      messageId,
      storedCount: stored.length,
      duration: storedDuration
    });
  }
  
  sendResponse({
    success: true,
    voices: stored
  });
}

/**
 * Handle PING message
 * @param {string} messageId - Message ID for logging
 * @param {import('../types.js').SendResponseFunction} sendResponse - Response function
 * @returns {void}
 */
export function handlePing(messageId, sendResponse) {
  // Only log if verbose (PING is very frequent)
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] PING request`, { messageId });
  }
  
  // Health check from service worker
  sendResponse({
    success: true,
    ready: true
  });
  
  // Only log if verbose
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] PING response sent`, { messageId });
  }
}

/**
 * Handle EXTRACT_PDF message
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string}} data - Request data with pdfUrl
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF extraction fails
 * @throws {Error} If PDF loading fails
 */
export async function handleExtractPdf(messageId, data, sendResponse) {
  const operation = startPdfRender(data.operationId);
  let payload;
  try {
    operation.check();
    let pdfData = null;
    if (data.pdfDataRef) {
      try { pdfData = await getPdfData(data.pdfDataRef); }
      catch { throw createPdfError('PDF data could not be read', 'errorPdfDataUnavailable'); }
      if (!(pdfData instanceof ArrayBuffer)) throw createPdfError('PDF data is unavailable', 'errorPdfDataUnavailable');
    }
    operation.check();
    const result = await extractPdfContent(data.pdfUrl, pdfData, { signal: operation.signal, checkCancelled: operation.check });
    operation.check();
    payload = { success: true, result };
  } catch (error) {
    logError(`[ClipAIble Offscreen] EXTRACT_PDF failed for ${messageId}`, { error: error.message });
    payload = pdfFailurePayload(operation.signal.aborted ? operation.signal.reason : error);
  } finally {
    await operation.finish();
  }
  sendResponse(payload);
}

/**
 * Handle EXTRACT_PDF_PAGE_TEXT message - extract raw text from a single PDF page
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, pageNum: number, scale?: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer}} data - Request data with pdfUrl, pageNum, and optional scale, pdfDataRef, or pdfData
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If page text extraction fails
 * @throws {Error} If PDF loading fails
 */
export async function handleExtractPdfPageText(messageId, data, sendResponse) {
  let pdf = null;
  // Only log if verbose
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] EXTRACT_PDF_PAGE_TEXT request`, {
      messageId,
      pageNum: data?.pageNum
    });
  }
  
  try {
    const loaded = await loadPdfDocument(data.pdfUrl);
    pdf = loaded.pdf;
    const { numPages } = loaded;
    const pageNum = data.pageNum || 1;
    
    if (pageNum < 1 || pageNum > numPages) {
      throw createPdfError(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`, 'errorPdfPageUnavailable', { page: pageNum, pages: numPages });
    }
    
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const textItems = textContent.items || [];
    
    // Extract raw text - just concatenate all text items
    const rawText = textItems
      .map(item => item.str || '')
      .join(' ')
      .trim();
    
    page.cleanup();
    
    // Only log if verbose
    if (CONFIG?.VERBOSE_LOGGING) {
      log(`[ClipAIble Offscreen] EXTRACT_PDF_PAGE_TEXT complete`, {
        messageId,
        pageNum,
        textLength: rawText.length
      });
    }
    
    sendResponse({
      success: true,
      text: rawText
    });
  } catch (error) {
    logError(`[ClipAIble Offscreen] EXTRACT_PDF_PAGE_TEXT failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
    sendResponse(pdfFailurePayload(error));
  } finally {
    await destroyPdfDocument(pdf);
  }
}

/**
 * Handle GET_PDF_METADATA message - get PDF metadata and page count
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string}} data - Request data with pdfUrl
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF metadata retrieval fails
 * @throws {Error} If PDF loading fails
 */
export async function handleGetPdfMetadata(messageId, data, sendResponse) {
  const operation = startPdfRender(data.operationId);
  let payload;
  try {
    operation.check();
    let pdfData = null;
    if (data.pdfDataRef) {
      try { pdfData = await getPdfData(data.pdfDataRef); }
      catch { throw createPdfError('PDF data could not be read', 'errorPdfDataUnavailable'); }
      if (!(pdfData instanceof ArrayBuffer)) throw createPdfError('PDF data is unavailable', 'errorPdfDataUnavailable');
    }
    operation.check();
    const loaded = await loadPdfDocument(data.pdfUrl, pdfData, { signal: operation.signal, checkCancelled: operation.check });
    operation.adopt(loaded.pdf);
    payload = { success: true, numPages: loaded.numPages, metadata: loaded.metadata || {} };
  } catch (error) {
    logError(`[ClipAIble Offscreen] GET_PDF_METADATA failed for ${messageId}`, { error: error.message });
    payload = pdfFailurePayload(operation.signal.aborted ? operation.signal.reason : error);
  } finally {
    await operation.finish();
  }
  sendResponse(payload);
}

/**
 * Handle GET_PDF_PAGE_DIMENSIONS message - get PDF page dimensions via PDF.js API
 * Returns exact page width and height from PDF metadata (not viewport)
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, pageNum: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer}} data - Request data with pdfUrl, pageNum, and optional pdfDataRef or pdfData
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF page dimensions retrieval fails
 * @throws {Error} If PDF loading fails
 */
export async function handleGetPdfPageDimensions(messageId, data, sendResponse) {
  let pdf = null;
  log(`[ClipAIble Offscreen] GET_PDF_PAGE_DIMENSIONS request for ${messageId}`, {
    messageId,
    pdfUrl: data?.pdfUrl,
    pageNum: data?.pageNum || 1,
    hasPdfData: !!data?.pdfData,
    pdfDataType: typeof data?.pdfData,
    pdfDataLength: typeof data?.pdfData === 'string' ? data.pdfData.length : 0,
    pdfDataPreview: typeof data?.pdfData === 'string' ? data.pdfData.substring(0, 50) : 'not a string'
  });
  
  try {
    // CRITICAL: Load PDF data from IndexedDB if pdfDataRef is provided
    // This is more efficient than sending base64 through messages
    let pdfData = null;
    if (data?.pdfDataRef) {
      log(`[ClipAIble Offscreen] Loading PDF data from IndexedDB for ${messageId}...`, {
        messageId,
        pdfDataRef: data.pdfDataRef
      });
      
      try {
        const pdfStorageUrl = chrome.runtime.getURL('scripts/api/pdf-storage.js');
        const { getPdfData } = await import(pdfStorageUrl);
        pdfData = await getPdfData(data.pdfDataRef);
        
        if (pdfData) {
          log(`[ClipAIble Offscreen] PDF data loaded from IndexedDB for ${messageId}`, {
            messageId,
            size: pdfData.byteLength,
            sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2)
          });
        } else {
          logWarn(`[ClipAIble Offscreen] PDF data not found in IndexedDB for ${messageId}`, {
            messageId,
            pdfDataRef: data.pdfDataRef
          });
        }
      } catch (storageError) {
        logError(`[ClipAIble Offscreen] Failed to load PDF data from IndexedDB for ${messageId}`, {
          messageId,
          error: storageError.message,
          pdfDataRef: data.pdfDataRef
        });
        // Don't throw - will try to load from URL instead
      }
    } else if (data?.pdfData) {
      // Fallback: decode base64 if provided (for backward compatibility)
      if (typeof data.pdfData === 'string') {
        // Base64 string - decode it
        try {
          const binaryString = atob(data.pdfData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfData = bytes.buffer;
          
          // Verify PDF header (should start with %PDF)
          const headerBytes = new Uint8Array(pdfData).slice(0, 4);
          const headerText = String.fromCharCode(...headerBytes);
          
          log(`[ClipAIble Offscreen] PDF data decoded from base64 for ${messageId}`, {
            messageId,
            base64Length: data.pdfData.length,
            arrayBufferSize: pdfData.byteLength,
            header: headerText,
            isValidPdf: headerText === '%PDF'
          });
          
          if (headerText !== '%PDF') {
            logWarn(`[ClipAIble Offscreen] WARNING: PDF data may be corrupted for ${messageId}`, {
              messageId,
              headerText,
              expected: '%PDF',
              firstBytes: Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
            });
            throw createPdfError(`Invalid PDF header: expected '%PDF', got '${headerText}'`, 'errorPdfInvalid');
          }
        } catch (decodeError) {
          logError(`[ClipAIble Offscreen] Failed to decode PDF data from base64 for ${messageId}`, {
            messageId,
            error: decodeError.message,
            base64Length: data.pdfData.length,
            base64Preview: data.pdfData.substring(0, 100)
          });
          throw createPdfError(`Failed to decode PDF data: ${decodeError.message}`, 'errorPdfInvalid');
        }
      } else if (data.pdfData instanceof ArrayBuffer) {
        // Already ArrayBuffer (shouldn't happen, but handle it)
        pdfData = data.pdfData;
      }
    }
    // Load PDF document (use pdfData if provided, otherwise load from URL)
    let numPages;
    
    if (pdfData) {
      // Use provided PDF data (already decoded from base64)
      try {
        const pdfDocument = await parsePdfDocument(pdfData);
        pdf = pdfDocument;
        numPages = pdfDocument.numPages;
        
        log(`[ClipAIble Offscreen] PDF document loaded from data for ${messageId}`, {
          messageId,
          numPages,
          pdfDataSize: pdfData.byteLength
        });
      } catch (loadError) {
        logError(`[ClipAIble Offscreen] Failed to load PDF document from data for ${messageId}`, {
          messageId,
          error: loadError.message,
          pdfDataSize: pdfData.byteLength,
          firstBytes: Array.from(new Uint8Array(pdfData).slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
        });
        throw loadError;
      }
    } else {
      // Load from URL
      const loaded = await loadPdfDocument(data.pdfUrl);
      pdf = loaded.pdf;
      numPages = loaded.numPages;
    }
    
    const pageNum = data.pageNum || 1;
    if (pageNum < 1 || pageNum > numPages) {
      throw createPdfError(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`, 'errorPdfPageUnavailable', { page: pageNum, pages: numPages });
    }
    
    // Get page
    const page = await pdf.getPage(pageNum);
    
    // Get mediaBox and cropBox (PDF units, usually points - 1/72 inch)
    const mediaBox = page.mediaBox || null;
    const cropBox = page.cropBox || null;
    
    // CRITICAL: Chrome PDFium viewer at 100% zoom uses 72 DPI (1 point = 1 pixel)
    // This is the standard for PDF viewers - they use 72 DPI for display
    // PDF.js getViewport({ scale: 1.0 }) returns dimensions in pixels for 72 DPI
    // So we use getViewport({ scale: 1.0 }) directly - no conversion needed
    
    // Get viewport with scale 1.0 - this gives us dimensions in pixels for 100% zoom
    // Chrome PDFium viewer uses 1 point = 1 pixel at 100% zoom
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Use cropBox if available (actual page content), otherwise use mediaBox (full page)
    // But getViewport already accounts for cropBox, so we use viewport dimensions directly
    const widthInPixels = Math.round(viewport.width);
    const heightInPixels = Math.round(viewport.height);
    
    // Also get dimensions in points for reference
    const pageBox = cropBox || mediaBox;
    let widthInPoints = 0;
    let heightInPoints = 0;
    if (pageBox && pageBox.length >= 4) {
      widthInPoints = pageBox[2] - pageBox[0];
      heightInPoints = pageBox[3] - pageBox[1];
    } else {
      // If no pageBox, use viewport dimensions (they're the same at scale 1.0)
      widthInPoints = viewport.width;
      heightInPoints = viewport.height;
    }
    
    const dimensions = {
      width: widthInPixels,
      height: heightInPixels,
      widthInPoints: widthInPoints,
      heightInPoints: heightInPoints,
      conversionFactor: 1.0, // 1 point = 1 pixel at 100% zoom in Chrome PDFium viewer
      mediaBox: mediaBox ? {
        x: mediaBox[0],
        y: mediaBox[1],
        width: mediaBox[2] - mediaBox[0],
        height: mediaBox[3] - mediaBox[1]
      } : null,
      cropBox: cropBox ? {
        x: cropBox[0],
        y: cropBox[1],
        width: cropBox[2] - cropBox[0],
        height: cropBox[3] - cropBox[1]
      } : null
    };
    
    log(`[ClipAIble Offscreen] GET_PDF_PAGE_DIMENSIONS complete for ${messageId}`, 'PDF_PAGE_DIMENSIONS_RETRIEVED', {
      messageId,
      pageNum,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: (dimensions.width / dimensions.height).toFixed(4),
      mediaBox: dimensions.mediaBox,
      cropBox: dimensions.cropBox
    });
    
    sendResponse({
      success: true,
      width: dimensions.width,
      height: dimensions.height,
      mediaBox: dimensions.mediaBox,
      cropBox: dimensions.cropBox
    });
  } catch (error) {
    logError(`[ClipAIble Offscreen] GET_PDF_PAGE_DIMENSIONS failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
    sendResponse(pdfFailurePayload(error));
  } finally {
    await destroyPdfDocument(pdf);
  }
}

/**
 * Handle RENDER_PDF_PAGE_IMAGE message - render PDF page as image (base64)
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, pageNum: number, scale?: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer}} data - Request data with pdfUrl, pageNum, and optional scale, pdfDataRef, or pdfData
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @param {import('../types.js').SendResponseFunction} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF page rendering fails
 * @throws {Error} If PDF loading fails
 */
export async function handleRenderPdfPageImage(messageId, data, sendResponse) {
  const operation = startPdfRender(data.operationId);
  let pdf = null;
  let resultPayload;
  const startTime = Date.now();
  log(`[ClipAIble Offscreen] RENDER_PDF_PAGE_IMAGE request for ${messageId}`, 'RENDER_PDF_PAGE_IMAGE_START', {
    messageId,
    pdfUrl: data?.pdfUrl,
    pageNum: data?.pageNum,
    scale: data?.scale || 2.0,
    hasPdfData: !!data.pdfData,
    hasPdfDataRef: !!data.pdfDataRef,
    pdfDataRef: data?.pdfDataRef
  });
  
  try {
    operation.check();
    log(`[ClipAIble Offscreen] Loading PDF document for ${messageId}...`, 'RENDER_PDF_PAGE_IMAGE_LOAD_START', { 
      messageId, 
      hasPdfData: !!data.pdfData,
      hasPdfDataRef: !!data.pdfDataRef,
      pdfDataRef: data?.pdfDataRef
    });
    const loadStart = Date.now();
    
    // If PDF data is provided directly (for local files), use it
    // Otherwise, fetch from URL
    // CRITICAL: Check for IndexedDB reference first (for large PDFs)
    let pdfData = null;
    if (data.pdfDataRef) {
      try { pdfData = await getPdfData(data.pdfDataRef); }
      catch { throw createPdfError('PDF data could not be read', 'errorPdfDataUnavailable'); }
      if (!(pdfData instanceof ArrayBuffer)) throw createPdfError('PDF data is unavailable', 'errorPdfDataUnavailable');
    } else if (data.pdfData) {
      log(`[ClipAIble Offscreen] Converting PDF data for ${messageId}...`, {
        messageId,
        dataType: typeof data.pdfData,
        isString: typeof data.pdfData === 'string',
        isArrayBuffer: data.pdfData instanceof ArrayBuffer,
        stringLength: typeof data.pdfData === 'string' ? data.pdfData.length : 0
      });
      
      // Convert base64 or ArrayBuffer to ArrayBuffer
      if (typeof data.pdfData === 'string') {
        // Base64 string - decode it
        const decodeStart = Date.now();
        const binaryString = atob(data.pdfData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = bytes.buffer;
        
        log(`[ClipAIble Offscreen] PDF data decoded from base64 for ${messageId}`, {
          messageId,
          base64Length: data.pdfData.length,
          arrayBufferSize: pdfData.byteLength,
          decodeDuration: Date.now() - decodeStart,
          firstBytes: Array.from(new Uint8Array(pdfData).slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')
        });
        
        // Verify PDF header (should start with %PDF)
        const headerBytes = new Uint8Array(pdfData).slice(0, 4);
        const headerText = String.fromCharCode(...headerBytes);
        if (headerText !== '%PDF') {
          logWarn(`[ClipAIble Offscreen] WARNING: PDF data may be corrupted for ${messageId}`, {
            messageId,
            headerText,
            expected: '%PDF',
            firstBytes: Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
          });
        } else {
          log(`[ClipAIble Offscreen] PDF header verified for ${messageId}`, {
            messageId,
            header: headerText
          });
        }
      } else if (data.pdfData instanceof ArrayBuffer) {
        pdfData = data.pdfData;
        log(`[ClipAIble Offscreen] PDF data already ArrayBuffer for ${messageId}`, {
          messageId,
          size: pdfData.byteLength
        });
      }
    }
    
    log(`[ClipAIble Offscreen] About to load PDF document for ${messageId}...`, 'PDF_DOCUMENT_LOAD_START', {
      messageId,
      pdfUrl: data.pdfUrl,
      hasPdfData: !!pdfData,
      pdfDataSize: pdfData ? pdfData.byteLength : 0
    });
    
    const loadStartTime = Date.now();
    operation.check();
    const loaded = await loadPdfDocument(data.pdfUrl, pdfData, { signal: operation.signal, checkCancelled: operation.check });
    pdf = loaded.pdf;
    operation.adopt(pdf);
    const { numPages } = loaded;
    const loadDuration = Date.now() - loadStartTime;
    
    log(`[ClipAIble Offscreen] PDF document loaded successfully for ${messageId}`, 'PDF_DOCUMENT_LOADED', {
      messageId,
      numPages,
      loadDuration,
      pdfType: typeof pdf,
      hasGetPage: typeof pdf.getPage === 'function'
    });
    log(`[ClipAIble Offscreen] PDF document loaded for ${messageId}`, {
      messageId,
      numPages,
      loadDuration: Date.now() - loadStart,
      usedProvidedData: !!pdfData
    });
    
    const pageNum = data.pageNum || 1;
    const scale = data.scale ?? 2.0; // Higher scale = better quality
    
    if (pageNum < 1 || pageNum > numPages) {
      throw createPdfError(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`, 'errorPdfPageUnavailable', { page: pageNum, pages: numPages });
    }
    
    log(`[ClipAIble Offscreen] Getting page ${pageNum} for ${messageId}...`, { messageId, pageNum });
    const getPageStart = Date.now();
    const page = await pdf.getPage(pageNum);
    log(`[ClipAIble Offscreen] Page ${pageNum} retrieved for ${messageId}`, {
      messageId,
      pageNum,
      getPageDuration: Date.now() - getPageStart
    });
    
    const { viewport, width, height } = getPdfRenderViewport(page, scale);
    log(`[ClipAIble Offscreen] Viewport created for ${messageId}`, {
      messageId,
      pageNum,
      width,
      height,
      scale
    });
    
    // Create a new canvas for each page.
    // PDF.js cannot reuse the same canvas - causes "Cannot use the same canvas" error
    // Always use standard HTMLCanvasElement (NOT OffscreenCanvas) for offscreen document
    if (typeof document === 'undefined' || !document.createElement) {
      throw createPdfError('document.createElement not available - cannot render PDF in offscreen document', 'errorPdfRenderFailed');
    }
    
    // Create NEW canvas for this page (not reused from previous pages)
    // CRITICAL: Declare canvas and context outside try block for cleanup in finally
    let canvas = null;
    let context = null;
    let renderTask = null;
    let renderTimeoutId = null;
    
    try {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext('2d', { alpha: false });
      
      log(`[ClipAIble Offscreen] Created NEW canvas for page ${pageNum} (${messageId})`, {
        messageId,
        pageNum,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasType: canvas.constructor.name
      });
      
      // Render PDF page to canvas with timeout
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'print'
      };
    
    log(`[ClipAIble Offscreen] Starting page render for ${messageId}...`, 'PDF_PAGE_RENDER_START', { 
      messageId, 
      pageNum,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      hasCanvas: !!canvas,
      hasContext: !!context,
      contextType: context ? context.constructor.name : 'none'
    });
    const renderStart = Date.now();
    
    // CRITICAL: Check if context is valid before rendering
    if (!context) {
      throw createPdfError('Canvas context is null - cannot render PDF page', 'errorPdfRenderFailed');
    }
    
    // CRITICAL: Check canvas dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      throw createPdfError(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`, 'errorPdfRenderFailed');
    }
    
    log(`[ClipAIble Offscreen] About to call page.render() for ${messageId}...`, 'PDF_PAGE_RENDER_CALL_START', {
      messageId,
      pageNum,
      renderContextKeys: Object.keys(renderContext),
      hasCanvasContext: !!renderContext.canvasContext,
      hasViewport: !!renderContext.viewport,
      contextType: context.constructor.name,
      canvasType: canvas.constructor.name
    });
    
       // Bound rendering and retain the task for cancellation.
      // CRITICAL: Use renderTask to get better control over rendering
      renderTask = page.render(renderContext);
      operation.track(renderTask);
      log(`[ClipAIble Offscreen] renderTask created for ${messageId}`, 'PDF_PAGE_RENDER_TASK_CREATED', {
        messageId,
        pageNum,
        hasRenderTask: !!renderTask,
        hasPromise: !!renderTask.promise,
        renderTaskType: typeof renderTask
      });
      
      const renderPromise = renderTask.promise.then(() => {
        log(`[ClipAIble Offscreen] renderTask.promise resolved for ${messageId}`, 'PDF_PAGE_RENDER_PROMISE_RESOLVED', {
          messageId,
          pageNum,
          renderDuration: Date.now() - renderStart
        });
      }).catch((error) => {
        log(`[ClipAIble Offscreen] renderTask.promise REJECTED for ${messageId}`, 'PDF_PAGE_RENDER_PROMISE_REJECTED', {
          messageId,
          pageNum,
          error: error.message,
          errorStack: error.stack,
          renderDuration: Date.now() - renderStart
        });
        throw error;
      });
      
      // CRITICAL: Use longer timeout (5 minutes) for PDF rendering
      // Rendering large documents can take time.
      // Very large PDFs (up to 1000 pages) can take significantly longer to render
      const RENDER_TIMEOUT_MS = CONFIG.PDF_RENDER_TIMEOUT_MS;
      const timeoutPromise = new Promise((_, reject) => {
        renderTimeoutId = setTimeout(() => {
          log(`[ClipAIble Offscreen] PDF page render TIMEOUT for ${messageId}`, 'PDF_PAGE_RENDER_TIMEOUT', {
            messageId,
            pageNum,
            renderDuration: Date.now() - renderStart,
            timeoutMs: RENDER_TIMEOUT_MS
          });
          // CRITICAL: Cancel render task on timeout
          if (renderTask && typeof renderTask.cancel === 'function') {
            try {
              renderTask.cancel();
              log(`[ClipAIble Offscreen] Render task cancelled for ${messageId}`, 'PDF_PAGE_RENDER_CANCELLED', {
                messageId,
                pageNum
              });
            } catch (cancelError) {
              log(`[ClipAIble Offscreen] Failed to cancel render task for ${messageId}`, 'PDF_PAGE_RENDER_CANCEL_FAILED', {
                messageId,
                pageNum,
                error: cancelError.message
              });
            }
          }
          reject(createPdfError(`PDF page render timeout after ${RENDER_TIMEOUT_MS / 1000} seconds`, 'errorTimeout'));
        }, RENDER_TIMEOUT_MS);
      });
      
      try {
        await Promise.race([renderPromise, timeoutPromise]);
        
        log(`[ClipAIble Offscreen] Page render complete for ${messageId}`, 'PDF_PAGE_RENDER_COMPLETE', {
          messageId,
          pageNum,
          renderDuration: Date.now() - renderStart
        });
      } catch (renderError) {
        // CRITICAL: If render fails or times out, cancel the task and cleanup
        if (renderTask && typeof renderTask.cancel === 'function') {
          try {
            renderTask.cancel();
            log(`[ClipAIble Offscreen] Render task cancelled due to error for ${messageId}`, {
              messageId,
              pageNum,
              error: renderError.message
            });
            // Wait for cancel to complete
            try {
              await renderTask.promise; // Will reject with RenderingCancelledException
            } catch (cancelError) {
              if (cancelError.name !== 'RenderingCancelledException') {
                logWarn(`[ClipAIble Offscreen] Cancel promise rejected with unexpected error for ${messageId}`, {
                  messageId,
                  pageNum,
                  error: cancelError.message,
                  errorName: cancelError.name
                });
              }
            }
          } catch (cancelError) {
            logWarn(`[ClipAIble Offscreen] Failed to cancel render task for ${messageId}`, {
              messageId,
              pageNum,
              cancelError: cancelError.message
            });
          }
        }
        throw renderError; // Re-throw to be handled by outer try/catch
      }
      
      // Convert canvas to base64 image
      log(`[ClipAIble Offscreen] Converting canvas to base64 for ${messageId}...`, { messageId, pageNum });
      const convertStart = Date.now();
      
      // Use JPEG with a quality setting to reduce file size.
      operation.check();
      const imageData = canvas.toDataURL('image/jpeg', 0.92);
      
      log(`[ClipAIble Offscreen] Canvas converted for ${messageId}`, {
        messageId,
        pageNum,
        imageSize: imageData.length,
        convertDuration: Date.now() - convertStart,
        canvasType: canvas.constructor.name,
        format: 'image/jpeg'
      });
      
      // Release the page before clearing the canvas.
      page.cleanup();
      
      const totalDuration = Date.now() - startTime;
      log(`[ClipAIble Offscreen] RENDER_PDF_PAGE_IMAGE complete for ${messageId}`, {
        messageId,
        pageNum,
        imageSize: imageData.length,
        dimensions: { width, height },
        totalDuration
      });
      
      resultPayload = {
        success: true,
        imageData: imageData, // base64 data URL
        width,
        height
      };
    } finally {
      if (renderTimeoutId) {
        clearTimeout(renderTimeoutId);
      }
      // Always clear the canvas after rendering.
      // This must happen in finally block to ensure cleanup even if error occurs
      if (canvas) {
        try {
          canvas.width = 0;
          canvas.height = 0;
          log(`[ClipAIble Offscreen] Canvas cleaned up in finally for ${messageId}`, {
            messageId,
            pageNum,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height
          });
        } catch (cleanupError) {
          logWarn(`[ClipAIble Offscreen] Failed to cleanup canvas for ${messageId}`, {
            messageId,
            pageNum,
            error: cleanupError.message
          });
        }
      }
      // Clear context reference
      context = null;
    }
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logError(`[ClipAIble Offscreen] RENDER_PDF_PAGE_IMAGE failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack,
      totalDuration
    });
    
    resultPayload = pdfFailurePayload(operation.signal.aborted ? operation.signal.reason : error);
  } finally {
    await operation.finish();
  }
  sendResponse(resultPayload);
}

/**
 * Handle RENDER_ALL_PDF_PAGES message - render all pages of a PDF document
 * Loads the PDF once and renders its pages sequentially.
 * This is MUCH faster than loading PDF for each page separately
 * 
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, totalPages: number, scale?: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer, operationId?: string}} data - Message data
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF rendering fails
 * @throws {Error} If PDF loading fails
 */
export async function handleRenderAllPdfPages(messageId, data, sendResponse) {
  const startTime = Date.now();
  log(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES request for ${messageId}`, 'RENDER_ALL_PDF_PAGES_START', {
    messageId,
    pdfUrl: data?.pdfUrl,
    totalPages: data?.totalPages,
    scale: data?.scale || 2.0,
    hasPdfData: !!data.pdfData,
    hasPdfDataRef: !!data.pdfDataRef,
    pdfDataRef: data?.pdfDataRef
  });
  
  const operation = startPdfRender(data.operationId);
  let pdf = null;
  let resultPayload;
  
  try {
    operation.check();
    // Load PDF data (same logic as handleRenderPdfPageImage)
    let pdfData = null;
    if (data.pdfDataRef) {
      try { pdfData = await getPdfData(data.pdfDataRef); }
      catch { throw createPdfError('PDF data could not be read', 'errorPdfDataUnavailable'); }
      if (!(pdfData instanceof ArrayBuffer)) throw createPdfError('PDF data is unavailable', 'errorPdfDataUnavailable');
    } else if (data.pdfData) {
      // Convert base64 or ArrayBuffer to ArrayBuffer
      if (typeof data.pdfData === 'string') {
        const binaryString = atob(data.pdfData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = bytes.buffer;
      } else if (data.pdfData instanceof ArrayBuffer) {
        pdfData = data.pdfData;
      }
    }
    
    if (!pdfData) {
      throw createPdfError('No PDF data provided', 'errorPdfInvalid');
    }
    
    // CRITICAL: Load PDF document ONCE for all pages
    log(`[ClipAIble Offscreen] Loading PDF document ONCE for all pages (${messageId})...`, 'PDF_DOCUMENT_LOAD_START', {
      messageId,
      pdfUrl: data.pdfUrl,
      pdfDataSize: pdfData.byteLength
    });
    
    const loadStartTime = Date.now();
    operation.check();
    const { pdf: loadedPdf, numPages } = await loadPdfDocument(data.pdfUrl, pdfData, { signal: operation.signal, checkCancelled: operation.check });
    pdf = loadedPdf;
    operation.adopt(pdf);
    const loadDuration = Date.now() - loadStartTime;
    
    const totalPages = data.totalPages || numPages;
    
    log(`[ClipAIble Offscreen] PDF document loaded ONCE for ${messageId}`, 'PDF_DOCUMENT_LOADED', {
      messageId,
      numPages,
      totalPages,
      loadDuration
    });
    
    const scale = data.scale ?? 2.0;
    const images = [];
    
    // CRITICAL: Render pages SEQUENTIALLY (not parallel!)
    // This ensures proper cleanup between pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      operation.check();
      let page = null;
      let canvas = null;
      let renderTask = null;
      
      try {
        // Get page
        page = await pdf.getPage(pageNum);
        
        // Create NEW canvas for this page
        if (typeof document === 'undefined' || !document.createElement) {
          throw createPdfError('document.createElement not available', 'errorPdfRenderFailed');
        }
        
        canvas = document.createElement('canvas');
        const { viewport, width, height } = getPdfRenderViewport(page, scale);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        
        // Render with timeout
        const renderStart = Date.now();
        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'print'
        });
        operation.track(renderTask);
        
        log(`[ClipAIble Offscreen] Render task created for page ${pageNum} (${messageId})`, {
          messageId,
          pageNum,
          hasRenderTask: !!renderTask,
          hasPromise: !!renderTask.promise,
          renderTaskType: typeof renderTask,
          renderTaskKeys: renderTask ? Object.keys(renderTask) : []
        });
        
        // CRITICAL: Add immediate diagnostic after render task creation
        log(`[ClipAIble Offscreen] Render task created, waiting for promise for page ${pageNum} (${messageId})`, 'PDF_PAGE_RENDER_START', {
          messageId,
          pageNum,
          hasRenderTask: !!renderTask,
          hasPromise: !!renderTask?.promise,
          promiseState: renderTask?.promise ? 'pending' : 'no-promise'
        });
        
        const renderPromise = renderTask.promise.then(() => {
          const renderDuration = Date.now() - renderStart;
          log(`[ClipAIble Offscreen] Render promise RESOLVED for page ${pageNum} (${messageId})`, {
            messageId,
            pageNum,
            renderDuration
          });
        }).catch((error) => {
          const renderDuration = Date.now() - renderStart;
          logError(`[ClipAIble Offscreen] Render promise REJECTED for page ${pageNum} (${messageId})`, {
            messageId,
            pageNum,
            error: error.message,
            errorName: error.name,
            errorStack: error.stack,
            renderDuration
          });
          throw error;
        });
        
        // Allow additional initialization time for the first page.
            // First page: 10 minutes (initialization), other pages: 5 minutes
        const RENDER_TIMEOUT_MS = pageNum === 1 ? CONFIG.PDF_FIRST_PAGE_RENDER_TIMEOUT_MS : CONFIG.PDF_RENDER_TIMEOUT_MS;
        let renderTimeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          renderTimeoutId = setTimeout(() => {
            const renderDuration = Date.now() - renderStart;
            logError(`[ClipAIble Offscreen] Render TIMEOUT for page ${pageNum} (${messageId})`, {
              messageId,
              pageNum,
              renderDuration,
              timeoutMs: RENDER_TIMEOUT_MS,
              hasRenderTask: !!renderTask,
              hasPromise: !!renderTask?.promise
            });
            
            if (renderTask && typeof renderTask.cancel === 'function') {
              try {
                renderTask.cancel();
                log(`[ClipAIble Offscreen] Render task cancelled due to timeout for page ${pageNum} (${messageId})`, {
                  messageId,
                  pageNum
                });
              } catch (cancelError) {
                logError(`[ClipAIble Offscreen] Failed to cancel render task for page ${pageNum} (${messageId})`, {
                  messageId,
                  pageNum,
                  error: cancelError.message
                });
              }
            }
            
            reject(createPdfError(`Page ${pageNum} render timeout after ${RENDER_TIMEOUT_MS / 1000} seconds`, 'errorTimeout'));
          }, RENDER_TIMEOUT_MS);
        });
        
        try {
          await Promise.race([renderPromise, timeoutPromise]);
        } finally {
          // Clear timeout if render completed before timeout
          if (renderTimeoutId) {
            clearTimeout(renderTimeoutId);
          }
        }
        
        // Convert to JPEG
        operation.check();
        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        const base64 = imageData.split(',')[1];
        
        images.push({
          pageNum,
          base64,
          width,
          height
        });
        
        log(`[ClipAIble Offscreen] Page ${pageNum} rendered successfully for ${messageId}`, {
          messageId,
          pageNum,
          width,
          height,
          imageSize: base64.length
        });
        
      } catch (error) {
        operation.check();
        logError(`[ClipAIble Offscreen] Page ${pageNum} render failed for ${messageId}`, {
          messageId,
          pageNum,
          error: error.message
        });
        
        // Cancel render task on error
        if (renderTask && typeof renderTask.cancel === 'function') {
          try {
            renderTask.cancel();
            try {
              await renderTask.promise; // Will reject with RenderingCancelledException
            } catch (cancelError) {
              if (cancelError.name !== 'RenderingCancelledException') {
                logWarn(`[ClipAIble Offscreen] Cancel promise rejected for ${messageId}`, {
                  messageId,
                  pageNum,
                  error: cancelError.message
                });
              }
            }
          } catch (cancelError) {
            logWarn(`[ClipAIble Offscreen] Failed to cancel render task for ${messageId}`, {
              messageId,
              pageNum,
              error: cancelError.message
            });
          }
        }
        
        // Add error placeholder
        images.push({
          pageNum,
          ...(pdfFailurePayload(error, 'errorPdfRenderFailed'))
        });
        
      } finally {
        // CRITICAL: Cleanup page BEFORE next iteration
        if (page) {
          page.cleanup();
        }
        
        // CRITICAL: Cleanup canvas
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      
      // OPTIONAL: GC pause every 10 pages (for large PDFs)
      if (pageNum % 10 === 0 && pageNum < totalPages) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    const totalDuration = Date.now() - startTime;
    log(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES complete for ${messageId}`, {
      messageId,
      totalPages,
      renderedPages: images.filter(img => !img.error).length,
      failedPages: images.filter(img => img.error).length,
      totalDuration
    });
    
    resultPayload = {
      success: true,
      images,
      totalPages
    };
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logError(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack,
      totalDuration
    });
    
    resultPayload = pdfFailurePayload(error);
    
  } finally {
    await operation.finish();
  }
  sendResponse(resultPayload);
}

export function handleCancelPdfRender(_messageId, data, sendResponse) {
  cancelPdfRender(data?.operationId);
  sendResponse({ success: true });
}
