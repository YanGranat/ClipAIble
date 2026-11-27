// Initialization module for ClipAIble extension
// Handles API key migration and default settings initialization

// @ts-check

import { log, logError } from '../utils/logging.js';
import { encryptApiKey, isMaskedKey, withApiKeyStorageLock } from '../utils/encryption.js';
import { OPENROUTER_KEY_SLOTS, OPENROUTER_KEY_STORAGE_FIELDS, planOpenRouterKeySeparation } from '../utils/storage/openrouter-key-slots.js';

/**
 * Migrate existing plain text API keys to encrypted format
 * Runs once on extension startup
 */
export async function migrateApiKeys() {
  return withApiKeyStorageLock(async () => {
    try {
      const result = await chrome.storage.local.get([
        'openai_api_key',
        'claude_api_key',
        'deepseek_api_key',
        'gemini_api_key',
        'grok_api_key',
        ...OPENROUTER_KEY_STORAGE_FIELDS,
        'google_api_key',
        'elevenlabs_api_key',
        'qwen_api_key',
        'respeecher_api_key',
        'google_tts_api_key',
        'api_keys_migrated' // Migration completion marker
      ]);

      const keysToEncrypt = {};
      let hasChanges = false;

      // Check and encrypt each key if needed (always check, not just on first migration)
      const keyNames = [
        'openai_api_key',
        'claude_api_key',
        'deepseek_api_key',
        'gemini_api_key',
        'grok_api_key',
        ...Object.values(OPENROUTER_KEY_SLOTS),
        'google_api_key',
        'elevenlabs_api_key',
        'qwen_api_key',
        'respeecher_api_key',
        'google_tts_api_key'
      ];
    
      for (const keyName of keyNames) {
        const value = result[keyName];
        if (value && typeof value === 'string') {
          if (Object.values(OPENROUTER_KEY_SLOTS).some(slot => slot === keyName) && isMaskedKey(value.trim())) continue;
          try {
            const encrypted = await encryptApiKey(value);
            if (encrypted !== value) {
              keysToEncrypt[keyName] = encrypted;
              hasChanges = true;
              log(`Migrating ${keyName} to encrypted format`);
            }
          } catch (error) {
            logError(`Failed to encrypt ${keyName}`, error);
            // Continue with other keys
          }
        }
      }

      let separated = {};
      try {
        separated = await planOpenRouterKeySeparation({ ...result, ...keysToEncrypt }, encryptApiKey);
      } catch (error) {
        // Leave migration pending without blocking unrelated startup work.
        logError('Could not initialize OpenRouter media credentials', error);
      }
      if (hasChanges || Object.keys(separated).length) {
        await chrome.storage.local.set({ ...keysToEncrypt, ...separated, api_keys_migrated: true });
        log('API key storage initialized', { encryptedKeys: Object.keys(keysToEncrypt).length });
      } else if (!result.api_keys_migrated) {
        // Mark as migrated only if no keys to encrypt and not already migrated
        await chrome.storage.local.set({ api_keys_migrated: true });
        log('API keys migration check completed (no keys to migrate)');
      } else {
        log('API keys already migrated, checking for unencrypted keys');
      }
    } catch (error) {
      logError('API keys migration failed', error);
      throw error;
    }
  });
}

/**
 * Initialize default settings on first run
 * Ensures use_selector_cache and enable_selector_caching are set to true by default
 * Also cleans up deprecated transcription settings
 */
export async function initializeDefaultSettings() {
  try {
    await chrome.storage.local.remove(['lastSubtitles', 'pendingSubtitles']);
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
    throw error;
  }
}

/**
 * Run all initialization tasks
 * @returns {Promise<void>}
 */
export async function runInitialization() {
  if (typeof chrome.storage.local.setAccessLevel === 'function') {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }
  const phases = await Promise.allSettled([migrateApiKeys(), initializeDefaultSettings()]);
  const failure = phases.find(phase => phase.status === 'rejected');
  if (failure) throw failure.reason;
}


