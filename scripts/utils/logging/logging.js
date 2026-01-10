// @ts-check
// Logging utility for ClipAIble extension
// Supports log levels: DEBUG, INFO, WARN, ERROR
// Log level can be controlled via CONFIG.LOG_LEVEL

// Type definition for self with dynamically added properties
// addLogToCollection is added dynamically in service worker (background.js line 1073)
// Note: Using WorkerGlobalScope as base type since ServiceWorkerGlobalScope may not be available in all contexts
/**
 * @typedef {WorkerGlobalScope & {
 *   addLogToCollection?: (message: string, data?: any, level?: string) => void;
 * }} ServiceWorkerWithLogging
 */

import { sanitizeErrorForLogging } from '../security.js';
import { CONFIG } from '../config.js';
import { logViaPort, initLogPort } from './logging-port.js';

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
 * Convert data to string for logging with size limit
 * @param {*} data - Data to convert
 * @param {number} maxSize - Maximum size in characters (default: CONFIG.MAX_LOG_DATA_SIZE)
 * @returns {string} String representation (truncated if too large)
 */
function dataToString(data, maxSize = null) {
  if (data === null) return 'null';
  if (data === undefined) return 'undefined';
  if (typeof data === 'string') {
    // Truncate string if too long
    const limit = maxSize || (CONFIG?.MAX_LOG_DATA_SIZE || 100000);
    if (data.length > limit) {
      return data.substring(0, limit) + `\n... [truncated, original size: ${data.length} chars]`;
    }
    return data;
  }
  if (typeof data === 'object') {
    try {
      // Try JSON.stringify first (handles most cases)
      let jsonStr = JSON.stringify(data, null, 2);
      // Truncate if too large
      const limit = maxSize || (CONFIG?.MAX_LOG_DATA_SIZE || 100000);
      if (jsonStr.length > limit) {
        jsonStr = jsonStr.substring(0, limit) + `\n... [truncated, original size: ${jsonStr.length} chars]`;
      }
      return jsonStr;
    } catch (e) {
      // If JSON.stringify fails (circular references, etc.), use sanitizeErrorForLogging
      const sanitized = sanitizeErrorForLogging(data);
      try {
        let jsonStr = JSON.stringify(sanitized, null, 2);
        const limit = maxSize || (CONFIG?.MAX_LOG_DATA_SIZE || 100000);
        if (jsonStr.length > limit) {
          jsonStr = jsonStr.substring(0, limit) + `\n... [truncated, original size: ${jsonStr.length} chars]`;
        }
        return jsonStr;
      } catch (e2) {
        // Last resort: convert to string
        const str = String(sanitized);
        const limit = maxSize || (CONFIG?.MAX_LOG_DATA_SIZE || 100000);
        if (str.length > limit) {
          return str.substring(0, limit) + `... [truncated, original size: ${str.length} chars]`;
        }
        return str;
      }
    }
  }
  const str = String(data);
  const limit = maxSize || (CONFIG?.MAX_LOG_DATA_SIZE || 100000);
  if (str.length > limit) {
    return str.substring(0, limit) + `... [truncated, original size: ${str.length} chars]`;
  }
  return str;
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
    console.log(`${LOG_PREFIX} [${timestamp}] DEBUG: ${message}`, data);
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
  const fullMessage = `${LOG_PREFIX} [${timestamp}] ${message}`;
  
  if (data !== null) {
    console.log(fullMessage, data);
  } else {
    console.log(fullMessage);
  }
  
  // Add to unlimited log collection if available (bypasses Chrome console limit)
  // Only in service worker context - offscreen logs should use criticalLog() or logToServiceWorker()
  try {
    // Type assertion: addLogToCollection is added dynamically to self in service worker (background.js line 1073)
    // Property 'addLogToCollection' does not exist on type 'ServiceWorkerGlobalScope', but is added dynamically
    // Using ServiceWorkerWithLogging type to properly type the extended service worker
    if (typeof self !== 'undefined') {
      /** @type {import('../../types.js').ServiceWorkerWithLogging} */
      const selfWithLogging = self;
      // Check if addLogToCollection exists and is a function
      // addLogToCollection is added dynamically in service worker (background.js line 1073)
      if (typeof selfWithLogging.addLogToCollection === 'function') {
        selfWithLogging.addLogToCollection(fullMessage, data, 'log');
      }
    }
  } catch (e) {
    // Ignore - addLogToCollection may not be available in all contexts
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
  const fullMessage = `${LOG_PREFIX} [${timestamp}] ERROR: ${message}`;
  console.error(fullMessage);
  if (error) {
    // Sanitize error to prevent leaking sensitive information (API keys, URLs with tokens, etc.)
    const sanitized = sanitizeErrorForLogging(error);
    console.error(`${LOG_PREFIX} [${timestamp}] Error details:`, sanitized);
    if (error.stack) {
      // Stack traces are safe to log (they don't contain user data)
      console.error(`${LOG_PREFIX} [${timestamp}] Stack trace:`, error.stack);
    }
  }
  
  // Add to unlimited log collection if available (bypasses Chrome console limit)
  try {
    // Type assertion: addLogToCollection is added dynamically to self in service worker (background.js line 1073)
    // Property 'addLogToCollection' does not exist on type 'ServiceWorkerGlobalScope', but is added dynamically
    // Using ServiceWorkerWithLogging type to properly type the extended service worker
    if (typeof self !== 'undefined') {
      /** @type {import('../../types.js').ServiceWorkerWithLogging} */
      const selfWithLogging = self;
      // Check if addLogToCollection exists and is a function
      // addLogToCollection is added dynamically in service worker (background.js line 1073)
      if (typeof selfWithLogging.addLogToCollection === 'function') {
        selfWithLogging.addLogToCollection(fullMessage, error ? sanitizeErrorForLogging(error) : null, 'error');
      }
    }
  } catch (e) {
    // Ignore - addLogToCollection may not be available in all contexts
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
  const fullMessage = `${LOG_PREFIX} [${timestamp}] WARN: ${message}`;
  if (data !== null) {
    console.warn(fullMessage, data);
  } else {
    console.warn(fullMessage);
  }
  
  // Add to unlimited log collection if available (bypasses Chrome console limit)
  try {
    // Type assertion: addLogToCollection is added dynamically to self in service worker (background.js line 1073)
    // Property 'addLogToCollection' does not exist on type 'ServiceWorkerGlobalScope', but is added dynamically
    // Using ServiceWorkerWithLogging type to properly type the extended service worker
    if (typeof self !== 'undefined') {
      /** @type {import('../../types.js').ServiceWorkerWithLogging} */
      const selfWithLogging = self;
      // Check if addLogToCollection exists and is a function
      // addLogToCollection is added dynamically in service worker (background.js line 1073)
      if (typeof selfWithLogging.addLogToCollection === 'function') {
        selfWithLogging.addLogToCollection(fullMessage, data, 'warn');
      }
    }
  } catch (e) {
    // Ignore - addLogToCollection may not be available in all contexts
  }
}

// Export log levels for external use
export { LOG_LEVELS };

/**
 * CRITICAL LOGGING - Use ALL available methods to ensure logs are captured
 * This function tries multiple logging mechanisms to bypass any console capture issues
 * @param {string} message - Log message
 * @param {string} marker - Optional marker for easy searching
 * @param {*} data - Optional data to log
 */
/**
 * CRITICAL LOGGING - Use ALL available methods to ensure logs are captured
 * 
 * PROBLEM: Logs from offscreen documents may not be visible in DevTools console
 * if console is opened AFTER logs are written. Chrome caches console output
 * and may not show logs that were written before DevTools was opened.
 * 
 * SOLUTION: Use multiple logging mechanisms:
 * 1. console.log/error/warn - visible in DevTools if opened during execution
 * 2. localStorage - ALWAYS available, persists across sessions
 * 3. chrome.runtime.sendMessage - sends to background, always visible
 * 4. window.postMessage - for cross-context communication
 * 
 * @param {string} message - Log message
 * @param {string} marker - Optional marker for easy searching
 * @param {*} data - Optional data to log
 */
export function criticalLog(message, marker = '', data = null) {
  const timestamp = Date.now();
  const fullMessage = marker ? `[CRITICAL_LOG === ${marker} ===] ${message}` : `[CRITICAL_LOG] ${message}`;
  
  // Truncate data if too large to prevent performance issues
  let processedData = data;
  if (data && typeof data === 'object') {
    try {
      const jsonStr = JSON.stringify(data);
      const maxSize = 50000; // Limit for critical logs
      if (jsonStr.length > maxSize) {
        processedData = {
          _truncated: true,
          _originalSize: jsonStr.length,
          _message: 'Data truncated in criticalLog'
        };
        // Try to preserve important fields
        if (data.pageNum !== undefined) processedData.pageNum = data.pageNum;
        if (data.error !== undefined) processedData.error = data.error;
        if (data.category !== undefined) processedData.category = data.category;
      }
    } catch (e) {
      processedData = { _serializationError: true };
    }
  }
  
  // CRITICAL: Use console.error for maximum visibility (red, always shown)
  try {
    console.error(fullMessage);
    if (processedData) {
      console.error('[CRITICAL_LOG_DATA]', processedData);
    }
    // Also use console.warn and console.log for redundancy
    console.warn(fullMessage);
    console.log(fullMessage);
    if (processedData) {
      console.warn('[CRITICAL_LOG_DATA]', processedData);
      console.log('[CRITICAL_LOG_DATA]', processedData);
    }
  } catch (e) {
    // Ignore console errors
  }
  
  // Also use standard log function (with prefix and timestamp)
  try {
    log(fullMessage, {
      marker,
      data: processedData,
      timestamp,
      source: typeof window !== 'undefined' ? window.location?.href : 'service-worker'
    });
  } catch (e) {
    // Ignore log function errors
  }
  
  // CRITICAL: Don't send message to self if we're already in service worker
  // Service worker cannot send messages to itself - this causes "Could not establish connection" errors
  const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime;
  
  // Send to background via port (if available and not in service worker)
  if (!isServiceWorker) {
    try {
      logViaPort(message, marker, processedData);
    } catch (e) {
      // Fallback to sendMessage (if in offscreen/content script context)
      // CRITICAL: Use callback-based API with empty callback to suppress "Unchecked runtime.lastError"
      // Promise-based API may not be available in all contexts
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          // Use callback-based API with empty callback to suppress errors
          // This prevents "Unchecked runtime.lastError" spam in console
          chrome.runtime.sendMessage({
            action: 'log',
            data: {
              level: 'critical',
              message: message,
              marker: marker,
              data: processedData,
              timestamp: timestamp,
              source: typeof window !== 'undefined' ? 'offscreen' : 'service-worker'
            }
          }, () => {
            // CRITICAL: Empty callback suppresses "Unchecked runtime.lastError"
            // Check lastError but don't log it - these errors are expected when receiver is closed
            if (chrome.runtime.lastError) {
              // Silently ignore - "Could not establish connection" is expected when tabs/offscreen are closed
            }
          });
        }
      } catch (e2) {
        // Ignore all sendMessage errors
      }
    }
  }
  // If we're in service worker, logs are already visible via console.error above
}

/**
 * Force flush all queued logs to service worker
 * Call this when processing is complete to ensure all logs are sent
 * This will send all remaining logs in batches
 */
export function flushAllServiceWorkerLogs() {
  // Clear any pending timer
  if (serviceWorkerLogFlushTimer) {
    clearTimeout(serviceWorkerLogFlushTimer);
    serviceWorkerLogFlushTimer = null;
  }
  
  // Store initial queue size before flushing
  const initialQueueSize = serviceWorkerLogQueue.length;
  
  // Flush remaining logs
  let flushCount = 0;
  const MAX_FLUSH_ITERATIONS = 50;
  
  while (serviceWorkerLogQueue.length > 0 && flushCount < MAX_FLUSH_ITERATIONS) {
    flushServiceWorkerLogQueue();
    flushCount++;
  }
  
  // Log final queue size
  const finalQueueSize = serviceWorkerLogQueue.length;
  if (finalQueueSize > 0) {
    const stillQueuedMsg = `[PDF v3] flushAllServiceWorkerLogs: Queue still has ${finalQueueSize} logs after ${flushCount} flushes, scheduling final flush`;
    log(stillQueuedMsg);
    serviceWorkerLogFlushTimer = setTimeout(() => {
      flushAllServiceWorkerLogs();
    }, 50); // Faster interval for final flush
  } else {
    const successMsg = `[PDF v3] flushAllServiceWorkerLogs: Successfully flushed all ${initialQueueSize} logs in ${flushCount} batches`;
    log(successMsg);
    // Also send success message to service worker
    serviceWorkerLogQueue.push({
      logMessage: successMsg,
      marker: '=== FLUSH_ALL_LOGS_SUCCESS ===',
      data: { initialQueueSize, flushCount },
      timestamp: Date.now(),
      retryCount: 0
    });
    flushServiceWorkerLogQueue(); // Send success message immediately
  }
}

// Queue for service worker logs to prevent message loss
// Chrome limits number of sendMessage calls (~1000), so we send logs in batches
// Each batch contains multiple logs in a single message
const serviceWorkerLogQueue = [];
let serviceWorkerLogFlushTimer = null;
const SERVICE_WORKER_LOG_BATCH_SIZE = 50; // Send 50 logs per message (reduced from 10 individual messages)
const SERVICE_WORKER_LOG_FLUSH_INTERVAL = 100; // Flush every 100ms (increased to reduce message rate)

/**
 * Flush queued logs to service worker
 * Sends logs in batches as a SINGLE message to avoid Chrome's 1000 message limit
 */
function flushServiceWorkerLogQueue() {
  if (serviceWorkerLogQueue.length === 0) {
    return;
  }
  
  // Take up to BATCH_SIZE logs from queue
  const batch = serviceWorkerLogQueue.splice(0, SERVICE_WORKER_LOG_BATCH_SIZE);
  
  // Send ALL logs in batch as a SINGLE message
  // This dramatically reduces number of sendMessage calls
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'logBatch',
        data: {
          level: 'critical',
          logs: batch.map(logEntry => ({
            message: logEntry.logMessage,
            marker: logEntry.marker,
            data: logEntry.data,
            timestamp: logEntry.timestamp,
            source: 'offscreen'
          })),
          batchSize: batch.length,
          totalQueued: serviceWorkerLogQueue.length
        }
      }, (response) => {
        // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
        if (chrome.runtime.lastError) {
          // Silently ignore - "Could not establish connection" is expected when receiver is closed
          // If sendMessage fails, add all logs back to queue (but limit retries)
          for (const logEntry of batch) {
            if ((logEntry.retryCount || 0) < 3) {
              logEntry.retryCount = (logEntry.retryCount || 0) + 1;
              serviceWorkerLogQueue.push(logEntry);
            }
          }
          return;
        }
      });
    }
  } catch (e) {
    // If sendMessage fails, add all logs back to queue
    for (const logEntry of batch) {
      if ((logEntry.retryCount || 0) < 3) {
        logEntry.retryCount = (logEntry.retryCount || 0) + 1;
        serviceWorkerLogQueue.push(logEntry);
      }
    }
  }
  
  // Schedule next flush if queue is not empty
  if (serviceWorkerLogQueue.length > 0) {
    serviceWorkerLogFlushTimer = setTimeout(flushServiceWorkerLogQueue, SERVICE_WORKER_LOG_FLUSH_INTERVAL);
  } else {
    serviceWorkerLogFlushTimer = null;
  }
}

/**
 * Send important log to service worker (no size limits, always visible)
 * Use this for critical debugging information that must not be lost
 * Logs are queued and sent in batches to prevent message loss
 * @param {string} message - Log message
 * @param {string} category - Category for filtering (e.g., 'applyFontFormatting', 'detectContextualFormatting')
 * @param {*} data - Optional data to log
 */
export function logToServiceWorker(message, category = 'general', data = null) {
  // Check if verbose logging is enabled (for detailed PDF processing logs)
  if (!CONFIG?.VERBOSE_LOGGING && category.includes('PDF') && message.includes('page')) {
    // Skip detailed page-by-page logs unless verbose logging is enabled
    // Only log errors or critical information
    if (!message.toLowerCase().includes('error') && !message.toLowerCase().includes('critical')) {
      return;
    }
  }
  
  const timestamp = Date.now();
  const logMessage = `[PDF v3] [${category}] ${message}`;
  const marker = `=== SERVICE_WORKER_LOG_${category.toUpperCase()} ===`;
  
  // Truncate data if too large to prevent memory/performance issues
  let processedData = data;
  if (data && typeof data === 'object') {
    try {
      const jsonStr = JSON.stringify(data);
      const maxSize = (CONFIG && CONFIG.MAX_LOG_DATA_SIZE) || 100000;
      if (jsonStr.length > maxSize) {
        // Create truncated version
        processedData = {
          ...data,
          _truncated: true,
          _originalSize: jsonStr.length,
          _message: 'Data truncated for logging performance'
        };
        // Remove large properties
        for (const key in processedData) {
          if (key !== '_truncated' && key !== '_originalSize' && key !== '_message') {
            const valueStr = JSON.stringify(processedData[key]);
            if (valueStr.length > 10000) {
              delete processedData[key];
            }
          }
        }
      }
    } catch (e) {
      // If serialization fails, use minimal data
      processedData = { _serializationError: true };
    }
  }
  
  // Try to use port-based logging first (more reliable for frequent messages)
  // Use synchronous import (already loaded at top of file)
  try {
    logViaPort(logMessage, marker, {
      category,
      originalMessage: message,
      ...(processedData || {})
    });
  } catch (e) {
    // Fallback to sendMessage queue if port fails
    try {
      // OPTIMIZED: Reduced from 10k to 5k to save memory
      // Prevent queue overflow with FIFO rotation
      const MAX_QUEUE_SIZE = 5000;
      if (serviceWorkerLogQueue.length >= MAX_QUEUE_SIZE) {
        // Remove oldest 20% of logs to make room (more aggressive rotation)
        const removeCount = Math.floor(MAX_QUEUE_SIZE * 0.2);
        serviceWorkerLogQueue.splice(0, removeCount);
        logWarn(`[PDF v3] logToServiceWorker: Queue overflow, removed ${removeCount} oldest logs`);
      }
      
      serviceWorkerLogQueue.push({
        logMessage,
        marker,
        data: {
          category,
          originalMessage: message,
          ...(processedData || {})
        },
        timestamp,
        retryCount: 0
      });
      
      // Log queue size periodically (every 100 logs) to track if logs are being queued
      if (serviceWorkerLogQueue.length % 100 === 0) {
        log(`[PDF v3] logToServiceWorker: Queue size = ${serviceWorkerLogQueue.length}, category=${category}`, {
          queueSize: serviceWorkerLogQueue.length,
          category,
          pageNum: data?.pageNum || 'unknown'
        });
      }
      
      // Start flush timer if not already running
      if (!serviceWorkerLogFlushTimer) {
        serviceWorkerLogFlushTimer = setTimeout(flushServiceWorkerLogQueue, SERVICE_WORKER_LOG_FLUSH_INTERVAL);
      }
    } catch (e2) {
      // Ignore all errors to prevent logging system from breaking
    }
  }
  
  // Also log locally for redundancy (only if verbose or important)
  if (CONFIG?.VERBOSE_LOGGING || message.toLowerCase().includes('error') || message.toLowerCase().includes('critical')) {
    log(logMessage, processedData);
  }
}








