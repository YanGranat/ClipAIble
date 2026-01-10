// @ts-check
// Log collection system for background service worker (bypasses Chrome console 1000 message limit)
// Uses dependency injection pattern for better testability and modularity

/**
 * @typedef {Object} ServiceWorkerGlobalScopeWithLogging
 * @property {function(string, *, 'log'|'error'|'warn'|'debug'?): void} addLogToCollection
 * @property {function(): Promise<void>} exportAllLogs
 */

/**
 * Initialize log collection module with dependencies
 * @param {import('../types.js').LoggingDeps} deps - Dependencies object
 * @returns {Object} Log collection functions
 */
export function initLogging(deps) {
  const {
    log,
    logError,
    /** @type {import('../types.js').Config} */
    CONFIG
  } = deps;

  // Global array to store ALL logs (unlimited, bypasses Chrome console limit)
  const allLogsCollection = [];
  // OPTIMIZED: Reduced from 50k to 10k to save memory (70% reduction)
  // FIFO rotation keeps only most recent logs, older logs are automatically removed
  const MAX_LOGS_IN_MEMORY = (CONFIG && CONFIG.LOG_COLLECTION_MAX_SIZE) || 10000;

  /**
   * Add log to collection (unlimited storage, bypasses Chrome console limit)
   * @param {string} message - Log message
   * @param {*} [data] - Optional data
   * @param {'log'|'error'|'warn'|'debug'} [level='log'] - Log level
   */
  function addLogToCollection(message, data = null, level = 'log') {
  try {
    // Truncate data if too large to prevent memory issues
    let dataStr = null;
    if (data !== null) {
      try {
        if (typeof data === 'object') {
          const jsonStr = JSON.stringify(data, null, 2);
          const maxSize = (CONFIG && CONFIG.MAX_LOG_DATA_SIZE) || 100000;
          if (jsonStr.length > maxSize) {
            dataStr = jsonStr.substring(0, maxSize) + `\n... [truncated, original size: ${jsonStr.length} chars]`;
          } else {
            dataStr = jsonStr;
          }
        } else {
          const str = String(data);
          const maxSize = (CONFIG && CONFIG.MAX_LOG_DATA_SIZE) || 100000;
          if (str.length > maxSize) {
            dataStr = str.substring(0, maxSize) + `... [truncated, original size: ${str.length} chars]`;
          } else {
            dataStr = str;
          }
        }
      } catch (e) {
        // If serialization fails, use fallback
        try {
          dataStr = String(data).substring(0, 1000) + '... [serialization failed]';
        } catch (e2) {
          dataStr = '[data serialization failed]';
        }
      }
    }
    
    const logEntry = {
      timestamp: Date.now(),
      level,
      message: message.length > 10000 ? message.substring(0, 10000) + '... [truncated]' : message,
      data: dataStr
    };
    
    allLogsCollection.push(logEntry);
    
    // OPTIMIZED: FIFO rotation - remove oldest logs when limit reached
    // More aggressive rotation (20% instead of 10%) to keep memory usage low
    if (allLogsCollection.length > MAX_LOGS_IN_MEMORY) {
      // Remove oldest 20% of logs at once (more aggressive to save memory)
      const removeCount = Math.floor(MAX_LOGS_IN_MEMORY * 0.2);
      allLogsCollection.splice(0, removeCount);
    }
  } catch (e) {
    // Ignore errors in log collection to prevent logging system from breaking
    // Only log if we can safely do so (avoid infinite recursion)
    try {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[ClipAIble] Failed to add log to collection:', e);
      }
    } catch (e2) {
      // Ultimate fallback - ignore all errors
    }
  }
}

  /**
   * Export all collected logs to file
   * @returns {Promise<void>}
   */
  async function exportAllLogsToFile() {
  try {
    if (allLogsCollection.length === 0) {
      log('No logs to export');
      return;
    }
    
    // Format logs as text
    const logLines = allLogsCollection.map(entry => {
      const timestamp = new Date(entry.timestamp).toISOString();
      const dataStr = entry.data ? `\n  Data: ${entry.data}` : '';
      return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
    });
    
    const logText = logLines.join('\n');
    
    // In service worker, URL.createObjectURL is not available
    // Use data URL instead
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(logText);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `clipaible-logs-${timestamp}.txt`;
    
    // Use chrome.downloads API to save file
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    
    log(`Exported ${allLogsCollection.length} logs to ${filename}`);
  } catch (error) {
    logError('Failed to export logs', error);
  }
}

  /**
   * Initialize log collection system - make functions available globally
   * Must be called during service worker initialization
   * @returns {void}
   */
  function initLogCollection() {
    // Make addLogToCollection available globally for logging.js
    /** @type {ServiceWorkerGlobalScopeWithLogging} */ (/** @type {unknown} */ (self)).addLogToCollection = addLogToCollection;
    
    // Make exportAllLogsToFile available globally for console access
    // Usage in DevTools console: exportAllLogs()
    /** @type {ServiceWorkerGlobalScopeWithLogging} */ (/** @type {unknown} */ (self)).exportAllLogs = exportAllLogsToFile;
  }

  return {
    /** @type {function(string, *, 'log'|'error'|'warn'|'debug'?): void} */
    addLogToCollection,
    /** @type {function(): Promise<void>} */
    exportAllLogsToFile,
    /** @type {function(): void} */
    initLogCollection
  };
}

// Backward compatibility: export functions directly for modules that haven't been refactored yet
// TODO: Remove this after all modules use DI
import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';

const loggingModule = initLogging({
  log,
  logError,
  CONFIG
});

export const addLogToCollection = loggingModule.addLogToCollection;
export const exportAllLogsToFile = loggingModule.exportAllLogsToFile;
export const initLogCollection = loggingModule.initLogCollection;

