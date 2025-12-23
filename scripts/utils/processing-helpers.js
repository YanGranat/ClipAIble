// Processing helper utilities for ClipAIble extension
// Provides helper functions for article processing to reduce code duplication

// @ts-check

import { log, logError, logWarn } from './logging.js';
import { updateState, setError, startProcessing, ERROR_CODES } from '../state/processing.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from './pipeline-helpers.js';
import { removeLargeData } from './storage.js';
import { validateAudioApiKeys } from './validation.js';
import { detectVideoPlatform } from './video.js';
import { processVideoPage } from '../processing/video.js';
import { processWithoutAI, processWithExtractMode, processWithSelectorMode } from '../processing/modes.js';
import { handleProcessingResult, handleProcessingError } from './pipeline-helpers.js';

/**
 * Validate and initialize processing
 * @param {Object} data - Processing data
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @returns {Promise<boolean>} True if validation passed, false otherwise
 */
export async function validateAndInitializeProcessing(data, stopKeepAlive, startKeepAlive) {
  log('=== startArticleProcessing: ENTRY ===', {
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
 * Handle video page processing
 * @param {Object} data - Processing data
 * @param {Object} videoInfo - Video platform info
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Function} continueProcessingPipeline - Function to continue processing pipeline
 * @param {Object} processingStartTimeRef - Reference object with processingStartTime property
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
 * @param {Object} data - Processing data
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Function} continueProcessingPipeline - Function to continue processing pipeline
 * @param {Function} extractFromPageInlined - Function to extract from page (for selector mode)
 * @param {Object} processingStartTimeRef - Reference object with processingStartTime property
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
          mode: data.mode || data.extractionMode
        }
      });
    }
  })();
  
  return true;
}

/**
 * Show quick save notification
 * @param {string} outputFormat - Output format
 * @param {Function} createNotification - Function to create notification
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
 * Extract page content from active tab
 * @returns {Promise<Object>} Page data with html, url, title, tabId
 */
export async function extractPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const uiLang = await getUILanguageCached();
  if (!tab || !tab.id) {
    throw new Error(tSync('errorNoActiveTab', uiLang));
  }
  
  const htmlResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title
    })
  });
  
  if (!htmlResult || !htmlResult[0]?.result) {
    throw new Error(tSync('errorExtractPageContentFailed', uiLang));
  }
  
  return { ...htmlResult[0].result, tabId: tab.id };
}

/**
 * Prepare quick save processing data
 * @param {string} outputFormat - Output format
 * @param {Object} pageData - Page data from extractPageContent
 * @returns {Promise<Object>} Processing data
 */
export async function prepareQuickSaveProcessingData(outputFormat, pageData) {
  const { getQuickSaveSettingsKeys, prepareQuickSaveData } = await import('../processing/quicksave.js');
  
  // Load settings
  const settings = await chrome.storage.local.get(getQuickSaveSettingsKeys());
  
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
 * @param {Function} createNotification - Function to create notification
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
