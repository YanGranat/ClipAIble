// Message handler router
// Routes incoming messages to appropriate handlers

import { log, logWarn, logError } from '../utils/logging.js';

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

/**
 * Route message to appropriate handler
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Object} deps - Dependencies (functions from background.js)
 * @returns {boolean|Promise<boolean>} - Return value for message handler
 */
export function routeMessage(request, sender, sendResponse, deps) {
  const {
    startArticleProcessing,
    processWithSelectorMode,
    processWithExtractMode,
    stopKeepAlive,
    startKeepAlive
  } = deps;
  
  log('=== MESSAGE RECEIVED IN SERVICE WORKER ===', { 
    action: request.action, 
    sender: sender.tab?.url || 'popup',
    hasData: !!request.data,
    timestamp: Date.now()
  });
  
  // Route to appropriate handler based on action
  const handlers = {
    // Simple handlers
    'log': () => handleLog(request, sender, sendResponse),
    'logError': () => handleLogError(request, sender, sendResponse),
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
      startKeepAlive,
      stopKeepAlive
    ),
    'generateSummary': () => handleGenerateSummary(request, sender, sendResponse, startKeepAlive, stopKeepAlive),
    'logModelDropdown': () => handleLogModelDropdown(request, sender, sendResponse)
  };
  
  // Special case: youtubeSubtitlesResult can also come with type check
  if ((request.action === 'youtubeSubtitlesResult' || 
       (request.type === 'ClipAIbleYouTubeSubtitles' && request.action === 'youtubeSubtitlesResult')) &&
      handlers['youtubeSubtitlesResult']) {
    return handlers['youtubeSubtitlesResult']();
  }
  
  // Get handler for action
  const handler = handlers[request.action];
  
  if (handler) {
    try {
      return handler();
    } catch (error) {
      logError('Message handler error', error);
      sendResponse({ error: error.message });
      return true;
    }
  }
  
  // Unknown action
  logWarn('Unknown action received', { action: request.action });
  sendResponse({ error: 'Unknown action' });
  return true;
}


