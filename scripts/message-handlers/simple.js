// Simple message handlers (synchronous or very simple async)
// Handlers: log, logError, ping, getState, cancelProcessing

import { log, logError, logWarn } from '../utils/logging.js';
import { getProcessingState } from '../state/processing.js';
import { cancelProcessing } from '../state/processing.js';

/**
 * Handle log messages from popup
 */
export function handleLog(request, sender, sendResponse) {
  sendResponse({ success: true });
  return true;
}

/**
 * Handle error logging from popup
 */
export function handleLogError(request, sender, sendResponse) {
  const { message, error, context, source, timestamp, url } = request.data || {};
  
  logError(`[${source || 'popup'}] ${message}`, error || null);
  
  // Log additional context if available
  if (context && Object.keys(context).length > 0) {
    log('Error context', context);
  }
  
  // Log URL if available
  if (url) {
    log('Error occurred at URL', url);
  }
  
  // Log timestamp
  if (timestamp) {
    const timeAgo = Date.now() - timestamp;
    log('Error timestamp', { timestamp, timeAgo: `${timeAgo}ms ago` });
  }
  
  sendResponse({ success: true });
  return true;
}

/**
 * Handle ping from popup to check if service worker is alive
 */
export function handlePing(request, sender, sendResponse) {
  sendResponse({ success: true, pong: true });
  return true;
}

/**
 * Handle getState request
 */
export function handleGetState(request, sender, sendResponse) {
  sendResponse(getProcessingState());
  return true;
}

/**
 * Handle cancelProcessing request
 */
export function handleCancelProcessing(request, sender, sendResponse, stopKeepAlive) {
  log('Cancel requested');
  cancelProcessing(stopKeepAlive).then(result => sendResponse(result));
  return true;
}



