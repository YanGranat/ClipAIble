// Utility functions for message handlers
// Provides common error handling patterns

import { handleError } from '../utils/error-handler.js';
import { logError } from '../utils/logging.js';

/**
 * Wrapper for promise-based handlers with consistent error handling
 * @param {Promise} promise - Promise to handle
 * @param {string} errorType - Error type for error handler
 * @param {Function} sendResponse - Response function
 * @returns {boolean} - Always returns true for async handlers
 */
export async function withErrorHandling(promise, errorType, sendResponse) {
  try {
    const result = await promise;
    sendResponse(result);
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

