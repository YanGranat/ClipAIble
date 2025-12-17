// Logging utility for ClipAIble extension

import { sanitizeErrorForLogging } from './security.js';

const LOG_PREFIX = '[ClipAIble]';

/**
 * Log info message with timestamp
 * @param {string} message - Log message
 * @param {*} data - Optional data to log (will be sanitized if object)
 */
export function log(message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data !== null) {
    // Sanitize data to prevent leaking sensitive information
    const sanitized = (typeof data === 'object' && data !== null) 
      ? sanitizeErrorForLogging(data) 
      : data;
    console.log(`${LOG_PREFIX} [${timestamp}] ${message}`, sanitized);
  } else {
    console.log(`${LOG_PREFIX} [${timestamp}] ${message}`);
  }
}

/**
 * Log error message with timestamp and optional error details
 * @param {string} message - Error message
 * @param {Error|*} error - Optional error object (will be sanitized)
 */
export function logError(message, error = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`${LOG_PREFIX} [${timestamp}] ERROR: ${message}`);
  if (error) {
    // Sanitize error to prevent leaking sensitive information (API keys, URLs with tokens, etc.)
    const sanitized = sanitizeErrorForLogging(error);
    console.error(`${LOG_PREFIX} [${timestamp}] Error details:`, sanitized);
    if (error.stack) {
      // Stack traces are safe to log (they don't contain user data)
      console.error(`${LOG_PREFIX} [${timestamp}] Stack trace:`, error.stack);
    }
  }
}

/**
 * Log warning message with timestamp
 * @param {string} message - Warning message
 * @param {*} data - Optional data to log (will be sanitized if object)
 */
export function logWarn(message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data !== null) {
    // Sanitize data to prevent leaking sensitive information
    const sanitized = (typeof data === 'object' && data !== null) 
      ? sanitizeErrorForLogging(data) 
      : data;
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`, sanitized);
  } else {
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`);
  }
}







