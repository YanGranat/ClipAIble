// Background service worker for ClipAIble extension
// Main entry point - uses ES modules for modular architecture

// Global error handler for uncaught errors during module loading
// КРИТИЧНО: Enhanced error handling to prevent service worker crashes
self.addEventListener('error', (event) => {
  console.error('[ClipAIble] Uncaught error during module loading:', event.error);
  console.error('[ClipAIble] Error stack:', event.error?.stack);
  
  // Try to save error state to storage for recovery
  try {
    chrome.storage.local.set({
      lastError: {
        message: event.error?.message || String(event.error),
        stack: event.error?.stack,
        timestamp: Date.now()
      }
    }).catch(() => {
      // Ignore storage errors in error handler
    });
  } catch (e) {
    // Ignore errors in error handler
  }
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
  console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
  
  // Try to save error state to storage for recovery
  try {
    chrome.storage.local.set({
      lastError: {
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        timestamp: Date.now(),
        type: 'unhandledRejection'
      }
    }).catch(() => {
      // Ignore storage errors in error handler
    });
  } catch (e) {
    // Ignore errors in error handler
  }
  
  // КРИТИЧНО: Prevent default behavior to keep service worker alive
  // Don't prevent default - let it fail gracefully
});

import { log, logError, logWarn } from './utils/logging.js';

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
import { translateContent, translateImages, detectSourceLanguage, generateAbstract, detectContentLanguage } from './translation/index.js';
import { generateMarkdown } from './generation/markdown.js';
import { generatePdf, generatePdfWithDebugger } from './generation/pdf.js';
import { generateEpub } from './generation/epub.js';
import { generateFb2 } from './generation/fb2.js';
import { generateAudio } from './generation/audio.js';
// Commented out: docx, html, txt formats removed from UI
// import { generateDocx } from './generation/docx.js';
// import { generateHtml } from './generation/html.js';
// import { generateTxt } from './generation/txt.js';
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
import { encryptApiKey, isEncrypted, decryptApiKey } from './utils/encryption.js';
import { getUILanguage, tSync } from './locales.js';
import { detectVideoPlatform } from './utils/video.js';
import { extractYouTubeSubtitles, extractVimeoSubtitles } from './extraction/video-subtitles.js';
import { processSubtitlesWithAI } from './extraction/video-processor.js';
import { createUserFriendlyError } from './utils/error-messages.js';

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
      'google_api_key',
      'elevenlabs_api_key',
      'qwen_api_key',
      'respeecher_api_key',
      'google_tts_api_key',
      'api_keys_migrated' // Flag to prevent repeated migration
    ]);

    // Skip if already migrated
    if (result.api_keys_migrated) {
      log('API keys already migrated, skipping');
      return;
    }

    const keysToEncrypt = {};
    let hasChanges = false;

    // Check and encrypt each key if needed
    const keyNames = [
      'openai_api_key',
      'claude_api_key',
      'gemini_api_key',
      'grok_api_key',
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
    } else {
      // Mark as migrated even if no keys to encrypt
      await chrome.storage.local.set({ api_keys_migrated: true });
      log('API keys migration check completed (no keys to migrate)');
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
    // Fallback to console.error if log() fails (shouldn't happen, but safety first)
    console.error('[ClipAIble] Failed to log:', error);
  }

  // КРИТИЧНО: Restore state on service worker restart (non-blocking)
  // This is already called in setTimeout below, but keep this as backup
  try {
    restoreStateFromStorage();
  } catch (error) {
    logError('Failed to restore state', error);
  }

  // Migrate existing API keys to encrypted format (fire and forget)
  try {
    migrateApiKeys().catch(error => {
      logError('API keys migration failed', error);
    });
  } catch (error) {
    logError('Failed to start migration', error);
  }

  // Initialize default settings (fire and forget)
  try {
    initializeDefaultSettings().catch(error => {
      logError('Default settings initialization failed', error);
    });
  } catch (error) {
    logError('Failed to initialize default settings', error);
  }
}, 0);

// ============================================
// KEEP-ALIVE MECHANISM
// ============================================

const KEEP_ALIVE_ALARM = 'keepAlive';
let keepAliveFallbackTimer = null;

function startKeepAlive() {
  // КРИТИЧНО: Prevent race condition - check if already running
  // If keep-alive is already active, don't restart it (prevents interruption)
  if (keepAliveFallbackTimer) {
    log('Keep-alive already running, not restarting to avoid interruption');
    return; // Already running - don't restart
  }
  
  // КРИТИЧНО: Create alarm with delayInMinutes: 0 to fire immediately, then periodically
  chrome.alarms.create(KEEP_ALIVE_ALARM, { 
    delayInMinutes: 0, // Fire immediately
    periodInMinutes: CONFIG.KEEP_ALIVE_INTERVAL 
  });
  if (chrome.runtime.lastError) {
    logWarn('Keep-alive alarm creation failed, enabling fallback timer', { error: chrome.runtime.lastError.message });
  }
  
  // ULTRA AGGRESSIVE fallback ping - MV3 requires >=1m for alarms, but we ping storage every 10 seconds
  // This is the PRIMARY keep-alive mechanism - alarms are just backup
  // Create new timer only after clearing old one to prevent race condition
  keepAliveFallbackTimer = setInterval(async () => {
    try {
      const state = getProcessingState();
      const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
      const isSummaryGenerating = summaryState.summary_generating === true;
      
      // КРИТИЧНО: ALWAYS ping storage if processing OR generating summary - this keeps SW alive
      if (state.isProcessing || isSummaryGenerating) {
        // ULTRA AGGRESSIVE: Save state EVERY TIME to keep service worker alive
        const keepAliveData = {
          processingState: state.isProcessing ? { ...state, lastUpdate: Date.now() } : undefined,
          summary_generating: isSummaryGenerating ? true : undefined,
          summary_generating_start_time: isSummaryGenerating ? (summaryState.summary_generating_start_time || Date.now()) : undefined,
          // КРИТИЧНО: Add heartbeat timestamp to ensure SW stays alive
          keepAliveHeartbeat: Date.now()
        };
        
        // Remove undefined values
        Object.keys(keepAliveData).forEach(key => {
          if (keepAliveData[key] === undefined) {
            delete keepAliveData[key];
          }
        });
        
        if (Object.keys(keepAliveData).length > 0) {
          // КРИТИЧНО: Use set() with callback to ensure it completes - this keeps SW alive
          chrome.storage.local.set(keepAliveData, () => {
            // Callback ensures operation completes - keeps SW alive
            if (chrome.runtime.lastError) {
              logWarn('Keep-alive storage write error', chrome.runtime.lastError);
            }
          });
        }
      }
    } catch (error) {
      logError('Keep-alive fallback ping error', error);
      // Don't stop - continue trying
    }
  }, CONFIG.KEEP_ALIVE_PING_INTERVAL * 1000); // ULTRA FREQUENT: Every 10 seconds
  
  // Start periodic state save for additional reliability
  startPeriodicStateSave();
  
  log('Keep-alive started', { intervalMinutes: CONFIG.KEEP_ALIVE_INTERVAL, pingIntervalSeconds: CONFIG.KEEP_ALIVE_PING_INTERVAL });
}

function stopKeepAlive() {
  // КРИТИЧНО: Check if we should actually stop keep-alive
  // Only stop if NOT processing AND NOT generating summary
  const state = getProcessingState();
  chrome.storage.local.get(['summary_generating']).then(summaryState => {
    const isSummaryGenerating = summaryState.summary_generating === true;
    
    if (state.isProcessing || isSummaryGenerating) {
      log('Keep-alive stop requested but operation still in progress, keeping alive', {
        isProcessing: state.isProcessing,
        isSummaryGenerating: isSummaryGenerating
      });
      return; // Don't stop - operation is still running
    }
    
    // Safe to stop - no operations in progress
    try {
      chrome.alarms.clear(KEEP_ALIVE_ALARM);
    } catch (error) {
      logWarn('Failed to clear keep-alive alarm', error);
    }
    
    // Guaranteed cleanup of fallback timer
    if (keepAliveFallbackTimer) {
      try {
        clearInterval(keepAliveFallbackTimer);
      } catch (error) {
        logWarn('Failed to clear keep-alive fallback timer', error);
      } finally {
        keepAliveFallbackTimer = null;
      }
    }
    
    // Stop periodic state save
    stopPeriodicStateSave();
    
    log('Keep-alive stopped');
  }).catch(error => {
    logError('Failed to check state before stopping keep-alive', error);
    // On error, be safe and don't stop keep-alive
  });
}

try {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM) {
      try {
        const state = getProcessingState();
        const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
        const isSummaryGenerating = summaryState.summary_generating === true;
        
        // КРИТИЧНО: Keep service worker alive if processing OR generating summary
        if (state.isProcessing || isSummaryGenerating) {
          const keepAliveData = {
            processingState: state.isProcessing ? { ...state, lastUpdate: Date.now() } : undefined,
            summary_generating: isSummaryGenerating ? true : undefined,
            summary_generating_start_time: isSummaryGenerating ? (summaryState.summary_generating_start_time || Date.now()) : undefined,
            // КРИТИЧНО: Add heartbeat timestamp
            keepAliveHeartbeat: Date.now()
          };
          
          // Remove undefined values
          Object.keys(keepAliveData).forEach(key => {
            if (keepAliveData[key] === undefined) {
              delete keepAliveData[key];
            }
          });
          
          if (Object.keys(keepAliveData).length > 0) {
            // КРИТИЧНО: Use set() with callback to ensure it completes
            chrome.storage.local.set(keepAliveData, () => {
              if (chrome.runtime.lastError) {
                logWarn('Keep-alive alarm storage write error', chrome.runtime.lastError);
              }
            });
          }
        }
      } catch (error) {
        logError('Keep-alive alarm handler error', error);
        // Don't stop - continue
      }
    }
  });
} catch (error) {
  logError('Failed to register alarms.onAlarm listener', error);
}

// КРИТИЧНО: Additional keep-alive via storage.onChanged listener
// This creates activity even when just reading storage, keeping SW alive
try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      // КРИТИЧНО: Check if we're processing/generating and need to keep alive
      // This listener creates activity that keeps SW alive
      if (changes.summary_generating || changes.processingState || changes.keepAliveHeartbeat) {
        // Just the act of this listener running keeps SW alive
        // No need to do anything - the listener itself is the keep-alive mechanism
      }
    }
  });
} catch (error) {
  logWarn('Failed to register storage.onChanged listener for keep-alive', error);
}

// КРИТИЧНО: Additional keep-alive via runtime.onConnect
// This maintains a connection that keeps service worker alive
try {
  chrome.runtime.onConnect.addListener((port) => {
    log('Runtime connection established', { portName: port.name });
    
    // Keep connection alive by responding to messages
    port.onMessage.addListener((msg) => {
      if (msg.type === 'ping') {
        port.postMessage({ type: 'pong', timestamp: Date.now() });
      }
    });
    
    port.onDisconnect.addListener(() => {
      log('Runtime connection closed', { portName: port.name });
    });
  });
} catch (error) {
  logWarn('Failed to register runtime.onConnect listener', error);
}

// Additional keep-alive mechanism: periodic state save during processing
// This ensures service worker stays alive even if alarms are throttled
let stateSaveInterval = null;
function startPeriodicStateSave() {
  if (stateSaveInterval) {
    clearInterval(stateSaveInterval);
  }
  stateSaveInterval = setInterval(async () => {
    try {
      const state = getProcessingState();
      const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
      const isSummaryGenerating = summaryState.summary_generating === true;
      
      // КРИТИЧНО: Keep saving if processing OR generating summary
      if (state.isProcessing || isSummaryGenerating) {
        const keepAliveData = {
          processingState: state.isProcessing ? { ...state, lastUpdate: Date.now() } : undefined,
          summary_generating: isSummaryGenerating ? true : undefined,
          summary_generating_start_time: isSummaryGenerating ? (summaryState.summary_generating_start_time || Date.now()) : undefined,
          // КРИТИЧНО: Add heartbeat timestamp
          keepAliveHeartbeat: Date.now()
        };
        
        // Remove undefined values
        Object.keys(keepAliveData).forEach(key => {
          if (keepAliveData[key] === undefined) {
            delete keepAliveData[key];
          }
        });
        
        if (Object.keys(keepAliveData).length > 0) {
          // КРИТИЧНО: Use set() with callback to ensure it completes - this keeps SW alive
          chrome.storage.local.set(keepAliveData, () => {
            if (chrome.runtime.lastError) {
              logWarn('Periodic state save error', chrome.runtime.lastError);
            }
          });
        }
      } else {
        // Stop saving if not processing and not generating summary
        if (stateSaveInterval) {
          clearInterval(stateSaveInterval);
          stateSaveInterval = null;
        }
      }
    } catch (error) {
      logError('Periodic state save error', error);
      // Don't stop - continue trying
    }
  }, CONFIG.STATE_SAVE_INTERVAL);
  log('Periodic state save started', { interval: CONFIG.STATE_SAVE_INTERVAL });
}

function stopPeriodicStateSave() {
  if (stateSaveInterval) {
    clearInterval(stateSaveInterval);
    stateSaveInterval = null;
    log('Periodic state save stopped');
  }
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
  'save-as-audio': 'audio',
  // Commented out: docx, html, txt formats removed from UI
  // 'save-as-docx': 'docx',
  // 'save-as-html': 'html',
  // 'save-as-txt': 'txt'
};

// Create or update context menu with localization
async function updateContextMenu() {
  try {
    // Get current UI language
    const lang = await getUILanguage();
    
    // Remove existing menu items
    await chrome.contextMenus.removeAll();
    
    // Get localized strings
    const parentTitle = tSync('contextMenuSaveAs', lang);
    const pdfTitle = tSync('saveAsPdf', lang);
    const epubTitle = tSync('saveAsEpub', lang);
    const fb2Title = tSync('saveAsFb2', lang);
    const markdownTitle = tSync('saveAsMarkdown', lang);
    const audioTitle = tSync('saveAsAudio', lang);
    // Commented out: docx, html, txt formats removed from UI
    // const docxTitle = tSync('saveAsDocx', lang);
    // const htmlTitle = tSync('saveAsHtml', lang);
    // const txtTitle = tSync('saveAsTxt', lang);
    
    // Create parent menu item
    chrome.contextMenus.create({
      id: 'clipaible-save-as',
      title: parentTitle,
      contexts: ['page']
    });
    
    // Create child menu items
    chrome.contextMenus.create({
      id: 'save-as-pdf',
      parentId: 'clipaible-save-as',
      title: pdfTitle,
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'save-as-epub',
      parentId: 'clipaible-save-as',
      title: epubTitle,
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'save-as-fb2',
      parentId: 'clipaible-save-as',
      title: fb2Title,
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'save-as-markdown',
      parentId: 'clipaible-save-as',
      title: markdownTitle,
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'save-as-audio',
      parentId: 'clipaible-save-as',
      title: audioTitle,
      contexts: ['page']
    });
    
    // Commented out: docx, html, txt formats removed from UI
    // chrome.contextMenus.create({
    //   id: 'save-as-docx',
    //   parentId: 'clipaible-save-as',
    //   title: docxTitle,
    //   contexts: ['page']
    // });
    // 
    // chrome.contextMenus.create({
    //   id: 'save-as-html',
    //   parentId: 'clipaible-save-as',
    //   title: htmlTitle,
    //   contexts: ['page']
    // });
    // 
    // chrome.contextMenus.create({
    //   id: 'save-as-txt',
    //   parentId: 'clipaible-save-as',
    //   title: txtTitle,
    //   contexts: ['page']
    // });
    
    log('Context menu created with localization', { lang });
  } catch (error) {
    logError('Failed to create context menu', error);
    // Fallback to English if localization fails
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: 'clipaible-save-as',
      title: 'Save as',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'save-as-pdf',
      parentId: 'clipaible-save-as',
      title: 'Save as PDF',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'save-as-epub',
      parentId: 'clipaible-save-as',
      title: 'Save as EPUB',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'save-as-fb2',
      parentId: 'clipaible-save-as',
      title: 'Save as FB2',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'save-as-markdown',
      parentId: 'clipaible-save-as',
      title: 'Save as Markdown',
      contexts: ['page']
    });
    // Commented out: docx, html, txt formats removed from UI
    // chrome.contextMenus.create({
    //   id: 'save-as-docx',
    //   parentId: 'clipaible-save-as',
    //   title: 'Save as DOCX',
    //   contexts: ['page']
    // });
    // chrome.contextMenus.create({
    //   id: 'save-as-html',
    //   parentId: 'clipaible-save-as',
    //   title: 'Save as HTML',
    //   contexts: ['page']
    // });
    // chrome.contextMenus.create({
    //   id: 'save-as-txt',
    //   parentId: 'clipaible-save-as',
    //   title: 'Save as TXT',
    //   contexts: ['page']
    // });
    chrome.contextMenus.create({
      id: 'save-as-audio',
      parentId: 'clipaible-save-as',
      title: 'Save as Audio',
      contexts: ['page']
    });
  }
}

// Initialize context menu on install
try {
  chrome.runtime.onInstalled.addListener((details) => {
    updateContextMenu().catch(error => {
      logError('Failed to update context menu on install', error);
    });
    
    // КРИТИЧНО: Clear summary when extension is reloaded/updated
    // This ensures summary is reset on extension reload, but NOT on popup close or tab switch
    if (details.reason === 'update' || details.reason === 'install') {
      chrome.storage.local.remove(['summary_text', 'summary_generating', 'summary_generating_start_time']).then(() => {
        log('Summary cleared on extension reload/update', { reason: details.reason });
      }).catch(error => {
        logError('Failed to clear summary on extension reload', error);
      });
    }
  });
} catch (error) {
  console.error('[ClipAIble] Failed to register runtime.onInstalled listener:', error);
}

// Update context menu when extension starts (in case language changed)
// Use setTimeout to avoid blocking service worker initialization
setTimeout(() => {
  updateContextMenu().catch(error => {
    logError('Failed to update context menu on startup', error);
  });
}, 0);

// КРИТИЧНО: Restore state from storage on service worker restart
// This ensures processing can continue after service worker restart
setTimeout(async () => {
  try {
    await restoreStateFromStorage();
    
    // КРИТИЧНО: Check if summary generation was in progress and restore it
    const summaryState = await chrome.storage.local.get([
      'summary_generating', 
      'summary_generating_start_time',
      'lastProcessedResult',
      'lastSummaryGenerationData'
    ]);
    
    if (summaryState.summary_generating === true) {
      const startTime = summaryState.summary_generating_start_time || 0;
      const age = Date.now() - startTime;
      
      // Only restore if generation started recently (within 2 hours)
      if (age < CONFIG.STATE_EXPIRY_MS && summaryState.lastSummaryGenerationData) {
        log('Summary generation was in progress, restoring...', {
          age: age,
          ageMinutes: Math.round(age / 60000),
          hasData: !!summaryState.lastSummaryGenerationData
        });
        
        // Restore summary generation
        const genData = summaryState.lastSummaryGenerationData;
        if (genData.contentItems && genData.apiKey && genData.model) {
          // Start keep-alive
          startKeepAlive();
          
          // Continue summary generation
          generateSummary({
            contentItems: genData.contentItems,
            apiKey: genData.apiKey,
            model: genData.model,
            url: genData.url || ''
          }).catch(error => {
            logError('Restored summary generation failed', error);
            chrome.storage.local.set({ 
              summary_generating: false,
              summary_generating_start_time: null
            }).catch(() => {});
            stopKeepAlive();
          });
        }
      } else if (age >= CONFIG.STATE_EXPIRY_MS) {
        // Generation is stale - clear it
        log('Stale summary generation found, clearing', { age: age, ageMinutes: Math.round(age / 60000) });
        await chrome.storage.local.set({ 
          summary_generating: false,
          summary_generating_start_time: null,
          lastSummaryGenerationData: null
        });
      }
    }
  } catch (error) {
    logError('Failed to restore state from storage', error);
  }
}, 100); // Small delay to ensure storage is ready

// Update context menu when UI language changes
try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      
      // КРИТИЧНО: Keep-alive mechanism - any storage change creates activity
      // This listener itself keeps service worker alive
      if (changes.keepAliveHeartbeat || changes.summary_generating || changes.processingState) {
        // Just the act of this listener running keeps SW alive
        // No action needed - listener is the keep-alive
      }
      
      // Handle UI language change
      if (changes.ui_language) {
        log('UI language changed, updating context menu', { newLang: changes.ui_language.newValue });
        updateContextMenu().catch(error => {
          logError('Failed to update context menu after language change', error);
        });
      }
      
      // Handle pending subtitles (fallback when Extension context invalidated)
      if (changes.pendingSubtitles && changes.pendingSubtitles.newValue) {
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
          }).catch(() => {
            // Ignore if no listener (extractYouTubeSubtitles may have timed out)
          });
          
          // Also save to lastSubtitles for popup
          chrome.storage.local.set({
            lastSubtitles: {
              subtitles: pendingData.subtitles,
              metadata: pendingData.metadata,
              timestamp: pendingData.timestamp
            }
          }).catch(storageError => {
            logError('Failed to save lastSubtitles', storageError);
          });
          
          // Clear pendingSubtitles after processing
          chrome.storage.local.remove('pendingSubtitles').catch(() => {});
        } catch (error) {
          logError('Failed to process pendingSubtitles', error);
        }
      }
    }
  });
} catch (error) {
  console.error('[ClipAIble] Failed to register storage.onChanged listener:', error);
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
  console.error('[ClipAIble] Failed to register contextMenus.onClicked listener:', error);
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
      'openai_api_key', 'claude_api_key', 'gemini_api_key', 'grok_api_key', 'openai_model',
      'extraction_mode', 'use_selector_cache', 'output_format', 'generate_toc', 'generate_abstract', 'page_mode', 'pdf_language',
      'pdf_font_family', 'pdf_font_size', 'pdf_bg_color', 'pdf_text_color',
      'pdf_heading_color', 'pdf_link_color',
      'audio_provider', 'elevenlabs_api_key', 'qwen_api_key', 'respeecher_api_key',
      'audio_voice', 'audio_voice_map', 'audio_speed', 'elevenlabs_model', 'elevenlabs_format',
      'elevenlabs_stability', 'elevenlabs_similarity', 'elevenlabs_style', 'elevenlabs_speaker_boost',
      'openai_instructions', 'google_tts_api_key', 'google_tts_model', 'google_tts_voice', 'google_tts_prompt',
      'respeecher_temperature', 'respeecher_repetition_penalty', 'respeecher_top_p',
      'translate_images', 'google_api_key'
    ]);
    
    const model = settings.openai_model || 'gpt-5.1';
    let apiKey = '';
    let provider = 'openai';
    
    // Use statically imported decryptApiKey
    
    // Use getProviderFromModel to determine provider
    provider = getProviderFromModel(model);
    
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
    }
    
    if (encryptedKey) {
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
      fontFamily: settings.pdf_font_family || '',
      fontSize: settings.pdf_font_size || '31',
      bgColor: settings.pdf_bg_color || '#303030',
      textColor: settings.pdf_text_color || '#b9b9b9',
      headingColor: settings.pdf_heading_color || '#cfcfcf',
      linkColor: settings.pdf_link_color || '#6cacff',
      tabId: tab.id,
      // Audio settings (if format is audio)
      audioProvider: settings.audio_provider || 'openai',
      elevenlabsApiKey: settings.elevenlabs_api_key || null,
      qwenApiKey: settings.qwen_api_key || null,
      respeecherApiKey: settings.respeecher_api_key || null,
      // Determine voice: use per-provider map if available, otherwise use legacy audio_voice
      // For Google TTS, use google_tts_voice if available, otherwise fallback to map/legacy
      audioVoice: (() => {
        const provider = settings.audio_provider || 'openai';
        if (provider === 'google') {
          // Google TTS has its own voice setting
          return settings.google_tts_voice || 'Callirrhoe';
        }
        const voiceMap = settings.audio_voice_map || {};
        return voiceMap[provider] || settings.audio_voice || CONFIG.DEFAULT_AUDIO_VOICE;
      })(),
      audioSpeed: (() => {
        const speed = parseFloat(settings.audio_speed || CONFIG.DEFAULT_AUDIO_SPEED);
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
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const senderInfo = sender.tab ? `tab:${sender.tab.id} (${sender.tab.url})` : 'popup';
  
  // Handle ping for service worker availability check
  if (request.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
    return false; // Synchronous response
  }
  log('Message received in background', { 
    action: request.action, 
    sender: senderInfo,
    hasData: !!request.data,
    timestamp: new Date().toISOString()
  });
  
  // Handle log messages from popup
  if (request.action === 'log') {
    log('Log message from popup', { message: request.message, data: request.data });
    sendResponse({ success: true });
    return true;
  }
  
  try {
    if (request.action === 'getState') {
      log('getState requested from popup', { sender: senderInfo });
      const state = getProcessingState();
      log('getState response', { 
        hasState: !!state,
        isProcessing: state?.isProcessing,
        stage: state?.stage 
      });
      sendResponse(state);
      return true;
    }
    
    if (request.action === 'cancelProcessing') {
      log('Cancel requested');
      cancelProcessing(stopKeepAlive).then(result => sendResponse(result));
      return true;
    }
    
    if (request.action === 'processArticle') {
      startArticleProcessing(request.data)
        .then(() => {
          sendResponse({ started: true });
        })
        .catch(error => {
          logError('processArticle failed', error);
          sendResponse({ error: error.message || 'Processing failed' });
        });
      return true;
    }
    
    if (request.action === 'extractContentOnly') {
      log('extractContentOnly request received', { 
        hasData: !!request.data, 
        mode: request.data?.mode,
        hasHtml: !!request.data?.html,
        htmlLength: request.data?.html?.length,
        url: request.data?.url,
        tabId: request.data?.tabId
      });
      extractContentOnly(request.data)
        .then(result => {
          log('extractContentOnly success', { 
            hasResult: !!result,
            hasContent: !!result?.content,
            contentItems: result?.content?.length,
            title: result?.title
          });
          sendResponse({ success: true, result });
        })
        .catch(error => {
          logError('extractContentOnly failed', error);
          logError('extractContentOnly error details', { 
            message: error.message, 
            stack: error.stack,
            data: request.data 
          });
          sendResponse({ error: error.message || 'Extraction failed' });
        });
      return true;
    }
    
    if (request.action === 'generatePdfDebugger') {
      const { title, pageMode, contentWidth, contentHeight } = request.data;
      const tabId = sender.tab?.id;
      
      if (!tabId) {
        sendResponse({ error: 'No tab ID' });
        return true;
      }
      
      log('generatePdfDebugger', { title, pageMode, contentWidth, contentHeight, tabId });
      
      generatePdfWithDebugger(
        tabId, title, pageMode, contentWidth, contentHeight,
        async () => await completeProcessing(stopKeepAlive),
        async (errorMsg) => await setError(errorMsg, stopKeepAlive)
      )
        .then(() => log('PDF generated and downloaded'))
        .catch(error => logError('generatePdfDebugger failed', error));
      
      sendResponse({ success: true });
      return true;
    }
    
    if (request.action === 'getStats') {
      getFormattedStats()
        .then(stats => sendResponse({ stats }))
        .catch(error => {
          logError('getStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'clearStats') {
      clearStats()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('clearStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'deleteHistoryItem') {
      deleteHistoryItem(request.index)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('deleteHistoryItem failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'getCacheStats') {
      getCacheStats()
        .then(stats => sendResponse({ stats }))
        .catch(error => {
          logError('getCacheStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'clearSelectorCache') {
      clearSelectorCache()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('clearSelectorCache failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'deleteDomainFromCache') {
      deleteDomainFromCache(request.domain)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('deleteDomainFromCache failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'exportSettings') {
      exportSettings(request.includeStats, request.includeCache)
        .then(jsonData => sendResponse({ success: true, data: jsonData }))
        .catch(error => {
          logError('exportSettings failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'importSettings') {
      importSettings(request.jsonData, request.options)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => {
          logError('importSettings failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    // Handle YouTube subtitles result from content script
    // This message comes from content script forwarding CustomEvent from MAIN world
    // The extractYouTubeSubtitles function creates a temporary listener that should catch it
    // CRITICAL: We should NOT handle it here if temporary listener is active, because
    // returning true here prevents the temporary listener from receiving the message!
    // We only save to storage as a fallback for popup, but don't return true
    // to allow the message to reach the temporary listener in extractYouTubeSubtitles
    // КРИТИЧНО: Проверяем все возможные форматы сообщений
    const isYouTubeSubtitlesMessage = 
      request.action === 'youtubeSubtitlesResult' || 
      (request.type === 'ClipAIbleYouTubeSubtitles' && request.action === 'youtubeSubtitlesResult') ||
      (request.type === 'ClipAIbleYouTubeSubtitles' && !request.action) ||
      (request.type === 'ClipAIbleYouTubeSubtitles' && request.result) ||
      (request.type === 'ClipAIbleYouTubeSubtitles' && request.error);
    
    if (isYouTubeSubtitlesMessage) {
      log('🟢 Received youtubeSubtitlesResult in main listener (fallback)', {
        action: request.action,
        type: request.type,
        hasError: !!request.error,
        hasResult: !!request.result,
        subtitleCount: request.result?.subtitles?.length || 0
      });
      
      // The extractYouTubeSubtitles function creates a temporary listener
      // that should catch this message. We save to storage for popup,
      // but DON'T return true here - let the message pass through to temporary listener
      // Save to storage for popup to use (as fallback)
      // Use Promise-based approach since we're in a callback
      if (request.result && !request.error) {
        chrome.storage.local.set({
          lastSubtitles: {
            subtitles: request.result.subtitles,
            metadata: request.result.metadata,
            timestamp: Date.now()
          }
        }).then(() => {
          log('🟢 Saved subtitles to storage for popup (fallback)', {
            subtitleCount: request.result.subtitles?.length || 0
          });
        }).catch(storageError => {
          logError('Failed to save subtitles to storage', storageError);
        });
      }
      
      // CRITICAL: Don't return true here! Let the message pass through to temporary listener
      // The temporary listener will handle it and return true
      // КРИТИЧНО: НЕ вызываем sendResponse() здесь, потому что временный listener должен вызвать его
      // Если мы вызовем sendResponse() здесь, временный listener не сможет вызвать его снова
      // В Chrome Extensions, sendResponse можно вызвать только один раз
      // Временный listener обработает сообщение и вызовет sendResponse()
      // Мы просто сохраняем в storage для popup (fallback) и пропускаем сообщение дальше
      // НЕ вызываем sendResponse() - пусть временный listener это сделает
      return false; // Let other listeners (temporary one) handle it - они вызовут sendResponse()
    }
    
    if (request.action === 'logModelDropdown') {
      // Log model dropdown events to service worker console
      const { level, message, data } = request;
      const logMessage = `[ModelDropdown] ${message}`;
      if (data) {
        log(logMessage, data);
      } else {
        log(logMessage);
      }
      sendResponse({ logged: true });
      return true;
    }
    
    if (request.action === 'extractYouTubeSubtitlesForSummary') {
      // Extract YouTube subtitles for summary generation (called from popup)
      // КРИТИЧНО: Вызываем из background script, чтобы иметь правильный контекст
      (async () => {
        try {
          const { tabId } = request.data;
          
          if (!tabId) {
            sendResponse({ error: 'Tab ID is required' });
            return;
          }
          
          log('Extracting YouTube subtitles for summary (from background script)', { tabId });
          
          // Вызываем extractYouTubeSubtitles из контекста background script
          // Это гарантирует, что listener будет создан в правильном контексте
          const subtitlesData = await extractYouTubeSubtitles(tabId);
          
          log('YouTube subtitles extracted for summary', { 
            subtitleCount: subtitlesData?.subtitles?.length || 0,
            title: subtitlesData?.metadata?.title 
          });
          
          sendResponse({ result: subtitlesData });
        } catch (error) {
          logError('Failed to extract YouTube subtitles for summary', error);
          sendResponse({ error: error.message || 'Failed to extract subtitles' });
        }
      })();
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'generateSummary') {
      log('generateSummary request received', { 
        hasData: !!request.data,
        hasContent: !!request.data?.contentItems,
        url: request.data?.url
      });
      generateSummary(request.data)
        .then(result => {
          log('generateSummary success', { hasSummary: !!result?.summary });
          sendResponse({ success: true, summary: result?.summary });
        })
        .catch(error => {
          logError('generateSummary failed', error);
          sendResponse({ error: error.message || 'Summary generation failed' });
        });
      return true;
    }
    
    logWarn('Unknown action received', { action: request.action, sender: senderInfo });
    sendResponse({ error: 'Unknown action' });
    return true;
    
  } catch (error) {
    logError('Message handler error', { 
      error, 
      action: request?.action, 
      sender: senderInfo,
      message: error.message,
      stack: error.stack 
    });
    sendResponse({ error: error.message || 'Handler error' });
    return true;
  }
  });
  
  log('Message listener registered successfully');
} catch (error) {
  console.error('[ClipAIble] Failed to register runtime.onMessage listener:', error);
  logError('CRITICAL: Failed to register message listener', error);
}

// ============================================
// ARTICLE PROCESSING
// ============================================

// Track processing start time for stats
let processingStartTime = null;

async function startArticleProcessing(data) {
  if (!(await startProcessing(startKeepAlive))) {
    return false;
  }
  
  // Validate output format
  // Commented out: docx, html, txt formats removed from UI (but kept in validation for backward compatibility)
  const VALID_FORMATS = ['pdf', 'epub', 'fb2', 'markdown', 'audio', 'docx', 'html', 'txt'];
  if (data.outputFormat && !VALID_FORMATS.includes(data.outputFormat)) {
    const uiLang = await getUILanguage();
      const friendlyError = await createUserFriendlyError('invalidFormat', { format: data.outputFormat }, 'validation_error');
      await setError(friendlyError, stopKeepAlive);
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
  if ((data.outputFormat || 'pdf') === 'audio') {
    const provider = data.audioProvider || 'openai';
    if (provider === 'openai' && !data.apiKey) {
      await setError({
        message: 'OpenAI API key is required for audio. Please add it in settings.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
    if (provider === 'elevenlabs' && !data.elevenlabsApiKey) {
      await setError({
        message: 'ElevenLabs API key is required for audio. Please add it in settings.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
    if (provider === 'qwen' && !data.qwenApiKey) {
      await setError({
        message: 'Qwen API key is required for audio. Please add it in settings.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
    if (provider === 'respeecher' && !data.respeecherApiKey) {
      await setError({
        message: 'Respeecher API key is required for audio. Please add it in settings.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
    if (provider === 'google' && !data.googleTtsApiKey) {
      await setError({
        message: 'Google TTS API key is required for Google TTS. Please add it in settings.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
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
        
        // Record stats
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
        
        // Store format in state for success message
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
        
        logError('Video processing failed', error);
        const friendlyError = await createUserFriendlyError('videoProcessingFailed', { error }, 'provider_error');
        await setError(friendlyError, stopKeepAlive);
      });
    return true;
  }
  
  // Standard article processing continues below
  
  // Standard article processing
  const { mode } = data;
  
  const processFunction = mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  processFunction(data)
    .then(async result => {
      // Ensure URL is stored in result for validation
      if (result && !result.sourceUrl && !result.url && data.url) {
        result.sourceUrl = data.url;
      }
      
      log('Processing complete', { 
        title: result.title, 
        contentItems: result.content?.length || 0,
        url: result?.sourceUrl || result?.url
      });
      
      // Continue with standard pipeline: translation, TOC/Abstract, generation
      await continueProcessingPipeline(data, result, stopKeepAlive);
    })
    .then(async () => {
      // After generation, record stats and complete
      log('File generation complete');
      
      // Record stats
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
      
      // Store format in state for success message
      updateState({ outputFormat: savedFormat });
      
      processingStartTime = null;
      await completeProcessing(stopKeepAlive);
    })
    .catch(async error => {
      // Check if processing was cancelled - don't set error if cancelled
      if (isCancelled()) {
        log('Processing was cancelled, not setting error');
        return;
      }
      
      logError('Processing failed', error);
      
      // Determine error code from error
      const ERROR_PATTERNS = {
        AUTH: ['authentication', '401', '403', 'unauthorized', 'forbidden'],
        RATE_LIMIT: ['429', 'rate limit', 'quota', 'too many requests'],
        TIMEOUT: ['timeout', 'timed out', 'aborted'],
        NETWORK: ['network', 'fetch', 'connection', 'failed to fetch'],
        PARSE: ['parse', 'json', 'invalid json', 'syntax error']
      };
      
      let errorCode = ERROR_CODES.UNKNOWN_ERROR;
      const errorMsgLower = (error.message || '').toLowerCase();
      
      if (ERROR_PATTERNS.AUTH.some(pattern => errorMsgLower.includes(pattern))) {
        errorCode = ERROR_CODES.AUTH_ERROR;
      } else if (ERROR_PATTERNS.RATE_LIMIT.some(pattern => errorMsgLower.includes(pattern))) {
        errorCode = ERROR_CODES.RATE_LIMIT;
      } else if (ERROR_PATTERNS.TIMEOUT.some(pattern => errorMsgLower.includes(pattern))) {
        errorCode = ERROR_CODES.TIMEOUT;
      } else if (ERROR_PATTERNS.NETWORK.some(pattern => errorMsgLower.includes(pattern))) {
        errorCode = ERROR_CODES.NETWORK_ERROR;
      } else if (ERROR_PATTERNS.PARSE.some(pattern => errorMsgLower.includes(pattern))) {
        errorCode = ERROR_CODES.PARSE_ERROR;
      }
      
      await setError({
        message: error.message || 'Processing failed',
        code: errorCode
      }, stopKeepAlive);
    });
  
  return true;
}

// ============================================
// CONTENT EXTRACTION ONLY (for summary generation)
// ============================================

/**
 * Extract content only without generating file
 * Used for summary generation
 * @param {Object} data - Processing data
 * @returns {Promise<Object>} Extracted content result
 */
async function extractContentOnly(data) {
  log('extractContentOnly called', { 
    mode: data?.mode,
    hasHtml: !!data?.html,
    htmlLength: data?.html?.length,
    url: data?.url,
    title: data?.title,
    tabId: data?.tabId
  });
  
  try {
    const { mode } = data;
    
    if (!mode) {
      throw new Error('Mode is required');
    }
    
    log('extractContentOnly: selecting process function', { mode });
    
    const processFunction = mode === 'selector' 
      ? processWithSelectorMode 
      : processWithExtractMode;
    
    log('extractContentOnly: calling process function', { 
      functionName: processFunction.name,
      mode 
    });
    
    const result = await processFunction(data);
    
    // Ensure URL is stored in result for validation
    if (result && !result.sourceUrl && !result.url && data.url) {
      result.sourceUrl = data.url;
    }
    
    log('extractContentOnly: process function completed', { 
      hasResult: !!result,
      hasContent: !!result?.content,
      contentItems: result?.content?.length,
      title: result?.title,
      author: result?.author,
      url: result?.sourceUrl || result?.url
    });
    
    // Save result to state for summary generation
    setResult(result);
    
    log('extractContentOnly: result saved to state');
    
    return result;
  } catch (error) {
    logError('extractContentOnly: error occurred', error);
    logError('extractContentOnly: error context', { 
      mode: data?.mode,
      url: data?.url,
      errorMessage: error.message,
      errorStack: error.stack
    });
    throw error;
  }
}

// ============================================
// SUMMARY GENERATION
// ============================================

/**
 * Generate summary for extracted content
 * Works in background, continues even if popup is closed
 * @param {Object} data - Summary generation data
 * @param {Array} data.contentItems - Content items to summarize (optional, will get from state if not provided)
 * @param {string} data.apiKey - API key
 * @param {string} data.model - Model name
 * @param {string} data.url - Page URL (optional, for logging)
 * @returns {Promise<Object>} {summary: string}
 */
async function generateSummary(data) {
  log('generateSummary called', { 
    hasContentItems: !!data?.contentItems,
    contentItemsCount: data?.contentItems?.length,
    hasApiKey: !!data?.apiKey,
    model: data?.model,
    url: data?.url
  });
  
  try {
    // КРИТИЧНО: Start keep-alive IMMEDIATELY at the start of generateSummary
    startKeepAlive();
    log('Keep-alive started for summary generation');
    
    // КРИТИЧНО: Save generation data for recovery after service worker restart
    await chrome.storage.local.set({
      lastSummaryGenerationData: {
        contentItems: data.contentItems,
        apiKey: data.apiKey,
        model: data.model,
        url: data.url || '',
        timestamp: Date.now()
      }
    });
    
    // Check if flag is already set (popup sets it before sending message)
    const existing = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    if (!existing.summary_generating) {
      // Set generating flag in storage with timestamp (if not already set)
      await chrome.storage.local.set({ 
        summary_generating: true,
        summary_generating_start_time: Date.now(), // Track when generation started
        summary_text: '' // Clear previous summary
      });
    } else if (!existing.summary_generating_start_time) {
      // Flag exists but no timestamp - add it
      await chrome.storage.local.set({ 
        summary_generating_start_time: Date.now()
      });
    }
    
    // Get current URL for validation
    const currentUrl = data.url || '';
    
    // Normalize URLs for comparison (remove trailing slashes, fragments, etc.)
    function normalizeUrl(url) {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        // Remove fragment, normalize path
        urlObj.hash = '';
        let path = urlObj.pathname;
        if (path.endsWith('/') && path.length > 1) {
          path = path.slice(0, -1);
        }
        urlObj.pathname = path;
        return urlObj.toString();
      } catch {
        return url;
      }
    }
    
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    
    // Get content items - from data or from state
    // КРИТИЧНО: Also check for raw subtitles (for YouTube summary generation)
    let contentItems = data.contentItems;
    let rawSubtitles = data.subtitles; // Raw subtitles from YouTube
    
    // If raw subtitles provided, convert them to contentItems
    if ((!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) && rawSubtitles && Array.isArray(rawSubtitles) && rawSubtitles.length > 0) {
      log('Converting raw subtitles to contentItems for summary', { subtitleCount: rawSubtitles.length });
      contentItems = rawSubtitles.map(subtitle => {
        // Handle both string and object formats
        if (typeof subtitle === 'string') {
          return { type: 'paragraph', text: subtitle };
        } else if (subtitle.text) {
          return { type: 'paragraph', text: subtitle.text };
        } else {
          return { type: 'paragraph', text: String(subtitle) };
        }
      });
    }
    
    if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {
      // Try to get from state - but only if URL matches
      const state = getProcessingState();
      if (state && state.result && state.result.content) {
        // Check if URL matches (if URL is available in result)
        const resultUrl = state.result.sourceUrl || state.result.url || '';
        const normalizedResultUrl = normalizeUrl(resultUrl);
        
        if (!normalizedCurrentUrl || !normalizedResultUrl || normalizedCurrentUrl === normalizedResultUrl) {
          contentItems = state.result.content;
          log('Got content from processing state', { 
            count: contentItems.length,
            currentUrl: normalizedCurrentUrl,
            resultUrl: normalizedResultUrl,
            urlMatch: normalizedCurrentUrl === normalizedResultUrl
          });
        } else {
          logWarn('Content in state is from different URL, ignoring', {
            currentUrl: normalizedCurrentUrl,
            resultUrl: normalizedResultUrl
          });
        }
      }
      
      // If still no content, try to get from storage (last processed result) - but only if URL matches
      if ((!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) && normalizedCurrentUrl) {
        try {
          const stored = await chrome.storage.local.get(['lastProcessedResult']);
          if (stored.lastProcessedResult && stored.lastProcessedResult.content) {
            // Check if URL matches
            const storedUrl = stored.lastProcessedResult.sourceUrl || stored.lastProcessedResult.url || '';
            const normalizedStoredUrl = normalizeUrl(storedUrl);
            
            if (normalizedStoredUrl && normalizedCurrentUrl === normalizedStoredUrl) {
              contentItems = stored.lastProcessedResult.content;
              log('Got content from storage', { 
                count: contentItems.length,
                currentUrl: normalizedCurrentUrl,
                storedUrl: normalizedStoredUrl
              });
            } else {
              logWarn('Content in storage is from different URL, ignoring', {
                currentUrl: normalizedCurrentUrl,
                storedUrl: normalizedStoredUrl
              });
            }
          }
        } catch (error) {
          logWarn('Failed to get last processed result from storage', error);
        }
      }
    }
    
    if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {
      throw new Error('No content available for summary generation. Please extract content first.');
    }
    
    // Extract text content from contentItems
    let fullText = '';
    
    for (const item of contentItems) {
      if (item.type === 'text' && item.text) {
        fullText += item.text + '\n\n';
      } else if (item.type === 'paragraph' && item.text) {
        fullText += item.text + '\n\n';
      } else if (item.type === 'heading' && item.text) {
        fullText += item.text + '\n\n';
      } else if (item.type === 'list' && item.items) {
        for (const listItem of item.items) {
          if (typeof listItem === 'string') {
            fullText += listItem + '\n';
          } else if (listItem.text) {
            fullText += listItem.text + '\n';
          } else if (listItem.html) {
            // Extract text from HTML - simple strip
            const text = listItem.html.replace(/<[^>]*>/g, '').trim();
            if (text) {
              fullText += text + '\n';
            }
          }
        }
        fullText += '\n';
      }
    }
    
    if (!fullText.trim()) {
      throw new Error('No text content found in extracted content.');
    }
    
    // Validate API key and model
    if (!data.apiKey || !data.model) {
      throw new Error('API key and model are required for summary generation.');
    }
    
    // Get UI language to generate summary in the same language as interface
    const uiLang = await getUILanguage();
    
    // Map language code to language name for prompt
    const LANGUAGE_NAMES = {
      'en': 'English',
      'ru': 'Russian',
      'ua': 'Ukrainian',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean'
    };
    
    const targetLanguage = LANGUAGE_NAMES[uiLang] || 'English';
    const languageInstruction = uiLang === 'en' 
      ? 'Write the summary in English.'
      : `Write the summary in ${targetLanguage}. Use ${targetLanguage} language for all text, maintaining natural ${targetLanguage} expressions and sentence structures.`;
    
    // Create summary prompt
    const systemPrompt = `Your task is to develop a detailed and logically organized summary, including key ideas, concepts, examples, and main conclusions.

Ensure easy perception of information: use techniques of associations, lists, sequential steps, or metaphors. The summary should be clear, consistent, and fully reflect the content.

IMPORTANT: Start the summary directly with the content, without introductory phrases like "Below is a structured summary", "Here is a summary of the text", etc. Do not add meta-comments about this being a summary. Just present the summary.

LANGUAGE REQUIREMENT: ${languageInstruction}`;
    
    const userPrompt = fullText;
    
    log('Calling AI to generate summary', { 
      textLength: fullText.length,
      model: data.model 
    });
    
    // КРИТИЧНО: Add timeout wrapper for summary generation (can take very long for large content)
    let summaryTimeoutId = null;
    const summaryPromise = callAI(systemPrompt, userPrompt, data.apiKey, data.model, false);
    const summaryTimeoutPromise = new Promise((_, reject) => {
      summaryTimeoutId = setTimeout(() => {
        reject(new Error('Summary generation timeout after 45 minutes'));
      }, 45 * 60 * 1000); // 45 minutes timeout for very large content
    });
    
    let summary;
    try {
      // Call AI to generate summary (jsonResponse = false for text output)
      summary = await Promise.race([summaryPromise, summaryTimeoutPromise]);
      
      // КРИТИЧНО: Clear timeout if generation completed successfully
      if (summaryTimeoutId) {
        clearTimeout(summaryTimeoutId);
        summaryTimeoutId = null;
      }
    } catch (summaryError) {
      // КРИТИЧНО: Clear timeout on error
      if (summaryTimeoutId) {
        clearTimeout(summaryTimeoutId);
        summaryTimeoutId = null;
      }
      throw summaryError;
    }
    
    if (!summary || typeof summary !== 'string' || !summary.trim()) {
      throw new Error('Failed to generate summary - empty response from AI');
    }
    
    // Clean summary - remove meta-comments
    let cleanSummary = summary.trim();
    cleanSummary = cleanSummary.replace(/^(Ниже\s*—|Вот\s*|Ниже\s*представлено|Это\s*саммари|Саммари\s*текста)[:.]?\s*/i, '');
    cleanSummary = cleanSummary.replace(/^(структурированное\s*саммари|саммари\s*текста)[:.]?\s*/i, '');
    
    // Save summary to storage and clear generating flag
    await chrome.storage.local.set({ 
      summary_text: cleanSummary,
      summary_generating: false,
      summary_generating_start_time: null // Clear timestamp
    });
    
    // КРИТИЧНО: Clear recovery data and stop keep-alive when summary generation completes
    await chrome.storage.local.set({
      lastSummaryGenerationData: null // Clear recovery data
    });
    
    stopKeepAlive();
    log('Summary generated and saved, keep-alive stopped', { summaryLength: cleanSummary.length });
    
    return { summary: cleanSummary };
    
  } catch (error) {
    logError('generateSummary error', error);
    // Clear generating flag and recovery data on error
    await chrome.storage.local.set({ 
      summary_generating: false,
      summary_generating_start_time: null, // Clear timestamp
      lastSummaryGenerationData: null // Clear recovery data
    });
    
    // КРИТИЧНО: Stop keep-alive on error too
    stopKeepAlive();
    throw error;
  }
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
    const friendlyError = await createUserFriendlyError('subtitleProcessingFailed', { error }, 'provider_error');
    throw new Error(friendlyError.message);
  }
  
  updateState({ progress: 40 });
  
  // Return result in standard format for continueProcessingPipeline
  return {
    title: metadata.title || data.title || 'Untitled',
    author: metadata.author || '',
    content: content,
    publishDate: metadata.publishDate || '',
    sourceUrl: data.url || ''
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
  // Ensure URL is stored in result for validation
  if (result && !result.sourceUrl && !result.url && data.url) {
    result.sourceUrl = data.url;
  }
  
  // Check if processing was cancelled
  if (isCancelled()) {
    log('Processing cancelled at start of pipeline');
    const uiLang = await getUILanguage();
    throw new Error(tSync('statusCancelled', uiLang));
  }
  
  // Translate if language is not auto
  const language = data.language || 'auto';
  const hasImageTranslation = data.translateImages && data.googleApiKey;
  
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
      
      const sourceLang = detectSourceLanguage(result.content);
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
    const abstractLang = data.language || 'auto';
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
  if (effectiveLanguage === 'auto' && result.content && result.content.length > 0 && data.apiKey) {
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
    // Don't set progress here - let generateAudio manage its own progress
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingAudio', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status });
    
    // Get TTS API key based on provider
    const ttsProvider = data.audioProvider || 'openai';
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
    
    if (ttsProvider === 'elevenlabs') {
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
    
    return generateAudio({
      content: result.content,
      title: result.title,
      apiKey: data.apiKey, // For text preparation
      ttsApiKey: ttsApiKey, // For TTS conversion
      model: data.model,
      provider: ttsProvider,
      // For Google TTS, use googleTtsVoice; for others, use audioVoice
      voice: ttsProvider === 'google' ? (data.googleTtsVoice || 'Callirrhoe') : (data.audioVoice || CONFIG.DEFAULT_AUDIO_VOICE),
      speed: data.audioSpeed || CONFIG.DEFAULT_AUDIO_SPEED,
      format: data.audioFormat || CONFIG.DEFAULT_AUDIO_FORMAT,
      language: effectiveLanguage,
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
    }, updateState);
  // Commented out: docx, html, txt formats removed from UI
  // } else if (outputFormat === 'docx') {
  //   const uiLang = await getUILanguage();
  //   const status = tSync('statusGeneratingDocx', uiLang);
  //   updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
  //   return generateDocx({
  //     content: result.content,
  //     title: result.title,
  //     author: result.author || '',
  //     sourceUrl: data.url,
  //     publishDate: result.publishDate || '',
  //     generateToc: data.generateToc || false,
  //     generateAbstract: data.generateAbstract || false,
  //     abstract: result.abstract || '',
  //     language: effectiveLanguage
  //   }, updateState);
  // } else if (outputFormat === 'html') {
  //   const uiLang = await getUILanguage();
  //   const status = tSync('statusGeneratingHtml', uiLang);
  //   updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
  //   return generateHtml({
  //     content: result.content,
  //     title: result.title,
  //     author: result.author || '',
  //     sourceUrl: data.url,
  //     publishDate: result.publishDate || '',
  //     generateToc: data.generateToc || false,
  //     generateAbstract: data.generateAbstract || false,
  //     abstract: result.abstract || '',
  //     language: effectiveLanguage
  //   }, updateState);
  // } else if (outputFormat === 'txt') {
  //   const uiLang = await getUILanguage();
  //   const status = tSync('statusGeneratingTxt', uiLang);
  //   updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
  //   return generateTxt({
  //     content: result.content,
  //     title: result.title,
  //     author: result.author || '',
  //     sourceUrl: data.url,
  //     publishDate: result.publishDate || '',
  //     generateToc: data.generateToc || false,
  //     generateAbstract: data.generateAbstract || false,
  //     abstract: result.abstract || '',
  //     language: effectiveLanguage
  //   }, updateState);
  } else {
    // PDF (default)
    const uiLang = await getUILanguage();
    const status = tSync('statusGeneratingPdf', uiLang);
    updateState({ stage: PROCESSING_STAGES.GENERATING.id, status: status, progress: 65 });
    
    // Use generatePdf (not generatePdfWithDebugger) - it accepts object parameters
    return generatePdf({
      content: result.content,
      title: result.title,
      author: result.author || '',
      sourceUrl: data.url,
      publishDate: result.publishDate || '',
      generateToc: data.generateToc || false,
      generateAbstract: data.generateAbstract || false,
      abstract: result.abstract || '',
      language: effectiveLanguage,
      stylePreset: data.stylePreset || 'dark',
      fontFamily: data.fontFamily || '',
      fontSize: data.fontSize || '31',
      bgColor: data.bgColor || '#303030',
      textColor: data.textColor || '#b9b9b9',
      headingColor: data.headingColor || '#cfcfcf',
      linkColor: data.linkColor || '#6cacff',
      pageMode: data.pageMode || 'single'
    }, updateState);
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
  
  if (!html) {
    const friendlyError = await createUserFriendlyError('pageNotReady', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  if (!apiKey) {
    const friendlyError = await createUserFriendlyError('noApiKey', {}, 'auth_error');
    throw new Error(friendlyError.message);
  }
  if (!tabId) {
    const friendlyError = await createUserFriendlyError('tabNotFound', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  
  // Check cache first (if enabled)
  let selectors;
  let fromCache = false;
  // Explicit check: use cache if explicitly true, or if undefined/null (default: true)
  // Only skip cache if explicitly false
  const useCache = data.useCache !== false; // true if undefined/null/true, false only if explicitly false
  
  if (useCache) {
    const cached = await getCachedSelectors(url);
    if (cached) {
      selectors = cached.selectors;
      fromCache = true;
      const uiLang = await getUILanguage();
      const cachedStatus = tSync('statusUsingCachedSelectors', uiLang);
      updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: cachedStatus, progress: 3 });
      log('Using cached selectors', { url, successCount: cached.successCount });
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
      const friendlyError = await createUserFriendlyError('selectorAnalysisFailed', { error }, 'provider_error');
      throw new Error(friendlyError.message);
    }
    
    if (!selectors) {
      const uiLang = await getUILanguage();
      const friendlyError = await createUserFriendlyError('emptySelectors', {}, 'provider_error');
      throw new Error(friendlyError.message);
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
    const friendlyError = await createUserFriendlyError('contentExtractionFailed', { error }, 'provider_error');
    throw new Error(friendlyError.message);
  }
  
  if (!extractedContent || !extractedContent.content) {
    if (fromCache) await invalidateCache(url);
    const friendlyError = await createUserFriendlyError('noContentExtracted', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  
  if (extractedContent.content.length === 0) {
    if (fromCache) await invalidateCache(url);
    const selectorsStr = JSON.stringify(selectors);
    const truncated = selectorsStr.length > 200 ? selectorsStr.substring(0, 200) + '...' : selectorsStr;
    logError('Extracted content is empty', { selectors: truncated });
    const friendlyError = await createUserFriendlyError('noContentExtracted', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  
  // Cache selectors after successful extraction ONLY
  // If extraction failed, cache is already invalidated above
  if (!fromCache) {
    await cacheSelectors(url, selectors);
  } else {
    await markCacheSuccess(url);
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
  
  const systemPrompt = SELECTOR_SYSTEM_PROMPT;
  const userPrompt = buildSelectorUserPrompt(html, url, title);
  
  log('Sending request to AI...', { model, promptLength: userPrompt.length });
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  const parsed = await callWithRetry(
    () => callAI(systemPrompt, userPrompt, apiKey, model, true),
    {
      maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
      delays: CONFIG.RETRY_DELAYS,
      retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
    }
  );
  log('Parsed selectors', parsed);
  
  return parsed;
}

async function extractContentWithSelectors(tabId, selectors, baseUrl) {
  log('extractContentWithSelectors', { tabId, selectors, baseUrl });
  
  if (!tabId) {
    const friendlyError = await createUserFriendlyError('tabNotFound', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  
  let results;
  try {
    // Execute extraction function directly in the page context
    // Using world: 'MAIN' to access page's DOM properly
    results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractFromPageInlined,
      args: [selectors, baseUrl]
    });
    log('Script executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('Script execution failed', scriptError);
    const friendlyError = await createUserFriendlyError('scriptExecutionFailed', { error: scriptError }, 'network_error');
    throw new Error(friendlyError.message);
  }

  if (!results || !results[0]) {
    throw new Error('Script execution returned empty results');
  }
  
  if (results[0].error) {
    logError('Script execution error', results[0].error);
    throw new Error(`Script error: ${results[0].error.message || results[0].error}`);
  }
  
  if (!results[0].result) {
    throw new Error('Script returned no result');
  }

  log('Extraction result', { 
    title: results[0].result.title,
    contentItems: results[0].result.content?.length
  });
  
  return results[0].result;
}

// Inlined extraction function for chrome.scripting.executeScript
// This runs in the page's main world context
// 
// NOTE: This function is ~460 lines - DO NOT SPLIT IT!
// It's injected as a single block via executeScript. All helper functions
// must be defined inside. See systemPatterns.md "Design Decisions".
function extractFromPageInlined(selectors, baseUrl) {
  // Debug logging inside the page context is gated to avoid noisy consoles.
  const DEBUG_LOG = false;
  const debugLog = (...args) => { if (DEBUG_LOG) console.log(...args); };
  if (DEBUG_LOG) console.log('[ClipAIble:Page] Starting extraction', { selectors, baseUrl });
  
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
      if (text && text !== articleTitle) {
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
        content.push({ type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId });
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
          debugLog('[ClipAIble:Page] Found elements with absolute selector', { selector: contentSelector, count: filtered.length });
          return filtered;
        }
      }
      
      // Strategy 2: Try selector relative to container
      elements = container.querySelectorAll(contentSelector);
      if (elements.length > 0) {
        debugLog('[ClipAIble:Page] Found elements with relative selector', { selector: contentSelector, count: elements.length });
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
            debugLog('[ClipAIble:Page] Found elements with normalized selector', { original: contentSelector, normalized: normalizedSelector, count: elements.length });
            return Array.from(elements);
          }
        }
      }
      
      // Strategy 4: If selector uses direct child (>), try without it to find nested elements
      if (contentSelector.includes(' > ')) {
        const flexibleSelector = contentSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        if (elements.length > 0) {
          debugLog('[ClipAIble:Page] Found elements with flexible selector (removed >)', { original: contentSelector, flexible: flexibleSelector, count: elements.length });
          return Array.from(elements);
        }
      }
      
      // Strategy 5: If selector is an ID selector (#id), try finding it anywhere and check if it's in container
      if (contentSelector.startsWith('#')) {
        const id = contentSelector.substring(1);
        const element = document.getElementById(id);
        if (element && container.contains(element)) {
          debugLog('[ClipAIble:Page] Found element by ID', { id, selector: contentSelector });
          return [element];
        }
      }
      
      // Strategy 6: Extract tag names and try to find them anywhere in container
      const tagMatch = contentSelector.match(/([a-z]+)(?:\s|$|#|\.)/i);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        elements = container.querySelectorAll(tagName);
        if (elements.length > 0) {
          debugLog('[ClipAIble:Page] Found elements by tag name fallback', { tag: tagName, selector: contentSelector, count: elements.length });
          return Array.from(elements);
        }
      }
      
      debugLog('[ClipAIble:Page] No elements found with any strategy', { selector: contentSelector, containerSelector });
      return null; // No elements found with any strategy
    } catch (e) {
      debugLog('[ClipAIble:Page] Selector error', { selector: contentSelector, error: e.message });
      return null; // Selector is invalid
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
  
  // Extract hero image if selector provided
  // Hero image should be added after the first heading (title), not at the very beginning
  if (selectors.heroImage) {
    try {
      const heroImgEl = document.querySelector(selectors.heroImage);
      if (heroImgEl && heroImgEl.tagName?.toLowerCase() === 'img') {
        let heroSrc = extractBestImageUrl(heroImgEl);
        heroSrc = toAbsoluteUrl(heroSrc);
        const ns = normalizeImageUrl(heroSrc);
        if (heroSrc && !isTrackingPixelOrSpacer(heroImgEl, heroSrc) && !isPlaceholderUrl(heroSrc) && !isSmallOrAvatarImage(heroImgEl, heroSrc) && !addedImageUrls.has(ns)) {
          // Find first heading position and insert hero image after it
          // If no heading found, insert at position 0 (beginning)
          let insertIndex = 0;
          for (let i = 0; i < content.length; i++) {
            if (content[i].type === 'heading') {
              insertIndex = i + 1;
              break;
            }
          }
          content.splice(insertIndex, 0, { type: 'image', src: heroSrc, alt: heroImgEl.alt || '', id: getAnchorId(heroImgEl) });
          addedImageUrls.add(ns);
          debugLog('[ClipAIble:Page] Hero image extracted', { src: heroSrc.substring(0, 80), insertIndex });
        }
      }
    } catch (e) {
      debugLog('[ClipAIble:Page] Hero image extraction failed', { error: e.message });
    }
  }
  
  if (DEBUG_LOG) console.log('[ClipAIble:Page] Extraction complete', { contentItems: content.length, headingCount: debugInfo.headingCount });
  
  return { title: articleTitle, author: articleAuthor, content: content, publishDate: publishDate, debug: debugInfo };
}

// ============================================
// MODE 2: EXTRACT MODE
// ============================================

async function processWithExtractMode(data) {
  const { html, url, title, apiKey, model } = data;

  log('=== EXTRACT MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, model });

  if (!html) {
    const friendlyError = await createUserFriendlyError('pageNotReady', {}, 'validation_error');
    throw new Error(friendlyError.message);
  }
  if (!apiKey) {
    const friendlyError = await createUserFriendlyError('noApiKey', {}, 'auth_error');
    throw new Error(friendlyError.message);
  }

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
    const friendlyError = await createUserFriendlyError('extractModeNoContent', {}, 'validation_error');
    throw new Error(friendlyError.message);
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
  const result = await callWithRetry(
    () => callAI(EXTRACT_SYSTEM_PROMPT, userPrompt, apiKey, model, true),
    {
      maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
      delays: CONFIG.RETRY_DELAYS,
      retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
    }
  );
  
  log('Single chunk result', { title: result.title, items: result.content?.length });
  
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
      .replace('{current}', i + 1)
      .replace('{total}', chunks.length);
    updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: chunkStatus, progress: progressBase });

    const systemPrompt = buildChunkSystemPrompt(i, chunks.length);
    const userPrompt = buildChunkUserPrompt(chunks[i], url, title, i, chunks.length);

    try {
      // Wrap callAI with retry mechanism for reliability (429/5xx errors)
      const result = await callWithRetry(
        () => callAI(systemPrompt, userPrompt, apiKey, model, true),
        {
          maxRetries: 3,
          delays: [1000, 2000, 4000],
          retryableStatusCodes: [429, 500, 502, 503, 504]
        }
      );
      
      log(`Chunk ${i + 1} result`, { title: result.title, contentItems: result.content?.length });
      
      if (isFirst) {
        if (result.title) articleTitle = result.title;
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

