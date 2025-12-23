// @ts-check
// Settings import/export module

import { log, logError, logWarn } from '../utils/logging.js';
import { exportStats } from '../stats/index.js';
import { getCacheStats } from '../cache/selectors.js';

// Get current extension version from manifest
function getCurrentVersion() {
  try {
    return chrome.runtime.getManifest().version || '3.2.4';
  } catch (error) {
    logWarn('Failed to get version from manifest, using fallback', error);
    return '3.2.0';
  }
}

// Settings that can be exported/imported
// NOTE: API keys are NEVER included for security reasons
const STORAGE_KEYS_TO_EXPORT = [
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
  'output_format',
  'generate_toc',
  'generate_abstract',
  'page_mode',
  'pdf_language',
  'translate_images',
  
  // Audio settings
  'audio_provider',
  'elevenlabs_model',
  'elevenlabs_format',
  'elevenlabs_stability',
  'elevenlabs_similarity',
  'elevenlabs_style',
  'elevenlabs_speaker_boost',
  'google_tts_model',
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
  'openrouter_api_key',
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
 * @returns {Promise<string>} JSON string
 */
export async function exportSettings(includeStats = false, includeCache = false) {
  try {
    log('Exporting settings', { includeStats, includeCache });
    
    // Get all settings
    const settings = await chrome.storage.local.get(STORAGE_KEYS_TO_EXPORT);
    
    const exportData = {
      version: getCurrentVersion(),
      exportDate: new Date().toISOString(),
      settings: {}
    };
    
    // Copy settings (exclude only undefined and null, but allow empty strings and 0/false)
    // Note: API keys are NOT in STORAGE_KEYS_TO_EXPORT, so they're never exported
    for (const key of STORAGE_KEYS_TO_EXPORT) {
      if (settings[key] !== undefined && settings[key] !== null) {
        exportData.settings[key] = settings[key];
      }
    }
    
    // Add statistics if requested
    if (includeStats) {
      try {
        const statsJson = await exportStats();
        exportData.statistics = JSON.parse(statsJson);
        log('Statistics included in export');
      } catch (error) {
        logError('Failed to export statistics', error);
        // Note: Error is logged but export continues without statistics
        // This allows partial export to succeed even if stats fail
      }
    }
    
    // Add cache if requested
    if (includeCache) {
      try {
        const cacheStats = await getCacheStats();
        // Get full cache data
        const cacheResult = await chrome.storage.local.get(['selector_cache']);
        if (cacheResult.selector_cache) {
          // Validate cache size to prevent extremely large exports
          const cacheSize = JSON.stringify(cacheResult.selector_cache).length;
          const maxCacheSize = 10 * 1024 * 1024; // 10MB limit
          if (cacheSize > maxCacheSize) {
            logWarn('Cache too large to export', { size: cacheSize, max: maxCacheSize });
            // Skip cache export if too large
          } else {
            exportData.selectorCache = cacheResult.selector_cache;
            log('Selector cache included in export', { 
              domains: Object.keys(cacheResult.selector_cache).length 
            });
          }
        }
      } catch (error) {
        logError('Failed to export cache', error);
        // Note: Error is logged but export continues without cache
        // This allows partial export to succeed even if cache fails
      }
    }
    
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    logError('Export failed', error);
    throw error;
  }
}

/**
 * Import settings from JSON
 * @param {string} jsonData - JSON string
 * @param {Object} options - Import options
 * @param {boolean} options.importStats - Import statistics
 * @param {boolean} options.importCache - Import selector cache
 * @param {boolean} options.overwriteExisting - Overwrite existing settings
 * @returns {Promise<Object>} Import result with counts
 */
export async function importSettings(jsonData, options = {}) {
  const {
    importStats = false,
    importCache = false,
    overwriteExisting = false
  } = options;
  
  try {
    log('Importing settings', options);
    
    // SECURITY: Safe JSON parse to prevent crashes on malformed data
    let data;
    try {
      data = JSON.parse(jsonData);
    } catch (parseError) {
      logError('Failed to parse import JSON', parseError);
      throw new Error('Invalid export file: JSON parsing failed. The file may be corrupted or not a valid ClipAIble export file.');
    }
    
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid export file: data is not an object');
    }
    
    if (!data.settings) {
      throw new Error('Invalid export file: missing settings');
    }
    
    // Validate data size to prevent DoS attacks
    const dataSize = JSON.stringify(data).length;
    const maxDataSize = 50 * 1024 * 1024; // 50MB limit
    if (dataSize > maxDataSize) {
      throw new Error(`Import file is too large (${Math.round(dataSize / 1024 / 1024)}MB). Maximum size is ${Math.round(maxDataSize / 1024 / 1024)}MB.`);
    }
    
    // Validate settings object structure
    if (typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      throw new Error('Invalid export file: settings must be an object');
    }
    
    const result = {
      settingsImported: 0,
      settingsSkipped: 0,
      statsImported: false,
      cacheImported: false,
      errors: [],
      warnings: []
    };
    
    // Validate version compatibility
    const exportVersion = data.version || 'unknown';
    const currentVersion = getCurrentVersion();
    
    if (exportVersion !== 'unknown') {
      const exportMajor = parseInt(exportVersion.split('.')[0]) || 0;
      const exportMinor = parseInt(exportVersion.split('.')[1]) || 0;
      const currentMajor = parseInt(currentVersion.split('.')[0]) || 0;
      const currentMinor = parseInt(currentVersion.split('.')[1]) || 0;
      
      // Warn if major version differs (potential incompatibility)
      if (exportMajor !== currentMajor) {
        logWarn('Version mismatch: major version differs', { exportVersion, currentVersion });
        result.errors.push(`Warning: Export file version (${exportVersion}) differs significantly from current version (${currentVersion}). Some settings may not be compatible.`);
      } else if (Math.abs(exportMinor - currentMinor) > 2) {
        // Warn if minor version differs by more than 2
        logWarn('Version mismatch: minor version differs significantly', { exportVersion, currentVersion });
        result.errors.push(`Warning: Export file version (${exportVersion}) differs from current version (${currentVersion}). Some settings may not work correctly.`);
      } else {
        log('Version check passed', { exportVersion, currentVersion });
      }
    }
    
    // Check for unknown keys in import file
    const unknownKeys = Object.keys(data.settings).filter(key => 
      !STORAGE_KEYS_TO_EXPORT.includes(key) && !API_KEY_NAMES.includes(key)
    );
    if (unknownKeys.length > 0) {
      logWarn('Unknown keys found in import file', { keys: unknownKeys });
      result.warnings.push(`Found ${unknownKeys.length} unknown setting(s) in import file. They will be ignored.`);
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
      api_provider: ['openai', 'claude', 'gemini', 'grok', 'openrouter'],
      audio_provider: ['openai', 'elevenlabs', 'google', 'qwen', 'respeecher'],
      output_format: ['pdf', 'epub', 'fb2', 'markdown', 'audio'],
      extraction_mode: ['auto', 'manual'],
      page_mode: ['single', 'multi'],
      pdf_style_preset: ['light', 'dark', 'sepia', 'custom'],
      popup_theme: ['light', 'dark', 'auto']
    };
    
    for (const key of STORAGE_KEYS_TO_EXPORT) {
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
      
      if (data.settings[key] !== undefined) {
        // Validate enum values
        if (VALID_ENUMS[key] && !VALID_ENUMS[key].includes(data.settings[key])) {
          logWarn('Invalid enum value for setting', { key, value: data.settings[key], valid: VALID_ENUMS[key] });
          result.warnings.push(`Invalid value for ${key}: "${data.settings[key]}". Skipping.`);
          continue;
        }
        
        // Validate numeric ranges for specific settings
        if (key === 'audio_speed' && (typeof data.settings[key] !== 'number' || data.settings[key] < 0.25 || data.settings[key] > 4.0)) {
          logWarn('Invalid audio_speed value', { value: data.settings[key] });
          result.warnings.push(`Invalid audio_speed value: ${data.settings[key]}. Must be between 0.25 and 4.0. Skipping.`);
          continue;
        }
        
        if (key === 'pdf_font_size' && (typeof data.settings[key] !== 'number' || data.settings[key] < 8 || data.settings[key] > 72)) {
          logWarn('Invalid pdf_font_size value', { value: data.settings[key] });
          result.warnings.push(`Invalid pdf_font_size value: ${data.settings[key]}. Must be between 8 and 72. Skipping.`);
          continue;
        }
        
        // Validate boolean settings
        if ((key === 'generate_toc' || key === 'generate_abstract' || key === 'translate_images' || 
             key === 'use_selector_cache' || key === 'enable_selector_caching' || key === 'enable_statistics') &&
            typeof data.settings[key] !== 'boolean') {
          logWarn('Invalid boolean value for setting', { key, value: data.settings[key] });
          result.warnings.push(`Invalid boolean value for ${key}. Skipping.`);
          continue;
        }
        
        if (overwriteExisting || !currentSettings[key]) {
          settingsToImport[key] = data.settings[key];
          result.settingsImported++;
        } else {
          result.settingsSkipped++;
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
    
    if (Object.keys(settingsToImport).length > 0) {
      await chrome.storage.local.set(settingsToImport);
      log('Settings imported', { count: result.settingsImported });
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
        await chrome.storage.local.set({ extension_stats: data.statistics });
        result.statsImported = true;
        log('Statistics imported');
      } catch (error) {
        logError('Failed to import statistics', error);
        result.errors.push('Failed to import statistics: ' + error.message);
      }
    }
    
    // Import cache
    if (importCache && data.selectorCache) {
      try {
        // Validate cache structure
        if (typeof data.selectorCache !== 'object' || Array.isArray(data.selectorCache)) {
          throw new Error('Invalid cache structure: must be an object');
        }
        
        // Validate cache size
        const cacheSize = JSON.stringify(data.selectorCache).length;
        const maxCacheSize = 10 * 1024 * 1024; // 10MB limit
        if (cacheSize > maxCacheSize) {
          throw new Error(`Cache is too large (${Math.round(cacheSize / 1024 / 1024)}MB). Maximum size is ${Math.round(maxCacheSize / 1024 / 1024)}MB.`);
        }
        
        await chrome.storage.local.set({ selector_cache: data.selectorCache });
        result.cacheImported = true;
        const domainCount = Object.keys(data.selectorCache).length;
        log('Selector cache imported', { domains: domainCount });
      } catch (error) {
        logError('Failed to import cache', error);
        result.errors.push('Failed to import cache: ' + error.message);
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
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
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
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

