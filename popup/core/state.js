// @ts-check
// State management module
// Handles processing state polling, UI updates, and stage mapping

/**
 * Initialize state module
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.setStatus - Set status function
 * @param {Function} deps.setProgress - Set progress function
 * @param {Function} deps.stopTimerDisplay - Stop timer display function
 * @param {Function} deps.startTimerDisplay - Start timer display function
 * @param {Function} deps.checkSummaryStatus - Check summary status function
 * @param {Object} deps.stateRefs - State references object
 * @returns {Object} State functions
 */
export function initState(deps) {
  const {
    elements,
    t,
    log,
    logError,
    logWarn,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    checkSummaryStatus,
    stateRefs
  } = deps;

  async function mapStageLabel(stageId) {
    switch (stageId) {
      case 'starting': return await t('stageStarting');
      case 'analyzing': return await t('stageAnalyzing');
      case 'extracting': return await t('stageExtracting');
      case 'translating': return await t('stageTranslating');
      case 'loading_images': return await t('stageLoadingImages');
      case 'generating': return await t('stageGenerating');
      case 'complete': return await t('stageComplete');
      default: return null;
    }
  }

  // Update UI based on processing state
  async function updateUIFromState(state) {
    if (!state) return;
    
    // Simple update - no special handling for audio format
    const stageLabel = await mapStageLabel(state.currentStage);
    const statusText = stageLabel || state.status;
    await performUIUpdate(state, statusText);
  }
  
  // Perform actual UI updates
  async function performUIUpdate(state, statusText) {
    if (state.isProcessing) {
      // Use startTime from background (persists across popup reopens)
      if (state.startTime) {
        if (stateRefs.currentStartTime !== state.startTime) {
          startTimerDisplay(state.startTime);
        }
        // Ensure timer is running even if startTime was already set
        if (!stateRefs.timerInterval && state.startTime) {
          startTimerDisplay(state.startTime);
        }
      }
      
      // Simple UI update - no special handling needed
      elements.savePdfBtn.disabled = true;
      elements.savePdfBtn.style.display = 'none';
      if (elements.cancelBtn) {
        elements.cancelBtn.classList.remove('hidden');
        elements.cancelBtn.style.display = 'block';
        elements.cancelBtn.disabled = false;
      }
      setStatus('processing', statusText, state.startTime || stateRefs.currentStartTime);
      setProgress(state.progress);
    } else if (state.error || state.isCancelled) {
      // Check if error is actually a cancellation - don't show as error
      // Use localized statusCancelled value for comparison
      const statusCancelledText = await t('statusCancelled');
      const isCancelled = state.isCancelled || 
                         (state.error && state.error.includes(statusCancelledText));
      
      if (isCancelled) {
        // Treat cancellation as ready state, not error
        stopTimerDisplay();
        elements.savePdfBtn.disabled = false;
        elements.savePdfBtn.style.display = 'block';
        if (elements.cancelBtn) {
          elements.cancelBtn.classList.add('hidden');
          elements.cancelBtn.style.display = 'none';
        }
        const readyText = await t('ready');
        setStatus('ready', readyText);
        setProgress(0, false);
      } else {
        // Real error - show as error
        stopTimerDisplay();
        elements.savePdfBtn.disabled = false;
        elements.savePdfBtn.style.display = 'block';
        if (elements.cancelBtn) {
          elements.cancelBtn.classList.add('hidden');
          elements.cancelBtn.style.display = 'none';
        }
        // Use localized error message if errorCode is available
        let errorMessage = state.error;
        if (state.errorCode) {
          const errorKeyMap = {
            'auth_error': 'errorAuth',
            'rate_limit': 'errorRateLimit',
            'timeout': 'errorTimeout',
            'network_error': 'errorNetwork',
            'parse_error': 'errorParse',
            'provider_error': 'errorProvider',
            'validation_error': 'errorValidation',
            'unknown_error': 'errorUnknown'
          };
          const errorKey = errorKeyMap[state.errorCode];
          if (errorKey) {
            errorMessage = await t(errorKey).catch(() => state.error || 'Unknown error');
          }
        }
        setStatus('error', errorMessage);
        setProgress(0, false);
      }
    } else {
      // Processing complete (isProcessing === false) - update UI to ready state
      // CRITICAL: Check status for "Done!" or check if processing just completed
      // Use localized statusDone value for comparison
      const statusDoneText = await t('statusDone');
      const isDone = state.status === statusDoneText || (!state.isProcessing && !state.error);
      
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.classList.add('hidden');
        elements.cancelBtn.style.display = 'none';
      }
      
      if (isDone && state.status === statusDoneText) {
        // Get saved format from state or current selection
        const savedFormat = state.outputFormat || elements.mainFormatSelect?.value || elements.outputFormat?.value || 'pdf';
        const formatNames = {
          pdf: await t('saveAsPdf'),
          epub: await t('saveAsEpub'),
          fb2: await t('saveAsFb2'),
          markdown: await t('saveAsMarkdown'),
          audio: await t('saveAsAudio')
        };
        const formatName = formatNames[savedFormat] || formatNames.pdf;
        // Extract format name without "Save as" prefix using localized value
        const contextMenuSaveAsText = await t('contextMenuSaveAs');
        // Remove localized "Save as" prefix if present (with space after it)
        const formatNameOnly = formatName.replace(new RegExp(`^${contextMenuSaveAsText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '');
        const savedText = await t('savedSuccessfully');
        const successMessage = `${formatNameOnly} ${savedText}`;
        setStatus('ready', successMessage);
        setProgress(0, false); // Hide progress bar immediately
      } else {
        // Processing completed but status not set to "Done!" - show ready state
        const readyText = await t('ready');
        setStatus('ready', readyText);
        setProgress(0, false);
      }
    }
  }

  // Check processing state
  async function checkProcessingState() {
    // IMPROVED: Try both SW and storage in parallel for better reliability
    const [swState, storageState] = await Promise.allSettled([
      // Try to get state from service worker
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      }),
      // Try to get state from storage (fallback)
      chrome.storage.local.get(['processingState']).then(result => result.processingState || null)
    ]);
    
    // Prefer SW state if available
    if (swState.status === 'fulfilled' && swState.value) {
      scheduleUIUpdate(swState.value);
      return;
    }
    
    // CRITICAL: Don't show old state from storage after extension reload
    // If SW connection failed (rejected), it means extension was reloaded
    // In this case, always start with clean state - don't restore old processing state
    const swConnectionFailed = swState.status === 'rejected';
    const swConnectionError = swState.status === 'rejected' ? swState.reason?.message || String(swState.reason) : '';
    const isExtensionReload = swConnectionError.includes('Extension context invalidated') || 
                              swConnectionError.includes('Receiving end does not exist') ||
                              swConnectionError.includes('Could not establish connection');
    
    if (isExtensionReload) {
      // Extension was reloaded - don't show old state, start fresh
      log('Extension reloaded detected - starting with clean state (not restoring old processing state)');
      // CRITICAL: Clear any old error state from storage when extension is reloaded
      chrome.storage.local.remove(['processingState']).catch(() => {
        // Ignore errors when clearing
      });
      return; // Return without updating UI - will show default "ready" state
    }
    
    // Fallback to storage only if SW is available but returned null (processing still active)
    // This handles cases where SW is running but state hasn't been updated yet
    // CRITICAL: Don't show cancelled state from storage
    if (storageState.status === 'fulfilled' && storageState.value && !swConnectionFailed) {
      /** @type {{isProcessing?: boolean, lastUpdate?: number, isCancelled?: boolean, [key: string]: any}} */
      const savedState = storageState.value;
      
      // Don't show cancelled state - it should be cleared
      if (savedState.isCancelled) {
        log('State in storage is cancelled - ignoring (should be cleared)', {
          timeSinceUpdate: Date.now() - (savedState.lastUpdate || 0)
        });
        // Try to clear it
        chrome.storage.local.remove(['processingState']).catch(() => {});
        return;
      }
      
      // CRITICAL: Don't show old error state from storage - errors should be cleared on reload
      // Only show errors if they're very recent (< 10 seconds) and processing is not active
      if (savedState.error && !savedState.isProcessing) {
        const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
        if (timeSinceUpdate > 10 * 1000) {
          // Old error state - clear it
          log('Old error state in storage - clearing (extension was reloaded)', {
            timeSinceUpdate,
            error: savedState.error,
            errorCode: savedState.errorCode
          });
          chrome.storage.local.remove(['processingState']).catch(() => {});
          return;
        }
      }
      
      const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
      
      // Only show state from storage if it's very recent (< 30 seconds) and processing is active
      // This handles quick state updates, not stale state after reload
      if (timeSinceUpdate < 30 * 1000 && savedState.isProcessing) {
        logWarn('Using state from storage (SW returned null, state is recent)', {
          timeSinceUpdate,
          status: savedState.status
        });
        scheduleUIUpdate(savedState);
        return;
      }
    }
    
    // Log errors if both failed (but don't show old state)
    if (swState.status === 'rejected' && !isExtensionReload) {
      logError('Error getting state from background', swState.reason);
    }
    if (storageState.status === 'rejected') {
      logError('Error loading from storage', storageState.reason);
    }
  }

  // Lightweight state comparison - only check key fields instead of full JSON.stringify
  // This avoids blocking the main thread with expensive serialization
  function stateChanged(newState, oldState) {
    if (!oldState) return true;
    
    // Compare only critical fields that affect UI
    return (
      newState.isProcessing !== oldState.isProcessing ||
      newState.progress !== oldState.progress ||
      newState.status !== oldState.status ||
      newState.currentStage !== oldState.currentStage ||
      newState.error !== oldState.error ||
      newState.errorCode !== oldState.errorCode ||
      newState.isCancelled !== oldState.isCancelled ||
      newState.outputFormat !== oldState.outputFormat ||
      newState.startTime !== oldState.startTime
    );
  }

  // Simple UI update scheduler - no complex optimizations needed
  let pendingUIUpdate = null;
  let lastScheduledState = null;

  // Schedule UI update with simple debounce
  function scheduleUIUpdate(state) {
    // Store latest state
    lastScheduledState = state;
    
    // If update already scheduled, skip (will use latest state)
    if (pendingUIUpdate) {
      return;
    }
    
    // Schedule via requestAnimationFrame for smooth DOM updates
    pendingUIUpdate = requestAnimationFrame(async () => {
      pendingUIUpdate = null;
      if (lastScheduledState) {
        await updateUIFromState(lastScheduledState);
      }
    });
  }

  // Start polling for state updates
  function startStatePolling() {
    // Clear existing timeout
    if (stateRefs.statePollingTimeout) {
      clearTimeout(stateRefs.statePollingTimeout);
    }
    
    let pollInterval = 2000; // Default 2s for idle (increased from 1s to reduce load)
    let failedAttempts = 0;
    let lastState = null; // Track last state for adaptive polling
    let noChangeCount = 0; // Count consecutive polls with no changes
    let isPolling = false; // Flag to prevent concurrent poll() calls
    
    async function poll() {
      // Prevent concurrent calls
      if (isPolling) {
        return;
      }
      
      // CRITICAL: For audio format during processing, use longer interval to reduce load
      // But still poll occasionally to detect completion
      // If processing is complete (isProcessing === false), always check state to update UI
      const isAudioFormat = lastState?.outputFormat === 'audio';
      const isProcessing = lastState?.isProcessing;
      
      // If audio is processing, use longer interval but still poll to detect completion
      // Don't skip polling entirely - we need to detect when processing completes
      if (isAudioFormat && isProcessing) {
        // Audio is still processing - use longer interval to reduce load
        // But poll at least every 5 seconds to detect completion
        pollInterval = 5000; // Check every 5 seconds during processing
        // Continue to poll below - don't return, we need to check state
      }
      
      isPolling = true;
      try {
        // For non-audio, use normal polling
        // Use callback-based API to properly handle lastError
        const state = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          });
        });
        
        // Use lightweight comparison instead of JSON.stringify
        const changed = stateChanged(state, lastState);
        
        if (changed) {
          // State changed - reset adaptive polling
          noChangeCount = 0;
          
          // Schedule UI update with debounce and RAF
          scheduleUIUpdate(state);
          lastState = state;
          
          // Simple polling interval - no special handling for audio
          if (state.isProcessing) {
            pollInterval = 500; // 500ms during processing
          } else {
            pollInterval = 500; // 500ms after completion to quickly update UI
          }
        } else {
          // State didn't change - use standard interval
          noChangeCount++;
          if (state.isProcessing) {
            pollInterval = 1000; // 1s if no changes during processing
          } else {
            pollInterval = 2000; // 2s for idle state
          }
        }
        
        failedAttempts = 0;
        
        // Check summary generation status from storage
        await checkSummaryStatus();
        
      } catch (error) {
        failedAttempts++;
        const errorMsg = error.message || String(error);
        
        // CRITICAL: Stop polling if receiver is closed (connection error)
        if (errorMsg.includes('Could not establish connection') || 
            errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Extension context invalidated')) {
          logWarn('Receiver closed, trying storage fallback before stopping', { error: errorMsg });
          
          // IMPROVED: Try storage immediately on connection error (SW likely restarted)
          try {
            const stored = await chrome.storage.local.get(['processingState']);
            if (stored.processingState) {
              /** @type {{isProcessing?: boolean, lastUpdate?: number, [key: string]: any}} */
              const savedState = stored.processingState;
              if (savedState.isProcessing) {
                const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
                // Allow longer timeout for connection errors (SW restart scenario)
                if (timeSinceUpdate < 5 * 60 * 1000) { // 5 minutes for SW restart recovery
                  logWarn('Using state from storage after connection error', {
                    timeSinceUpdate,
                    status: savedState.status
                  });
                  scheduleUIUpdate(savedState);
                  // Continue polling with longer interval to check if SW recovers
                  pollInterval = 5000; // 5 seconds
                  isPolling = false;
                  stateRefs.statePollingTimeout = setTimeout(poll, pollInterval);
                  return; // Continue polling with storage fallback
                }
              }
            }
          } catch (e) {
            logError('Error loading from storage after connection error', e);
          }
          
          // If no valid state in storage, stop polling
          stateRefs.statePollingTimeout = null;
          return; // Stop polling
        }
        
        logWarn('Failed to get state from background', { attempt: failedAttempts, error: errorMsg });
        
        // IMPROVED: Try storage earlier (after 1 failed attempt instead of 3)
        if (failedAttempts >= 1) {
          try {
            const stored = await chrome.storage.local.get(['processingState']);
            if (stored.processingState) {
              /** @type {{isProcessing?: boolean, lastUpdate?: number, [key: string]: any}} */
              const savedState = stored.processingState;
              if (savedState.isProcessing) {
                const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
                if (timeSinceUpdate < 2 * 60 * 1000) {
                  logWarn('Using state from storage after SW error', {
                    attempt: failedAttempts,
                    timeSinceUpdate,
                    status: savedState.status
                  });
                  scheduleUIUpdate(savedState);
                }
              }
            }
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        // Check summary status even on errors (defer for audio)
        const isAudioFormat = lastState?.outputFormat === 'audio';
        if (isAudioFormat && lastState?.isProcessing) {
          setTimeout(async () => {
            await checkSummaryStatus();
          }, 0);
        } else {
          await checkSummaryStatus();
        }
        
        // Increase interval on errors
        pollInterval = Math.min(pollInterval * 2, 5000);
      } finally {
        // Always reset polling flag to allow next poll
        isPolling = false;
      }
      
      // Schedule next poll
      stateRefs.statePollingTimeout = setTimeout(poll, pollInterval);
    }
    
    poll();
  }

  return {
    checkProcessingState,
    startStatePolling,
    updateUIFromState,
    mapStageLabel
  };
}

