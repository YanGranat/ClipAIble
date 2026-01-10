// @ts-check
// Settings helper functions for popup

import { log, logError } from '../../scripts/utils/logging.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { STORAGE_KEYS } from '../constants.js';

// Debounce timer for settings save
let settingsSaveTimer = null;
let isSavingSettings = false; // Flag to prevent concurrent saves

/**
 * Debounced settings save - saves settings after delay of inactivity
 * @param {string} key - Storage key
 * @param {*} value - Value to save
 * @param {Function} [callback] - Optional callback after save
 */
export function debouncedSaveSettings(key, value, callback = null) {
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
  }
  
  settingsSaveTimer = setTimeout(async () => {
    // Prevent concurrent saves
    if (isSavingSettings) {
      // If already saving, schedule another save after current one completes
      if (callback) {
        const originalCallback = callback;
        callback = async () => {
          await originalCallback();
          // Retry save after current one completes
          setTimeout(() => debouncedSaveSettings(key, value, null), CONFIG.UI_RETRY_DELAY);
        };
      } else {
        // Retry save after current one completes
        setTimeout(() => debouncedSaveSettings(key, value, callback), CONFIG.UI_RETRY_DELAY);
      }
      return;
    }
    
    isSavingSettings = true;
    try {
      // Log only metadata, not full value to reduce log size
      const valueSize = typeof value === 'string' ? value.length : 
                       typeof value === 'object' && value !== null ? JSON.stringify(value).length : 0;
      const valuePreview = typeof value === 'string' ? (value.length > 100 ? value.substring(0, 100) + '...' : value) :
                          typeof value === 'object' && value !== null ? `[object with ${Object.keys(value).length} keys]` : value;
      
      log('[ClipAIble Popup] Saving setting', {
        key,
        valueType: typeof value,
        valueSize,
        valuePreview,
        isObject: typeof value === 'object' && !Array.isArray(value) && value !== null,
        objectKeys: typeof value === 'object' && !Array.isArray(value) && value !== null ? Object.keys(value) : null
      });
      
      await chrome.storage.local.set({ [key]: value });
      
      // CRITICAL: Send setting change to service worker for centralized logging
      try {
        chrome.runtime.sendMessage({
          action: 'logSetting',
          data: {
            key,
            value,
            valueType: typeof value,
            timestamp: Date.now()
          }
        }).catch(() => {
          // Ignore errors when sending log (non-critical)
        });
      } catch (sendError) {
        // Ignore errors when sending log (non-critical)
      }
      
      if (callback) await callback();
    } catch (error) {
      logError('Failed to save settings', error);
    } finally {
      isSavingSettings = false;
      settingsSaveTimer = null;
    }
  }, CONFIG.UI_DEBOUNCE_DELAY);
}

/**
 * Save audio voice per provider with backward-compatible flat key
 * @param {string} provider - Audio provider
 * @param {string} voice - Voice ID
 * @param {Object} audioVoiceMap - Audio voice map object (will be modified)
 */
export function saveAudioVoice(provider, voice, audioVoiceMap) {
  if (!provider) return;
  if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
    audioVoiceMap = {};
  }
  audioVoiceMap[provider] = voice;
  debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE, voice);
  debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE_MAP, audioVoiceMap);
}

