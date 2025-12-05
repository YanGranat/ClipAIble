// Settings import/export module

import { log, logError } from '../utils/logging.js';
import { exportStats } from '../stats/index.js';
import { getCacheStats } from '../cache/selectors.js';

// Settings that can be exported/imported
// NOTE: API keys are NEVER included for security reasons
const STORAGE_KEYS_TO_EXPORT = [
  // AI settings
  'openai_model',
  'extraction_mode',
  'use_selector_cache',
  
  // Output settings
  'output_format',
  'generate_toc',
  'generate_abstract',
  'page_mode',
  'pdf_language',
  'translate_images',
  
  // Audio settings
  'audio_voice',
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
  'popup_theme'
];

// API key names - ALWAYS excluded from export for security
const API_KEY_NAMES = [
  'openai_api_key',
  'claude_api_key', 
  'gemini_api_key',
  'google_api_key'
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
      version: '2.6.0',
      exportDate: new Date().toISOString(),
      settings: {}
    };
    
    // Copy settings (exclude empty values)
    // Note: API keys are NOT in STORAGE_KEYS_TO_EXPORT, so they're never exported
    for (const key of STORAGE_KEYS_TO_EXPORT) {
      if (settings[key] !== undefined && settings[key] !== null && settings[key] !== '') {
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
      }
    }
    
    // Add cache if requested
    if (includeCache) {
      try {
        const cacheStats = await getCacheStats();
        // Get full cache data
        const cacheResult = await chrome.storage.local.get(['selector_cache']);
        if (cacheResult.selector_cache) {
          exportData.selectorCache = cacheResult.selector_cache;
          log('Selector cache included in export', { 
            domains: Object.keys(cacheResult.selector_cache).length 
          });
        }
      } catch (error) {
        logError('Failed to export cache', error);
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
    
    const data = JSON.parse(jsonData);
    
    if (!data.settings) {
      throw new Error('Invalid export file: missing settings');
    }
    
    const result = {
      settingsImported: 0,
      settingsSkipped: 0,
      statsImported: false,
      cacheImported: false,
      errors: []
    };
    
    // Import settings
    const currentSettings = await chrome.storage.local.get(STORAGE_KEYS_TO_EXPORT);
    const settingsToImport = {};
    
    for (const key of STORAGE_KEYS_TO_EXPORT) {
      // Security: Skip any API keys that might be in the import file
      if (API_KEY_NAMES.includes(key)) {
        log('Skipping API key import for security', { key });
        continue;
      }
      
      if (data.settings[key] !== undefined) {
        if (overwriteExisting || !currentSettings[key]) {
          settingsToImport[key] = data.settings[key];
          result.settingsImported++;
        } else {
          result.settingsSkipped++;
        }
      }
    }
    
    // Security: Double-check that no API keys are being imported
    for (const apiKey of API_KEY_NAMES) {
      if (settingsToImport[apiKey]) {
        delete settingsToImport[apiKey];
        log('Removed API key from import for security', { key: apiKey });
      }
    }
    
    if (Object.keys(settingsToImport).length > 0) {
      await chrome.storage.local.set(settingsToImport);
      log('Settings imported', { count: result.settingsImported });
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
export function downloadSettings(jsonData, filename = 'webpage-to-pdf-settings.json') {
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

