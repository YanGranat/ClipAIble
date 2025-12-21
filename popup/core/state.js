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
    const stageLabel = await mapStageLabel(state.currentStage);
    const statusText = stageLabel || state.status;
    
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
    } else if (state.status === 'Done!') {
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
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
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      const readyText = await t('ready');
      setStatus('ready', readyText);
      setProgress(0, false);
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

  // Debounce and RAF-based UI update scheduler
  let pendingUIUpdate = null;
  let lastUIUpdateTime = 0;
  // CRITICAL: Increase debounce interval for audio format to reduce lag during TTS
  // Audio generation has many progress updates (one per chunk), so we need longer debounce
  let MIN_UI_UPDATE_INTERVAL = 100; // Default: Max 10 updates per second (100ms debounce)
  let lastScheduledState = null;

  // Schedule UI update with debounce and requestAnimationFrame
  function scheduleUIUpdate(state) {
    // Store latest state
    lastScheduledState = state;
    
    // CRITICAL: Use longer debounce interval for audio format to reduce lag during TTS
    // Audio generation has many progress updates, so we need to throttle more aggressively
    const isAudioFormat = state?.outputFormat === 'audio';
    const currentMinInterval = isAudioFormat ? 250 : MIN_UI_UPDATE_INTERVAL; // 250ms for audio (4 updates/sec), 100ms for others
    
    // If update already scheduled, skip (will use latest state)
    if (pendingUIUpdate) {
      return;
    }
    
    // Check debounce interval
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUIUpdateTime;
    
    if (timeSinceLastUpdate < currentMinInterval) {
      // Too soon - schedule for later
      const delay = currentMinInterval - timeSinceLastUpdate;
      pendingUIUpdate = setTimeout(() => {
        pendingUIUpdate = null;
        scheduleUIUpdate(lastScheduledState);
      }, delay);
      return;
    }
    
    // Schedule via requestAnimationFrame for smooth DOM updates
    pendingUIUpdate = requestAnimationFrame(async () => {
      pendingUIUpdate = null;
      lastUIUpdateTime = Date.now();
      
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
      
      isPolling = true;
      try {
        const state = await chrome.runtime.sendMessage({ action: 'getState' });
        
        // Use lightweight comparison instead of JSON.stringify
        const changed = stateChanged(state, lastState);
        
        if (changed) {
          // State changed - reset adaptive polling
          noChangeCount = 0;
          
          // Schedule UI update with debounce and RAF
          scheduleUIUpdate(state);
          lastState = state;
          
          // Determine polling interval based on format and processing state
          // Audio formats (especially offline TTS) are slower - use longer interval
          // CRITICAL: Check outputFormat from state (saved at start of processing)
          const isAudioFormat = state.outputFormat === 'audio';
          const baseInterval = isAudioFormat ? 1000 : 500; // 1s for audio, 500ms for others
          
          pollInterval = state.isProcessing ? baseInterval : 2000;
          
          // Log polling interval for debugging
          if (state.isProcessing) {
            console.log('[ClipAIble State Polling] Polling interval set', {
              outputFormat: state.outputFormat,
              isAudioFormat,
              baseInterval,
              pollInterval,
              isProcessing: state.isProcessing
            });
          }
        } else {
          // State didn't change - increase interval (adaptive polling)
          noChangeCount++;
          
          // Exponential backoff: baseInterval → baseInterval*1.5 → baseInterval*2.25 → ... → 2000ms
          // For idle: 2000ms (no backoff needed)
          if (state.isProcessing) {
            const isAudioFormat = state.outputFormat === 'audio';
            const baseInterval = isAudioFormat ? 1000 : 500;
            pollInterval = Math.min(baseInterval * Math.pow(1.5, noChangeCount), 2000);
          } else {
            pollInterval = 2000; // Keep 2s for idle state
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
        
        // Check summary status even on errors
        await checkSummaryStatus();
        
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

