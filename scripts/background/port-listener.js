// @ts-check
// Port connection listener for persistent logging from offscreen documents
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize port connection listener for offscreen document logging
 * @param {import('../types.js').PortListenerDeps} deps - Dependencies object
 * @returns {function(): void} initPortListener function
 */
export function initPortListener(deps) {
  const {
    log,
    logError,
    addLogToCollection
  } = deps;

  /**
   * Initialize port connection listener for offscreen document logging
   * Must be called during service worker initialization
   * @returns {void}
   */
  function setupPortListener() {
  try {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'clipaible_logs') {
        log('=== background.js: Log port connected from offscreen ===', {
          timestamp: Date.now(),
          senderUrl: port.sender?.url
        });
        
        port.onMessage.addListener((message) => {
          if (message.type === 'logBatch' && Array.isArray(message.logs)) {
            // Process batched logs from offscreen document
            const { logs, batchSize, totalQueued } = message;
            
            for (const logEntry of logs) {
              const { message: logMsg, marker, data, timestamp } = logEntry;
              const fullLogMessage = `[CRITICAL_LOG${marker ? ` ${marker}` : ''}] ${logMsg}`;
              
              // Add to unlimited log collection (bypasses Chrome console limit)
              addLogToCollection(fullLogMessage, {
                marker,
                data,
                timestamp,
                source: 'offscreen-port',
                senderUrl: port.sender?.url
              }, 'error');
              
              // Log to background console (ALWAYS VISIBLE)
              console.error(fullLogMessage, data || '');
              
              // Also use standard log function
              log(fullLogMessage, {
                marker,
                data,
                timestamp,
                source: 'offscreen-port',
                senderUrl: port.sender?.url
              });
            }
            
            // Log batch summary
            if (batchSize > 1) {
              log(`[CRITICAL_LOG_BATCH_PORT] Processed ${batchSize} logs, ${totalQueued || 0} remaining in queue`, {
                batchSize,
                totalQueued,
                source: 'offscreen-port'
              });
            }
          }
        });
        
        port.onDisconnect.addListener(() => {
          log('=== background.js: Log port disconnected ===', {
            timestamp: Date.now()
          });
        });
      }
    });
  } catch (e) {
    logError('Failed to register chrome.runtime.onConnect listener', e);
  }
  }

  return setupPortListener;
}

// Note: No backward compatibility export needed - all modules use DI now
// The initPortListener function is exported directly and used with DI in background.js

