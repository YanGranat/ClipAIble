// @ts-check
// Message handler router
// Routes incoming messages to appropriate handlers

import { log, logWarn, logError, sanitizeLogData, shouldLogDiagnostic } from '../utils/logging.js';
import { updateState, getProcessingState, isCancelled } from '../state/processing.js';
import { readTtsProgress } from '../state/processing-messages.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { isValidMessageSize } from '../utils/security/security.js';
import { isTrustedExtensionSender, isYouTubeContentSender } from '../utils/security/message-sender.js';
import { tSync } from '../locales.js';

// Simple handlers
import {
  handleLog,
  handleLogError,
  handlePing,
  handleGetState,
  handleCancelProcessing
} from './simple.js';

// Stats handlers
import {
  handleGetStats,
  handleClearStats,
  handleDeleteHistoryItem
} from './stats.js';

// Cache handlers
import {
  handleGetCacheStats,
  handleClearSelectorCache,
  handleDeleteDomainFromCache
} from './cache.js';

// Settings handlers
import {
  handleExportSettings,
  handleImportSettings
} from './settings.js';

// Processing handlers
import {
  handleProcessArticle,
  handleGeneratePdfDebugger,
  handlePrintJobFailed
} from './processing.js';

// Video handlers
import { handleExtractYouTubeSubtitlesForSummary } from './video.js';

// Complex handlers
import {
  handleExtractContentOnly,
  handleGenerateSummary,
  handleGenerateKeyTheses
} from './complex.js';

import { requestCancelKeyThesesGeneration } from './key-theses.js';

/**
 * Route message to appropriate handler
 * @param {import('../types.js').MessageRequest} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @param {import('../types.js').MessageHandlerDeps} deps - Dependencies (functions from background.js)
 * @returns {boolean|Promise<boolean>} - Return value for message handler
 */
/**
 * Whitelist of valid message actions for security
 * Only actions in this list are allowed to be processed
 * @readonly
 * @const {Array<string>}
 */
const VALID_ACTIONS = [
  // Simple handlers
  'log', 'logBatch', 'logError', 'logFromPrintPage', 'logSetting',
  'ping', 'getState', 'cancelProcessing',
  // Stats handlers
  'getStats', 'clearStats', 'deleteHistoryItem',
  // Cache handlers
  'getCacheStats', 'clearSelectorCache', 'deleteDomainFromCache',
  // Settings handlers
  'exportSettings', 'importSettings',
  // Processing handlers
  'processArticle', 'generatePdfDebugger', 'printJobFailed',
  // Video handlers
  'extractYouTubeSubtitlesForSummary',
  // Complex handlers
  'extractContentOnly', 'generateSummary', 'generateKeyTheses', 'cancelKeyThesesGeneration',
  // TTS Progress
  'TTS_PROGRESS'
];

/**
 * Validate message sender origin for privileged actions
 * @param {any} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @returns {boolean} True if sender is trusted for this action
 */
function validateMessageOrigin(request, sender) {
  if (isTrustedExtensionSender(sender)) return true;
  return request.action === 'logError' && isYouTubeContentSender(sender);
}

/**
 * Validate message structure for security
 * @param {any} request - Request object to validate
 * @returns {boolean} True if message structure is valid
 * @throws {Error} If message structure is invalid (logged as warning, not thrown)
 */
function validateMessageStructure(request) {
  // Basic validation: request must be an object
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    logWarn('Invalid message: not an object', { requestType: typeof request });
    return false;
  }
  
  // Messages with target: 'offscreen' are allowed to pass through without action check
  if (request.target === 'offscreen') {
    // Offscreen messages may have different structure, allow them
    return true;
  }
  
  // Action is required for most messages
  if (!request.action || typeof request.action !== 'string') {
    logWarn('Invalid message: missing or invalid action', { 
      hasAction: !!request.action,
      actionType: typeof request.action,
      requestKeys: Object.keys(request)
    });
    return false;
  }
  
  // SECURITY: Validate action is in whitelist
  if (!VALID_ACTIONS.includes(request.action)) {
    logWarn('Invalid message: action not in whitelist', { 
      action: request.action,
      validActions: VALID_ACTIONS.length
    });
    return false;
  }
  
  // Validate data is object if present (not array or primitive)
  if (request.data !== undefined && (typeof request.data !== 'object' || Array.isArray(request.data))) {
    // Allow null data for some actions
    if (request.data !== null) {
      logWarn('Invalid message: data must be object', { 
        dataType: typeof request.data,
        isArray: Array.isArray(request.data),
        action: request.action
      });
      return false;
    }
  }
  
  return true;
}

/**
 * Validate message parameters for critical actions (runtime type checking)
 * @param {any} request - Request object to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateMessageParams(request) {
  const { action, data } = request;
  
  // Only validate critical actions that handle sensitive data or perform important operations
  if (action === 'processArticle') {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'processArticle requires data object' };
    }
    
    // Validate required fields and their types
    if (data.url !== undefined && typeof data.url !== 'string') {
      return { valid: false, error: 'processArticle.data.url must be a string' };
    }
    if (data.apiKey !== undefined && typeof data.apiKey !== 'string') {
      return { valid: false, error: 'processArticle.data.apiKey must be a string' };
    }
    if (data.model !== undefined && typeof data.model !== 'string') {
      return { valid: false, error: 'processArticle.data.model must be a string' };
    }
    if (data.outputFormat !== undefined && typeof data.outputFormat !== 'string') {
      return { valid: false, error: 'processArticle.data.outputFormat must be a string' };
    }
    if (data.mode !== undefined && typeof data.mode !== 'string') {
      return { valid: false, error: 'processArticle.data.mode must be a string' };
    }
    if (data.tabId !== undefined && typeof data.tabId !== 'number') {
      return { valid: false, error: 'processArticle.data.tabId must be a number' };
    }
    if (data.html !== undefined && typeof data.html !== 'string') {
      return { valid: false, error: 'processArticle.data.html must be a string' };
    }
    if (data.generateToc !== undefined && typeof data.generateToc !== 'boolean') {
      return { valid: false, error: 'processArticle.data.generateToc must be a boolean' };
    }
    if (data.generateAbstract !== undefined && typeof data.generateAbstract !== 'boolean') {
      return { valid: false, error: 'processArticle.data.generateAbstract must be a boolean' };
    }
    if (data.translateImages !== undefined && typeof data.translateImages !== 'boolean') {
      return { valid: false, error: 'processArticle.data.translateImages must be a boolean' };
    }
  }
  
  if (action === 'extractContentOnly') {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'extractContentOnly requires data object' };
    }
    
    // Validate required fields and their types
    if (data.url !== undefined && typeof data.url !== 'string') {
      return { valid: false, error: 'extractContentOnly.data.url must be a string' };
    }
    if (data.apiKey !== undefined && typeof data.apiKey !== 'string') {
      return { valid: false, error: 'extractContentOnly.data.apiKey must be a string' };
    }
    if (data.model !== undefined && typeof data.model !== 'string') {
      return { valid: false, error: 'extractContentOnly.data.model must be a string' };
    }
    if (data.mode !== undefined && typeof data.mode !== 'string') {
      return { valid: false, error: 'extractContentOnly.data.mode must be a string' };
    }
    if (data.html !== undefined && typeof data.html !== 'string') {
      return { valid: false, error: 'extractContentOnly.data.html must be a string' };
    }
    if (data.tabId !== undefined && typeof data.tabId !== 'number') {
      return { valid: false, error: 'extractContentOnly.data.tabId must be a number' };
    }
    if (data.autoGenerateSummary !== undefined && typeof data.autoGenerateSummary !== 'boolean') {
      return { valid: false, error: 'extractContentOnly.data.autoGenerateSummary must be a boolean' };
    }
  }
  
  if (action === 'generateSummary') {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'generateSummary requires data object' };
    }
    
    // Validate required fields and their types
    if (data.url !== undefined && typeof data.url !== 'string') {
      return { valid: false, error: 'generateSummary.data.url must be a string' };
    }
    if (data.apiKey !== undefined && typeof data.apiKey !== 'string') {
      return { valid: false, error: 'generateSummary.data.apiKey must be a string' };
    }
    if (data.model !== undefined && typeof data.model !== 'string') {
      return { valid: false, error: 'generateSummary.data.model must be a string' };
    }
    if (data.content !== undefined && typeof data.content !== 'string') {
      return { valid: false, error: 'generateSummary.data.content must be a string' };
    }
  }

  if (action === 'generateKeyTheses') {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'generateKeyTheses requires data object' };
    }
    if (data.url !== undefined && typeof data.url !== 'string') {
      return { valid: false, error: 'generateKeyTheses.data.url must be a string' };
    }
    if (data.apiKey !== undefined && typeof data.apiKey !== 'string') {
      return { valid: false, error: 'generateKeyTheses.data.apiKey must be a string' };
    }
    if (data.model !== undefined && typeof data.model !== 'string') {
      return { valid: false, error: 'generateKeyTheses.data.model must be a string' };
    }
    if (data.content !== undefined && typeof data.content !== 'string') {
      return { valid: false, error: 'generateKeyTheses.data.content must be a string' };
    }
  }

  if (action === 'generatePdfDebugger') {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'generatePdfDebugger requires data object' };
    }
    
    // Validate required fields and their types
    if (data.title !== undefined && typeof data.title !== 'string') {
      return { valid: false, error: 'generatePdfDebugger.data.title must be a string' };
    }
    if (data.pageMode !== undefined && typeof data.pageMode !== 'string') {
      return { valid: false, error: 'generatePdfDebugger.data.pageMode must be a string' };
    }
  }
  if (action === 'printJobFailed' && (!data || typeof data.error !== 'string' || typeof data.printJobId !== 'string' ||
      (data.processingRunId !== undefined && typeof data.processingRunId !== 'string'))) {
    return { valid: false, error: 'printJobFailed requires a printJobId and error strings' };
  }
  
  return { valid: true };
}

export function routeMessage(request, sender, sendResponse, deps) {
  if (request?.target === 'offscreen' || request?.target === 'pdf-progress' ||
      request?.action === 'youtubeSubtitlesResult' || request?.type === 'ClipAIbleYouTubeSubtitles') return false;
  const {
    startArticleProcessing,
    processWithSelectorMode,
    processWithExtractMode,
    processWithoutAI,
    stopKeepAlive,
    startKeepAlive
  } = deps;
  
  // CRITICAL: Prevent double sendResponse calls
  let responseSent = false;
  const originalSendResponse = sendResponse;
  const safeSendResponse = (response) => {
    if (!responseSent) {
      try {
        originalSendResponse(response);
        responseSent = true;
      } catch (sendError) {
        // Ignore if already sent or channel closed
        logWarn('Failed to send response (may be already sent)', {
          sendError: sendError?.message,
          action: request.action
        });
      }
    }
  };
  sendResponse = safeSendResponse;

  function handleRouterError(error, errorType) {
    (async () => {
      try {
        const normalized = await handleError(error, {
          source: 'messageRouter', errorType, logError: true, createUserMessage: true,
          context: { operation: 'routeMessage', action: request.action, errorName: error?.name, errorStack: error?.stack }
        });
        safeSendResponse({ error: error?.message || normalized.message, errorCode: normalized.code, ...getErrorTranslation(normalized) });
      } catch (normalizationError) {
        logError('Message error normalization failed', normalizationError);
        safeSendResponse({ error: error?.message || 'Message handling failed', ...getErrorTranslation(error) });
      }
    })().catch((handlingError) => logError('Message error handling failed', handlingError));
    return true;
  }
  
  // SECURITY: Validate message structure before processing
  if (!validateMessageStructure(request)) {
    logError('Invalid message structure rejected', {
      requestKeys: request ? Object.keys(request) : [],
      requestType: typeof request
    });
    safeSendResponse({ success: false, error: 'Invalid message structure' });
    return true;
  }

  // SECURITY: Validate sender origin for privileged actions
  if (!validateMessageOrigin(request, sender)) {
    logError('Invalid message origin rejected', {
      action: request.action,
      senderId: sender.id,
      senderUrl: sender.url
    });
    safeSendResponse({ success: false, error: 'Invalid sender origin' });
    return true;
  }
  
  // SECURITY: Validate message size to prevent DoS attacks
  if (!isValidMessageSize(request)) {
    logError('Message too large rejected', { 
      action: request.action,
      messageSize: JSON.stringify(request).length
    });
    safeSendResponse({ success: false, error: tSync('errorMessageTooLarge', 'en'),
      translationKey: 'errorMessageTooLarge', translationParams: {} });
    return true;
  }
  
  // SECURITY: Validate message parameters for critical actions (runtime type checking)
  const criticalActions = ['processArticle', 'extractContentOnly', 'generateSummary', 'generateKeyTheses', 'generatePdfDebugger', 'printJobFailed'];
  if (criticalActions.includes(request.action)) {
    const paramValidation = validateMessageParams(request);
    if (!paramValidation.valid) {
      logError('Invalid message parameters rejected', { 
        action: request.action,
        error: paramValidation.error,
        dataKeys: request.data ? Object.keys(request.data) : []
      });
      safeSendResponse({ success: false, error: paramValidation.error || 'Invalid message parameters' });
      return true;
    }
  }
  
  // Skip verbose logging for frequent operations
  if (deps.ensureInitialization) {
    const { ensureInitialization, ...readyDeps } = deps;
    const retry = ['processArticle', 'extractContentOnly', 'generateSummary', 'generateKeyTheses',
      'cancelProcessing', 'cancelKeyThesesGeneration', 'importSettings', 'exportSettings',
      'clearStats', 'deleteHistoryItem', 'clearSelectorCache', 'deleteDomainFromCache'].includes(request.action);
    Promise.resolve().then(() => ensureInitialization(retry))
      .then(() => routeMessage(request, sender, safeSendResponse, readyDeps))
      .catch(error => safeSendResponse({ success: false, error: tSync('errorBackgroundInitializationFailed', 'en'),
        translationKey: 'errorBackgroundInitializationFailed', translationParams: {}, ...getErrorTranslation(error) }));
    return true;
  }

  const frequentActions = ['getState', 'TTS_PROGRESS', 'logSetting'];
  const isFrequentAction = frequentActions.includes(request.action);
  
  // Messages with target: 'offscreen' are meant for offscreen document
  // Don't handle them here - let them pass through to offscreen document's listener
  if (request.target === 'offscreen') {
    if (!isFrequentAction) {
      log('=== Message for offscreen document, passing through ===', {
        type: request.type,
        timestamp: Date.now()
      });
    }
    // Return false to allow message to reach offscreen document
    return false;
  }
  
  function forwardDiagnostic(entry) {
    const level = entry.severity || (entry.level === 'critical' ? 'debug' : entry.level) || 'debug';
    if (!shouldLogDiagnostic(level)) return;
    const data = sanitizeLogData(entry.data);
    const message = `[CRITICAL_LOG${entry.marker ? ` ${entry.marker}` : ''}] ${entry.message}`;
    deps.addLogToCollection?.(message, {
      marker: entry.marker, data, timestamp: entry.timestamp,
      source: entry.source || 'offscreen', senderUrl: sender.url
    }, level);
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug';
    console[consoleMethod](message, data || '');
  }

  // Route to appropriate handler based on action
  const handlers = {
    // Simple handlers
    'log': () => {
      if (request.data?.level === 'critical') {
        forwardDiagnostic(request.data);
        sendResponse({ success: true });
        return true;
      }
      return handleLog(request, sender, sendResponse);
    },
    'logBatch': () => {
      if (request.data?.level === 'critical' && Array.isArray(request.data.logs)) {
        for (const entry of request.data.logs) forwardDiagnostic(entry);
      }
      sendResponse({ success: true });
      return true;
    },
    'logError': () => handleLogError(request, sender, sendResponse),
    'logFromPrintPage': () => {
      const { message, data, level } = request.data || {};
      if (message) {
        if (level === 'error') logError(`[Print Page] ${message}`, sanitizeLogData(data));
        else log(`[Print Page] ${message}`, sanitizeLogData(data));
      }
      sendResponse({ success: true });
      return true;
    },
    'logSetting': () => {
      const { key, value, valueType, timestamp } = request.data || {};
      log('[ClipAIble Background] ===== SETTING CHANGED IN POPUP =====', {
        timestamp: timestamp || Date.now(),
        key,
        value,
        valueType: valueType || typeof value,
        isAudioVoice: key === 'audio_voice' || key === 'audio_voice_map',
        isNumeric: /^\d+$/.test(String(value)),
        isObject: typeof value === 'object' && !Array.isArray(value),
        objectKeys: typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : null,
        source: 'popup'
      });
      sendResponse({ success: true });
      return true;
    },
    'ping': () => handlePing(request, sender, sendResponse),
    'getState': () => handleGetState(request, sender, sendResponse),
    'cancelProcessing': () => handleCancelProcessing(request, sender, sendResponse, stopKeepAlive),
    
    // Stats handlers
    'getStats': () => handleGetStats(request, sender, sendResponse),
    'clearStats': () => handleClearStats(request, sender, sendResponse),
    'deleteHistoryItem': () => handleDeleteHistoryItem(request, sender, sendResponse),
    
    // Cache handlers
    'getCacheStats': () => handleGetCacheStats(request, sender, sendResponse),
    'clearSelectorCache': () => handleClearSelectorCache(request, sender, sendResponse),
    'deleteDomainFromCache': () => handleDeleteDomainFromCache(request, sender, sendResponse),
    
    // Settings handlers
    'exportSettings': () => handleExportSettings(request, sender, sendResponse),
    'importSettings': () => handleImportSettings(request, sender, sendResponse),
    
    // Processing handlers
    'processArticle': () => handleProcessArticle(request, sender, sendResponse, startArticleProcessing, stopKeepAlive),
    'generatePdfDebugger': () => handleGeneratePdfDebugger(request, sender, sendResponse, stopKeepAlive),
    'printJobFailed': () => handlePrintJobFailed(request, sender, sendResponse, stopKeepAlive),
    
    // Video handlers
    'extractYouTubeSubtitlesForSummary': () => handleExtractYouTubeSubtitlesForSummary(request, sender, sendResponse),
    
    // Complex handlers
    'extractContentOnly': () => handleExtractContentOnly(
      request, 
      sender, 
      sendResponse, 
      processWithSelectorMode, 
      processWithExtractMode,
      processWithoutAI,
      startKeepAlive,
      stopKeepAlive
    ),
    'generateSummary': () => handleGenerateSummary(request, sender, sendResponse, startKeepAlive, stopKeepAlive),
    'generateKeyTheses': () => handleGenerateKeyTheses(request, sender, sendResponse, startKeepAlive, stopKeepAlive),
    'cancelKeyThesesGeneration': () => {
      const result = requestCancelKeyThesesGeneration(request.data?.generationId);
      sendResponse({ ...result, cancelled: !result.ignored });
      return true;
    },
    
    // TTS Progress handler (from offscreen.js)
    'TTS_PROGRESS': () => {
      const update = readTtsProgress(request.data);
      if (!update) {
        sendResponse({ success: false, error: 'Invalid audio progress' });
        return true;
      }
      const { processingRunId, sentenceIndex, totalSentences, progressBase, progressRange } = update;
      const state = getProcessingState();
      const progress = totalSentences === 1 ? 90 :
        Math.min(progressBase + Math.floor((sentenceIndex - 1) / totalSentences * progressRange), 94);
      const statusTranslationKey = 'statusGeneratingAudioChunks';
      const statusTranslationParams = { current: sentenceIndex, total: totalSentences };
      const previous = state.statusTranslationKey === statusTranslationKey ? state.statusTranslationParams : null;
      if (!state.isProcessing || state.outputFormat !== 'audio' || isCancelled(processingRunId) || progress < state.progress ||
          (previous?.total === totalSentences && previous.current >= sentenceIndex)) {
        sendResponse({ success: true, ignored: true });
        return true;
      }
      updateState({ status: tSync(statusTranslationKey, 'en', statusTranslationParams), statusTranslationKey,
        statusTranslationParams, progress }, processingRunId);
      sendResponse({ success: true });
      return true;
    },
    
  };

  // Get handler for action
  const handler = handlers[request.action];

  if (request.action === 'extractContentOnly' || request.action === 'generateKeyTheses') {
    log('[routeMessage] Dispatching to handler', {
      action: request.action,
      autoGenerateSummary: request.data?.autoGenerateSummary,
      contentItemsCount: request.data?.contentItems?.length,
      timestamp: Date.now()
    });
  }

  if (handler) {
    try {
      const result = handler();
      
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch((error) => handleRouterError(error, 'handlerAsyncError'));
        return true;
      }
      return result;
    } catch (error) {
      return handleRouterError(error, 'handlerSyncError');
    }
  }
  
  // Unknown action
  logError('=== routeMessage: Unknown action ===', {
    action: request.action,
    availableActions: Object.keys(handlers),
    timestamp: Date.now()
  });
  logWarn('Unknown action received', { action: request.action });
  safeSendResponse({ error: 'Unknown action' });
  return true;
}


