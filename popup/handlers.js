// @ts-check
// Event handlers for popup
// This module contains all event listeners setup

import { setupAllApiKeyToggles } from './handlers/api-keys.js';
import { setupPanelHandlers } from './handlers/panels.js';
import { setupFormatHandlers } from './handlers/format.js';
import { setupStyleHandlers } from './handlers/style.js';
import { setupModelHandlers } from './handlers/model.js';
import { setupAudioHandlers } from './handlers/audio.js';
import { setupSummaryHandlers } from './handlers/summary.js';
import { setupThemeHandlers } from './handlers/theme.js';
import { setupTtsKeyHandlers } from './handlers/tts-keys.js';
import { CONFIG } from '../../scripts/utils/config.js';

/**
 * @typedef {Object} WindowWithModules
 * @property {Object} [settingsModule]
 * @property {boolean} [customSelectClickHandlerAdded]
 */

/**
 * @typedef {Object} Scheduler
 * @property {function(Function, {priority?: string}): void} postTask
 */

/**
 * @type {WindowWithModules & typeof globalThis}
 */
// @ts-ignore - window is extended with modules at runtime
const windowWithModules = window;

/**
 * @type {Scheduler | undefined}
 */
// @ts-ignore - scheduler is a browser API that may not be available
const scheduler = typeof self !== 'undefined' && 'scheduler' in self ? self.scheduler : undefined;

/**
 * Initialize handlers module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Object} deps.STYLE_PRESETS - Style presets object
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.showToast - Show toast notification function
 * @param {Function} deps.decryptApiKey - Decrypt API key function
 * @param {Function} deps.maskApiKey - Mask API key function
 * @param {Function} deps.encryptApiKey - Encrypt API key function
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.getUILanguage - Get UI language function
 * @param {Function} deps.setUILanguage - Set UI language function
 * @param {Object} deps.UI_LOCALES - UI locales object
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.loadAndDisplayStats - Load and display stats function
 * @param {Function} deps.applyTheme - Apply theme function
 * @param {Function} deps.applyLocalization - Apply localization function
 * @param {Function} deps.initAllCustomSelects - Initialize all custom selects function
 * @param {Function} deps.handleSavePdf - Handle save PDF function (from core)
 * @param {Function} deps.handleCancel - Handle cancel function (from core)
 * @param {Function} deps.handleGenerateSummary - Handle generate summary function (from core)
 * @param {Function} deps.toggleSummary - Toggle summary function (from core)
 * @param {Function} deps.copySummary - Copy summary function (from core)
 * @param {Function} deps.downloadSummary - Download summary function (from core)
 * @param {Function} deps.closeSummary - Close summary function (from core)
 * @param {Object} [deps.settingsModule] - Settings module (optional, for accessing settings functions)
 * @returns {Function} setupEventListeners function
 */
export function initHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    STYLE_PRESETS,
    log,
    logError,
    logWarn,
    showToast,
    decryptApiKey,
    maskApiKey,
    encryptApiKey,
    t,
    getUILanguage,
    setUILanguage,
    UI_LOCALES,
    debouncedSaveSettings,
    loadAndDisplayStats,
    applyTheme,
    applyLocalization,
    initAllCustomSelects,
    handleSavePdf,
    handleCancel,
    handleGenerateSummary,
    toggleSummary,
    copySummary,
    downloadSummary,
    closeSummary,
    settingsModule
  } = deps;

  /**
   * Helper: Defer async work to avoid blocking UI
   * Uses scheduler.postTask if available, otherwise setTimeout
   * @param {Function} fn - Async function to execute
   */
  function deferAsyncWork(fn) {
    if (scheduler && scheduler.postTask) {
      scheduler.postTask(fn, { priority: 'user-blocking' });
    } else {
      setTimeout(fn, CONFIG.UI_ASYNC_DEFER_DELAY);
    }
  }

  /**
   * Helper: Create a change handler that saves setting and optionally updates UI
   * @param {string} storageKey - Storage key to save
   * @param {Function} getValue - Function to get value from element
   * @param {Function} [updateUI] - Optional async function to update UI after save
   * @returns {Function} Event handler function
   */
  function createSettingChangeHandler(storageKey, getValue, updateUI = null) {
    return () => {
      const value = getValue();
      if (updateUI) {
        debouncedSaveSettings(storageKey, value, () => {
          deferAsyncWork(async () => {
            await updateUI();
          });
        });
      } else {
        debouncedSaveSettings(storageKey, value);
      }
    };
  }

  /**
   * Helper: Create a checkbox change handler that saves setting immediately
   * Uses scheduler.postTask for better performance
   * @param {string} storageKey - Storage key to save
   * @param {Function} getValue - Function to get value from checkbox
   * @param {Function} [onError] - Optional error handler
   * @returns {Function} Event handler function
   */
  function createCheckboxChangeHandler(storageKey, getValue, onError = null) {
    return (e) => {
      const value = getValue();
      deferAsyncWork(async () => {
        try {
          await chrome.storage.local.set({ [storageKey]: value });
        } catch (error) {
          if (onError) {
            onError(error);
          } else {
            logError(`Failed to save ${storageKey}`, error);
          }
        }
      });
    };
  }

  /**
   * Setup all event listeners for popup
   */
  function setupEventListeners() {
    log('setupEventListeners: starting');
    
    // ============================================
    // API KEY TOGGLE HANDLERS
    // ============================================
    // Setup all API key toggle handlers (show/hide functionality)
    // Note: Some handlers (ElevenLabs, Qwen, Respeecher, Google TTS) show toast on error
    setupAllApiKeyToggles(elements, decryptApiKey, maskApiKey, logError, showToast, t);
    
    // ============================================
    // PANEL HANDLERS (Settings, Stats, Import/Export)
    // ============================================
    setupPanelHandlers({
      elements,
      log,
      logError,
      logWarn,
      showToast,
      t,
      getUILanguage,
      UI_LOCALES,
      loadAndDisplayStats,
      deferAsyncWork,
      settingsModule
    });
    
    // ============================================
    // FORMAT HANDLERS (Output format, TOC, Abstract, Language, Translate Images)
    // ============================================
    setupFormatHandlers({
      elements,
      STORAGE_KEYS,
      debouncedSaveSettings,
      deferAsyncWork,
      settingsModule
    });
    
    // ============================================
    // STYLE HANDLERS (Presets, Fonts, Colors, Reset)
    // ============================================
    setupStyleHandlers({
      elements,
      STORAGE_KEYS,
      STYLE_PRESETS,
      debouncedSaveSettings,
      deferAsyncWork,
      settingsModule
    });
    
    // ============================================
    // MODEL HANDLERS (Model select, Custom dropdown, Add model)
    // ============================================
    setupModelHandlers({
      elements,
      STORAGE_KEYS,
      debouncedSaveSettings,
      settingsModule
    });
    
    // ============================================
    // AUDIO HANDLERS (Provider, Voice, Speed, Provider-specific settings)
    // ============================================
    setupAudioHandlers({
      elements,
      STORAGE_KEYS,
      debouncedSaveSettings,
      log,
      logError,
      logWarn,
      settingsModule
    });
    
    // ============================================
    // SUMMARY HANDLERS (Generate, Toggle, Copy, Download, Close)
    // ============================================
    setupSummaryHandlers({
      elements,
      handleGenerateSummary,
      toggleSummary,
      copySummary,
      downloadSummary,
      closeSummary
    });
    
    // ============================================
    // THEME HANDLERS (Theme, Language)
    // ============================================
    setupThemeHandlers({
      elements,
      STORAGE_KEYS,
      debouncedSaveSettings,
      applyTheme,
      setUILanguage,
      applyLocalization,
      initAllCustomSelects,
      settingsModule
    });
    
    // ============================================
    // TTS API KEY SAVE HANDLERS (ElevenLabs, Qwen, Respeecher, Google TTS)
    // ============================================
    setupTtsKeyHandlers({
      elements,
      STORAGE_KEYS,
      encryptApiKey,
      maskApiKey,
      logError,
      showToast,
      t
    });
    
    // ============================================
    // REMAINING HANDLERS (API Provider, Save API Key, Mode, Cache, Stats, Processing)
    // ============================================

    // API provider selector change handler - optimize to avoid blocking
    if (elements.apiProviderSelect) {
      elements.apiProviderSelect.addEventListener('change', async () => {
        // Close custom dropdown immediately (lightweight operation)
        if (elements.customModelDropdown) {
          requestAnimationFrame(() => {
            elements.customModelDropdown.style.display = 'none';
          });
        }
        const provider = elements.apiProviderSelect.value;
        
        // Defer heavy async work to avoid blocking main thread
        deferAsyncWork(async () => {
          // Save selected provider
          await chrome.storage.local.set({ [STORAGE_KEYS.API_PROVIDER]: provider });
          
          // Load API key for selected provider
          const result = await chrome.storage.local.get([
            STORAGE_KEYS.API_KEY,
            STORAGE_KEYS.CLAUDE_API_KEY,
            STORAGE_KEYS.GEMINI_API_KEY,
            STORAGE_KEYS.GROK_API_KEY,
            STORAGE_KEYS.OPENROUTER_API_KEY
          ]);
          
          let apiKeyValue = '';
          let apiKeyEncrypted = null;
          
          if (provider === 'openai' && result[STORAGE_KEYS.API_KEY]) {
            try {
              const decrypted = await decryptApiKey(result[STORAGE_KEYS.API_KEY]);
              apiKeyValue = maskApiKey(decrypted);
              apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
            } catch (error) {
              logError('Failed to decrypt OpenAI API key', error);
              apiKeyValue = maskApiKey(result[STORAGE_KEYS.API_KEY]);
              apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
            }
          } else if (provider === 'claude' && result[STORAGE_KEYS.CLAUDE_API_KEY]) {
            try {
              const decrypted = await decryptApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
              apiKeyValue = maskApiKey(decrypted);
              apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
            } catch (error) {
              logError('Failed to decrypt Claude API key', error);
              apiKeyValue = maskApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
              apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
            }
          } else if (provider === 'gemini' && result[STORAGE_KEYS.GEMINI_API_KEY]) {
            try {
              const decrypted = await decryptApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
              apiKeyValue = maskApiKey(decrypted);
              apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
            } catch (error) {
              logError('Failed to decrypt Gemini API key', error);
              apiKeyValue = maskApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
              apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
            }
          } else if (provider === 'grok' && result[STORAGE_KEYS.GROK_API_KEY]) {
            try {
              const decrypted = await decryptApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
              apiKeyValue = maskApiKey(decrypted);
              apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
            } catch (error) {
              logError('Failed to decrypt Grok API key', error);
              apiKeyValue = maskApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
              apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
            }
          } else if (provider === 'openrouter' && result[STORAGE_KEYS.OPENROUTER_API_KEY]) {
            try {
              const decrypted = await decryptApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
              apiKeyValue = maskApiKey(decrypted);
              apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
            } catch (error) {
              logError('Failed to decrypt OpenRouter API key', error);
              apiKeyValue = maskApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
              apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
            }
          }
          
          // Defer DOM updates to requestAnimationFrame
          requestAnimationFrame(() => {
            if (elements.apiKey) {
              elements.apiKey.value = apiKeyValue;
              if (apiKeyEncrypted) {
                elements.apiKey.dataset.encrypted = apiKeyEncrypted;
              } else {
                delete elements.apiKey.dataset.encrypted;
              }
              // Reset to password type when switching
              elements.apiKey.type = 'password';
              if (elements.toggleApiKey) {
                const eyeIcon = elements.toggleApiKey.querySelector('.eye-icon');
                if (eyeIcon) {
                  eyeIcon.textContent = '👁';
                }
              }
            }
          });
          
          // Update UI (label, placeholder) - defer async work
          if (settingsModule) {
            settingsModule.updateApiProviderUI().catch(error => {
              logError('Failed to update API provider UI', error);
            });
          }
        }, 0);
      });
    }

    if (elements.saveApiKey) {
      elements.saveApiKey.addEventListener('click', () => {
        if (settingsModule) {
          settingsModule.saveApiKey();
        }
      });
    }

    // Mode, cache, and stats handlers
    if (elements.modeSelect) {
      elements.modeSelect.addEventListener('change', createSettingChangeHandler(
        STORAGE_KEYS.MODE,
        () => elements.modeSelect.value,
        async () => {
          if (settingsModule) {
            await settingsModule.updateModeHint();
            settingsModule.updateCacheVisibility();
          }
        }
      ));
    }

    if (elements.useCache) {
      elements.useCache.addEventListener('change', createCheckboxChangeHandler(
        STORAGE_KEYS.USE_CACHE,
        () => elements.useCache.checked,
        (error) => logError('Failed to save use_selector_cache setting', error)
      ), { passive: true });
    }
    
    if (elements.enableCache) {
      elements.enableCache.addEventListener('change', createCheckboxChangeHandler(
        STORAGE_KEYS.ENABLE_CACHE,
        () => elements.enableCache.checked,
        (error) => logError('Failed to save enable_selector_caching setting', error)
      ), { passive: true });
    }
    
    if (elements.enableStats) {
      elements.enableStats.addEventListener('change', async (e) => {
        const value = elements.enableStats.checked;
        
        log('enableStats changed', {
          value,
          valueType: typeof value,
          timestamp: Date.now()
        });
        
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: value });
          
          const verifyResult = await chrome.storage.local.get([STORAGE_KEYS.ENABLE_STATS]);
          const savedValue = verifyResult[STORAGE_KEYS.ENABLE_STATS];
          
          log('enableStats saved', {
            value,
            savedValue,
            savedValueType: typeof savedValue,
            match: value === savedValue,
            timestamp: Date.now()
          });
          
          if (value !== savedValue) {
            logError('enableStats value mismatch after save', {
              expected: value,
              actual: savedValue
            });
          }
        } catch (error) {
          logError('Failed to save enable_statistics setting', error);
        }
      }, { passive: true });
    }

    // Processing handlers (Save PDF, Cancel)
    if (elements.savePdfBtn) {
      log('=== setupEventListeners: Adding click handler to savePdfBtn ===', {
        hasButton: !!elements.savePdfBtn,
        hasHandler: typeof handleSavePdf === 'function',
        timestamp: Date.now()
      });
      elements.savePdfBtn.addEventListener('click', () => {
        log('=== savePdfBtn: CLICK EVENT FIRED ===', {
          timestamp: Date.now()
        });
        handleSavePdf();
      });
    } else {
      logError('=== setupEventListeners: savePdfBtn not found ===', {
        timestamp: Date.now()
      });
    }
    if (elements.cancelBtn) {
      elements.cancelBtn.addEventListener('click', handleCancel);
    }
    
    log('setupEventListeners: completed successfully');
  }

  return {
    // @ts-ignore - setupEventListeners is a function
    setupEventListeners
  };
}
