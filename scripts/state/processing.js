// @ts-check
// Processing state management for ClipAIble extension

/**
 * @typedef {Object} ProcessingState
 * @property {boolean} isProcessing
 * @property {boolean} isCancelled
 * @property {number} progress
 * @property {string} status
 * @property {any} error
 * @property {any} result
 * @property {number|null} startTime
 * @property {string|null} currentStage
 * @property {string[]} completedStages
 */

import { log, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { clearDecryptedKeyCache } from '../utils/encryption.js';
import { getUILanguage, tSync } from '../locales.js';

/**
 * Standard error codes for consistent error handling
 * @readonly
 * @const {Record<string, string>}
 */
export const ERROR_CODES = {
  AUTH_ERROR: 'auth_error',           // 401/403 - Invalid API key
  RATE_LIMIT: 'rate_limit',           // 429 - Too many requests
  TIMEOUT: 'timeout',                 // Request timeout
  NETWORK_ERROR: 'network_error',     // Network failure
  PARSE_ERROR: 'parse_error',         // JSON parsing error
  PROVIDER_ERROR: 'provider_error',   // Provider-specific error
  VALIDATION_ERROR: 'validation_error', // Input validation error
  UNKNOWN_ERROR: 'unknown_error'      // Unknown error
};

/**
 * Processing stages definition
 * @readonly
 * @const {Record<string, {id: string, label: string, order: number}>}
 */
export const PROCESSING_STAGES = {
  STARTING: { id: 'starting', label: 'Starting...', order: 0 },
  ANALYZING: { id: 'analyzing', label: 'AI analyzing page structure', order: 1 },
  EXTRACTING: { id: 'extracting', label: 'Extracting content', order: 2 },
  EXTRACTING_SUBTITLES: { id: 'extracting_subtitles', label: 'Extracting subtitles', order: 2.5 },
  PROCESSING_SUBTITLES: { id: 'processing_subtitles', label: 'Processing subtitles', order: 2.6 },
  TRANSLATING: { id: 'translating', label: 'Translating content', order: 3 },
  LOADING_IMAGES: { id: 'loading_images', label: 'Loading images', order: 4 },
  GENERATING: { id: 'generating', label: 'Generating document', order: 5 },
  COMPLETE: { id: 'complete', label: 'Complete', order: 6 }
};

// Global processing state
let processingState = {
  isProcessing: false,
  isCancelled: false,
  progress: 0,
  status: 'idle',
  error: null,
  result: null,
  startTime: null,
  currentStage: null,
  completedStages: []
};

// Simple lock to prevent concurrent updates (JavaScript is single-threaded, but async operations can interleave)
let isUpdatingState = false;

// Queue for pending updates to prevent data loss
let updateQueue = [];

// Debounce storage saves to reduce I/O load during frequent progress updates
let storageSaveTimeout = null;
let pendingStorageUpdate = null;
// Use centralized constants from CONFIG
// OPTIMIZED: Increased from 500ms to 5000ms to reduce storage load by 80%
const STORAGE_SAVE_DEBOUNCE = CONFIG.STORAGE_SAVE_DEBOUNCE; // Save to storage max once per 5000ms
// CRITICAL: Increased to 3000ms (3s) for audio to minimize main thread blocking during WASM operations
// Audio generation has long-running WASM operations (800-5000ms per sentence)
// Less frequent storage saves reduce interference with WASM operations
const STORAGE_SAVE_DEBOUNCE_AUDIO = CONFIG.STORAGE_SAVE_DEBOUNCE_AUDIO; // Save to storage max once per 3s for audio (very aggressive)

// Track last saved state timestamp to detect stale data
let lastSavedTimestamp = 0;

// Track storage save statistics for debugging
let storageSaveCount = 0;
let lastStorageSaveTime = 0;

// Force immediate save (bypass debounce) for critical updates
function forceSaveState() {
  if (storageSaveTimeout) {
    clearTimeout(storageSaveTimeout);
    storageSaveTimeout = null;
  }
  if (pendingStorageUpdate) {
    const stateToSave = { ...pendingStorageUpdate, lastUpdate: Date.now() };
    lastSavedTimestamp = stateToSave.lastUpdate;
    chrome.storage.local.set({ 
      processingState: stateToSave
    }).catch(error => {
      logWarn('Failed to force save processingState', error);
    });
    pendingStorageUpdate = null;
  }
}

/**
 * Save current state to storage immediately (bypass debounce)
 * Used by keep-alive mechanism to ensure state is saved without waiting for debounce
 * @returns {Promise<void>} Promise that resolves when save is complete
 */
export async function saveStateToStorageImmediate() {
  if (!processingState.isProcessing) {
    return;
  }
  
  // Clear any pending debounced save
  if (storageSaveTimeout) {
    clearTimeout(storageSaveTimeout);
    storageSaveTimeout = null;
  }
  
  // Save current state immediately
  const stateToSave = { 
    ...processingState, 
    lastUpdate: Date.now() 
  };
  lastSavedTimestamp = stateToSave.lastUpdate;
  
  try {
    await chrome.storage.local.set({ 
      processingState: stateToSave
    });
    // Clear pending update since we just saved
    pendingStorageUpdate = null;
  } catch (error) {
    logWarn('Failed to save processingState immediately', error);
    throw error; // Re-throw so caller can handle
  }
}

// Check if update is critical (must be saved immediately)
function isCriticalUpdate(updates) {
  // Critical updates: progress 0% (reset), 100% (completion), stage changes, errors
  // Also save progress updates every 10% to reduce data loss on service worker restart
  const progressThreshold = 10;
  const hasSignificantProgress = updates.progress !== undefined && 
    processingState.progress !== undefined &&
    Math.abs(updates.progress - processingState.progress) >= progressThreshold;
  
  return (
    updates.progress === 0 ||
    updates.progress === 100 ||
    hasSignificantProgress ||
    updates.stage !== undefined ||
    updates.error !== undefined ||
    updates.isCancelled !== undefined
  );
}

// Process queued updates
function processUpdateQueue() {
  if (updateQueue.length === 0 || isUpdatingState) {
    return;
  }
  
  // Merge all queued updates into one
  const mergedUpdates = {};
  for (const queuedUpdate of updateQueue) {
    Object.assign(mergedUpdates, queuedUpdate);
  }
  updateQueue = [];
  
  // Apply merged update
  applyStateUpdate(mergedUpdates);
}

// Internal function to apply state update (without queue logic)
function applyStateUpdate(updates) {
  isUpdatingState = true;
  
  try {
    // Handle stage updates
    if (updates.stage) {
      const stage = Object.values(PROCESSING_STAGES).find(s => s.id === updates.stage);
      if (stage) {
        processingState.currentStage = stage.id;
        // Mark previous stages as completed
        if (!processingState.completedStages.includes(stage.id)) {
          const stageOrder = stage.order;
          Object.values(PROCESSING_STAGES).forEach(s => {
            if (s.order < stageOrder && !processingState.completedStages.includes(s.id)) {
              processingState.completedStages.push(s.id);
            }
          });
        }
      }
    }
  
    // Protect progress from rolling back - progress should only increase
    // Exception: allow 0% (reset) and 100% (completion) explicitly
    if (updates.progress !== undefined && updates.progress !== null) {
      const currentProgress = processingState.progress || 0;
      const newProgress = updates.progress;
      
      // Allow explicit 0% (reset) or 100% (completion)
      if (newProgress === 0 || newProgress === 100) {
        // Allow these special values
      } else if (newProgress < currentProgress) {
        // Prevent progress rollback - use current progress instead
        const difference = currentProgress - newProgress;
        // Only log if difference is significant (>= 5%) to reduce log noise
        if (difference >= 5) {
          logWarn('Progress rollback prevented', { 
            current: currentProgress, 
            attempted: newProgress, 
            difference 
          });
        }
        // Keep current progress, but still update other fields
        updates = { ...updates };
        delete updates.progress;
        // Update other fields but keep current progress
        processingState = { ...processingState, ...updates };
        
        // Save to storage
        saveStateToStorage(updates);
        return;
      }
    }
  
    processingState = { ...processingState, ...updates };
    // Only log state updates when progress changes significantly (5%+) or stage changes
    const progressChanged = updates.progress !== undefined && 
      (processingState.progress === undefined || 
       Math.abs(updates.progress - (processingState.progress || 0)) >= 5);
    const stageChanged = updates.stage !== undefined && updates.stage !== processingState.stage;
    if (progressChanged || stageChanged || updates.status?.includes('error') || updates.status?.includes('Error')) {
      const stageName = updates.stage ? Object.values(PROCESSING_STAGES).find(s => s.id === updates.stage)?.label : 'unknown';
      log('📊 State updated', { 
        status: updates.status, 
        progress: updates.progress, 
        stage: stageName,
        stageId: updates.stage,
        progressChange: progressChanged ? `${processingState.progress || 0}% → ${updates.progress}%` : 'none'
      });
    }
    
    // Save to storage
    saveStateToStorage(updates);
  } finally {
    isUpdatingState = false;
    // Process any queued updates
    processUpdateQueue();
  }
}

// Save state to storage with debounce (or immediately for critical updates)
function saveStateToStorage(updates) {
  // Save to storage for crash recovery - NO AWAIT is intentional!
  // In-memory processingState is authoritative, storage is backup only.
  // Popup reads from memory via getProcessingState(), not from storage.
  // CRITICAL: Don't save if processing was cancelled
  if (!processingState.isProcessing || processingState.isCancelled) {
    return;
  }
  
  const isCritical = isCriticalUpdate(updates);
  const isAudioFormat = processingState.outputFormat === 'audio';
  const debounceInterval = isAudioFormat ? STORAGE_SAVE_DEBOUNCE_AUDIO : STORAGE_SAVE_DEBOUNCE;
  
  // Always update pending state (merge with existing if any)
  pendingStorageUpdate = { 
    ...processingState, 
    lastUpdate: Date.now() 
  };
  
  // For critical updates, save immediately (bypass debounce)
  if (isCritical) {
    if (storageSaveTimeout) {
      clearTimeout(storageSaveTimeout);
      storageSaveTimeout = null;
    }
    
    // Save immediately
    const stateToSave = { ...pendingStorageUpdate };
    lastSavedTimestamp = stateToSave.lastUpdate;
    storageSaveCount++;
    const timeSinceLastSave = lastStorageSaveTime > 0 ? Date.now() - lastStorageSaveTime : 0;
    lastStorageSaveTime = Date.now();
    
    // Log only summary to reduce log size (detailed info only every 10th save)
    if (storageSaveCount % 10 === 0 || timeSinceLastSave > 10000) {
      log('💾 Storage save: critical update', {
        saveCount: storageSaveCount,
        timeSinceLastSave: `${timeSinceLastSave}ms`,
        outputFormat: processingState.outputFormat
      });
    }
    
    chrome.storage.local.set({ 
      processingState: stateToSave
    }).catch(error => {
      logWarn('Failed to save critical processingState update', error);
    });
    pendingStorageUpdate = null;
    return;
  }
  
  // For non-critical updates, use debounce
  if (storageSaveTimeout) {
    clearTimeout(storageSaveTimeout);
  }
  
  storageSaveTimeout = setTimeout(() => {
    if (pendingStorageUpdate) {
      const stateToSave = { ...pendingStorageUpdate };
      lastSavedTimestamp = stateToSave.lastUpdate;
      storageSaveCount++;
      const timeSinceLastSave = lastStorageSaveTime > 0 ? Date.now() - lastStorageSaveTime : 0;
      lastStorageSaveTime = Date.now();
      
      // Log only summary to reduce log size
      if (storageSaveCount % 20 === 0 || timeSinceLastSave > 30000) {
        log('💾 Storage save: debounced update', {
          saveCount: storageSaveCount,
          timeSinceLastSave: `${timeSinceLastSave}ms`,
          outputFormat: processingState.outputFormat
        });
      }
      
      chrome.storage.local.set({ 
        processingState: stateToSave
      }).catch(error => {
        // Log but don't throw - storage errors shouldn't break processing
        logWarn('Failed to save processingState in updateState', error);
      });
      pendingStorageUpdate = null;
    }
    storageSaveTimeout = null;
  }, debounceInterval);
}

/**
 * Get current processing state (copy)
 * @returns {ProcessingState} Processing state
 */
export function getProcessingState() {
  return { ...processingState };
}

/**
 * Update processing state
 * @param {object} updates - State updates (Partial<ProcessingState> & {stage?: string})
 * @param {number} [updates.progress] - Progress percentage (0-100)
 * @param {string} [updates.status] - Status message
 * @param {string} [updates.stage] - Optional stage ID to set
 * @param {Error|Object|null} [updates.error] - Error object
 * @param {Object|null} [updates.result] - Processing result
 * @param {string} [updates.outputFormat] - Output format (pdf, epub, fb2, markdown, audio)
 */
export function updateState(updates) {
  // Queue updates if another update is in progress
  // This prevents data loss from concurrent updates
  if (isUpdatingState) {
    // Prevent memory leaks by limiting queue size
    if (updateQueue.length >= CONFIG.MAX_UPDATE_QUEUE_SIZE) {
      logWarn('Update queue full, dropping oldest update', { 
        queueLength: updateQueue.length, 
        maxSize: CONFIG.MAX_UPDATE_QUEUE_SIZE 
      });
      updateQueue.shift(); // Remove oldest update
    }
    // Add to queue instead of skipping
    updateQueue.push(updates);
    log('State update queued', { queueLength: updateQueue.length, updates });
    return;
  }
  
  // Apply update immediately
  applyStateUpdate(updates);
}

/**
 * Reset processing state to initial values
 */
export function resetState() {
  // Clear update queue
  updateQueue = [];
  
  // Clear pending storage save
  if (storageSaveTimeout) {
    clearTimeout(storageSaveTimeout);
    storageSaveTimeout = null;
  }
  pendingStorageUpdate = null;
  
  processingState = {
    isProcessing: false,
    isCancelled: false,
    progress: 0,
    status: 'idle',
    error: null,
    result: null,
    startTime: null,
    currentStage: null,
    completedStages: []
  };
  chrome.storage.local.remove(['processingState']);
  
  // Clear decrypted key cache for security
  clearDecryptedKeyCache();
}

/**
 * Set processing result
 * @param {import('../types.js').ExtractionResult} result - Processing result
 */
export function setResult(result) {
  processingState.result = result;
}

/**
 * Check if processing is cancelled
 * @returns {boolean}
 */
export function isCancelled() {
  return processingState.isCancelled;
}

/**
 * Cancel processing
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 * @returns {Promise<Object>} Success response
 */
export async function cancelProcessing(stopKeepAlive) {
  if (processingState.isProcessing) {
    // CRITICAL: Cancel any pending storage saves first
    if (storageSaveTimeout) {
      clearTimeout(storageSaveTimeout);
      storageSaveTimeout = null;
    }
    pendingStorageUpdate = null;
    
    processingState.isProcessing = false;
    processingState.isCancelled = true;
    const uiLang = await getUILanguage();
    processingState.status = tSync('statusCancelled', uiLang);
    // CRITICAL: Don't set error when cancelled by user - it's not an error
    // Set error to null to distinguish from real errors
    processingState.error = null;
    
    // CRITICAL: Check if summary generation is active before stopping keep-alive
    // Summary generation is independent and should continue even if document/audio processing is cancelled
    const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    const isSummaryGenerating = summaryState.summary_generating && summaryState.summary_generating_start_time;
    
    if (stopKeepAlive && !isSummaryGenerating) {
      await stopKeepAlive();
    } else if (isSummaryGenerating) {
      log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
    }
    
    // Clear decrypted key cache for security (processing was cancelled)
    clearDecryptedKeyCache();
    
    // CRITICAL: Immediately clear state from storage when cancelled
    // This prevents state from being restored on extension reload
    await chrome.storage.local.remove(['processingState']).catch(error => {
      logWarn('Failed to clear processingState from storage on cancel', error);
    });
    
    // Reset in-memory state to idle
    processingState = {
      isProcessing: false,
      isCancelled: false,
      progress: 0,
      status: 'idle',
      error: null,
      result: null,
      startTime: null,
      currentStage: null,
      completedStages: []
    };
  }
  return { success: true };
}

/**
 * Complete processing successfully
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 */
export async function completeProcessing(stopKeepAlive) {
  // Force save any pending state before clearing
  forceSaveState();
  
  processingState.isProcessing = false;
  processingState.progress = 100;
  const uiLang = await getUILanguage();
  processingState.status = tSync('statusDone', uiLang);
  
  // CRITICAL: Check if summary generation is active before stopping keep-alive
  // Summary generation is independent and should continue even if document/audio processing completes
  const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
  const isSummaryGenerating = summaryState.summary_generating && summaryState.summary_generating_start_time;
  
  if (stopKeepAlive && !isSummaryGenerating) {
    await stopKeepAlive();
  } else if (isSummaryGenerating) {
    log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
  }
  
  // CRITICAL: Save final state to storage so popup can detect completion
  // Don't remove immediately - let popup poll and detect completion first
  // State will be cleared on next processing start
  const finalState = { 
    ...processingState, 
    lastUpdate: Date.now() 
  };
  lastSavedTimestamp = finalState.lastUpdate;
  await chrome.storage.local.set({ 
    processingState: finalState
  });
  
  // Clear from storage after a delay to allow popup to detect completion
  setTimeout(() => {
    chrome.storage.local.remove(['processingState']).catch(() => {
      // Ignore errors - storage may already be cleared
    });
  }, 5000); // 5 seconds should be enough for popup to poll
}

/**
 * Set processing error
 * @param {string|Object} error - Error message string or object with {message, code}
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 */
export async function setError(error, stopKeepAlive) {
  // Force save any pending state before clearing
  forceSaveState();
  
  processingState.isProcessing = false;
  
  // Support both string (backward compatibility) and object format
  if (typeof error === 'string') {
    processingState.error = error;
    processingState.errorCode = ERROR_CODES.UNKNOWN_ERROR;
  } else {
    processingState.error = error.message || 'Unknown error';
    processingState.errorCode = error.code || ERROR_CODES.UNKNOWN_ERROR;
  }
  
  const uiLang = await getUILanguage();
  processingState.status = tSync('statusError', uiLang);
  
  // CRITICAL: Check if summary generation is active before stopping keep-alive
  // Summary generation is independent and should continue even if document/audio processing fails
  const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
  const isSummaryGenerating = summaryState.summary_generating && summaryState.summary_generating_start_time;
  
  if (stopKeepAlive && !isSummaryGenerating) {
    await stopKeepAlive();
  } else if (isSummaryGenerating) {
    log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
  }
  
  // CRITICAL: Save error state to storage BEFORE removing, so popup can see it
  // Popup polls getProcessingState() which reads from memory, but also falls back to storage
  // Save error state with a short TTL so popup can display it
  const errorState = {
    ...processingState,
    lastUpdate: Date.now()
  };
  await chrome.storage.local.set({ processingState: errorState });
  
  // Wait a bit to ensure popup can read the error state
  // Then remove after delay to allow popup to poll and see the error
  setTimeout(() => {
    chrome.storage.local.remove(['processingState']).catch(() => {
      // Ignore errors when removing
    });
  }, 10000); // Keep error state for 10 seconds so popup can see it
  
  // Clear decrypted key cache for security (processing failed)
  clearDecryptedKeyCache();
}

/**
 * Start processing
 * @param {import('../types.js').StartKeepAliveFunction} startKeepAlive - Function to start keep-alive
 * @returns {Promise<boolean>} True if started, false if already processing
 */
export async function startProcessing(startKeepAlive) {
  if (processingState.isProcessing) {
    logWarn('Already processing, rejecting new request');
    return false;
  }
  
  // Save previous result to storage before clearing (for summary generation)
  if (processingState.result) {
    try {
      await chrome.storage.local.set({ lastProcessedResult: processingState.result });
    } catch (error) {
      logWarn('Failed to save last processed result', error);
    }
  }
  
  const uiLang = await getUILanguage();
  const startingStatus = tSync('stageStarting', uiLang);
  
  processingState = {
    isProcessing: true,
    isCancelled: false,
    progress: 0,
    status: startingStatus,
    error: null,
    result: null,
    startTime: Date.now(),
    currentStage: PROCESSING_STAGES.STARTING.id,
    completedStages: []
  };
  
  if (startKeepAlive) startKeepAlive();
  return true;
}

/**
 * Restore state from storage on service worker restart
 * Non-blocking - uses setTimeout to avoid blocking service worker initialization
 * @returns {Promise<void>} Promise that resolves when restoration is complete
 */
export function restoreStateFromStorage() {
  // Return Promise to allow proper error handling
  return new Promise((resolve) => {
    // Use setTimeout to make this completely non-blocking
    setTimeout(async () => {
      try {
        // CRITICAL: Summary generation no longer uses processingState
        // It uses only summary_generating flag to avoid interfering with document generation UI
        // Only restore processingState for document generation (PDF, EPUB, etc.)
        const result = await chrome.storage.local.get(['processingState']);
        
        if (result.processingState && typeof result.processingState === 'object' && result.processingState !== null) {
          const savedState = /** @type {any} */ (result.processingState);
          if (savedState.isProcessing) {
            const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
            
            // CRITICAL: Use standard threshold for document generation (2 hours)
            // Summary generation does NOT use processingState, so no special handling needed
            const STALE_THRESHOLD = CONFIG.STATE_EXPIRY_MS; // 2 hours for PDF
            
            // If state is stale, reset it
            if (timeSinceUpdate > STALE_THRESHOLD) {
              log('Stale processing state found, resetting', { 
                timeSinceUpdate, 
                threshold: STALE_THRESHOLD,
                stage: savedState.currentStage
              });
              await chrome.storage.local.remove(['processingState']);
            } else {
              // CRITICAL: Only restore state if it's very recent (< 1 minute) - quick service worker restart
              // Otherwise, clear it - user expects clean state after extension reload
              const QUICK_RESTART_THRESHOLD = CONFIG.RESET_THRESHOLD_MS; // 1 minute
              
              if (timeSinceUpdate < QUICK_RESTART_THRESHOLD) {
                // Very recent state - likely service worker restart during active processing
                
                // CRITICAL: Check if processing was cancelled by user
                // If cancelled, don't restore state - user expects clean state after cancellation
                const wasCancelled = savedState.isCancelled === true;
                
                if (wasCancelled) {
                  // Processing was cancelled - clear state, don't restore
                  log('Processing was cancelled - clearing state (not restoring)', { 
                    savedState, 
                    timeSinceUpdate, 
                    progress: savedState.progress,
                    stage: savedState.currentStage
                  });
                  await chrome.storage.local.remove(['processingState']);
                  return; // Don't restore cancelled state
                }
                
                // Restore active processing state (only if not cancelled)
                log('Restoring processing state (quick service worker restart)', { 
                  savedState, 
                  timeSinceUpdate, 
                  progress: savedState.progress,
                  stage: savedState.currentStage
                });
                
                const uiLang = await getUILanguage();
                processingState = {
                  isProcessing: savedState.isProcessing || false,
                  isCancelled: false,
                  progress: savedState.progress || 0,
                  status: savedState.status || tSync('statusProcessing', uiLang),
                  error: null,
                  result: null,
                  startTime: savedState.startTime || null,
                  currentStage: savedState.currentStage || null,
                  completedStages: Array.isArray(savedState.completedStages) ? savedState.completedStages : []
                };
              } else {
                // State is not very recent - extension was reloaded, clear it
                log('Extension reloaded - clearing processing state (not restoring)', { 
                  savedState, 
                  timeSinceUpdate, 
                  progress: savedState.progress,
                  stage: savedState.currentStage,
                  isCancelled: savedState.isCancelled
                });
                
                await chrome.storage.local.remove(['processingState']);
              }
            }
          }
        }
      } catch (error) {
        logWarn('Error in restoreStateFromStorage', error);
      } finally {
        resolve(); // Always resolve, even on error
      }
    }, 0);
  });
}


