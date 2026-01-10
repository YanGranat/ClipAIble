// @ts-check
// Context menu and storage change handlers for background service worker
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize context menu module with dependencies
 * @param {import('../types.js').ContextMenuDeps} deps - Dependencies object
 * @returns {Object} Context menu functions
 */
export function initContextMenu(deps) {
  const {
    log,
    logError,
    logWarn,
    logDebug,
    CONFIG,
    handleError,
    getUILanguage,
    updateContextMenuWithLang,
    handleQuickSave
  } = deps;

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

  /**
   * Create or update context menu with localization
   * @returns {Promise<void>}
   */
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

  /**
   * Cleanup stale audio files from storage (protection against SW restart)
   * @returns {Promise<void>}
   */
  async function cleanupStaleAudio() {
    try {
      log('[ClipAIble Cleanup] Starting stale audio cleanup...');
      const data = await chrome.storage.local.get(null);
      const now = Date.now();
      const toRemove = [];
      const CLEANUP_THRESHOLD = CONFIG.AUDIO_CLEANUP_THRESHOLD_MS;
      
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

  /**
   * Initialize context menu listeners and handlers
   * @param {function(import('../types.js').ProcessingData): Promise<boolean>} startArticleProcessing - Function to start article processing (already wrapped with extractFromPageInlined)
   */
  function initContextMenuListeners(startArticleProcessing) {
    // Initialize context menu on install
    try {
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
            createUserMessage: true, // Use centralized user-friendly message
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
        // Only log storage changes if verbose (reduces log volume)
        if (CONFIG?.VERBOSE_LOGGING) {
          log('[ClipAIble Background] Storage changed', {
            hasAudioVoiceMap: !!changes.audio_voice_map,
            hasAudioVoice: !!changes.audio_voice
          });
        }
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
          
          // Log each provider change - only log errors and warnings (not verbose details)
          for (const [provider, voice] of Object.entries(newMap)) {
            // Skip 'current' - it's not a provider name
            if (provider === 'current') {
              continue;
            }
            
            const oldVoice = oldMap[provider];
            if (oldVoice !== voice) {
              const voiceStr = String(voice || '');
              const oldVoiceStr = String(oldVoice || '');
              
              // CRITICAL: Warn if voice format is invalid for offline provider
              if (provider === 'offline') {
                if (/^\d+$/.test(voiceStr)) {
                  logError('[ClipAIble Background] CRITICAL ERROR: Voice is numeric index (will cause reset!)', {
                    provider,
                    invalidVoice: voiceStr,
                    oldVoice: oldVoiceStr
                  });
                } else if (!voiceStr.includes('_') && !voiceStr.includes('-')) {
                  logError('[ClipAIble Background] CRITICAL ERROR: Voice format invalid for offline (will cause reset!)', {
                    provider,
                    invalidVoice: voiceStr,
                    oldVoice: oldVoiceStr
                  });
                }
              }
            }
          }
          
          // Check if any provider was removed
          for (const [provider, oldVoice] of Object.entries(oldMap)) {
            if (provider === 'current') {
              continue;
            }
            if (!(provider in newMap)) {
              logWarn('[ClipAIble Background] Provider voice was REMOVED from map', {
                provider,
                removedVoice: oldVoice
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
          
          // CRITICAL: Warn if legacy voice is numeric (will cause issues)
          if (/^\d+$/.test(newVoiceStr)) {
            logError('[ClipAIble Background] CRITICAL ERROR: Legacy voice is numeric index (will cause reset!)', {
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
                createUserMessage: true, // Use centralized user-friendly message
                context: { operation: 'onLanguageChange' }
              });
              logError('Failed to update context menu after language change', normalized);
            });
        }
        
        // Handle pending subtitles (fallback when Extension context invalidated)
        if (changes.pendingSubtitles && changes.pendingSubtitles.newValue) {
          /** @type {import('../types.js').SubtitleData} */
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
            }, () => {
              // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
              if (chrome.runtime.lastError) {
                // Silently ignore - "Could not establish connection" is expected when receiver is closed
                // May timeout if no listener (extractYouTubeSubtitles may have timed out)
              }
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
                  createUserMessage: true, // Use centralized user-friendly message
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
                  createUserMessage: true, // Use centralized user-friendly message
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
          // CRITICAL: Use tab from context menu event, not active tab
          // This ensures we process the page where menu was clicked, not the currently active tab
          const tabId = tab?.id;
          const tabUrl = tab?.url || info.pageUrl || '';
          
          log('Context menu clicked', { format, tabId, url: tabUrl });
          
          if (!tabId) {
            logError('Context menu clicked but no tab ID available', { info, tab });
            return;
          }
          
          // CRITICAL: Validate URL before processing - block browser internal pages
          // This prevents errors when trying to extract content from chrome://, about:, etc.
          if (tabUrl && (
              tabUrl.startsWith('chrome://') || 
              tabUrl.startsWith('chrome-extension://') || 
              tabUrl.startsWith('edge://') || 
              tabUrl.startsWith('about:') ||
              tabUrl.startsWith('moz-extension://'))) {
            logWarn('Context menu clicked on browser internal page, ignoring', { 
              format, 
              tabId, 
              url: tabUrl 
            });
            // Optionally show notification to user
            handleQuickSave(format, startArticleProcessing, tabId).catch(error => {
              // Error will be handled and shown to user in handleQuickSaveError
              logError('Context menu quick save failed on internal page', error);
            });
            return;
          }
          
          // CRITICAL: handleQuickSave is async but we don't await it here
          // This is intentional - context menu click handler should not block
          // Errors are handled inside handleQuickSave
          // Pass tabId to handleQuickSave so it uses the correct tab
          handleQuickSave(format, startArticleProcessing, tabId).catch(error => {
            logError('Context menu quick save failed', error);
          });
        } else {
          logWarn('Unknown context menu item clicked', { menuItemId: info.menuItemId });
        }
      });
    } catch (error) {
      logError('Failed to register contextMenus.onClicked listener', error);
    }
  }

  return {
    /** @type {function(): Promise<void>} */
    updateContextMenu,
    /** @type {function(): Promise<void>} */
    cleanupStaleAudio,
    /** @type {function(function(import('../types.js').ProcessingData): Promise<boolean>): void} */
    initContextMenuListeners
  };
}

// Backward compatibility: export functions directly for modules that haven't been refactored yet
// TODO: Remove this after all modules use DI
import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { handleError } from '../utils/error-handler.js';
import { getUILanguage } from '../locales.js';
import { updateContextMenuWithLang } from '../utils/context-menu.js';
import { handleQuickSave } from './quicksave.js';

const contextMenuModule = initContextMenu({
  log,
  logError,
  logWarn,
  logDebug,
  CONFIG,
  handleError,
  getUILanguage,
  updateContextMenuWithLang,
  handleQuickSave
});

export const updateContextMenu = contextMenuModule.updateContextMenu;
export const cleanupStaleAudio = contextMenuModule.cleanupStaleAudio;
export const initContextMenuListeners = contextMenuModule.initContextMenuListeners;

