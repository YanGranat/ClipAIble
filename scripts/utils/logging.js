// Logging utility for ClipAIble extension
// Supports log levels: DEBUG, INFO, WARN, ERROR
// Log level can be controlled via CONFIG.LOG_LEVEL

import { sanitizeErrorForLogging } from './security.js';
import { CONFIG } from './config.js';

const LOG_PREFIX = '[ClipAIble]';

// Log levels (higher number = more important)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Current log level (default: INFO in production, DEBUG in development)
// Can be overridden via CONFIG.LOG_LEVEL
const getLogLevel = () => {
  if (CONFIG && CONFIG.LOG_LEVEL !== undefined) {
    return CONFIG.LOG_LEVEL;
  }
  // Default: INFO level (show INFO, WARN, ERROR, hide DEBUG)
  return LOG_LEVELS.INFO;
};

/**
 * Check if log level should be displayed
 * @param {number} level - Log level to check
 * @returns {boolean} True if should log
 */
function shouldLog(level) {
  return level >= getLogLevel();
}

/**
 * Format timestamp for log messages
 * @returns {string} Formatted timestamp (HH:MM:SS)
 */
function getTimestamp() {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

/**
 * Sanitize data for logging (prevent leaking sensitive information)
 * @param {*} data - Data to sanitize
 * @returns {*} Sanitized data
 */
function sanitizeData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'object') {
    return sanitizeErrorForLogging(data);
  }
  return data;
}

/**
 * Log debug message (only shown if LOG_LEVEL is DEBUG)
 * @param {string} message - Log message
 * @param {*} data - Optional data to log (will be sanitized if object)
 */
export function logDebug(message, data = null) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;
  
  const timestamp = getTimestamp();
  if (data !== null) {
    const sanitized = sanitizeData(data);
    console.log(`${LOG_PREFIX} [${timestamp}] DEBUG: ${message}`, sanitized);
  } else {
    console.log(`${LOG_PREFIX} [${timestamp}] DEBUG: ${message}`);
  }
}

/**
 * Log info message with timestamp
 * @param {string} message - Log message
 * @param {*} data - Optional data to log (will be sanitized if object)
 */
export function log(message, data = null) {
  if (!shouldLog(LOG_LEVELS.INFO)) return;
  
  const timestamp = getTimestamp();
  if (data !== null) {
    const sanitized = sanitizeData(data);
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
  if (!shouldLog(LOG_LEVELS.ERROR)) return;
  
  const timestamp = getTimestamp();
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
  if (!shouldLog(LOG_LEVELS.WARN)) return;
  
  const timestamp = getTimestamp();
  if (data !== null) {
    const sanitized = sanitizeData(data);
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`, sanitized);
  } else {
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`);
  }
}

// Export log levels for external use
export { LOG_LEVELS };







