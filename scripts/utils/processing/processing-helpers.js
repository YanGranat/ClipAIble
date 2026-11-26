// Processing helper utilities for ClipAIble extension
// Provides helper functions for article processing to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../logging.js';
import { updateState, setError, startProcessing, isCancelled, ERROR_CODES } from '../../state/processing.js';
import { tSync } from '../../locales.js';
import { getUILanguageCached } from './pipeline-helpers.js';
import { removeLargeData } from '../storage/storage.js';
import { validateAudioApiKeys, validateImageTranslation } from '../validation/validation.js';
import { detectVideoPlatform } from '../video.js';
import { processVideoPage } from '../../processing/video.js';
import { detectPdfPage, getOriginalPdfUrl } from '../pdf.js';
import { processWithoutAI, processWithExtractMode, processWithSelectorMode } from '../../processing/modes.js';
import { handleProcessingResult, handleProcessingError } from './pipeline-helpers.js';
import { getQuickSaveSettingsKeys, prepareQuickSaveData } from '../../processing/quicksave.js';
import { processPdfDocument } from '../../processing/pdf.js';

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
  
  if (!(await startProcessing(startKeepAlive, (runId) => { data.processingRunId = runId; }))) {
    logError('=== startArticleProcessing: startProcessing returned false ===', {
      timestamp: Date.now()
    });
    return false;
  }
  if (isCancelled(data.processingRunId)) return false;
  
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
      code: ERROR_CODES.VALIDATION_ERROR,
      translationKey: 'errorValidation',
      translationParams: {}
    }, stopKeepAlive, data.processingRunId);
    return false;
  }
  
  // CRITICAL: Save outputFormat to state immediately so polling can use correct interval
  // This is especially important for audio format which needs longer polling interval
  if (data.outputFormat) {
    // outputFormat is part of ProcessingState type (used for UI display and polling intervals)
    updateState({ outputFormat: data.outputFormat }, data.processingRunId);
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
  
  // Pre-flight key checks before content processing
  if (isCancelled(data.processingRunId)) return false;
  if (!(await validateImageTranslation(data, stopKeepAlive))) return false;
  if (isCancelled(data.processingRunId)) return false;
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
 * @param {import('../../types.js').ContinueProcessingPipelineFunction} continueProcessingPipeline - Function to continue processing pipeline
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
      const result = await processPdfDocument(data, pdfUrl);
      
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
 * @param {import('../../types.js').ContinueProcessingPipelineFunction} continueProcessingPipeline - Function to continue processing pipeline
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
      if (await stopForUnavailablePage(data, stopKeepAlive)) return;
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
 * @param {import('../../types.js').ContinueProcessingPipelineFunction} continueProcessingPipeline - Function to continue processing pipeline
 * @param {import('../../types.js').ExtractFromPageFunction} extractFromPageInlined - Function to extract from page (for selector mode)
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
  (async () => {
    try {
      if (await stopForUnavailablePage(data, stopKeepAlive)) return;

      let result;
      switch (data.mode) {
        case 'automatic':
          result = await processWithoutAI(data, extractFromPageInlined);
          break;
        case 'selector':
          result = await processWithSelectorMode(data, extractFromPageInlined);
          break;
        default:
          result = await processWithExtractMode(data);
      }
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

/** @param {import('../../types.js').ProcessingData} data */
async function stopForUnavailablePage(data, stopKeepAlive) {
  const unavailable = await isSourcePageUnavailable(data.tabId, data.url);
  if (isCancelled(data.processingRunId)) return true;
  if (!unavailable) return false;
  const translationKey = 'errorSourcePageUnavailable';
  const language = await getUILanguageCached();
  await setError({ message: tSync(translationKey, language), code: ERROR_CODES.VALIDATION_ERROR,
    translationKey, translationParams: {} }, stopKeepAlive, data.processingRunId);
  return true;
}

/** Reject error documents without re-requesting the source or its credentials. */
async function isSourcePageUnavailable(tabId, url) {
  if (!tabId) return false;
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId }, func: inspectSourcePage, args: [url]
    });
    return frame?.result === true;
  } catch {
    // Preserve the extraction path's own handling of inaccessible or closed tabs.
    return false;
  }
}

/** Inspect the live top-level document in Chrome's isolated extension world. */
function inspectSourcePage(expectedUrl) {
  const pageUrl = value => new URL(value).href.split('#')[0];
  const liveUrl = pageUrl(location.href);
  if (liveUrl !== pageUrl(expectedUrl)) return false;

  const [entry] = /** @type {PerformanceNavigationTiming[]} */ (performance.getEntriesByType('navigation'));
  if (entry && pageUrl(entry.name) === liveUrl && entry.responseStatus >= 400 && entry.responseStatus < 600) return true;
  if (!document.body || document.readyState === 'loading' ||
      document.querySelector('article, [role="article"], [itemprop="articleBody"]')) return false;

  const heading = document.querySelector('h1')?.innerText?.trim() || '';
  const challengeWidget = document.querySelector('script[src*="/cdn-cgi/challenge-platform/"], iframe[src*="/challenge-platform/"], iframe[src*="/turnstile/"], iframe[src*="/recaptcha/"], form[action*="/challenge-platform/"]');
  const challengeHeading = /^(?:just a moment[.…]*|verify to continue|security verification|checking your browser[.…]*)$/i;
  if (challengeWidget && [document.title, heading].some(text => challengeHeading.test(text.trim()))) return true;

  const isSignIn = /^(?:log\s*in|sign\s*in|sign\s*in to continue|log\s*in to continue)$/i.test(heading);
  return isSignIn && /(?:^|\/)(?:login|signin|sign-in|sign_in)(?:\/|$)/i.test(location.pathname) &&
    !!document.querySelector('form input[type="password"]');
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
    raw_audio_voice_map: (JSON.stringify(settings.audio_voice_map) || '').substring(0, 500)
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
 * @param {import('../../types.js').ExtendedError} error - Error object
 * @param {import('../../types.js').CreateNotificationFunction} createNotification - Function to create notification
 * @returns {Promise<void>}
 */
export async function handleQuickSaveError(error, createNotification) {
  logError('Quick save failed', error);
  try {
    const uiLang = await getUILanguageCached();
    let errorMsg;
    if (typeof error.translationKey === 'string') {
      errorMsg = tSync(error.translationKey, uiLang, error.translationParams || {});
    } else if (error.message && error.message.includes('decrypt')) {
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
