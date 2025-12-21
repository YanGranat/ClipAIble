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
      console.error('[ClipAIble] Uncaught error during module loading:', event.error);
      console.error('[ClipAIble] Error stack:', event.error?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
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
      console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
      console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
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
import { 
  SELECTOR_SYSTEM_PROMPT, 
  buildSelectorUserPrompt, 
  EXTRACT_SYSTEM_PROMPT,
  buildChunkSystemPrompt,
  buildChunkUserPrompt
} from './extraction/prompts.js';
import { trimHtmlForAnalysis, splitHtmlIntoChunks, deduplicateContent } from './extraction/html-utils.js';
import { cleanTitleFromServiceTokens } from './utils/html.js';
import { translateContent, translateImages, detectSourceLanguage, generateAbstract, detectContentLanguage, generateSummary, detectLanguageByCharacters } from './translation/index.js';
import { generateMarkdown } from './generation/markdown.js';
import { generatePdf, generatePdfWithDebugger } from './generation/pdf.js';
import { generateEpub } from './generation/epub.js';
import { generateFb2 } from './generation/fb2.js';
import { generateAudio } from './generation/audio.js';
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
import { extractYouTubeSubtitles, extractVimeoSubtitles } from './extraction/video-subtitles.js';
import { processSubtitlesWithAI } from './extraction/video-processor.js';
import { extractAutomaticallyInlined } from './extraction/automatic.js';
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
// API KEY MIGRATION
// ============================================

/**
 * Migrate existing plain text API keys to encrypted format
 * Runs once on extension startup
 */
async function migrateApiKeys() {
  try {
    const result = await chrome.storage.local.get([
      'openai_api_key',
      'claude_api_key',
      'gemini_api_key',
      'grok_api_key',
      'openrouter_api_key',
      'google_api_key',
      'elevenlabs_api_key',
      'qwen_api_key',
      'respeecher_api_key',
      'google_tts_api_key',
      'api_keys_migrated' // Flag to prevent repeated migration
    ]);

    const keysToEncrypt = {};
    let hasChanges = false;

    // Check and encrypt each key if needed (always check, not just on first migration)
    const keyNames = [
      'openai_api_key',
      'claude_api_key',
      'gemini_api_key',
      'grok_api_key',
      'openrouter_api_key',
      'google_api_key',
      'elevenlabs_api_key',
      'qwen_api_key',
      'respeecher_api_key',
      'google_tts_api_key'
    ];
    
    for (const keyName of keyNames) {
      const value = result[keyName];
      if (value && typeof value === 'string' && !isEncrypted(value)) {
        // Key exists and is not encrypted, encrypt it
        try {
          keysToEncrypt[keyName] = await encryptApiKey(value);
          hasChanges = true;
          log(`Migrating ${keyName} to encrypted format`);
        } catch (error) {
          logError(`Failed to encrypt ${keyName}`, error);
          // Continue with other keys
        }
      }
    }

    if (hasChanges) {
      keysToEncrypt.api_keys_migrated = true;
      await chrome.storage.local.set(keysToEncrypt);
      log('API keys migrated to encrypted format', { count: Object.keys(keysToEncrypt).length - 1 });
    } else if (!result.api_keys_migrated) {
      // Mark as migrated only if no keys to encrypt and not already migrated
      await chrome.storage.local.set({ api_keys_migrated: true });
      log('API keys migration check completed (no keys to migrate)');
    } else {
      log('API keys already migrated, checking for unencrypted keys');
    }
  } catch (error) {
    logError('API keys migration failed', error);
    // Don't throw - migration failure shouldn't break extension
  }
}

/**
 * Initialize default settings on first run
 * Ensures use_selector_cache and enable_selector_caching are set to true by default
 * Also cleans up deprecated transcription settings
 */
async function initializeDefaultSettings() {
  try {
    const result = await chrome.storage.local.get([
      'use_selector_cache',
      'enable_selector_caching',
      'transcribe_if_no_subtitles',
      'cobalt_api_url',
      'transcription_settings_cleaned'
    ]);
    
    // If use_selector_cache is undefined or null, set it to true (default: enabled)
    // Only set if it's truly undefined/null, not if it's explicitly false
    if (result.use_selector_cache === undefined || result.use_selector_cache === null) {
      await chrome.storage.local.set({ use_selector_cache: true });
    }
    
    // If enable_selector_caching is undefined or null, set it to true (default: enabled)
    if (result.enable_selector_caching === undefined || result.enable_selector_caching === null) {
      await chrome.storage.local.set({ enable_selector_caching: true });
    }
    
    // Clean up deprecated transcription settings (one-time cleanup)
    if (!result.transcription_settings_cleaned) {
      const keysToRemove = [];
      if (result.transcribe_if_no_subtitles !== undefined) {
        keysToRemove.push('transcribe_if_no_subtitles');
      }
      if (result.cobalt_api_url !== undefined) {
        keysToRemove.push('cobalt_api_url');
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        log('Cleaned up deprecated transcription settings', { keys: keysToRemove });
      }
      
      // Mark as cleaned to avoid repeated cleanup
      await chrome.storage.local.set({ transcription_settings_cleaned: true });
    }
  } catch (error) {
    logError('Failed to initialize default settings', error);
    // Don't throw - initialization failure shouldn't break extension
  }
}

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

  // Migrate existing API keys to encrypted format (fire and forget)
  try {
    migrateApiKeys()
      .catch(async error => {
        const normalized = await handleError(error, {
          source: 'initialization',
          errorType: 'apiKeyMigrationFailed',
          logError: true,
          createUserMessage: false
        });
        logError('API keys migration failed', normalized);
      });
  } catch (error) {
    handleError(error, {
      source: 'initialization',
      errorType: 'apiKeyMigrationStartFailed',
      logError: true,
      createUserMessage: false
    }).then(normalized => {
      logError('Failed to start migration', normalized);
    });
  }

  // Initialize default settings (fire and forget)
  try {
    initializeDefaultSettings()
      .catch(async error => {
        const normalized = await handleError(error, {
          source: 'initialization',
          errorType: 'settingsInitializationFailed',
          logError: true,
          createUserMessage: false
        });
        logError('Default settings initialization failed', normalized);
      });
  } catch (error) {
    handleError(error, {
      source: 'initialization',
      errorType: 'settingsInitializationStartFailed',
      logError: true,
      createUserMessage: false
    }).then(normalized => {
      logError('Failed to initialize default settings', normalized);
    });
  }
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
    
    // Remove existing menu items and wait for completion
    await chrome.contextMenus.removeAll();
    // Small delay to ensure removeAll() completes
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Get localized strings
    const parentTitle = tSync('contextMenuSaveAs', lang);
    const pdfTitle = tSync('saveAsPdf', lang);
    const epubTitle = tSync('saveAsEpub', lang);
    const fb2Title = tSync('saveAsFb2', lang);
    const markdownTitle = tSync('saveAsMarkdown', lang);
    const audioTitle = tSync('saveAsAudio', lang);
    
    // Helper function to create menu item with error handling
    const createMenuItem = (options) => {
      try {
        chrome.contextMenus.create(options);
      } catch (error) {
        // Ignore duplicate ID errors (can happen if removeAll() didn't complete yet)
        if (error.message && error.message.includes('duplicate id')) {
          logWarn(`Context menu item ${options.id} already exists, skipping`);
        } else {
          throw error;
        }
      }
    };
    
    // Create parent menu item
    createMenuItem({
      id: 'clipaible-save-as',
      title: parentTitle,
      contexts: ['page']
    });
    
    // Create child menu items
    createMenuItem({
      id: 'save-as-pdf',
      parentId: 'clipaible-save-as',
      title: pdfTitle,
      contexts: ['page']
    });
    
    createMenuItem({
      id: 'save-as-epub',
      parentId: 'clipaible-save-as',
      title: epubTitle,
      contexts: ['page']
    });
    
    createMenuItem({
      id: 'save-as-fb2',
      parentId: 'clipaible-save-as',
      title: fb2Title,
      contexts: ['page']
    });
    
    createMenuItem({
      id: 'save-as-markdown',
      parentId: 'clipaible-save-as',
      title: markdownTitle,
      contexts: ['page']
    });
    
    createMenuItem({
      id: 'save-as-audio',
      parentId: 'clipaible-save-as',
      title: audioTitle,
      contexts: ['page']
    });
    
    log('Context menu created with localization', { lang });
  } catch (error) {
    logError('Failed to create context menu', error);
    // Fallback to English if localization fails
    try {
      await chrome.contextMenus.removeAll();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const createMenuItem = (options) => {
        try {
          chrome.contextMenus.create(options);
        } catch (err) {
          if (err.message && err.message.includes('duplicate id')) {
            logWarn(`Context menu item ${options.id} already exists, skipping`);
          } else {
            throw err;
          }
        }
      };
      
      createMenuItem({
        id: 'clipaible-save-as',
        title: 'Save as',
        contexts: ['page']
      });
      createMenuItem({
        id: 'save-as-pdf',
        parentId: 'clipaible-save-as',
        title: 'Save as PDF',
        contexts: ['page']
      });
      createMenuItem({
        id: 'save-as-epub',
        parentId: 'clipaible-save-as',
        title: 'Save as EPUB',
        contexts: ['page']
      });
      createMenuItem({
        id: 'save-as-fb2',
        parentId: 'clipaible-save-as',
        title: 'Save as FB2',
        contexts: ['page']
      });
      createMenuItem({
        id: 'save-as-markdown',
        parentId: 'clipaible-save-as',
        title: 'Save as Markdown',
        contexts: ['page']
      });
      createMenuItem({
        id: 'save-as-audio',
        parentId: 'clipaible-save-as',
        title: 'Save as Audio',
        contexts: ['page']
      });
    } catch (fallbackError) {
      logError('Failed to create fallback context menu', fallbackError);
    }
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
      console.log('[ClipAIble Background] ===== STORAGE CHANGED EVENT RECEIVED =====', {
        timestamp,
        hasAudioVoiceMap: !!changes.audio_voice_map,
        hasAudioVoice: !!changes.audio_voice,
        allChanges: Object.keys(changes),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n') // Show call stack to identify source
      });
      
      // CRITICAL: Log full state of voice storage after change
      chrome.storage.local.get(['audio_voice', 'audio_voice_map', 'audio_provider']).then((currentState) => {
        console.log('[ClipAIble Background] ===== CURRENT VOICE STATE AFTER CHANGE =====', {
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
        console.error('[ClipAIble Background] Failed to read current voice state after change', error);
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
            console.log('[ClipAIble Background] Old value has "current" property (new format)');
          } else if (typeof oldValue === 'object' && !Array.isArray(oldValue)) {
            oldMap = oldValue;
            console.log('[ClipAIble Background] Old value is direct map (old format)');
          }
        }
        
        if (newValue) {
          if (typeof newValue === 'object' && 'current' in newValue && typeof newValue.current === 'object') {
            newMap = newValue.current || {};
            console.log('[ClipAIble Background] New value has "current" property (new format)');
          } else if (typeof newValue === 'object' && !Array.isArray(newValue)) {
            newMap = newValue;
            console.log('[ClipAIble Background] New value is direct map (old format)');
          }
        }
        
        console.log('[ClipAIble Background] ===== VOICE MAP CHANGED IN STORAGE =====', {
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
            
            console.log('[ClipAIble Background] ===== VOICE CHANGED FOR PROVIDER =====', {
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
                console.error('[ClipAIble Background] CRITICAL ERROR: Voice is numeric index (will cause reset!)', {
                  provider,
                  invalidVoice: voiceStr,
                  oldVoice: oldVoiceStr,
                  timestamp: Date.now()
                });
              } else if (!voiceStr.includes('_') && !voiceStr.includes('-')) {
                console.error('[ClipAIble Background] CRITICAL ERROR: Voice format invalid for offline (will cause reset!)', {
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
            console.warn('[ClipAIble Background] CRITICAL: Provider voice was REMOVED from map', {
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
        
        console.log('[ClipAIble Background] ===== LEGACY VOICE CHANGED IN STORAGE =====', {
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
          console.error('[ClipAIble Background] CRITICAL ERROR: Legacy voice is numeric index (will cause reset!)', {
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
    const uiLang = await getUILanguage();
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
    
    const settings = await chrome.storage.local.get([
      'openai_api_key', 'claude_api_key', 'gemini_api_key', 'grok_api_key', 'openrouter_api_key',
      'openai_model', 'api_provider', 'model_by_provider',
      'extraction_mode', 'use_selector_cache', 'output_format', 'generate_toc', 'generate_abstract', 'page_mode', 'pdf_language',
      'pdf_style_preset', 'pdf_font_family', 'pdf_font_size', 'pdf_bg_color', 'pdf_text_color',
      'pdf_heading_color', 'pdf_link_color',
      'audio_provider', 'elevenlabs_api_key', 'qwen_api_key', 'respeecher_api_key',
      'audio_voice', 'audio_voice_map', 'audio_speed', 'elevenlabs_model', 'elevenlabs_format',
      'elevenlabs_stability', 'elevenlabs_similarity', 'elevenlabs_style', 'elevenlabs_speaker_boost',
      'openai_instructions', 'google_tts_api_key', 'google_tts_model', 'google_tts_voice', 'google_tts_prompt',
      'respeecher_temperature', 'respeecher_repetition_penalty', 'respeecher_top_p',
      'translate_images', 'google_api_key'
    ]);
    
    // CRITICAL: Log voice settings immediately after loading from storage
    console.log('[ClipAIble Background] ===== SETTINGS LOADED FROM STORAGE (handleQuickSave) =====', {
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
    
    /** @type {Record<string, any>} */
    const settingsObj = settings;
    
    // Determine provider: use api_provider from settings, fallback to getProviderFromModel
    let provider = settingsObj.api_provider || 'openai';
    
    // Determine model: use model_by_provider for selected provider, fallback to openai_model
    let model = 'gpt-5.1'; // Default fallback
    if (settingsObj.model_by_provider && typeof settingsObj.model_by_provider === 'object' && settingsObj.model_by_provider[provider]) {
      model = String(settingsObj.model_by_provider[provider]);
    } else if (settingsObj.openai_model) {
      model = String(settingsObj.openai_model);
      // If using openai_model, verify provider matches
      const modelProvider = getProviderFromModel(model);
      if (modelProvider !== provider) {
        // Provider mismatch - use model's provider
        provider = modelProvider;
      }
    }
    
    let apiKey = '';
    
    // Get API key based on provider
    let encryptedKey = null;
    if (provider === 'openai') {
      encryptedKey = settings.openai_api_key;
    } else if (provider === 'claude') {
      encryptedKey = settings.claude_api_key;
    } else if (provider === 'gemini') {
      encryptedKey = settings.gemini_api_key;
    } else if (provider === 'grok') {
      encryptedKey = settings.grok_api_key;
    } else if (provider === 'openrouter') {
      encryptedKey = settings.openrouter_api_key;
    }
    
    if (encryptedKey && typeof encryptedKey === 'string') {
      try {
        apiKey = await decryptApiKey(encryptedKey);
      } catch (error) {
        logError(`Failed to decrypt ${provider} API key for quick save`, error);
        const uiLang = await getUILanguage();
        const errorMsg = tSync('errorQuickSaveDecryptFailed', uiLang);
        await createNotification(errorMsg);
        return;
      }
    }
    
    if (!apiKey) {
      logError('No API key configured for quick save');
      const uiLang = await getUILanguage();
      const errorMsg = tSync('errorQuickSaveNoKey', uiLang);
      await createNotification(errorMsg);
      return;
    }
    
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
    
    log('Starting quick save processing', { url: pageData.url, model });
    
    // NOTE: No await here - this is intentional "fire and forget" pattern.
    // startArticleProcessing returns true/false synchronously, processing
    // runs async via .then()/.catch() chain with proper error handling.
    // See systemPatterns.md "Design Decisions" section.
    const translateImages = Boolean(settings.translate_images) && (settings.pdf_language || 'auto') !== 'auto';
    const googleApiKey = settings.google_api_key || null;

    startArticleProcessing({
      html: pageData.html,
      url: pageData.url,
      title: pageData.title,
      apiKey: apiKey,
      provider: provider,
      model: model,
      mode: settings.extraction_mode || 'selector',
      useCache: settings.use_selector_cache !== false, // Default: true
      outputFormat: outputFormat, // Use format from context menu
      generateToc: settings.generate_toc || false,
      generateAbstract: settings.generate_abstract || false,
      pageMode: settings.page_mode || 'single',
      language: settings.pdf_language || 'auto',
      translateImages,
      googleApiKey,
      stylePreset: settings.pdf_style_preset || 'dark',
      fontFamily: settings.pdf_font_family || '',
      fontSize: settings.pdf_font_size || '31',
      bgColor: settings.pdf_bg_color || '#303030',
      textColor: settings.pdf_text_color || '#b9b9b9',
      headingColor: settings.pdf_heading_color || '#cfcfcf',
      linkColor: settings.pdf_link_color || '#6cacff',
      tabId: tab.id,
      // Audio settings (if format is audio)
      audioProvider: String(settingsObj.audio_provider || 'openai'),
      elevenlabsApiKey: settingsObj.elevenlabs_api_key || null,
      qwenApiKey: settingsObj.qwen_api_key || null,
      respeecherApiKey: settingsObj.respeecher_api_key || null,
      // Determine voice: use per-provider map if available, otherwise use legacy audio_voice
      // For Google TTS, use google_tts_voice if available, otherwise fallback to map/legacy
      audioVoice: (() => {
        const provider = String(settingsObj.audio_provider || 'openai');
        
        // CRITICAL: Log all voice-related settings for debugging
        console.log('[ClipAIble Background] CRITICAL: Voice selection from settings', {
          provider,
          audio_provider: settingsObj.audio_provider,
          audio_voice_map: settingsObj.audio_voice_map,
          audio_voice_map_type: typeof settingsObj.audio_voice_map,
          audio_voice_map_keys: settingsObj.audio_voice_map ? Object.keys(settingsObj.audio_voice_map) : [],
          audio_voice: settingsObj.audio_voice,
          audio_voice_type: typeof settingsObj.audio_voice,
          google_tts_voice: settingsObj.google_tts_voice,
          DEFAULT_AUDIO_VOICE: CONFIG.DEFAULT_AUDIO_VOICE
        });
        
        if (provider === 'google') {
          // Google TTS has its own voice setting
          const googleVoice = String(settingsObj.google_tts_voice || 'Callirrhoe');
          console.log('[ClipAIble Background] Using Google TTS voice', { googleVoice });
          return googleVoice;
        }
        
        // CRITICAL: Check if audio_voice_map has 'current' property (new format)
        // or is a direct map (old format)
        let voiceMap = {};
        if (settingsObj.audio_voice_map && typeof settingsObj.audio_voice_map === 'object') {
          // Check if it's the new format with 'current' property
          if ('current' in settingsObj.audio_voice_map && typeof settingsObj.audio_voice_map.current === 'object') {
            voiceMap = settingsObj.audio_voice_map.current;
            console.log('[ClipAIble Background] Using audio_voice_map.current (new format)', {
              voiceMap,
              voiceMapKeys: Object.keys(voiceMap)
            });
          } else {
            // Old format: direct map
            voiceMap = settingsObj.audio_voice_map;
            console.log('[ClipAIble Background] Using audio_voice_map directly (old format)', {
              voiceMap,
              voiceMapKeys: Object.keys(voiceMap)
            });
          }
        }
        
        let selectedVoice = voiceMap[provider] || settingsObj.audio_voice || CONFIG.DEFAULT_AUDIO_VOICE;
        let finalVoice = String(selectedVoice);
        
        // CRITICAL: Validate voice for offline provider - if it's a number (index), it's invalid
        // For offline provider, voice ID must contain _ and - (e.g., "ru_RU-irina-medium")
        if (provider === 'offline' && finalVoice && /^\d+$/.test(finalVoice)) {
          console.warn('[ClipAIble Background] CRITICAL: Invalid voice format detected (numeric index)', {
            provider,
            invalidVoice: finalVoice,
            willUseDefault: true
          });
          // Use default voice for the detected language (will be determined later)
          finalVoice = CONFIG.DEFAULT_AUDIO_VOICE;
        }
        
        // CRITICAL: Additional validation - ensure voice ID format is valid for offline
        if (provider === 'offline' && finalVoice && !finalVoice.includes('_') && !finalVoice.includes('-')) {
          console.warn('[ClipAIble Background] CRITICAL: Invalid voice ID format for offline provider', {
            provider,
            invalidVoice: finalVoice,
            willUseDefault: true
          });
          // Use default voice
          finalVoice = CONFIG.DEFAULT_AUDIO_VOICE;
        }
        
        console.log('[ClipAIble Background] CRITICAL: Final voice selected', {
          provider,
          voiceMap,
          voiceMapProviderValue: voiceMap[provider],
          audio_voice: settingsObj.audio_voice,
          selectedVoice,
          finalVoice,
          finalVoiceType: typeof finalVoice,
          isValidFormat: finalVoice && (finalVoice.includes('_') || finalVoice.includes('-')),
          source: voiceMap[provider] ? 'voiceMap' : (settingsObj.audio_voice ? 'audio_voice' : 'DEFAULT')
        });
        
        return finalVoice;
      })(),
      audioSpeed: (() => {
        const audioSpeed = settingsObj.audio_speed;
        const speedStr = audioSpeed && typeof audioSpeed === 'string' ? audioSpeed : String(CONFIG.DEFAULT_AUDIO_SPEED);
        const speed = parseFloat(speedStr);
        return isNaN(speed) ? CONFIG.DEFAULT_AUDIO_SPEED : speed;
      })(),
      audioFormat: CONFIG.DEFAULT_AUDIO_FORMAT, // Default format for quick save (matches popup behavior)
      elevenlabsModel: settings.elevenlabs_model || CONFIG.DEFAULT_ELEVENLABS_MODEL,
      elevenlabsFormat: settings.elevenlabs_format || 'mp3_44100_192',
      elevenlabsStability: settings.elevenlabs_stability !== undefined ? settings.elevenlabs_stability : 0.5,
      elevenlabsSimilarity: settings.elevenlabs_similarity !== undefined ? settings.elevenlabs_similarity : 0.75,
      elevenlabsStyle: settings.elevenlabs_style !== undefined ? settings.elevenlabs_style : 0.0,
      elevenlabsSpeakerBoost: settings.elevenlabs_speaker_boost !== undefined ? settings.elevenlabs_speaker_boost : true,
      openaiInstructions: settings.openai_instructions || null,
      googleTtsApiKey: settings.google_tts_api_key || null,
      geminiApiKey: settings.gemini_api_key || null,
      googleTtsModel: settings.google_tts_model || 'gemini-2.5-pro-preview-tts',
      googleTtsVoice: settings.google_tts_voice || 'Callirrhoe',
      googleTtsPrompt: settings.google_tts_prompt || null,
      respeecherTemperature: settings.respeecher_temperature !== undefined ? settings.respeecher_temperature : 1.0,
      respeecherRepetitionPenalty: settings.respeecher_repetition_penalty !== undefined ? settings.respeecher_repetition_penalty : 1.0,
      respeecherTopP: settings.respeecher_top_p !== undefined ? settings.respeecher_top_p : 1.0
    });
    
  } catch (error) {
    logError('Quick save failed', error);
    try {
      const uiLang = await getUILanguage();
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
    const uiLang = await getUILanguage();
    await setError({
      message: tSync('errorValidation', uiLang) + `: Invalid output format '${data.outputFormat}'`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive);
    return false;
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
    processVideoPage(data, videoInfo)
      .then(async result => {
        log('Video processing complete', { 
          title: result.title, 
          contentItems: result.content?.length || 0 
        });
        
        // Continue with standard pipeline: translation, TOC/Abstract, generation
        await continueProcessingPipeline(data, result, stopKeepAlive);
      })
      .then(async () => {
        // After generation, record stats and complete
        log('File generation complete');
        
        // Record stats (non-blocking - errors are handled inside recordSave)
        try {
          const processingTime = processingStartTime ? Date.now() - processingStartTime : 0;
          const state = getProcessingState();
          const savedTitle = state.result?.title || data.title || 'Untitled';
          const savedFormat = data.outputFormat || 'pdf';
          
          await recordSave({
            title: savedTitle,
            url: data.url,
            format: savedFormat,
            processingTime
          });
        } catch (error) {
          logError('Failed to record stats (non-critical)', error);
          // Continue even if stats recording fails
        }
        
        // Store format in state for success message
        const state = getProcessingState();
        const savedFormat = data.outputFormat || 'pdf';
        // @ts-ignore - outputFormat is stored in state but not in ProcessingState type (used for UI display)
        updateState({ outputFormat: savedFormat });
        
        processingStartTime = null;
        await completeProcessing(stopKeepAlive);
      })
      .catch(async error => {
        // Check if processing was cancelled - don't set error if cancelled
        if (isCancelled()) {
          log('Video processing was cancelled, not setting error');
          return;
        }
        
        const normalized = await handleError(error, {
          source: 'videoProcessing',
          errorType: 'videoProcessingFailed',
          logError: true,
          createUserMessage: true,
          context: {
            platform: videoInfo.platform,
            videoId: videoInfo.videoId
          }
        });
        
        await setError({
          message: normalized.userMessage || normalized.message || 'Video processing failed',
          code: normalized.userCode || normalized.code
        }, stopKeepAlive);
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
  
  processFunction(data)
    .then(async result => {
      log('=== startArticleProcessing: processFunction completed ===', {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        timestamp: Date.now()
      });
      
      log('Processing complete', { 
        title: result.title, 
        contentItems: result.content?.length || 0,
        outputFormat: data.outputFormat
      });
      
      // Continue with standard pipeline: translation, TOC/Abstract, generation
      log('=== startArticleProcessing: About to call continueProcessingPipeline ===', {
        outputFormat: data.outputFormat,
        timestamp: Date.now()
      });
      await continueProcessingPipeline(data, result, stopKeepAlive);
    })
      .then(async () => {
        // After generation, record stats and complete
        log('File generation complete');
        
        // Record stats (non-blocking - errors are handled inside recordSave)
        try {
          const processingTime = processingStartTime ? Date.now() - processingStartTime : 0;
          const state = getProcessingState();
          const savedTitle = state.result?.title || data.title || 'Untitled';
          const savedFormat = data.outputFormat || 'pdf';
          
          await recordSave({
            title: savedTitle,
            url: data.url,
            format: savedFormat,
            processingTime
          });
        } catch (error) {
          logError('Failed to record stats (non-critical)', error);
          // Continue even if stats recording fails
        }
        
        // Store format in state for success message
        const state = getProcessingState();
        const savedFormat = data.outputFormat || 'pdf';
        // @ts-ignore - outputFormat is stored in state but not in ProcessingState type (used for UI display)
        updateState({ outputFormat: savedFormat });
        
        processingStartTime = null;
        await completeProcessing(stopKeepAlive);
      })
    .catch(async error => {
      logError('=== startArticleProcessing: processFunction FAILED ===', {
        error: error?.message || String(error),
        errorStack: error?.stack,
        errorName: error?.name,
        timestamp: Date.now()
      });
      
      // Check if processing was cancelled - don't set error if cancelled
      if (isCancelled()) {
        log('Processing was cancelled, not setting error');
        return;
      }
      
      const normalized = await handleError(error, {
        source: 'articleProcessing',
        errorType: 'contentExtractionFailed',
        logError: true,
        createUserMessage: true,
        context: {
          url: data.url,
          format: data.outputFormat,
          mode: data.extractionMode
        }
      });
      
      // Set error with normalized message and code
      await setError({
        message: normalized.userMessage || normalized.message || 'Processing failed',
        code: normalized.userCode || normalized.code
      }, stopKeepAlive);
    });
  
  return true;
}


// ============================================
// VIDEO PAGE PROCESSING
// ============================================

/**
 * Process video page (YouTube/Vimeo) - extract subtitles, process with AI
 * @param {Object} data - Processing data
 * @param {Object} videoInfo - {platform: 'youtube'|'vimeo', videoId: string}
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
async function processVideoPage(data, videoInfo) {
  const { platform, videoId } = videoInfo;
  const { url, tabId, apiKey, model } = data;
  
  log('Processing video page', { platform, videoId, url });
  
  // Check if processing was cancelled before video processing
  if (isCancelled()) {
    log('Processing cancelled before video processing');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  // Stage 1: Extract subtitles (5-15%)
  const uiLang = await getUILanguage();
  const extractingStatus = tSync('statusExtractingSubtitles', uiLang);
  updateState({
    stage: PROCESSING_STAGES.EXTRACTING.id,
    status: extractingStatus,
    progress: 5
  });
  
  let subtitles, metadata;
  
  // Try to extract subtitles
  try {
    const subtitlesData = platform === 'youtube' 
      ? await extractYouTubeSubtitles(tabId)
      : await extractVimeoSubtitles(tabId);
    
    subtitles = subtitlesData.subtitles;
    metadata = subtitlesData.metadata;
    
    log('Subtitles extracted', { count: subtitles.length, title: metadata.title });
  } catch (error) {
    logError('Failed to extract subtitles', error);
    const errorMsg = tSync('errorNoSubtitles', uiLang);
    throw new Error(errorMsg);
  }
  
  if (!subtitles || subtitles.length === 0) {
    const errorMsg = tSync('errorNoSubtitles', uiLang);
    throw new Error(errorMsg);
  }
  
  updateState({
    progress: 15,
    status: tSync('statusProcessingSubtitles', uiLang)
  });
  
  // Check if processing was cancelled before subtitle processing
  if (isCancelled()) {
    log('Processing cancelled before subtitle processing');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  // Stage 2: Process subtitles with AI (15-40%)
  let content;
  try {
    // Progress callback for chunking progress
    const progressCallback = (current, total) => {
      if (total > 1) {
        const chunkProgress = (current / total) * 25; // 25% range (15-40%)
        updateState({ progress: 15 + chunkProgress });
      }
    };
    
    content = await processSubtitlesWithAI(subtitles, apiKey, model, progressCallback);
    log('Subtitles processed', { contentItems: content.length });
  } catch (error) {
    logError('Failed to process subtitles', error);
    throw new Error(`Failed to process subtitles: ${error.message}`);
  }
  
  updateState({ progress: 40 });
  
  // Return result in standard format for continueProcessingPipeline
  return {
    title: metadata.title || data.title || 'Untitled',
    author: metadata.author || '',
    content: content,
    publishDate: metadata.publishDate || ''
  };
}

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
  if (isCancelled()) {
    log('Processing cancelled at start of pipeline');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  // Translate if language is not auto
  const language = data.language || 'auto';
  const hasImageTranslation = data.translateImages && data.googleApiKey;
  
  // Only translate if user explicitly selected a target language (not 'auto')
  if (language !== 'auto' && result.content && result.content.length > 0) {
    const uiLang = await getUILanguage();
    const translatingStatus = tSync('statusTranslatingContent', uiLang);
    updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: translatingStatus, progress: hasImageTranslation ? 40 : 42 });
    
    // Translate images first if enabled
    if (hasImageTranslation) {
      // Check if processing was cancelled
      if (isCancelled()) {
        log('Processing cancelled before image translation');
        const uiLang = await getUILanguage();
        throw new Error(tSync('statusCancelled', uiLang));
      }
      
      log('Starting image translation', { targetLanguage: language });
      const analyzingImagesStatus = tSync('statusAnalyzingImages', uiLang);
      updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: analyzingImagesStatus, progress: 40 });
      
      // Use detected language from automatic extraction if available, otherwise detect from content
      const sourceLang = result.detectedLanguage || detectSourceLanguage(result.content);
      result.content = await translateImages(
        result.content, sourceLang, language, 
        data.apiKey, data.googleApiKey, data.model, updateState
      );
      log('Image translation complete');
    }
    
    // Check if processing was cancelled before text translation
    if (isCancelled()) {
      log('Processing cancelled before text translation');
      const uiLang = await getUILanguage();
      throw new Error(tSync('statusCancelled', uiLang));
    }
    
    log('Starting text translation', { targetLanguage: language });
    const translatingTextStatus = tSync('statusTranslatingText', uiLang);
    updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: translatingTextStatus, progress: 45 });
    try {
      result = await translateContent(result, language, data.apiKey, data.model, updateState);
      log('Translation complete', { title: result.title });
    } catch (error) {
      // Use constant pattern matching instead of string includes
      const isAuthError = ['authentication', '401', '403', 'unauthorized', 'forbidden']
        .some(pattern => (error.message || '').toLowerCase().includes(pattern));
      if (isAuthError) {
        logError('Translation failed: authentication error', error);
        const uiLang = await getUILanguage();
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
      const uiLang = await getUILanguage();
      const errorMsg = tSync('errorTranslationFailed', uiLang);
      updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: errorMsg, progress: 60 });
    }
  } else {
    // No translation needed - skip to generation progress
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, progress: 60 });
  }
  
  // Check if processing was cancelled before abstract generation
  if (isCancelled()) {
    log('Processing cancelled before abstract generation');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
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
      const uiLang = await getUILanguage();
      const abstractStatus = tSync('stageGeneratingAbstract', uiLang);
      updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: abstractStatus, progress: 62 });
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
  if (isCancelled()) {
    log('Processing cancelled before document generation');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  // Generate document based on format
  if (outputFormat === 'markdown') {
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingMarkdown', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
    return generateMarkdown({
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: effectiveLanguage,
      apiKey: data.apiKey,
      model: data.model
    }, updateState);
  } else if (outputFormat === 'epub') {
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingEpub', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
    return generateEpub({
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: effectiveLanguage
    }, updateState);
  } else if (outputFormat === 'fb2') {
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingFb2', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
    return generateFb2({
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: effectiveLanguage
    }, updateState);
  } else if (outputFormat === 'audio') {
    const audioStartTime = Date.now();
    console.log('[ClipAIble Background] === AUDIO GENERATION ENTRY POINT ===', {
      timestamp: audioStartTime,
      audioProvider: data.audioProvider,
      hasTabId: !!data.tabId,
      tabId: data.tabId,
      hasContent: !!result.content,
      contentItems: result.content?.length || 0
    });
    
    // Don't set progress here - let generateAudio manage its own progress
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingAudio', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status });
    
    // Get TTS API key based on provider
    const ttsProvider = data.audioProvider || 'openai';
    console.log('[ClipAIble Background] TTS provider determined', {
      timestamp: Date.now(),
      ttsProvider,
      hasTabId: !!data.tabId,
      tabId: data.tabId
    });
    
    log('[ClipAIble Background] === Audio generation: TTS provider selected ===', { 
      ttsProvider, 
      hasTabId: !!data.tabId,
      tabId: data.tabId,
      audioProvider: data.audioProvider 
    });
    let ttsApiKey = data.apiKey; // Default to main API key (OpenAI)
    
    // Helper function to decrypt TTS API key with localized error messages
    async function decryptTtsApiKey(encryptedKey, provider, providerName) {
      if (!encryptedKey) {
        const uiLang = await getUILanguage();
        throw new Error(tSync(`error${providerName}KeyRequired`, uiLang));
      }
      try {
        const decrypted = await decryptApiKey(encryptedKey);
        // Security: Log only metadata, never the actual key or prefix
        log(`${providerName} API key decrypted`, { 
          keyLength: decrypted?.length || 0,
          isAscii: /^[\x00-\x7F]*$/.test(decrypted || '')
        });
        return decrypted;
      } catch (error) {
        logError(`Failed to decrypt ${providerName} API key`, error);
        const uiLang = await getUILanguage();
        throw new Error(tSync(`error${providerName}KeyInvalid`, uiLang));
      }
    }
    
    if (ttsProvider === 'offline') {
      console.log('[ClipAIble Background] === OFFLINE TTS DETECTED ===', {
        timestamp: Date.now(),
        tabId: data.tabId,
        hasTabId: !!data.tabId,
        audioVoice: data.audioVoice,
        audioVoiceType: typeof data.audioVoice,
        audioProvider: data.audioProvider
      });
      
      // CRITICAL: Log voice received from popup for offline TTS
      console.log(`[ClipAIble Background] ===== OFFLINE TTS VOICE FROM POPUP ===== VOICE="${String(data.audioVoice || '')}" =====`, {
        timestamp: Date.now(),
        audioVoice: data.audioVoice,
        VOICE_STRING: `VOICE="${String(data.audioVoice || '')}"`, // Explicit string for visibility
        audioVoiceType: typeof data.audioVoice,
        audioVoiceStr: String(data.audioVoice || ''),
        isNumeric: /^\d+$/.test(String(data.audioVoice || '')),
        isValidFormat: data.audioVoice && (String(data.audioVoice).includes('_') || String(data.audioVoice).includes('-')),
        willCauseReset: /^\d+$/.test(String(data.audioVoice || '')) || (data.audioVoice && !String(data.audioVoice).includes('_') && !String(data.audioVoice).includes('-'))
      });
      
      // Offline TTS doesn't need API key
      ttsApiKey = null;
      log('[ClipAIble Background] Offline TTS selected - no API key needed', {
        tabId: data.tabId,
        timestamp: Date.now()
      });
    } else if (ttsProvider === 'elevenlabs') {
      ttsApiKey = await decryptTtsApiKey(data.elevenlabsApiKey, 'elevenlabs', 'ElevenLabs');
    } else if (ttsProvider === 'qwen') {
      ttsApiKey = await decryptTtsApiKey(data.qwenApiKey, 'qwen', 'Qwen');
    } else if (ttsProvider === 'respeecher') {
      ttsApiKey = await decryptTtsApiKey(data.respeecherApiKey, 'respeecher', 'Respeecher');
    } else if (ttsProvider === 'google') {
      ttsApiKey = await decryptTtsApiKey(data.googleTtsApiKey, 'google', 'GoogleTTS');
    } else {
      // OpenAI - use main API key
      ttsApiKey = data.apiKey;
    }
    
    // DETAILED LOGGING: Voice received in continueProcessingPipeline
    console.log('[ClipAIble Background] ===== VOICE IN continueProcessingPipeline =====', {
      timestamp: Date.now(),
      ttsProvider,
      audioVoice: data.audioVoice,
      audioVoiceType: typeof data.audioVoice,
      isNumeric: /^\d+$/.test(String(data.audioVoice)),
      googleTtsVoice: data.googleTtsVoice,
      defaultVoice: CONFIG.DEFAULT_AUDIO_VOICE
    });
    
    /** @type {AudioGenerationData} */
    const audioParams = {
      content: result.content,
      title: result.title,
      apiKey: data.apiKey, // For text preparation
      ttsApiKey: ttsApiKey, // For TTS conversion
      model: data.model,
      provider: ttsProvider,
      // For Google TTS, use googleTtsVoice; for others, use audioVoice
      // CRITICAL: Validate voice - if it's a number (index), it's invalid
      voice: (() => {
        // DETAILED LOGGING: Voice received from popup
        console.log('[ClipAIble Background] ===== VOICE RECEIVED FROM POPUP =====', {
          timestamp: Date.now(),
          ttsProvider,
          audioVoice: data.audioVoice,
          googleTtsVoice: data.googleTtsVoice,
          defaultVoice: CONFIG.DEFAULT_AUDIO_VOICE
        });
        
        if (ttsProvider === 'google') {
          const googleVoice = data.googleTtsVoice || 'Callirrhoe';
          console.log('[ClipAIble Background] ===== USING GOOGLE TTS VOICE =====', {
            timestamp: Date.now(),
            googleVoice
          });
          return googleVoice;
        }
        const voice = data.audioVoice || CONFIG.DEFAULT_AUDIO_VOICE;
        
        // DETAILED LOGGING: Voice validation
        console.log('[ClipAIble Background] ===== VALIDATING VOICE =====', {
          timestamp: Date.now(),
          ttsProvider,
          voice,
          voiceType: typeof voice,
          isNumeric: /^\d+$/.test(String(voice)),
          hasUnderscore: voice && String(voice).includes('_'),
          hasDash: voice && String(voice).includes('-')
        });
        
        // If voice is a number (index), it's invalid - use default
        if (/^\d+$/.test(String(voice))) {
          console.warn('[ClipAIble Background] ===== INVALID VOICE (NUMERIC INDEX) =====', {
            timestamp: Date.now(),
            provider: ttsProvider,
            invalidVoice: voice,
            willUseDefault: CONFIG.DEFAULT_AUDIO_VOICE
          });
          return CONFIG.DEFAULT_AUDIO_VOICE;
        }
        // For offline provider, ensure voice ID format is valid (contains _ and -)
        // CRITICAL: Ensure voice is a string before calling includes
        const voiceStr = String(voice || '');
        if (ttsProvider === 'offline' && voiceStr && !voiceStr.includes('_') && !voiceStr.includes('-')) {
          console.warn('[ClipAIble Background] ===== INVALID VOICE FORMAT FOR OFFLINE =====', {
            timestamp: Date.now(),
            provider: ttsProvider,
            invalidVoice: voice,
            willUseDefault: CONFIG.DEFAULT_AUDIO_VOICE
          });
          return CONFIG.DEFAULT_AUDIO_VOICE;
        }
        
        console.log('[ClipAIble Background] ===== VOICE VALIDATED AND READY =====', {
          timestamp: Date.now(),
          ttsProvider,
          finalVoice: voice,
          willSendToTTS: true
        });
        return voice;
      })(),
      speed: data.audioSpeed || CONFIG.DEFAULT_AUDIO_SPEED,
      format: data.audioFormat || CONFIG.DEFAULT_AUDIO_FORMAT,
      language: effectiveLanguage,
      tabId: data.tabId || null, // For offline TTS
      elevenlabsModel: data.elevenlabsModel || CONFIG.DEFAULT_ELEVENLABS_MODEL,
      elevenlabsFormat: data.elevenlabsFormat || 'mp3_44100_192',
      elevenlabsStability: data.elevenlabsStability !== undefined ? data.elevenlabsStability : 0.5,
      elevenlabsSimilarity: data.elevenlabsSimilarity !== undefined ? data.elevenlabsSimilarity : 0.75,
      elevenlabsStyle: data.elevenlabsStyle !== undefined ? data.elevenlabsStyle : 0.0,
      elevenlabsSpeakerBoost: data.elevenlabsSpeakerBoost !== undefined ? data.elevenlabsSpeakerBoost : true,
      openaiInstructions: data.openaiInstructions || null,
      googleTtsModel: data.googleTtsModel || 'gemini-2.5-pro-preview-tts',
      googleTtsVoice: data.googleTtsVoice || 'Callirrhoe',
      googleTtsPrompt: data.googleTtsPrompt || null,
      respeecherTemperature: data.respeecherTemperature !== undefined ? data.respeecherTemperature : 1.0,
      respeecherRepetitionPenalty: data.respeecherRepetitionPenalty !== undefined ? data.respeecherRepetitionPenalty : 1.0,
      respeecherTopP: data.respeecherTopP !== undefined ? data.respeecherTopP : 1.0
    };
    
    console.log('[ClipAIble Background] === PREPARING TO CALL generateAudio ===', {
      timestamp: Date.now(),
      provider: audioParams.provider,
      tabId: audioParams.tabId,
      hasContent: !!audioParams.content,
      contentItems: audioParams.content?.length || 0,
      voice: audioParams.voice,
      speed: audioParams.speed,
      language: audioParams.language,
      hasTtsApiKey: !!audioParams.ttsApiKey
    });
    
    log('[ClipAIble Background] === Audio generation: Calling generateAudio ===', { 
      provider: audioParams.provider,
      tabId: audioParams.tabId,
      hasContent: !!audioParams.content,
      contentItems: audioParams.content?.length || 0,
      voice: audioParams.voice,
      speed: audioParams.speed,
      language: audioParams.language,
      timestamp: Date.now()
    });
    
    const generateAudioStart = Date.now();
    try {
      const result = await generateAudio(audioParams, updateState);
      console.log('[ClipAIble Background] === generateAudio COMPLETE ===', {
        timestamp: Date.now(),
        duration: Date.now() - generateAudioStart,
        totalDuration: Date.now() - audioStartTime
      });
      return result;
    } catch (error) {
      console.error('[ClipAIble Background] === generateAudio FAILED ===', {
        timestamp: Date.now(),
        duration: Date.now() - generateAudioStart,
        totalDuration: Date.now() - audioStartTime,
        error: error.message,
        stack: error.stack
      });
      logError('[ClipAIble Background] generateAudio failed', {
        error: error.message,
        duration: Date.now() - generateAudioStart,
        stack: error.stack
      });
      throw error;
    }
  } else {
    // PDF (default)
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingPdf', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
    
    // Use generatePdf (not generatePdfWithDebugger) - it accepts object parameters
    const imageCount = result.content ? result.content.filter(item => item.type === 'image').length : 0;
    log('Calling generatePdf', {
      contentItems: result.content?.length || 0,
      imageCount: imageCount,
      contentTypes: result.content ? [...new Set(result.content.map(item => item?.type).filter(Boolean))] : []
    });
    /** @type {ExtendedGenerationData} */
    const pdfParams = {
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: effectiveLanguage,
      apiKey: data.apiKey,
      model: data.model,
      stylePreset: data.stylePreset || 'dark',
      fontFamily: data.fontFamily || '',
      fontSize: data.fontSize || '31',
      bgColor: data.bgColor || '#303030',
      textColor: data.textColor || '#b9b9b9',
      headingColor: data.headingColor || '#cfcfcf',
      linkColor: data.linkColor || '#6cacff',
      pageMode: data.pageMode || 'single'
    };
    return generatePdf(pdfParams, updateState);
  }
  
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
      const uiLang = await getUILanguage();
      const cachedStatus = tSync('statusUsingCachedSelectors', uiLang);
      updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: cachedStatus, progress: 3 });
      log('Using cached selectors', { url, successCount: cached.successCount || 0 });
    }
  }
  
  if (!fromCache) {
    // Check if processing was cancelled before AI analysis
    if (isCancelled()) {
      log('Processing cancelled before AI selector analysis');
      const uiLang = await getUILanguage();
      throw new Error(tSync('statusCancelled', uiLang));
    }
    
    const uiLangAnalyzing = await getUILanguage();
    const analyzingStatus = tSync('stageAnalyzing', uiLangAnalyzing);
    updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: analyzingStatus, progress: 3 });
    
    // Trim HTML for analysis
    log('Trimming HTML for analysis...');
    const htmlForAnalysis = trimHtmlForAnalysis(html, CONFIG.MAX_HTML_FOR_ANALYSIS);
    log('Trimmed HTML', { originalLength: html.length, trimmedLength: htmlForAnalysis.length });
    
    // Get selectors from AI
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
  if (isCancelled()) {
    log('Processing cancelled before content extraction');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  const uiLang = await getUILanguage();
  const extractingStatus = tSync('statusExtractingFromPage', uiLang);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: extractingStatus, progress: 5 });
  
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
  
  const uiLangComplete = await getUILanguage();
  const completeStatus = tSync('statusProcessingComplete', uiLangComplete);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: completeStatus, progress: 8 });
  
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

async function getSelectorsFromAI(html, url, title, apiKey, model) {
  log('getSelectorsFromAI called', { url, model, htmlLength: html.length });
  
  // SECURITY: Validate HTML size before processing
  const MAX_HTML_SIZE = 50 * 1024 * 1024; // 50MB
  if (html && html.length > MAX_HTML_SIZE) {
    logError('HTML too large for selector extraction', { size: html.length, maxSize: MAX_HTML_SIZE });
    throw new Error('HTML content is too large to process');
  }
  
  const systemPrompt = SELECTOR_SYSTEM_PROMPT;
  const userPrompt = buildSelectorUserPrompt(html, url, title);
  
  log('Sending request to AI...', { model, promptLength: userPrompt.length });
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  /** @type {RetryOptions} */
  const retryOptions = {
    maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
    delays: CONFIG.RETRY_DELAYS,
    retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
  };
  const parsed = await callWithRetry(
    () => callAI(systemPrompt, userPrompt, apiKey, model, true),
    retryOptions
  );
  log('Parsed selectors', parsed);
  
  return parsed;
}

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

  log('Extraction result', { 
    title: injectionResult.title,
    contentItems: injectionResult.content?.length
  });
  
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

async function processWithoutAI(data) {
  log('=== processWithoutAI: ENTRY ===', {
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    timestamp: Date.now()
  });
  
  const { html, url, title, tabId } = data;

  log('=== AUTOMATIC MODE START (NO AI) ===');
  log('Input data', { url, title, htmlLength: html?.length, tabId: tabId });

  if (!html) throw new Error('No HTML content provided');
  if (!tabId) throw new Error('Tab ID is required for automatic extraction');

  // Check if processing was cancelled
  if (isCancelled()) {
    log('Processing cancelled before automatic extraction');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }

  const uiLangExtracting = await getUILanguage();
  const extractingStatus = tSync('statusExtractingContent', uiLangExtracting);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: extractingStatus, progress: 5 });

  log('=== processWithoutAI: About to execute script ===', {
    tabId: tabId,
    url: url,
    hasExtractAutomaticallyInlined: typeof extractAutomaticallyInlined === 'function',
    timestamp: Date.now()
  });

  // Performance optimization: only collect debug info if LOG_LEVEL is DEBUG (0)
  // This significantly reduces memory and CPU usage in production
  const enableDebugInfo = CONFIG.LOG_LEVEL === 0; // 0 = DEBUG level

  // Execute automatic extraction in page context with timeout
  let results;
  try {
    log('=== processWithoutAI: Creating timeout and script promises ===', {
      enableDebugInfo: enableDebugInfo,
      logLevel: CONFIG.LOG_LEVEL,
      timestamp: Date.now()
    });
    
    // Add timeout to prevent hanging (30 seconds should be enough for most pages)
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        logError('=== processWithoutAI: TIMEOUT TRIGGERED ===', {
          timeout: 30000,
          timestamp: Date.now()
        });
        reject(new Error('Automatic extraction timeout after 30 seconds'));
      }, 30000);
    });
    
    log('=== processWithoutAI: Calling chrome.scripting.executeScript ===', {
      tabId: tabId,
      url: url,
      enableDebugInfo: enableDebugInfo,
      timestamp: Date.now()
    });
    
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractAutomaticallyInlined,
      args: [url, enableDebugInfo] // Pass enableDebugInfo flag
    });
    
    log('=== processWithoutAI: Waiting for Promise.race ===', {
      timestamp: Date.now()
    });
    
    try {
      results = await Promise.race([scriptPromise, timeoutPromise]);
      // Clear timeout if script completed successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Clear timeout on error too
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
    
    log('=== processWithoutAI: Promise.race completed ===', {
      hasResults: !!results,
      resultsLength: results?.length,
      timestamp: Date.now()
    });
    
    log('Automatic extraction executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('=== processWithoutAI: Script execution FAILED ===', {
      error: scriptError?.message || String(scriptError),
      errorStack: scriptError?.stack,
      errorName: scriptError?.name,
      timestamp: Date.now()
    });
    logError('Automatic extraction script execution failed', scriptError);
    throw new Error(`Failed to execute automatic extraction: ${scriptError.message}`);
  }

  log('=== processWithoutAI: Validating results ===', {
    hasResults: !!results,
    resultsLength: results?.length,
    hasFirstResult: !!results?.[0],
    firstResultKeys: results?.[0] ? Object.keys(results[0]) : [],
    timestamp: Date.now()
  });

  if (!results || !results[0]) {
    logError('=== processWithoutAI: Empty results ===', {
      results: results,
      timestamp: Date.now()
    });
    throw new Error('Automatic extraction returned empty results');
  }

  if (results[0].error) {
    const error = results[0].error;
    logError('=== processWithoutAI: Result contains error ===', {
      error: error,
      timestamp: Date.now()
    });
    logError('Automatic extraction error', error);
    throw new Error(`Automatic extraction error: ${error && typeof error === 'object' && 'message' in error ? error.message : String(error)}`);
  }

  /** @type {InjectionResult} */
  const automaticResult = results[0].result;
  
  if (!automaticResult) {
    logError('=== processWithoutAI: No result in results[0] ===', {
      results0Keys: Object.keys(results[0]),
      timestamp: Date.now()
    });
    throw new Error('Automatic extraction returned no result');
  }
  
  log('=== processWithoutAI: Results validated successfully ===', {
    hasResult: !!automaticResult,
    resultKeys: automaticResult ? Object.keys(automaticResult) : [],
    timestamp: Date.now()
  });

  const result = automaticResult;
  const imageCount = result.content ? result.content.filter(item => item.type === 'image').length : 0;
  
  // Log debug info if available and LOG_LEVEL is DEBUG (0)
  // Performance optimization: skip debug logging in production (LOG_LEVEL >= 1)
  if (result.debugInfo && CONFIG.LOG_LEVEL === 0) {
    log('Automatic extraction debug info', {
      foundElements: result.debugInfo.foundElements,
      imageCount: result.debugInfo.imageCount,
      allByType: result.debugInfo.allByType,
      filteredElements: result.debugInfo.filteredElements,
      filteredByType: result.debugInfo.filteredByType,
      excludedByType: result.debugInfo.excludedByType,
      excludedImageCount: result.debugInfo.excludedImageCount,
      filteredImageCount: result.debugInfo.filteredImageCount,
      processedCount: result.debugInfo.processedCount,
      skippedCount: result.debugInfo.skippedCount,
      finalImageCount: result.debugInfo.finalImageCount,
      contentTypes: result.debugInfo.contentTypes,
      finalContentTypes: result.debugInfo.finalContentTypes,
      duplicateHeadingsRemoved: result.debugInfo.duplicateHeadingsRemoved
    });
  }
  
  log('Automatic extraction result', {
    title: result.title,
    author: result.author,
    publishDate: result.publishDate,
    contentItems: result.content?.length || 0,
    imageCount: imageCount,
    contentTypes: result.content ? [...new Set(result.content.map(item => item?.type).filter(Boolean))] : [],
    hasError: !!result.error,
    error: result.error
  });
  
  // Log error details if present
  if (result.error) {
    logError('Automatic extraction returned error in result', {
      error: result.error,
      errorStack: result.errorStack
    });
  }

  if (!result.content || result.content.length === 0) {
    // Provide more detailed error message
    const errorMsg = result.error 
      ? `Automatic extraction failed: ${result.error}. The page structure may be too complex. Try using AI modes.`
      : 'Automatic extraction returned no content. The page structure may be too complex. Try using AI modes.';
    throw new Error(errorMsg);
  }

  // Detect language from content
  let detectedLanguage = 'en';
  try {
    // Extract text for language detection
    let text = '';
    for (const item of result.content) {
      if (item.text) {
        const textOnly = item.text.replace(/<[^>]+>/g, ' ').trim();
        text += textOnly + ' ';
        if (text.length > 5000) break;
      }
    }
    
    if (text.trim()) {
      // Use character-based detection (no AI needed)
      detectedLanguage = detectLanguageByCharacters(text);
      log('Language detected automatically', { language: detectedLanguage });
    }
  } catch (error) {
    logWarn('Language detection failed, using default', error);
  }

  updateState({ progress: 15 });

  return {
    title: result.title || title || 'Untitled',
    author: result.author || '',
    content: result.content,
    publishDate: result.publishDate || '',
    detectedLanguage: detectedLanguage
  };
}

// ============================================
// MODE 3: EXTRACT MODE
// ============================================

async function processWithExtractMode(data) {
  const { html, url, title, apiKey, model } = data;

  log('=== EXTRACT MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, model });

  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');

  // Check if processing was cancelled before extract mode processing
  if (isCancelled()) {
    log('Processing cancelled before extract mode processing');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }

  const uiLangAnalyzing = await getUILanguage();
  const analyzingStatus = tSync('statusAnalyzingPage', uiLangAnalyzing);
  updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: analyzingStatus, progress: 5 });

  const chunks = splitHtmlIntoChunks(html, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
  
  log('HTML split into chunks', { 
    totalLength: html.length, 
    chunkCount: chunks.length,
    chunkSizes: chunks.map(c => c.length)
  });

  const uiLangExtracting = await getUILanguage();
  const extractingContentStatus = tSync('statusExtractingContent', uiLangExtracting);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: extractingContentStatus, progress: 10 });
  
  // Check if processing was cancelled before chunk processing
  if (isCancelled()) {
    log('Processing cancelled before chunk processing');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  let result;
  if (chunks.length === 1) {
    result = await processSingleChunk(chunks[0], url, title, apiKey, model);
  } else {
    result = await processMultipleChunks(chunks, url, title, apiKey, model);
  }
  
  log('=== EXTRACT MODE END ===', { title: result.title, items: result.content?.length });
  
  if (!result.content || result.content.length === 0) {
    throw new Error('AI Extract mode returned no content. The page may use dynamic loading. Try scrolling to load all content before saving.');
  }
  
  return result;
}

async function processSingleChunk(html, url, title, apiKey, model) {
  log('processSingleChunk', { url, htmlLength: html.length });
  
  // Check if processing was cancelled before single chunk processing
  if (isCancelled()) {
    log('Processing cancelled before single chunk processing');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  const userPrompt = `Extract article content with ALL formatting preserved. Copy text EXACTLY.

Base URL: ${url}
Page title: ${title}

HTML:
${html}`;

  const uiLangProcessing = await getUILanguage();
  const processingStatus = tSync('stageAnalyzing', uiLangProcessing);
  updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: processingStatus, progress: 10 });
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  /** @type {RetryOptions} */
  const retryOptions2 = {
    maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
    delays: CONFIG.RETRY_DELAYS,
    retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
  };
  const result = await callWithRetry(
    () => callAI(EXTRACT_SYSTEM_PROMPT, userPrompt, apiKey, model, true),
    retryOptions2
  );
  
  log('Single chunk result', { title: result.title, items: result.content?.length });
  
  // Clean title from service data if present
  if (result.title) {
    result.title = cleanTitleFromServiceTokens(result.title, result.title);
  }
  
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, progress: 15 });
  return result;
}

async function processMultipleChunks(chunks, url, title, apiKey, model) {
  log('processMultipleChunks', { chunkCount: chunks.length, url });
  
  const allContent = [];
  let articleTitle = title;
  let publishDate = '';

  for (let i = 0; i < chunks.length; i++) {
    // Check if processing was cancelled
    if (isCancelled()) {
      log('Processing cancelled during chunk processing');
      const uiLang = await getUILanguage();
      throw new Error(tSync('statusCancelled', uiLang));
    }
    
    const isFirst = i === 0;
    
    log(`Processing chunk ${i + 1}/${chunks.length}`, { chunkLength: chunks[i].length, isFirst });
    
    const progressBase = 5 + Math.floor((i / chunks.length) * 10);
    const uiLangChunk = await getUILanguage();
    const chunkStatus = tSync('statusProcessingChunk', uiLangChunk)
      .replace('{current}', String(i + 1))
      .replace('{total}', String(chunks.length));
    updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: chunkStatus, progress: progressBase });

    const systemPrompt = buildChunkSystemPrompt(i, chunks.length);
    const userPrompt = buildChunkUserPrompt(chunks[i], url, title, i, chunks.length);

    try {
      // Wrap callAI with retry mechanism for reliability (429/5xx errors)
      /** @type {RetryOptions} */
      const retryOptions4 = {
        maxRetries: 3,
        delays: [1000, 2000, 4000],
        retryableStatusCodes: [429, 500, 502, 503, 504]
      };
      const result = await callWithRetry(
        () => callAI(systemPrompt, userPrompt, apiKey, model, true),
        retryOptions4
      );
      
      log(`Chunk ${i + 1} result`, { title: result.title, contentItems: result.content?.length });
      
      if (isFirst) {
        if (result.title) {
          // Clean title from service data using shared utility
          articleTitle = cleanTitleFromServiceTokens(result.title, result.title);
        }
        if (result.publishDate) publishDate = result.publishDate;
      }
      
      if (result.content && Array.isArray(result.content)) {
        allContent.push(...result.content);
      }
    } catch (error) {
      logError(`Failed to process chunk ${i + 1}`, error);
      throw error;
    }
  }

  log('All chunks processed', { totalItems: allContent.length });
  
  const deduplicated = deduplicateContent(allContent);
  log('After deduplication', { items: deduplicated.length });

  return {
    title: articleTitle,
    content: deduplicated,
    publishDate: publishDate
  };
}

