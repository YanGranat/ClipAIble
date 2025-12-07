// Processing state management for ClipAIble extension

import { log, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';

// Processing stages definition
export const PROCESSING_STAGES = {
  STARTING: { id: 'starting', label: 'Starting...', order: 0 },
  ANALYZING: { id: 'analyzing', label: 'AI analyzing page structure', order: 1 },
  EXTRACTING: { id: 'extracting', label: 'Extracting content', order: 2 },
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

/**
 * Get current processing state (copy)
 * @returns {Object} Processing state
 */
export function getProcessingState() {
  return { ...processingState };
}

/**
 * Update processing state
 * @param {Object} updates - State updates
 * @param {string} updates.stage - Optional stage ID to set
 */
export function updateState(updates) {
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
  
  processingState = { ...processingState, ...updates };
  log('State updated', { status: updates.status, progress: updates.progress, stage: updates.stage });
  
  // Save to storage for crash recovery - NO AWAIT is intentional!
  // In-memory processingState is authoritative, storage is backup only.
  // Popup reads from memory via getProcessingState(), not from storage.
  // See systemPatterns.md "Design Decisions" section.
  if (processingState.isProcessing) {
    chrome.storage.local.set({ 
      processingState: { ...processingState, lastUpdate: Date.now() }
    });
  }
}

/**
 * Reset processing state to initial values
 */
export function resetState() {
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
}

/**
 * Set processing result
 * @param {Object} result - Processing result
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
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @returns {Object} Success response
 */
export function cancelProcessing(stopKeepAlive) {
  if (processingState.isProcessing) {
    processingState.isProcessing = false;
    processingState.isCancelled = true;
    processingState.status = 'Cancelled';
    processingState.error = 'Processing cancelled by user';
    if (stopKeepAlive) stopKeepAlive();
  }
  return { success: true };
}

/**
 * Complete processing successfully
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 */
export function completeProcessing(stopKeepAlive) {
  processingState.isProcessing = false;
  processingState.progress = 100;
  processingState.status = 'Done!';
  if (stopKeepAlive) stopKeepAlive();
  chrome.storage.local.remove(['processingState']);
}

/**
 * Set processing error
 * @param {string} errorMessage - Error message
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 */
export function setError(errorMessage, stopKeepAlive) {
  processingState.isProcessing = false;
  processingState.error = errorMessage;
  processingState.status = 'Error';
  if (stopKeepAlive) stopKeepAlive();
  chrome.storage.local.remove(['processingState']);
}

/**
 * Start processing
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @returns {boolean} True if started, false if already processing
 */
export function startProcessing(startKeepAlive) {
  if (processingState.isProcessing) {
    logWarn('Already processing, rejecting new request');
    return false;
  }
  
  processingState = {
    isProcessing: true,
    isCancelled: false,
    progress: 0,
    status: 'Starting...',
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
 */
export function restoreStateFromStorage() {
  chrome.storage.local.get(['processingState'], (result) => {
    if (result.processingState && result.processingState.isProcessing) {
      const savedState = result.processingState;
      const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
      
      // If state is stale (> 5 minutes), reset it
      if (timeSinceUpdate > CONFIG.STATE_EXPIRY_MS) {
        log('Stale processing state found, resetting', { timeSinceUpdate });
        chrome.storage.local.remove(['processingState']);
      } else {
        log('Restored processing state from storage', savedState);
        // Mark as error since we can't truly resume
        processingState = {
          isProcessing: false,
          progress: savedState.progress,
          status: 'Error',
          error: 'Processing was interrupted. Please try again.',
          result: null
        };
      }
    }
  });
}


