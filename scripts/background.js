// @ts-check
// Background service worker for ClipAIble extension
// Main entry point - uses ES modules for modular architecture

log('[ClipAIble Background] === BACKGROUND SCRIPT START LOADING ===', {
  timestamp: Date.now(),
  userAgent: navigator.userAgent,
  chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1],
  extensionId: chrome.runtime.id,
  url: typeof location !== 'undefined' ? location.href : 'unknown',
  isServiceWorker: typeof importScripts !== 'undefined',
  hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
  hasStorage: typeof chrome !== 'undefined' && !!chrome.storage,
  hasScripting: typeof chrome !== 'undefined' && !!chrome.scripting,
  hasTabs: typeof chrome !== 'undefined' && !!chrome.tabs,
  hasOffscreen: typeof chrome !== 'undefined' && !!chrome.offscreen,
  hasPermissions: typeof chrome !== 'undefined' && !!chrome.permissions,
  hasNotifications: typeof chrome !== 'undefined' && !!chrome.notifications,
  hasContextMenus: typeof chrome !== 'undefined' && !!chrome.contextMenus
});

/**
 * @typedef {import('./types.js').ChromeStorageResult} ChromeStorageResult
 * @typedef {import('./types.js').SubtitleData} SubtitleData
 * @typedef {import('./types.js').InjectionResult} InjectionResult
 * @typedef {import('./types.js').ExtendedCacheEntry} ExtendedCacheEntry
 * @typedef {import('./types.js').ContentItem} ContentItem
 * @typedef {import('./types.js').ExportFormat} ExportFormat
 * @typedef {import('./types.js').ProcessingState} ProcessingState
 * @typedef {import('./types.js').ExtendedProcessingState} ExtendedProcessingState
 * @typedef {import('./types.js').ExtendedGenerationData} ExtendedGenerationData
 * @typedef {import('./types.js').AudioGenerationData} AudioGenerationData
 * @typedef {import('./types.js').RetryOptions} RetryOptions
 */

log('[ClipAIble Background] Importing logging utilities...', { timestamp: Date.now() });

// Import logging utilities first for use in global error handlers
import { log, logError, logWarn, logDebug } from './utils/logging.js';
import { CONFIG } from './utils/config.js';
import { getUILanguage, tSync } from './locales.js';

log('[ClipAIble Background] Logging utilities imported successfully', {
  timestamp: Date.now(),
  hasLog: typeof log === 'function',
  hasLogError: typeof logError === 'function',
  hasLogWarn: typeof logWarn === 'function',
  hasLogDebug: typeof logDebug === 'function',
  hasCONFIG: !!CONFIG,
  hasGetUILanguage: typeof getUILanguage === 'function',
  hasTSync: typeof tSync === 'function'
});

// Global error handler for uncaught errors during module loading
// Uses logError with fallback to console.error if logging system is not yet initialized
log('[ClipAIble Background] Registering global error handler', { timestamp: Date.now() });

self.addEventListener('error', (event) => {
  log('[ClipAIble Background] === GLOBAL ERROR HANDLER TRIGGERED ===', {
    timestamp: Date.now(),
    errorMessage: event.error?.message,
    errorName: event.error?.name,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    hasStack: !!event.error?.stack,
    stackPreview: event.error?.stack?.substring(0, 200),
    hasLogError: typeof logError === 'function'
  });

  try {
    if (typeof logError === 'function') {
      logError('Uncaught error during module loading', event.error);
      if (event.error?.stack) {
        logError('Error stack', new Error(event.error.stack));
      }
      log('[ClipAIble Background] Error logged using logError function', { timestamp: Date.now() });
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Uncaught error during module loading:', event.error);
      console.error('[ClipAIble] Error stack:', event.error?.stack);
      log('[ClipAIble Background] Used console.error fallback (logError not available)', { timestamp: Date.now() });
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Uncaught error during module loading:', event.error);
    console.error('[ClipAIble] Error stack:', event.error?.stack);
    console.error('[ClipAIble] Failed to log error:', loggingError);
    log('[ClipAIble Background] Ultimate fallback used - even logError failed', {
      timestamp: Date.now(),
      loggingErrorMessage: loggingError?.message
    });
  }
});

log('[ClipAIble Background] Registering unhandledrejection handler', { timestamp: Date.now() });

self.addEventListener('unhandledrejection', (event) => {
  log('[ClipAIble Background] === UNHANDLED PROMISE REJECTION HANDLER TRIGGERED ===', {
    timestamp: Date.now(),
    reasonType: typeof event.reason,
    isError: event.reason instanceof Error,
    reasonMessage: event.reason?.message,
    reasonName: event.reason?.name,
    hasStack: !!event.reason?.stack,
    stackPreview: event.reason?.stack?.substring(0, 200),
    reasonString: String(event.reason),
    hasLogError: typeof logError === 'function'
  });

  try {
    if (typeof logError === 'function') {
      logError('Unhandled promise rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
      if (event.reason?.stack) {
        logError('Rejection stack', new Error(event.reason.stack));
      }
      log('[ClipAIble Background] Promise rejection logged using logError function', { timestamp: Date.now() });
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
      console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
      log('[ClipAIble Background] Used console.error fallback for promise rejection (logError not available)', { timestamp: Date.now() });
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
    console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    console.error('[ClipAIble] Failed to log rejection:', loggingError);
    log('[ClipAIble Background] Ultimate fallback used for promise rejection - even logError failed', {
      timestamp: Date.now(),
      loggingErrorMessage: loggingError?.message
    });
  }
});

log('[ClipAIble Background] Starting module imports', { timestamp: Date.now() });

// Import background modules
log('[ClipAIble Background] Importing background/initialization.js', { timestamp: Date.now() });
import { initInitialization } from './background/initialization.js';

log('[ClipAIble Background] Importing utils modules', { timestamp: Date.now() });
import { handleError } from './utils/error-handler.js';
import { clearDecryptedKeyCache } from './utils/encryption.js';
import { restoreStateFromStorage } from './state/processing.js';
import { runInitialization } from './initialization/index.js';

log('[ClipAIble Background] Importing background modules', { timestamp: Date.now() });
import { initKeepAlive } from './background/keep-alive.js';
import { initContextMenu } from './background/context-menu.js';
import { updateContextMenuWithLang } from './utils/context-menu.js';
import { handleQuickSave } from './background/quicksave.js';
import { initLogging } from './background/logging.js';
import { initPortListener } from './background/port-listener.js';
import { initOrchestration } from './background/orchestration.js';
import { initPopupConnectionListener } from './background/popup-connection.js';

log('[ClipAIble Background] Importing state modules', { timestamp: Date.now() });
import {
  setError,
  setResult,
  updateState,
  ERROR_CODES,
  PROCESSING_STAGES
} from './state/processing.js';

log('[ClipAIble Background] Importing processing helpers', { timestamp: Date.now() });
import {
  validateAndInitializeProcessing,
  handlePdfPageProcessing,
  handleVideoPageProcessing,
  handleStandardArticleProcessing
} from './utils/processing-helpers.js';
import {
  checkCancellation,
  updateProgress,
  getUILanguageCached,
  handleTranslation,
  handleAbstractGeneration,
  detectEffectiveLanguage
} from './utils/pipeline-helpers.js';

log('[ClipAIble Background] Importing translation modules', { timestamp: Date.now() });
import {
  translateContent,
  translateImages,
  detectSourceLanguage,
  generateAbstract,
  detectContentLanguage
} from './translation/index.js';

log('[ClipAIble Background] Importing generation factory', { timestamp: Date.now() });
import { DocumentGeneratorFactory } from './generation/factory.js';

log('[ClipAIble Background] Importing PDF and video utilities', { timestamp: Date.now() });
import { detectPdfPage, getOriginalPdfUrl } from './utils/pdf.js';
import { detectVideoPlatform } from './utils/video.js';

log('[ClipAIble Background] Importing notifications', { timestamp: Date.now() });
import { initNotifications } from './background/notifications.js';

log('[ClipAIble Background] Importing processing state functions', { timestamp: Date.now() });
import {
  getProcessingState,
  saveStateToStorageImmediate
} from './state/processing.js';

// Import processing functions needed for message routing
log('[ClipAIble Background] Importing processing modes and message handlers', { timestamp: Date.now() });
import { processWithoutAI, processWithExtractMode, processWithSelectorMode } from './processing/modes.js';
import { routeMessage } from './message-handlers/index.js';

log('[ClipAIble Background] All modules imported successfully', {
  timestamp: Date.now(),
  modulesCount: 'approximately 30+ modules loaded'
});

// ============================================
// INITIALIZATION
// ============================================

log('[ClipAIble Background] === STARTING MODULE INITIALIZATION ===', {
  timestamp: Date.now(),
  modulesToInitialize: [
    'notifications',
    'keep-alive',
    'initialization',
    'logging',
    'port-listener',
    'popup-connection',
    'orchestration'
  ]
});

// Initialize notifications module with DI
log('[ClipAIble Background] Initializing notifications module', { timestamp: Date.now() });
const notificationsModule = initNotifications({
  log,
  logError,
  logWarn,
  getUILanguage,
  tSync
});
log('[ClipAIble Background] Notifications module initialized', {
  timestamp: Date.now(),
  hasModule: !!notificationsModule
});

// Initialize keep-alive module with DI
log('[ClipAIble Background] Initializing keep-alive module', { timestamp: Date.now() });
const keepAliveModule = initKeepAlive({
  log,
  logError,
  logWarn,
  CONFIG,
  getProcessingState,
  saveStateToStorageImmediate
});
log('[ClipAIble Background] Keep-alive module initialized', {
  timestamp: Date.now(),
  hasModule: !!keepAliveModule,
  hasStartKeepAlive: typeof keepAliveModule.startKeepAlive === 'function',
  hasStopKeepAlive: typeof keepAliveModule.stopKeepAlive === 'function',
  hasInitKeepAliveListener: typeof keepAliveModule.initKeepAliveListener === 'function'
});

// Extract keep-alive functions for use in background.js and other modules
const { startKeepAlive, stopKeepAlive, initKeepAliveListener } = keepAliveModule;
log('[ClipAIble Background] Keep-alive functions extracted', {
  timestamp: Date.now(),
  functions: ['startKeepAlive', 'stopKeepAlive', 'initKeepAliveListener']
});

// Initialize extension initialization module with DI
log('[ClipAIble Background] Initializing extension initialization module', { timestamp: Date.now() });
const initializationModule = initInitialization({
  log,
  logWarn,
  CONFIG,
  handleError,
  clearDecryptedKeyCache,
  getProcessingState,
  restoreStateFromStorage,
  runInitialization,
  startKeepAlive
});
log('[ClipAIble Background] Extension initialization module created', {
  timestamp: Date.now(),
  hasModule: typeof initializationModule === 'function'
});

// Initialize extension
log('[ClipAIble Background] Calling initialization module (main extension init)', { timestamp: Date.now() });
initializationModule();
log('[ClipAIble Background] Extension initialization completed', { timestamp: Date.now() });

// Initialize keep-alive listener
log('[ClipAIble Background] Initializing keep-alive listener', { timestamp: Date.now() });
initKeepAliveListener();
log('[ClipAIble Background] Keep-alive listener initialized', { timestamp: Date.now() });

// Initialize log collection module with DI
log('[ClipAIble Background] Initializing logging module', { timestamp: Date.now() });
const loggingModule = initLogging({
  log,
  logError,
  CONFIG
});
log('[ClipAIble Background] Logging module initialized', {
  timestamp: Date.now(),
  hasModule: !!loggingModule,
  hasAddLogToCollection: typeof loggingModule.addLogToCollection === 'function',
  hasExportAllLogsToFile: typeof loggingModule.exportAllLogsToFile === 'function',
  hasInitLogCollection: typeof loggingModule.initLogCollection === 'function'
});

// Extract logging functions for use in background.js and other modules
const { addLogToCollection, exportAllLogsToFile, initLogCollection } = loggingModule;
log('[ClipAIble Background] Logging functions extracted', {
  timestamp: Date.now(),
  functions: ['addLogToCollection', 'exportAllLogsToFile', 'initLogCollection']
});

// Initialize log collection system
log('[ClipAIble Background] Initializing log collection system', { timestamp: Date.now() });
initLogCollection();
log('[ClipAIble Background] Log collection system initialized', { timestamp: Date.now() });

// CRITICAL: Log AFTER initLogCollection to verify background script reloaded
log('[ClipAIble Background] ===== BACKGROUND SCRIPT RELOADED =====', {
  timestamp: Date.now(),
  date: new Date().toISOString(),
  cacheBuster: '2026-01-23-new-logs-added',
  version: chrome.runtime.getManifest?.()?.version || 'unknown'
});

// Initialize port listener module with DI
log('[ClipAIble Background] Initializing port listener module', { timestamp: Date.now() });
const portListenerModule = initPortListener({
  log,
  logError,
  addLogToCollection
});
log('[ClipAIble Background] Port listener module created', {
  timestamp: Date.now(),
  hasModule: typeof portListenerModule === 'function'
});

// Initialize port listener for offscreen logging
log('[ClipAIble Background] Initializing port listener for offscreen logging', { timestamp: Date.now() });
portListenerModule();
log('[ClipAIble Background] Port listener for offscreen logging initialized', { timestamp: Date.now() });

// Initialize popup connection listener (tracks whether popup is open)
// Used for completion notifications when popup is closed.
log('[ClipAIble Background] Initializing popup connection listener', { timestamp: Date.now() });
initPopupConnectionListener();
log('[ClipAIble Background] Popup connection listener initialized', { timestamp: Date.now() });

// Initialize orchestration module with DI (must be after keep-alive module)
log('[ClipAIble Background] Initializing orchestration module', { timestamp: Date.now() });
const orchestrationModule = initOrchestration({
  log,
  logWarn,
  CONFIG,
  getProcessingState,
  setError,
  setResult,
  updateState,
  ERROR_CODES,
  PROCESSING_STAGES,
  validateAndInitializeProcessing,
  handlePdfPageProcessing,
  handleVideoPageProcessing,
  handleStandardArticleProcessing,
  checkCancellation,
  updateProgress,
  getUILanguageCached,
  handleTranslation,
  handleAbstractGeneration,
  detectEffectiveLanguage,
  translateContent,
  translateImages,
  detectSourceLanguage,
  generateAbstract,
  detectContentLanguage,
  DocumentGeneratorFactory,
  detectPdfPage,
  getOriginalPdfUrl,
  detectVideoPlatform,
  tSync,
  startKeepAlive,
  stopKeepAlive
});

// Extract orchestration functions for use in background.js and other modules
const { startArticleProcessing, continueProcessingPipeline } = orchestrationModule;

// Initialize context menu module with DI
const contextMenuModule = initContextMenu({
  log,
  logError,
  logWarn,
  logDebug,
  CONFIG,
  handleError,
  getUILanguage,
  updateContextMenuWithLang,
  handleQuickSave
});

// Initialize context menu listeners (will be done after extractFromPageInlined is defined)
// Use setTimeout to ensure extractFromPageInlined is available
setTimeout(() => {
  // Create wrapper for startArticleProcessing that includes extractFromPageInlined
  const startArticleProcessingWrapper = (data) => startArticleProcessing(data, extractFromPageInlined);
  contextMenuModule.initContextMenuListeners(startArticleProcessingWrapper);
}, 0);

// ============================================
// MESSAGE LISTENER
// ============================================

try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // CRITICAL: Log ALL messages at the very start to catch any issues
    // This includes messages from service worker to offscreen
    const frequentActions = ['getState', 'TTS_PROGRESS'];
    const isFrequentAction = frequentActions.includes(request?.action);
    
    // ALWAYS log messages with target: 'offscreen' to diagnose delivery issues
    if (request?.target === 'offscreen') {
      log('[ClipAIble Background] === OFFScreen MESSAGE IN LISTENER ===', {
        type: request?.type,
        target: request?.target,
        hasData: !!request?.data,
        dataKeys: request?.data ? Object.keys(request?.data) : [],
        hasPdfData: !!(request?.data && request?.data.pdfData),
        hasPdfDataRef: !!(request?.data && request?.data.pdfDataRef),
        pdfDataRef: request?.data?.pdfDataRef,
        senderId: sender?.id,
        senderUrl: sender?.url,
        isOffscreen: sender?.id === chrome.runtime.id && !sender?.tab,
        timestamp: Date.now()
      });
    }
    
    // Only log important messages (processArticle, errors, etc.)
    if (request?.action === 'processArticle') {
      log('=== chrome.runtime.onMessage: processArticle ===', {
        url: request?.data?.url,
        mode: request?.data?.mode,
        outputFormat: request?.data?.outputFormat,
        timestamp: Date.now()
      });
    }
    
    // CRITICAL: Messages with target: 'offscreen' are for offscreen document
    // Service worker must NOT handle them - return false immediately to let them pass through
    if (request.target === 'offscreen') {
      // ALWAYS log offscreen messages (even if frequent) to diagnose delivery issues
      log('[ClipAIble Background] Offscreen message detected, passing through', {
        type: request.type,
        hasData: !!request.data,
        dataKeys: request.data ? Object.keys(request.data) : [],
        hasPdfData: !!(request.data && request.data.pdfData),
        hasPdfDataRef: !!(request.data && request.data.pdfDataRef),
        pdfDataRef: request.data?.pdfDataRef,
        timestamp: Date.now()
      });
      // Return false to allow message to reach offscreen document's listener
      return false;
    }
    
    // Create wrapper for processWithSelectorMode that includes extractFromPageInlined
    const processWithSelectorModeWrapper = (data) => processWithSelectorMode(data, extractFromPageInlined);
    
    // Create wrapper for processWithoutAI that includes extractFromPageInlined (for cached selectors support)
    const processWithoutAIWrapper = (data) => processWithoutAI(data, extractFromPageInlined);
    
    // Create wrapper for startArticleProcessing that includes extractFromPageInlined
    const startArticleProcessingWrapperForMessage = (data) => startArticleProcessing(data, extractFromPageInlined);
    
    const result = routeMessage(request, sender, sendResponse, {
      startArticleProcessing: startArticleProcessingWrapperForMessage,
      processWithSelectorMode: processWithSelectorModeWrapper,
      processWithExtractMode,
      processWithoutAI: processWithoutAIWrapper,
      stopKeepAlive,
      addLogToCollection,
      exportAllLogsToFile,
      startKeepAlive
    });
    
    if (!isFrequentAction) {
      log('=== chrome.runtime.onMessage: routeMessage returned ===', {
        action: request?.action,
        resultType: typeof result,
        isPromise: result instanceof Promise,
        isBoolean: typeof result === 'boolean',
        timestamp: Date.now()
      });
    }
    
    return result;
  });
} catch (error) {
  logError('=== background.js: Failed to register runtime.onMessage listener ===', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    timestamp: Date.now()
  });
  logError('Failed to register runtime.onMessage listener', error);
}

// ============================================
// INLINED EXTRACTION FUNCTION
// ============================================
// extractFromPageInlined remains here (must be inline for chrome.scripting.executeScript)

/**
 * Extraction function for chrome.scripting.executeScript (page context)
 * 
 * Runs in MAIN world where ES modules are unavailable.
 * All helpers must be defined inside this function.
 * 
 * @param {{content?: string, title?: string, author?: string, exclude?: string, [key: string]: string|undefined}} selectors - Selectors object from AI
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {import('./types.js').InjectionResult} Extraction result
 */
export function extractFromPageInlined(selectors, baseUrl) {
  
  /** @type {ContentItem[]} */
  const content = [];
  const debugInfo = {
    containerFound: false,
    containerSelector: null,
    elementsProcessed: 0,
    elementsExcluded: 0,
    headingCount: 0
  };
  
  const tocMapping = {};
  let footnotesHeaderAdded = false;
  const addedImageUrls = new Set();
  let firstHeadingIndex = -1; // Track position of first heading for subtitle insertion
  let subtitleToInsert = null; // Store subtitle to insert after first heading
  
  // Debug info for subtitle insertion
  const subtitleDebug = {
    subtitleFound: false,
    subtitleText: null,
    firstHeadingFound: false,
    firstHeadingIndex: -1,
    firstHeadingText: null,
    titleInContent: false,
    titleAdded: false,
    subtitleInserted: false,
    subtitleInsertIndex: -1,
    contentBeforeInsert: [],
    contentAfterInsert: [],
    elementsProcessedBeforeFirstHeading: 0,
    totalContentItemsBeforeInsert: 0
  };
  
  // Detailed extraction log (returned in debug for diagnosis); all inputs/outputs and decisions
  const extractionLog = [];
  const MAX_LOG_PREVIEW = 120;
  const MAX_EXTRACTION_LOG = 2500;
  function addLog(step, data) {
    const safe = {};
    for (const k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        const v = data[k];
        if (typeof v === 'string' && v.length > MAX_LOG_PREVIEW) safe[k] = v.substring(0, MAX_LOG_PREVIEW) + '…';
        else if (Array.isArray(v)) safe[k] = v.length > 25 ? v.slice(0, 25) : v;
        else safe[k] = v;
      }
    }
    extractionLog.push({ t: Date.now(), step, ...safe });
    if (extractionLog.length > MAX_EXTRACTION_LOG) extractionLog.shift();
  }
  
  // Helper functions
  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  }
  
  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    try { return new URL(url, baseUrl).href; } catch (e) { 
      // Invalid URL format - fallback to original (graceful degradation)
      // This is expected for malformed URLs from page content
      return url; 
    }
  }
  
  function normalizeText(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  
  function normalizeImageUrl(url) {
    if (!url) return '';
    try { 
      // CRITICAL: window is only available in page context, not in service worker
      // This function runs in page context via executeScript, so window is safe here
      const baseUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
      const urlObj = new URL(url, baseUrl || 'http://localhost');
      // For Vercel image optimization URLs, include the 'url' query parameter in normalization
      // This ensures different images with same pathname but different query params are treated as unique
      const urlParam = urlObj.searchParams.get('url');
      if (urlParam) {
        // Include the 'url' parameter value in normalization for Vercel image URLs
        return (urlObj.pathname + '?url=' + urlParam).toLowerCase();
      }
      // For other URLs, include full pathname and search (query params) to distinguish different images
      return (urlObj.pathname + urlObj.search).toLowerCase(); 
    } catch { 
      return url.toLowerCase(); 
    }
  }
  
  function isInfoboxDiv(element) {
    if (element.tagName.toLowerCase() !== 'div') return false;
    const className = element.className.toLowerCase();
    return ['spoiler', 'interview', 'terminology', 'infobox', 'note-box', 'callout'].some(cls => className.includes(cls));
  }
  
  function shouldExclude(element) {
    const tagName = element.tagName.toLowerCase();
    const elementInfo = {
      tagName: tagName,
      id: element.id || null,
      className: element.className || null,
      matches: [],
      closest: []
    };
    
    if (isInfoboxDiv(element) || tagName === 'aside' || tagName === 'details') {
      return false;
    }
    
    if (!selectors.exclude) {
      return false;
    }
    
    // Check if element itself matches exclude selector
    for (const selector of selectors.exclude) {
      try {
        const matches = element.matches(selector);
        if (matches) {
          elementInfo.matches.push(selector);
          return true;
        }
      } catch (e) {
        // Invalid selector from AI - skip it (graceful degradation)
      }
    }
    
    // CRITICAL: Also check if element is INSIDE an excluded container
    // This allows AI to return exclude selectors for containers (e.g., ".ke.je.u.kg" for promo banner)
    // and we'll exclude all elements inside those containers
    // This is safe because:
    // 1. AI determines exclude selectors, so if it says a container should be excluded, everything inside should be excluded
    // 2. Semantic containers (article, main) are already handled at the start of this function
    // 3. We only check closest() if the element itself doesn't match (already checked above)
    for (const selector of selectors.exclude) {
      try {
        const closestExcluded = element.closest(selector);
        if (closestExcluded && closestExcluded !== element) {
          elementInfo.closest.push(selector);
          return true;
        }
      } catch (e) {
        // Invalid selector - skip it
      }
    }
    
    return false;
  }
  
  /**
   * Single place for CMS/editor artifacts cleanup. Applied to all extracted HTML.
   * Tilda: universal block ID pattern T[\d\s]*\d (covers T1, T006, T00 6, T220, T22 0, etc.).
   * Must stay in sync with cleanTildaArtifactsFromText in scripts/utils/html/html.js.
   * @param {string} html
   * @returns {string}
   */
  function cleanExtractedHtml(html) {
    if (!html || typeof html !== 'string') return '';
    let s = html;
    // Tilda: inline CSS blocks (#rec123 .t006__uptitle{...})
    s = s.replace(/#rec\d+(?:\s*[.,#\w\s\-]+)*\s*\{[^}]*\}/g, '');
    // Tilda: block ID as prefix (T + digits, optional spaces between digits from DOM split)
    s = s.replace(/\bT[\d\s]*\d\s*(?=\d|[А-Яа-яЁё])/g, '');
    // Tilda: standalone block ID after tag or at start
    s = s.replace(/(^|>)\s*T[\d\s]*\d\s*(?=<|$)/g, '$1');
    // Tilda: leftover digit when ID was in another node (0/6 only to avoid stripping "1. Введение")
    s = s.replace(/(^|>)\s*[06]\s+(?=\d|[А-Яа-яЁё])/g, '$1');
    // Tilda: leaked class names (.t006__*, .t1__*, etc.)
    s = s.replace(/\.t\d+__[\w-]+/g, '');
    s = s.replace(/\s{2,}/g, ' ').trim();
    if (s.replace(/<[^>]+>/g, '').replace(/\s/g, '').length === 0) return '';
    return s;
  }

  function getFormattedHtml(element) {
    const clone = element.cloneNode(true);
    
    // Remove style/script so CSS and JS do not leak into extracted text (e.g. Tilda blocks)
    clone.querySelectorAll('style, script').forEach(el => el.remove());
    
    // Remove Wikipedia edit section spans (all languages use same class)
    clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
    
    // CRITICAL: Remove data-footnote* attributes that contain HTML-encoded text
    // These attributes can leak HTML-encoded content (with attributes) into the final text
    // Example: data-footnote2-content="&lt;a href=&quot;...&quot; target=&quot;_blank&quot;&gt;" can leak "target="_blank"" into text
    clone.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-footnote')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    // CRITICAL: Process ALL anchor tags, not just those with href
    // This ensures all <a> tags are properly handled, even if href is missing or invalid
    clone.querySelectorAll('a').forEach(a => {
      const originalHref = a.getAttribute('href');
      if (originalHref) {
        // Normalize href to absolute URL
        // CRITICAL: Use setAttribute instead of a.href property to ensure HTML attribute is preserved
        // Setting a.href only updates DOM property, not HTML attribute, so it may be lost in innerHTML
        const normalizedHref = toAbsoluteUrl(originalHref);
        if (normalizedHref && normalizedHref.trim()) {
          a.setAttribute('href', normalizedHref);
        } else {
          // If toAbsoluteUrl returns empty/invalid, use original href or fallback to #
          a.setAttribute('href', originalHref || '#');
        }
        // CRITICAL: Remove target and rel attributes to prevent them from leaking into text
        // The target attribute will be added later by sanitizeHtml if needed
        a.removeAttribute('target');
        a.removeAttribute('rel');
      } else {
        // CRITICAL: If anchor tag has no href, add href="#" to prevent unclosed tags
        // This ensures all <a> tags have a valid href attribute
        a.setAttribute('href', '#');
      }
    });
    
    // CRITICAL: Convert inline divs to spans to prevent line breaks in sanitizeHtml
    // sanitizeHtml replaces </div> with <br>, which breaks inline structure
    // For div.public-DraftStyleDefault-block, we need to preserve inline structure
    clone.querySelectorAll('div').forEach(div => {
      try {
        const style = window.getComputedStyle(div);
        if (style.display === 'inline' || style.display === 'inline-block' || style.display === 'inline-flex') {
          // Convert inline div to span to preserve inline structure
          const span = document.createElement('span');
          Array.from(div.attributes).forEach(attr => {
            if (attr.name !== 'style' || !attr.value.includes('display')) {
              span.setAttribute(attr.name, attr.value);
            }
          });
          // Preserve inline styles except display (span is inline by default)
          if (div.style.cssText) {
            const inlineStyles = div.style.cssText.replace(/display\s*:\s*[^;]+;?/gi, '').trim();
            if (inlineStyles) {
              span.setAttribute('style', inlineStyles);
            }
          }
          span.innerHTML = div.innerHTML;
          div.parentNode?.replaceChild(span, div);
        }
      } catch (e) {
        // If style check fails, leave div as-is (graceful degradation)
      }
    });
    
    if (selectors.exclude && Array.isArray(selectors.exclude)) {
      selectors.exclude.forEach(sel => { 
        try { 
          clone.querySelectorAll(sel).forEach(el => el.remove()); 
        } catch (e) {
          // Invalid selector from AI - skip it (graceful degradation)
          // This is expected - AI may provide invalid selectors, we just skip them
        }
      });
    }
    
    // CRITICAL: Convert <font> tags to <span> tags to preserve content (especially footnotes)
    // <font> is deprecated but still used on old websites (like paulgraham.com for footnotes)
    // Example: <font color="#999999">[<a href="#f1n"><font color="#999999">1</font></a>]</font> should become <span>[<a href="#f1n"><span>1</span></a>]</span>
    // CRITICAL: Process recursively to handle nested <font> tags
    function convertFontToSpan(element) {
      const fonts = element.querySelectorAll('font');
      // Process from deepest to shallowest to avoid breaking DOM structure
      const fontsArray = Array.from(fonts).reverse();
      fontsArray.forEach(font => {
        const span = document.createElement('span');
        // Copy all attributes from font to span (especially color for footnotes)
        Array.from(font.attributes).forEach(attr => {
          span.setAttribute(attr.name, attr.value);
        });
        span.innerHTML = font.innerHTML;
        font.parentNode?.replaceChild(span, font);
      });
    }
    // Process all font tags recursively
    convertFontToSpan(clone);
    
    // CRITICAL: Convert inline styles to HTML tags before sanitizeHtml removes style attributes
    // This preserves formatting (bold/italic) that would otherwise be lost
    clone.querySelectorAll('span[style]').forEach(span => {
      const style = span.getAttribute('style') || '';
      const styleLower = style.toLowerCase();
      
      // Check for font-weight: bold
      if (styleLower.includes('font-weight') && (styleLower.includes('bold') || styleLower.includes('700') || styleLower.includes('800') || styleLower.includes('900'))) {
        const strong = document.createElement('strong');
        strong.innerHTML = span.innerHTML;
        // Copy other attributes except style
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'style') {
            strong.setAttribute(attr.name, attr.value);
          }
        });
        span.parentNode?.replaceChild(strong, span);
      }
      // Check for font-style: italic
      else if (styleLower.includes('font-style') && styleLower.includes('italic')) {
        const em = document.createElement('em');
        em.innerHTML = span.innerHTML;
        // Copy other attributes except style
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'style') {
            em.setAttribute(attr.name, attr.value);
          }
        });
        span.parentNode?.replaceChild(em, span);
      }
    });
    
    // CRITICAL: Extract text from HTML comments (Vue.js/Nuxt.js pattern: <!--[-->text<!--]-->)
    // Before returning HTML, extract text from comments and make it visible
    // This ensures text inside comments is preserved when comments are removed
    let htmlResult = clone.innerHTML;
    
    // Replace Vue.js/Nuxt.js comment pattern: <!--[-->text<!--]-->
    // This pattern wraps text in comments, we need to extract the text
    htmlResult = htmlResult.replace(/<!--\[-->/g, '');
    htmlResult = htmlResult.replace(/<!--\]-->/g, '');
    // Also handle other HTML comments that might wrap text
    htmlResult = htmlResult.replace(/<!--([\s\S]*?)-->/g, (match, commentContent) => {
      // If comment contains text (not just whitespace), preserve it
      const trimmed = commentContent.trim();
      return trimmed.length > 0 ? trimmed : '';
    });
    
    // CRITICAL: Ensure all <a> tags are properly closed
    // Count opening and closing tags
    const openTags = (htmlResult.match(/<a\b[^>]*>/gi) || []).length;
    const closeTags = (htmlResult.match(/<\/a>/gi) || []).length;
    // If there are unclosed tags, close them at the end
    if (openTags > closeTags) {
      const missing = openTags - closeTags;
      htmlResult = htmlResult + '</a>'.repeat(missing);
    }
    
    return cleanExtractedHtml(htmlResult);
  }
  
  // Image helpers
  function isImageUrl(url) {
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
    const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
    const hosts = ['substackcdn', 'imgur', 'cloudinary', 'imgix', 'wp-content/uploads', 'media.', 'images.', 'cdn.'];
    const lowerUrl = url.toLowerCase();
    for (const ext of exts) { if (lowerUrl.includes(ext + '?') || lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '#')) return true; }
    if (hosts.some(host => lowerUrl.includes(host))) return true;
    return false;
  }
  
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:') && url.length < 200) return true;
    return ['placeholder', 'spacer', 'blank.gif', 'pixel.gif', 'loading.'].some(p => lowerUrl.includes(p));
  }
  
  function isSmallOrAvatarImage(imgElement, src) {
    if (!src) return true;
    const resizeMatch = src.match(/resize:(fit|fill):(\d+)(?::(\d+))?/);
    if (resizeMatch) {
      const w = parseInt(resizeMatch[2]), h = resizeMatch[3] ? parseInt(resizeMatch[3]) : w;
      if (w < 100 || h < 100) return true;
    }
    if (imgElement) {
      const nw = imgElement.naturalWidth || 0, nh = imgElement.naturalHeight || 0;
      if (nw > 0 && nh > 0 && (nw < 100 || nh < 100)) return true;
      const cn = (imgElement.className || '').toLowerCase();
      if (cn.includes('avatar') || cn.includes('profile') || cn.includes('author')) return true;
    }
    return false;
  }
  
  function getBestSrcsetUrl(srcset) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(s => s);
    let bestUrl = null, bestScore = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part || part.startsWith('data:')) continue;
      const descMatch = part.match(/\s+(\d+(?:\.\d+)?[wx])$/i);
      let url = descMatch ? part.substring(0, part.length - descMatch[0].length).trim() : part;
      if (!url || url.startsWith('data:')) continue;
      url = url.replace(/^["']|["']$/g, '');
      if (!url.match(/^(https?:\/\/|\/\/|\/)/)) continue;
      let score = 1;
      if (descMatch) {
        const d = descMatch[1].toLowerCase();
        score = d.endsWith('w') ? (parseInt(d) || 1) : ((parseFloat(d) || 1) * 1000);
      }
      if (score >= bestScore) { bestScore = score; bestUrl = url; }
    }
    return bestUrl;
  }
  
  function isTrackingPixelOrSpacer(imgElement, src) {
    const w = imgElement?.naturalWidth || imgElement?.width || parseInt(imgElement?.getAttribute('width')) || 0;
    const h = imgElement?.naturalHeight || imgElement?.height || parseInt(imgElement?.getAttribute('height')) || 0;
    if ((w === 1 && h === 1) || (w === 0 && h === 0)) return true;
    if (src) {
      const ls = src.toLowerCase();
      if (ls.includes('spacer') || ls.includes('pixel') || ls.includes('tracking')) return true;
    }
    return false;
  }
  
  function extractBestImageUrl(imgElement, containerElement = null) {
    if (!imgElement) return null;
    let src = null;
    const container = containerElement || imgElement.parentElement;
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc)) src = imgElement.currentSrc;
    if (!src) {
      const parentLink = container?.closest('a[href]') || container?.querySelector('a[href]');
      if (parentLink) { const href = parentLink.getAttribute('href'); if (href && isImageUrl(href)) src = href; }
    }
    if (!src) { const imgSrc = imgElement.src || imgElement.getAttribute('src'); if (imgSrc && !isPlaceholderUrl(imgSrc)) src = imgSrc; }
    if (!src) src = getBestSrcsetUrl(imgElement.getAttribute('srcset'));
    if (!src) {
      const picture = imgElement.closest('picture') || container?.querySelector('picture');
      if (picture) { for (const source of picture.querySelectorAll('source[srcset]')) { const ss = getBestSrcsetUrl(source.getAttribute('srcset')); if (ss) src = ss; } }
    }
    if (!src) {
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-full-src']) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes('data:')) { src = attr === 'data-srcset' ? getBestSrcsetUrl(val) : val; if (src) break; }
      }
    }
    return src;
  }
  
  function getImageCaption(img) {
    if (!img) return '';
    // Check for figcaption in figure
    const figure = img.closest('figure');
    if (figure) {
      const figcaption = figure.querySelector('figcaption');
      if (figcaption) return (figcaption.textContent || '').trim();
    }
    // Check aria-label
    const ariaLabel = img.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) return ariaLabel.trim();
    // Check title
    const title = img.getAttribute('title');
    if (title && title.trim() && title !== img.alt) return title.trim();
    // Check next sibling if it's a paragraph or has caption class
    const nextSibling = img.nextElementSibling;
    if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
      return (nextSibling.textContent || '').trim();
    }
    // Check parent container's caption
    const parent = img.parentElement;
    if (parent) {
      const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
      if (captionEl) {
        const captionText = (captionEl.textContent || '').trim();
        if (captionText && captionText !== img.alt) return captionText;
      }
    }
    return '';
  }
  
  function extractTocMapping(listElement) {
    const links = listElement.querySelectorAll('a[href^="#"]');
    if (links.length < 2) return false;
    let isToc = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const anchor = href.substring(1), text = normalizeText(link.textContent);
        if (text && anchor) { tocMapping[text] = anchor; isToc = true; }
      }
    });
    return isToc;
  }
  
  // Helper function to check if element is visible
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           rect.width > 0 &&
           rect.height > 0;
  }

  // Content extraction constants: one place for thresholds to avoid magic numbers and false positives
  const BLOCK_TAGS = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote'];
  const MIXED_BODY_MIN_CHARS = 400;
  const MIN_TEXT_LENGTH = 20;
  const VISIBILITY_FALLBACK_MIN_TEXT = 30;
  const CONTENT_CANDIDATE_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table, div';

  function hasDirectBlockChildren(el) {
    return Array.from(el.children).some(child => BLOCK_TAGS.includes((child.tagName || '').toLowerCase()));
  }

  function isMixedBodyDiv(el) {
    if ((el.tagName || '').toLowerCase() !== 'div') return false;
    const text = (el.textContent || '').trim();
    return text.length >= MIXED_BODY_MIN_CHARS && hasDirectBlockChildren(el);
  }

  function filterContentCandidates(candidateElements) {
    let filtered = candidateElements.filter(candidate => {
      if ((candidate.tagName || '').toLowerCase() === 'div') {
        const text = (candidate.textContent || '').trim();
        if (hasDirectBlockChildren(candidate) && text.length < MIXED_BODY_MIN_CHARS) return false;
        return text.length > MIN_TEXT_LENGTH;
      }
      return true;
    });
    filtered = filtered.filter(c => {
      if ((c.tagName || '').toLowerCase() !== 'div') return true;
      const text = (c.textContent || '').trim();
      if (text.length < MIXED_BODY_MIN_CHARS) return true;
      const hasDescendant = filtered.some(other => other !== c && c.contains(other) && (other.tagName || '').toLowerCase() === 'div' && ((other.textContent || '').trim().length >= MIXED_BODY_MIN_CHARS));
      return !hasDescendant;
    });
    filtered = filtered.filter(c => {
      const inside = filtered.some(anc => anc !== c && anc.contains(c) && (anc.tagName || '').toLowerCase() === 'div' && ((anc.textContent || '').trim().length >= MIXED_BODY_MIN_CHARS));
      return !inside;
    });
    return filtered;
  }

  function getVisibleWithFallback(filteredCandidates) {
    let visible = filteredCandidates.filter(isElementVisible);
    const textBlockCount = visible.filter(c => ['p', 'div'].includes((c.tagName || '').toLowerCase()) && ((c.textContent || '').trim().length > VISIBILITY_FALLBACK_MIN_TEXT)).length;
    if (textBlockCount === 0 && filteredCandidates.length > visible.length) {
      const fallback = filteredCandidates.filter(c => {
        const tag = (c.tagName || '').toLowerCase();
        if (tag !== 'p' && tag !== 'div') return false;
        try {
          if (window.getComputedStyle(c).display === 'none') return false;
        } catch (e) { return false; }
        return ((c.textContent || '').trim().length > VISIBILITY_FALLBACK_MIN_TEXT);
      });
      if (fallback.length > 0) {
        const combined = [...visible];
        fallback.forEach(node => { if (!combined.includes(node)) combined.push(node); });
        visible = combined;
      }
    }
    visible.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return visible;
  }

  function parseMixedContent(container) {
    const segments = [];
    const nodes = Array.from(container.childNodes);
    let i = 0;
    let currentInline = [];

    function flushParagraph() {
      if (currentInline.length === 0) return;
      const wrap = document.createElement('div');
      currentInline.forEach(n => wrap.appendChild(n.cloneNode(true)));
      const text = (wrap.textContent || '').trim();
      if (text.length >= MIN_TEXT_LENGTH) segments.push({ type: 'paragraph', nodes: currentInline.slice() });
      currentInline = [];
    }

    while (i < nodes.length) {
      const node = nodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        currentInline.push(node);
        i++;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        i++;
        continue;
      }
      const tag = (node.tagName || '').toLowerCase();
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        flushParagraph();
        segments.push({ type: 'heading', element: node });
        i++;
        continue;
      }
      if (tag === 'br') {
        const next = nodes[i + 1];
        if (next && next.nodeType === Node.ELEMENT_NODE && (next.tagName || '').toLowerCase() === 'br') {
          flushParagraph();
          i += 2;
          continue;
        }
        currentInline.push(node);
        i++;
        continue;
      }
      if (tag === 'div') {
        const hasBlock = hasDirectBlockChildren(node);
        const hasImg = node.querySelector && node.querySelector('img');
        if (hasBlock || hasImg) {
          flushParagraph();
          segments.push({ type: 'block', element: node });
          i++;
          continue;
        }
      }
      currentInline.push(node);
      i++;
    }
    flushParagraph();
    return segments;
  }

  function emitMixedContentSegments(segments) {
    for (const seg of segments) {
      if (seg.type === 'heading' && seg.element) {
        const text = (seg.element.textContent || '').trim();
        if (!text) continue;
        const formatted = getFormattedHtml(seg.element);
        if (!formatted || !formatted.trim()) continue;
        const headingId = getAnchorId(seg.element) || String(debugInfo.headingCount + 1);
        debugInfo.headingCount++;
        content.push({ type: 'heading', level: parseInt((seg.element.tagName || 'h1')[1], 10), text: formatted, id: headingId });
        continue;
      }
      if (seg.type === 'paragraph' && seg.nodes && seg.nodes.length > 0) {
        const wrap = document.createElement('div');
        seg.nodes.forEach(n => wrap.appendChild(n.cloneNode(true)));
        const html = getFormattedHtml(wrap);
        const text = (wrap.textContent || '').trim();
        if (!html || !html.trim() || text.length < MIN_TEXT_LENGTH) continue;
        content.push({ type: 'paragraph', text: html, id: getAnchorId(wrap) || undefined });
        continue;
      }
      if (seg.type === 'block' && seg.element) {
        processElement(seg.element);
      }
    }
  }

  function processContainerContent(el, logPrefix) {
    const candidateElements = Array.from(el.querySelectorAll(CONTENT_CANDIDATE_SELECTOR));
    const filteredCandidates = filterContentCandidates(candidateElements);
    const paragraphCount = filteredCandidates.filter(c => (c.tagName || '').toLowerCase() === 'p').length;
    const mixedBodyDivs = filteredCandidates.filter(isMixedBodyDiv);

    if (selectors.content) {
      console.log('[ClipAIble] Content strategy' + logPrefix, {
        candidates: candidateElements.length,
        filtered: filteredCandidates.length,
        paragraphs: paragraphCount,
        mixedBodyDivs: mixedBodyDivs.length,
        containerId: el.id
      });
    }

    if (paragraphCount === 0 && mixedBodyDivs.length === 1) {
      extractionDebug.strategiesUsed.push({
        strategy: 'container_mixed_content',
        containerTag: (el.tagName || '').toLowerCase(),
        candidateElements: candidateElements.length,
        filteredCandidates: filteredCandidates.length,
        visibleElements: 0,
        reason: 'no p tags, single mixed body div'
      });
      emitMixedContentSegments(parseMixedContent(mixedBodyDivs[0]));
      return { candidateElements: candidateElements.length, filteredCandidates: filteredCandidates.length, visibleElements: 0, excludedInContainer: 0, processed: content.length };
    }

    const visibleElements = getVisibleWithFallback(filteredCandidates);
    if (selectors.content && visibleElements.length > 0) {
      console.log('[ClipAIble] Processing container children' + logPrefix, {
        containerId: el.id,
        containerClass: el.className,
        containerTag: el.tagName,
        childrenCount: visibleElements.length,
        paragraphsCount: visibleElements.filter(c => (c.tagName || '').toLowerCase() === 'p').length,
        contentSelector: selectors.content
      });
    }

    let excludedInContainer = 0;
    let processedInContainer = 0;
    for (const candidateEl of visibleElements) {
      const isInsideContentElement = !!(selectors.content && el.contains(candidateEl));
      if (!isInsideContentElement && shouldExclude(candidateEl)) {
        if (selectors.content && excludedInContainer < 5) {
          console.log('[ClipAIble] Candidate excluded inside container' + logPrefix, {
            candidateTag: candidateEl.tagName,
            candidateId: candidateEl.id,
            candidateClass: candidateEl.className,
            isInsideContentElement,
            contentSelector: selectors.content
          });
        }
        excludedInContainer++;
        continue;
      }
      if (isInsideContentElement && processedInContainer < 3 && selectors.content) {
        console.log('[ClipAIble] Candidate protected (inside content element)' + logPrefix, {
          candidateTag: candidateEl.tagName,
          candidateId: candidateEl.id,
          textPreview: (candidateEl.textContent || '').trim().substring(0, 50)
        });
      }
      processElement(candidateEl);
      processedInContainer++;
    }
    extractionDebug.strategiesUsed.push({
      strategy: 'container_recursive',
      containerTag: (el.tagName || '').toLowerCase(),
      candidateElements: candidateElements.length,
      filteredCandidates: filteredCandidates.length,
      visibleElements: visibleElements.length,
      excludedInContainer,
      processed: visibleElements.length - excludedInContainer
    });
    return { candidateElements: candidateElements.length, filteredCandidates: filteredCandidates.length, visibleElements: visibleElements.length, excludedInContainer, processed: processedInContainer };
  }

  // Find containers
  // CRITICAL: Search for articleContainer FIRST, not content selector
  // content selector is for finding content INSIDE containers, not for finding containers themselves
  let containers = [];
  let container = null;
  
  // CRITICAL: Only use articleContainer for finding containers, NOT content selector
  // content selector is for finding content INSIDE containers, not containers themselves
  // If we use content selector to find containers, we'll get wrong results (e.g., 9 .wysiwyg elements instead of 1 main#main-content-area)
  if (selectors.articleContainer) {
    try {
      const allElements = document.querySelectorAll(selectors.articleContainer);
      if (allElements.length > 1) {
        containers = Array.from(allElements);
        debugInfo.containerFound = true;
        debugInfo.containerSelector = selectors.articleContainer;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
      } else if (allElements.length === 1) {
        container = allElements[0];
        debugInfo.containerFound = true;
        debugInfo.containerSelector = selectors.articleContainer;
      }
    } catch (e) {
      // Invalid selector from AI - will try fallback below (graceful degradation)
    }
  }
  
  // FALLBACK: If articleContainer not found but content selector exists, use parent of content element as container
  // This is safer than falling back to body, but only if content selector finds exactly one element
  // Using content selector directly as container is wrong (as shown in aljazeera.com case)
  if (containers.length === 0 && !container && selectors.content) {
    try {
      const contentElements = document.querySelectorAll(selectors.content);
      if (contentElements.length === 1) {
        // Use parent of content element as container (more specific than body)
        const contentElement = contentElements[0];
        const parent = contentElement.parentElement;
        if (parent && parent !== document.body && parent !== document.documentElement) {
          container = parent;
          debugInfo.containerFound = true;
          debugInfo.containerSelector = `parent of ${selectors.content}`;
        }
      }
    } catch (e) {
      // Invalid content selector - will fallback to body (graceful degradation)
    }
  }
  
  // CRITICAL FIX: Filter out hidden containers
  if (containers.length > 0) {
    const visibleContainers = containers.filter(isElementVisible);
    debugInfo.filteredHiddenContainers = containers.length - visibleContainers.length;
    if (debugInfo.filteredHiddenContainers > 0) {
      console.log('[ClipAIble extractFromPageInlined] Filtered out', debugInfo.filteredHiddenContainers, 'hidden container(s)');
    }
    containers = visibleContainers;
  } else if (container) {
    if (!isElementVisible(container)) {
      debugInfo.filteredHiddenContainers = 1;
      console.log('[ClipAIble extractFromPageInlined] Single container is hidden, discarding');
      container = null; // Discard hidden single container
    }
  }
  
  if (container && containers.length === 0) {
    // CRITICAL FIX: Before splitting container into articles, check if it contains the content element
    // If the main container contains the content selector, don't split it into articles
    // This prevents issues where main#main-content-area contains .wysiwyg, but we split it into article elements
    // that don't contain .wysiwyg (e.g., recommended articles, playlist items)
    let shouldSplitIntoArticles = true;
    if (selectors.content) {
      try {
        // Normalize content selector: remove container selector prefix if present
        let normalizedContentSelector = selectors.content;
        if (selectors.articleContainer && normalizedContentSelector.includes(selectors.articleContainer)) {
          // Remove container selector from the beginning of content selector
          normalizedContentSelector = normalizedContentSelector.replace(selectors.articleContainer, '').trim();
          // Remove leading space or > if present
          if (normalizedContentSelector.startsWith(' ')) {
            normalizedContentSelector = normalizedContentSelector.substring(1);
          }
          if (normalizedContentSelector.startsWith('>')) {
            normalizedContentSelector = normalizedContentSelector.substring(1).trim();
          }
        }
        
        // Check if the main container contains elements matching the normalized content selector
        const contentInMainContainer = normalizedContentSelector ? container.querySelector(normalizedContentSelector) : null;
        if (contentInMainContainer && container.contains(contentInMainContainer)) {
          // Main container contains the content - don't split it
          shouldSplitIntoArticles = false;
        }
      } catch (e) {
        // Invalid selector, continue with split logic
      }
    }
    
    if (shouldSplitIntoArticles) {
      const articlesInside = container.querySelectorAll('article');
      if (articlesInside.length > 1) {
        const visibleArticles = Array.from(articlesInside).filter(isElementVisible);
        containers = visibleArticles;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
        debugInfo.filteredHiddenContainers = articlesInside.length - visibleArticles.length;
        container = null;
      }
    }
  }
  
  if (containers.length === 0 && !container) {
    container = document.body;
    debugInfo.containerSelector = 'body';
  }
  
  addLog('container_resolution', {
    path: containers.length > 0 ? 'multiContainer' : 'singleContainer',
    containersCount: containers.length,
    containerId: container ? (container.id || null) : null,
    containerClass: container ? (String(container.className || '').substring(0, 60)) : null,
    containerSelector: debugInfo.containerSelector,
    articleContainerSelector: selectors.articleContainer || null,
    contentSelector: selectors.content || null
  });
  
  // Helper function to extract clean title text from element
  // Handles Wikipedia-style edit section spans that pollute title text
  function getCleanTitleText(element) {
    if (!element) return '';
    // Wikipedia: check for .mw-page-title-main which contains clean title
    const titleMain = element.querySelector('.mw-page-title-main');
    if (titleMain) return titleMain.textContent.trim();
    // Clone element and remove edit section spans before getting text
    const clone = element.cloneNode(true);
    // Remove Wikipedia edit sections (all languages use same class)
    clone.querySelectorAll('.mw-editsection').forEach(el => el.remove());
    // Remove any other common edit/action spans
    clone.querySelectorAll('[class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
    return clone.textContent.trim();
  }
  
  // Get title
  let articleTitle = '';
  if (selectors.title) {
    try { 
      const titleEl = document.querySelector(selectors.title); 
      if (titleEl) articleTitle = getCleanTitleText(titleEl); 
    } catch (e) {
      // Invalid title selector from AI - fallback to default title extraction (graceful degradation)
      // This is expected - AI may provide invalid selectors, we use fallback below
    }
  }
  if (!articleTitle) {
    const allArticles = document.querySelectorAll('main article');
    if (allArticles.length > 1) {
      const h1OutsideMain = Array.from(document.querySelectorAll('h1')).find(h1 => !h1.closest('main'));
      if (h1OutsideMain) articleTitle = getCleanTitleText(h1OutsideMain);
    }
  }
  if (!articleTitle) { const h1 = document.querySelector('h1'); if (h1) articleTitle = getCleanTitleText(h1); }
  
  // Clean title from service data, residual edit patterns, and CMS artifacts (Tilda T006 etc.)
  // Note: cleanTitleFromServiceTokens is not available in page context, so we inline the logic here
  if (articleTitle && typeof articleTitle === 'string') {
    let cleaned = articleTitle;
    cleaned = cleaned.replace(/budgettoken[_\s]*budget\d*/gi, '');
    cleaned = cleaned.replace(/budget\d+/gi, '');
    cleaned = cleaned.replace(/token/gi, '');
    cleaned = cleaned.replace(/budget\w+/gi, '');
    cleaned = cleaned.replace(/#+/g, '');
    // Remove Wikipedia-style edit links that might remain as text: [edit], [ред.], [редагувати], etc.
    cleaned = cleaned.replace(/\s*\[[^\]]{1,30}\s*\|\s*[^\]]{1,30}\]\s*$/g, '');
    cleaned = cleaned.replace(/\s*\[(edit|ред\.?|редагувати|править|editar|modifier|bearbeiten|編集|编辑|편집)[^\]]*\]\s*$/gi, '');
    cleaned = cleaned.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^[_\s-]+|[_\s-]+$/g, '');
    cleaned = cleanExtractedHtml(cleaned).trim() || cleaned;
    articleTitle = cleaned || articleTitle;
  }
  
  let articleAuthor = selectors.author || '';
  // NOTE: Author cleaning is now handled by AI in prompts
  // AI is instructed to return author name without prefixes (from, by, author:, etc.)
  // If author still contains prefix, it's a prompt issue - improve prompts, don't add code-side fixes
  
  let publishDate = '';
  for (const sel of ['time[datetime]', 'time', '[itemprop="datePublished"]', '.date', '.post-date']) {
    try {
      const dateEl = document.querySelector(sel);
      if (dateEl) {
        if (sel.startsWith('meta')) publishDate = dateEl.getAttribute('content') || '';
        else if (dateEl.hasAttribute('datetime')) publishDate = dateEl.getAttribute('datetime');
        else publishDate = dateEl.textContent.trim();
        if (publishDate) break;
      }
    } catch (e) {
      // Invalid selector - try next one (graceful degradation)
      // This is expected for fallback selectors
    }
  }
  
  function getAnchorId(el) {
    if (el.id) return el.id;
    if (el.getAttribute && el.getAttribute('name')) return el.getAttribute('name');
    const fc = el.firstElementChild;
    if (fc) {
      const ct = fc.tagName?.toLowerCase();
      if (ct === 'a' || ct === 'span') {
        if (fc.id) return fc.id;
        if (fc.getAttribute && fc.getAttribute('name')) return fc.getAttribute('name');
      }
    }
    const nested = el.querySelector('a[id], a[name], span[id], span[name], sup[id], [id^="source"], [id^="ref"], [id^="cite"]');
    if (nested) return nested.id || nested.getAttribute('name') || '';
    return '';
  }
  
  function processElement(element) {
    const tagName = element.tagName.toLowerCase();
    const textLen = element.textContent ? element.textContent.trim().length : 0;
    const textPreview = element.textContent ? element.textContent.trim().substring(0, MAX_LOG_PREVIEW) : '';
    addLog('pe_in', { tag: tagName, id: element.id || null, class: String(element.className || '').substring(0, 50), textLen, textPreview });
    const elementInfo = {
      tagName: tagName,
      id: element.id || null,
      className: element.className || null,
      textContentLength: textLen,
      textContentPreview: textPreview
    };
    
    // CRITICAL: If element is inside the content element (found by content selector),
    // don't exclude it even if it's inside an excluded container.
    // This check must happen BEFORE shouldExclude to prevent exclusion.
    let isInsideContentElement = false;
    if (selectors.content) {
      // Check if this element is inside any element that matches the content selector
      // We need to find the content element and check if this element is inside it
      try {
        const contentElements = document.querySelectorAll(selectors.content);
        for (const contentEl of contentElements) {
          if (contentEl.contains(element)) {
            isInsideContentElement = true;
            break;
          }
        }
      } catch (e) {
        // Invalid selector - skip check
      }
    }
    
    if (!isInsideContentElement && shouldExclude(element)) {
      debugInfo.elementsExcluded++;
      addLog('pe_skip', { reason: 'shouldExclude', tag: tagName, id: element.id || null });
      return;
    }
    
    // Debug: log processed elements (first few paragraphs only)
    if (tagName === 'p' && debugInfo.elementsProcessed < 3) {
      console.log('[ClipAIble processElement] Processing paragraph', {
        elementId: element.id,
        textLength: element.textContent ? element.textContent.trim().length : 0,
        textPreview: element.textContent ? element.textContent.trim().substring(0, 50) : '',
        isInsideContentElement: isInsideContentElement
      });
    }
    
    let cssHidden = false;
    let cssDisplay = null;
    let cssVisibility = null;
    try { 
      const style = window.getComputedStyle(element);
      cssDisplay = style.display;
      cssVisibility = style.visibility;
      if (style.display === 'none' || style.visibility === 'hidden') {
        cssHidden = true;
        addLog('pe_skip', { reason: 'cssHidden', tag: tagName, display: cssDisplay, visibility: cssVisibility });
        return;
      }
    } catch (e) {
      // getComputedStyle may fail on some elements (e.g., SVG in some browsers)
      // This is expected - continue processing the element (graceful degradation)
    }
    
    debugInfo.elementsProcessed++;
    const elementId = getAnchorId(element);
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = element.textContent.trim();
      const formattedText = getFormattedHtml(element);
      // Skip if cleaned text is empty (e.g. Tilda block ID only: T135, T602)
          if (!formattedText || !formattedText.trim()) {
        addLog('pe_skip', { reason: 'heading_empty_after_clean', tag: tagName, rawLen: text.length, rawPreview: text.substring(0, 50) });
        return;
      }
      // Include heading even if it matches articleTitle (it's the main title)
      // Only skip if it's clearly author name or other metadata
      if (text) {
        if (articleAuthor) {
          const tl = text.toLowerCase(), al = articleAuthor.toLowerCase();
          if (tl === al || (text.length < 50 && tl.includes(al))) {
            addLog('pe_skip', { reason: 'heading_author_match', tag: tagName });
            return;
          }
        }
        // skip heading that is only a section number (e.g. "2" from Tilda layout)
        const headingTextNorm = text.replace(/\s+/g, ' ').trim();
        if (/^\d+$/.test(headingTextNorm)) {
          addLog('pe_skip', { reason: 'heading_only_number', tag: tagName, text: headingTextNorm });
          return;
        }
        let headingId = elementId;
        if (!headingId) {
          const nh = normalizeText(text);
          if (tocMapping[nh]) headingId = tocMapping[nh];
          else headingId = String(debugInfo.headingCount + 1);
        }
        debugInfo.headingCount++;
        const headingItem = { type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId };
        content.push(headingItem);
        addLog('pe_pushed', { type: 'heading', level: parseInt(tagName[1]), textLen: text.length, textPreview: text.substring(0, MAX_LOG_PREVIEW) });
        
        // Track first heading position and insert subtitle immediately after it
        // This ensures subtitle is right after the title, before any other content
        if (firstHeadingIndex === -1) {
          firstHeadingIndex = content.length - 1;
          subtitleDebug.firstHeadingFound = true;
          subtitleDebug.firstHeadingIndex = firstHeadingIndex;
          subtitleDebug.firstHeadingText = text.substring(0, 100);
          subtitleDebug.titleInContent = articleTitle && (
            text === articleTitle || text.toLowerCase() === articleTitle.toLowerCase()
          );
          // If we have a subtitle to insert, insert it now (right after this heading)
          if (subtitleToInsert) {
            content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
            subtitleDebug.subtitleInserted = true;
            subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
            subtitleToInsert = null; // Clear it so we don't insert it again
          }
        }
      }
    }
    else if (tagName === 'p' || tagName === 'font') {
      // Handle both <p> and <font> elements as paragraphs
      // <font> is a deprecated HTML tag but still used on some old websites (like paulgraham.com)
      
      // CRITICAL: If paragraph contains only an image (common pattern on many websites),
      // extract the image separately instead of treating it as a paragraph
      // This ensures images are properly extracted even when wrapped in paragraphs
      const img = element.querySelector('img');
      if (img) {
        // Check if paragraph contains only image (or image in link) with minimal text
        const textContent = element.textContent?.trim() || '';
        const hasOnlyImage = textContent.length === 0 || textContent.replace(/\s+/g, '').length === 0;
        
        if (hasOnlyImage) {
          // CRITICAL: Process the image directly instead of skipping
          // If we just return, the image might not be processed if it's inside a paragraph
          // that was processed before querySelectorAll('img') runs
          // Process the image element directly to ensure it's added
          if (!img.closest('figure') && !img.closest('picture')) {
            let src = extractBestImageUrl(img);
            src = toAbsoluteUrl(src);
            const ns = normalizeImageUrl(src);
            if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
              const imgId = getAnchorId(img);
              content.push({ type: 'image', src: src, alt: img.alt || '', id: imgId });
              addedImageUrls.add(ns);
            }
          }
          
          // Skip the paragraph itself
          return;
        }
      }
      
      let html = getFormattedHtml(element);
      
      if (html.trim()) {
        const pt = element.textContent?.trim() || '';
        if (articleAuthor && pt === articleAuthor) {
          addLog('pe_skip', { reason: 'paragraph_author_match', tag: tagName });
          return;
        }
        const ct = pt.replace(/[\s\u00A0]/g, '');
        if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) {
          addLog('pe_skip', { reason: 'paragraph_separator', tag: tagName });
          return;
        }
        if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
        
        content.push({ type: 'paragraph', text: html, id: elementId });
        addLog('pe_pushed', { type: 'paragraph', textLen: pt.length, textPreview: pt.substring(0, MAX_LOG_PREVIEW) });
        
        // Debug: log successful addition (first few only)
        if (debugInfo.elementsProcessed < 5) {
          console.log('[ClipAIble processElement] Paragraph added to content', {
            contentLength: content.length,
            textPreview: pt.substring(0, 50)
          });
        }
      } else {
        const ptLen = (element.textContent || '').trim().length;
        addLog('pe_skip', { reason: 'paragraph_empty_html', tag: tagName, textLen: ptLen, textPreview: (element.textContent || '').trim().substring(0, 50) });
      }
    }
    else if (tagName === 'img') {
      if (element.closest('figure')) return;
      if (element.closest('picture')) return; // Skip img inside picture - handled separately
      
      let src = extractBestImageUrl(element);
      src = toAbsoluteUrl(src);
      const ns = normalizeImageUrl(src);
      
      if (src && !isTrackingPixelOrSpacer(element, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(element, src)) {
        content.push({ type: 'image', src: src, alt: element.alt || '', id: elementId });
        addedImageUrls.add(ns);
        addLog('pe_pushed', { type: 'image', id: elementId });
      } else {
        addLog('pe_skip', { reason: 'image_filtered', tag: 'img' });
      }
    }
    else if (tagName === 'picture') {
      // Handle picture element - extract img from inside picture
      // CRITICAL: Skip if inside figure (figure handles it with better caption extraction)
      if (element.closest('figure')) return;
      
      let src = null;
      let alt = '';
      let imgElement = null;
      
      // First, try to find img element inside picture
      const img = element.querySelector('img');
      if (img) {
        src = extractBestImageUrl(img, element);
        alt = img.alt || '';
        imgElement = img;
      } else {
        // If no img, extract from source elements
        // Check source[srcset] first (most common)
        const sourcesWithSrcset = element.querySelectorAll('source[srcset]');
        const sourcesWithSrc = element.querySelectorAll('source[src]');
        for (const source of sourcesWithSrcset) {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            const candidate = getBestSrcsetUrl(srcset);
            if (candidate && !isPlaceholderUrl(candidate)) {
              src = candidate;
              break;
            }
          }
        }
        // Fallback to source[src] if no srcset found
        if (!src) {
          for (const source of sourcesWithSrc) {
            const sourceSrc = source.getAttribute('src');
            if (sourceSrc && !isPlaceholderUrl(sourceSrc)) {
              src = sourceSrc;
              break;
            }
          }
        }
      }
      
      if (src) {
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        // Use imgElement for filtering if available, otherwise use element
        const elementForFiltering = imgElement || element;
        const isTracking = isTrackingPixelOrSpacer(elementForFiltering, src);
        const isPlaceholder = isPlaceholderUrl(src);
        const isDuplicate = addedImageUrls.has(ns);
        const isSmall = isSmallOrAvatarImage(elementForFiltering, src);
        if (!isTracking && !isPlaceholder && !isDuplicate && !isSmall) {
          // Extract caption using standard method (if img exists, otherwise try picture element)
          // getImageCaption works with any element, but prefers img for alt attribute
          const caption = imgElement ? getImageCaption(imgElement) : (element.getAttribute('aria-label') || element.getAttribute('title') || '');
          content.push({ 
            type: 'image', 
            src: src, 
            alt: alt, 
            caption: caption,
            id: elementId || (imgElement ? imgElement.id : '') || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'figure') {
      // Handle figure element - can contain img directly or picture>img
      // CRITICAL: Check for picture first, then fallback to direct img
      const picture = element.querySelector('picture');
      const img = picture ? picture.querySelector('img') : element.querySelector('img');
      const figcaption = element.querySelector('figcaption');
      if (img) {
        let src = extractBestImageUrl(img, picture || element);
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
          let captionText = figcaption ? getFormattedHtml(figcaption) : '';
          // CRITICAL: Clean up problematic HTML but preserve links and formatting
          // getFormattedHtml already removes target and rel attributes from links
          // Remove any img tags from caption (images shouldn't be in captions)
          captionText = captionText.replace(/<img[^>]*>/gi, '');
          // Remove any URL fragments or file extensions that might have leaked into text
          // Pattern: "filename.jpg"> or filename.jpg"> (standalone, not in tags)
          // Match only if preceded by space or start of string, and followed by >
          captionText = captionText.replace(/(^|\s)(["']?[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)["']?\s*>)>/gi, '$1');
          // Remove any remaining attribute-like fragments that leaked (target="_blank">, etc.)
          // But only if they're standalone (not inside proper HTML tags)
          // Match pattern like: target="_blank"> or href="..."> at word boundaries
          // CRITICAL: Don't match if it's part of a closing tag like </a>
          captionText = captionText.replace(/(^|\s)([a-zA-Z-]+\s*=\s*["'][^"']*["']\s*>)>/gi, (match, p1, p2, offset, fullString) => {
            // Check if this is part of a closing tag (</a>, </span>, etc.)
            const beforeMatch = fullString.substring(Math.max(0, offset - 10), offset);
            if (beforeMatch.includes('</')) {
              return match; // Don't remove if it's part of a closing tag
            }
            return p1; // Remove the attribute fragment
          });
          // Remove any standalone closing > that might be left at start or end
          // CRITICAL: Don't remove > from closing tags like </a>
          captionText = captionText.replace(/^\s*>\s*(?!<\/)/, '').replace(/(?<!<\/)\s*>\s*$/, '');
          
          // CRITICAL: Ensure all <a> tags are properly closed
          // Count opening and closing tags
          const openTags = (captionText.match(/<a\b[^>]*>/gi) || []).length;
          const closeTags = (captionText.match(/<\/a>/gi) || []).length;
          // If there are unclosed tags, close them at the end
          if (openTags > closeTags) {
            const missing = openTags - closeTags;
            captionText = captionText + '</a>'.repeat(missing);
          }
          content.push({ 
            type: 'image', 
            src: src, 
            alt: img.alt || '', 
            caption: captionText.trim(),
            id: elementId || img.id || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'blockquote') {
      const qt = getFormattedHtml(element);
      content.push({ type: 'quote', text: qt, id: elementId });
      addLog('pe_pushed', { type: 'quote', textLen: (element.textContent || '').trim().length });
    }
    else if (tagName === 'ul' || tagName === 'ol') {
      if (Object.keys(tocMapping).length === 0) extractTocMapping(element);
      const items = Array.from(element.querySelectorAll(':scope > li')).map(li => {
        const liId = getAnchorId(li);
        let html = getFormattedHtml(li);
        if (liId && !html.includes(`id="${liId}"`)) html = `<a id="${liId}" name="${liId}"></a>${html}`;
        return { html, id: liId };
      }).filter(item => item.html);
      if (items.length > 0) {
        content.push({ type: 'list', ordered: tagName === 'ol', items: items, id: elementId });
        addLog('pe_pushed', { type: 'list', ordered: tagName === 'ol', itemCount: items.length, textPreview: (element.textContent || '').trim().substring(0, MAX_LOG_PREVIEW) });
      }
    }
    else if (tagName === 'pre') {
      const code = element.querySelector('code');
      const text = code ? code.textContent : element.textContent;
      const langClass = code?.className.match(/language-(\w+)/);
      content.push({ type: 'code', language: langClass ? langClass[1] : 'text', text: text, id: elementId });
    }
    else if (tagName === 'table') {
      const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(element.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => getFormattedHtml(td)));
      if (headers.length > 0 || rows.length > 0) content.push({ type: 'table', headers: headers, rows: rows, id: elementId });
    }
    else if (tagName === 'hr') {
      content.push({ type: 'separator', id: elementId });
    }
    else if (tagName === 'aside' || tagName === 'details' || isInfoboxDiv(element)) {
      const summary = element.querySelector(':scope > summary');
      const titleEl = element.querySelector(':scope > .spoiler-title, :scope > .interview-title, :scope > h3, :scope > h4');
      const titleText = summary ? summary.textContent.trim() : (titleEl ? titleEl.textContent.trim() : '');
      content.push({ type: 'infobox_start', title: titleText, id: elementId });
      for (const child of element.children) {
        const ct = child.tagName.toLowerCase();
        const isTitle = ct === 'summary' || child.classList.contains('spoiler-title') || (titleText && child.textContent.trim() === titleText);
        if (!isTitle) processElement(child);
      }
      content.push({ type: 'infobox_end' });
    }
    else if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const cn = element.className?.toLowerCase() || '';
      const elId = element.id?.toLowerCase() || '';
      const isFootnotes = cn.includes('footnotes') || elId.includes('footnotes');
      if (isFootnotes && !footnotesHeaderAdded) {
        content.push({ type: 'separator', id: '' });
        // Use 'Footnotes' as fallback - localization happens later in html-builder.js
        // PDF_LOCALIZATION is not available in page context
        content.push({ type: 'heading', level: 2, text: 'Footnotes', id: 'footnotes-section' });
        footnotesHeaderAdded = true;
      }
      
      // CRITICAL: Check if this div is actually a paragraph (no direct block-level children)
      // If it has direct block-level children, it's a container - process children
      // If it doesn't, it might be a paragraph - check if it should be treated as one
      const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote'];
      const hasDirectBlockChildren = Array.from(element.children).some(child => {
        const childTag = child.tagName.toLowerCase();
        return blockTags.includes(childTag);
      });
      const textContent = element.textContent?.trim() || '';
      const hasSignificantText = textContent.length >= 20;
      // Tilda and common CMS use semantic <ul>/<ol> for lists (see Tilda accessibility docs; openlongevity snapshot shows list/listitem = ul/li in a11y tree).
      const hasDirectList = Array.from(element.children).some(c => ['ul', 'ol'].includes((c.tagName || '').toLowerCase()));

      // If div has both block children and significant text, text may live in text nodes (e.g. Tilda
      // intro). But if it has direct ul/ol, we must recurse so lists are extracted as type: 'list',
      // not flattened into one paragraph.
      if (hasDirectBlockChildren && hasSignificantText && !hasDirectList) {
        let html = getFormattedHtml(element);
        if (!html.trim() && textContent.length > 0) {
          addLog('pe_div_fallback_textContent', { tag: tagName, textLen: textContent.length, textPreview: textContent.substring(0, 60) });
          html = textContent;
        }
        if (html.trim()) {
          if (articleAuthor && textContent === articleAuthor) return;
          const ct = textContent.replace(/[\s\u00A0]/g, '');
          if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
          if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
            html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
          }
          content.push({ type: 'paragraph', text: html, id: elementId });
          addLog('pe_pushed', { type: 'paragraph_div_mixed', textLen: textContent.length, textPreview: textContent.substring(0, MAX_LOG_PREVIEW) });
          return;
        }
      }

      if (hasDirectBlockChildren) {
        // It's a container - process children
        for (const child of element.children) processElement(child);
      } else {
        // It might be a paragraph - check if it has significant text and is block-level
        const textContent = element.textContent?.trim() || '';
        const hasSignificantText = textContent.length >= 20;
        
        let isBlockLevel = false;
        try {
          const style = window.getComputedStyle(element);
          const display = style.display;
          isBlockLevel = ['block', 'flex', 'grid', 'table', 'list-item'].includes(display) || 
                        display.startsWith('table-') || 
                        display === 'flow-root';
        } catch (e) {
          const fallbackBlockTags = ['main', 'header', 'footer', 'nav', 'address', 'fieldset', 'legend', 
                                     'center', 'font', 'big', 'small', 'tt', 'marquee'];
          isBlockLevel = fallbackBlockTags.includes(tagName);
        }
        
        if (hasSignificantText && isBlockLevel) {
          let html = getFormattedHtml(element);
          // CRITICAL: If getFormattedHtml returns empty string, use textContent as fallback
          if (!html.trim()) {
            if (textContent.length > 0) addLog('pe_div_fallback_textContent', { tag: tagName, textLen: textContent.length, textPreview: textContent.substring(0, 60) });
            html = textContent;
          }
            if (html.trim()) {
            const pt = textContent;
            if (articleAuthor && pt === articleAuthor) return;
            const ct = pt.replace(/[\s\u00A0]/g, '');
            if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
            if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
              html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
            }
            content.push({ type: 'paragraph', text: html, id: elementId });
            addLog('pe_pushed', { type: 'paragraph_div', textLen: pt.length, textPreview: pt.substring(0, MAX_LOG_PREVIEW) });
          }
        } else if (hasSignificantText) {
          // If element has text but is not block-level, process its children instead
          for (const child of element.children) {
            processElement(child);
          }
        } else {
          // No significant text - process children anyway
          for (const child of element.children) {
            processElement(child);
          }
        }
      }
    }
    else {
      // FALLBACK: Handle any unprocessed element that contains significant text content
      // This covers:
      // - Deprecated HTML tags: <font>, <center>, <b>, <i>, <u>, <s>, <strike>, <big>, <small>, <tt>
      // - Non-standard tags used by some websites
      // - Block-level elements not explicitly handled: <main>, <header>, <footer>, <nav>, <address>, <fieldset>
      // - Any other element that contains meaningful content
      
      const textContent = element.textContent?.trim() || '';
      const hasSignificantText = textContent.length >= 20; // Minimum meaningful text length
      
      // Check if element is block-level or has block display
      let isBlockLevel = false;
      try {
        const style = window.getComputedStyle(element);
        const display = style.display;
        // Block-level displays
        isBlockLevel = ['block', 'flex', 'grid', 'table', 'list-item'].includes(display) || 
                       display.startsWith('table-') || 
                       display === 'flow-root';
      } catch (e) {
        // If style check fails, check by tag name (common block elements)
        const blockTags = ['main', 'header', 'footer', 'nav', 'address', 'fieldset', 'legend', 
                          'center', 'font', 'big', 'small', 'tt', 'marquee'];
        isBlockLevel = blockTags.includes(tagName);
      }
      
      // If element has significant text and is block-level, treat as paragraph
      if (hasSignificantText && isBlockLevel) {
        let html = getFormattedHtml(element);
        if (html.trim()) {
          const pt = textContent;
          if (articleAuthor && pt === articleAuthor) return;
          const ct = pt.replace(/[\s\u00A0]/g, '');
          if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
          if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
            html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
          }
          content.push({ type: 'paragraph', text: html, id: elementId });
          addLog('pe_pushed', { type: 'paragraph_other', tag: tagName, textLen: pt.length });
        }
      } else if (hasSignificantText) {
        // If element has text but is not block-level, process its children instead
        // This handles inline elements that might contain block content
        for (const child of element.children) {
          processElement(child);
        }
      }
    }
  }
  
  // Helper function to find content elements with fallback strategies
  function findContentElements(container, contentSelector, containerSelector) {
    const debugLog = [];
    
    if (!contentSelector || contentSelector === containerSelector) {
      debugLog.push({ strategy: 'none', reason: 'No content selector or same as container', found: 0 });
      return { elements: null, debug: debugLog };
    }
    
    try {
      // Strategy 1: Try selector as-is (absolute from document)
      let elements = document.querySelectorAll(contentSelector);
      debugLog.push({ strategy: 1, method: 'document.querySelectorAll', selector: contentSelector, found: elements.length });
      if (elements.length > 0) {
        // Filter to only elements that are inside our container AND visible
        const filtered = Array.from(elements).filter(el => container.contains(el) && isElementVisible(el));
        debugLog.push({ strategy: 1, filtered: filtered.length, containerMatches: filtered.length > 0, visibleOnly: true });
        if (filtered.length > 0) {
          return { elements: filtered, debug: debugLog };
        }
      }
      
      // Strategy 2: Try selector relative to container
      elements = container.querySelectorAll(contentSelector);
      debugLog.push({ strategy: 2, method: 'container.querySelectorAll', selector: contentSelector, found: elements.length });
      if (elements.length > 0) {
        // Filter to only visible elements
        const visibleElements = Array.from(elements).filter(isElementVisible);
        debugLog.push({ strategy: 2, visibleFiltered: visibleElements.length, originalCount: elements.length });
        if (visibleElements.length > 0) {
          return { elements: visibleElements, debug: debugLog };
        }
      }
      
      // Strategy 3: If selector contains container selector, try removing it
      let normalizedSelector = contentSelector;
      if (containerSelector && contentSelector.includes(containerSelector)) {
        normalizedSelector = contentSelector.replace(containerSelector, '').trim();
        if (normalizedSelector.startsWith(' ')) {
          normalizedSelector = normalizedSelector.substring(1);
        }
        if (normalizedSelector.startsWith('>')) {
          normalizedSelector = normalizedSelector.substring(1).trim();
        }
        
        if (normalizedSelector && normalizedSelector !== contentSelector) {
          elements = container.querySelectorAll(normalizedSelector);
          debugLog.push({ strategy: 3, method: 'normalized selector', original: contentSelector, normalized: normalizedSelector, found: elements.length });
          if (elements.length > 0) {
            const visibleElements = Array.from(elements).filter(isElementVisible);
            debugLog.push({ strategy: 3, visibleFiltered: visibleElements.length, originalCount: elements.length });
            if (visibleElements.length > 0) {
              return { elements: visibleElements, debug: debugLog };
            }
          }
        }
      }
      
      // Strategy 4: If selector uses direct child (>), try without it to find nested elements
      if (contentSelector.includes(' > ')) {
        const flexibleSelector = contentSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        debugLog.push({ strategy: 4, method: 'flexible selector (removed >)', original: contentSelector, flexible: flexibleSelector, found: elements.length });
        if (elements.length > 0) {
          const visibleElements = Array.from(elements).filter(isElementVisible);
          debugLog.push({ strategy: 4, visibleFiltered: visibleElements.length, originalCount: elements.length });
          if (visibleElements.length > 0) {
            return { elements: visibleElements, debug: debugLog };
          }
        }
      }
      
      // Strategy 5: If selector is an ID selector (#id), try finding it anywhere and check if it's in container
      if (contentSelector.startsWith('#')) {
        const id = contentSelector.substring(1);
        const element = document.getElementById(id);
        debugLog.push({ strategy: 5, method: 'getElementById', id: id, found: !!element, inContainer: element && container.contains(element), isVisible: element && isElementVisible(element) });
        if (element && container.contains(element) && isElementVisible(element)) {
          return { elements: [element], debug: debugLog };
        }
      }
      
      // Strategy 6: Extract tag names and try to find them anywhere in container
      const tagMatch = contentSelector.match(/([a-z]+)(?:\s|$|#|\.)/i);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        elements = container.querySelectorAll(tagName);
        debugLog.push({ strategy: 6, method: 'tag name fallback', tagName: tagName, found: elements.length });
        if (elements.length > 0) {
          const visibleElements = Array.from(elements).filter(isElementVisible);
          debugLog.push({ strategy: 6, visibleFiltered: visibleElements.length, originalCount: elements.length });
          if (visibleElements.length > 0) {
            return { elements: visibleElements, debug: debugLog };
          }
        }
      }
      
      debugLog.push({ strategy: 'final', result: 'No elements found with any strategy' });
      return { elements: null, debug: debugLog };
    } catch (e) {
      debugLog.push({ strategy: 'error', error: e.message || String(e) });
      return { elements: null, debug: debugLog };
    }
  }
  
  // Extract subtitle if selector provided (BEFORE processing content)
  // Subtitle should be added after the title (first heading), before main content
  // We'll store it and insert it immediately after the first heading is found
  if (selectors.subtitle && selectors.subtitle.trim()) {
    try {
      const subtitleEl = document.querySelector(selectors.subtitle);
      if (subtitleEl) {
        subtitleDebug.subtitleFound = true;
        // Check if element is visible (not hidden)
        try {
          const style = window.getComputedStyle(subtitleEl);
          if (style.display === 'none' || style.visibility === 'hidden') {
            // Element is hidden, skip it
          } else {
            // Use innerText so <br> and block boundaries become newlines; then normalize to single spaces
            const raw = (subtitleEl.innerText || subtitleEl.textContent || '').trim();
            const subtitleText = raw.replace(/\s+/g, ' ').trim();
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            // Subtitle should be meaningful (at least 20 characters, typically 50-300)
            if (subtitleText && subtitleText.length >= 20) {
              // Check if subtitle is not excluded
              if (!shouldExclude(subtitleEl)) {
                const subtitleHtml = getFormattedHtml(subtitleEl);
                subtitleToInsert = { 
                  type: 'subtitle', 
                  text: subtitleText, 
                  html: `<p class="standfirst">${subtitleHtml}</p>`,
                  isStandfirst: true 
                };
              }
            }
          }
        } catch (styleError) {
          // If style check fails, try to extract anyway
          const raw = (subtitleEl.innerText || subtitleEl.textContent || '').trim();
          const subtitleText = raw.replace(/\s+/g, ' ').trim();
          if (subtitleText && subtitleText.length >= 20 && !shouldExclude(subtitleEl)) {
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            const subtitleHtml = getFormattedHtml(subtitleEl);
            subtitleToInsert = { 
              type: 'subtitle', 
              text: subtitleText, 
              html: `<p class="standfirst">${subtitleHtml}</p>`,
              isStandfirst: true 
            };
          }
        }
      }
    } catch (e) {
      // Selector might be invalid, continue without subtitle
    }
  }
  
  // Start processing
  const containerSelector = selectors.articleContainer || 'body';
  const extractionDebug = {
    containerSelector: containerSelector,
    contentSelector: selectors.content,
    containersFound: containers.length,
    containerFound: !!container,
    contentElementsFound: 0,
    strategiesUsed: []
  };
  
  if (containers.length > 0) {
    addLog('path_taken', { path: 'multiContainer', containersCount: containers.length });
    for (const cont of containers) {
      const result = findContentElements(cont, selectors.content, containerSelector);
      extractionDebug.strategiesUsed.push(...(result.debug || []));
      addLog('findContentElements_result', { path: 'multiContainer', containerId: cont.id || null, elementsCount: result.elements ? result.elements.length : 0, strategies: result.debug || [] });
      if (!result.elements || result.elements.length === 0) {
        extractionDebug.fallbackBranchReason = !selectors.content || selectors.content === containerSelector ? 'content selector same as container or missing' : 'findContentElements returned no elements';
      }
      if (result.elements && result.elements.length > 0) {
        extractionDebug.contentElementsFound += result.elements.length;
        // Process found elements
        let excludedCount = 0;
        let hiddenCount = 0;
        for (let i = 0; i < result.elements.length; i++) {
          const el = result.elements[i];
          
          // Special handling for Twitter/X long-form articles
          const isTwitterContainer = el.getAttribute('data-testid') === 'twitterArticleReadView' || 
                                     (el.closest('article[data-testid="tweet"]') && el.tagName.toLowerCase() === 'div');
          if (isTwitterContainer) {
            // CRITICAL: Process div.public-DraftStyleDefault-block blocks FIRST to avoid duplication
            // These blocks contain the actual content, and processing spans inside them causes duplication
            const draftBlocks = Array.from(el.querySelectorAll('div.public-DraftStyleDefault-block'));
            
            // Use Map to deduplicate blocks by text content
            // CRITICAL: Exclude draft blocks that are inside h2/h3 headings (they're already processed as headings)
            const uniqueBlocks = new Map();
            for (const block of draftBlocks) {
              // Skip draft blocks inside headings - these are already processed as headings
              const parentHeading = block.closest('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three');
              if (parentHeading) {
                continue; // Skip - this block is inside a heading, heading will be processed instead
              }
              
              const text = (block.textContent || '').trim();
              if (!text || text.length < 10) continue;
              
              // Use text as key to dedupe - prefer blocks with more children (more complete)
              if (!uniqueBlocks.has(text) || block.children.length > (uniqueBlocks.get(text)?.children.length || 0)) {
                uniqueBlocks.set(text, block);
              }
            }
            
            // Process headings first
            const headings = Array.from(el.querySelectorAll('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three'));
            
            // CRITICAL: Filter out div.longform-unstyled that contain div.public-DraftStyleDefault-block
            // These are duplicates - we process draft blocks, not their containers
            const allLongformUnstyled = Array.from(el.querySelectorAll('.longform-unstyled, .longform-blockquote'));
            const paragraphs = allLongformUnstyled.filter(div => {
              // Skip if this div contains a draft block (we'll process the draft block instead)
              return div.querySelector('div.public-DraftStyleDefault-block') === null;
            });
            
            // Collect images from the container
            // Note: We filter basic invalid images here, but full deduplication happens in the processing loop
            const images = Array.from(el.querySelectorAll('img')).filter(img => {
              // Skip images inside figure (handled separately if needed)
              if (img.closest('figure')) return false;
              // Basic validation - full checks happen in processing loop
              const src = extractBestImageUrl(img);
              if (!src) return false;
              return true;
            });
            
            // Combine: headings, paragraphs (filtered), unique draft blocks, and images
            const allContentElements = [...headings, ...paragraphs, ...Array.from(uniqueBlocks.values()), ...images];
            allContentElements.sort((a, b) => {
              const pos = a.compareDocumentPosition(b);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              return 0;
            });
            
            // Track processed elements to avoid duplicates
            const processedElements = new Set();
            
            // Process in order
            for (const elem of allContentElements) {
              if (shouldExclude(elem)) continue;
              try {
                const style = window.getComputedStyle(elem);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
              } catch (e) {}
              
              // Skip if already processed (prevent duplicates)
              if (processedElements.has(elem)) continue;
              processedElements.add(elem);
              
              const className = elem.className || '';
              const text = elem.textContent?.trim() || '';
              const tagName = elem.tagName.toLowerCase();
              
              // Process headings
              if (tagName === 'h1' && className.includes('longform-header-one')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  if (html.trim()) {
                    const elemId = getAnchorId(elem);
                    content.push({ type: 'heading', level: 1, text: html, id: elemId });
                  }
                }
              } else if (tagName === 'h2' && className.includes('longform-header-two')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  if (html.trim()) {
                    const elemId = getAnchorId(elem);
                    content.push({ type: 'heading', level: 2, text: html, id: elemId });
                  }
                }
              } else if (tagName === 'h3' && className.includes('longform-header-three')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  if (html.trim()) {
                    const elemId = getAnchorId(elem);
                    content.push({ type: 'heading', level: 3, text: html, id: elemId });
                  }
                }
              }
              // Process paragraphs (only those that don't contain draft blocks)
              else if (className.includes('longform-unstyled') || className.includes('longform-blockquote')) {
                // CRITICAL: Skip if this div contains a draft block (already processed above)
                if (elem.querySelector('div.public-DraftStyleDefault-block')) {
                  continue; // Skip - draft block will be processed separately
                }
                if (text && text.length > 20) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'paragraph', text: html, id: elemId });
                }
              }
              // Process div.public-DraftStyleDefault-block blocks (Draft.js content blocks)
              else if (tagName === 'div' && className.includes('public-DraftStyleDefault-block')) {
                // CRITICAL: Skip draft blocks that are inside h1/h2/h3 headings
                // These headings are already processed above, and draft block inside them is just the content
                // If we process both, we get duplicates
                const parentHeading = elem.closest('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three');
                if (parentHeading) {
                  // This draft block is inside a heading - skip it, heading was already processed
                  continue;
                }
                
                // CRITICAL: If draft block is not inside a real heading, it's always a paragraph
                // Even if it contains bold text, that's just emphasis within a paragraph, not a heading
                // Real headings in Twitter/X use h1.longform-header-one, h2.longform-header-two, h3.longform-header-three
                if (text && text.length > 10) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'paragraph', text: html, id: elemId });
                }
              }
              // Process images
              else if (tagName === 'img') {
                let src = extractBestImageUrl(elem);
                src = toAbsoluteUrl(src);
                const ns = normalizeImageUrl(src);
                if (src && !isTrackingPixelOrSpacer(elem, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(elem, src)) {
                  const elemId = getAnchorId(elem);
                  
                  // Extract image caption
                  let caption = '';
                  // Check for figcaption in figure
                  const figure = elem.closest('figure');
                  if (figure) {
                    const figcaption = figure.querySelector('figcaption');
                    if (figcaption) caption = (figcaption.textContent || '').trim();
                  }
                  // Check aria-label or title
                  if (!caption) {
                    const ariaLabel = elem.getAttribute('aria-label');
                    if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) {
                      caption = ariaLabel.trim();
                    }
                  }
                  if (!caption) {
                    const title = elem.getAttribute('title');
                    if (title && title.trim() && title !== elem.alt) {
                      caption = title.trim();
                    }
                  }
                  // Check next sibling for caption
                  if (!caption) {
                    const nextSibling = elem.nextElementSibling;
                    if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
                      caption = (nextSibling.textContent || '').trim();
                    }
                  }
                  // Check for caption in parent container
                  if (!caption) {
                    const parent = elem.parentElement;
                    if (parent) {
                      const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
                      if (captionEl) {
                        const captionText = (captionEl.textContent || '').trim();
                        if (captionText && captionText !== elem.alt) {
                          caption = captionText;
                        }
                      }
                    }
                  }
                  
                  content.push({ type: 'image', src: src, alt: elem.alt || '', caption: caption, id: elemId });
                  addedImageUrls.add(ns);
                }
              }
            }
            continue; // Skip normal processing for Twitter container
          }
          const elementInfo = {
            index: i,
            total: result.elements.length,
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            textContentLength: el.textContent ? el.textContent.trim().length : 0
          };
          
          // CRITICAL: If element was found by content selector, don't exclude it
          // even if it's inside an excluded container. The content selector explicitly
          // identifies the main content element, so it should never be excluded.
          // Since this element was found by findContentElements using the content selector,
          // it MUST be the content element. We verify this with multiple checks for reliability.
          let isContentElement = false;
          if (selectors.content) {
            try {
              // Primary check: use matches() for accurate CSS selector matching
              if (el.matches && el.matches(selectors.content)) {
                isContentElement = true;
              }
            } catch (e) {
              // matches() may fail for invalid selectors, use fallback
            }
            // Fallback checks for common selector types (more reliable than matches for simple selectors)
            if (!isContentElement) {
              if (selectors.content.startsWith('#')) {
                const id = selectors.content.substring(1);
                if (el.id === id) {
                  isContentElement = true;
                }
              } else if (selectors.content.startsWith('.')) {
                // Handle single class or multiple classes
                // For selector like ".class1.class2", split by '.' to get individual classes
                // For selector like ".class-name", it's a single class with a dash
                const selectorWithoutDot = selectors.content.substring(1);
                const classNames = selectorWithoutDot.split('.').filter(c => c.trim());
                if (classNames.length > 0 && el.classList) {
                  // Check if element has all classes from selector
                  // For ".PostsPage-postContent", classNames will be ["PostsPage-postContent"]
                  // For ".class1.class2", classNames will be ["class1", "class2"]
                  isContentElement = classNames.every(cn => el.classList.contains(cn));
                }
              }
            }
            // CRITICAL: If element was found by findContentElements, it's definitely the content element
            // Since we're iterating over result.elements (from findContentElements),
            // every element here was found using the content selector, so it must be a content element.
            // This is a safety net for cases where matches() fails but element was correctly found.
            // NOTE: We only set this to true if selectors.content exists, to avoid false positives
            if (!isContentElement && selectors.content) {
              // Element is in result.elements array from findContentElements(cont, selectors.content)
              // This means it was explicitly found using the content selector, so it's definitely the content element
              isContentElement = true;
            }
          }
          
          // CRITICAL: Log before exclusion check to debug
          // Use multiple console methods to ensure visibility
          if (selectors.content) {
            try {
              console.log('[ClipAIble extractFromPageInlined] Before exclusion check', {
                elementId: el.id,
                elementTag: el.tagName,
                elementClass: el.className,
                contentSelector: selectors.content,
                isContentElement: isContentElement,
                elementMatchesSelector: el.matches && el.matches(selectors.content),
                elementInResultElements: true // We're iterating over result.elements
              });
              // Also use console.warn for better visibility
              if (!isContentElement) {
                console.warn('[ClipAIble] WARNING: Content element not detected!', {
                  elementId: el.id,
                  elementClass: el.className,
                  contentSelector: selectors.content
                });
              }
            } catch (e) {
              // Console might be blocked
            }
          }
          
          // CRITICAL: If this is the content element, NEVER exclude it
          // Skip shouldExclude check entirely for content elements
          if (!isContentElement) {
            if (shouldExclude(el)) {
              // Debug: log why element was excluded
              console.log('[ClipAIble extractFromPageInlined] Element excluded', {
                elementId: el.id,
                elementTag: el.tagName,
                elementClass: el.className,
                contentSelector: selectors.content,
                isContentElement: isContentElement,
                shouldExcludeResult: shouldExclude(el)
              });
              excludedCount++;
              continue;
            }
          } else {
            // Content element - log that it's protected
            console.log('[ClipAIble extractFromPageInlined] Content element protected from exclusion', {
              elementId: el.id,
              elementTag: el.tagName,
              elementClass: el.className,
              contentSelector: selectors.content
            });
          }
          
          // Check if element is hidden
          let isHidden = false;
          try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              isHidden = true;
              hiddenCount++;
              continue;
            }
          } catch (e) {
            // getComputedStyle may fail - continue processing
          }
          
          // CRITICAL: If the found content element is a container (div, section, article),
          // use aggressive recursive extraction instead of just processing children.
          // This ensures we capture all nested content, not just direct children.
          const tagName = el.tagName.toLowerCase();
          const isContainer = tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'main';
          
          if (isContainer) {
            processContainerContent(el, '');
          } else {
            // Element is not a container, process it directly
            processElement(el);
          }
        }
        if (excludedCount > 0 || hiddenCount > 0) {
          extractionDebug.strategiesUsed.push({
            strategy: 'filtering',
            excludedBySelector: excludedCount,
            excludedByCSS: hiddenCount,
            totalFound: result.elements.length,
            processed: result.elements.length - excludedCount - hiddenCount
          });
        }
      } else {
        // Fallback: when content selector matches container (e.g. #allrecords on Tilda),
        // try section-aware extraction first so we preserve "1", "2.1.1", "Ожидаемый результат:" as headings.
        // Debug data is written to extractionDebug.fallbackDetail so it appears in clipaible-logs (this code runs in page context, console.log would only show in page DevTools).
        const fallbackDetail = {
          containerId: cont.id || null,
          containerClass: (cont.className && String(cont.className).substring(0, 80)) || null,
          rawChildrenCount: cont.children.length,
          contentSelector: selectors.content,
          containerSelector: containerSelector
        };
        let filteredByExclude = 0;
        let filteredByVisibility = 0;
        const directChildren = Array.from(cont.children).filter(el => {
          if (shouldExclude(el)) { filteredByExclude++; return false; }
          try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') { filteredByVisibility++; return false; }
          } catch (e) {}
          return true;
        });
        fallbackDetail.directChildrenFilteredByExclude = filteredByExclude;
        fallbackDetail.directChildrenFilteredByVisibility = filteredByVisibility;
        const directDivCount = directChildren.filter(el => el.tagName.toLowerCase() === 'div').length;
        const useSectionAware = directDivCount >= 3 && directChildren.length >= 3;
        fallbackDetail.directChildrenCount = directChildren.length;
        fallbackDetail.directDivCount = directDivCount;
        fallbackDetail.useSectionAware = useSectionAware;
        fallbackDetail.directChildrenPreview = directChildren.map((el, idx) => ({
          index: idx,
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          class: (el.className && String(el.className).substring(0, 60)) || null,
          textPreview: (el.textContent && el.textContent.trim().substring(0, 80)) || ''
        }));

        if (useSectionAware) {
          extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'section-aware (direct children as sections)', reason: 'No content elements found or content selector matches container', directDivCount });
          fallbackDetail.sectionAwareDivs = [];
          fallbackDetail.sectionBodySummary = [];
          for (let childIdx = 0; childIdx < directChildren.length; childIdx++) {
            const child = directChildren[childIdx];
            const tag = child.tagName.toLowerCase();
            if (tag === 'div') {
              const text = (child.textContent || '').trim();
              const hasList = child.querySelector('ul, ol');
              const looksLikeSectionHeader = !hasList && text.length > 0 && text.length <= 220;
              fallbackDetail.sectionAwareDivs.push({ childIndex: childIdx, textLen: text.length, hasList: !!hasList, looksLikeSectionHeader, textPreview: text.substring(0, 80) });
              if (looksLikeSectionHeader) {
                const html = getFormattedHtml(child);
                if (html.trim()) {
                  const id = getAnchorId(child) || (child.id || '');
                  content.push({ type: 'heading', level: 2, text: html, id: id || undefined });
                  debugInfo.headingCount++;
                  addLog('extract_section_header', { childIdx, textPreview: text.substring(0, 80) });
                } else if (text.length > 0) {
                  addLog('extract_section_header_empty_clean', { childIdx, rawLen: text.length, rawPreview: text.substring(0, 60) });
                }
              } else {
                const sectionBodyChildren = Array.from(child.children).filter(isElementVisible);
                fallbackDetail.sectionBodySummary.push({ childIndex: childIdx, bodyChildrenCount: sectionBodyChildren.length, bodyTags: sectionBodyChildren.map(el => el.tagName.toLowerCase()) });
                for (const el of sectionBodyChildren) {
                  if (shouldExclude(el)) {
                    addLog('extract_section_body_skip', { childIdx, reason: 'shouldExclude', tag: el.tagName.toLowerCase(), textPreview: (el.textContent || '').trim().substring(0, 50) });
                    continue;
                  }
                  const elTag = el.tagName.toLowerCase();
                  if (elTag === 'p' || elTag === 'ul' || elTag === 'ol') {
                    addLog('extract_section_body_direct', { childIdx, tag: elTag });
                    processElement(el);
                  } else if (elTag === 'div') {
                    const divText = (el.textContent || '').trim();
                    const divHasList = el.querySelector('ul, ol');
                    if (!divHasList && divText.length > 0 && divText.length <= 120) {
                      const divHtml = getFormattedHtml(el);
                      if (divHtml.trim()) {
                        content.push({ type: 'heading', level: 3, text: divHtml, id: getAnchorId(el) || undefined });
                        addLog('extract_section_body_div_h3', { childIdx, textPreview: divText.substring(0, 60) });
                      } else if (divText.length > 0) {
                        addLog('extract_section_body_div_h3_empty', { childIdx, rawPreview: divText.substring(0, 50) });
                      }
                    } else if (divText.length > 0 && !divHasList) {
                      const divHtml = getFormattedHtml(el);
                      if (divHtml.trim()) {
                        content.push({ type: 'paragraph', text: divHtml, id: getAnchorId(el) || undefined });
                        addLog('extract_section_body_div_p', { childIdx, textPreview: divText.substring(0, 60) });
                      } else if (divText.length > 0) {
                        addLog('extract_section_body_div_p_empty', { childIdx, rawPreview: divText.substring(0, 50) });
                      }
                    } else if (divHasList) {
                      const nested = Array.from(el.children).filter(isElementVisible);
                      addLog('extract_section_body_div_list', { childIdx, nestedCount: nested.length, nestedTags: nested.map(n => n.tagName.toLowerCase()) });
                      if (nested.length === 0) {
                        addLog('extract_section_body_div_list_no_children', { childIdx, textPreview: divText.substring(0, 60) });
                      }
                      for (const n of nested) { if (!shouldExclude(n)) processElement(n); }
                    } else {
                      // div with no text or text > 120 and no list: process children to avoid dropping content
                      const nested = Array.from(el.children).filter(isElementVisible);
                      addLog('extract_section_body_div_other', { childIdx, divTextLen: divText.length, nestedCount: nested.length });
                      for (const n of nested) { if (!shouldExclude(n)) processElement(n); }
                    }
                  } else {
                    // other tags (span, section, article, etc.) — process so content is not lost
                    addLog('extract_section_body_other_tag', { childIdx, tag: elTag, textPreview: (el.textContent || '').trim().substring(0, 60) });
                    processElement(el);
                  }
                }
              }
            } else {
              processElement(child);
            }
          }
        } else {
          extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'process all children recursively', reason: 'No content elements found or content selector matches container' });
          const candidateElements = Array.from(cont.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table'));
          const visibleElements = candidateElements.filter(isElementVisible);
          visibleElements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
          });
          const tagCounts = { h1: 0, h2: 0, h3: 0, p: 0, ul: 0, ol: 0, div: 0, other: 0 };
          for (const el of visibleElements) {
            const t = el.tagName.toLowerCase();
            if (tagCounts[t] !== undefined) tagCounts[t]++;
            else tagCounts.other++;
          }
          fallbackDetail.recursiveTagCounts = tagCounts;
          fallbackDetail.recursiveCandidateCount = candidateElements.length;
          fallbackDetail.recursiveVisibleCount = visibleElements.length;
          fallbackDetail.recursiveFirstElements = visibleElements.slice(0, 15).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null, textPreview: (el.textContent && el.textContent.trim().substring(0, 50)) || '' }));
          for (const el of visibleElements) {
            if (shouldExclude(el)) continue;
            processElement(el);
          }
        }
        fallbackDetail.contentLengthAfterFallback = content.length;
        fallbackDetail.headingCountAfterFallback = debugInfo.headingCount;
        const contentByType = {};
        for (const item of content) {
          const t = item.type || 'unknown';
          contentByType[t] = (contentByType[t] || 0) + 1;
        }
        fallbackDetail.contentByType = contentByType;
        extractionDebug.fallbackDetail = fallbackDetail;
      }
    }
    } else if (container) {
      addLog('path_taken', { path: 'singleContainer', containerId: container.id || null });
      const result = findContentElements(container, selectors.content, containerSelector);
      extractionDebug.strategiesUsed.push(...(result.debug || []));
      addLog('findContentElements_result', {
        path: 'singleContainer',
        elementsCount: result.elements ? result.elements.length : 0,
        strategies: result.debug || []
      });
      if (result.elements && result.elements.length > 0) {
      extractionDebug.contentElementsFound = result.elements.length;
      // Process found elements
      let excludedCount = 0;
      let hiddenCount = 0;
      for (let i = 0; i < result.elements.length; i++) {
        const el = result.elements[i];
        
        // Special handling for Twitter/X long-form articles
        const isTwitterContainer = el.getAttribute('data-testid') === 'twitterArticleReadView' || 
                                   (el.closest('article[data-testid="tweet"]') && el.tagName.toLowerCase() === 'div');
        if (isTwitterContainer) {
          // Single-pass collection: gather all content elements efficiently
          const headings = Array.from(el.querySelectorAll('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three'));
          const allLongformUnstyled = Array.from(el.querySelectorAll('.longform-unstyled, .longform-blockquote'));
          const draftBlocks = Array.from(el.querySelectorAll('div.public-DraftStyleDefault-block'));
          
          // Build Set of draft blocks inside headings (single pass)
          const draftBlocksInsideHeadings = new Set();
          for (const heading of headings) {
            for (const block of heading.querySelectorAll('div.public-DraftStyleDefault-block')) {
              draftBlocksInsideHeadings.add(block);
            }
          }
          
          // Filter paragraphs: exclude those containing draft blocks (we process draft blocks directly)
          const paragraphs = allLongformUnstyled.filter(div => 
            !div.querySelector('div.public-DraftStyleDefault-block')
          );
          
          // Deduplicate draft blocks by text content, excluding those inside headings
          const uniqueBlocks = new Map();
          for (const block of draftBlocks) {
            if (draftBlocksInsideHeadings.has(block)) continue;
            
            const text = (block.textContent || '').trim();
            if (!text || text.length < 10) continue;
            
            // Prefer blocks with more children (more complete)
            const existing = uniqueBlocks.get(text);
            if (!existing || block.children.length > existing.children.length) {
              uniqueBlocks.set(text, block);
            }
          }
          
          // Collect images from the container
          // Note: We filter basic invalid images here, but full deduplication happens in the processing loop
          const images = Array.from(el.querySelectorAll('img')).filter(img => {
            // Skip images inside figure (handled separately if needed)
            if (img.closest('figure')) return false;
            // Basic validation - full checks happen in processing loop
            const src = extractBestImageUrl(img);
            if (!src) return false;
            return true;
          });
          
          // Combine and sort by DOM order
          const allContentElements = [...headings, ...paragraphs, ...Array.from(uniqueBlocks.values()), ...images];
          allContentElements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 
                   (pos & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : 0;
          });
          
          // Track processed elements to avoid duplicates
          const processedElements = new Set();
          
          // Process in order
          for (const elem of allContentElements) {
            if (shouldExclude(elem)) continue;
            try {
              const style = window.getComputedStyle(elem);
              if (style.display === 'none' || style.visibility === 'hidden') continue;
            } catch (e) {}
            
            // Skip if already processed (prevent duplicates)
            if (processedElements.has(elem)) continue;
            processedElements.add(elem);
            
            const className = elem.className || '';
            const text = elem.textContent?.trim() || '';
            const tagName = elem.tagName.toLowerCase();
            
            // Process headings
            if (tagName === 'h1' && className.includes('longform-header-one')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                if (html.trim()) {
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 1, text: html, id: elemId });
                }
              }
            } else if (tagName === 'h2' && className.includes('longform-header-two')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                if (html.trim()) {
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 2, text: html, id: elemId });
                }
              }
            } else if (tagName === 'h3' && className.includes('longform-header-three')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                if (html.trim()) {
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 3, text: html, id: elemId });
                }
              }
            }
            // Process paragraphs (only those that don't contain draft blocks)
            else if (className.includes('longform-unstyled') || className.includes('longform-blockquote')) {
              // CRITICAL: Skip if this div contains a draft block (already processed above)
              if (elem.querySelector('div.public-DraftStyleDefault-block')) {
                continue; // Skip - draft block will be processed separately
              }
              if (text && text.length > 20) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'paragraph', text: html, id: elemId });
              }
            }
            // Process div.public-DraftStyleDefault-block blocks (Draft.js content blocks)
            else if (tagName === 'div' && className.includes('public-DraftStyleDefault-block')) {
              // Skip draft blocks inside headings (already processed as headings)
              if (draftBlocksInsideHeadings.has(elem)) {
                continue;
              }
              
              // CRITICAL: If draft block is not inside a real heading, it's always a paragraph
              // Even if it contains bold text, that's just emphasis within a paragraph, not a heading
              // Real headings in Twitter/X use h1.longform-header-one, h2.longform-header-two, h3.longform-header-three
              if (text && text.length > 10) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'paragraph', text: html, id: elemId });
              }
            }
            // Process images
            else if (tagName === 'img') {
              let src = extractBestImageUrl(elem);
              src = toAbsoluteUrl(src);
              const ns = normalizeImageUrl(src);
              if (src && !isTrackingPixelOrSpacer(elem, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(elem, src)) {
                const elemId = getAnchorId(elem);
                
                // Extract image caption
                let caption = '';
                // Check for figcaption in figure
                const figure = elem.closest('figure');
                if (figure) {
                  const figcaption = figure.querySelector('figcaption');
                  if (figcaption) caption = (figcaption.textContent || '').trim();
                }
                // Check aria-label or title
                if (!caption) {
                  const ariaLabel = elem.getAttribute('aria-label');
                  if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) {
                    caption = ariaLabel.trim();
                  }
                }
                if (!caption) {
                  const title = elem.getAttribute('title');
                  if (title && title.trim() && title !== elem.alt) {
                    caption = title.trim();
                  }
                }
                // Check next sibling for caption
                if (!caption) {
                  const nextSibling = elem.nextElementSibling;
                  if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
                    caption = (nextSibling.textContent || '').trim();
                  }
                }
                // Check for caption in parent container
                if (!caption) {
                  const parent = elem.parentElement;
                  if (parent) {
                    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
                    if (captionEl) {
                      const captionText = (captionEl.textContent || '').trim();
                      if (captionText && captionText !== elem.alt) {
                        caption = captionText;
                      }
                    }
                  }
                }
                
                content.push({ type: 'image', src: src, alt: elem.alt || '', caption: caption, id: elemId });
                addedImageUrls.add(ns);
              }
            }
          }
          continue; // Skip normal processing for Twitter container
        }
        const elementInfo = {
          index: i,
          total: result.elements.length,
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: el.className || null,
          textContentLength: el.textContent ? el.textContent.trim().length : 0
        };
        
        // CRITICAL: If element was found by content selector, don't exclude it
        // even if it's inside an excluded container. The content selector explicitly
        // identifies the main content element, so it should never be excluded.
        let isContentElement = false;
        if (selectors.content) {
          try {
            if (el.matches && el.matches(selectors.content)) {
              isContentElement = true;
            }
          } catch (e) {
            // matches() may fail, use fallback
          }
          if (!isContentElement) {
            if (selectors.content.startsWith('#')) {
              const id = selectors.content.substring(1);
              if (el.id === id) {
                isContentElement = true;
              }
            } else if (selectors.content.startsWith('.')) {
              // Handle single class or multiple classes
              // For selector like ".class1.class2", split by '.' to get individual classes
              // For selector like ".class-name", it's a single class with a dash
              const selectorWithoutDot = selectors.content.substring(1);
              const classNames = selectorWithoutDot.split('.').filter(c => c.trim());
              if (classNames.length > 0 && el.classList) {
                // Check if element has all classes from selector
                // For ".PostsPage-postContent", classNames will be ["PostsPage-postContent"]
                // For ".class1.class2", classNames will be ["class1", "class2"]
                isContentElement = classNames.every(cn => el.classList.contains(cn));
              }
            }
          }
          // Element is in result.elements from findContentElements, so it's definitely the content element
          // NOTE: We only set this to true if selectors.content exists, to avoid false positives
          if (!isContentElement && selectors.content) {
            isContentElement = true;
          }
        }
        
        // CRITICAL: Log before exclusion check to debug
        // Use multiple console methods to ensure visibility
        if (selectors.content) {
          try {
            console.log('[ClipAIble extractFromPageInlined] Before exclusion check (single container)', {
              elementId: el.id,
              elementTag: el.tagName,
              elementClass: el.className,
              contentSelector: selectors.content,
              isContentElement: isContentElement,
              elementMatchesSelector: el.matches && el.matches(selectors.content),
              elementInResultElements: true // We're iterating over result.elements
            });
            // Also use console.warn for better visibility
            if (!isContentElement) {
              console.warn('[ClipAIble] WARNING: Content element not detected! (single container)', {
                elementId: el.id,
                elementClass: el.className,
                contentSelector: selectors.content
              });
            }
          } catch (e) {
            // Console might be blocked
          }
        }
        
        // CRITICAL: If this is the content element, NEVER exclude it
        // Skip shouldExclude check entirely for content elements
        if (!isContentElement) {
          if (shouldExclude(el)) {
            // Debug: log why element was excluded
            console.log('[ClipAIble extractFromPageInlined] Element excluded (single container path)', {
              elementId: el.id,
              elementTag: el.tagName,
              elementClass: el.className,
              contentSelector: selectors.content,
              isContentElement: isContentElement,
              shouldExcludeResult: shouldExclude(el)
            });
            excludedCount++;
            continue;
          }
        } else {
          // Content element - log that it's protected
          console.log('[ClipAIble extractFromPageInlined] Content element protected from exclusion (single container)', {
            elementId: el.id,
            elementTag: el.tagName,
            elementClass: el.className,
            contentSelector: selectors.content
          });
        }
        
        // Check if element is hidden
        let isHidden = false;
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            isHidden = true;
            hiddenCount++;
            continue;
          }
        } catch (e) {
          // getComputedStyle may fail - continue processing
        }
        
          // CRITICAL: If the found content element is a container (div, section, article),
          // use aggressive recursive extraction instead of just processing children.
          // This ensures we capture all nested content, not just direct children.
          const tagName = el.tagName.toLowerCase();
          const isContainer = tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'main';
          
          if (isContainer) {
            processContainerContent(el, ' (single container)');
          } else {
            processElement(el);
          }
      }
      if (excludedCount > 0 || hiddenCount > 0) {
        extractionDebug.strategiesUsed.push({
          strategy: 'filtering',
          excludedBySelector: excludedCount,
          excludedByCSS: hiddenCount,
          totalFound: result.elements.length,
          processed: result.elements.length - excludedCount - hiddenCount
        });
      }
    } else {
      // Fallback (single container): same as multi-container — section-aware or recursive, plus fallbackDetail for logs
      extractionDebug.fallbackBranchReason = !selectors.content || selectors.content === containerSelector ? 'content selector same as container or missing' : 'findContentElements returned no elements';
      addLog('fallback_start', { path: 'singleContainer', containerId: container.id || null });
      const fallbackDetail = {
        containerId: container.id || null,
        containerClass: (container.className && String(container.className).substring(0, 80)) || null,
        rawChildrenCount: container.children.length,
        contentSelector: selectors.content,
        containerSelector: containerSelector,
        path: 'singleContainer'
      };
      const directChildren = Array.from(container.children).filter(el => {
        if (shouldExclude(el)) return false;
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        } catch (e) {}
        return true;
      });
      const directDivCount = directChildren.filter(el => el.tagName.toLowerCase() === 'div').length;
      const useSectionAware = directDivCount >= 3 && directChildren.length >= 3;
      fallbackDetail.directChildrenCount = directChildren.length;
      fallbackDetail.directDivCount = directDivCount;
      fallbackDetail.useSectionAware = useSectionAware;
      fallbackDetail.directChildrenPreview = directChildren.map((el, idx) => ({
        index: idx,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: (el.className && String(el.className).substring(0, 60)) || null,
        textPreview: (el.textContent && el.textContent.trim().substring(0, 80)) || ''
      }));
      addLog('fallback_direct_children', { count: directChildren.length, directDivCount, useSectionAware });
      for (let i = 0; i < directChildren.length; i++) {
        const el = directChildren[i];
        addLog('fallback_direct_child', { index: i, tag: el.tagName.toLowerCase(), id: el.id || null, textPreview: (el.textContent && el.textContent.trim().substring(0, 80)) || '' });
      }

      if (useSectionAware) {
        extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'section-aware (direct children as sections)', reason: 'No content elements found or content selector matches container', directDivCount });
        fallbackDetail.sectionAwareDivs = [];
        fallbackDetail.sectionBodySummary = [];
        for (let childIdx = 0; childIdx < directChildren.length; childIdx++) {
          const child = directChildren[childIdx];
          const tag = child.tagName.toLowerCase();
          if (tag === 'div') {
            const text = (child.textContent || '').trim();
            const hasList = child.querySelector('ul, ol');
            const looksLikeSectionHeader = !hasList && text.length > 0 && text.length <= 220;
            addLog('fallback_section_div', { childIndex: childIdx, textLen: text.length, hasList: !!hasList, looksLikeSectionHeader, textPreview: text.substring(0, 80) });
            fallbackDetail.sectionAwareDivs.push({ childIndex: childIdx, textLen: text.length, hasList: !!hasList, looksLikeSectionHeader, textPreview: text.substring(0, 80) });
            if (looksLikeSectionHeader) {
              const html = getFormattedHtml(child);
              if (html.trim()) {
                const id = getAnchorId(child) || (child.id || '');
                content.push({ type: 'heading', level: 2, text: html, id: id || undefined });
                debugInfo.headingCount++;
                addLog('fallback_section_h2_pushed', { childIndex: childIdx, textPreview: text.substring(0, 80) });
              } else if (text.length > 0) {
                addLog('fallback_section_h2_empty_clean', { childIndex: childIdx, rawLen: text.length, rawPreview: text.substring(0, 60) });
              }
            } else {
              const sectionBodyChildren = Array.from(child.children).filter(isElementVisible);
              addLog('fallback_section_body', { childIndex: childIdx, bodyChildrenCount: sectionBodyChildren.length, bodyTags: sectionBodyChildren.map(e => e.tagName.toLowerCase()) });
              fallbackDetail.sectionBodySummary.push({ childIndex: childIdx, bodyChildrenCount: sectionBodyChildren.length, bodyTags: sectionBodyChildren.map(el => el.tagName.toLowerCase()) });
              for (const el of sectionBodyChildren) {
                if (shouldExclude(el)) { addLog('fallback_body_child_skip', { parentIdx: childIdx, tag: el.tagName.toLowerCase(), reason: 'shouldExclude' }); continue; }
                const elTag = el.tagName.toLowerCase();
                if (elTag === 'p' || elTag === 'ul' || elTag === 'ol') {
                  addLog('fallback_body_child', { parentIdx: childIdx, decision: 'processElement', tag: elTag });
                  processElement(el);
                } else if (elTag === 'div') {
                  const divText = (el.textContent || '').trim();
                  const divHasList = el.querySelector('ul, ol');
                  if (!divHasList && divText.length > 0 && divText.length <= 120) {
                    const divHtml = getFormattedHtml(el);
                    if (divHtml.trim()) { content.push({ type: 'heading', level: 3, text: divHtml, id: getAnchorId(el) || undefined }); addLog('fallback_body_child', { parentIdx: childIdx, decision: 'h3', tag: elTag, textPreview: divText.substring(0, 60) }); }
                  } else if (divText.length > 0 && !divHasList) {
                    const divHtml = getFormattedHtml(el);
                    if (divHtml.trim()) { content.push({ type: 'paragraph', text: divHtml, id: getAnchorId(el) || undefined }); addLog('fallback_body_child', { parentIdx: childIdx, decision: 'paragraph', tag: elTag }); }
                  } else if (divHasList) {
                    const nested = Array.from(el.children).filter(isElementVisible);
                    addLog('fallback_body_child', { parentIdx: childIdx, decision: 'nested_list', tag: elTag, nestedCount: nested.length });
                    if (nested.length === 0) addLog('fallback_body_child_div_list_no_children', { parentIdx: childIdx, textPreview: divText.substring(0, 50) });
                    for (const n of nested) { if (!shouldExclude(n)) processElement(n); }
                  } else {
                    const nested = Array.from(el.children).filter(isElementVisible);
                    addLog('fallback_body_child', { parentIdx: childIdx, decision: 'div_other_recurse', tag: elTag, divTextLen: divText.length, nestedCount: nested.length });
                    for (const n of nested) { if (!shouldExclude(n)) processElement(n); }
                  }
                } else {
                  addLog('fallback_body_child', { parentIdx: childIdx, decision: 'other_tag_processElement', tag: elTag, textPreview: (el.textContent || '').trim().substring(0, 50) });
                  processElement(el);
                }
              }
            }
          } else {
            addLog('fallback_non_div_child', { childIndex: childIdx, tag });
            processElement(child);
          }
        }
      } else {
        extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'process all children recursively', reason: 'No content elements found or content selector matches container' });
        const candidateElements = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table'));
        const visibleElements = candidateElements.filter(isElementVisible);
        visibleElements.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });
        addLog('fallback_recursive_candidates', { total: candidateElements.length, visible: visibleElements.length });
        for (let i = 0; i < Math.min(visibleElements.length, 50); i++) {
          const el = visibleElements[i];
          addLog('fallback_recursive_el', { index: i, tag: el.tagName.toLowerCase(), id: el.id || null, textPreview: (el.textContent && el.textContent.trim().substring(0, 50)) || '' });
        }
        const tagCounts = { h1: 0, h2: 0, h3: 0, p: 0, ul: 0, ol: 0, div: 0, other: 0 };
        for (const el of visibleElements) {
          const t = el.tagName.toLowerCase();
          if (tagCounts[t] !== undefined) tagCounts[t]++;
          else tagCounts.other++;
        }
        fallbackDetail.recursiveTagCounts = tagCounts;
        fallbackDetail.recursiveCandidateCount = candidateElements.length;
        fallbackDetail.recursiveVisibleCount = visibleElements.length;
        fallbackDetail.recursiveFirstElements = visibleElements.slice(0, 15).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null, textPreview: (el.textContent && el.textContent.trim().substring(0, 50)) || '' }));
        for (const el of visibleElements) {
          if (shouldExclude(el)) continue;
          processElement(el);
        }
      }
      fallbackDetail.contentLengthAfterFallback = content.length;
      fallbackDetail.headingCountAfterFallback = debugInfo.headingCount;
      const contentByTypeEnd = {};
      for (const item of content) {
        const t = item.type || 'unknown';
        contentByTypeEnd[t] = (contentByTypeEnd[t] || 0) + 1;
      }
      fallbackDetail.contentByType = contentByTypeEnd;
      extractionDebug.fallbackDetail = fallbackDetail;
      addLog('fallback_end', { contentLength: content.length, headingCount: debugInfo.headingCount, useSectionAware, contentByType: contentByTypeEnd });
    }
  } else {
    extractionDebug.strategiesUsed.push({ strategy: 'error', reason: 'No container found' });
  }
  
  // Add extraction debug and full step log to debugInfo (for clipaible-logs)
  debugInfo.extractionDebug = extractionDebug;
  debugInfo.extractionLog = extractionLog;
  
  // If subtitle wasn't inserted yet, ensure title is in content and insert subtitle after it
  // CRITICAL: Title (h1) might be outside article, so it won't be processed
  // We need to add it to content if it's missing, but ONLY if it's not already there
  if (subtitleToInsert) {
    // Store debug info
    subtitleDebug.totalContentItemsBeforeInsert = content.length;
    subtitleDebug.elementsProcessedBeforeFirstHeading = debugInfo.elementsProcessed;
    
    // Store content state before insertion for debugging
    subtitleDebug.contentBeforeInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
    
    // Find the first heading in content
    let firstHeadingIndex = -1;
    let titleInContent = false;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i].type === 'heading') {
        firstHeadingIndex = i;
        subtitleDebug.firstHeadingFound = true;
        subtitleDebug.firstHeadingIndex = i;
        subtitleDebug.firstHeadingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
        // Check if this heading matches article title
        if (articleTitle) {
          const headingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
          if (headingText === articleTitle || headingText.toLowerCase() === articleTitle.toLowerCase()) {
            titleInContent = true;
            subtitleDebug.titleInContent = true;
          }
        }
        break;
      }
    }
    
    // If no heading found AND title is not in content, add title at the beginning
    // This handles case when title is outside article and not processed
    if (firstHeadingIndex === -1 && articleTitle && !titleInContent) {
      // Double-check: search entire content for title text to avoid duplicates
      let titleExists = false;
      for (let i = 0; i < content.length; i++) {
        const itemText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
        if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
          titleExists = true;
          break;
        }
      }
      
      // Only add title if it doesn't exist anywhere in content
      if (!titleExists) {
        const titleItem = { type: 'heading', level: 1, text: articleTitle, id: 'article-title' };
        content.unshift(titleItem);
        firstHeadingIndex = 0;
        subtitleDebug.titleAdded = true;
        subtitleDebug.firstHeadingIndex = 0;
        subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
        subtitleDebug.titleInContent = true;
      } else {
        subtitleDebug.titleInContent = true;
        // Title exists but might not be a heading - find its position
        for (let i = 0; i < content.length; i++) {
          const item = content[i];
          const itemText = ('text' in item && item.text ? String(item.text) : '').replace(/<[^>]+>/g, '').trim();
          if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
            if (item.type === 'heading') {
              firstHeadingIndex = i;
              subtitleDebug.firstHeadingIndex = i;
              subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
            }
            break;
          }
        }
      }
    }
    
    // Insert subtitle right after first heading (or at beginning if no heading)
    if (firstHeadingIndex >= 0 && subtitleToInsert) {
      content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
    } else if (subtitleToInsert) {
      // No heading found, insert at the beginning
      // unshift accepts ContentItem[] which includes subtitle items (subtitle is a valid ContentItem type)
      content.unshift(subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = 0;
    }
    subtitleToInsert = null;
    
    // Store content state after insertion for debugging
    subtitleDebug.contentAfterInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
  }
  
  // Extract hero image if selector provided
  // CRITICAL: Do this AFTER title/subtitle insertion so heroImage appears after them
  // Hero image should be added at the beginning of content (after title/subtitle if they exist)
  if (selectors.heroImage) {
    try {
      const heroImgEl = document.querySelector(selectors.heroImage);
      if (heroImgEl) {
        // CRITICAL: If element is not an IMG, find IMG inside it
        let imgElement = heroImgEl;
        if (heroImgEl.tagName?.toLowerCase() !== 'img') {
          const innerImg = heroImgEl.querySelector('img');
          if (innerImg) {
            imgElement = innerImg;
          } else {
            // If no img found, try to extract image URL from element itself (e.g., background-image)
            // But for now, skip if no img element found
            imgElement = null;
          }
        }
        
        if (imgElement && imgElement.tagName?.toLowerCase() === 'img') {
          let heroSrc = extractBestImageUrl(imgElement);
          heroSrc = toAbsoluteUrl(heroSrc);
          const ns = normalizeImageUrl(heroSrc);
          if (heroSrc && !isTrackingPixelOrSpacer(imgElement, heroSrc) && !isPlaceholderUrl(heroSrc) && !isSmallOrAvatarImage(imgElement, heroSrc) && !addedImageUrls.has(ns)) {
            // Find position after title/subtitle (they're at the beginning after unshift)
            // If subtitle exists, insert after it; if only title exists, insert after title; otherwise at position 0
            let insertIndex = 0;
            for (let i = 0; i < content.length; i++) {
              if (content[i].type === 'subtitle') {
                insertIndex = i + 1;
                break;
              } else if (content[i].type === 'heading' && content[i].level === 1 && insertIndex === 0) {
                insertIndex = i + 1;
              }
            }
            const imageItem = /** @type {ContentItem} */ ({ type: 'image', url: heroSrc, src: heroSrc, alt: (imgElement instanceof HTMLImageElement ? imgElement.alt : '') || '', id: getAnchorId(imgElement) });
            content.splice(insertIndex, 0, imageItem);
            addedImageUrls.add(ns);
          }
        }
      }
    } catch (e) {
    }
  }
  
  // Add subtitle debug info to debug object
  if (subtitleToInsert || subtitleDebug.subtitleFound) {
    debugInfo.subtitleDebug = subtitleDebug;
  }
  
  // CRITICAL: Always return a result object, even if empty
  // This ensures chrome.scripting.executeScript always gets a valid result
  const result = { 
    title: articleTitle || '', 
    author: articleAuthor || '', 
    content: content || [], 
    publishDate: publishDate || '', 
    debug: debugInfo 
  };
  
  // Validate result before returning
  if (!result.content || !Array.isArray(result.content)) {
    result.content = [];
  }
  
  return result;
}
