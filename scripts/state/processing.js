// Processing state management for ClipAIble extension

// @typedef {import('../types.js').ProcessingState} ProcessingState

import { log, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { clearDecryptedKeyCache } from '../utils/encryption.js';
import { getUILanguage, tSync } from '../locales.js';

// Standard error codes for consistent error handling
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

// Processing stages definition
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

/**
 * Get current processing state (copy)
 * @returns {ProcessingState} Processing state
 */
export function getProcessingState() {
  return { ...processingState };
}

/**
 * Update processing state
 * @param {Partial<ProcessingState> & {stage?: string}} updates - State updates
 * @param {number} [updates.progress] - Progress percentage (0-100)
 * @param {string} [updates.status] - Status message
 * @param {string} [updates.stage] - Optional stage ID to set
 * @param {Error|Object|null} [updates.error] - Error object
 * @param {Object|null} [updates.result] - Processing result
 */
export function updateState(updates) {
  // Simple protection against concurrent updates
  // While JavaScript is single-threaded, async operations can interleave
  // This ensures we don't have overlapping state updates
  // Check and set flag atomically to prevent race conditions
  if (isUpdatingState) {
    // If update is in progress, queue this update (simple approach: skip if already updating)
    // In practice, this is very rare since updateState is synchronous
    logWarn('State update already in progress, skipping concurrent update', { updates });
    return;
  }
  
  // Set flag immediately to prevent concurrent updates
  // This check-then-set pattern is safe in single-threaded JavaScript
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
      logWarn('Progress rollback prevented', { 
        current: currentProgress, 
        attempted: newProgress, 
        difference: currentProgress - newProgress 
      });
      // Keep current progress, but still update other fields
      updates = { ...updates };
      delete updates.progress;
      // Update other fields but keep current progress
      processingState = { ...processingState, ...updates };
      log('State updated (progress protected)', { 
        status: updates.status, 
        progress: currentProgress, 
        stage: updates.stage 
      });
      
      // Save to storage
      if (processingState.isProcessing) {
        chrome.storage.local.set({ 
          processingState: { ...processingState, lastUpdate: Date.now() }
        });
      }
      return;
    }
  }
  
  processingState = { ...processingState, ...updates };
  log('State updated', { status: updates.status, progress: updates.progress, stage: updates.stage });
  
  // Save to storage for crash recovery - NO AWAIT is intentional!
  // In-memory processingState is authoritative, storage is backup only.
  // Popup reads from memory via getProcessingState(), not from storage.
  // See systemPatterns.md "Design Decisions" section.
  if (processingState.isProcessing) {
    // CRITICAL: Always save processingState if isProcessing = true
    // This ensures state persists across service worker restarts
    chrome.storage.local.set({ 
      processingState: { ...processingState, lastUpdate: Date.now() }
    }).catch(error => {
      // Log but don't throw - storage errors shouldn't break processing
      logWarn('Failed to save processingState in updateState', error);
    });
    
    // CRITICAL: Summary generation no longer uses processingState
    // It uses only summary_generating flag to avoid interfering with document generation UI
    // No need to sync summary_generating flag here
  }
  } finally {
    isUpdatingState = false;
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
  
  // Clear decrypted key cache for security
  clearDecryptedKeyCache();
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
export async function cancelProcessing(stopKeepAlive) {
  if (processingState.isProcessing) {
    processingState.isProcessing = false;
    processingState.isCancelled = true;
    const uiLang = await getUILanguage();
    processingState.status = tSync('statusCancelled', uiLang);
    processingState.error = tSync('statusCancelled', uiLang);
    if (stopKeepAlive) stopKeepAlive();
    
    // Clear decrypted key cache for security (processing was cancelled)
    clearDecryptedKeyCache();
  }
  return { success: true };
}

/**
 * Complete processing successfully
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 */
export async function completeProcessing(stopKeepAlive) {
  processingState.isProcessing = false;
  processingState.progress = 100;
  const uiLang = await getUILanguage();
  processingState.status = tSync('statusDone', uiLang);
  if (stopKeepAlive) stopKeepAlive();
  // Keep result in memory for summary generation, but remove from storage
  // Result will be cleared on next processing start
  chrome.storage.local.remove(['processingState']);
}

/**
 * Set processing error
 * @param {string|Object} error - Error message string or object with {message, code}
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 */
export async function setError(error, stopKeepAlive) {
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
  if (stopKeepAlive) stopKeepAlive();
  chrome.storage.local.remove(['processingState']);
  
  // Clear decrypted key cache for security (processing failed)
  clearDecryptedKeyCache();
}

/**
 * Start processing
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @returns {boolean} True if started, false if already processing
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
        
        if (result.processingState && result.processingState.isProcessing) {
          const savedState = result.processingState;
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
            log('Restored processing state from storage', { 
              savedState, 
              timeSinceUpdate, 
              progress: savedState.progress,
              stage: savedState.currentStage
            });
            // PDF generation - mark as error since we can't truly resume
            processingState = {
              isProcessing: false,
              progress: savedState.progress || 0,
              status: 'Error',
              error: 'Processing was interrupted. Please try again.',
              result: null,
              currentStage: savedState.currentStage || null,
              completedStages: savedState.completedStages || []
            };
            // Try to get localized message asynchronously (non-blocking)
            try {
              const uiLang = await getUILanguage();
              const errorStatus = tSync('statusError', uiLang);
              const errorMsg = tSync('statusProcessingInterrupted', uiLang);
              processingState.status = errorStatus;
              processingState.error = errorMsg;
            } catch (localeError) {
              // Keep fallback values if locale fails
              logWarn('Failed to localize error message', localeError);
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


