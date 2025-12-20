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
      await updateUIFromState(state);
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
            updateUIFromState(savedState);
          }
        }
      } catch (storageError) {
        logError('Error loading from storage', storageError);
      }
    }
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
        
        // Check if state changed
        const stateChanged = JSON.stringify(state) !== JSON.stringify(lastState);
        
        if (stateChanged) {
          // State changed - reset adaptive polling
          noChangeCount = 0;
          await updateUIFromState(state);
          lastState = state;
          
          // Use faster polling when processing (increased from 300ms to 500ms)
          pollInterval = state.isProcessing ? 500 : 2000;
        } else {
          // State didn't change - increase interval (adaptive polling)
          noChangeCount++;
          
          // Exponential backoff: 500ms → 750ms → 1125ms → 1687ms → 2000ms (for processing)
          // For idle: 2000ms (no backoff needed)
          if (state.isProcessing) {
            pollInterval = Math.min(500 * Math.pow(1.5, noChangeCount), 2000);
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
                await updateUIFromState(stored.processingState);
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

