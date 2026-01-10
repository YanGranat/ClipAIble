// @ts-check
// Initialization logic for background service worker
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize extension initialization module with dependencies
 * @param {import('../types.js').InitializationDeps} deps - Dependencies object
 * @returns {function(): void} initExtension function
 */
export function initInitialization(deps) {
  const {
    log,
    logWarn,
    CONFIG,
    handleError,
    clearDecryptedKeyCache,
    getProcessingState,
    restoreStateFromStorage,
    runInitialization,
    startKeepAlive
  } = deps;

  /**
   * Initialize extension - use setTimeout to avoid blocking module loading
   * This function handles:
   * - Clearing decrypted key cache (security)
   * - Resetting stale processing state on extension reload
   * - Clearing summary on extension reload
   * - Restoring state if it's recent (quick restart)
   * - Running initialization tasks (migration, default settings)
   * @returns {void}
   */
  function initExtension() {
  setTimeout(() => {
    try {
      log('Extension loaded', { config: CONFIG });
    } catch (error) {
      // CRITICAL: Fallback to console.error if logging system itself fails
      // This is the only place where console.error is acceptable - it's a fallback
      // when the centralized logging system cannot be used
      console.error('[ClipAIble] Failed to log (logging system error):', error);
    }

    // SECURITY: Clear decrypted key cache on service worker restart
    // This ensures keys don't remain in memory after SW restart
    clearDecryptedKeyCache();
    log('Decrypted key cache cleared on service worker start (security)');

    // CRITICAL: On extension reload/restart, ALWAYS reset all generation flags AND clear summary
    // This ensures clean state after extension reload
    // Check if this is a fresh start (no active processing) and reset flags
    (async () => {
      try {
        const result = /** @type {import('../types.js').ChromeStorageResult & {summary_text?: string, summary_saved_timestamp?: number}} */ (
          await chrome.storage.local.get(['processingState', 'summary_generating', 'summary_generating_start_time', 'summary_text', 'summary_saved_timestamp'])
        );
        /** @type {Partial<import('../types.js').ProcessingState>|undefined} */
        const processingState = result.processingState && typeof result.processingState === 'object' ? result.processingState : undefined;
        const hasProcessingState = processingState && processingState.isProcessing === true;
        const hasSummaryGenerating = result.summary_generating;
        const hasSummary = result.summary_text;
        
        // CRITICAL: If extension was reloaded, reset all flags AND clear summary completely
        // We can't distinguish reload from restart, so we ALWAYS reset on service worker start
        // Only restore if state is very recent (< 1 minute) - this handles quick service worker restarts
        const RESET_THRESHOLD = CONFIG.RESET_THRESHOLD_MS;
        
        // CRITICAL: Always clear summary on extension reload (one of 3 events that must clear summary)
        // Summary should not persist across extension reloads - user expects clean state
        if (hasSummary) {
          const savedTimestamp = result.summary_saved_timestamp;
          const summaryAge = savedTimestamp && typeof savedTimestamp === 'number' ? (Date.now() - savedTimestamp) : Infinity;
          
          log('Extension reloaded - clearing summary (always clear on reload)', {
            hasSummary: true,
            savedTimestamp,
            summaryAge,
            summaryAgeSeconds: Math.round(summaryAge / 1000)
          });
          
          try {
            await chrome.storage.local.remove(['summary_text', 'summary_saved_timestamp']);
            log('Summary cleared from storage on extension reload');
          } catch (error) {
            const normalized = await handleError(error, {
              source: 'initialization',
              errorType: 'storageRemoveFailed',
              logError: false,
              createUserMessage: true, // Use centralized user-friendly message
              context: { operation: 'removeSummaryText' }
            });
            logWarn('Failed to remove summary_text on reload', normalized);
          }
        } else {
          log('Extension reloaded - no summary to clear', {
            hasSummary: false
          });
        }
        
        if (hasProcessingState && processingState) {
          const lastUpdate = processingState.lastUpdate;
          const timeSinceUpdate = lastUpdate && typeof lastUpdate === 'number' ? (Date.now() - lastUpdate) : Infinity;
          if (timeSinceUpdate > RESET_THRESHOLD) {
            log('Extension reloaded - resetting processingState (too old)', {
              timeSinceUpdate,
              threshold: RESET_THRESHOLD
            });
            try {
              await chrome.storage.local.remove(['processingState']);
            } catch (error) {
              const normalized = await handleError(error, {
                source: 'initialization',
                errorType: 'storageRemoveFailed',
                logError: false,
                createUserMessage: true, // Use centralized user-friendly message
                context: { operation: 'removeProcessingState' }
              });
              logWarn('Failed to remove processingState on reload', normalized);
            }
          } else {
            log('ProcessingState is recent - may restore (quick restart)', {
              timeSinceUpdate,
              threshold: RESET_THRESHOLD
            });
          }
        }
        
        if (hasSummaryGenerating) {
          // CRITICAL: Always reset summary_generating flag on extension reload
          // Extension reload means service worker was restarted, so generation cannot continue
          log('Extension reloaded - resetting summary_generating flag (always reset on reload)', {
            startTime: result.summary_generating_start_time,
            timestamp: Date.now()
          });
          try {
            await chrome.storage.local.set({
              summary_generating: false,
              summary_generating_start_time: null
            });
            log('summary_generating flag cleared on extension reload');
          } catch (error) {
            const normalized = await handleError(error, {
              source: 'initialization',
              errorType: 'storageSetFailed',
              logError: false,
              createUserMessage: true, // Use centralized user-friendly message
              context: { operation: 'clearSummaryGenerating' }
            });
            logWarn('Failed to clear summary_generating on reload', normalized);
          }
        }
        
        // CRITICAL: After resetting stale flags, restore state only if it's recent (quick restart)
        // This handles service worker restarts during active generation, but resets on extension reload
        try {
          await restoreStateFromStorage();
          setTimeout(async () => {
            try {
              const state = getProcessingState();
              
              // CRITICAL: Only restore keep-alive if state is very recent (< 1 minute)
              // This ensures we don't restore on extension reload
              if (state.isProcessing) {
                const stateAge = Date.now() - (state.startTime || 0);
                if (stateAge < RESET_THRESHOLD) {
                  log('Processing state is recent - restoring keep-alive (quick restart)', {
                    status: state.status,
                    progress: state.progress,
                    stage: state.currentStage,
                    stateAge
                  });
                  startKeepAlive();
                } else {
                  log('Processing state is too old - not restoring (extension reload)', {
                    stateAge,
                    threshold: RESET_THRESHOLD
                  });
                }
              } else {
                // CRITICAL: Don't restore summary_generating on service worker start
                // Extension reload always means generation was interrupted - flag is already cleared above
                // This prevents infinite "generating" state after extension reload
                log('Service worker started - summary_generating was already cleared on extension reload');
              }
            } catch (error) {
              const normalized = await handleError(error, {
                source: 'initialization',
                errorType: 'keepAliveRestoreFailed',
                logError: false,
                createUserMessage: false
              });
              logWarn('Failed to restore keep-alive on service worker start', normalized);
            }
          }, 100);
        } catch (error) {
          const normalized = await handleError(error, {
            source: 'initialization',
            errorType: 'stateRestoreFailed',
            logError: false,
            createUserMessage: false
          });
          logWarn('Failed to restore state on service worker start', normalized);
        }
      } catch (error) {
        const normalized = await handleError(error, {
          source: 'initialization',
          errorType: 'stateCheckFailed',
          logError: false,
          createUserMessage: false
        });
        logWarn('Failed to check state on extension load', normalized);
      }
    })();

    // Run initialization tasks (migration and default settings)
    runInitialization();
  }, 0);
  }

  return initExtension;
}

/**
 * @typedef {function(): void} ExtensionInitFunction
 */

