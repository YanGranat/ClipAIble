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
import { putPdfOperationBlob } from '../api/pdf-operation-storage.js';

function reportPdfProgress(data, current, total) {
  if (!data.operationId) return;
  chrome.runtime.sendMessage({ target: 'pdf-progress', type: 'PDF_PROGRESS', data: { operationId: data.operationId, current, total } }).catch(() => {});
}

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
      hasDash: v.id && v.id.includes('-')
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
 * @param {{pdfUrl: string, operationId?: string, processingRunId?: string, pdfDataRef?: string}} data - Owned extraction request
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
    const result = await extractPdfContent(data.pdfUrl, pdfData, { signal: operation.signal, checkCancelled: operation.check,
      onProgress: (current, total) => reportPdfProgress(data, current, total) });
    operation.check();
    const { metrics: _metrics, ...documentResult } = result;
    payload = { success: true, result: documentResult };
  } catch (error) {
    logError(`[ClipAIble Offscreen] EXTRACT_PDF failed for ${messageId}`, { error: error.message });
    payload = pdfFailurePayload(operation.signal.aborted ? operation.signal.reason : error);
  } finally {
    await operation.finish();
  }
  sendResponse(payload);
}

/**
 * Handle GET_PDF_METADATA message - get PDF metadata and page count
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, operationId?: string, processingRunId?: string, pdfDataRef?: string}} data - Owned metadata request
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
 * Handle RENDER_ALL_PDF_PAGES message - render all pages of a PDF document
 * Loads the PDF once and renders its pages sequentially.
 * This is MUCH faster than loading PDF for each page separately
 * 
 * @param {string} messageId - Message ID for logging
 * @param {{pdfUrl: string, totalPages: number, scale?: number, pdfDataRef?: string, pdfData?: string|ArrayBuffer, operationId?: string, processingRunId?: string}} data - Message data
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {Promise<void>}
 * @throws {Error} If PDF rendering fails
 * @throws {Error} If PDF loading fails
 */
export async function handleRenderAllPdfPages(messageId, data, sendResponse) {
  const startTime = Date.now();
  log(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES request for ${messageId}`, { marker: 'RENDER_ALL_PDF_PAGES_START',
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
    // Load the bytes captured for this request.
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
    log(`[ClipAIble Offscreen] Loading PDF document ONCE for all pages (${messageId})...`, { marker: 'PDF_DOCUMENT_LOAD_START',
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
    
    log(`[ClipAIble Offscreen] PDF document loaded ONCE for ${messageId}`, { marker: 'PDF_DOCUMENT_LOADED',
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
        log(`[ClipAIble Offscreen] Render task created, waiting for promise for page ${pageNum} (${messageId})`, { marker: 'PDF_PAGE_RENDER_START',
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
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        operation.check();
        if (!imageBlob?.size) throw createPdfError('PDF page encoding failed', 'errorPdfRenderFailed');
        const ref = await putPdfOperationBlob(data.operationId, data.processingRunId ?? null, pageNum, imageBlob);
        operation.check();
        if (!ref) throw createPdfError('PDF render operation was released', 'statusCancelled');
        
        images.push({
          pageNum,
          ref,
          width,
          height
        });
        
        log(`[ClipAIble Offscreen] Page ${pageNum} rendered successfully for ${messageId}`, {
          messageId,
          pageNum,
          width,
          height,
          imageSize: imageBlob.size
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
      reportPdfProgress(data, pageNum, totalPages);
      if (pageNum % 10 === 0 && pageNum < totalPages) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    const totalDuration = Date.now() - startTime;
    log(`[ClipAIble Offscreen] RENDER_ALL_PDF_PAGES complete for ${messageId}`, {
      messageId,
      totalPages,
      renderedPages: images.filter(img => !('error' in img) || !img.error).length,
      failedPages: images.filter(img => 'error' in img && img.error).length,
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
