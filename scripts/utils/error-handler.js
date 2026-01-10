// @ts-check
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
 * @readonly
 * @const {Record<string, Array<string>>}
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
 * @param {import('../types.js').ErrorContext} [context={}] - Additional context
 * @returns {import('../types.js').NormalizedError} Normalized error object
 * @see {@link detectErrorCode} For automatic error code detection
 * @see {@link handleError} For complete error handling with logging and user messages
 */
export function normalizeError(error, context = {}) {
  let message = '';
  let code = ERROR_CODES.UNKNOWN_ERROR;
  let originalError = error;
  
  // Handle different error formats
  if (error instanceof Error) {
    message = error.message || 'Unknown error';
    // Check if error already has a code
    /** @type {import('../types.js').ExtendedError} */
    const errorWithCode = error;
    if (errorWithCode.code && Object.values(ERROR_CODES).includes(errorWithCode.code)) {
      code = errorWithCode.code;
    } else if (errorWithCode.status) {
      // HTTP status code
      if (errorWithCode.status === 401 || errorWithCode.status === 403) {
        code = ERROR_CODES.AUTH_ERROR;
      } else if (errorWithCode.status === 429) {
        code = ERROR_CODES.RATE_LIMIT;
      } else if (errorWithCode.status >= 500) {
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
 * @param {import('../types.js').ErrorHandlingOptions} [options={}] - Handling options
 * @returns {Promise<import('../types.js').NormalizedError & {userMessage?: string, userCode?: string}>} Normalized error with optional user-friendly message (if createUserMessage is true)
 * @throws {Error} If user message creation fails (logged but not thrown)
 * @see {@link normalizeError} For error normalization only
 * @see {@link withErrorHandling} For wrapping functions with error handling
 * @see {@link createErrorHandler} For promise chain error handlers
 * @example
 * // Basic error handling
 * try {
 *   await someFunction();
 * } catch (error) {
 *   const normalized = await handleError(error, {
 *     source: 'moduleName',
 *     errorType: 'operationFailed',
 *     logError: true
 *   });
 *   throw normalized;
 * }
 * @example
 * // Error handling with user-friendly message
 * try {
 *   await processArticle();
 * } catch (error) {
 *   const normalized = await handleError(error, {
 *     source: 'articleProcessing',
 *     errorType: 'contentExtractionFailed',
 *     logError: true,
 *     createUserMessage: true
 *   });
 *   // normalized.userMessage contains user-friendly message
 *   showErrorToUser(normalized.userMessage);
 * }
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
      return normalized;
    }
  }
  
  return normalized;
}

/**
 * Wrap async function with centralized error handling
 * Catches errors, normalizes them, and optionally handles them
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Async function to wrap
 * @param {import('../types.js').ErrorHandlingOptions} [options={}] - Error handling options
 * @returns {(...args: any[]) => Promise<T>} Wrapped function
 * @see {@link handleError} For the underlying error handling logic
 * @see {@link createErrorHandler} For promise chain error handlers
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
      /** @type {import('../types.js').ExtendedError} */
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
 * @param {import('../types.js').ErrorHandlingOptions} [options={}] - Error handling options
 * @returns {function(Error): Promise<import('../types.js').NormalizedError>} Error handler for .catch()
 * @see {@link handleError} For the underlying error handling logic
 * @see {@link withErrorHandling} For wrapping functions with error handling
 */
export function createErrorHandler(options = {}) {
  return async (error) => {
    const handled = await handleError(error, options);
    
    // Return normalized error object directly (handleError already returns NormalizedError)
    // Ensure code is always present (it's required in NormalizedError)
    return {
      message: handled.message,
      code: handled.code,
      originalError: handled.originalError,
      context: handled.context,
      ...(handled.userMessage && { userMessage: handled.userMessage }),
      ...(handled.userCode && { userCode: handled.userCode })
    };
  };
}

