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
      // DETAILED LOGGING: Saving to storage
      log('[ClipAIble Popup] ===== debouncedSaveSettings: ABOUT TO SAVE =====', {
        timestamp: Date.now(),
        key,
        keyType: typeof key,
        value,
        valueType: typeof value,
        isAudioVoice: key === 'audio_voice' || key === STORAGE_KEYS.AUDIO_VOICE,
        isAudioVoiceMap: key === 'audio_voice_map' || key === STORAGE_KEYS.AUDIO_VOICE_MAP,
        isNumeric: /^\d+$/.test(String(value)),
        isObject: typeof value === 'object' && !Array.isArray(value),
        objectKeys: typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : null
      });
      
      await chrome.storage.local.set({ [key]: value });
      
      // DETAILED LOGGING: Saved to storage
      log('[ClipAIble Popup] ===== debouncedSaveSettings: SAVED TO STORAGE =====', {
        timestamp: Date.now(),
        key,
        value,
        saved: true,
        storageKey: key
      });
      
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

