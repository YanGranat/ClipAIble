// Centralized error handling for ClipAIble extension
// Provides unified error normalization, classification, and user-friendly message generation
//
// USAGE EXAMPLES:
//
// 1. Basic error handling in async function:
//    try {
//      await someFunction();
//    } catch (error) {
//      const normalized = await handleError(error, {
//        source: 'moduleName',
//        errorType: 'operationFailed',
//        logError: true,
//        createUserMessage: true
//      });
//      throw normalized; // Re-throw normalized error
//    }
//
// 2. In promise chain (.catch()):
//    promise
//      .then(result => { ... })
//      .catch(createErrorHandler({
//        source: 'moduleName',
//        errorType: 'operationFailed',
//        logError: true
//      }))
//      .then(normalizedError => {
//        // Handle normalized error
//      });
//
// 3. Wrap function with error handling:
//    const safeFunction = withErrorHandling(originalFunction, {
//      source: 'moduleName',
//      errorType: 'operationFailed',
//      logError: true
//    });
//    await safeFunction(args);

import { ERROR_CODES } from '../state/processing.js';
import { createUserFriendlyError } from './error-messages.js';
import { logError } from './logging.js';

/**
 * Error patterns for automatic error code detection
 * Used to classify errors based on error message content
 */
export const ERROR_PATTERNS = {
  AUTH: ['authentication', '401', '403', 'unauthorized', 'forbidden', 'invalid api key', 'api key', 'api_key'],
  RATE_LIMIT: ['429', 'rate limit', 'quota', 'too many requests', 'rate_limit', 'quota exceeded'],
  TIMEOUT: ['timeout', 'timed out', 'aborted', 'deadline exceeded'],
  NETWORK: ['network', 'fetch', 'connection', 'failed to fetch', 'network error', 'connection refused', 'dns', 'econnrefused'],
  PARSE: ['parse', 'json', 'invalid json', 'syntax error', 'unexpected token', 'json.parse'],
  VALIDATION: ['validation', 'invalid', 'missing', 'required', 'empty', 'null', 'undefined'],
  PROVIDER: ['provider', 'service unavailable', '503', '502', '500', 'internal server error']
};

/**
 * Normalize error to standard format
 * Converts various error types (Error objects, strings, API responses) to unified format
 * @param {Error|string|Object} error - Error to normalize
 * @param {Object} context - Additional context (errorType, source, etc.)
 * @returns {Object} Normalized error {message, code, originalError, context}
 */
export function normalizeError(error, context = {}) {
  let message = '';
  let code = ERROR_CODES.UNKNOWN_ERROR;
  let originalError = error;
  
  // Handle different error formats
  if (error instanceof Error) {
    message = error.message || 'Unknown error';
    // Check if error already has a code
    if (error.code && Object.values(ERROR_CODES).includes(error.code)) {
      code = error.code;
    } else if (error.status) {
      // HTTP status code
      if (error.status === 401 || error.status === 403) {
        code = ERROR_CODES.AUTH_ERROR;
      } else if (error.status === 429) {
        code = ERROR_CODES.RATE_LIMIT;
      } else if (error.status >= 500) {
        code = ERROR_CODES.PROVIDER_ERROR;
      }
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    // Error object with message/code
    message = error.message || error.error?.message || 'Unknown error';
    if (error.code && Object.values(ERROR_CODES).includes(error.code)) {
      code = error.code;
    }
  } else {
    message = 'Unknown error';
  }
  
  // Auto-detect error code from message if not already set
  if (code === ERROR_CODES.UNKNOWN_ERROR) {
    code = detectErrorCode(message);
  }
  
  return {
    message,
    code,
    originalError,
    context: {
      ...context,
      timestamp: Date.now()
    }
  };
}

/**
 * Detect error code from error message
 * Uses ERROR_PATTERNS to classify errors
 * @param {string} message - Error message
 * @returns {string} Error code from ERROR_CODES
 */
export function detectErrorCode(message) {
  if (!message || typeof message !== 'string') {
    return ERROR_CODES.UNKNOWN_ERROR;
  }
  
  const messageLower = message.toLowerCase();
  
  // Check patterns in priority order
  if (ERROR_PATTERNS.AUTH.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.AUTH_ERROR;
  }
  
  if (ERROR_PATTERNS.RATE_LIMIT.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.RATE_LIMIT;
  }
  
  if (ERROR_PATTERNS.TIMEOUT.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.TIMEOUT;
  }
  
  if (ERROR_PATTERNS.NETWORK.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.NETWORK_ERROR;
  }
  
  if (ERROR_PATTERNS.PARSE.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.PARSE_ERROR;
  }
  
  if (ERROR_PATTERNS.VALIDATION.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.VALIDATION_ERROR;
  }
  
  if (ERROR_PATTERNS.PROVIDER.some(pattern => messageLower.includes(pattern))) {
    return ERROR_CODES.PROVIDER_ERROR;
  }
  
  return ERROR_CODES.UNKNOWN_ERROR;
}

/**
 * Handle error with centralized processing
 * Normalizes error, logs it, and optionally creates user-friendly message
 * @param {Error|string|Object} error - Error to handle
 * @param {Object} options - Handling options
 * @param {string} options.errorType - Error type for user-friendly message (e.g., 'contentExtractionFailed')
 * @param {string} options.source - Source module (e.g., 'extraction', 'translation')
 * @param {Object} options.context - Additional context
 * @param {boolean} options.logError - Whether to log error (default: true)
 * @param {boolean} options.createUserMessage - Whether to create user-friendly message (default: false)
 * @returns {Promise<Object>} Normalized error with optional user-friendly message
 */
export async function handleError(error, options = {}) {
  const {
    errorType = null,
    source = 'unknown',
    context = {},
    logError: shouldLog = true,
    createUserMessage = false
  } = options;
  
  // Normalize error
  const normalized = normalizeError(error, {
    errorType,
    source,
    ...context
  });
  
  // Log error if requested
  if (shouldLog) {
    logError(`Error in ${source}${errorType ? ` (${errorType})` : ''}`, normalized.originalError || normalized);
  }
  
  // Create user-friendly message if requested
  if (createUserMessage && errorType) {
    try {
      const userFriendly = await createUserFriendlyError(errorType, {
        error: normalized.originalError,
        ...normalized.context
      }, normalized.code);
      
      return {
        ...normalized,
        userMessage: userFriendly.message,
        userCode: userFriendly.code
      };
    } catch (msgError) {
      logError('Failed to create user-friendly error message', msgError);
      // Return normalized error even if user message creation failed
    }
  }
  
  return normalized;
}

/**
 * Wrap async function with centralized error handling
 * Catches errors, normalizes them, and optionally handles them
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Error handling options (same as handleError)
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const handled = await handleError(error, {
        ...options,
        context: {
          ...options.context,
          functionName: fn.name || 'anonymous',
          args: args.length > 0 ? 'provided' : 'none'
        }
      });
      
      // Re-throw normalized error
      const normalizedError = new Error(handled.message);
      normalizedError.code = handled.code;
      normalizedError.originalError = handled.originalError;
      normalizedError.context = handled.context;
      throw normalizedError;
    }
  };
}

/**
 * Create error wrapper for promise chains
 * Returns error handler function that can be used in .catch()
 * @param {Object} options - Error handling options (same as handleError)
 * @returns {Function} Error handler for .catch()
 */
export function createErrorHandler(options = {}) {
  return async (error) => {
    const handled = await handleError(error, options);
    
    // Return normalized error for further processing
    const normalizedError = new Error(handled.message);
    normalizedError.code = handled.code;
    normalizedError.originalError = handled.originalError;
    normalizedError.context = handled.context;
    
    return normalizedError;
  };
}

