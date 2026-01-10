// Message handlers for offscreen document
// Provides handler functions for different message types to reduce code duplication

// @ts-check

import { log, logError, criticalLog, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { extractPdfContent } from './pdf/extract.js';
import { loadPdfDocument } from './pdf/core/pdf-loader.js';
import { loadPdfJs } from './pdf/utils/pdf-loader.js';

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
  // Only log if verbose (reduces log volume)
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] GET_VOICES request`, { messageId });
  }
  
  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
  if (!ttsWorker) {
    await initTTSWorker();
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
    await initTTSWorker();
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
  // CRITICAL: Log function entry IMMEDIATELY with ALL available methods
  // VERSION v6 - Using criticalLog with localStorage and sendMessage
  const handleExtractPdfEntryMsg = `[ClipAIble Offscreen] handleExtractPdf ENTRY messageId=${messageId} pdfUrl=${data?.pdfUrl} - CODE VERSION 2025-12-29-v6`;
  const marker = `=== HANDLE_EXTRACT_PDF_ENTRY_${messageId}_V6 ===`;
  
  // Use criticalLog which tries ALL available methods
  criticalLog(handleExtractPdfEntryMsg, marker, { messageId, pdfUrl: data?.pdfUrl, version: 'v6' });
  
  const extractStart = Date.now();
  
  try {
    const result = await extractPdfContent(data.pdfUrl);
      const extractDuration = Date.now() - extractStart;
      
      // Diagnostic: Check if elements have lines with items
      if (result.content && Array.isArray(result.content)) {
        const elementsWithLines = result.content.filter(el => el.lines && Array.isArray(el.lines) && el.lines.length > 0);
        const elementsWithItems = elementsWithLines.filter(el => 
          el.lines.some(line => line.items && Array.isArray(line.items) && line.items.length > 0)
        );
        const elementsWithFormatting = elementsWithItems.filter(el =>
          el.lines.some(line => 
            line.items.some(item => 
              item.isBold !== undefined || item.isItalic !== undefined || item.isUnderlined !== undefined
            )
          )
        );
        
        log(`[ClipAIble Offscreen] EXTRACT_PDF complete for ${messageId}`, {
          messageId,
          title: result.title,
          contentItems: result.content?.length || 0,
          elementsWithLines: elementsWithLines.length,
          elementsWithItems: elementsWithItems.length,
          elementsWithFormatting: elementsWithFormatting.length,
          duration: extractDuration
        });
      } else {
        log(`[ClipAIble Offscreen] EXTRACT_PDF complete for ${messageId}`, {
          messageId,
          title: result.title,
          contentItems: result.content?.length || 0,
          duration: extractDuration
        });
      }
      
      sendResponse({
        success: true,
        result: result
      });
  } catch (error) {
    logError(`[ClipAIble Offscreen] EXTRACT_PDF failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
      sendResponse({
        success: false,
        error: error.message
      });
  }
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
  // Only log if verbose
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] EXTRACT_PDF_PAGE_TEXT request`, {
      messageId,
      pageNum: data?.pageNum
    });
  }
  
  try {
    const { pdf, numPages } = await loadPdfDocument(data.pdfUrl);
    const pageNum = data.pageNum || 1;
    
    if (pageNum < 1 || pageNum > numPages) {
      throw new Error(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`);
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
    
    sendResponse({
      success: false,
      error: error.message
    });
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
  // Only log if verbose
  if (CONFIG?.VERBOSE_LOGGING) {
    log(`[ClipAIble Offscreen] GET_PDF_METADATA request`, { messageId });
  }
  
  try {
    const { pdf, numPages, metadata } = await loadPdfDocument(data.pdfUrl);
    
    // Only log if verbose
    if (CONFIG?.VERBOSE_LOGGING) {
      log(`[ClipAIble Offscreen] GET_PDF_METADATA complete`, {
        messageId,
        numPages,
        hasMetadata: !!metadata
      });
    }
    
    sendResponse({
      success: true,
      numPages,
      metadata: metadata || {}
    });
  } catch (error) {
    logError(`[ClipAIble Offscreen] GET_PDF_METADATA failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
    sendResponse({
      success: false,
      error: error.message
    });
  }
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
            throw new Error(`Invalid PDF header: expected '%PDF', got '${headerText}'`);
          }
        } catch (decodeError) {
          logError(`[ClipAIble Offscreen] Failed to decode PDF data from base64 for ${messageId}`, {
            messageId,
            error: decodeError.message,
            base64Length: data.pdfData.length,
            base64Preview: data.pdfData.substring(0, 100)
          });
          throw new Error(`Failed to decode PDF data: ${decodeError.message}`);
        }
      } else if (data.pdfData instanceof ArrayBuffer) {
        // Already ArrayBuffer (shouldn't happen, but handle it)
        pdfData = data.pdfData;
      }
    }
    // Load PDF document (use pdfData if provided, otherwise load from URL)
    let pdf;
    let numPages;
    
    if (pdfData) {
      // Use provided PDF data (already decoded from base64)
      try {
        const pdfjsLib = await loadPdfJs();
        const loadingTask = pdfjsLib.getDocument({ data: pdfData, disableWorker: true });
        const pdfDocument = await loadingTask.promise;
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
        throw new Error(`Failed to load PDF document: ${loadError.message}`);
      }
    } else {
      // Load from URL
      const loaded = await loadPdfDocument(data.pdfUrl);
      pdf = loaded.pdf;
      numPages = loaded.numPages;
    }
    
    const pageNum = data.pageNum || 1;
    if (pageNum < 1 || pageNum > numPages) {
      throw new Error(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`);
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
    
    criticalLog(`[ClipAIble Offscreen] GET_PDF_PAGE_DIMENSIONS complete for ${messageId}`, 'PDF_PAGE_DIMENSIONS_RETRIEVED', {
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
    
    sendResponse({
      success: false,
      error: error.message
    });
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
  const startTime = Date.now();
  criticalLog(`[ClipAIble Offscreen] RENDER_PDF_PAGE_IMAGE request for ${messageId}`, 'RENDER_PDF_PAGE_IMAGE_START', {
    messageId,
    pdfUrl: data?.pdfUrl,
    pageNum: data?.pageNum,
    scale: data?.scale || 2.0,
    hasPdfData: !!data.pdfData,
    hasPdfDataRef: !!data.pdfDataRef,
    pdfDataRef: data?.pdfDataRef
  });
  
  try {
    criticalLog(`[ClipAIble Offscreen] Loading PDF document for ${messageId}...`, 'RENDER_PDF_PAGE_IMAGE_LOAD_START', { 
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
      log(`[ClipAIble Offscreen] Loading PDF data from IndexedDB for ${messageId}...`, {
        messageId,
        pdfDataRef: data.pdfDataRef
      });
      
      try {
        criticalLog(`[ClipAIble Offscreen] Starting dynamic import of pdf-storage.js for ${messageId}...`, 'PDF_STORAGE_IMPORT_START', {
          messageId,
          pdfDataRef: data.pdfDataRef
        });
        const importStart = Date.now();
        
        // CRITICAL: Dynamic import is needed because pdf-storage.js is in scripts/api/
        // which is outside the offscreen bundle. We need to import it at runtime.
        // Offscreen document can use dynamic imports (unlike service worker)
        // Use chrome.runtime.getURL() to get the correct extension URL
        const pdfStorageUrl = chrome.runtime.getURL('scripts/api/pdf-storage.js');
        criticalLog(`[ClipAIble Offscreen] PDF storage URL: ${pdfStorageUrl}`, 'PDF_STORAGE_URL', {
          messageId,
          pdfStorageUrl
        });
        const { getPdfData } = await import(pdfStorageUrl);
        const importDuration = Date.now() - importStart;
        
        criticalLog(`[ClipAIble Offscreen] pdf-storage.js imported successfully for ${messageId}`, 'PDF_STORAGE_IMPORT_SUCCESS', {
          messageId,
          importDuration,
          hasGetPdfData: typeof getPdfData === 'function'
        });
        
        const loadStart = Date.now();
        pdfData = await getPdfData(data.pdfDataRef);
        const loadDuration = Date.now() - loadStart;
        
        if (pdfData) {
          criticalLog(`[ClipAIble Offscreen] PDF data loaded from IndexedDB for ${messageId}`, 'PDF_DATA_LOADED', {
            messageId,
            size: pdfData.byteLength,
            loadDuration,
            firstBytes: Array.from(new Uint8Array(pdfData).slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')
          });
        } else {
          criticalLog(`[ClipAIble Offscreen] PDF data not found in IndexedDB for ${messageId}`, 'PDF_DATA_NOT_FOUND', {
            messageId,
            pdfDataRef: data.pdfDataRef,
            loadDuration
          });
        }
      } catch (storageError) {
        criticalLog(`[ClipAIble Offscreen] Failed to load PDF data from IndexedDB for ${messageId}`, 'PDF_DATA_LOAD_ERROR', {
          messageId,
          error: storageError.message,
          errorStack: storageError.stack,
          pdfDataRef: data.pdfDataRef
        });
        logError(`[ClipAIble Offscreen] Failed to load PDF data from IndexedDB for ${messageId}`, {
          messageId,
          error: storageError.message,
          errorStack: storageError.stack,
          pdfDataRef: data.pdfDataRef
        });
      }
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
    
    criticalLog(`[ClipAIble Offscreen] About to load PDF document for ${messageId}...`, 'PDF_DOCUMENT_LOAD_START', {
      messageId,
      pdfUrl: data.pdfUrl,
      hasPdfData: !!pdfData,
      pdfDataSize: pdfData ? pdfData.byteLength : 0
    });
    
    const loadStartTime = Date.now();
    const { pdf, numPages } = await loadPdfDocument(data.pdfUrl, pdfData);
    const loadDuration = Date.now() - loadStartTime;
    
    criticalLog(`[ClipAIble Offscreen] PDF document loaded successfully for ${messageId}`, 'PDF_DOCUMENT_LOADED', {
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
    const scale = data.scale || 2.0; // Higher scale = better quality
    
    if (pageNum < 1 || pageNum > numPages) {
      throw new Error(`Invalid page number: ${pageNum}. PDF has ${numPages} pages.`);
    }
    
    log(`[ClipAIble Offscreen] Getting page ${pageNum} for ${messageId}...`, { messageId, pageNum });
    const getPageStart = Date.now();
    const page = await pdf.getPage(pageNum);
    log(`[ClipAIble Offscreen] Page ${pageNum} retrieved for ${messageId}`, {
      messageId,
      pageNum,
      getPageDuration: Date.now() - getPageStart
    });
    
    const viewport = page.getViewport({ scale });
    log(`[ClipAIble Offscreen] Viewport created for ${messageId}`, {
      messageId,
      pageNum,
      width: viewport.width,
      height: viewport.height,
      scale
    });
    
    // CRITICAL: Create NEW canvas for EACH page (per Perplexity analysis)
    // PDF.js cannot reuse the same canvas - causes "Cannot use the same canvas" error
    // Always use standard HTMLCanvasElement (NOT OffscreenCanvas) for offscreen document
    if (typeof document === 'undefined' || !document.createElement) {
      throw new Error('document.createElement not available - cannot render PDF in offscreen document');
    }
    
    // Create NEW canvas for this page (not reused from previous pages)
    // CRITICAL: Declare canvas and context outside try block for cleanup in finally
    let canvas = null;
    let context = null;
    let renderTask = null;
    
    try {
      canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
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
        viewport: viewport
      };
    
    criticalLog(`[ClipAIble Offscreen] Starting page render for ${messageId}...`, 'PDF_PAGE_RENDER_START', { 
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
      throw new Error('Canvas context is null - cannot render PDF page');
    }
    
    // CRITICAL: Check canvas dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`);
    }
    
    // CRITICAL: Check PDF.js worker status before rendering
    const pdfjsLib = await loadPdfJs();
    const globalWorkerDisabled = pdfjsLib.GlobalWorkerOptions?.disableWorker === true;
    const directDisableWorker = pdfjsLib.disableWorker === true;
    const workerDisabled = globalWorkerDisabled || directDisableWorker;
    
    criticalLog(`[ClipAIble Offscreen] PDF.js worker status check for ${messageId}...`, 'PDF_WORKER_STATUS_CHECK', {
      messageId,
      pageNum,
      hasGlobalWorkerOptions: !!pdfjsLib.GlobalWorkerOptions,
      workerSrc: pdfjsLib.GlobalWorkerOptions?.workerSrc,
      globalWorkerOptionsDisableWorker: pdfjsLib.GlobalWorkerOptions?.disableWorker,
      pdfjsLibDisableWorker: pdfjsLib.disableWorker,
      workerDisabled: workerDisabled,
      hasRenderMethod: typeof page.render === 'function',
      hasGetOperatorList: typeof page.getOperatorList === 'function'
    });
    
    if (!workerDisabled) {
      logWarn(`[ClipAIble Offscreen] WARNING: Worker may still be enabled for ${messageId}! Rendering may hang.`, {
        messageId,
        pageNum,
        globalWorkerOptionsDisableWorker: pdfjsLib.GlobalWorkerOptions?.disableWorker,
        pdfjsLibDisableWorker: pdfjsLib.disableWorker
      });
    }
    
    criticalLog(`[ClipAIble Offscreen] About to call page.render() for ${messageId}...`, 'PDF_PAGE_RENDER_CALL_START', {
      messageId,
      pageNum,
      renderContextKeys: Object.keys(renderContext),
      hasCanvasContext: !!renderContext.canvasContext,
      hasViewport: !!renderContext.viewport,
      contextType: context.constructor.name,
      canvasType: canvas.constructor.name
    });
    
      // Add timeout for rendering (60 seconds max)
      // CRITICAL: Use renderTask to get better control over rendering
      // Try to use getOperatorList first if render hangs (alternative rendering method)
      renderTask = page.render(renderContext);
      criticalLog(`[ClipAIble Offscreen] renderTask created for ${messageId}`, 'PDF_PAGE_RENDER_TASK_CREATED', {
        messageId,
        pageNum,
        hasRenderTask: !!renderTask,
        hasPromise: !!renderTask.promise,
        renderTaskType: typeof renderTask
      });
      
      const renderPromise = renderTask.promise.then(() => {
        criticalLog(`[ClipAIble Offscreen] renderTask.promise resolved for ${messageId}`, 'PDF_PAGE_RENDER_PROMISE_RESOLVED', {
          messageId,
          pageNum,
          renderDuration: Date.now() - renderStart
        });
      }).catch((error) => {
        criticalLog(`[ClipAIble Offscreen] renderTask.promise REJECTED for ${messageId}`, 'PDF_PAGE_RENDER_PROMISE_REJECTED', {
          messageId,
          pageNum,
          error: error.message,
          errorStack: error.stack,
          renderDuration: Date.now() - renderStart
        });
        throw error;
      });
      
      // CRITICAL: Use longer timeout (5 minutes) for PDF rendering
      // According to PDF.js documentation and Perplexity analysis, rendering can take time
      // Very large PDFs (up to 1000 pages) can take significantly longer to render
      // With disableWorker=true set BEFORE import, rendering should work in main thread
      const RENDER_TIMEOUT_MS = CONFIG.PDF_RENDER_TIMEOUT_MS;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          criticalLog(`[ClipAIble Offscreen] PDF page render TIMEOUT for ${messageId}`, 'PDF_PAGE_RENDER_TIMEOUT', {
            messageId,
            pageNum,
            renderDuration: Date.now() - renderStart,
            timeoutMs: RENDER_TIMEOUT_MS
          });
          // CRITICAL: Cancel render task on timeout
          if (renderTask && typeof renderTask.cancel === 'function') {
            try {
              renderTask.cancel();
              criticalLog(`[ClipAIble Offscreen] Render task cancelled for ${messageId}`, 'PDF_PAGE_RENDER_CANCELLED', {
                messageId,
                pageNum
              });
            } catch (cancelError) {
              criticalLog(`[ClipAIble Offscreen] Failed to cancel render task for ${messageId}`, 'PDF_PAGE_RENDER_CANCEL_FAILED', {
                messageId,
                pageNum,
                error: cancelError.message
              });
            }
          }
          reject(new Error(`PDF page render timeout after ${RENDER_TIMEOUT_MS / 1000} seconds (worker likely hung in offscreen document)`));
        }, RENDER_TIMEOUT_MS);
      });
      
      try {
        await Promise.race([renderPromise, timeoutPromise]);
        
        criticalLog(`[ClipAIble Offscreen] Page render complete for ${messageId}`, 'PDF_PAGE_RENDER_COMPLETE', {
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
      
      // CRITICAL: Use JPEG format with quality for smaller file size (per Perplexity recommendation)
      const imageData = canvas.toDataURL('image/jpeg', 0.92);
      
      log(`[ClipAIble Offscreen] Canvas converted for ${messageId}`, {
        messageId,
        pageNum,
        imageSize: imageData.length,
        convertDuration: Date.now() - convertStart,
        canvasType: canvas.constructor.name,
        format: 'image/jpeg'
      });
      
      // CRITICAL: Cleanup page BEFORE canvas cleanup (per Perplexity recommendation)
      page.cleanup();
      
      const totalDuration = Date.now() - startTime;
      log(`[ClipAIble Offscreen] RENDER_PDF_PAGE_IMAGE complete for ${messageId}`, {
        messageId,
        pageNum,
        imageSize: imageData.length,
        dimensions: { width: viewport.width, height: viewport.height },
        totalDuration
      });
      
      sendResponse({
        success: true,
        imageData: imageData, // base64 data URL
        width: viewport.width,
        height: viewport.height
      });
    } finally {
      // CRITICAL: Always cleanup canvas (per Perplexity - prevents "Cannot use the same canvas" error)
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
    
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle RENDER_ALL_PDF_PAGES message - render all pages of a PDF document
 * CRITICAL: Loads PDF ONCE and renders all pages sequentially (per Perplexity analysis)
 * This is MUCH faster than loading PDF for each page separately
 * 
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, totalPages: number, scale?: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer, originalTabLayout?: any}} data - Message data
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF rendering fails
 * @throws {Error} If PDF loading fails
 */
export async function handleRenderAllPdfPages(messageId, data, sendResponse) {
  const startTime = Date.now();
  criticalLog(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES request for ${messageId}`, 'RENDER_ALL_PDF_PAGES_START', {
    messageId,
    pdfUrl: data?.pdfUrl,
    totalPages: data?.totalPages,
    scale: data?.scale || 2.0,
    hasPdfData: !!data.pdfData,
    hasPdfDataRef: !!data.pdfDataRef,
    pdfDataRef: data?.pdfDataRef
  });
  
  let pdf = null;
  
  try {
    // Load PDF data (same logic as handleRenderPdfPageImage)
    let pdfData = null;
    if (data.pdfDataRef) {
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
            size: pdfData.byteLength
          });
        }
      } catch (storageError) {
        logError(`[ClipAIble Offscreen] Failed to load PDF data from IndexedDB for ${messageId}`, {
          messageId,
          error: storageError.message
        });
        throw storageError;
      }
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
      throw new Error('No PDF data provided');
    }
    
    // CRITICAL: Load PDF document ONCE for all pages
    criticalLog(`[ClipAIble Offscreen] Loading PDF document ONCE for all pages (${messageId})...`, 'PDF_DOCUMENT_LOAD_START', {
      messageId,
      pdfUrl: data.pdfUrl,
      pdfDataSize: pdfData.byteLength
    });
    
    const loadStartTime = Date.now();
    const { pdf: loadedPdf, numPages } = await loadPdfDocument(data.pdfUrl, pdfData);
    pdf = loadedPdf;
    const loadDuration = Date.now() - loadStartTime;
    
    const totalPages = data.totalPages || numPages;
    
    criticalLog(`[ClipAIble Offscreen] PDF document loaded ONCE for ${messageId}`, 'PDF_DOCUMENT_LOADED', {
      messageId,
      numPages,
      totalPages,
      loadDuration
    });
    
    const scale = data.scale || 2.0;
    const images = [];
    
    // CRITICAL: Render pages SEQUENTIALLY (not parallel!)
    // This ensures proper cleanup between pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      let page = null;
      let canvas = null;
      let renderTask = null;
      
      try {
        // Get page
        page = await pdf.getPage(pageNum);
        
        // Create NEW canvas for this page
        if (typeof document === 'undefined' || !document.createElement) {
          throw new Error('document.createElement not available');
        }
        
        canvas = document.createElement('canvas');
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d', { alpha: false });
        
        // CRITICAL: Check PDF.js worker status before rendering (diagnostics)
        const pdfjsLib = await loadPdfJs();
        const workerSrc = pdfjsLib.GlobalWorkerOptions?.workerSrc;
        /** @type {any} */
        const WorkerConstructor = typeof self !== 'undefined' ? self.Worker : null;
        const workerPatched = WorkerConstructor?._patched || false;
        
        // Check Worker status from PDF document (if available)
        const transport = pdf._transport;
        const worker = transport?.worker;
        
        // CRITICAL: Deep inspection of PDF.js internal structure
        const transportInspection = {
          exists: transport !== undefined,
          type: transport?.constructor?.name || 'unknown',
          keys: transport ? Object.keys(transport) : [],
          hasWorker: 'worker' in (transport || {}),
          workerValue: transport?.worker,
          workerType: transport?.worker?.constructor?.name || (transport?.worker === undefined ? 'undefined' : (transport?.worker === null ? 'null' : 'unknown'))
        };
        
        const workerInspection = worker ? {
          exists: true,
          type: worker.constructor?.name || 'unknown',
          keys: Object.keys(worker),
          hasPort: 'port' in worker,
          hasMessageHandler: '_messageHandler' in worker,
          hasDestroyed: 'destroyed' in worker,
          portType: worker.port?.constructor?.name || 'none',
          messageHandlerType: worker._messageHandler?.constructor?.name || 'none'
        } : {
          exists: false,
          reason: transport === undefined ? 'transport is undefined' : 'worker property missing or null'
        };
        
        const pdfWorkerStatus = {
          hasTransport: transport !== undefined,
          hasWorker: worker !== undefined && worker !== null,
          hasWorkerPort: worker?.port !== undefined,
          hasWorkerMessageHandler: worker?._messageHandler !== undefined,
          workerDestroyed: worker?.destroyed === true,
          workerType: worker?.constructor?.name || 'unknown',
          isFakeWorker: worker !== undefined && worker !== null && !worker?.port && worker?._messageHandler !== undefined,
          isRealWorker: worker?.port !== undefined,
          transportInspection: transportInspection,
          workerInspection: workerInspection
        };
        
        // Use criticalLog to ensure Worker status reaches background.js
        criticalLog(`[ClipAIble Offscreen] PDF.js worker status before render for ${messageId}`, 'PDF_WORKER_STATUS_BEFORE_RENDER', {
          messageId,
          pageNum,
          workerSrc,
          workerPatched,
          pdfWorkerStatus: pdfWorkerStatus,
          note: pdfWorkerStatus.isFakeWorker ? 'Using fake worker (main thread) ✅' : 
                pdfWorkerStatus.isRealWorker ? 'Using real Worker (may hang) ⚠️' : 
                pdfWorkerStatus.hasWorker ? 'Worker exists but type unclear ⚠️' :
                'No worker found - may use direct rendering ⚠️'
        });
        
        log(`[ClipAIble Offscreen] PDF.js worker status before render for ${messageId}`, {
          messageId,
          pageNum,
          workerSrc,
          workerPatched,
          pdfWorkerStatus: pdfWorkerStatus,
          note: pdfWorkerStatus.isFakeWorker ? 'Using fake worker (main thread) ✅' : 
                pdfWorkerStatus.hasWorkerPort ? 'Using real Worker (may hang) ⚠️' : 
                'Worker status unclear ⚠️'
        });
        
        // CRITICAL: Verify Worker is blocked before rendering
        const workerPort = pdfjsLib.GlobalWorkerOptions?.workerPort;
        /** @type {any} */
        const WorkerConstructor2 = typeof self !== 'undefined' ? self.Worker : null;
        const hasWorkerPatch = WorkerConstructor2?._patched === true;
        
        criticalLog(`[ClipAIble Offscreen] Pre-render Worker status check for page ${pageNum} (${messageId})`, 'PDF_PRE_RENDER_WORKER_CHECK', {
          messageId,
          pageNum,
          workerSrc: workerSrc || 'empty',
          workerPort: workerPort,
          hasWorkerPatch: hasWorkerPatch,
          workerPatchActive: hasWorkerPatch,
          note: workerSrc === '' ? 'Empty workerSrc should force fake worker' : 'workerSrc is set - may try to load worker'
        });
        
        // Render with timeout
        const renderStart = Date.now();
        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
          intent: 'display'
        });
        
        log(`[ClipAIble Offscreen] Render task created for page ${pageNum} (${messageId})`, {
          messageId,
          pageNum,
          hasRenderTask: !!renderTask,
          hasPromise: !!renderTask.promise,
          renderTaskType: typeof renderTask,
          renderTaskKeys: renderTask ? Object.keys(renderTask) : []
        });
        
        // CRITICAL: Add immediate diagnostic after render task creation
        criticalLog(`[ClipAIble Offscreen] Render task created, waiting for promise for page ${pageNum} (${messageId})`, 'PDF_PAGE_RENDER_START', {
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
        
        // CRITICAL: Increased timeout for fake worker (Perplexity recommendation)
        // Fake worker runs in main thread and is slower, especially for first page
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
            
            reject(new Error(`Page ${pageNum} render timeout after ${RENDER_TIMEOUT_MS / 1000} seconds`));
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
        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        const base64 = imageData.split(',')[1];
        
        images.push({
          pageNum,
          base64,
          width: viewport.width,
          height: viewport.height
        });
        
        log(`[ClipAIble Offscreen] Page ${pageNum} rendered successfully for ${messageId}`, {
          messageId,
          pageNum,
          width: viewport.width,
          height: viewport.height,
          imageSize: base64.length
        });
        
        // Send progress update (non-blocking)
        try {
          chrome.runtime.sendMessage({
            type: 'renderProgress',
            data: { current: pageNum, total: totalPages, messageId }
          }, () => {
            // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
            if (chrome.runtime.lastError) {
              // Silently ignore - "Could not establish connection" is expected when receiver is closed
            }
          });
        } catch (e) {
          // Ignore
        }
        
      } catch (error) {
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
          error: error.message
        });
        
      } finally {
        // CRITICAL: Cleanup page BEFORE next iteration
        if (page) {
          page.cleanup();
          page._transport = null;
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
    
    sendResponse({
      success: true,
      images,
      totalPages
    });
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logError(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack,
      totalDuration
    });
    
    sendResponse({
      success: false,
      error: error.message
    });
    
  } finally {
    // CRITICAL: Cleanup PDF document AFTER all pages
    if (pdf) {
      try {
        pdf.cleanup();
        pdf.destroy();
        log(`[ClipAIble Offscreen] PDF document cleaned up for ${messageId}`, {
          messageId
        });
      } catch (cleanupError) {
        logWarn(`[ClipAIble Offscreen] Failed to cleanup PDF document for ${messageId}`, {
          messageId,
          error: cleanupError.message
        });
      }
    }
  }
}

