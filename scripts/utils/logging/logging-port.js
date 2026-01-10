// @ts-check
// Persistent port-based logging for offscreen documents
// Uses chrome.runtime.connect instead of sendMessage to avoid message limits

let logPort = null;
let logPortQueue = [];
const LOG_PORT_NAME = 'clipaible_logs';
const LOG_PORT_BATCH_SIZE = 100; // Send 100 logs per message
const LOG_PORT_FLUSH_INTERVAL = 50; // Flush every 50ms
let logPortFlushTimer = null;
let reconnectTimeout = null; // Track reconnect timeout for cleanup

// Track if port is being flushed to avoid race conditions
let isFlushing = false;

/**
 * Initialize persistent connection to service worker for logging
 * This is more reliable than sendMessage for frequent messages
 */
export function initLogPort() {
  if (logPort) {
    return; // Already initialized
  }
  
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect) {
      logPort = chrome.runtime.connect({ name: LOG_PORT_NAME });
      
      // Handle port disconnection
      logPort.onDisconnect.addListener(() => {
        logPort = null;
        // Clear any existing reconnect timeout before creating a new one
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        // Try to reconnect after a delay
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          if (!logPort) {
            initLogPort();
          }
        }, 1000);
      });
    }
  } catch (e) {
    // Port initialization failed, will fallback to sendMessage
  }
}

/**
 * Flush queued logs through port
 */
function flushLogPortQueue() {
  if (logPortQueue.length === 0 || isFlushing) {
    return;
  }
  
  // If port is not available, try to initialize it
  if (!logPort) {
    initLogPort();
    // If still no port, schedule retry
    if (!logPort && logPortQueue.length > 0) {
      logPortFlushTimer = setTimeout(flushLogPortQueue, LOG_PORT_FLUSH_INTERVAL * 2);
    }
    return;
  }
  
  // Mark as flushing to prevent concurrent flushes
  isFlushing = true;
  
  try {
    // CRITICAL: Check if port is still connected before sending
    if (!logPort) {
      // Port was disconnected, try to reconnect
      initLogPort();
      if (!logPort) {
        // Still no port, add logs back to queue and return
        isFlushing = false;
        return;
      }
    }
    
    // Check if port has error (disconnected)
    if (chrome.runtime.lastError) {
      // Port is disconnected, clear it and try to reconnect
      logPort = null;
      initLogPort();
      if (!logPort) {
        // Still no port, add logs back to queue and return
        isFlushing = false;
        return;
      }
    }
    
    // Take up to BATCH_SIZE logs from queue
    const batch = logPortQueue.splice(0, LOG_PORT_BATCH_SIZE);
    
    // Send batch through port
    try {
      logPort.postMessage({
        type: 'logBatch',
        logs: batch.map(logEntry => ({
          message: logEntry.message,
          marker: logEntry.marker,
          data: logEntry.data,
          timestamp: logEntry.timestamp
        })),
        batchSize: batch.length,
        totalQueued: logPortQueue.length
      });
    } catch (postError) {
      // If postMessage fails, port is disconnected
      logPort = null;
      // Add logs back to queue
      for (const logEntry of batch) {
        if ((logEntry.retryCount || 0) < 3) {
          logEntry.retryCount = (logEntry.retryCount || 0) + 1;
          logPortQueue.push(logEntry);
        }
      }
      // Try to reconnect
      initLogPort();
    }
  } catch (e) {
    // If any error occurs, add logs back to queue
    const batch = logPortQueue.splice(0, LOG_PORT_BATCH_SIZE);
    for (const logEntry of batch) {
      if ((logEntry.retryCount || 0) < 3) {
        logEntry.retryCount = (logEntry.retryCount || 0) + 1;
        logPortQueue.push(logEntry);
      }
    }
    
    // Try to reconnect port
    logPort = null;
    initLogPort();
  } finally {
    isFlushing = false;
  }
  
  // Schedule next flush if queue is not empty
  if (logPortQueue.length > 0) {
    logPortFlushTimer = setTimeout(flushLogPortQueue, LOG_PORT_FLUSH_INTERVAL);
  } else {
    logPortFlushTimer = null;
  }
}

/**
 * Send log through persistent port connection
 * This is more reliable than sendMessage for frequent messages
 * @param {string} message - Log message
 * @param {string} marker - Optional marker
 * @param {*} data - Optional data
 * @throws {Error} If port cannot be initialized and queue is full
 */
export function logViaPort(message, marker = '', data = null) {
  const timestamp = Date.now();
  
  // Initialize port if not already done
  if (!logPort) {
    initLogPort();
  }
  
  // CRITICAL: If port is still not available after init, check if we should throw
  // This allows fallback to sendMessage in criticalLog
  if (!logPort) {
    // Port not available - this is OK, we'll queue and try later
    // Don't throw - let the queue handle it
  }
  
  // OPTIMIZED: Reduced from 10k to 5k to save memory
  // Prevent queue overflow with FIFO rotation
  const MAX_PORT_QUEUE_SIZE = 5000;
  if (logPortQueue.length >= MAX_PORT_QUEUE_SIZE) {
    // Remove oldest 20% of logs to make room (more aggressive rotation)
    const removeCount = Math.floor(MAX_PORT_QUEUE_SIZE * 0.2);
    logPortQueue.splice(0, removeCount);
    // Try to log warning (but don't use logViaPort to avoid recursion)
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ClipAIble] logViaPort: Queue overflow, removed', removeCount, 'oldest logs');
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Truncate data if too large
  let processedData = data;
  if (data && typeof data === 'object') {
    try {
      const jsonStr = JSON.stringify(data);
      const maxSize = 50000; // Smaller limit for port messages
      if (jsonStr.length > maxSize) {
        processedData = {
          _truncated: true,
          _originalSize: jsonStr.length,
          _message: 'Data truncated for port message size'
        };
      }
    } catch (e) {
      processedData = { _serializationError: true };
    }
  }
  
  // Add to queue (even if port is not available - will retry later)
  logPortQueue.push({
    message: message.length > 5000 ? message.substring(0, 5000) + '... [truncated]' : message,
    marker,
    data: processedData,
    timestamp,
    retryCount: 0
  });
  
  // Start flush timer if not already running
  if (!logPortFlushTimer) {
    logPortFlushTimer = setTimeout(flushLogPortQueue, LOG_PORT_FLUSH_INTERVAL);
  }
}

/**
 * Force flush all queued logs through port
 */
/**
 * Force flush all queued logs through port and wait for completion
 * Returns a promise that resolves when all logs are sent (or timeout)
 */
export function flushAllLogPortLogs() {
  // If port is not initialized, try to initialize it
  if (!logPort) {
    initLogPort();
  }
  
  // Clear any pending timer
  if (logPortFlushTimer) {
    clearTimeout(logPortFlushTimer);
    logPortFlushTimer = null;
  }
  
  // Flush remaining logs
  let flushCount = 0;
  const MAX_FLUSH_ITERATIONS = 100;
  
  while (logPortQueue.length > 0 && flushCount < MAX_FLUSH_ITERATIONS) {
    flushLogPortQueue();
    flushCount++;
  }
  
  return logPortQueue.length === 0;
}

/**
 * Returns the current size of the log queue.
 * @returns {number}
 */
export function getLogQueueSize() {
  return logPortQueue.length;
}

/**
 * Check if port is connected and ready
 * @returns {boolean}
 */
export function isLogPortReady() {
  return !!logPort;
}

