// @ts-check
// Settings import/export module

import { log, logError, logWarn } from '../utils/logging.js';
import { addToStats, exportStats, replaceStats } from '../stats/index.js';
import { addToSelectorCache, normalizeCachedSelectors, replaceSelectorCache } from '../cache/selectors.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { getExtensionVersion } from '../utils/config.js';
import { DOCUMENT_FONT_FAMILIES, isDocumentColor } from '../utils/styles-validation.js';
import { GEMINI_IMAGE_MODELS, IMAGE_TRANSLATION_PROVIDERS, OPENROUTER_IMAGE_MODELS } from '../api/image-translation-catalog.js';
import { PROMPT_IDS, PROMPT_STORAGE_KEYS, PROMPT_STORAGE_PREFIX, validatePrompt, withPromptStorageLock } from './prompt-catalog.js';
import { OPENROUTER_TTS_MODELS, getOpenRouterTtsModel, findOpenRouterTtsVoice, resolveGoogleTtsModel } from '../api/tts-catalog.js';
import { OPENROUTER_SPEECH_SETTINGS_KEY, readOpenRouterSpeechProfiles } from '../api/openrouter-speech-options.js';
import { OPENROUTER_KEY_SLOTS } from '../utils/storage/openrouter-key-slots.js';

/** Keep missing and empty settings unchanged when transferring a backup. */
function transferSetting(key, value) {
  if (key === OPENROUTER_SPEECH_SETTINGS_KEY && value != null) return readOpenRouterSpeechProfiles(value);
  return key === 'google_tts_model' && typeof value === 'string' && value ? resolveGoogleTtsModel(value) : value;
}

function importError(key, language, params = {}) {
  return Object.assign(new Error(tSync(key, language, params)), { translationKey: key, translationParams: params });
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const safeMapKey = (value, maxLength = 100) => !['__proto__', 'constructor', 'prototype'].includes(value) && value.length <= maxLength;
const shortString = value => typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value);
const MAX_BACKUP_CACHE_LENGTH = 10 * 1024 * 1024;
const MAX_BACKUP_CACHE_DOMAINS = 10000;

function validComplexSetting(key, value) {
  if (!isRecord(value) || Object.keys(value).length > 100) return false;
  if (key === OPENROUTER_SPEECH_SETTINGS_KEY) return Object.values(value).every(item => isRecord(item) && Object.keys(item).length <= 10);
  if (key === 'audio_voice_map') {
    const voices = Object.hasOwn(value, 'current') ? value.current : value;
    return isRecord(voices) && Object.keys(voices).length <= 100 && Object.entries(voices).every(([provider, voice]) => safeMapKey(provider) && shortString(voice));
  }
  return Object.entries(value).every(([provider, models]) => safeMapKey(provider) && (
    key === 'model_by_provider' ? shortString(models)
      : Array.isArray(models) && models.length <= 1000 && models.every(shortString)
  ));
}

function normalizeImportedCache(value) {
  if (!isRecord(value) || Object.keys(value).length > MAX_BACKUP_CACHE_DOMAINS) return null;
  const cache = {};
  for (const [domain, entry] of Object.entries(value)) {
    if (!safeMapKey(domain, 253) || !isRecord(entry)) return null;
    try {
      const url = new URL(`https://${domain}`);
      if (url.hostname !== domain || url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    } catch { return null; }
    const selectors = normalizeCachedSelectors(entry.selectors);
    if (!selectors) return null;
    const normalized = { selectors };
    for (const name of ['created', 'lastUsed', 'lastSaved', 'successCount']) {
      if (entry[name] !== undefined && (!Number.isSafeInteger(entry[name]) || entry[name] < 0)) return null;
      if (entry[name] !== undefined) normalized[name] = entry[name];
    }
    if (entry.invalidated !== undefined && typeof entry.invalidated !== 'boolean') return null;
    normalized.invalidated = entry.invalidated ?? false;
    normalized.successCount ??= 0;
    cache[domain] = normalized;
  }
  return cache;
}

// Settings that can be exported/imported
// NOTE: API keys are NEVER included for security reasons
const STORAGE_KEYS_TO_EXPORT = [
  ...PROMPT_STORAGE_KEYS,
  // AI settings
  'api_provider',
  'openai_model',
  'model_by_provider',
  'custom_models',
  'hidden_models',
  'extraction_mode',
  'use_selector_cache',
  'enable_selector_caching',
  'enable_statistics',
  'openai_instructions',
  
  // Output settings
  'generate_toc',
  'generate_abstract',
  'page_mode',
  'pdf_language',
  'translate_images',
  'image_translation_provider',
  'gemini_image_model',
  'openrouter_image_model',
  
  // Audio settings
  'audio_provider',
  'qwen_model',
  'qwen_region',
  'qwen_workspace_id',
  'elevenlabs_model',
  'elevenlabs_format',
  'elevenlabs_stability',
  'elevenlabs_similarity',
  'elevenlabs_style',
  'elevenlabs_speaker_boost',
  'google_tts_model',
  'openrouter_tts_model',
  'openrouter_tts_voice',
  OPENROUTER_SPEECH_SETTINGS_KEY,
  'google_tts_voice',
  'google_tts_prompt',
  'respeecher_temperature',
  'respeecher_repetition_penalty',
  'respeecher_top_p',
  'audio_voice',
  'audio_voice_map',
  'audio_speed',
  
  // PDF style settings
  'pdf_style_preset',
  'pdf_font_family',
  'pdf_font_size',
  'pdf_bg_color',
  'pdf_text_color',
  'pdf_heading_color',
  'pdf_link_color',
  'pdf_custom_bg_color',
  'pdf_custom_text_color',
  'pdf_custom_heading_color',
  'pdf_custom_link_color',
  
  // UI settings
  'popup_theme',
  'ui_language'
];

// API key names - ALWAYS excluded from export for security
const API_KEY_NAMES = [
  'openai_api_key',
  'claude_api_key', 
  'gemini_api_key',
  'grok_api_key',
  ...Object.values(OPENROUTER_KEY_SLOTS),
  'deepseek_api_key',
  'google_api_key',
  'elevenlabs_api_key',
  'qwen_api_key',
  'respeecher_api_key',
  'google_tts_api_key'
];

/**
 * Export all settings to JSON
 * API keys are NEVER exported for security reasons
 * @param {boolean} includeStats - Include statistics
 * @param {boolean} includeCache - Include selector cache
 * @returns {Promise<{data: string, includesStatistics: boolean, includesCache: boolean, warnings: import('../types.js').LocalizedMessage[]}>}
 */
export async function exportSettings(includeStats = false, includeCache = false) {
  try {
    log('Exporting settings', { includeStats, includeCache });
    
    // Get all settings
    const settings = await chrome.storage.local.get(STORAGE_KEYS_TO_EXPORT);
    
    const exportData = {
      version: getExtensionVersion() ?? 'unknown',
      exportDate: new Date().toISOString(),
      settings: {}
    };
    const warnings = [];
    
    // Copy settings (exclude only undefined and null, but allow empty strings and 0/false)
    // Note: API keys are NOT in STORAGE_KEYS_TO_EXPORT, so they're never exported
    for (const key of STORAGE_KEYS_TO_EXPORT) {
      if (settings[key] !== undefined && settings[key] !== null) {
        exportData.settings[key] = transferSetting(key, settings[key]);
      }
    }
    
    // Add statistics if requested
    if (includeStats) {
      try {
        exportData.statistics = await exportStats();
        log('Statistics included in export');
      } catch (error) {
        logError('Failed to export statistics', error);
        warnings.push({ key: 'backupExportStatisticsUnreadable' });
      }
    }
    
    // Add cache if requested
    if (includeCache) {
      try {
        const saved = await chrome.storage.local.get(['selector_cache']);
        const cache = saved.selector_cache ?? {};
        if (!isRecord(cache)) throw new TypeError('Invalid selector cache');
        const domains = Object.keys(cache).length;
        if (domains > MAX_BACKUP_CACHE_DOMAINS || JSON.stringify(cache).length > MAX_BACKUP_CACHE_LENGTH) {
          logWarn('Selector cache exceeds backup limit', { domains });
          warnings.push({ key: 'backupExportCacheLimit' });
        } else {
          exportData.selectorCache = cache;
          log('Selector cache included in export', { domains });
        }
      } catch (error) {
        logError('Failed to export cache', error);
        warnings.push({ key: 'backupExportCacheUnreadable' });
      }
    }
    
    return {
      data: JSON.stringify(exportData, null, 2),
      includesStatistics: Object.hasOwn(exportData, 'statistics'),
      includesCache: Object.hasOwn(exportData, 'selectorCache'),
      warnings
    };
  } catch (error) {
    logError('Export failed', error);
    throw error;
  }
}

/**
 * Import settings from JSON
 * @param {string} jsonData - JSON string
 * @param {{importStats?: boolean, importCache?: boolean, overwriteExisting?: boolean, dataMode?: 'add' | 'replace'}} [options={}] - Import options
 * @throws {Error} If JSON parsing fails
 * @throws {Error} If validation fails
 */
export async function importSettings(jsonData, options = {}) {
  return withPromptStorageLock(() => importSettingsLocked(jsonData, options));
}

/** @param {string} jsonData @param {{importStats?: boolean, importCache?: boolean, overwriteExisting?: boolean, dataMode?: 'add' | 'replace'}} options */
async function importSettingsLocked(jsonData, options) {
  const {
    importStats = false,
    importCache = false,
    overwriteExisting = false,
    dataMode = 'add'
  } = options;
  
  try {
    log('Importing settings', options);
    
    // SECURITY: Safe JSON parse to prevent crashes on malformed data
    let data;
    try {
      data = JSON.parse(jsonData);
    } catch {
      logError('Failed to parse import JSON');
      const uiLang = await getUILanguageCached();
      throw importError('errorImportJsonParseFailed', uiLang);
    }
    
    const uiLang = await getUILanguageCached();
    if (!data || typeof data !== 'object' || (dataMode !== 'add' && dataMode !== 'replace')) {
      throw importError('errorImportDataNotObject', uiLang);
    }
    
    if (!data.settings) {
      throw importError('errorImportMissingSettings', uiLang);
    }
    
    // Validate data size to prevent DoS attacks
    const dataSize = JSON.stringify(data).length;
    const maxDataSize = 50 * 1024 * 1024; // 50MB limit
    if (dataSize > maxDataSize) {
      const sizeMB = Math.round(dataSize / 1024 / 1024);
      const maxMB = Math.round(maxDataSize / 1024 / 1024);
      throw importError('errorImportFileTooLarge', uiLang, { size: sizeMB, max: maxMB });
    }
    
    // Validate settings object structure
    if (typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      throw importError('errorImportSettingsNotObject', uiLang);
    }
    
    const result = {
      settingsImported: 0,
      settingsSkipped: 0,
      statsImported: false,
      cacheImported: false,
      errors: [],
      warnings: [],
      warningTranslations: [],
      errorTranslations: []
    };
    
    const notice = (kind, key, params = {}) => {
      result[kind].push(tSync(key, uiLang, params));
      result[kind === 'warnings' ? 'warningTranslations' : 'errorTranslations'].push({ key, params });
    };

    // Validate version compatibility
    const exportVersion = typeof data.version === 'string' && data.version.length <= 100 ? data.version : 'unknown';
    const currentVersion = getExtensionVersion();
    
    if (currentVersion && exportVersion !== 'unknown') {
      const exportMajor = parseInt(exportVersion.split('.')[0]) || 0;
      const exportMinor = parseInt(exportVersion.split('.')[1]) || 0;
      const currentMajor = parseInt(currentVersion.split('.')[0]) || 0;
      const currentMinor = parseInt(currentVersion.split('.')[1]) || 0;
      
      // Warn if major version differs (potential incompatibility)
      if (exportMajor !== currentMajor) {
        logWarn('Version mismatch: major version differs', { exportVersion, currentVersion });
        notice('errors', 'warningImportVersion', { exportVersion, currentVersion });
      } else if (Math.abs(exportMinor - currentMinor) > 2) {
        // Warn if minor version differs by more than 2
        logWarn('Version mismatch: minor version differs significantly', { exportVersion, currentVersion });
        notice('errors', 'warningImportVersion', { exportVersion, currentVersion });
      } else {
        log('Version check passed', { exportVersion, currentVersion });
      }
    }
    
    // Older backups may contain a local format selection. Ignore it without a warning.
    const unknownKeys = Object.keys(data.settings).filter(key => 
      key !== 'output_format' && !STORAGE_KEYS_TO_EXPORT.includes(key) && !API_KEY_NAMES.includes(key)
    );
    if (unknownKeys.length > 0) {
      logWarn('Unknown keys found in import file', { keys: unknownKeys });
      notice('warnings', 'warningImportUnknown', { count: unknownKeys.length });
    }
    
    // Import settings
    const currentSettings = await chrome.storage.local.get(STORAGE_KEYS_TO_EXPORT);
    const settingsToImport = {};
    
    // CRITICAL FIX: Preserve use_selector_cache if it's not in import file and overwriteExisting is true
    // This prevents the setting from being lost during import
    const preserveUseSelectorCache = overwriteExisting && 
                                     data.settings['use_selector_cache'] === undefined && 
                                     currentSettings['use_selector_cache'] !== undefined;
    
    // Preserve enable_selector_caching if it's not in import file and overwriteExisting is true
    const preserveEnableSelectorCaching = overwriteExisting && 
                                          data.settings['enable_selector_caching'] === undefined && 
                                          currentSettings['enable_selector_caching'] !== undefined;
    
    // Valid enum values for validation
    const VALID_ENUMS = {
      api_provider: ['openai', 'claude', 'gemini', 'grok', 'openrouter', 'deepseek'],
      image_translation_provider: IMAGE_TRANSLATION_PROVIDERS,
      gemini_image_model: Object.keys(GEMINI_IMAGE_MODELS),
      openrouter_image_model: Object.keys(OPENROUTER_IMAGE_MODELS),
      openrouter_tts_model: OPENROUTER_TTS_MODELS.map(entry => entry.id),
      openrouter_tts_voice: [...new Set(OPENROUTER_TTS_MODELS.flatMap(entry => entry.voices.map(voice => voice.id)))],
      audio_provider: ['offline', 'supertonic', 'openai', 'elevenlabs', 'google', 'openrouter', 'qwen', 'respeecher'],
      extraction_mode: ['automatic', 'selector', 'extract'],
      page_mode: ['single', 'multi'],
      pdf_style_preset: ['light', 'dark', 'sepia', 'contrast', 'custom'],
      pdf_font_family: DOCUMENT_FONT_FAMILIES,
      popup_theme: ['light', 'dark', 'auto']
    };
    
    // Numeric range validators
    const NUMERIC_RANGES = {
      audio_speed: { min: 0.25, max: 4.0 },
      pdf_font_size: { min: 8, max: 72 },
      elevenlabs_stability: { min: 0.0, max: 1.0 },
      elevenlabs_similarity: { min: 0.0, max: 1.0 },
      elevenlabs_style: { min: 0.0, max: 1.0 },
      respeecher_temperature: { min: 0.0, max: 2.0 },
      respeecher_repetition_penalty: { min: 0.0, max: 2.0 },
      respeecher_top_p: { min: 0.0, max: 1.0 }
    };
    
    // Boolean settings that must be validated
    const BOOLEAN_KEYS = [
      'generate_toc',
      'generate_abstract',
      'translate_images',
      'use_selector_cache',
      'enable_selector_caching',
      'enable_statistics',
      'elevenlabs_speaker_boost'
    ];
    
    // Object structure validators
    const OBJECT_KEYS = {
      custom_models: 'object',
      hidden_models: 'object',
      model_by_provider: 'object',
      audio_voice_map: 'object',
      [OPENROUTER_SPEECH_SETTINGS_KEY]: 'object'
    };
    
    for (const key of STORAGE_KEYS_TO_EXPORT) {
      if (key.startsWith(PROMPT_STORAGE_PREFIX)) {
        const id = PROMPT_IDS.find(id => PROMPT_STORAGE_PREFIX + id === key);
        const value = data.settings[key];
        if (value !== undefined && value !== null && validatePrompt(id, value)) {
          notice('warnings', 'warningImportValue', { setting: key });
          result.settingsSkipped++;
          continue;
        }
      }
      // Security: Skip any API keys that might be in the import file
      if (API_KEY_NAMES.includes(key)) {
        log('Skipping API key import for security', { key });
        continue;
      }
      
      // CRITICAL FIX: Preserve use_selector_cache if it's not in import file
      if (key === 'use_selector_cache' && preserveUseSelectorCache) {
        settingsToImport[key] = currentSettings[key];
        result.settingsSkipped++; // Count as skipped to indicate it was preserved
        log('Preserved use_selector_cache during import', { value: currentSettings[key] });
        continue;
      }
      
      // Preserve enable_selector_caching if it's not in import file
      if (key === 'enable_selector_caching' && preserveEnableSelectorCaching) {
        settingsToImport[key] = currentSettings[key];
        result.settingsSkipped++; // Count as skipped to indicate it was preserved
        log('Preserved enable_selector_caching during import', { value: currentSettings[key] });
        continue;
      }
      
      // Handle explicit null values (intentional reset)
      if (data.settings[key] === null) {
        if (overwriteExisting) {
          // Remove the setting from storage (set to undefined to clear it)
          settingsToImport[key] = undefined;
          result.settingsImported++;
          log('Importing null value to reset setting', { key });
        } else {
          result.settingsSkipped++;
        }
        continue;
      }
      
      if (data.settings[key] !== undefined) {
        if (/^pdf_(?:custom_)?(?:bg|text|heading|link)_color$/.test(key) &&
            !isDocumentColor(data.settings[key])) {
          notice('warnings', 'warningImportColor', { setting: key });
          continue;
        }
        // Validate enum values
        if (VALID_ENUMS[key] && !VALID_ENUMS[key].includes(data.settings[key])) {
          logWarn('Invalid enum value for setting', { key, value: data.settings[key], valid: VALID_ENUMS[key] });
          notice('warnings', 'warningImportValue', { setting: key });
          continue;
        }
        
        // Validate numeric ranges
        if (NUMERIC_RANGES[key]) {
          const range = NUMERIC_RANGES[key];
          const rawValue = data.settings[key];
          const numericValue = typeof rawValue === 'string' && rawValue.trim() !== ''
            ? Number(rawValue)
            : rawValue;
          if (typeof numericValue !== 'number' || !Number.isFinite(numericValue) || numericValue < range.min || numericValue > range.max) {
            logWarn('Invalid numeric value for setting', { key, value: data.settings[key], range });
            notice('warnings', 'warningImportRange', { setting: key, min: range.min, max: range.max });
            continue;
          }
        }
        
        // Validate object structure for complex objects
        if (OBJECT_KEYS[key]) {
          const value = data.settings[key];
          if (!validComplexSetting(key, value)) {
            logWarn('Invalid object structure for setting', { key, valueType: typeof value, isArray: Array.isArray(value) });
            notice('warnings', 'warningImportObject', { setting: key });
            continue;
          }
        }

        if (!NUMERIC_RANGES[key] && !BOOLEAN_KEYS.includes(key) && !OBJECT_KEYS[key] && typeof data.settings[key] !== 'string') {
          notice('warnings', 'warningImportValue', { setting: key });
          continue;
        }
        
        // Validate boolean settings
        if (BOOLEAN_KEYS.includes(key) && typeof data.settings[key] !== 'boolean') {
          logWarn('Invalid boolean value for setting', { key, value: data.settings[key] });
          notice('warnings', 'warningImportBoolean', { setting: key });
          continue;
        }
        
        // Validate string length for text settings (prevent DoS)
        if (typeof data.settings[key] === 'string') {
          const maxStringLength = 100000; // 100KB limit per string setting
          if (data.settings[key].length > maxStringLength) {
            logWarn('String value too long for setting', { key, length: data.settings[key].length, max: maxStringLength });
            notice('warnings', 'warningImportLength', { setting: key, length: data.settings[key].length, max: maxStringLength });
            continue;
          }
        }
        
        if (overwriteExisting || currentSettings[key] === undefined || currentSettings[key] === null) {
          settingsToImport[key] = transferSetting(key, data.settings[key]);
          result.settingsImported++;
        } else {
          result.settingsSkipped++;
        }
      }
    }
    
    // A partial import must not leave the saved speech model and voice incompatible.
    const speechModelKey = 'openrouter_tts_model';
    const speechVoiceKey = 'openrouter_tts_voice';
    if (Object.hasOwn(settingsToImport, speechModelKey) || Object.hasOwn(settingsToImport, speechVoiceKey)) {
      const effective = { ...currentSettings, ...settingsToImport };
      const selected = OPENROUTER_TTS_MODELS.find(entry => entry.id === effective[speechModelKey]) ?? getOpenRouterTtsModel();
      const voice = effective[speechVoiceKey];
      if (voice && !findOpenRouterTtsVoice(selected, voice)) {
        if (Object.hasOwn(settingsToImport, speechVoiceKey)) {
          notice('warnings', 'warningImportValue', { setting: speechVoiceKey });
          result.settingsImported--;
          result.settingsSkipped++;
        }
        if (findOpenRouterTtsVoice(selected, currentSettings[speechVoiceKey])) {
          delete settingsToImport[speechVoiceKey];
        } else {
          settingsToImport[speechVoiceKey] = undefined;
        }
      }
    }

    // Security: Double-check that no API keys are being imported
    // Check both in settingsToImport AND in data.settings (in case someone tries to bypass)
    for (const apiKey of API_KEY_NAMES) {
      if (settingsToImport[apiKey]) {
        delete settingsToImport[apiKey];
        log('Removed API key from import for security', { key: apiKey });
      }
      // Also check in raw data.settings to catch any attempts to bypass
      if (data.settings && data.settings[apiKey]) {
        log('API key found in import file, ignoring for security', { key: apiKey });
        delete data.settings[apiKey];
      }
    }
    
    // Prepare settings for import (remove undefined values, they will clear the setting)
    const settingsToSave = {};
    const keysToRemove = [];
    
    for (const [key, value] of Object.entries(settingsToImport)) {
      if (value === undefined) {
        // Mark for removal
        keysToRemove.push(key);
      } else {
        settingsToSave[key] = value;
      }
    }
    
    // Save settings
    if (Object.keys(settingsToSave).length > 0) {
      await chrome.storage.local.set(settingsToSave);
      log('Settings imported', { count: result.settingsImported });
    }
    
    // Remove settings that were explicitly set to null/undefined
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      log('Settings removed (reset to default)', { keys: keysToRemove });
    }
    
    // Ensure use_selector_cache has a default value if not imported
    // This prevents the setting from being lost during import
    const finalSettings = await chrome.storage.local.get(['use_selector_cache', 'enable_selector_caching']);
    if (finalSettings.use_selector_cache === undefined || finalSettings.use_selector_cache === null) {
      await chrome.storage.local.set({ use_selector_cache: true });
      log('Set use_selector_cache to default (true) after import');
    }
    
    // Ensure enable_selector_caching has a default value if not imported
    if (finalSettings.enable_selector_caching === undefined || finalSettings.enable_selector_caching === null) {
      await chrome.storage.local.set({ enable_selector_caching: true });
      log('Set enable_selector_caching to default (true) after import');
    }
    
    // Import statistics
    if (importStats && data.statistics) {
      try {
        if (!isRecord(data.statistics)) throw new TypeError('Invalid statistics');
        if (dataMode === 'add') await addToStats(data.statistics);
        else await replaceStats(data.statistics);
        result.statsImported = true;
        log('Statistics imported');
      } catch (error) {
        logError('Failed to import statistics', error);
        notice('errors', 'errorImportStatsFailed', { error: error.message });
      }
    }
    
    // Import cache
    if (importCache && data.selectorCache) {
      try {
        // Validate cache structure
        if (typeof data.selectorCache !== 'object' || Array.isArray(data.selectorCache)) {
          throw importError('errorImportCacheNotObject', uiLang);
        }
        
        // Validate cache size
        const cacheSize = JSON.stringify(data.selectorCache).length;
        if (cacheSize > MAX_BACKUP_CACHE_LENGTH) {
          throw importError('errorImportCacheTooLarge', uiLang, {
            size: Math.ceil(cacheSize / 1024 / 1024), max: MAX_BACKUP_CACHE_LENGTH / 1024 / 1024
          });
        }
        
        const cache = normalizeImportedCache(data.selectorCache);
        if (!cache) throw importError('errorImportCacheNotObject', uiLang);
        if (dataMode === 'add') {
          const oversized = await addToSelectorCache(cache, MAX_BACKUP_CACHE_LENGTH);
          if (oversized !== null) {
            throw importError('errorImportCacheTooLarge', uiLang, {
              size: Math.ceil(oversized / 1024 / 1024), max: MAX_BACKUP_CACHE_LENGTH / 1024 / 1024
            });
          }
        } else {
          await replaceSelectorCache(cache);
        }
        result.cacheImported = true;
        const domainCount = Object.keys(data.selectorCache).length;
        log('Selector cache imported', { domains: domainCount });
      } catch (error) {
        logError('Failed to import cache', error);
        if (error.translationKey) notice('errors', error.translationKey, error.translationParams);
        else notice('errors', 'errorImportCacheFailed', { error: error.message });
      }
    }
    
    return result;
  } catch (error) {
    logError('Import failed', error);
    throw error;
  }
}

/**
 * Download settings as JSON file
 * @param {string} jsonData - JSON string
 * @param {string} filename - Filename
 */
export function downloadSettings(jsonData, filename = 'clipaible-settings.json') {
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  try {
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    // CRITICAL: Always clean up DOM element and URL, even if errors occur
    // Check if element is still in DOM before removing (may have been removed by error)
    if (a.parentNode) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }
}

/**
 * Read file as text
 * @param {File} file - File object
 * @returns {Promise<string>} File content
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      /** @type {import('../types.js').FileReaderEventTarget} */
      const target = e.target;
      const result = target.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

