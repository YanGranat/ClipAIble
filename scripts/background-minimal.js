// @ts-check
// Background service worker for ClipAIble extension
// MINIMAL VERSION - for testing service worker loading

// Import logging utilities first for use in global error handlers
import { log, logError, logWarn, logDebug, LOG_LEVELS } from './utils/logging.js';

// Global error handler for uncaught errors during module loading
self.addEventListener('error', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Uncaught error during module loading', event.error);
      if (event.error?.stack) {
        logError('Error stack', new Error(event.error.stack));
      }
    } else {
      console.error('[ClipAIble] Uncaught error during module loading:', event.error);
      console.error('[ClipAIble] Error stack:', event.error?.stack);
    }
  } catch (loggingError) {
    console.error('[ClipAIble] Uncaught error during module loading:', event.error);
    console.error('[ClipAIble] Error stack:', event.error?.stack);
    console.error('[ClipAIble] Failed to log error:', loggingError);
  }
});

self.addEventListener('unhandledrejection', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Unhandled promise rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
      if (event.reason?.stack) {
        logError('Rejection stack', new Error(event.reason.stack));
      }
    } else {
      console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
      console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    }
  } catch (loggingError) {
    console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
    console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    console.error('[ClipAIble] Failed to log rejection:', loggingError);
  }
});

// Initialize extension - use setTimeout to avoid blocking module loading
setTimeout(() => {
  try {
    log('Extension loaded - MINIMAL MODE');
    log('Service worker started in minimal mode');
  } catch (error) {
    console.error('[ClipAIble] Failed to log (logging system error):', error);
  }
}, 0);

// ============================================
// MESSAGE LISTENER
// ============================================

try {
  log('=== background.js: Registering chrome.runtime.onMessage listener ===', {
    timestamp: Date.now()
  });
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('=== chrome.runtime.onMessage: MESSAGE RECEIVED ===', {
      action: request?.action,
      type: request?.type,
      target: request?.target,
      hasData: !!request?.data,
      senderUrl: sender?.tab?.url || sender?.url || 'popup',
      senderTabId: sender?.tab?.id,
      isOffscreen: sender?.id === chrome.runtime.id && !sender?.tab,
      timestamp: Date.now()
    });
    
    // CRITICAL: Messages with target: 'offscreen' are for offscreen document
    // Service worker must NOT handle them - return false immediately to let them pass through
    if (request.target === 'offscreen') {
      log('[ClipAIble Background] Offscreen message detected, passing through', {
        type: request.type,
        hasData: !!request.data,
        timestamp: Date.now()
      });
      // Return false to allow message to reach offscreen document's listener
      return false;
    }
    
    // TEMPORARY: Minimal message handler for testing
    if (request.action === 'ping') {
      sendResponse({ success: true, message: 'Service worker is running' });
      return true;
    }
    
    // For all other messages, return error that service worker is in minimal mode
    sendResponse({ error: 'Service worker is in minimal mode - functionality disabled' });
    return true;
  });
  
  log('=== background.js: chrome.runtime.onMessage listener registered successfully ===', {
    timestamp: Date.now()
  });
} catch (error) {
  logError('=== background.js: Failed to register runtime.onMessage listener ===', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    timestamp: Date.now()
  });
  logError('Failed to register runtime.onMessage listener', error);
}

