// Logging utility for ClipAIble extension

const LOG_PREFIX = '[ClipAIble]';

/**
 * Log info message with timestamp
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
export function log(message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data !== null) {
    console.log(`${LOG_PREFIX} [${timestamp}] ${message}`, data);
  } else {
    console.log(`${LOG_PREFIX} [${timestamp}] ${message}`);
  }
}

/**
 * Log error message with timestamp and optional error details
 * @param {string} message - Error message
 * @param {Error|*} error - Optional error object
 */
export function logError(message, error = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`${LOG_PREFIX} [${timestamp}] ERROR: ${message}`);
  if (error) {
    console.error(`${LOG_PREFIX} [${timestamp}] Error details:`, error);
    if (error.stack) {
      console.error(`${LOG_PREFIX} [${timestamp}] Stack trace:`, error.stack);
    }
  }
}

/**
 * Log warning message with timestamp
 * @param {string} message - Warning message
 * @param {*} data - Optional data to log
 */
export function logWarn(message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  if (data !== null) {
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`, data);
  } else {
    console.warn(`${LOG_PREFIX} [${timestamp}] WARN: ${message}`);
  }
}







