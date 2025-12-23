// @ts-check
// Utility functions for message handlers
// Provides common error handling patterns

import { handleError } from '../utils/error-handler.js';
import { logError, log } from '../utils/logging.js';

/**
 * Wrapper for promise-based handlers with consistent error handling
 * @param {Promise} promise - Promise to handle
 * @param {string} errorType - Error type for error handler
 * @param {Function} sendResponse - Response function
 * @returns {boolean} - Always returns true for async handlers
 */
export function withErrorHandling(promise, errorType, sendResponse) {
  // CRITICAL: Return true IMMEDIATELY to keep message channel open for async response
  // Then handle the promise and call sendResponse when ready
  (async () => {
    try {
      const result = await promise;
      try {
        sendResponse(result);
      } catch (sendError) {
        logError('withErrorHandling: sendResponse failed', { 
          errorType, 
          error: sendError.message,
          lastError: chrome.runtime.lastError?.message
        });
      }
    } catch (error) {
      logError('withErrorHandling: promise rejected', { errorType, error: error.message });
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType,
        logError: true,
        createUserMessage: false
      });
      
      try {
        sendResponse({ error: normalized.message });
      } catch (sendError) {
        logError('withErrorHandling: sendResponse failed in catch', { 
          errorType, 
          error: sendError.message,
          lastError: chrome.runtime.lastError?.message
        });
      }
    }
  })();
  
  // Return true immediately to keep channel open
  return true;
}

/**
 * Wrapper for handlers that return simple success response
 * @param {Promise} promise - Promise to handle
 * @param {string} errorType - Error type for error handler
 * @param {Function} sendResponse - Response function
 * @returns {boolean} - Always returns true for async handlers
 */
export async function withSuccessResponse(promise, errorType, sendResponse) {
  try {
    await promise;
    sendResponse({ success: true });
    return true;
  } catch (error) {
    const normalized = await handleError(error, {
      source: 'messageHandler',
      errorType,
      logError: true,
      createUserMessage: false
    });
    sendResponse({ error: normalized.message });
    return true;
  }
}


