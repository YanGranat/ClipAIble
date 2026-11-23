// @ts-check
// State management module
// Handles processing state polling, UI updates, and stage mapping

import { getDocumentReadyMessage } from '../../scripts/locales.js';
import { getProcessingPhase, readProcessingSnapshot } from '../../scripts/state/processing-messages.js';

/** @typedef {import('../../scripts/state/processing-messages.js').ProcessingSnapshot} ProcessingSnapshot */

const STAGE_MESSAGES = {
  starting: 'stageStarting', analyzing: 'stageAnalyzing', extracting: 'stageExtracting', translating: 'stageTranslating',
  loading_images: 'stageLoadingImages', generating: 'stageGenerating', complete: 'stageComplete'
};

/** @returns {Promise<ProcessingSnapshot|null>} */
function requestProcessingState() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getState' }, response => {
      const transportError = chrome.runtime.lastError;
      if (transportError) {
        reject(new Error(transportError.message));
      } else if (response?.success === false) {
        resolve({
          isProcessing: false,
          error: response.error || 'Unable to read processing state',
          errorCode: response.errorCode,
          errorTranslationKey: response.translationKey,
          errorTranslationParams: response.translationParams
        });
      } else {
        resolve(readProcessingSnapshot(response));
      }
    });
  });
}

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
 * @param {Function} [deps.checkKeyThesesStatus] - Check key theses status function
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
    checkKeyThesesStatus,
    stateRefs
  } = deps;

  async function mapStageLabel(stageId) {
    const key = STAGE_MESSAGES[stageId];
    return key ? t(key) : null;
  }

  let renderRevision = 0;
  let readRevision = 0;
  let acceptedRead = 0;
  /** @type {string|null} */
  let presentedRunId = null;
  /** @type {ProcessingSnapshot|null} */
  let lastScheduledState = null;

  /** @param {ProcessingSnapshot} state */
  async function preparePresentation(state) {
    const phase = state.phase ?? getProcessingPhase(state);
    if (phase === 'running') {
      const key = state.statusTranslationKey || STAGE_MESSAGES[state.currentStage];
      if (key) {
        const params = state.statusTranslationParams || {};
        return { kind: 'processing', text: await t(key, null, params), translation: { key, params } };
      }
      return { kind: 'processing', text: state.status, translation: null };
    }

    if (phase === 'failed') {
      const cancelledText = state.phase === undefined ? await t('statusCancelled') : null;
      if (!cancelledText || !state.error?.includes(cancelledText)) {
        const errorKeys = {
          auth_error: 'errorAuth', rate_limit: 'errorRateLimit', timeout: 'errorTimeout', network_error: 'errorNetwork',
          parse_error: 'errorParse', provider_error: 'errorProvider', validation_error: 'errorValidation', unknown_error: 'errorUnknown'
        };
        const key = state.errorTranslationKey || errorKeys[state.errorCode];
        const translation = key ? (state.errorTranslationKey ? { key, params: state.errorTranslationParams || {} } : { key }) : null;
        const text = translation ? await t(key, null, translation.params).catch(() => state.error) : state.error;
        return { kind: 'error', text, translation };
      }
    }

    if (phase === 'complete' || (phase === 'idle' && !state.phase && state.status && state.status === await t('statusDone'))) {
      const format = state.outputFormat || elements.mainFormatSelect?.value || elements.outputFormat?.value;
      const formats = { epub: 'formatEpub', fb2: 'formatFb2', markdown: 'formatMarkdown', audio: 'formatAudio' };
      const formatKey = formats[format] || 'formatPdf';
      const message = getDocumentReadyMessage(await t(formatKey), state.imageTranslationFailureCount);
      return { kind: 'ready', text: await t(message.key, null, message.params), translation: { ...message, formatKey } };
    }
    return { kind: 'ready', text: await t('ready'), translation: { key: 'ready' } };
  }

  /** @param {ProcessingSnapshot} state @param {number} revision */
  async function updateUIFromState(state, revision = ++renderRevision) {
    if (!state) return;
    const presentation = await preparePresentation(state);
    if (revision !== renderRevision) return;

    const isProcessing = presentation.kind === 'processing';
    presentedRunId = isProcessing ? state.processingRunId ?? null : null;
    if (isProcessing) {
      if (state.startTime && (stateRefs.currentStartTime?.current !== state.startTime || !stateRefs.timerInterval?.current)) {
        startTimerDisplay(state.startTime);
      }
    } else {
      stopTimerDisplay();
    }
    if (elements.savePdfBtn) {
      elements.savePdfBtn.disabled = isProcessing;
      elements.savePdfBtn.style.display = isProcessing ? 'none' : 'block';
    }
    if (elements.cancelBtn) {
      elements.cancelBtn.classList.toggle('hidden', !isProcessing);
      elements.cancelBtn.style.display = isProcessing ? 'block' : 'none';
      if (isProcessing) elements.cancelBtn.disabled = false;
    }
    setStatus(presentation.kind, presentation.text, isProcessing ? state.startTime || stateRefs.currentStartTime?.current : null,
      presentation.translation);
    if (isProcessing) setProgress(state.progress ?? 0);
    else setProgress(0, false);
  }

  // Check processing state
  async function checkProcessingState() {
    const read = ++readRevision;
    // IMPROVED: Try both SW and storage in parallel for better reliability
    const [swState, storageState] = await Promise.allSettled([
      // Try to get state from service worker
      requestProcessingState(),
      // Try to get state from storage (fallback)
      chrome.storage.local.get(['processingState']).then(result => result.processingState || null)
    ]);
    
    // Prefer SW state if available
    if (swState.status === 'fulfilled' && swState.value) {
      scheduleUIUpdate(swState.value, read);
      return lastScheduledState;
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
        scheduleUIUpdate(readProcessingSnapshot(savedState), read, true);
        return lastScheduledState;
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
      newState.processingRunId !== oldState.processingRunId ||
      newState.phase !== oldState.phase ||
      newState.progress !== oldState.progress ||
      newState.status !== oldState.status ||
      newState.currentStage !== oldState.currentStage ||
      newState.error !== oldState.error ||
      newState.errorCode !== oldState.errorCode ||
      newState.statusTranslationKey !== oldState.statusTranslationKey ||
      JSON.stringify(newState.statusTranslationParams) !== JSON.stringify(oldState.statusTranslationParams) ||
      newState.errorTranslationKey !== oldState.errorTranslationKey ||
      JSON.stringify(newState.errorTranslationParams) !== JSON.stringify(oldState.errorTranslationParams) ||
      newState.isCancelled !== oldState.isCancelled ||
      newState.outputFormat !== oldState.outputFormat ||
      newState.imageTranslationFailureCount !== oldState.imageTranslationFailureCount ||
      newState.startTime !== oldState.startTime
    );
  }

  let pendingUIUpdate = null;
  let pollingGeneration = 0;
  let scheduledRenderRevision = 0;

  /** @param {ProcessingSnapshot|null} state @param {number} read @param {boolean} fromStorage */
  function scheduleUIUpdate(state, read, fromStorage = false) {
    if (!state || read < acceptedRead) return;
    if (fromStorage && lastScheduledState && (!lastScheduledState.isProcessing ||
        state.processingRunId !== lastScheduledState.processingRunId ||
        (state.progress ?? 0) < (lastScheduledState.progress ?? 0))) return;
    acceptedRead = read;
    lastScheduledState = state;
    scheduledRenderRevision = ++renderRevision;
    
    if (pendingUIUpdate !== null) return;
    
    // Schedule via requestAnimationFrame for smooth DOM updates
    pendingUIUpdate = requestAnimationFrame(async () => {
      pendingUIUpdate = null;
      if (lastScheduledState) {
        await updateUIFromState(lastScheduledState, scheduledRenderRevision);
      }
    });
  }

  // Start polling for state updates
  function startStatePolling() {
    const generation = ++pollingGeneration;
    // Clear existing timeout
    if (stateRefs.statePollingTimeout.current) {
      clearTimeout(stateRefs.statePollingTimeout.current);
    }
    
    let pollInterval = 2000; // Default 2s for idle (increased from 1s to reduce load)
    let failedAttempts = 0;
    let lastState = null; // Track last state for adaptive polling
    let noChangeCount = 0; // Count consecutive polls with no changes
    let isPolling = false; // Flag to prevent concurrent poll() calls
    
    async function poll() {
      // Prevent concurrent calls
      if (isPolling || generation !== pollingGeneration) {
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
      const read = ++readRevision;
      try {
        // For non-audio, use normal polling
        // Use callback-based API to properly handle lastError
        const state = await requestProcessingState();
        if (generation !== pollingGeneration) return;
        if (!state) throw new Error('Processing state is unavailable');
        
        // Use lightweight comparison instead of JSON.stringify
        const changed = stateChanged(state, lastScheduledState);
        
        if (changed) {
          // State changed - reset adaptive polling
          noChangeCount = 0;
          
          // Schedule UI update with debounce and RAF
          scheduleUIUpdate(state, read);
          
          // Simple polling interval - no special handling for audio
          if (state.isProcessing) {
            pollInterval = 500; // 500ms during processing
          } else {
            pollInterval = 500; // 500ms after completion to quickly update UI
          }
        } else {
          acceptedRead = Math.max(acceptedRead, read);
          // State didn't change - use standard interval
          noChangeCount++;
          if (state.isProcessing) {
            pollInterval = 1000; // 1s if no changes during processing
          } else {
            pollInterval = 2000; // 2s for idle state
          }
        }
        lastState = lastScheduledState;
        
        failedAttempts = 0;
        
        await checkSummaryStatus();
        if (checkKeyThesesStatus) await checkKeyThesesStatus();

      } catch (error) {
        if (generation !== pollingGeneration) return;
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
            if (generation !== pollingGeneration) return;
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
                  scheduleUIUpdate(readProcessingSnapshot(savedState), read, true);
                  // Continue polling with longer interval to check if SW recovers
                  pollInterval = 5000; // 5 seconds
                  isPolling = false;
                  stateRefs.statePollingTimeout.current = setTimeout(poll, pollInterval);
                  return; // Continue polling with storage fallback
                }
              }
            }
          } catch (e) {
            logError('Error loading from storage after connection error', e);
          }
          
          // If no valid state in storage, stop polling
          stateRefs.statePollingTimeout.current = null;
          return; // Stop polling
        }
        
        logWarn('Failed to get state from background', { attempt: failedAttempts, error: errorMsg });
        
        // IMPROVED: Try storage earlier (after 1 failed attempt instead of 3)
        if (failedAttempts >= 1) {
          try {
            const stored = await chrome.storage.local.get(['processingState']);
            if (generation !== pollingGeneration) return;
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
                  scheduleUIUpdate(readProcessingSnapshot(savedState), read, true);
                }
              }
            }
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        const isAudioFormat = lastState?.outputFormat === 'audio';
        if (isAudioFormat && lastState?.isProcessing) {
          setTimeout(async () => {
            await checkSummaryStatus();
            if (checkKeyThesesStatus) await checkKeyThesesStatus();
          }, 0);
        } else {
          await checkSummaryStatus();
          if (checkKeyThesesStatus) await checkKeyThesesStatus();
        }
        
        // Increase interval on errors
        pollInterval = Math.min(pollInterval * 2, 5000);
      } finally {
        // Always reset polling flag to allow next poll
        isPolling = false;
      }
      
      // Schedule next poll
      if (generation === pollingGeneration) stateRefs.statePollingTimeout.current = setTimeout(poll, pollInterval);
    }
    
    poll();
  }

  return {
    checkProcessingState,
    startStatePolling,
    updateUIFromState,
    getPresentedProcessingRunId: () => presentedRunId,
    noteProcessingAdmission() {
      acceptedRead = ++readRevision;
      renderRevision++;
      lastScheduledState = null;
      presentedRunId = null;
    },
    mapStageLabel
  };
}

