// @ts-check
// Utility functions for message handlers
// Provides common error handling patterns

import { handleError } from '../utils/error-handler.js';
import { logError, log } from '../utils/logging.js';

/**
 * Check for Chrome runtime errors and log if present
 * @param {string} context - Context for logging (e.g., 'before sendResponse')
 * @param {string} errorType - Error type for error handler
 * @returns {boolean} True if error exists, false otherwise
 */
function checkChromeRuntimeError(context, errorType) {
  if (chrome.runtime.lastError) {
    logError(`withErrorHandling: chrome.runtime.lastError ${context}`, { 
      errorType, 
      lastError: chrome.runtime.lastError.message
    });
    return true;
  }
  return false;
}

/**
 * Safely send response with error handling
 * @param {Function} sendResponse - Response function
 * @param {*} response - Response data
 * @param {string} errorType - Error type for error handler
 * @param {string} context - Context for logging
 */
function safeSendResponse(sendResponse, response, errorType, context) {
  try {
    sendResponse(response);
  } catch (sendError) {
    logError(`withErrorHandling: sendResponse failed ${context}`, { 
      errorType, 
      error: sendError.message,
      lastError: chrome.runtime.lastError?.message
    });
  }
}

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
      // Check for Chrome runtime errors before sending response
      if (checkChromeRuntimeError('before sendResponse', errorType)) {
        return;
      }
      
      safeSendResponse(sendResponse, result, errorType, 'in success path');
    } catch (error) {
      logError('withErrorHandling: promise rejected', { errorType, error: error.message });
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType,
        logError: true,
        createUserMessage: false
      });
      
      // Check for Chrome runtime errors before sending error response
      if (checkChromeRuntimeError('before error sendResponse', errorType)) {
        return;
      }
      
      safeSendResponse(sendResponse, { error: normalized.message }, errorType, 'in error path');
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


