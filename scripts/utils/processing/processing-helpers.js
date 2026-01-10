// Processing helper utilities for ClipAIble extension
// Provides helper functions for article processing to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../logging.js';
import { updateState, setError, startProcessing, ERROR_CODES } from '../../state/processing.js';
import { tSync } from '../../locales.js';
import { getUILanguageCached } from './pipeline-helpers.js';
import { removeLargeData } from '../storage/storage.js';
import { validateAudioApiKeys } from '../validation/validation.js';
import { detectVideoPlatform } from '../video.js';
import { processVideoPage } from '../../processing/video.js';
// processPdfPage and processPdfPageWithAI imported statically (required for service worker)
import { detectPdfPage, getOriginalPdfUrl } from '../pdf.js';
import { processWithoutAI, processWithExtractMode, processWithSelectorMode } from '../../processing/modes.js';
import { handleProcessingResult, handleProcessingError } from './pipeline-helpers.js';
import { getQuickSaveSettingsKeys, prepareQuickSaveData } from '../../processing/quicksave.js';
import { processPdfPage, processPdfPageWithAI } from '../../processing/pdf.js';

/**
 * Validate and initialize processing
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {function(): void} startKeepAlive - Function to start keep-alive
 * @returns {Promise<boolean>} True if validation passed, false otherwise
 */
export async function validateAndInitializeProcessing(data, stopKeepAlive, startKeepAlive) {
  log('🔍 Validating processing parameters', {
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    mode: data?.mode,
    url: data?.url,
    hasTabId: !!data?.tabId,
    tabId: data?.tabId,
    outputFormat: data?.outputFormat,
    timestamp: Date.now()
  });
  
  log('=== startArticleProcessing: Calling startProcessing ===', {
    timestamp: Date.now()
  });
  
  if (!(await startProcessing(startKeepAlive))) {
    logError('=== startArticleProcessing: startProcessing returned false ===', {
      timestamp: Date.now()
    });
    return false;
  }
  
  log('=== startArticleProcessing: startProcessing returned true ===', {
    timestamp: Date.now()
  });
  
  // Validate output format
  // Note: docx, html, txt formats removed from UI and codebase (generators deleted)
  const VALID_FORMATS = ['pdf', 'epub', 'fb2', 'markdown', 'audio'];
  if (data.outputFormat && !VALID_FORMATS.includes(data.outputFormat)) {
    const uiLang = await getUILanguageCached();
    await setError({
      message: tSync('errorValidation', uiLang) + `: Invalid output format '${data.outputFormat}'`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive);
    return false;
  }
  
  // CRITICAL: Save outputFormat to state immediately so polling can use correct interval
  // This is especially important for audio format which needs longer polling interval
  if (data.outputFormat) {
    // outputFormat is part of ProcessingState type (used for UI display and polling intervals)
    updateState({ outputFormat: data.outputFormat });
    log('=== startArticleProcessing: outputFormat saved to state ===', {
      outputFormat: data.outputFormat,
      timestamp: Date.now()
    });
  }
  
  // Clean up any old temporary data before starting new processing
  try {
    await removeLargeData('printHtml');
    await chrome.storage.local.remove(['printTitle', 'pageMode']);
    log('Cleaned up old temporary data');
  } catch (cleanupError) {
    logWarn('Failed to clean up old temporary data', cleanupError);
    // Continue anyway - not critical
  }
  
  // Pre-flight key checks for audio to avoid long work before failing
  if (!(await validateAudioApiKeys(data, stopKeepAlive))) {
    return false;
  }
  
  return true;
}

/**
 * Handle PDF page processing
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {function(import('../../types.js').ProcessingData, import('../../types.js').ExtractionResult, function(): Promise<void>): Promise<void>} continueProcessingPipeline - Function to continue processing pipeline
 * @param {{current: number}} processingStartTimeRef - Reference object with processingStartTime property
 * @returns {Promise<boolean>} True if PDF processing started
 * @throws {Error} If PDF processing fails
 */
export async function handlePdfPageProcessing(
  data,
  pdfUrl,
  stopKeepAlive,
  continueProcessingPipeline,
  processingStartTimeRef
) {
  log('Detected PDF page', { pdfUrl, originalUrl: data.url, mode: data.mode });
  
  (async () => {
    try {
      // Check mode: if 'selector', use AI processing; otherwise use automatic
      let result;
      if (data.mode === 'selector') {
        log('Using AI mode for PDF processing');
        result = await processPdfPageWithAI(data, pdfUrl);
      } else {
        log('Using automatic mode for PDF processing');
        result = await processPdfPage(data, pdfUrl);
      }
      
      log('PDF processing complete', { 
        title: result.title, 
        contentItems: result.content?.length || 0,
        mode: data.mode
      });
      
      await handleProcessingResult(
        data, 
        result, 
        stopKeepAlive, 
        processingStartTimeRef,
        continueProcessingPipeline
      );
    } catch (error) {
      await handleProcessingError(error, data, stopKeepAlive, {
        source: 'pdfProcessing',
        errorType: 'pdfProcessingFailed',
        context: {
          pdfUrl: pdfUrl,
          originalUrl: data.url,
          mode: data.mode
        }
      });
    }
  })();
  
  return true;
}

/**
 * Handle video page processing
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {{platform: 'youtube'|'vimeo', videoId: string}} videoInfo - Video platform info
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {function(import('../../types.js').ProcessingData, import('../../types.js').ExtractionResult, import('../../types.js').StopKeepAliveFunction?): Promise<void>} continueProcessingPipeline - Function to continue processing pipeline
 * @param {{current: number}} processingStartTimeRef - Reference object with processingStartTime property
 * @returns {Promise<boolean>} True if video processing started
 */
export async function handleVideoPageProcessing(
  data,
  videoInfo,
  stopKeepAlive,
  continueProcessingPipeline,
  processingStartTimeRef
) {
  log('Detected video page', { platform: videoInfo.platform, videoId: videoInfo.videoId });
  
  (async () => {
    try {
      const result = await processVideoPage(data, videoInfo);
      log('Video processing complete', { 
        title: result.title, 
        contentItems: result.content?.length || 0 
      });
      
      await handleProcessingResult(
        data, 
        result, 
        stopKeepAlive, 
        processingStartTimeRef,
        continueProcessingPipeline
      );
    } catch (error) {
      await handleProcessingError(error, data, stopKeepAlive, {
        source: 'videoProcessing',
        errorType: 'videoProcessingFailed',
        context: {
          platform: videoInfo.platform,
          videoId: videoInfo.videoId
        }
      });
    }
  })();
  
  return true;
}

/**
 * Handle standard article processing
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {function(import('../../types.js').ProcessingData, import('../../types.js').ExtractionResult, import('../../types.js').StopKeepAliveFunction?): Promise<void>} continueProcessingPipeline - Function to continue processing pipeline
 * @param {function(import('../../types.js').SelectorResult, string): Promise<import('../../types.js').InjectionResult>} extractFromPageInlined - Function to extract from page (for selector mode)
 * @param {{current: number}} processingStartTimeRef - Reference object with processingStartTime property
 * @returns {Promise<boolean>} True if processing started
 */
export async function handleStandardArticleProcessing(
  data,
  stopKeepAlive,
  continueProcessingPipeline,
  extractFromPageInlined,
  processingStartTimeRef
) {
  const { mode } = data;
  
  log('=== startArticleProcessing: Selecting process function ===', {
    mode: mode,
    hasProcessWithoutAI: typeof processWithoutAI === 'function',
    hasProcessWithSelectorMode: typeof processWithSelectorMode === 'function',
    hasProcessWithExtractMode: typeof processWithExtractMode === 'function',
    timestamp: Date.now()
  });
  
  const processFunction = mode === 'automatic'
    ? processWithoutAI
    : mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  log('=== startArticleProcessing: Process function selected ===', {
    mode: mode,
    functionName: processFunction?.name || 'unknown',
    timestamp: Date.now()
  });
  
  log('=== startArticleProcessing: About to call processFunction ===', {
    functionName: processFunction?.name || 'unknown',
    timestamp: Date.now()
  });
  
  // Call processFunction with appropriate arguments
  // processWithSelectorMode requires extractFromPageInlined as second argument
  let processPromise;
  if (mode === 'selector') {
    processPromise = processWithSelectorMode(data, extractFromPageInlined);
  } else if (mode === 'automatic') {
    processPromise = processWithoutAI(data);
  } else {
    processPromise = processWithExtractMode(data);
  }
  
  (async () => {
    try {
      const result = await processPromise;
      log('=== startArticleProcessing: processFunction completed ===', {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        timestamp: Date.now()
      });
      
      await handleProcessingResult(
        data, 
        result, 
        stopKeepAlive, 
        processingStartTimeRef,
        continueProcessingPipeline
      );
    } catch (error) {
      await handleProcessingError(error, data, stopKeepAlive, {
        source: 'articleProcessing',
        errorType: 'contentExtractionFailed',
        context: {
          url: data.url,
          format: data.outputFormat,
          mode: data.mode
        }
      });
    }
  })();
  
  return true;
}

/**
 * Show quick save notification
 * @param {import('../../types.js').ExportFormat} outputFormat - Output format
 * @param {function(string, string?=): Promise<void>} createNotification - Function to create notification (second parameter is optional)
 * @returns {Promise<void>}
 */
export async function showQuickSaveNotification(outputFormat, createNotification) {
  try {
    const uiLang = await getUILanguageCached();
    const formatNames = {
      'pdf': tSync('saveAsPdf', uiLang),
      'epub': tSync('saveAsEpub', uiLang),
      'fb2': tSync('saveAsFb2', uiLang),
      'markdown': tSync('saveAsMarkdown', uiLang),
      'audio': tSync('saveAsAudio', uiLang),
      'docx': tSync('saveAsDocx', uiLang),
      'html': tSync('saveAsHtml', uiLang),
      'txt': tSync('saveAsTxt', uiLang)
    };
    const formatName = formatNames[outputFormat] || outputFormat.toUpperCase();
    const notificationMsg = tSync('quickSaveStarted', uiLang).replace('{format}', formatName);
    
    log('Showing quick save notification', { format: outputFormat, message: notificationMsg });
    await createNotification(notificationMsg);
  } catch (error) {
    logError('Failed to show quick save notification', error);
  }
}

/**
 * Extract page content from tab
 * @param {number} [tabId] - Optional tab ID (if not provided, will use active tab)
 * @returns {Promise<{html: string, url: string, title: string, tabId: number, isPdf?: boolean}>} Page data with html, url, title, tabId, and optional isPdf flag
 */
export async function extractPageContent(tabId = null) {
  let tab;
  const uiLang = await getUILanguageCached();
  
  if (tabId) {
    // Use provided tab ID (from context menu)
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (error) {
      logError('Failed to get tab by ID', { tabId, error });
      throw new Error(tSync('errorNoActiveTab', uiLang));
    }
  } else {
    // Fallback: use active tab (for popup usage)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  }
  
  if (!tab || !tab.id) {
    throw new Error(tSync('errorNoActiveTab', uiLang));
  }
  
  // CRITICAL: Validate URL - block browser internal pages
  const tabUrl = tab.url || '';
  if (tabUrl.startsWith('chrome://') || 
      tabUrl.startsWith('chrome-extension://') || 
      tabUrl.startsWith('edge://') || 
      tabUrl.startsWith('about:') ||
      tabUrl.startsWith('moz-extension://')) {
    throw new Error(tSync('errorPageNotReady', uiLang) + ': Cannot extract content from browser internal pages');
  }
  
  // Check if this is a PDF page (Chrome PDF viewer)
  const pdfInfo = detectPdfPage(tabUrl, tabUrl);
  
  if (pdfInfo && pdfInfo.isPdf) {
    // For PDF pages, we can't use executeScript (PDF viewer is isolated)
    // Get original PDF URL instead
    let pdfUrl = pdfInfo.originalUrl;
    if (!pdfUrl) {
      pdfUrl = await getOriginalPdfUrl(tab.id);
    }
    
    if (!pdfUrl) {
      // Fallback: try to extract from tab URL
      pdfUrl = tab.url;
    }
    
    return {
      html: '', // PDFs don't have HTML
      url: pdfUrl,
      title: tab.title || 'Untitled PDF',
      tabId: tab.id,
      isPdf: true
    };
  }
  
  // For regular HTML pages, use executeScript
  // CRITICAL: Check if tab is still available before executing script
  try {
    await chrome.tabs.get(tab.id);
  } catch (tabError) {
    logError('Tab was closed before script execution', { tabId: tab.id, error: tabError });
    throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
  }
  
  let htmlResult;
  try {
    htmlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML,
        url: window.location.href,
        title: document.title
      })
    });
  } catch (scriptError) {
    // Check if error is due to tab being closed or invalid URL
    if (chrome.runtime.lastError) {
      const lastError = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
      if (lastError.includes('No tab with id') || 
          lastError.includes('tab was closed') || 
          lastError.includes('Invalid tab ID') ||
          lastError.includes('Cannot access')) {
        throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
      }
    }
    logError('Script execution failed in extractPageContent', { tabId: tab.id, error: scriptError });
    throw new Error(tSync('errorExtractPageContentFailed', uiLang) + ': ' + (scriptError.message || 'Unknown error'));
  }
  
  if (!htmlResult || !htmlResult[0]?.result) {
    throw new Error(tSync('errorExtractPageContentFailed', uiLang));
  }
  
  return { ...htmlResult[0].result, tabId: tab.id };
}

/**
 * Prepare quick save processing data
 * @param {import('../../types.js').ExportFormat} outputFormat - Output format
 * @param {{tabId: number, html: string, url: string, title: string}} pageData - Page data from extractPageContent
 * @returns {Promise<import('../../types.js').ProcessingData>} Processing data
 * @throws {Error} If settings loading fails
 * @throws {Error} If quick save data preparation fails
 */
export async function prepareQuickSaveProcessingData(outputFormat, pageData) {
  // CRITICAL: Use static import - dynamic import() is disallowed in Service Worker
  // Load settings with error handling
  let settings;
  try {
    settings = await chrome.storage.local.get(getQuickSaveSettingsKeys());
  } catch (storageError) {
    logError('Failed to load settings from storage for quick save', storageError);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorValidation', uiLang) + ': Failed to access storage. Please try again.');
  }
  
  // Validate that we got settings object
  if (!settings || typeof settings !== 'object') {
    logError('Invalid settings object from storage', { settingsType: typeof settings });
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorValidation', uiLang) + ': Invalid settings data. Please try again.');
  }
  
  // CRITICAL: Log voice settings immediately after loading from storage
  log('[ClipAIble Background] ===== SETTINGS LOADED FROM STORAGE (handleQuickSave) =====', {
    timestamp: Date.now(),
    audio_provider: settings.audio_provider,
    audio_voice: settings.audio_voice,
    audio_voice_type: typeof settings.audio_voice,
    audio_voice_map: settings.audio_voice_map,
    audio_voice_map_type: typeof settings.audio_voice_map,
    audio_voice_map_keys: settings.audio_voice_map ? Object.keys(settings.audio_voice_map) : [],
    audio_voice_map_has_current: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map,
    audio_voice_map_current: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map ? settings.audio_voice_map.current : null,
    audio_voice_map_current_keys: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map && typeof settings.audio_voice_map.current === 'object' ? Object.keys(settings.audio_voice_map.current) : [],
    raw_audio_voice_map: JSON.stringify(settings.audio_voice_map).substring(0, 500)
  });
  
  // Prepare processing data from settings
  return await prepareQuickSaveData(
    settings,
    outputFormat,
    pageData.tabId,
    pageData.html,
    pageData.url,
    pageData.title
  );
}

/**
 * Handle quick save error and show notification
 * @param {Error} error - Error object
 * @param {import('../../types.js').CreateNotificationFunction} createNotification - Function to create notification
 * @returns {Promise<void>}
 */
export async function handleQuickSaveError(error, createNotification) {
  logError('Quick save failed', error);
  try {
    const uiLang = await getUILanguageCached();
    let errorMsg;
    if (error.message && error.message.includes('decrypt')) {
      errorMsg = tSync('errorQuickSaveDecryptFailed', uiLang);
    } else if (error.message && error.message.includes('No API key')) {
      errorMsg = tSync('errorQuickSaveNoKey', uiLang);
    } else {
      errorMsg = error.message || tSync('errorValidation', uiLang);
    }
    await createNotification(errorMsg);
  } catch (notifError) {
    logError('Failed to show error notification', notifError);
  }
}
