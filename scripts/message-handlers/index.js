// @ts-check
// Message handler router
// Routes incoming messages to appropriate handlers

// @typedef {import('../types.js').MessageRequest} MessageRequest
// @typedef {import('../types.js').MessageResponse} MessageResponse

import { log, logWarn, logError } from '../utils/logging.js';
import { updateState } from '../state/processing.js';

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
 * @param {MessageRequest} request - Request object
 * @param {chrome.runtime.MessageSender} sender - Sender object
 * @param {function(MessageResponse): void} sendResponse - Response function
 * @param {Object} deps - Dependencies (functions from background.js)
 * @returns {boolean|Promise<boolean>} - Return value for message handler
 */
export function routeMessage(request, sender, sendResponse, deps) {
  const {
    startArticleProcessing,
    processWithSelectorMode,
    processWithExtractMode,
    processWithoutAI,
    stopKeepAlive,
    startKeepAlive
  } = deps;
  
  log('=== MESSAGE RECEIVED IN SERVICE WORKER ===', { 
    action: request.action, 
    sender: sender.tab?.url || sender.url || 'popup',
    target: request.target,
    hasData: !!request.data,
    timestamp: Date.now()
  });
  
  // Messages with target: 'offscreen' are meant for offscreen document
  // Don't handle them here - let them pass through to offscreen document's listener
  if (request.target === 'offscreen') {
    log('=== Message for offscreen document, passing through ===', {
      type: request.type,
      timestamp: Date.now()
    });
    // Return false to allow message to reach offscreen document
    return false;
  }
  
  // Route to appropriate handler based on action
  const handlers = {
    // Simple handlers
    'log': () => handleLog(request, sender, sendResponse),
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
        
        log('[ClipAIble] TTS_PROGRESS handler called', {
          sentenceIndex,
          totalSentences,
          progressBase,
          progressRange
        });
        
        if (sentenceIndex && totalSentences && totalSentences > 1) {
          // Calculate progress: 60-95% range for TTS conversion
          const estimatedProgress = progressBase + Math.floor(
            ((sentenceIndex - 1) / totalSentences) * progressRange
          );
          
          log('[ClipAIble] Updating progress state', {
            sentenceIndex,
            totalSentences,
            estimatedProgress,
            cappedProgress: Math.min(estimatedProgress, 94)
          });
          
          // Update state with progress (updateState is imported at top of file)
          updateState({
            status: `Generating audio... (${sentenceIndex}/${totalSentences} sentences)`,
            progress: Math.min(estimatedProgress, 94) // Cap at 94% to leave room for final update
          });
        } else {
          logWarn('[ClipAIble] TTS_PROGRESS handler: invalid data', {
            sentenceIndex,
            totalSentences,
            hasSentenceIndex: !!sentenceIndex,
            hasTotalSentences: !!totalSentences,
            totalSentencesGreaterThanOne: totalSentences > 1
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
  
  // Get handler for action
  const handler = handlers[request.action];
  
  log('=== routeMessage: Looking for handler ===', {
    action: request.action,
    hasHandler: !!handler,
    handlerType: typeof handler,
    availableActions: Object.keys(handlers),
    timestamp: Date.now()
  });
  
  if (handler) {
    try {
      log('=== routeMessage: Calling handler ===', {
        action: request.action,
        timestamp: Date.now()
      });
      
      const result = handler();
      
      log('=== routeMessage: Handler returned ===', {
        action: request.action,
        returnsPromise: result instanceof Promise,
        returnsBoolean: result === true,
        resultType: typeof result,
        timestamp: Date.now()
      });
      
      log('routeMessage: handler called', { action: request.action, returnsPromise: result instanceof Promise, returnsBoolean: result === true });
      
      // If handler returns a promise, Chrome will wait for it
      // If handler returns true, it means async response will be sent
      return result;
    } catch (error) {
      logError('=== routeMessage: Handler threw error ===', {
        action: request.action,
        error: error?.message || String(error),
        errorStack: error?.stack,
        timestamp: Date.now()
      });
      logError('Message handler error', error);
      sendResponse({ error: error.message });
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
  sendResponse({ error: 'Unknown action' });
  return true;
}


