// @ts-check
// Keep-alive mechanism for background service worker
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize keep-alive module with dependencies
 * @param {import('../types.js').KeepAliveDeps} deps - Dependencies object
 * @returns {Object} Keep-alive functions
 */
export function initKeepAlive(deps) {
  const {
    log,
    logError,
    logWarn,
    CONFIG,
    getProcessingState,
    saveStateToStorageImmediate
  } = deps;

  const KEEP_ALIVE_ALARM = 'keepAlive';
  let isKeepAliveStarting = false; // Flag to prevent concurrent startKeepAlive() calls
  let consecutiveErrors = 0; // Counter for consecutive errors
  const MAX_CONSECUTIVE_ERRORS = 5; // Stop keep-alive after 5 consecutive errors
  let activeKeepAliveInterval = null; // Active interval for frequent pings during processing
  const ACTIVE_PROCESSING_PING_INTERVAL_MS = 5000; // 5 seconds - frequent pings during active processing

  /**
   * Perform keep-alive ping: check state and save to storage to keep service worker alive
   * This is the unified logic used by both alarm and interval
   * 
   * CRITICAL: Includes forced event loop wake-up to prevent SW death during blocking operations
   * @returns {Promise<boolean>} Returns true if keep-alive should continue, false if should stop
   */
  async function performKeepAlivePing() {
  // CRITICAL: Force event loop wake-up before any async operations
  // This ensures SW stays alive even if main thread is blocked by WASM/CPU-intensive operations
  await new Promise(resolve => setTimeout(resolve, 0));
  
  const state = getProcessingState();
  
  try {
    // Check both processingState AND summary_generating
    const result = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    let isSummaryGenerating = result.summary_generating && result.summary_generating_start_time;
    
    // CRITICAL: Check if summary_generating flag is stale (older than threshold)
    if (isSummaryGenerating && result.summary_generating_start_time && typeof result.summary_generating_start_time === 'number') {
      const timeSinceStart = Date.now() - result.summary_generating_start_time;
      if (timeSinceStart > CONFIG.SUMMARY_STALE_THRESHOLD_MS) {
        // Flag is stale, clear it (REDUCED LOGGING - only log once per stale flag)
        await chrome.storage.local.set({
          summary_generating: false,
          summary_generating_start_time: null
        });
        isSummaryGenerating = false;
      }
    }
    
    const isProcessing = state.isProcessing;
    
    // CRITICAL: Double-check state from storage to ensure accuracy
    // Sometimes in-memory state can be stale after service worker restart
    const storedState = /** @type {import('../types.js').ChromeStorageResult} */ (
      await chrome.storage.local.get(['processingState'])
    );
    /** @type {Partial<import('../types.js').ProcessingState>|undefined} */
    const storedProcessingState = storedState.processingState && typeof storedState.processingState === 'object' ? storedState.processingState : undefined;
    const storedIsProcessing = storedProcessingState?.isProcessing === true;
    
    // Use stored state if in-memory state is false but stored is true (more reliable)
    const actualIsProcessing = isProcessing || storedIsProcessing;
    
    // If neither is active, stop keep-alive (called from interval check)
    if (!actualIsProcessing && !isSummaryGenerating) {
      return false; // Signal to stop
    }
    
    // OPTIMIZED: Batch all storage saves into a single operation
    // This reduces storage write operations from 2 to 1 when both processing and summary are active
    const storageUpdates = {};
    
    if (actualIsProcessing) {
      // OPTIMIZED: Use unified saveStateToStorageImmediate() instead of duplicating save logic
      // This ensures consistency with state management module
      try {
        await saveStateToStorageImmediate();
      } catch (error) {
        // If immediate save fails, fallback to direct save for keep-alive
        logWarn('Immediate state save failed in keep-alive, using fallback', error);
        storageUpdates.processingState = { ...state, lastUpdate: Date.now(), isProcessing: true };
      }
    }
    
    // CRITICAL: Also keep alive if summary is generating
    if (isSummaryGenerating) {
      // Update timestamp to keep service worker alive
      storageUpdates.summary_generating = true;
      storageUpdates.summary_generating_start_time = result.summary_generating_start_time;
    }
    
    // Batch save all updates in a single operation
    if (Object.keys(storageUpdates).length > 0) {
      await chrome.storage.local.set(storageUpdates);
    }
    
    // CRITICAL: Additional event loop wake-up after storage operations
    // This ensures SW remains active even after async storage operations complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Reset error counter on success
    consecutiveErrors = 0;
    return true; // Signal to continue
  } catch (error) {
    consecutiveErrors++;
    
    // CRITICAL: Stop keep-alive after too many consecutive errors
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      logError('Keep-alive stopped: too many consecutive errors', {
        count: consecutiveErrors,
        maxAllowed: MAX_CONSECUTIVE_ERRORS,
        error: error?.message
      });
      return false; // Stop keep-alive
    }
    
    // CRITICAL: On error, check if we should actually continue
    // Don't continue if state is clearly not processing
    const currentState = getProcessingState();
    const isActuallyProcessing = currentState.isProcessing;
    
    if (isActuallyProcessing) {
      // OPTIMIZED: Use unified saveStateToStorageImmediate() instead of duplicating save logic
      try {
        await saveStateToStorageImmediate();
        // Force wake-up even on error path
        await new Promise(resolve => setTimeout(resolve, 0));
        // Log error but continue (unless too many consecutive errors)
        if (consecutiveErrors === 1) {
          // Only log first error to avoid spam
          logWarn('Keep-alive error (will retry)', {
            error: error?.message,
            consecutiveErrors
          });
        }
        return true; // Continue if actually processing
      } catch (fallbackError) {
        // Log persistent errors
        logWarn('Keep-alive persistent error', {
          error: fallbackError?.message,
          consecutiveErrors
        });
        return false; // Stop on persistent errors
      }
    }
    
    // Not processing - stop keep-alive
    return false; // Stop on error if not processing
  }
}

  /**
   * Start keep-alive mechanism
   * CRITICAL: Performs immediate ping + sets up alarms + frequent pings during active processing
   * @returns {void}
   */
  function startKeepAlive() {
  // Prevent concurrent calls: if already starting, skip
  if (isKeepAliveStarting) {
    logWarn('Keep-alive already starting, skipping duplicate call');
    return;
  }
  
  isKeepAliveStarting = true;
  
  try {
    // CRITICAL: Perform immediate keep-alive ping to prevent SW death right after start
    // This is essential when user switches tabs immediately after starting processing
    performKeepAlivePing().catch(error => {
      logWarn('Immediate keep-alive ping failed', error);
    });
    
    // CRITICAL: Start frequent pings during active processing (every 5 seconds)
    // This prevents SW death between alarm pings (alarms fire only every 1 minute)
    if (activeKeepAliveInterval) {
      clearInterval(activeKeepAliveInterval);
    }
    activeKeepAliveInterval = setInterval(async () => {
      const shouldContinue = await performKeepAlivePing();
      if (!shouldContinue) {
        // Processing stopped - clear interval
        if (activeKeepAliveInterval) {
          clearInterval(activeKeepAliveInterval);
          activeKeepAliveInterval = null;
        }
      }
    }, ACTIVE_PROCESSING_PING_INTERVAL_MS);
    
    // CRITICAL: Also set up alarms as backup (can wake terminated service workers)
    // Alarms can wake up terminated service workers, intervals cannot
    // MV3 requires >=1 minute for alarms
    chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: CONFIG.KEEP_ALIVE_INTERVAL });
    if (chrome.runtime.lastError) {
      logError('Keep-alive alarm creation failed', { error: chrome.runtime.lastError.message });
      // Without alarms, we cannot reliably keep service worker alive
      // This is a critical error, but we continue to allow processing to start
    }
    
    log('Keep-alive started (immediate ping + frequent pings + alarms)', { 
      immediatePing: true,
      frequentPingIntervalMs: ACTIVE_PROCESSING_PING_INTERVAL_MS,
      alarmIntervalMinutes: CONFIG.KEEP_ALIVE_INTERVAL,
      note: 'Frequent pings prevent SW death when user switches tabs'
    });
  } finally {
    isKeepAliveStarting = false;
  }
}

  /**
   * Stop keep-alive mechanism
   * @returns {Promise<void>}
   */
  async function stopKeepAlive() {
  // CRITICAL: Check if summary generation is active before stopping keep-alive
  // Summary generation is independent and should continue even if document/audio processing stops
  try {
    const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    const isSummaryGenerating = summaryState.summary_generating && summaryState.summary_generating_start_time;
    
    if (isSummaryGenerating) {
      log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
      return; // Don't stop keep-alive if summary is generating
    }
  } catch (error) {
    logWarn('Failed to check summary_generating in stopKeepAlive', error);
    // Continue with stop if check fails (safer to stop than hang)
  }
  
  // CRITICAL: Clear frequent ping interval
  if (activeKeepAliveInterval) {
    clearInterval(activeKeepAliveInterval);
    activeKeepAliveInterval = null;
  }
  
  try {
    chrome.alarms.clear(KEEP_ALIVE_ALARM);
  } catch (error) {
    logWarn('Failed to clear keep-alive alarm', error);
  }
  
  log('Keep-alive stopped (intervals + alarms cleared)');
}

  /**
   * Initialize keep-alive alarm listener
   * Must be called during service worker initialization
   * @returns {void}
   */
  function initKeepAliveListener() {
  try {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === KEEP_ALIVE_ALARM) {
        log('Keep-alive alarm ping');
        await performKeepAlivePing();
      }
    });
  } catch (error) {
    logError('Failed to register alarms.onAlarm listener', error);
  }
}

  // Backward compatibility: keep old function names but they're now no-ops
  // This ensures existing code that calls them doesn't break
  function startPeriodicStateSave() {
    // No-op: functionality merged into startKeepAlive()
    // Kept for backward compatibility
  }

  function stopPeriodicStateSave() {
    // No-op: functionality merged into stopKeepAlive()
    // Kept for backward compatibility
  }

  return {
    /** @type {function(): Promise<boolean>} */
    performKeepAlivePing,
    /** @type {function(): void} */
    startKeepAlive,
    /** @type {function(): Promise<void>} */
    stopKeepAlive,
    /** @type {function(): void} */
    initKeepAliveListener,
    /** @type {function(): void} */
    startPeriodicStateSave,
    /** @type {function(): void} */
    stopPeriodicStateSave
  };
}

