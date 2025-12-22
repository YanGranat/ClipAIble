// State management module
// Handles processing state polling, UI updates, and stage mapping

/**
 * Initialize state module
 * @param {Object} deps - Dependencies
 * @returns {Object} State functions
 */
export function initState(deps) {
  const {
    elements,
    t,
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
        elements.cancelBtn.style.display = 'block';
        elements.cancelBtn.disabled = false;
      }
      setStatus('processing', statusText, state.startTime || stateRefs.currentStartTime);
      setProgress(state.progress);
    } else if (state.error) {
      // Check if error is actually a cancellation - don't show as error
      const isCancelled = state.isCancelled || 
                         (state.error && (
                           state.error.includes('Cancelled') || 
                           state.error.includes('Отменено') || 
                           state.error.includes('Скасовано') ||
                           state.error.includes('Abgebrochen') ||
                           state.error.includes('Annulé') ||
                           state.error.includes('Cancelado') ||
                           state.error.includes('Annullato') ||
                           state.error.includes('已取消') ||
                           state.error.includes('キャンセル') ||
                           state.error.includes('취소됨')
                         ));
      
      if (isCancelled) {
        // Treat cancellation as ready state, not error
        stopTimerDisplay();
        elements.savePdfBtn.disabled = false;
        elements.savePdfBtn.style.display = 'block';
        if (elements.cancelBtn) {
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
            errorMessage = await t(errorKey).catch(() => state.error);
          }
        }
        setStatus('error', errorMessage);
        setProgress(0, false);
      }
    } else {
      // Processing complete (isProcessing === false) - update UI to ready state
      // CRITICAL: Check status for "Done!" or check if processing just completed
      const isDone = state.status === 'Done!' || (!state.isProcessing && !state.error);
      
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      
      if (isDone && state.status === 'Done!') {
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
        // Extract format name without "Save as" prefix
        const formatNameOnly = formatName.replace(/^(Save as|Сохранить как|Зберегти як|Speichern als|Enregistrer|Guardar|Salva|Salvar|另存为|として保存|로 저장)\s+/i, '');
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
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      // Use scheduleUIUpdate for consistency with polling (debounce + RAF)
      scheduleUIUpdate(state);
    } catch (error) {
      logError('Error getting state from background', error);
      // Fallback: try to load from storage
      try {
        const stored = await chrome.storage.local.get(['processingState']);
        if (stored.processingState) {
          const savedState = stored.processingState;
          const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
          
          // If state is recent (< 2 minutes), show it
          if (timeSinceUpdate < 2 * 60 * 1000 && savedState.isProcessing) {
            scheduleUIUpdate(savedState);
          }
        }
      } catch (storageError) {
        logError('Error loading from storage', storageError);
      }
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
        const state = await chrome.runtime.sendMessage({ action: 'getState' });
        
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
        logWarn('Failed to get state from background', { attempt: failedAttempts });
        
        // After 3 failed attempts, try storage
        if (failedAttempts >= 3) {
          try {
            const stored = await chrome.storage.local.get(['processingState']);
            if (stored.processingState && stored.processingState.isProcessing) {
              const timeSinceUpdate = Date.now() - (stored.processingState.lastUpdate || 0);
              if (timeSinceUpdate < 2 * 60 * 1000) {
                scheduleUIUpdate(stored.processingState);
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

