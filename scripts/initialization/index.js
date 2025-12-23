// Initialization module for ClipAIble extension
// Handles API key migration and default settings initialization

// @ts-check

import { log, logError } from '../utils/logging.js';
import { encryptApiKey, isEncrypted } from '../utils/encryption.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Migrate existing plain text API keys to encrypted format
 * Runs once on extension startup
 */
export async function migrateApiKeys() {
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
export async function initializeDefaultSettings() {
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

/**
 * Run all initialization tasks
 * @returns {Promise<void>}
 */
export async function runInitialization() {
  // Migrate existing API keys to encrypted format (fire and forget)
  (async () => {
    try {
      await migrateApiKeys();
    } catch (error) {
      const normalized = await handleError(error, {
        source: 'initialization',
        errorType: 'apiKeyMigrationFailed',
        logError: true,
        createUserMessage: false
      });
      logError('API keys migration failed', normalized);
    }
  })();

  // Initialize default settings (fire and forget)
  (async () => {
    try {
      await initializeDefaultSettings();
    } catch (error) {
      const normalized = await handleError(error, {
        source: 'initialization',
        errorType: 'settingsInitializationFailed',
        logError: true,
        createUserMessage: false
      });
      logError('Default settings initialization failed', normalized);
    }
  })();
}


