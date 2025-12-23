// @ts-check
// Background service worker for ClipAIble extension
// Main entry point - uses ES modules for modular architecture

// @typedef {import('./types.js').ChromeStorageResult} ChromeStorageResult
// @typedef {import('./types.js').SubtitleData} SubtitleData
// @typedef {import('./types.js').InjectionResult} InjectionResult
// @typedef {import('./types.js').ExtendedCacheEntry} ExtendedCacheEntry
// @typedef {import('./types.js').ExtendedProcessingState} ExtendedProcessingState
// @typedef {import('./types.js').ExtendedGenerationData} ExtendedGenerationData
// @typedef {import('./types.js').AudioGenerationData} AudioGenerationData
// @typedef {import('./types.js').RetryOptions} RetryOptions

// Import logging utilities first for use in global error handlers
import { log, logError, logWarn, logDebug, LOG_LEVELS } from './utils/logging.js';

// Global error handler for uncaught errors during module loading
// Uses logError with fallback to console.error if logging system is not yet initialized
self.addEventListener('error', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Uncaught error during module loading', event.error);
      if (event.error?.stack) {
        logError('Error stack', new Error(event.error.stack));
      }
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Uncaught error during module loading:', event.error);
      console.error('[ClipAIble] Error stack:', event.error?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Uncaught error during module loading:', event.error);
    console.error('[ClipAIble] Error stack:', event.error?.stack);
    console.error('[ClipAIble] Failed to log error:', loggingError);
  }
});

self.addEventListener('unhandledrejection', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Unhandled promise rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
      if (event.reason?.stack) {
        logError('Rejection stack', new Error(event.reason.stack));
      }
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
      console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
    console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    console.error('[ClipAIble] Failed to log rejection:', loggingError);
  }
});
import { CONFIG } from './utils/config.js';
import { 
  getProcessingState, 
  updateState, 
  cancelProcessing, 
  completeProcessing, 
  setError,
  startProcessing,
  setResult,
  restoreStateFromStorage,
  PROCESSING_STAGES,
  ERROR_CODES,
  isCancelled
} from './state/processing.js';
import { handleError, createErrorHandler, normalizeError } from './utils/error-handler.js';
import { callAI, getProviderFromModel } from './api/index.js';
import { callWithRetry } from './utils/retry.js';
import { trimHtmlForAnalysis } from './extraction/html-utils.js';
import { cleanTitleFromServiceTokens } from './utils/html.js';
import { translateContent, translateImages, detectSourceLanguage, generateAbstract, detectContentLanguage, generateSummary, detectLanguageByCharacters } from './translation/index.js';
import { DocumentGeneratorFactory } from './generation/factory.js';
import { generatePdfWithDebugger } from './generation/pdf.js';
import { recordSave, getFormattedStats, clearStats, deleteHistoryItem } from './stats/index.js';
import { 
  getCachedSelectors, 
  cacheSelectors, 
  markCacheSuccess, 
  invalidateCache, 
  clearSelectorCache, 
  getCacheStats,
  deleteDomainFromCache
} from './cache/selectors.js';
import { exportSettings, importSettings } from './settings/import-export.js';
import { removeLargeData } from './utils/storage.js';
import { encryptApiKey, isEncrypted, decryptApiKey, clearDecryptedKeyCache } from './utils/encryption.js';
import { validateAudioApiKeys } from './utils/validation.js';
import { getUILanguage, tSync } from './locales.js';
import { detectVideoPlatform } from './utils/video.js';
import { 
  checkCancellation, 
  updateProgress, 
  getUILanguageCached,
  finalizeProcessing,
  handleProcessingResult,
  handleProcessingError
} from './utils/pipeline-helpers.js';
import { VoiceValidator } from './utils/voice-validator.js';
import { TTSApiKeyManager } from './utils/api-key-manager.js';
import { selectProcessingFunction } from './processing/mode-selector.js';
import { processWithoutAI, processWithExtractMode, getSelectorsFromAI } from './processing/modes.js';
import { processVideoPage } from './processing/video.js';
import { getQuickSaveSettingsKeys, prepareQuickSaveData } from './processing/quicksave.js';
import { updateContextMenuWithLang } from './utils/context-menu.js';
import { runInitialization } from './initialization/index.js';
import { routeMessage } from './message-handlers/index.js';

// ============================================
// NOTIFICATION HELPER
// ============================================

/**
 * Create a notification with consistent styling
 * @param {string} message - Notification message
 * @param {string} title - Notification title (default: 'ClipAIble')
 * @returns {Promise<void>}
 */
async function createNotification(message, title = 'ClipAIble') {
  if (!chrome.notifications || !chrome.notifications.create) {
    logWarn('chrome.notifications API not available');
    return;
  }
  
  const iconUrl = chrome.runtime.getURL('icons/icon128.png');
  
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      requireInteraction: false
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        logError('Failed to create notification', chrome.runtime.lastError);
      } else {
        log('Notification created successfully', { notificationId, message });
      }
    });
  } catch (createError) {
    logError('Exception while creating notification', createError);
  }
}

// ============================================
// API KEY MIGRATION AND INITIALIZATION
// ============================================
// Moved to scripts/initialization/index.js

// ============================================
// INITIALIZATION
// ============================================

// Initialize extension - use setTimeout to avoid blocking module loading
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
  chrome.storage.local.get(['processingState', 'summary_generating', 'summary_generating_start_time', 'summary_text', 'summary_saved_timestamp']).then(/** @type {ChromeStorageResult & {summary_text?: string, summary_saved_timestamp?: number}} */ (result) => {
    /** @type {Partial<ProcessingState>|undefined} */
    const processingState = result.processingState && typeof result.processingState === 'object' ? result.processingState : undefined;
    const hasProcessingState = processingState && processingState.isProcessing === true;
    const hasSummaryGenerating = result.summary_generating;
    const hasSummary = result.summary_text;
    
    // CRITICAL: If extension was reloaded, reset all flags AND clear summary completely
    // We can't distinguish reload from restart, so we ALWAYS reset on service worker start
    // Only restore if state is very recent (< 1 minute) - this handles quick service worker restarts
    const RESET_THRESHOLD = CONFIG.RESET_THRESHOLD_MS;
    
    // CRITICAL: Clear summary on extension reload (one of 3 events that must clear summary)
    if (hasSummary) {
      const savedTimestamp = result.summary_saved_timestamp;
      const summaryAge = savedTimestamp && typeof savedTimestamp === 'number' ? (Date.now() - savedTimestamp) : Infinity;
      if (summaryAge > RESET_THRESHOLD) {
        log('Extension reloaded - clearing summary (too old)', {
          summaryAge,
          threshold: RESET_THRESHOLD
        });
        chrome.storage.local.remove(['summary_text', 'summary_saved_timestamp'])
          .catch(async error => {
            const normalized = await handleError(error, {
              source: 'initialization',
              errorType: 'storageRemoveFailed',
              logError: false,
              createUserMessage: false,
              context: { operation: 'removeSummaryText' }
            });
            logWarn('Failed to remove summary_text on reload', normalized);
          });
      } else {
        log('Summary is recent - may keep (quick restart)', {
          summaryAge,
          threshold: RESET_THRESHOLD
        });
      }
    }
    
    if (hasProcessingState && processingState) {
      const lastUpdate = processingState.lastUpdate;
      const timeSinceUpdate = lastUpdate && typeof lastUpdate === 'number' ? (Date.now() - lastUpdate) : Infinity;
      if (timeSinceUpdate > RESET_THRESHOLD) {
        log('Extension reloaded - resetting processingState (too old)', {
          timeSinceUpdate,
          threshold: RESET_THRESHOLD
        });
        chrome.storage.local.remove(['processingState'])
          .catch(async error => {
            const normalized = await handleError(error, {
              source: 'initialization',
              errorType: 'storageRemoveFailed',
              logError: false,
              createUserMessage: false,
              context: { operation: 'removeProcessingState' }
            });
            logWarn('Failed to remove processingState on reload', normalized);
          });
      } else {
        log('ProcessingState is recent - may restore (quick restart)', {
          timeSinceUpdate,
          threshold: RESET_THRESHOLD
        });
      }
    }
    
    if (hasSummaryGenerating) {
      const startTime = result.summary_generating_start_time;
      const timeSinceStart = startTime && typeof startTime === 'number' ? (Date.now() - startTime) : Infinity;
      
      if (timeSinceStart > RESET_THRESHOLD) {
        log('Extension reloaded - resetting summary_generating flag (too old)', {
          timeSinceStart,
          threshold: RESET_THRESHOLD
        });
        chrome.storage.local.set({
          summary_generating: false,
          summary_generating_start_time: null
        })
          .catch(async error => {
            const normalized = await handleError(error, {
              source: 'initialization',
              errorType: 'storageSetFailed',
              logError: false,
              createUserMessage: false,
              context: { operation: 'clearSummaryGenerating' }
            });
            logWarn('Failed to clear summary_generating on reload', normalized);
          });
      } else {
        log('summary_generating is recent - may restore (quick restart)', {
          timeSinceStart,
          threshold: RESET_THRESHOLD
        });
      }
    }
    
    // CRITICAL: After resetting stale flags, restore state only if it's recent (quick restart)
    // This handles service worker restarts during active generation, but resets on extension reload
    restoreStateFromStorage().then(() => {
      setTimeout(() => {
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
            // CRITICAL: Check summary_generating only if very recent (< 1 minute)
            chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']).then(/** @type {{summary_generating?: boolean, summary_generating_start_time?: number}} */ (result) => {
              const startTime = result.summary_generating_start_time;
              if (result.summary_generating && startTime && typeof startTime === 'number') {
                const timeSinceStart = Date.now() - startTime;
                
                if (timeSinceStart < RESET_THRESHOLD) {
                  // Very recent - might be quick restart, restore
                  log('summary_generating is very recent - restoring keep-alive (quick restart)', {
                    timeSinceStart,
                    threshold: RESET_THRESHOLD
                  });
                  startKeepAlive();
                } else {
                  // Too old - extension was reloaded, clear it
                  log('summary_generating is too old - clearing (extension reload)', {
                    timeSinceStart,
                    threshold: RESET_THRESHOLD
                  });
                  chrome.storage.local.set({
                    summary_generating: false,
                    summary_generating_start_time: null
                  });
                }
              }
            })
              .catch(async error => {
                const normalized = await handleError(error, {
                  source: 'initialization',
                  errorType: 'storageGetFailed',
                  logError: false,
                  createUserMessage: false,
                  context: { operation: 'checkSummaryGenerating' }
                });
                logWarn('Failed to check summary_generating on service worker start', normalized);
              });
          }
        } catch (error) {
          handleError(error, {
            source: 'initialization',
            errorType: 'keepAliveRestoreFailed',
            logError: false,
            createUserMessage: false
          }).then(normalized => {
            logWarn('Failed to restore keep-alive on service worker start', normalized);
          });
        }
      }, 100);
    })
      .catch(async error => {
        const normalized = await handleError(error, {
          source: 'initialization',
          errorType: 'stateRestoreFailed',
          logError: false,
          createUserMessage: false
        });
        logWarn('Failed to restore state on service worker start', normalized);
      });
  })
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'initialization',
        errorType: 'stateCheckFailed',
        logError: false,
        createUserMessage: false
      });
      logWarn('Failed to check state on extension load', normalized);
    });

  // Run initialization tasks (migration and default settings)
  runInitialization();
}, 0);

// ============================================
// KEEP-ALIVE MECHANISM
// ============================================

const KEEP_ALIVE_ALARM = 'keepAlive';
let keepAliveInterval = null;
let isKeepAliveStarting = false; // Flag to prevent concurrent startKeepAlive() calls

/**
 * Perform keep-alive ping: check state and save to storage to keep service worker alive
 * This is the unified logic used by both alarm and interval
 */
async function performKeepAlivePing() {
  const state = getProcessingState();
  
  try {
    // Check both processingState AND summary_generating
    const result = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    const isSummaryGenerating = result.summary_generating && result.summary_generating_start_time;
    const isProcessing = state.isProcessing;
    
    // If neither is active, stop keep-alive (called from interval check)
    if (!isProcessing && !isSummaryGenerating) {
      return false; // Signal to stop
    }
    
    const savePromises = [];
    
    if (isProcessing) {
      // Save state to keep service worker alive and preserve progress
      savePromises.push(
        chrome.storage.local.set({
          processingState: { ...state, lastUpdate: Date.now() }
        })
      );
    }
    
    // CRITICAL: Also keep alive if summary is generating
    if (isSummaryGenerating) {
      // Update timestamp to keep service worker alive
      savePromises.push(
        chrome.storage.local.set({
          summary_generating: true,
          summary_generating_start_time: result.summary_generating_start_time
        })
      );
    }
    
    if (savePromises.length > 0) {
      await Promise.all(savePromises);
    }
    
    return true; // Signal to continue
  } catch (error) {
    // On error, still try to save processingState if active (fallback)
    if (state.isProcessing) {
      try {
        await chrome.storage.local.set({
          processingState: { ...state, lastUpdate: Date.now() }
        });
      } catch (fallbackError) {
        logWarn('Keep-alive ping failed (including fallback)', { 
          error: error.message, 
          fallbackError: fallbackError.message 
        });
      }
    } else {
      logWarn('Keep-alive ping failed', error);
    }
    return true; // Continue on error to be safe
  }
}

function startKeepAlive() {
  // Prevent concurrent calls: if already starting, skip
  if (isKeepAliveStarting) {
    logWarn('Keep-alive already starting, skipping duplicate call');
    return;
  }
  
  // Prevent race condition: clear existing interval BEFORE creating new one
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  isKeepAliveStarting = true;
  
  try {
    // Create alarm as primary mechanism (MV3 requires >=1 minute)
    chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: CONFIG.KEEP_ALIVE_INTERVAL });
    if (chrome.runtime.lastError) {
      logWarn('Keep-alive alarm creation failed, using interval only', { error: chrome.runtime.lastError.message });
    }
    
    // Unified interval: performs both keep-alive ping and periodic state save
    // Uses STATE_SAVE_INTERVAL (2 seconds) for frequent pings to prevent SW death
    keepAliveInterval = setInterval(async () => {
      const shouldContinue = await performKeepAlivePing();
      
      // Auto-stop if neither processing nor summary generating
      if (!shouldContinue && keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        log('Keep-alive interval stopped - no active processing');
      }
    }, CONFIG.STATE_SAVE_INTERVAL);
    
    log('Keep-alive started', { 
      alarmIntervalMinutes: CONFIG.KEEP_ALIVE_INTERVAL, 
      pingIntervalMs: CONFIG.STATE_SAVE_INTERVAL 
    });
  } finally {
    isKeepAliveStarting = false;
  }
}

function stopKeepAlive() {
  try {
    chrome.alarms.clear(KEEP_ALIVE_ALARM);
  } catch (error) {
    logWarn('Failed to clear keep-alive alarm', error);
  }
  
  // Guaranteed cleanup of interval
  if (keepAliveInterval) {
    try {
      clearInterval(keepAliveInterval);
    } catch (error) {
      logWarn('Failed to clear keep-alive interval', error);
    } finally {
      keepAliveInterval = null;
    }
  }
  
  log('Keep-alive stopped');
}

// Alarm listener: uses same unified ping logic
try {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM) {
      log('Keep-alive alarm ping');
      await performKeepAlivePing();
    }
  });
} catch (error) {
  logError('Failed to register alarms.onAlarm listener', error);
}

// Backward compatibility: keep old function names but they're now no-ops
// This ensures existing code that calls them doesn't break
function startPeriodicStateSave() {
  // No-op: functionality merged into startKeepAlive()
  // Kept for backward compatibility
}

function stopPeriodicStateSave() {
  // No-op: functionality merged into stopKeepAlive()
  // Kept for backward compatibility
}

// ============================================
// CONTEXT MENU
// ============================================

// Format mapping for context menu items
const FORMAT_MENU_IDS = {
  'save-as-pdf': 'pdf',
  'save-as-epub': 'epub',
  'save-as-fb2': 'fb2',
  'save-as-markdown': 'markdown',
  'save-as-audio': 'audio'
};

// Flag to prevent concurrent context menu updates
let isUpdatingContextMenu = false;

// Create or update context menu with localization
async function updateContextMenu() {
  // Prevent concurrent calls
  if (isUpdatingContextMenu) {
    logWarn('Context menu update already in progress, skipping');
    return;
  }
  
  isUpdatingContextMenu = true;
  
  try {
    // Get current UI language
    const lang = await getUILanguage();
    await updateContextMenuWithLang(lang);
  } catch (error) {
    logError('Failed to update context menu', error);
  } finally {
    isUpdatingContextMenu = false;
  }
}

// Initialize context menu on install
try {
  // Cleanup stale audio files from storage (protection against SW restart)
async function cleanupStaleAudio() {
  try {
    log('[ClipAIble Cleanup] Starting stale audio cleanup...');
    const data = await chrome.storage.local.get(null);
    const now = Date.now();
    const toRemove = [];
    const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    Object.keys(data).forEach(key => {
      if (key.startsWith('clipaible_audio_') && key.endsWith('_meta')) {
        // This is a metadata key, check if it's stale
        const meta = data[key];
        if (meta && typeof meta === 'object' && 'timestamp' in meta && typeof meta.timestamp === 'number') {
          if ((now - meta.timestamp) > CLEANUP_THRESHOLD) {
            // Extract base storage key (remove _meta suffix)
            const baseKey = key.replace('_meta', '');
            toRemove.push(key, baseKey);
            log('[ClipAIble Cleanup] Found stale audio', {
              baseKey,
              age: now - meta.timestamp,
              size: 'size' in meta && typeof meta.size === 'number' ? meta.size : undefined
            });
          }
        }
      } else if (key.startsWith('clipaible_audio_') && !key.endsWith('_meta')) {
        // This is an audio key without metadata - check if metadata exists
        const metaKey = `${key}_meta`;
        if (!data[metaKey]) {
          // No metadata - likely orphaned, remove it
          toRemove.push(key);
          log('[ClipAIble Cleanup] Found orphaned audio without metadata', { key });
        }
      }
    });
    
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
      log('[ClipAIble Cleanup] Cleanup completed', {
        removedKeys: toRemove.length,
        removedAudioFiles: toRemove.filter(k => !k.endsWith('_meta')).length
      });
    } else {
      log('[ClipAIble Cleanup] No stale audio found');
    }
  } catch (error) {
    logError('[ClipAIble Cleanup] Failed to cleanup stale audio', error);
  }
}

chrome.runtime.onStartup.addListener(() => {
  log('[ClipAIble] Extension startup detected');
  cleanupStaleAudio();
});

chrome.runtime.onInstalled.addListener(() => {
    // Cleanup stale audio on install/update
    cleanupStaleAudio();
    
    updateContextMenu()
      .catch(async error => {
        const normalized = await handleError(error, {
          source: 'contextMenu',
          errorType: 'contextMenuUpdateFailed',
          logError: true,
          createUserMessage: false,
          context: { operation: 'onInstalled' }
        });
        logError('Failed to update context menu on install', normalized);
      });
  });
} catch (error) {
  logError('Failed to register runtime.onInstalled listener', error);
}

// Update context menu when extension starts (in case language changed)
// Use setTimeout to avoid blocking service worker initialization
setTimeout(() => {
  updateContextMenu()
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'contextMenu',
        errorType: 'contextMenuUpdateFailed',
        logError: true,
        createUserMessage: false,
        context: { operation: 'onStartup' }
      });
      logError('Failed to update context menu on startup', normalized);
    });
}, 0);

// Update context menu when UI language changes
try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // DETAILED LOGGING: Storage changed event received
    if (areaName === 'local' && (changes.audio_voice_map || changes.audio_voice)) {
      const timestamp = Date.now();
      log('[ClipAIble Background] ===== STORAGE CHANGED EVENT RECEIVED =====', {
        timestamp,
        hasAudioVoiceMap: !!changes.audio_voice_map,
        hasAudioVoice: !!changes.audio_voice,
        allChanges: Object.keys(changes),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n') // Show call stack to identify source
      });
      
      // CRITICAL: Log full state of voice storage after change
      chrome.storage.local.get(['audio_voice', 'audio_voice_map', 'audio_provider']).then((currentState) => {
        log('[ClipAIble Background] ===== CURRENT VOICE STATE AFTER CHANGE =====', {
          timestamp: Date.now(),
          audio_provider: currentState.audio_provider,
          audio_voice: currentState.audio_voice,
          audio_voice_type: typeof currentState.audio_voice,
          audio_voice_map: currentState.audio_voice_map,
          audio_voice_map_type: typeof currentState.audio_voice_map,
          audio_voice_map_keys: currentState.audio_voice_map ? Object.keys(currentState.audio_voice_map) : [],
          audio_voice_map_has_current: currentState.audio_voice_map && typeof currentState.audio_voice_map === 'object' && 'current' in currentState.audio_voice_map,
          audio_voice_map_current: currentState.audio_voice_map && typeof currentState.audio_voice_map === 'object' && 'current' in currentState.audio_voice_map ? currentState.audio_voice_map.current : null,
          audio_voice_map_current_keys: currentState.audio_voice_map && typeof currentState.audio_voice_map === 'object' && 'current' in currentState.audio_voice_map && typeof currentState.audio_voice_map.current === 'object' ? Object.keys(currentState.audio_voice_map.current) : []
        });
      }).catch((error) => {
        logError('[ClipAIble Background] Failed to read current voice state after change', error);
      });
    }
    
    if (areaName === 'local') {
      
      // DETAILED LOGGING: Voice selection changed in storage
      if (changes.audio_voice_map) {
        const oldValue = changes.audio_voice_map.oldValue;
        const newValue = changes.audio_voice_map.newValue;
        
        // CRITICAL: Extract actual maps (handle both old and new format)
        let oldMap = {};
        let newMap = {};
        
        // Handle old format (direct map) vs new format (with 'current' property)
        if (oldValue) {
          if (typeof oldValue === 'object' && 'current' in oldValue && typeof oldValue.current === 'object') {
            oldMap = oldValue.current || {};
            logDebug('[ClipAIble Background] Old value has "current" property (new format)');
          } else if (typeof oldValue === 'object' && !Array.isArray(oldValue)) {
            oldMap = oldValue;
            logDebug('[ClipAIble Background] Old value is direct map (old format)');
          }
        }
        
        if (newValue) {
          if (typeof newValue === 'object' && 'current' in newValue && typeof newValue.current === 'object') {
            newMap = newValue.current || {};
            logDebug('[ClipAIble Background] New value has "current" property (new format)');
          } else if (typeof newValue === 'object' && !Array.isArray(newValue)) {
            newMap = newValue;
            logDebug('[ClipAIble Background] New value is direct map (old format)');
          }
        }
        
        log('[ClipAIble Background] ===== VOICE MAP CHANGED IN STORAGE =====', {
          timestamp: Date.now(),
          oldValueRaw: oldValue,
          newValueRaw: newValue,
          oldValueType: typeof oldValue,
          newValueType: typeof newValue,
          oldValueHasCurrent: oldValue && typeof oldValue === 'object' && 'current' in oldValue,
          newValueHasCurrent: newValue && typeof newValue === 'object' && 'current' in newValue,
          oldMap,
          newMap,
          oldMapKeys: Object.keys(oldMap),
          newMapKeys: Object.keys(newMap),
          changedProviders: Object.keys(newMap).filter(provider => {
            const oldVoice = oldMap[provider];
            const newVoice = newMap[provider];
            return oldVoice !== newVoice;
          })
        });
        
        // Log each provider change with detailed analysis
        // CRITICAL: Filter out 'current' key - it's not a provider, it's a format property
        for (const [provider, voice] of Object.entries(newMap)) {
          // Skip 'current' - it's not a provider name
          if (provider === 'current') {
            continue;
          }
          
          const oldVoice = oldMap[provider];
          if (oldVoice !== voice) {
            // CRITICAL: Ensure voice is a string before calling includes
            const voiceStr = String(voice || '');
            const oldVoiceStr = String(oldVoice || '');
            
            log('[ClipAIble Background] ===== VOICE CHANGED FOR PROVIDER =====', {
              timestamp: Date.now(),
              provider,
              oldVoice,
              oldVoiceType: typeof oldVoice,
              oldVoiceStr,
              newVoice: voice,
              voiceType: typeof voice,
              voiceStr,
              isNumeric: /^\d+$/.test(voiceStr),
              oldIsNumeric: /^\d+$/.test(oldVoiceStr),
              isValidFormat: voiceStr && (voiceStr.includes('_') || voiceStr.includes('-') || provider !== 'offline'),
              oldIsValidFormat: oldVoiceStr && (oldVoiceStr.includes('_') || oldVoiceStr.includes('-') || provider !== 'offline'),
              changeReason: oldVoice ? 'voice_updated' : 'voice_set',
              willCauseReset: provider === 'offline' && (/^\d+$/.test(voiceStr) || (!voiceStr.includes('_') && !voiceStr.includes('-')))
            });
            
            // CRITICAL: Warn if voice format is invalid for offline provider
            if (provider === 'offline') {
              if (/^\d+$/.test(voiceStr)) {
                logError('[ClipAIble Background] CRITICAL ERROR: Voice is numeric index (will cause reset!)', {
                  provider,
                  invalidVoice: voiceStr,
                  oldVoice: oldVoiceStr,
                  timestamp: Date.now()
                });
              } else if (!voiceStr.includes('_') && !voiceStr.includes('-')) {
                logError('[ClipAIble Background] CRITICAL ERROR: Voice format invalid for offline (will cause reset!)', {
                  provider,
                  invalidVoice: voiceStr,
                  oldVoice: oldVoiceStr,
                  timestamp: Date.now()
                });
              }
            }
          }
        }
        
        // CRITICAL: Check if any provider was removed
        // CRITICAL: Filter out 'current' - it's not a provider, it's a format property
        for (const [provider, oldVoice] of Object.entries(oldMap)) {
          // Skip 'current' - it's not a provider name
          if (provider === 'current') {
            continue;
          }
          if (!(provider in newMap)) {
            logWarn('[ClipAIble Background] CRITICAL: Provider voice was REMOVED from map', {
              timestamp: Date.now(),
              provider,
              removedVoice: oldVoice,
              willUseDefault: true
            });
          }
        }
      }
      
      // Handle legacy audio_voice key (backward compatibility)
      if (changes.audio_voice) {
        const oldVoice = changes.audio_voice.oldValue;
        const newVoice = changes.audio_voice.newValue;
        const oldVoiceStr = String(oldVoice || '');
        const newVoiceStr = String(newVoice || '');
        
        log('[ClipAIble Background] ===== LEGACY VOICE CHANGED IN STORAGE =====', {
          timestamp: Date.now(),
          oldVoice,
          oldVoiceType: typeof oldVoice,
          oldVoiceStr,
          newVoice,
          newVoiceType: typeof newVoice,
          newVoiceStr,
          oldIsNumeric: /^\d+$/.test(oldVoiceStr),
          isNumeric: /^\d+$/.test(newVoiceStr),
          isValidFormat: newVoiceStr && (newVoiceStr.includes('_') || newVoiceStr.includes('-')),
          changeReason: oldVoice ? 'voice_updated' : 'voice_set',
          warning: /^\d+$/.test(newVoiceStr) ? 'CRITICAL: Voice is numeric index - will cause reset!' : null
        });
        
        // CRITICAL: Warn if legacy voice is numeric (will cause issues)
        if (/^\d+$/.test(newVoiceStr)) {
          logError('[ClipAIble Background] CRITICAL ERROR: Legacy voice is numeric index (will cause reset!)', {
            timestamp: Date.now(),
            invalidVoice: newVoiceStr,
            oldVoice: oldVoiceStr
          });
        }
      }
      
      // Handle UI language change
      if (changes.ui_language) {
        log('UI language changed, updating context menu', { newLang: changes.ui_language.newValue });
        updateContextMenu()
          .catch(async error => {
            const normalized = await handleError(error, {
              source: 'contextMenu',
              errorType: 'contextMenuUpdateFailed',
              logError: true,
              createUserMessage: false,
              context: { operation: 'onLanguageChange' }
            });
            logError('Failed to update context menu after language change', normalized);
          });
      }
      
      // Handle pending subtitles (fallback when Extension context invalidated)
      if (changes.pendingSubtitles && changes.pendingSubtitles.newValue) {
        /** @type {SubtitleData} */
        const pendingData = changes.pendingSubtitles.newValue;
        log('🟢 Received pendingSubtitles from storage (Extension context invalidated fallback)', {
          subtitleCount: pendingData.subtitles?.length || 0,
          timestamp: pendingData.timestamp
        });
        
        // Send message to extractYouTubeSubtitles listener if it's waiting
        // This simulates the message that would have come via chrome.runtime.sendMessage
        try {
          chrome.runtime.sendMessage({
            type: 'ClipAIbleYouTubeSubtitles',
            action: 'youtubeSubtitlesResult',
            result: {
              subtitles: pendingData.subtitles,
              metadata: pendingData.metadata
            }
          })
            .catch(async error => {
              const normalized = await handleError(error, {
                source: 'messageHandler',
                errorType: 'messageSendFailed',
                logError: false,
                createUserMessage: false,
                context: { operation: 'sendPendingSubtitles', note: 'May timeout if no listener' }
              });
              // Ignore if no listener (extractYouTubeSubtitles may have timed out)
            });
          
          // Also save to lastSubtitles for popup
          chrome.storage.local.set({
            lastSubtitles: {
              subtitles: pendingData.subtitles,
              metadata: pendingData.metadata,
              timestamp: pendingData.timestamp || Date.now()
            }
          })
            .catch(async error => {
              const normalized = await handleError(error, {
                source: 'messageHandler',
                errorType: 'storageSaveFailed',
                logError: true,
                createUserMessage: false,
                context: { operation: 'saveLastSubtitles' }
              });
              logError('Failed to save lastSubtitles', normalized);
            });
          
          // Clear pendingSubtitles after processing
          chrome.storage.local.remove('pendingSubtitles')
            .catch(async error => {
              const normalized = await handleError(error, {
                source: 'messageHandler',
                errorType: 'storageRemoveFailed',
                logError: false,
                createUserMessage: false,
                context: { operation: 'removePendingSubtitles' }
              });
              // Ignore errors when clearing pending subtitles
            });
        } catch (error) {
          handleError(error, {
            source: 'messageHandler',
            errorType: 'pendingSubtitlesProcessingFailed',
            logError: true,
            createUserMessage: false
          }).then(normalized => {
            logError('Failed to process pendingSubtitles', normalized);
          });
        }
      }
    }
  });
} catch (error) {
  logError('Failed to register storage.onChanged listener', error);
}

// Listen for context menu clicks
try {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const format = FORMAT_MENU_IDS[info.menuItemId];
    if (format) {
      log('Context menu clicked', { format, tabId: tab?.id, url: tab?.url });
      handleQuickSave(format);
    }
  });
} catch (error) {
  logError('Failed to register contextMenus.onClicked listener', error);
}

// ============================================
// QUICK SAVE (Context Menu)
// ============================================

async function handleQuickSave(outputFormat = 'pdf') {
  log('Quick save triggered', { outputFormat });
  
  const state = getProcessingState();
  if (state.isProcessing) {
    log('Already processing, ignoring quick save');
    return;
  }
  
  // Show notification about starting save
  try {
    const uiLang = await getUILanguageCached();
    const formatNames = {
      'pdf': tSync('saveAsPdf', uiLang),
      'epub': tSync('saveAsEpub', uiLang),
      'fb2': tSync('saveAsFb2', uiLang),
      'markdown': tSync('saveAsMarkdown', uiLang),
      'audio': tSync('saveAsAudio', uiLang),
      'docx': tSync('saveAsDocx', uiLang),
      'html': tSync('saveAsHtml', uiLang),
      'txt': tSync('saveAsTxt', uiLang)
    };
    const formatName = formatNames[outputFormat] || outputFormat.toUpperCase();
    const notificationMsg = tSync('quickSaveStarted', uiLang).replace('{format}', formatName);
    
    log('Showing quick save notification', { format: outputFormat, message: notificationMsg });
    await createNotification(notificationMsg);
  } catch (error) {
    logError('Failed to show quick save notification', error);
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      logError('No active tab found');
      return;
    }
    
    // Load settings
    const settings = await chrome.storage.local.get(getQuickSaveSettingsKeys());
    
    // CRITICAL: Log voice settings immediately after loading from storage
    log('[ClipAIble Background] ===== SETTINGS LOADED FROM STORAGE (handleQuickSave) =====', {
      timestamp: Date.now(),
      audio_provider: settings.audio_provider,
      audio_voice: settings.audio_voice,
      audio_voice_type: typeof settings.audio_voice,
      audio_voice_map: settings.audio_voice_map,
      audio_voice_map_type: typeof settings.audio_voice_map,
      audio_voice_map_keys: settings.audio_voice_map ? Object.keys(settings.audio_voice_map) : [],
      audio_voice_map_has_current: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map,
      audio_voice_map_current: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map ? settings.audio_voice_map.current : null,
      audio_voice_map_current_keys: settings.audio_voice_map && typeof settings.audio_voice_map === 'object' && 'current' in settings.audio_voice_map && typeof settings.audio_voice_map.current === 'object' ? Object.keys(settings.audio_voice_map.current) : [],
      raw_audio_voice_map: JSON.stringify(settings.audio_voice_map).substring(0, 500)
    });
    
    // Extract page content
    const htmlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML,
        url: window.location.href,
        title: document.title
      })
    });
    
    if (!htmlResult || !htmlResult[0]?.result) {
      logError('Failed to extract page content');
      return;
    }
    
    const pageData = htmlResult[0].result;
    
    // Prepare processing data from settings
    let processingData;
    try {
      processingData = await prepareQuickSaveData(
        settings,
        outputFormat,
        tab.id,
        pageData.html,
        pageData.url,
        pageData.title
      );
    } catch (error) {
      logError('Failed to prepare quick save data', error);
      const uiLang = await getUILanguageCached();
      let errorMsg;
      if (error.message && error.message.includes('decrypt')) {
        errorMsg = tSync('errorQuickSaveDecryptFailed', uiLang);
      } else if (error.message && error.message.includes('No API key')) {
        errorMsg = tSync('errorQuickSaveNoKey', uiLang);
      } else {
        errorMsg = error.message || tSync('errorValidation', uiLang);
      }
      await createNotification(errorMsg);
      return;
    }
    
    log('Starting quick save processing', { url: pageData.url, model: processingData.model });
    
    // NOTE: No await here - this is intentional "fire and forget" pattern.
    // startArticleProcessing returns true/false synchronously, processing
    // runs async via .then()/.catch() chain with proper error handling.
    // See systemPatterns.md "Design Decisions" section.
    startArticleProcessing(processingData);
    
  } catch (error) {
    logError('Quick save failed', error);
    try {
      const uiLang = await getUILanguageCached();
      const errorMsg = error.message || tSync('errorValidation', uiLang);
      await createNotification(errorMsg);
    } catch (notifError) {
      logError('Failed to show error notification', notifError);
    }
  }
}

// ============================================
// MESSAGE LISTENER
// ============================================

try {
  log('=== background.js: Registering chrome.runtime.onMessage listener ===', {
    timestamp: Date.now()
  });
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('=== chrome.runtime.onMessage: MESSAGE RECEIVED ===', {
      action: request?.action,
      type: request?.type,
      target: request?.target,
      hasData: !!request?.data,
      senderUrl: sender?.tab?.url || sender?.url || 'popup',
      senderTabId: sender?.tab?.id,
      isOffscreen: sender?.id === chrome.runtime.id && !sender?.tab,
      timestamp: Date.now()
    });
    
    // CRITICAL: Messages with target: 'offscreen' are for offscreen document
    // Service worker must NOT handle them - return false immediately to let them pass through
    if (request.target === 'offscreen') {
      log('[ClipAIble Background] Offscreen message detected, passing through', {
        type: request.type,
        hasData: !!request.data,
        timestamp: Date.now()
      });
      // Return false to allow message to reach offscreen document's listener
      return false;
    }
    
    const result = routeMessage(request, sender, sendResponse, {
      startArticleProcessing,
      processWithSelectorMode,
      processWithExtractMode,
      processWithoutAI,
      stopKeepAlive,
      startKeepAlive
    });
    
    log('=== chrome.runtime.onMessage: routeMessage returned ===', {
      action: request?.action,
      resultType: typeof result,
      isPromise: result instanceof Promise,
      isBoolean: typeof result === 'boolean',
      timestamp: Date.now()
    });
    
    return result;
  });
  
  log('=== background.js: chrome.runtime.onMessage listener registered successfully ===', {
    timestamp: Date.now()
  });
} catch (error) {
  logError('=== background.js: Failed to register runtime.onMessage listener ===', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    timestamp: Date.now()
  });
  logError('Failed to register runtime.onMessage listener', error);
}

// ============================================
// ARTICLE PROCESSING
// ============================================

// Track processing start time for stats
let processingStartTime = null;

async function startArticleProcessing(data) {
  log('=== startArticleProcessing: ENTRY ===', {
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    mode: data?.mode,
    url: data?.url,
    hasTabId: !!data?.tabId,
    tabId: data?.tabId,
    outputFormat: data?.outputFormat,
    timestamp: Date.now()
  });
  
  log('=== startArticleProcessing: Calling startProcessing ===', {
    timestamp: Date.now()
  });
  
  if (!(await startProcessing(startKeepAlive))) {
    logError('=== startArticleProcessing: startProcessing returned false ===', {
      timestamp: Date.now()
    });
    return false;
  }
  
  log('=== startArticleProcessing: startProcessing returned true ===', {
    timestamp: Date.now()
  });
  
  // Validate output format
  // Note: docx, html, txt formats removed from UI but kept in validation for backward compatibility with old settings
  const VALID_FORMATS = ['pdf', 'epub', 'fb2', 'markdown', 'audio', 'docx', 'html', 'txt'];
  if (data.outputFormat && !VALID_FORMATS.includes(data.outputFormat)) {
    const uiLang = await getUILanguageCached();
    await setError({
      message: tSync('errorValidation', uiLang) + `: Invalid output format '${data.outputFormat}'`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive);
    return false;
  }
  
  // CRITICAL: Save outputFormat to state immediately so polling can use correct interval
  // This is especially important for audio format which needs longer polling interval
  if (data.outputFormat) {
    // @ts-ignore - outputFormat is stored in state but not in ProcessingState type (used for UI display)
    updateState({ outputFormat: data.outputFormat });
    log('=== startArticleProcessing: outputFormat saved to state ===', {
      outputFormat: data.outputFormat,
      timestamp: Date.now()
    });
  }
  
  // Clean up any old temporary data before starting new processing
  try {
    await removeLargeData('printHtml');
    await chrome.storage.local.remove(['printTitle', 'pageMode']);
    log('Cleaned up old temporary data');
  } catch (cleanupError) {
    logWarn('Failed to clean up old temporary data', cleanupError);
    // Continue anyway - not critical
  }
  
  processingStartTime = Date.now();
  
  log('Starting article processing', {
    mode: data.mode,
    model: data.model,
    outputFormat: data.outputFormat,
    generateToc: data.generateToc,
    generateAbstract: data.generateAbstract,
    url: data.url,
    htmlLength: data.html?.length || 0
  });
  
  // Pre-flight key checks for audio to avoid long work before failing
  if (!(await validateAudioApiKeys(data, stopKeepAlive))) {
    return false;
  }
  
  // Check if this is a video page (YouTube/Vimeo)
  const videoInfo = detectVideoPlatform(data.url);
  if (videoInfo) {
    // Process as video page - skip selector/extract modes
    log('Detected video page', { platform: videoInfo.platform, videoId: videoInfo.videoId });
    
    const processingStartTimeRef = { processingStartTime };
    
    processVideoPage(data, videoInfo)
      .then(async result => {
        log('Video processing complete', { 
          title: result.title, 
          contentItems: result.content?.length || 0 
        });
        
        await handleProcessingResult(
          data, 
          result, 
          stopKeepAlive, 
          processingStartTimeRef,
          continueProcessingPipeline
        );
      })
      .catch(async error => {
        await handleProcessingError(error, data, stopKeepAlive, {
          source: 'videoProcessing',
          errorType: 'videoProcessingFailed',
          context: {
            platform: videoInfo.platform,
            videoId: videoInfo.videoId
          }
        });
      });
    return true;
  }
  
  // Standard article processing continues below
  
  // Standard article processing
  const { mode } = data;
  
  log('=== startArticleProcessing: Selecting process function ===', {
    mode: mode,
    hasProcessWithoutAI: typeof processWithoutAI === 'function',
    hasProcessWithSelectorMode: typeof processWithSelectorMode === 'function',
    hasProcessWithExtractMode: typeof processWithExtractMode === 'function',
    timestamp: Date.now()
  });
  
  const processFunction = mode === 'automatic'
    ? processWithoutAI
    : mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  log('=== startArticleProcessing: Process function selected ===', {
    mode: mode,
    functionName: processFunction?.name || 'unknown',
    timestamp: Date.now()
  });
  
  log('=== startArticleProcessing: About to call processFunction ===', {
    functionName: processFunction?.name || 'unknown',
    timestamp: Date.now()
  });
  
  const processingStartTimeRef = { processingStartTime };
  
  processFunction(data)
    .then(async result => {
      log('=== startArticleProcessing: processFunction completed ===', {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        timestamp: Date.now()
      });
      
      await handleProcessingResult(
        data, 
        result, 
        stopKeepAlive, 
        processingStartTimeRef,
        continueProcessingPipeline
      );
    })
    .catch(async error => {
      await handleProcessingError(error, data, stopKeepAlive, {
        source: 'articleProcessing',
        errorType: 'contentExtractionFailed',
        context: {
          url: data.url,
          format: data.outputFormat,
          mode: data.mode || data.extractionMode
        }
      });
    });
  
  return true;
}


// ============================================
// VIDEO PAGE PROCESSING
// ============================================

// processVideoPage moved to scripts/processing/video.js

/**
 * Continue processing pipeline after content extraction
 * Handles: translation, TOC/Abstract generation, document generation
 * Used by both standard article processing and video processing
 * @param {Object} data - Original processing data
 * @param {Object} result - Extracted content result
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 */
async function continueProcessingPipeline(data, result, stopKeepAlive) {
  // Check if processing was cancelled
  await checkCancellation('start of pipeline');
  
  // Translate if language is not auto
  const language = data.language || 'auto';
  const hasImageTranslation = data.translateImages && data.googleApiKey;
  
  // Only translate if user explicitly selected a target language (not 'auto')
  if (language !== 'auto' && result.content && result.content.length > 0) {
    await updateProgress(
      PROCESSING_STAGES.TRANSLATING, 
      'statusTranslatingContent', 
      hasImageTranslation ? 40 : 42
    );
    
    // Translate images first if enabled
    if (hasImageTranslation) {
      // Check if processing was cancelled
      await checkCancellation('image translation');
      
      log('Starting image translation', { targetLanguage: language });
      await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusAnalyzingImages', 40);
      
      // Use detected language from automatic extraction if available, otherwise detect from content
      const sourceLang = result.detectedLanguage || detectSourceLanguage(result.content);
      result.content = await translateImages(
        result.content, sourceLang, language, 
        data.apiKey, data.googleApiKey, data.model, updateState
      );
      log('Image translation complete');
    }
    
    // Check if processing was cancelled before text translation
    await checkCancellation('text translation');
    
    log('Starting text translation', { targetLanguage: language });
    await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusTranslatingText', 45);
    try {
      result = await translateContent(result, language, data.apiKey, data.model, updateState);
      log('Translation complete', { title: result.title });
    } catch (error) {
      // Use constant pattern matching instead of string includes
      const isAuthError = ['authentication', '401', '403', 'unauthorized', 'forbidden']
        .some(pattern => (error.message || '').toLowerCase().includes(pattern));
      if (isAuthError) {
        logError('Translation failed: authentication error', error);
        const uiLang = await getUILanguageCached();
        const errorMsg = tSync('errorAuthFailed', uiLang);
        updateState({ 
          stage: PROCESSING_STAGES.TRANSLATING.id,
          status: errorMsg, 
          progress: 0,
          error: 'AUTH_ERROR'
        });
        throw new Error(errorMsg);
      }
      // For other errors, log but continue without translation
      logError('Translation failed, continuing without translation', error);
      await updateProgress(PROCESSING_STAGES.TRANSLATING, 'errorTranslationFailed', 60);
    }
  } else {
    // No translation needed - skip to generation progress
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, progress: 60 });
  }
  
  // Check if processing was cancelled before abstract generation
  await checkCancellation('abstract generation');
  
  // Generate abstract if enabled (but skip for audio format)
  let abstract = '';
  const shouldGenerateAbstract = data.generateAbstract && 
                                 data.outputFormat !== 'audio' && 
                                 result.content && 
                                 result.content.length > 0 && 
                                 data.apiKey;
  if (shouldGenerateAbstract) {
    // Use detected source language for abstract (not target translation language)
    // For automatic mode, result.detectedLanguage contains the source language
    // For AI modes, if result.detectedLanguage is not available, use 'auto'
    // to let generateAbstract detect the language from content
    const abstractLang = result.detectedLanguage || 'auto';
    try {
      await updateProgress(PROCESSING_STAGES.GENERATING, 'stageGeneratingAbstract', 62);
      abstract = await generateAbstract(
        result.content, 
        result.title || data.title || 'Untitled',
        data.apiKey,
        data.model,
        abstractLang,
        updateState
      );
      if (abstract) {
        log('Abstract generated', { length: abstract.length });
        result.abstract = abstract;
      }
    } catch (error) {
      logWarn('Abstract generation failed, continuing without abstract', error);
    }
  }
  
  setResult(result);
  
  const outputFormat = data.outputFormat || 'pdf';
  
  // Detect content language for 'auto' mode
  let effectiveLanguage = data.language || 'auto';
  if (effectiveLanguage === 'auto') {
    // Use detected language from automatic extraction if available
    if (result.detectedLanguage) {
      effectiveLanguage = result.detectedLanguage;
      log('Using detected language from automatic extraction for localization', { detectedLang: effectiveLanguage });
    } else if (result.content && result.content.length > 0 && data.apiKey) {
      // Fallback to AI detection if API key available
      try {
        const detectedLang = await detectContentLanguage(result.content, data.apiKey, data.model);
        if (detectedLang && detectedLang !== 'en') {
          effectiveLanguage = detectedLang;
          log('Using detected language for localization', { detectedLang });
        }
      } catch (error) {
        logWarn('Language detection failed, using auto', error);
      }
    }
  }
  
  updateState({ stage: PROCESSING_STAGES.GENERATING.id, progress: 65 });
  
  // Check if processing was cancelled before document generation
  await checkCancellation('document generation');
  
  // Prepare data for factory (add effectiveLanguage for audio generation)
  const factoryData = {
    ...data,
    effectiveLanguage: effectiveLanguage
  };
  
  // Generate document using factory
  return DocumentGeneratorFactory.generate(outputFormat, factoryData, result, updateState);
  
  // Note: recordSave and completeProcessing are handled by the promise chain
  // that calls this function, not here (since we return a promise from generate*)
}

// ============================================
// MODE 1: SELECTOR MODE
// ============================================

async function processWithSelectorMode(data) {
  const { html, url, title, apiKey, model, tabId } = data;
  
  log('=== SELECTOR MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, tabId });
  
  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');
  if (!tabId) throw new Error('No tab ID provided');
  
  // Check cache first (if enabled)
  let selectors;
  let fromCache = false;
  // Explicit check: use cache if explicitly true, or if undefined/null (default: true)
  // Only skip cache if explicitly false
  const useCache = data.useCache !== false; // true if undefined/null/true, false only if explicitly false
  
  if (useCache) {
    /** @type {ExtendedCacheEntry|null} */
    const cached = await getCachedSelectors(url);
    if (cached) {
      selectors = cached.selectors;
      fromCache = true;
      await updateProgress(PROCESSING_STAGES.ANALYZING, 'statusUsingCachedSelectors', 3);
      log('Using cached selectors', { url, successCount: cached.successCount || 0 });
    }
  }
  
  if (!fromCache) {
    // Check if processing was cancelled before AI analysis
    await checkCancellation('AI selector analysis');
    
    await updateProgress(PROCESSING_STAGES.ANALYZING, 'stageAnalyzing', 3);
    
    // Trim HTML for analysis
    log('Trimming HTML for analysis...');
    const htmlForAnalysis = trimHtmlForAnalysis(html, CONFIG.MAX_HTML_FOR_ANALYSIS);
    log('Trimmed HTML', { originalLength: html.length, trimmedLength: htmlForAnalysis.length });
    
    // Get selectors from AI (imported from processing/modes.js)
    log('Requesting selectors from AI...');
    try {
      selectors = await getSelectorsFromAI(htmlForAnalysis, url, title, apiKey, model);
      log('Received selectors from AI', selectors);
    } catch (error) {
      logError('Failed to get selectors from AI', error);
      throw new Error(`AI selector analysis failed: ${error.message}`);
    }
    
    if (!selectors) {
      throw new Error('AI returned empty selectors');
    }
  }
  
  // Check if processing was cancelled before content extraction
  await checkCancellation('content extraction');
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusExtractingFromPage', 5);
  
  // Extract content using selectors
  log('Extracting content using selectors...', { tabId, selectors });
  let extractedContent;
  try {
    extractedContent = await extractContentWithSelectors(tabId, selectors, url);
    log('Content extracted', { 
      title: extractedContent?.title,
      contentItems: extractedContent?.content?.length || 0
    });
  } catch (error) {
    // Invalidate cache if extraction failed with cached selectors
    if (fromCache) {
      log('Extraction failed with cached selectors, invalidating cache');
      await invalidateCache(url);
    }
    logError('Failed to extract content with selectors', error);
    throw new Error(`Content extraction failed: ${error.message}`);
  }
  
  if (!extractedContent || !extractedContent.content) {
    if (fromCache) await invalidateCache(url);
    throw new Error('No content extracted from page');
  }
  
  if (extractedContent.content.length === 0) {
    if (fromCache) await invalidateCache(url);
    const selectorsStr = JSON.stringify(selectors);
    const truncated = selectorsStr.length > 200 ? selectorsStr.substring(0, 200) + '...' : selectorsStr;
    logError('Extracted content is empty', { selectors: truncated });
    throw new Error('Extracted content is empty. Try switching to "AI Extract" mode.');
  }
  
  // Cache selectors after successful extraction ONLY
  // If extraction failed, cache is already invalidated above
  try {
    if (!fromCache) {
      await cacheSelectors(url, selectors);
    } else {
      await markCacheSuccess(url);
    }
  } catch (error) {
    logError('Failed to update cache (non-critical)', error);
    // Don't throw - cache update failure shouldn't break extraction
  }
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusProcessingComplete', 8);
  
  const publishDate = selectors.publishDate || extractedContent.publishDate || '';
  const finalTitle = extractedContent.title || title;
  const finalAuthor = extractedContent.author || selectors.author || '';
  
  // NOTE: Title and author separation is now handled by AI in prompts
  // AI is instructed to return clean title (without author) in "title" field
  // and author name (without prefixes) in "author" field
  // If AI returns title with author included, it's a prompt issue - improve prompts, don't add code-side fixes
  // This approach is site-agnostic and works for all languages (not just "от/by" patterns)
  
  log('=== SELECTOR MODE END ===', { title: finalTitle, author: finalAuthor, items: extractedContent.content.length });
  
  return {
    title: finalTitle,
    author: finalAuthor,
    content: extractedContent.content,
    publishDate: publishDate
  };
}

// getSelectorsFromAI moved to scripts/processing/modes.js

async function extractContentWithSelectors(tabId, selectors, baseUrl) {
  log('extractContentWithSelectors', { tabId, selectors, baseUrl });
  
  if (!tabId) {
    throw new Error('Tab ID is required for content extraction');
  }
  
  // SECURITY: Validate baseUrl before passing to executeScript
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Invalid baseUrl: must be a non-empty string');
  }
  
  // SECURITY: Validate selectors structure
  if (!selectors || typeof selectors !== 'object') {
    throw new Error('Invalid selectors: must be an object');
  }
  
  // Validate selectors.exclude is an array if present
  if (selectors.exclude && !Array.isArray(selectors.exclude)) {
    throw new Error('Invalid selectors.exclude: must be an array');
  }
  
  let results;
  try {
    // Execute extraction function directly in the page context
    // Using world: 'MAIN' to access page's DOM properly
    // SECURITY: baseUrl and selectors are validated above
    results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractFromPageInlined,
      args: [selectors, baseUrl]
    });
    log('Script executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('Script execution failed', scriptError);
    throw new Error(`Failed to execute script on page: ${scriptError.message}`);
  }

  if (!results || !results[0]) {
    throw new Error('Script execution returned empty results');
  }
  
  /** @type {InjectionResult} */
  const injectionResult = results[0].result;
  
  if (injectionResult && 'error' in injectionResult && injectionResult.error) {
    const error = injectionResult.error;
    logError('Script execution error', error);
    let errorMsg = '';
    if (typeof error === 'string') {
      errorMsg = error;
    } else if (error && typeof error === 'object') {
      const errorObj = /** @type {Record<string, any>} */ (error);
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        errorMsg = errorObj.message;
      } else {
        errorMsg = String(error);
      }
    } else {
      errorMsg = String(error);
    }
    throw new Error(`Script error: ${errorMsg}`);
  }
  
  if (!injectionResult) {
    throw new Error('Script returned no result');
  }

  // Log detailed extraction result with full content preview
  const extractionDetails = {
    title: injectionResult.title,
    author: injectionResult.author || 'N/A',
    publishDate: injectionResult.publishDate || 'N/A',
    contentItems: injectionResult.content?.length || 0,
    contentTypes: injectionResult.content ? [...new Set(injectionResult.content.map(item => item?.type).filter(Boolean))] : [],
    contentByType: injectionResult.content ? injectionResult.content.reduce((acc, item) => {
      const type = item?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}) : {},
    contentPreview: injectionResult.content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      level: item.level || null,
      textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
      textPreview: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 200),
      hasHtml: !!(item.html && item.html !== item.text),
      htmlLength: item.html ? item.html.length : 0
    })) || [],
    totalTextLength: injectionResult.content ? injectionResult.content.reduce((sum, item) => {
      const text = (item.text || '').replace(/<[^>]+>/g, '').trim();
      return sum + text.length;
    }, 0) : 0,
    imageCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'image').length : 0,
    headingCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'heading').length : 0,
    paragraphCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'paragraph').length : 0,
    listCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'list').length : 0,
    quoteCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'quote').length : 0
  };
  
  log('=== EXTRACTION RESULT (SELECTOR MODE) ===', extractionDetails);
  
  // Log full content structure for debugging
  if (injectionResult.content && injectionResult.content.length > 0) {
    log('=== EXTRACTED CONTENT FULL STRUCTURE ===', {
      totalItems: injectionResult.content.length,
      items: injectionResult.content.map((item, idx) => ({
        index: idx,
        type: item.type,
        level: item.level || null,
        textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
        textFull: (item.text || '').replace(/<[^>]+>/g, '').trim(),
        htmlLength: item.html ? item.html.length : 0,
        hasImage: item.type === 'image' ? {
          url: item.url || item.src || 'N/A',
          alt: item.alt || 'N/A'
        } : null,
        listItems: item.type === 'list' && item.items ? {
          count: item.items.length,
          ordered: item.ordered || false,
          itemsPreview: item.items.slice(0, 3).map((li, liIdx) => {
            let text = '';
            if (typeof li === 'string') {
              text = li.substring(0, 100);
            } else if (typeof li === 'object' && li !== null && 'html' in li) {
              // @ts-ignore - li is object with html property
              text = (li.html || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
            }
            return { index: liIdx, text };
          })
        } : null
      }))
    });
  }
  
  // Log subtitle debug info if available
  if (injectionResult && injectionResult.debug && injectionResult.debug.subtitleDebug) {
    const subDebug = injectionResult.debug.subtitleDebug;
    log('=== SUBTITLE EXTRACTION DEBUG ===', {
      subtitleFound: subDebug.subtitleFound,
      subtitleText: subDebug.subtitleText,
      firstHeadingFound: subDebug.firstHeadingFound,
      firstHeadingIndex: subDebug.firstHeadingIndex,
      firstHeadingText: subDebug.firstHeadingText,
      titleInContent: subDebug.titleInContent,
      titleAdded: subDebug.titleAdded,
      subtitleInserted: subDebug.subtitleInserted,
      subtitleInsertIndex: subDebug.subtitleInsertIndex,
      elementsProcessedBeforeFirstHeading: subDebug.elementsProcessedBeforeFirstHeading,
      totalContentItemsBeforeInsert: subDebug.totalContentItemsBeforeInsert,
      articleTitle: injectionResult.title
    });
    
    // Log content before insert with full details
    if (subDebug.contentBeforeInsert && subDebug.contentBeforeInsert.length > 0) {
      log('Content BEFORE subtitle insert (first 5 items):');
      subDebug.contentBeforeInsert.forEach((item, idx) => {
        log(`  [${item.index}] ${item.type}: "${item.text}"`);
      });
    } else {
      log('Content BEFORE subtitle insert: EMPTY or not logged');
    }
    
    // Log content after insert with full details
    if (subDebug.contentAfterInsert && subDebug.contentAfterInsert.length > 0) {
      log('Content AFTER subtitle insert (first 5 items):');
      subDebug.contentAfterInsert.forEach((item, idx) => {
        log(`  [${item.index}] ${item.type}: "${item.text}"`);
      });
    } else {
      log('Content AFTER subtitle insert: EMPTY or not logged');
    }
    
    // Log actual final content structure with FULL text (not truncated)
    const firstItems = injectionResult.content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      level: ('level' in item ? item.level : null) || null,
      text: (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim(),
      textLength: (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim().length
    }));
    log('Final content structure (first 10 items with FULL text):');
    firstItems?.forEach((item) => {
      const levelStr = item.level ? ` (level ${item.level})` : '';
      log(`  [${item.index}] ${item.type}${levelStr}: "${item.text.substring(0, 150)}${item.text.length > 150 ? '...' : ''}" (${item.textLength} chars)`);
    });
    
    // Check if subtitle is actually in the right position
    const subtitleIndex = injectionResult.content?.findIndex(item => item.type === 'subtitle');
    const titleIndex = injectionResult.content?.findIndex(item => 
      item.type === 'heading' && 
      (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim() === injectionResult.title
    );
    log('Position check:', {
      subtitleIndex: subtitleIndex !== undefined ? subtitleIndex : 'NOT FOUND',
      titleIndex: titleIndex !== undefined ? titleIndex : 'NOT FOUND',
      expectedSubtitleIndex: titleIndex !== undefined ? titleIndex + 1 : 'N/A',
      isSubtitleRightAfterTitle: subtitleIndex === titleIndex + 1
    });
  } else {
    log('No subtitle debug info available');
  }
  
  return injectionResult;
}

// Inlined extraction function for chrome.scripting.executeScript
// This runs in the page's main world context
// 
// NOTE: This function is 517 lines (2707-3223) - DO NOT SPLIT IT!
// It's injected as a single block via executeScript. All helper functions
// must be defined inside. See systemPatterns.md "Design Decisions".
function extractFromPageInlined(selectors, baseUrl) {
  const content = [];
  const debugInfo = {
    containerFound: false,
    containerSelector: null,
    elementsProcessed: 0,
    elementsExcluded: 0,
    headingCount: 0
  };
  
  const tocMapping = {};
  let footnotesHeaderAdded = false;
  const addedImageUrls = new Set();
  let firstHeadingIndex = -1; // Track position of first heading for subtitle insertion
  let subtitleToInsert = null; // Store subtitle to insert after first heading
  
  // Debug info for subtitle insertion
  const subtitleDebug = {
    subtitleFound: false,
    subtitleText: null,
    firstHeadingFound: false,
    firstHeadingIndex: -1,
    firstHeadingText: null,
    titleInContent: false,
    titleAdded: false,
    subtitleInserted: false,
    subtitleInsertIndex: -1,
    contentBeforeInsert: [],
    contentAfterInsert: [],
    elementsProcessedBeforeFirstHeading: 0,
    totalContentItemsBeforeInsert: 0
  };
  
  // Helper functions
  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    try { return new URL(url, baseUrl).href; } catch (e) { return url; }
  }
  
  function normalizeText(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  
  function normalizeImageUrl(url) {
    if (!url) return '';
    try { return new URL(url, window.location.href).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
  }
  
  function isInfoboxDiv(element) {
    if (element.tagName.toLowerCase() !== 'div') return false;
    const className = element.className.toLowerCase();
    return ['spoiler', 'interview', 'terminology', 'infobox', 'note-box', 'callout'].some(cls => className.includes(cls));
  }
  
  function shouldExclude(element) {
    if (isInfoboxDiv(element) || element.tagName.toLowerCase() === 'aside' || element.tagName.toLowerCase() === 'details') return false;
    if (!selectors.exclude) return false;
    // NO FALLBACKS - only check exclude selectors determined by AI
    for (const selector of selectors.exclude) {
      try { if (element.matches(selector) || element.closest(selector)) return true; } catch (e) {}
    }
    return false;
  }
  
  function getFormattedHtml(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('a[href]').forEach(a => { a.href = toAbsoluteUrl(a.getAttribute('href')); });
    if (selectors.exclude) {
      selectors.exclude.forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {} });
    }
    return clone.innerHTML;
  }
  
  // Image helpers
  function isImageUrl(url) {
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
    const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
    const hosts = ['substackcdn', 'imgur', 'cloudinary', 'imgix', 'wp-content/uploads', 'media.', 'images.', 'cdn.'];
    const lowerUrl = url.toLowerCase();
    for (const ext of exts) { if (lowerUrl.includes(ext + '?') || lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '#')) return true; }
    if (hosts.some(host => lowerUrl.includes(host))) return true;
    return false;
  }
  
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:') && url.length < 200) return true;
    return ['placeholder', 'spacer', 'blank.gif', 'pixel.gif', 'loading.'].some(p => lowerUrl.includes(p));
  }
  
  function isSmallOrAvatarImage(imgElement, src) {
    if (!src) return true;
    const resizeMatch = src.match(/resize:(fit|fill):(\d+)(?::(\d+))?/);
    if (resizeMatch) {
      const w = parseInt(resizeMatch[2]), h = resizeMatch[3] ? parseInt(resizeMatch[3]) : w;
      if (w < 100 || h < 100) return true;
    }
    if (imgElement) {
      const nw = imgElement.naturalWidth || 0, nh = imgElement.naturalHeight || 0;
      if (nw > 0 && nh > 0 && (nw < 100 || nh < 100)) return true;
      const cn = (imgElement.className || '').toLowerCase();
      if (cn.includes('avatar') || cn.includes('profile') || cn.includes('author')) return true;
    }
    return false;
  }
  
  function getBestSrcsetUrl(srcset) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(s => s);
    let bestUrl = null, bestScore = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part || part.startsWith('data:')) continue;
      const descMatch = part.match(/\s+(\d+(?:\.\d+)?[wx])$/i);
      let url = descMatch ? part.substring(0, part.length - descMatch[0].length).trim() : part;
      if (!url || url.startsWith('data:')) continue;
      url = url.replace(/^["']|["']$/g, '');
      if (!url.match(/^(https?:\/\/|\/\/|\/)/)) continue;
      let score = 1;
      if (descMatch) {
        const d = descMatch[1].toLowerCase();
        score = d.endsWith('w') ? (parseInt(d) || 1) : ((parseFloat(d) || 1) * 1000);
      }
      if (score >= bestScore) { bestScore = score; bestUrl = url; }
    }
    return bestUrl;
  }
  
  function isTrackingPixelOrSpacer(imgElement, src) {
    const w = imgElement?.naturalWidth || imgElement?.width || parseInt(imgElement?.getAttribute('width')) || 0;
    const h = imgElement?.naturalHeight || imgElement?.height || parseInt(imgElement?.getAttribute('height')) || 0;
    if ((w === 1 && h === 1) || (w === 0 && h === 0)) return true;
    if (src) {
      const ls = src.toLowerCase();
      if (ls.includes('spacer') || ls.includes('pixel') || ls.includes('tracking')) return true;
    }
    return false;
  }
  
  function extractBestImageUrl(imgElement, containerElement = null) {
    if (!imgElement) return null;
    let src = null;
    const container = containerElement || imgElement.parentElement;
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc)) src = imgElement.currentSrc;
    if (!src) {
      const parentLink = container?.closest('a[href]') || container?.querySelector('a[href]');
      if (parentLink) { const href = parentLink.getAttribute('href'); if (href && isImageUrl(href)) src = href; }
    }
    if (!src) { const imgSrc = imgElement.src || imgElement.getAttribute('src'); if (imgSrc && !isPlaceholderUrl(imgSrc)) src = imgSrc; }
    if (!src) src = getBestSrcsetUrl(imgElement.getAttribute('srcset'));
    if (!src) {
      const picture = imgElement.closest('picture') || container?.querySelector('picture');
      if (picture) { for (const source of picture.querySelectorAll('source[srcset]')) { const ss = getBestSrcsetUrl(source.getAttribute('srcset')); if (ss) src = ss; } }
    }
    if (!src) {
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-full-src']) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes('data:')) { src = attr === 'data-srcset' ? getBestSrcsetUrl(val) : val; if (src) break; }
      }
    }
    return src;
  }
  
  function extractTocMapping(listElement) {
    const links = listElement.querySelectorAll('a[href^="#"]');
    if (links.length < 2) return false;
    let isToc = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const anchor = href.substring(1), text = normalizeText(link.textContent);
        if (text && anchor) { tocMapping[text] = anchor; isToc = true; }
      }
    });
    return isToc;
  }
  
  // Find containers
  let containers = [];
  let container = null;
  const aiSelectors = [selectors.content, selectors.articleContainer].filter(Boolean);
  
  for (const sel of aiSelectors) {
    try {
      const allElements = document.querySelectorAll(sel);
      if (allElements.length > 1) {
        containers = Array.from(allElements);
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
        break;
      } else if (allElements.length === 1) {
        container = allElements[0];
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        break;
      }
    } catch (e) {}
  }
  
  if (container && containers.length === 0) {
    const articlesInside = container.querySelectorAll('article');
    if (articlesInside.length > 1) {
      containers = Array.from(articlesInside);
      debugInfo.multipleContainers = true;
      debugInfo.containerCount = containers.length;
      container = null;
    }
  }
  
  if (containers.length === 0 && !container) {
    container = document.body;
    debugInfo.containerSelector = 'body';
  }
  
  // Get title
  let articleTitle = '';
  if (selectors.title) {
    try { const titleEl = document.querySelector(selectors.title); if (titleEl) articleTitle = titleEl.textContent.trim(); } catch (e) {}
  }
  if (!articleTitle) {
    const allArticles = document.querySelectorAll('main article');
    if (allArticles.length > 1) {
      const h1OutsideMain = Array.from(document.querySelectorAll('h1')).find(h1 => !h1.closest('main'));
      if (h1OutsideMain) articleTitle = h1OutsideMain.textContent.trim();
    }
  }
  if (!articleTitle) { const h1 = document.querySelector('h1'); if (h1) articleTitle = h1.textContent.trim(); }
  
  // Clean title from service data immediately after extraction
  // Note: cleanTitleFromServiceTokens is not available in page context, so we inline the logic here
  // This is the only place where we need to clean title in page context
  if (articleTitle && typeof articleTitle === 'string') {
    let cleaned = articleTitle;
    cleaned = cleaned.replace(/budgettoken[_\s]*budget\d*/gi, '');
    cleaned = cleaned.replace(/budget\d+/gi, '');
    cleaned = cleaned.replace(/token/gi, '');
    cleaned = cleaned.replace(/budget\w+/gi, '');
    cleaned = cleaned.replace(/#+/g, '');
    cleaned = cleaned.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^[_\s-]+|[_\s-]+$/g, '');
    articleTitle = cleaned || articleTitle;
  }
  
  let articleAuthor = selectors.author || '';
  // NOTE: Author cleaning is now handled by AI in prompts
  // AI is instructed to return author name without prefixes (от, by, автор:, etc.)
  // If author still contains prefix, it's a prompt issue - improve prompts, don't add code-side fixes
  
  let publishDate = '';
  for (const sel of ['time[datetime]', 'time', '[itemprop="datePublished"]', '.date', '.post-date']) {
    try {
      const dateEl = document.querySelector(sel);
      if (dateEl) {
        if (sel.startsWith('meta')) publishDate = dateEl.getAttribute('content') || '';
        else if (dateEl.hasAttribute('datetime')) publishDate = dateEl.getAttribute('datetime');
        else publishDate = dateEl.textContent.trim();
        if (publishDate) break;
      }
    } catch (e) {}
  }
  
  function getAnchorId(el) {
    if (el.id) return el.id;
    if (el.getAttribute && el.getAttribute('name')) return el.getAttribute('name');
    const fc = el.firstElementChild;
    if (fc) {
      const ct = fc.tagName?.toLowerCase();
      if (ct === 'a' || ct === 'span') {
        if (fc.id) return fc.id;
        if (fc.getAttribute && fc.getAttribute('name')) return fc.getAttribute('name');
      }
    }
    const nested = el.querySelector('a[id], a[name], span[id], span[name], sup[id], [id^="source"], [id^="ref"], [id^="cite"]');
    if (nested) return nested.id || nested.getAttribute('name') || '';
    return '';
  }
  
  function processElement(element) {
    if (shouldExclude(element)) { debugInfo.elementsExcluded++; return; }
    const tagName = element.tagName.toLowerCase();
    try { const style = window.getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden') return; } catch (e) {}
    debugInfo.elementsProcessed++;
    const elementId = getAnchorId(element);
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = element.textContent.trim();
      const formattedText = getFormattedHtml(element);
      // Include heading even if it matches articleTitle (it's the main title)
      // Only skip if it's clearly author name or other metadata
      if (text) {
        if (articleAuthor) {
          const tl = text.toLowerCase(), al = articleAuthor.toLowerCase();
          if (tl === al || (text.length < 50 && tl.includes(al))) return;
        }
        let headingId = elementId;
        if (!headingId) {
          const nh = normalizeText(text);
          if (tocMapping[nh]) headingId = tocMapping[nh];
          else headingId = String(debugInfo.headingCount + 1);
        }
        debugInfo.headingCount++;
        const headingItem = { type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId };
        content.push(headingItem);
        
        // Track first heading position and insert subtitle immediately after it
        // This ensures subtitle is right after the title, before any other content
        if (firstHeadingIndex === -1) {
          firstHeadingIndex = content.length - 1;
          subtitleDebug.firstHeadingFound = true;
          subtitleDebug.firstHeadingIndex = firstHeadingIndex;
          subtitleDebug.firstHeadingText = text.substring(0, 100);
          subtitleDebug.titleInContent = articleTitle && (
            text === articleTitle || text.toLowerCase() === articleTitle.toLowerCase()
          );
          // If we have a subtitle to insert, insert it now (right after this heading)
          if (subtitleToInsert) {
            content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
            subtitleDebug.subtitleInserted = true;
            subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
            subtitleToInsert = null; // Clear it so we don't insert it again
          }
        }
      }
    }
    else if (tagName === 'p') {
      let html = getFormattedHtml(element);
      if (html.trim()) {
        const pt = element.textContent?.trim() || '';
        if (articleAuthor && pt === articleAuthor) return;
        const ct = pt.replace(/[\s\u00A0]/g, '');
        if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
        if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
        content.push({ type: 'paragraph', text: html, id: elementId });
      }
    }
    else if (tagName === 'img') {
      if (element.closest('figure')) return;
      let src = extractBestImageUrl(element);
      src = toAbsoluteUrl(src);
      const ns = normalizeImageUrl(src);
      if (src && !isTrackingPixelOrSpacer(element, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(element, src)) {
        content.push({ type: 'image', src: src, alt: element.alt || '', id: elementId });
        addedImageUrls.add(ns);
      }
    }
    else if (tagName === 'figure') {
      const img = element.querySelector('img');
      const figcaption = element.querySelector('figcaption');
      if (img) {
        let src = extractBestImageUrl(img, element);
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
          const captionText = figcaption ? getFormattedHtml(figcaption) : '';
          content.push({ 
            type: 'image', 
            src: src, 
            alt: img.alt || '', 
            caption: captionText,
            id: elementId || img.id || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'blockquote') {
      content.push({ type: 'quote', text: getFormattedHtml(element), id: elementId });
    }
    else if (tagName === 'ul' || tagName === 'ol') {
      if (Object.keys(tocMapping).length === 0) extractTocMapping(element);
      const items = Array.from(element.querySelectorAll(':scope > li')).map(li => {
        const liId = getAnchorId(li);
        let html = getFormattedHtml(li);
        if (liId && !html.includes(`id="${liId}"`)) html = `<a id="${liId}" name="${liId}"></a>${html}`;
        return { html, id: liId };
      }).filter(item => item.html);
      if (items.length > 0) content.push({ type: 'list', ordered: tagName === 'ol', items: items, id: elementId });
    }
    else if (tagName === 'pre') {
      const code = element.querySelector('code');
      const text = code ? code.textContent : element.textContent;
      const langClass = code?.className.match(/language-(\w+)/);
      content.push({ type: 'code', language: langClass ? langClass[1] : 'text', text: text, id: elementId });
    }
    else if (tagName === 'table') {
      const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(element.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => getFormattedHtml(td)));
      if (headers.length > 0 || rows.length > 0) content.push({ type: 'table', headers: headers, rows: rows, id: elementId });
    }
    else if (tagName === 'hr') {
      content.push({ type: 'separator', id: elementId });
    }
    else if (tagName === 'aside' || tagName === 'details' || isInfoboxDiv(element)) {
      const summary = element.querySelector(':scope > summary');
      const titleEl = element.querySelector(':scope > .spoiler-title, :scope > .interview-title, :scope > h3, :scope > h4');
      const titleText = summary ? summary.textContent.trim() : (titleEl ? titleEl.textContent.trim() : '');
      content.push({ type: 'infobox_start', title: titleText, id: elementId });
      for (const child of element.children) {
        const ct = child.tagName.toLowerCase();
        const isTitle = ct === 'summary' || child.classList.contains('spoiler-title') || (titleText && child.textContent.trim() === titleText);
        if (!isTitle) processElement(child);
      }
      content.push({ type: 'infobox_end' });
    }
    else if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const cn = element.className?.toLowerCase() || '';
      const elId = element.id?.toLowerCase() || '';
      const isFootnotes = cn.includes('footnotes') || elId.includes('footnotes');
      if (isFootnotes && !footnotesHeaderAdded) {
        content.push({ type: 'separator', id: '' });
        // Use 'Footnotes' as fallback - localization happens later in html-builder.js
        // PDF_LOCALIZATION is not available in page context
        content.push({ type: 'heading', level: 2, text: 'Footnotes', id: 'footnotes-section' });
        footnotesHeaderAdded = true;
      }
      for (const child of element.children) processElement(child);
    }
  }
  
  // Helper function to find content elements with fallback strategies
  function findContentElements(container, contentSelector, containerSelector) {
    if (!contentSelector || contentSelector === containerSelector) {
      return null; // No specific content selector
    }
    
    try {
      // Strategy 1: Try selector as-is (absolute from document)
      let elements = document.querySelectorAll(contentSelector);
      if (elements.length > 0) {
        // Filter to only elements that are inside our container
        const filtered = Array.from(elements).filter(el => container.contains(el));
        if (filtered.length > 0) {
          return filtered;
        }
      }
      
      // Strategy 2: Try selector relative to container
      elements = container.querySelectorAll(contentSelector);
      if (elements.length > 0) {
        return Array.from(elements);
      }
      
      // Strategy 3: If selector contains container selector, try removing it
      let normalizedSelector = contentSelector;
      if (containerSelector && contentSelector.includes(containerSelector)) {
        normalizedSelector = contentSelector.replace(containerSelector, '').trim();
        if (normalizedSelector.startsWith(' ')) {
          normalizedSelector = normalizedSelector.substring(1);
        }
        if (normalizedSelector.startsWith('>')) {
          normalizedSelector = normalizedSelector.substring(1).trim();
        }
        
        if (normalizedSelector && normalizedSelector !== contentSelector) {
          elements = container.querySelectorAll(normalizedSelector);
          if (elements.length > 0) {
            return Array.from(elements);
          }
        }
      }
      
      // Strategy 4: If selector uses direct child (>), try without it to find nested elements
      if (contentSelector.includes(' > ')) {
        const flexibleSelector = contentSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      
      // Strategy 5: If selector is an ID selector (#id), try finding it anywhere and check if it's in container
      if (contentSelector.startsWith('#')) {
        const id = contentSelector.substring(1);
        const element = document.getElementById(id);
        if (element && container.contains(element)) {
          return [element];
        }
      }
      
      // Strategy 6: Extract tag names and try to find them anywhere in container
      const tagMatch = contentSelector.match(/([a-z]+)(?:\s|$|#|\.)/i);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        elements = container.querySelectorAll(tagName);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      
      return null; // No elements found with any strategy
    } catch (e) {
      return null; // Selector is invalid
    }
  }
  
  // Extract subtitle if selector provided (BEFORE processing content)
  // Subtitle should be added after the title (first heading), before main content
  // We'll store it and insert it immediately after the first heading is found
  if (selectors.subtitle && selectors.subtitle.trim()) {
    try {
      const subtitleEl = document.querySelector(selectors.subtitle);
      if (subtitleEl) {
        subtitleDebug.subtitleFound = true;
        // Check if element is visible (not hidden)
        try {
          const style = window.getComputedStyle(subtitleEl);
          if (style.display === 'none' || style.visibility === 'hidden') {
            // Element is hidden, skip it
          } else {
            const subtitleText = subtitleEl.textContent.trim();
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            // Subtitle should be meaningful (at least 20 characters, typically 50-300)
            if (subtitleText && subtitleText.length >= 20) {
              // Check if subtitle is not excluded
              if (!shouldExclude(subtitleEl)) {
                const subtitleHtml = getFormattedHtml(subtitleEl);
                subtitleToInsert = { 
                  type: 'subtitle', 
                  text: subtitleText, 
                  html: `<p class="standfirst">${subtitleHtml}</p>`,
                  isStandfirst: true 
                };
              }
            }
          }
        } catch (styleError) {
          // If style check fails, try to extract anyway
          const subtitleText = subtitleEl.textContent.trim();
          if (subtitleText && subtitleText.length >= 20 && !shouldExclude(subtitleEl)) {
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            const subtitleHtml = getFormattedHtml(subtitleEl);
            subtitleToInsert = { 
              type: 'subtitle', 
              text: subtitleText, 
              html: `<p class="standfirst">${subtitleHtml}</p>`,
              isStandfirst: true 
            };
          }
        }
      }
    } catch (e) {
      // Selector might be invalid, continue without subtitle
    }
  }
  
  // Start processing
  const containerSelector = selectors.articleContainer || 'body';
  if (containers.length > 0) {
    for (const cont of containers) {
      const contentElements = findContentElements(cont, selectors.content, containerSelector);
      if (contentElements && contentElements.length > 0) {
        // Process found elements
        for (const el of contentElements) {
          if (!shouldExclude(el)) processElement(el);
        }
      } else {
        // Fallback: process all children recursively
        for (const child of cont.children) processElement(child);
      }
    }
  } else if (container) {
    const contentElements = findContentElements(container, selectors.content, containerSelector);
    if (contentElements && contentElements.length > 0) {
      // Process found elements
      for (const el of contentElements) {
        if (!shouldExclude(el)) processElement(el);
      }
    } else {
      // Fallback: process all children recursively
      for (const child of container.children) processElement(child);
    }
  }
  
  // If subtitle wasn't inserted yet, ensure title is in content and insert subtitle after it
  // CRITICAL: Title (h1) might be outside article, so it won't be processed
  // We need to add it to content if it's missing, but ONLY if it's not already there
  if (subtitleToInsert) {
    // Store debug info
    subtitleDebug.totalContentItemsBeforeInsert = content.length;
    subtitleDebug.elementsProcessedBeforeFirstHeading = debugInfo.elementsProcessed;
    
    // Store content state before insertion for debugging
    subtitleDebug.contentBeforeInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
    
    // Find the first heading in content
    let firstHeadingIndex = -1;
    let titleInContent = false;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i].type === 'heading') {
        firstHeadingIndex = i;
        subtitleDebug.firstHeadingFound = true;
        subtitleDebug.firstHeadingIndex = i;
        subtitleDebug.firstHeadingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
        // Check if this heading matches article title
        if (articleTitle) {
          const headingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
          if (headingText === articleTitle || headingText.toLowerCase() === articleTitle.toLowerCase()) {
            titleInContent = true;
            subtitleDebug.titleInContent = true;
          }
        }
        break;
      }
    }
    
    // If no heading found AND title is not in content, add title at the beginning
    // This handles case when title is outside article and not processed
    if (firstHeadingIndex === -1 && articleTitle && !titleInContent) {
      // Double-check: search entire content for title text to avoid duplicates
      let titleExists = false;
      for (let i = 0; i < content.length; i++) {
        const itemText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
        if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
          titleExists = true;
          break;
        }
      }
      
      // Only add title if it doesn't exist anywhere in content
      if (!titleExists) {
        const titleItem = { type: 'heading', level: 1, text: articleTitle, id: 'article-title' };
        content.unshift(titleItem);
        firstHeadingIndex = 0;
        subtitleDebug.titleAdded = true;
        subtitleDebug.firstHeadingIndex = 0;
        subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
        subtitleDebug.titleInContent = true;
      } else {
        subtitleDebug.titleInContent = true;
        // Title exists but might not be a heading - find its position
        for (let i = 0; i < content.length; i++) {
          const item = content[i];
          const itemText = ('text' in item && item.text ? String(item.text) : '').replace(/<[^>]+>/g, '').trim();
          if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
            if (item.type === 'heading') {
              firstHeadingIndex = i;
              subtitleDebug.firstHeadingIndex = i;
              subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
            }
            break;
          }
        }
      }
    }
    
    // Insert subtitle right after first heading (or at beginning if no heading)
    if (firstHeadingIndex >= 0 && subtitleToInsert) {
      // @ts-ignore - subtitleToInsert is a ContentItem but TypeScript infers union type
      content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
    } else if (subtitleToInsert) {
      // No heading found, insert at the beginning
      // @ts-ignore - subtitleToInsert is a ContentItem but TypeScript infers union type
      content.unshift(subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = 0;
    }
    subtitleToInsert = null;
    
    // Store content state after insertion for debugging
    subtitleDebug.contentAfterInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
  }
  
  // Extract hero image if selector provided
  // Hero image should be added after the title and subtitle (if subtitle exists), not at the very beginning
  if (selectors.heroImage) {
    try {
      const heroImgEl = document.querySelector(selectors.heroImage);
      if (heroImgEl && heroImgEl.tagName?.toLowerCase() === 'img') {
        let heroSrc = extractBestImageUrl(heroImgEl);
        heroSrc = toAbsoluteUrl(heroSrc);
        const ns = normalizeImageUrl(heroSrc);
        if (heroSrc && !isTrackingPixelOrSpacer(heroImgEl, heroSrc) && !isPlaceholderUrl(heroSrc) && !isSmallOrAvatarImage(heroImgEl, heroSrc) && !addedImageUrls.has(ns)) {
          // Find first heading position
          let firstHeadingIndex = -1;
          for (let i = 0; i < content.length; i++) {
            if (content[i].type === 'heading') {
              firstHeadingIndex = i;
              break;
            }
          }
          
          // Determine insert position:
          // 1. If heading found, check if subtitle is right after it
          // 2. If subtitle exists at firstHeadingIndex + 1, insert hero image after subtitle
          // 3. Otherwise, insert hero image after heading (or at position 0 if no heading)
          let insertIndex = firstHeadingIndex >= 0 ? firstHeadingIndex + 1 : 0;
          
          // Check if subtitle is at the position right after heading
          if (firstHeadingIndex >= 0 && content[firstHeadingIndex + 1]?.type === 'subtitle') {
            insertIndex = firstHeadingIndex + 2; // Insert after subtitle
          }
          
          /** @type {ContentItem} */
          const imageItem = { type: 'image', url: heroSrc, src: heroSrc, alt: heroImgEl.alt || '', id: getAnchorId(heroImgEl) };
          // @ts-ignore - imageItem is a ContentItem but TypeScript infers union type
          content.splice(insertIndex, 0, imageItem);
          addedImageUrls.add(ns);
        }
      }
    } catch (e) {
    }
  }
  
  // Add subtitle debug info to debug object
  if (subtitleToInsert || subtitleDebug.subtitleFound) {
    debugInfo.subtitleDebug = subtitleDebug;
  }
  
  return { title: articleTitle, author: articleAuthor, content: content, publishDate: publishDate, debug: debugInfo };
}

// ============================================
// MODE 2: AUTOMATIC MODE (NO AI)
// ============================================
// processWithoutAI moved to scripts/processing/modes.js

// ============================================
// MODE 3: EXTRACT MODE
// ============================================
// processWithExtractMode, processSingleChunk, processMultipleChunks moved to scripts/processing/modes.js

