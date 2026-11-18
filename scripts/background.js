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
import { initInitialization, createInitializationGate } from './background/initialization.js';

log('[ClipAIble Background] Importing utils modules', { timestamp: Date.now() });
import { handleError } from './utils/error-handler.js';
import { clearDecryptedKeyCache } from './utils/encryption.js';
import { restoreStateFromStorage, cleanupPdfJobsAfterRestore, initPrintTabLifecycle } from './state/processing.js';
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
  updateState,
  ERROR_CODES,
  PROCESSING_STAGES
} from './state/processing.js';

log('[ClipAIble Background] Importing processing helpers', { timestamp: Date.now() });
import {
  validateAndInitializeProcessing,
  handlePdfPageProcessing,
  handleVideoPageProcessing,
  handleStandardArticleProcessing,
  handleQuickSaveError
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
import { extractAutomaticallyInlined } from './extraction/automatic.js';
import { routeMessage } from './message-handlers/index.js';
import { isSummaryGenerationActive } from './message-handlers/summary.js';
import { isKeyThesesGenerationActive } from './message-handlers/key-theses.js';

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
  saveStateToStorageImmediate,
  isIndependentGenerationActive: () => isSummaryGenerationActive() || isKeyThesesGenerationActive()
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
initPrintTabLifecycle(stopKeepAlive);
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
  cleanupPdfJobsAfterRestore,
  runInitialization,
  startKeepAlive
});
log('[ClipAIble Background] Extension initialization module created', {
  timestamp: Date.now(),
  hasModule: typeof initializationModule === 'function'
});

// Initialize extension
log('[ClipAIble Background] Calling initialization module (main extension init)', { timestamp: Date.now() });
const ensureInitialization = createInitializationGate(initializationModule);
ensureInitialization().catch((error) => logError('Background initialization failed', error));
log('[ClipAIble Background] Extension initialization queued', { timestamp: Date.now() });

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
const { addLogToCollection, initLogCollection } = loggingModule;
log('[ClipAIble Background] Logging functions extracted', {
  timestamp: Date.now(),
  functions: ['addLogToCollection', 'initLogCollection']
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
  handleQuickSave: async (...args) => {
    try {
      await ensureInitialization(true);
    } catch {
      await handleQuickSaveError(Object.assign(new Error('Background initialization failed'), {
        translationKey: 'errorBackgroundInitializationFailed', translationParams: {}
      }), notificationsModule.createNotification);
      return;
    }
    return handleQuickSave(...args);
  }
});

const startArticleProcessingWrapper = async (data) => {
  await ensureInitialization(true);
  return startArticleProcessing(data, extractAutomaticallyInlined);
};
contextMenuModule.initContextMenuListeners(startArticleProcessingWrapper);

// ============================================
// MESSAGE LISTENER
// ============================================

try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.target === 'pdf-progress') return false;
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
    if (request?.target === 'offscreen') {
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
    
    // Create wrapper for processWithSelectorMode that includes extractAutomaticallyInlined
    const processWithSelectorModeWrapper = (data) => processWithSelectorMode(data, extractAutomaticallyInlined);
    
    // Create wrapper for processWithoutAI that includes extractAutomaticallyInlined (for cached selectors support)
    const processWithoutAIWrapper = (data) => processWithoutAI(data, extractAutomaticallyInlined);
    
    // Create wrapper for startArticleProcessing that includes extractAutomaticallyInlined
    const startArticleProcessingWrapperForMessage = (data) => startArticleProcessing(data, extractAutomaticallyInlined);
    
    const result = routeMessage(request, sender, sendResponse, {
      ensureInitialization,
      startArticleProcessing: startArticleProcessingWrapperForMessage,
      processWithSelectorMode: processWithSelectorModeWrapper,
      processWithExtractMode,
      processWithoutAI: processWithoutAIWrapper,
      stopKeepAlive,
      addLogToCollection,
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
