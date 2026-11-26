import { prunePdfData } from '../api/pdf-storage.js';
// @ts-check
// Processing state management for ClipAIble extension

/**
 * @typedef {import('../types.js').ProcessingState} ProcessingState
 */

import { log, logWarn, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { clearDecryptedKeyCache } from '../utils/encryption.js';
import { getUILanguage, tSync } from '../locales.js';
import { createNotification } from '../background/notifications.js';
import { isPopupOpen } from '../background/popup-connection.js';
import { removePrintJob, prunePrintJobs } from '../api/print-storage.js';
import { closeOwnedPrintTab } from '../api/print-lifecycle.js';
import { prunePdfOperations } from '../api/pdf-operation-storage.js';
import { isValidProcessingRunId } from './processing-messages.js';

export { isValidProcessingRunId } from './processing-messages.js';

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
/** @type {ProcessingState} */
let processingState = {
  isProcessing: false,
  isCancelled: false,
  progress: 0,
  status: 'idle',
  error: null,
  startTime: null,
  currentStage: null,
  completedStages: []
};

let processingRunId = crypto.randomUUID();
let startingRunId = null;
let stateCleanupTimeout = null;
let storageOperationQueue = Promise.resolve();
let processingController = new AbortController();
let inactivityTimer = null;
let deadlineStopKeepAlive;
let notifiedRunId;
const obsoleteController = new AbortController();
obsoleteController.abort(new DOMException('Processing cancelled', 'AbortError'));

async function notifyTerminal(error, runId) {
  if (isPopupOpen() || notifiedRunId === runId) return;
  notifiedRunId = runId;
  try {
    const language = await getUILanguage();
    if (runId !== processingRunId || isPopupOpen()) return;
    await createNotification(tSync(error?.translationKey || 'statusError', language, error?.translationParams || {}));
  } catch (failure) { logWarn('Failed to notify processing result', failure); }
}

export function getProcessingSignal(runId) {
  return runId === undefined || runId === processingRunId ? processingController.signal : obsoleteController.signal;
}

export function markProcessingRequestStarted(runId) {
  if (runId === processingRunId && processingState.isProcessing && !processingController.signal.aborted) {
    scheduleProcessingDeadline(runId);
  }
}

function clearProcessingDeadline() {
  if (inactivityTimer !== null) clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

/** @param {Error} [reason] */
function stopOwnedRequests(reason = new DOMException('Processing cancelled', 'AbortError')) {
  clearProcessingDeadline();
  processingController.abort(reason);
}

function scheduleProcessingDeadline(runId, deadline = Date.now() + CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS) {
  clearProcessingDeadline();
  processingState.inactivityDeadlineAt = deadline;
  inactivityTimer = setTimeout(() => {
    inactivityTimer = null;
    if (runId !== processingRunId || (!processingState.isProcessing && startingRunId === null)) return;
    const error = Object.assign(new Error('Processing timed out'), {
      name: 'TimeoutError',
      code: ERROR_CODES.TIMEOUT, retryable: false, translationKey: 'errorTimeout', translationParams: {}
    });
    processingController.abort(error);
    startingRunId = null;
    processingState = { ...processingState, isProcessing: false, error: error.message,
      errorCode: error.code, errorTranslationKey: error.translationKey, errorTranslationParams: {},
      status: 'Error', statusTranslationKey: 'statusError', statusTranslationParams: {}, inactivityDeadlineAt: null };
    if (storageSaveTimeout) clearTimeout(storageSaveTimeout);
    storageSaveTimeout = null;
    pendingStorageUpdate = null;
    void saveToStorageWithRetry({ processingState: { ...processingState, lastUpdate: Date.now() } }, 3, runId).catch(() => {});
    void hasIndependentGeneration().then(independent => {
      if (!independent && runId === processingRunId && !processingState.isProcessing) return deadlineStopKeepAlive?.();
    }).catch(error => logWarn('Failed to stop expired processing', error));
    clearDecryptedKeyCache();
    void notifyTerminal(error, runId);
  }, Math.max(0, deadline - Date.now()));
  (/** @type {number & {unref?: () => void}} */ (inactivityTimer)).unref?.();
}

function enqueueStorageOperation(operation) {
  const result = storageOperationQueue.then(operation, operation);
  storageOperationQueue = result.catch(() => {});
  return result;
}

function removeStoredProcessingState(runId = processingRunId) {
  return enqueueStorageOperation(() => {
    if (runId === processingRunId) return chrome.storage.local.remove(['processingState']);
  });
}

export function getProcessingRunId() {
  return processingRunId;
}

export function isCurrentProcessingRun(runId) {
  return runId === undefined || (runId === processingRunId && !processingState.isCancelled);
}

export function getScopedUpdateState(runId, updater = updateState) {
  return (updates) => {
    if (isCurrentProcessingRun(runId)) updater(updates, runId);
  };
}

export function initPrintTabLifecycle(stopKeepAlive) {
  deadlineStopKeepAlive = stopKeepAlive;
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (!processingState.isProcessing || processingState.outputFormat !== 'pdf' ||
        processingState.pdfPrintTabId !== tabId) return;
    const ownerRunId = processingRunId;
    const jobId = processingState.pdfPrintJobId;
    if (jobId) void removePrintJob(jobId).catch(error => logWarn('Failed to release closed print job', error));
    void setError('PDF generation was interrupted because the print tab was closed.', stopKeepAlive, ownerRunId)
      .catch((error) => logWarn('Failed to save interrupted PDF state', error));
  });
}

/** Called behind startup admission, after processing state has been restored. */
export async function cleanupPdfJobsAfterRestore() {
  const tabs = await chrome.tabs.query({});
  const expected = new URL(chrome.runtime.getURL('print/print.html'));
  const activeJobIds = [];
  for (const tab of tabs) {
    try {
      const url = new URL(tab.url || '');
      if (url.protocol === expected.protocol && url.host === expected.host && url.pathname === expected.pathname) {
        const id = url.searchParams.get('job');
        if (isValidProcessingRunId(id)) activeJobIds.push(id);
      }
    } catch { /* Other tabs do not own print jobs. */ }
  }
  const activeRunId = processingState.isProcessing ? processingRunId : null;
  const [printJobs, renderJobs, inputJobs] = await Promise.all([
    prunePrintJobs({ activeRunId, activeJobIds }), prunePdfOperations(activeRunId), prunePdfData(activeRunId)
  ]);
  return printJobs + renderJobs + inputJobs;
}

function clearStateCleanup() {
  if (stateCleanupTimeout !== null) {
    clearTimeout(stateCleanupTimeout);
    stateCleanupTimeout = null;
  }
}

function scheduleStateCleanup(delay, runId) {
  clearStateCleanup();
  stateCleanupTimeout = setTimeout(() => {
    stateCleanupTimeout = null;
    if (runId === processingRunId && !processingState.isProcessing) {
      removeStoredProcessingState(runId).catch(() => {});
    }
  }, delay);
}

async function hasIndependentGeneration() {
  const saved = await chrome.storage.local.get([
    'summary_generating', 'summary_generating_start_time',
    'key_theses_generating', 'key_theses_generating_start_time'
  ]);
  return Boolean((saved.summary_generating && saved.summary_generating_start_time) ||
    (saved.key_theses_generating && saved.key_theses_generating_start_time));
}

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

/**
 * Save to chrome storage with retry logic
 * @param {object} data - Data to save
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<void>}
 */
async function saveToStorageWithRetry(data, maxRetries = 3, runId = processingRunId) {
  if (data.processingState) {
    data = { ...data, processingState: { ...data.processingState, processingRunId: runId } };
  }
  return enqueueStorageOperation(async () => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (runId !== processingRunId) return;
    try {
      await chrome.storage.local.set(data);
      return; // Success
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        logError('CRITICAL: Failed to save to storage after all retries', {
          attempt,
          maxRetries,
          error: error.message,
          dataKeys: Object.keys(data)
        });
        throw error; // Re-throw on final failure
      } else {
        logWarn('Storage save failed, retrying', {
          attempt,
          maxRetries,
          error: error.message,
          willRetry: true
        });
        // Exponential backoff: 100ms, 200ms, 400ms...
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }
  }
  });
}

// Force immediate save (bypass debounce) for critical updates
async function forceSaveState() {
  if (storageSaveTimeout) {
    clearTimeout(storageSaveTimeout);
    storageSaveTimeout = null;
  }
  if (pendingStorageUpdate) {
    const pendingUpdate = pendingStorageUpdate;
    const stateToSave = { ...pendingStorageUpdate, lastUpdate: Date.now() };
    lastSavedTimestamp = stateToSave.lastUpdate;
    try {
      await saveToStorageWithRetry({
        processingState: stateToSave
      });
    } catch (error) {
      logWarn('Failed to force save processingState', error);
    }
    if (pendingStorageUpdate === pendingUpdate) pendingStorageUpdate = null;
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
  const pendingUpdate = pendingStorageUpdate;
  lastSavedTimestamp = stateToSave.lastUpdate;
  
  try {
    await saveToStorageWithRetry({
      processingState: stateToSave
    });
    // Clear pending update since we just saved
    if (pendingStorageUpdate === pendingUpdate) pendingStorageUpdate = null;
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
    updates.isCancelled !== undefined ||
    updates.pdfDebuggerStarted !== undefined || updates.pdfPrintJobId !== undefined || updates.pdfPrintTabId !== undefined
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
    
    saveToStorageWithRetry({
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
      
      saveToStorageWithRetry({
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
  return { ...processingState, processingRunId };
}

/** Include reservations that precede the first published running snapshot. */
export function getProcessingAdmissionOwner() {
  return startingRunId ?? (processingState.isProcessing ? processingRunId : null);
}

/**
 * Update processing state
 * @param {Partial<ProcessingState> & {stage?: string}} updates - State updates
 * @param {string} [runId] - Captured operation identity
 */
export function updateState(updates, runId) {
  if (!isCurrentProcessingRun(runId)) return;
  if (runId !== undefined && processingController.signal.aborted) return;
  const advances = (typeof updates.progress === 'number' && updates.progress > processingState.progress) ||
    (updates.stage && updates.stage !== processingState.currentStage);
  if (processingState.isProcessing && advances) scheduleProcessingDeadline(processingRunId);
  if (updates.status !== undefined) {
    updates = { ...updates, statusTranslationKey: updates.statusTranslationKey || null, statusTranslationParams: updates.statusTranslationParams || null };
  }
  if (updates.error !== undefined) {
    updates = { ...updates, errorTranslationKey: updates.errorTranslationKey || null, errorTranslationParams: updates.errorTranslationParams || null };
  }
  // Queue updates if another update is in progress
  // This prevents data loss from concurrent updates
  if (isUpdatingState) {
    // Prevent memory leaks by limiting queue size
    if (updateQueue.length >= CONFIG.MAX_UPDATE_QUEUE_SIZE) {
      logError('CRITICAL: Update queue overflow - dropping oldest update! This may cause data loss.', {
        queueLength: updateQueue.length,
        maxSize: CONFIG.MAX_UPDATE_QUEUE_SIZE,
        droppedUpdate: updateQueue[0] // Log what we're losing
      });
      updateQueue.shift(); // Remove oldest update - DATA LOSS
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
  stopOwnedRequests();
  processingController = new AbortController();
  processingRunId = crypto.randomUUID();
  startingRunId = null;
  clearStateCleanup();
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
    startTime: null,
    currentStage: null,
    completedStages: []
  };
  const removal = removeStoredProcessingState();
  
  // Clear decrypted key cache for security
  clearDecryptedKeyCache();
  return removal;
}

/**
 * Check if processing is cancelled
 * @returns {boolean}
 */
export function isCancelled(runId) {
  return processingState.isCancelled || (runId !== undefined && (runId !== processingRunId || processingController.signal.aborted));
}

/**
 * Cancel processing
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 * @param {string} [expectedRunId] - Operation selected by the caller
 * @returns {Promise<import('./processing-messages.js').ProcessingCancellation>}
 */
export async function cancelProcessing(stopKeepAlive, expectedRunId) {
  if (expectedRunId !== undefined && expectedRunId !== processingRunId) return { success: true };
  if (processingState.isProcessing || startingRunId !== null) {
    stopOwnedRequests();
    const cancelledRunId = processingRunId;
    const cancelledPrintJobId = processingState.pdfPrintJobId;
    const cancelledPrintTabId = processingState.pdfPrintTabId;
    if (cancelledPrintJobId) {
      void removePrintJob(cancelledPrintJobId).catch(error => logWarn('Failed to release cancelled print job', error));
      void closeOwnedPrintTab(cancelledPrintTabId, cancelledPrintJobId);
    }
    const cancellationId = crypto.randomUUID();
    processingRunId = cancellationId;
    startingRunId = null;
    clearStateCleanup();
    // CRITICAL: Cancel any pending storage saves first
    if (storageSaveTimeout) {
      clearTimeout(storageSaveTimeout);
      storageSaveTimeout = null;
    }
    pendingStorageUpdate = null;
    
    processingState = {
      isProcessing: false,
      isCancelled: true,
      progress: 0,
      status: 'idle',
      error: null,
      startTime: null,
      currentStage: null,
      completedStages: []
    };
    void notifyTerminal({ translationKey: 'statusCancelled', translationParams: {} }, cancellationId);
    clearDecryptedKeyCache();
    
    // CRITICAL: Check if summary generation is active before stopping keep-alive
    // Summary generation is independent and should continue even if document/audio processing is cancelled
    const isSummaryGenerating = await hasIndependentGeneration();
    if (cancellationId !== processingRunId) return { success: true, cancelledRunId };
    
    if (stopKeepAlive && !isSummaryGenerating) {
      await stopKeepAlive();
    } else if (isSummaryGenerating) {
      log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
    }
    
    if (cancellationId !== processingRunId) return { success: true, cancelledRunId };
    
    // CRITICAL: Immediately clear state from storage when cancelled
    // This prevents state from being restored on extension reload
    removeStoredProcessingState(cancellationId).catch(error => {
      logWarn('Failed to clear processingState from storage on cancel', error);
    });
    return { success: true, cancelledRunId };
  }
  return { success: true };
}

/**
 * Complete processing successfully
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 */
export async function completeProcessing(stopKeepAlive, runId) {
  const ownerRunId = runId ?? processingRunId;
  if (!isCurrentProcessingRun(ownerRunId)) return;
  if (processingController.signal.aborted) return;
  // Force save any pending state before clearing
  await forceSaveState();
  const uiLang = await getUILanguage();
  if (!isCurrentProcessingRun(ownerRunId) || processingController.signal.aborted) return;
  clearProcessingDeadline();
  
  processingState.isProcessing = false;
  processingState.inactivityDeadlineAt = null;
  processingState.progress = 100;
  processingState.status = tSync('statusDone', uiLang);
  processingState.statusTranslationKey = 'statusDone';
  processingState.statusTranslationParams = {};
  
  // CRITICAL: Check if summary generation is active before stopping keep-alive
  // Summary generation is independent and should continue even if document/audio processing completes
  const isSummaryGenerating = await hasIndependentGeneration();
  if (!isCurrentProcessingRun(ownerRunId)) return;
  
  if (stopKeepAlive && !isSummaryGenerating) {
    await stopKeepAlive();
  } else if (isSummaryGenerating) {
    log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
  }
  if (!isCurrentProcessingRun(ownerRunId)) return;
  
  // CRITICAL: Save final state to storage so popup can detect completion
  // Don't remove immediately - let popup poll and detect completion first
  // State will be cleared on next processing start
  const finalState = { 
    ...processingState, 
    lastUpdate: Date.now() 
  };
  lastSavedTimestamp = finalState.lastUpdate;
  await saveToStorageWithRetry({
    processingState: finalState
  }, 3, ownerRunId);
  
  // Clear from storage after a delay to allow popup to detect completion
  if (isCurrentProcessingRun(ownerRunId)) scheduleStateCleanup(5000, ownerRunId);
}

/**
 * Set processing error
 * @param {string|Object} error - Error message string or object with {message, code}
 * @param {import('../types.js').StopKeepAliveFunction} stopKeepAlive - Function to stop keep-alive
 */
export async function setError(error, stopKeepAlive, runId) {
  const ownerRunId = runId ?? processingRunId;
  if (!isCurrentProcessingRun(ownerRunId)) return;
  stopOwnedRequests(error instanceof Error ? error : new Error(typeof error === 'string' ? error : error.message));
  processingState.isProcessing = false;
  processingState.inactivityDeadlineAt = null;
  processingState.error = typeof error === 'string' ? error : error.message || 'Unknown error';
  processingState.errorTranslationKey = typeof error === 'object' ? error.translationKey || null : null;
  processingState.errorTranslationParams = typeof error === 'object' ? error.translationParams || null : null;
  void notifyTerminal(error, ownerRunId);
  // Force save any pending state before clearing
  await forceSaveState();
  if (!isCurrentProcessingRun(ownerRunId)) return;
  
  processingState.isProcessing = false;
  
  // Support both string (backward compatibility) and object format
  if (typeof error === 'string') {
    processingState.error = error;
    processingState.errorCode = ERROR_CODES.UNKNOWN_ERROR;
  } else {
    processingState.error = error.message || 'Unknown error';
    processingState.errorCode = error.code || ERROR_CODES.UNKNOWN_ERROR;
  }
  processingState.errorTranslationKey = typeof error === 'object' ? error.translationKey || null : null;
  processingState.errorTranslationParams = typeof error === 'object' ? error.translationParams || null : null;
  
  const uiLang = await getUILanguage();
  if (!isCurrentProcessingRun(ownerRunId)) return;
  processingState.status = tSync('statusError', uiLang);
  processingState.statusTranslationKey = 'statusError';
  processingState.statusTranslationParams = {};
  
  // CRITICAL: Check if summary generation is active before stopping keep-alive
  // Summary generation is independent and should continue even if document/audio processing fails
  const isSummaryGenerating = await hasIndependentGeneration();
  if (!isCurrentProcessingRun(ownerRunId)) return;
  
  if (stopKeepAlive && !isSummaryGenerating) {
    await stopKeepAlive();
  } else if (isSummaryGenerating) {
    log('Keep-alive kept active - summary generation in progress', { timestamp: Date.now() });
  }
  if (!isCurrentProcessingRun(ownerRunId)) return;
  
  // CRITICAL: Save error state to storage BEFORE removing, so popup can see it
  // Popup polls getProcessingState() which reads from memory, but also falls back to storage
  // Save error state with a short TTL so popup can display it
  const errorState = {
    ...processingState,
    lastUpdate: Date.now()
  };
  await saveToStorageWithRetry({ processingState: errorState }, 3, ownerRunId);
  
  // Wait a bit to ensure popup can read the error state
  // Then remove after delay to allow popup to poll and see the error
  if (isCurrentProcessingRun(ownerRunId)) scheduleStateCleanup(10000, ownerRunId);
  
  // Clear decrypted key cache for security (processing failed)
  clearDecryptedKeyCache();
}

/**
 * Start processing
 * @param {import('../types.js').StartKeepAliveFunction} startKeepAlive - Function to start keep-alive
 * @returns {Promise<boolean>} True if started, false if already processing
 */
export async function startProcessing(startKeepAlive, onStarted) {
  if (getProcessingAdmissionOwner()) {
    logWarn('Already processing, rejecting new request');
    return false;
  }
  const ownerRunId = crypto.randomUUID();
  stopOwnedRequests();
  processingController = new AbortController();
  processingRunId = ownerRunId;
  startingRunId = ownerRunId;
  clearStateCleanup();
  scheduleProcessingDeadline(ownerRunId);
  try {
  
  const uiLang = await getUILanguage();
  if (ownerRunId !== processingRunId || processingController.signal.aborted) return false;
  const startingStatus = tSync('stageStarting', uiLang);
  
  processingState = {
    isProcessing: true,
    isCancelled: false,
    progress: 0,
    status: startingStatus,
    statusTranslationKey: 'stageStarting',
    statusTranslationParams: {},
    error: null,
    startTime: Date.now(),
    currentStage: PROCESSING_STAGES.STARTING.id,
    completedStages: []
  };
  scheduleProcessingDeadline(ownerRunId);
  saveStateToStorage({ progress: 0 });
  if (onStarted) onStarted(ownerRunId);
  if (startKeepAlive) startKeepAlive();
  return true;
  } finally {
    if (startingRunId === ownerRunId) startingRunId = null;
  }
}

/**
 * Restore state from storage on service worker restart
 * Non-blocking - uses setTimeout to avoid blocking service worker initialization
 * @returns {Promise<void>} Promise that resolves when restoration is complete
 */
export function restoreStateFromStorage() {
  // Return Promise to allow proper error handling
  return new Promise((resolve, reject) => {
    // Use setTimeout to make this completely non-blocking
    setTimeout(async () => {
      try {
        // CRITICAL: Summary generation no longer uses processingState
        // It uses only summary_generating flag to avoid interfering with document generation UI
        // Only restore processingState for document generation (PDF, EPUB, etc.)
        const restorationRunId = processingRunId;
        try {
          await chrome.storage.local.remove(['lastProcessedResult']);
        } catch (error) {
          logWarn('Unable to remove obsolete processing data', error);
        }
        if (processingState.isProcessing || startingRunId !== null) return;
        await storageOperationQueue;
        if (restorationRunId !== processingRunId || processingState.isProcessing || startingRunId !== null) return;
        const result = await chrome.storage.local.get(['processingState']);
        if (restorationRunId !== processingRunId) return;
        
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
              await removeStoredProcessingState(restorationRunId);
            } else {
              if (savedState.isCancelled === true) {
                await removeStoredProcessingState(restorationRunId);
                return;
              }
              const hasRunId = isValidProcessingRunId(savedState.processingRunId);
              const outputFormat = ['pdf', 'epub', 'fb2', 'markdown', 'audio'].includes(savedState.outputFormat)
                ? savedState.outputFormat : undefined;
              let resumablePdf = false;
              const savedDeadline = Number.isFinite(savedState.inactivityDeadlineAt)
                ? savedState.inactivityDeadlineAt : (savedState.lastUpdate || 0) + CONFIG.PROCESSING_INACTIVITY_TIMEOUT_MS;
              if (!savedState.pdfDebuggerStarted && hasRunId && isValidProcessingRunId(savedState.pdfPrintJobId) && outputFormat === 'pdf' && Number.isInteger(savedState.pdfPrintTabId) &&
                  savedState.pdfPrintTabId >= 0 && timeSinceUpdate < CONFIG.RESET_THRESHOLD_MS && savedDeadline > Date.now()) {
                try {
                  const tab = await chrome.tabs.get(savedState.pdfPrintTabId);
                  const tabUrl = new URL(tab.url || '');
                  const printUrl = new URL(chrome.runtime.getURL('print/print.html'));
                  resumablePdf = tabUrl.protocol === printUrl.protocol && tabUrl.host === printUrl.host &&
                    tabUrl.pathname === printUrl.pathname && tabUrl.searchParams.get('job') === savedState.pdfPrintJobId;
                } catch {
                  // A closed or replaced print tab cannot continue the saved job.
                }
              }
              const uiLang = await getUILanguage();
              if (restorationRunId !== processingRunId || processingState.isProcessing || startingRunId !== null) return;
              if (hasRunId) processingRunId = savedState.processingRunId;
              const interruptedMessage = tSync('statusProcessingInterrupted', uiLang);
              processingState = {
                isProcessing: resumablePdf,
                isCancelled: false,
                progress: savedState.progress || 0,
                status: resumablePdf ? (savedState.status || tSync('statusProcessing', uiLang)) : interruptedMessage,
                error: resumablePdf ? null : interruptedMessage,
                startTime: savedState.startTime || null,
                currentStage: savedState.currentStage || null,
                completedStages: Array.isArray(savedState.completedStages) ? savedState.completedStages : [],
                outputFormat,
                ...(resumablePdf ? {
                  pdfPrintTabId: savedState.pdfPrintTabId,
                  pdfPrintJobId: savedState.pdfPrintJobId,
                  imageTranslationFailureCount: Number.isSafeInteger(savedState.imageTranslationFailureCount) &&
                    savedState.imageTranslationFailureCount > 0 ? savedState.imageTranslationFailureCount : undefined
                } : {})
              };
              if (resumablePdf) {
                processingController = new AbortController();
                scheduleProcessingDeadline(processingRunId, savedDeadline);
              }
              await saveToStorageWithRetry({ processingState: { ...processingState, lastUpdate: Date.now() } }, 3, processingRunId);
            }
          } else {
            await removeStoredProcessingState(restorationRunId);
          }
        }
      } catch (error) {
        logWarn('Error in restoreStateFromStorage', error);
        reject(error);
      } finally {
        resolve();
      }
    }, 0);
  });
}


