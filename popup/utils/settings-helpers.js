// @ts-check
/**
 * Settings helper functions for popup
 * Provides debounced settings saving, audio voice management, and UI state updates
 * Handles complex settings interactions and state synchronization
 */

import { logError } from '../../scripts/utils/logging.js';
import { CONFIG } from '../../scripts/utils/config.js';
import { STORAGE_KEYS } from '../constants.js';

const callbackTimers = new Map();
const revisions = new Map();

/**
 * Persist settings immediately and debounce each setting's UI callback.
 * @param {string} key - Storage key
 * @param {*} value - Value to save
 * @param {Function} [callback] - Optional callback after save
 */
export function debouncedSaveSettings(key, value, callback = null) {
  const revision = (revisions.get(key) || 0) + 1;
  revisions.set(key, revision);
  const write = chrome.storage.local.set({ [key]: value }).then(() => {
    try {
      chrome.runtime.sendMessage({
        action: 'logSetting',
        data: { key, value, valueType: typeof value, timestamp: Date.now() }
      }).catch(() => {});
    } catch (_) {}
    return true;
  }).catch(error => {
    logError('Failed to save settings', error);
    return false;
  });

  clearTimeout(callbackTimers.get(key));
  callbackTimers.delete(key);
  if (callback) {
    const timer = setTimeout(async () => {
      try {
        const saved = await write;
        if (saved && revisions.get(key) === revision) await callback();
      } catch (error) {
        logError('Failed to update settings UI', error);
      } finally {
        if (callbackTimers.get(key) === timer) callbackTimers.delete(key);
      }
    }, CONFIG.UI_DEBOUNCE_DELAY);
    callbackTimers.set(key, timer);
  }
  return write;
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
  debouncedSaveSettings(STORAGE_KEYS.STORAGE_AUDIO_VOICE_MAP, audioVoiceMap);
}

