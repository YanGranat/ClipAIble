// @ts-check
// Message handler router
// Routes incoming messages to appropriate handlers

import { log, logWarn, logError } from '../utils/logging.js';
import { updateState, getProcessingState } from '../state/processing.js';
import { handleError } from '../utils/error-handler.js';
import { isValidMessageSize } from '../utils/security/security.js';

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
  handleGeneratePdfDebugger
} from './processing.js';

// Video handlers
import {
  handleYoutubeSubtitlesResult,
  handleExtractYouTubeSubtitlesForSummary
} from './video.js';

// Complex handlers
import {
  handleExtractContentOnly,
  handleGenerateSummary,
  handleLogModelDropdown
} from './complex.js';

// Offscreen handlers
import { closeOffscreenForVoiceSwitch } from '../api/offline-tts-offscreen.js';

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
  'processArticle', 'generatePdfDebugger',
  // Video handlers
  'youtubeSubtitlesResult', 'extractYouTubeSubtitlesForSummary',
  // Complex handlers
  'extractContentOnly', 'generateSummary', 'logModelDropdown',
  // TTS Progress
  'TTS_PROGRESS',
  // Log export
  'exportLogs',
  // Offscreen handlers
  'closeOffscreenForVoiceSwitch'
];

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
    if (data.contentWidth !== undefined && typeof data.contentWidth !== 'number') {
      return { valid: false, error: 'generatePdfDebugger.data.contentWidth must be a number' };
    }
    if (data.contentHeight !== undefined && typeof data.contentHeight !== 'number') {
      return { valid: false, error: 'generatePdfDebugger.data.contentHeight must be a number' };
    }
  }
  
  return { valid: true };
}

export function routeMessage(request, sender, sendResponse, deps) {
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
  const safeSendResponse = (response) => {
    if (!responseSent) {
      try {
        sendResponse(response);
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
  
  // SECURITY: Validate message structure before processing
  if (!validateMessageStructure(request)) {
    logError('Invalid message structure rejected', { 
      requestKeys: request ? Object.keys(request) : [],
      requestType: typeof request
    });
    safeSendResponse({ success: false, error: 'Invalid message structure' });
    return true;
  }
  
  // SECURITY: Validate message size to prevent DoS attacks
  if (!isValidMessageSize(request)) {
    logError('Message too large rejected', { 
      action: request.action,
      messageSize: JSON.stringify(request).length
    });
    safeSendResponse({ success: false, error: 'Message too large' });
    return true;
  }
  
  // SECURITY: Validate message parameters for critical actions (runtime type checking)
  const criticalActions = ['processArticle', 'extractContentOnly', 'generateSummary', 'generatePdfDebugger'];
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
  
  // Route to appropriate handler based on action
  const handlers = {
    // Simple handlers
    'log': () => {
      // Special handling for critical logs from offscreen documents
      // CRITICAL: These logs are sent from offscreen documents via chrome.runtime.sendMessage
      // They are ALWAYS visible in background service worker console, even if offscreen console is not open
      if (request.data?.level === 'critical') {
        const { message, marker, data, timestamp, source } = request.data;
        const logMessage = `[CRITICAL_LOG${marker ? ` ${marker}` : ''}] ${message}`;
        
        // Log to background console (ALWAYS VISIBLE)
        // Use console.error for maximum visibility (red color, always shown)
        console.error(logMessage, data || '');
        
        // Also use standard log function (with prefix and timestamp)
        log(logMessage, {
          marker,
          data,
          timestamp,
          source: source || 'offscreen',
          senderUrl: sender.url
        });
        
        // Also use console.warn and console.log for redundancy
        console.warn(logMessage, data || '');
        console.log(logMessage, data || '');
      }
      return handleLog(request, sender, sendResponse);
    },
    'logBatch': () => {
      // Handle batched logs from offscreen documents
      // This avoids Chrome's ~1000 message limit by sending multiple logs in one message
      if (request.data?.level === 'critical' && Array.isArray(request.data.logs)) {
        const { logs, batchSize, totalQueued } = request.data;
        
        // Process each log in the batch
        for (const logEntry of logs) {
          const { message, marker, data, timestamp, source } = logEntry;
          const logMessage = `[CRITICAL_LOG${marker ? ` ${marker}` : ''}] ${message}`;
          
          // Add to unlimited log collection (bypasses Chrome console limit)
          // Access global allLogsCollection from background.js via deps
          if (deps?.addLogToCollection) {
            deps.addLogToCollection(logMessage, {
              marker,
              data,
              timestamp,
              source: source || 'offscreen',
              senderUrl: sender.url
            }, 'error');
          }
          
          // Log to background console (ALWAYS VISIBLE)
          console.error(logMessage, data || '');
          
          // Also use standard log function (with prefix and timestamp)
          log(logMessage, {
            marker,
            data,
            timestamp,
            source: source || 'offscreen',
            senderUrl: sender.url
          });
        }
        
        // Log batch summary
        if (batchSize > 1) {
          log(`[CRITICAL_LOG_BATCH] Processed ${batchSize} logs, ${totalQueued || 0} remaining in queue`, {
            batchSize,
            totalQueued,
            source: 'offscreen'
          });
        }
      }
      sendResponse({ success: true });
      return true;
    },
    'logError': () => handleLogError(request, sender, sendResponse),
    'logFromPrintPage': () => {
      const { message, data } = request.data || {};
      if (message) {
        log(`[Print Page] ${message}`, data || null);
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
    
    // Video handlers
    'youtubeSubtitlesResult': () => handleYoutubeSubtitlesResult(request, sender, sendResponse),
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
    'logModelDropdown': () => handleLogModelDropdown(request, sender, sendResponse),
    
    // TTS Progress handler (from offscreen.js)
    'TTS_PROGRESS': () => {
      try {
        const { sentenceIndex, totalSentences, progressBase = 60, progressRange = 35 } = request.data || {};
        
        // Log only every 5th progress update to reduce log spam
        if (sentenceIndex % 5 === 0 || sentenceIndex === totalSentences) {
          log('[ClipAIble] TTS_PROGRESS handler called', {
            sentenceIndex,
            totalSentences,
            progressBase,
            progressRange
          });
        }
        
        if (sentenceIndex && totalSentences) {
          if (totalSentences === 1) {
            // Single sentence - set progress to 90% immediately
            updateState({
              status: 'Generating audio... (1/1 sentences)',
              progress: 90 // Set to 90% for single sentence
            });
          } else if (totalSentences > 1) {
            // Multiple sentences - calculate progress: 60-95% range for TTS conversion
            const estimatedProgress = progressBase + Math.floor(
              ((sentenceIndex - 1) / totalSentences) * progressRange
            );
            
            // Log progress only every 5th update to reduce log spam
            if (sentenceIndex % 5 === 0 || sentenceIndex === totalSentences) {
              log('[ClipAIble] Updating progress state', {
                sentenceIndex,
                totalSentences,
                estimatedProgress,
                cappedProgress: Math.min(estimatedProgress, 94)
              });
            }
            
            // Update state with progress (updateState is imported at top of file)
            updateState({
              status: `Generating audio... (${sentenceIndex}/${totalSentences} sentences)`,
              progress: Math.min(estimatedProgress, 94) // Cap at 94% to leave room for final update
            });
          }
        } else {
          logWarn('[ClipAIble] TTS_PROGRESS handler: invalid data', {
            sentenceIndex,
            totalSentences,
            hasSentenceIndex: !!sentenceIndex,
            hasTotalSentences: !!totalSentences
          });
        }
        
        sendResponse({ success: true });
        return true;
      } catch (error) {
        logWarn('[ClipAIble] Error handling TTS_PROGRESS', error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    },
    
    // Log export handler
    'exportLogs': async () => {
      log('[ClipAIble] === exportLogs handler ===', {
        timestamp: Date.now()
      });
      
      try {
        if (deps?.exportAllLogsToFile) {
          await deps.exportAllLogsToFile();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'exportAllLogsToFile not available' });
        }
        return true;
      } catch (error) {
        logError('[ClipAIble] Failed to export logs', {
          error: error.message,
          timestamp: Date.now()
        });
        sendResponse({ success: false, error: error.message });
        return true;
      }
    },
    
    // Offscreen handlers
    'closeOffscreenForVoiceSwitch': async () => {
      log('[ClipAIble] === closeOffscreenForVoiceSwitch handler ===', {
        previousVoice: request.data?.previousVoice,
        newVoice: request.data?.newVoice,
        messageId: request.data?.messageId,
        timestamp: Date.now()
      });
      
      try {
        const closed = await closeOffscreenForVoiceSwitch();
        sendResponse({ success: closed });
        return true;
      } catch (error) {
        logError('[ClipAIble] Failed to close offscreen for voice switch', {
          error: error.message,
          timestamp: Date.now()
        });
        sendResponse({ success: false, error: error.message });
        return true;
      }
    }
  };
  
  // Special case: youtubeSubtitlesResult can also come with type check
  // @ts-ignore - request may have type property
  if ((request.action === 'youtubeSubtitlesResult' || 
       (request.type === 'ClipAIbleYouTubeSubtitles' && request.action === 'youtubeSubtitlesResult')) &&
      handlers['youtubeSubtitlesResult']) {
    return handlers['youtubeSubtitlesResult']();
  }
  
  // CRITICAL: Prevent concurrent processArticle requests
  // Check if processing is already in progress for processArticle action
  if (request.action === 'processArticle') {
    const currentState = getProcessingState();
    if (currentState.isProcessing) {
      logWarn('=== routeMessage: processArticle rejected - already processing ===', {
        action: request.action,
        currentStatus: currentState.status,
        timestamp: Date.now()
      });
      safeSendResponse({ error: 'Processing already in progress' });
      return true;
    }
  }
  
  // Get handler for action
  const handler = handlers[request.action];
  
  // Skip verbose logging for frequent operations (already defined above)
  
  if (handler) {
    try {
      const result = handler();
      
      // If handler returns a promise, Chrome will wait for it
      // If handler returns true, it means async response will be sent
      return result;
    } catch (error) {
      // Normalize error with context for better logging and error tracking
      (async () => {
        try {
          const normalized = await handleError(error, {
            source: 'messageRouter',
            errorType: 'handlerSyncError',
            logError: true,
            createUserMessage: true, // Use centralized user-friendly message
            context: {
              operation: 'routeMessage',
              action: request.action,
              errorName: error?.name,
              errorStack: error?.stack
            }
          });
          
          // Try to send normalized error response
          safeSendResponse({ 
            error: error.message || normalized.message,
            errorCode: normalized.code
          });
        } catch (normalizationError) {
          // Fallback if normalization fails
          logError('=== routeMessage: Error normalization failed ===', {
            normalizationError: normalizationError?.message,
            originalError: error?.message
          });
          safeSendResponse({ error: error.message });
        }
      })().catch(error => {
        // Additional protection: catch any unhandled errors in error handler IIFE
        logError('=== routeMessage: Unhandled error in error handler IIFE ===', {
          error: error?.message || String(error),
          errorStack: error?.stack,
          originalAction: request.action
        });
      });
      
      return true;
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


