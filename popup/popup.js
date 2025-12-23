// @ts-check
// Popup script for ClipAIble extension
//
// @typedef {import('../scripts/types.js').WindowWithModules} WindowWithModules
//
// UI VISIBILITY MANAGEMENT STRUCTURE:
// ====================================
// 1. updateOutputFormatUI() - MASTER FUNCTION
//    - Called when output format changes (PDF/EPUB/FB2/Markdown/Audio)
//    - Handles format-specific visibility (PDF style, audio fields, TOC/abstract)
//    - Calls updateAudioProviderUI() if format is 'audio'
//    - Calls updateTranslationVisibility() for translation settings
//
// 2. updateAudioProviderUI() - AUDIO PROVIDER FUNCTION
//    - Called when audio provider changes OR when format changes to 'audio'
//    - Shows/hides provider-specific fields (API keys, models, voices, etc.)
//    - Safety check: hides all audio fields if format is not 'audio'
//
// 3. hideAllAudioFields() - CENTRALIZED HIDING FUNCTION
//    - Hides ALL audio-related fields (provider selector, API keys, settings)
//    - Used when format is not 'audio' (PDF/EPUB/FB2/Markdown)
//    - Ensures consistency - no audio fields visible for non-audio formats
//
// 4. updateTranslationVisibility() - TRANSLATION FUNCTION
//    - Shows/hides translation-related UI (image translation, Google API key)
//    - Hides image translation for audio format
//
// IMPORTANT RULES:
// - updateOutputFormatUI() must be called LAST in loadSettings() (it's the master function)
// - updateAudioProviderUI() should NOT be called directly in loadSettings() (called by updateOutputFormatUI)
// - hideAllAudioFields() is called as final safety check after updateOutputFormatUI()
// - All audio fields must be hidden when format is not 'audio' (no exceptions)

import { encryptApiKey, decryptApiKey, maskApiKey, isEncrypted, isMaskedKey } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, setUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logError as originalLogError, logWarn, logDebug } from '../scripts/utils/logging.js';
import { CONFIG } from '../scripts/utils/config.js';
import { RESPEECHER_CONFIG } from '../scripts/api/respeecher.js';
import { AUDIO_CONFIG } from '../scripts/generation/audio-prep.js';
import { getProviderFromModel, callAI } from '../scripts/api/index.js';
import { detectVideoPlatform } from '../scripts/utils/video.js';
import { processSubtitlesWithAI } from '../scripts/extraction/video-processor.js';
import { sanitizeMarkdownHtml, escapeHtml as escapeHtmlUtil } from '../scripts/utils/html.js';
import { initUI } from './ui.js';
import { initStats } from './stats.js';
import { initSettings } from './settings.js';
import { initCore } from './core.js';
import { initHandlers } from './handlers.js';
import { initializeDOMElements, initializeModules, finalizeInitialization } from './utils/init-helpers.js';
import { STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS, MODE_HINTS } from './constants.js';
import { getElement, setElementDisplay, setElementGroupDisplay, setDisplayForIds } from './utils/dom-helpers.js';
import { markdownToHtml, formatTime, escapeHtml, formatRelativeDate } from './utils/format-helpers.js';
import { debouncedSaveSettings, saveAudioVoice } from './utils/settings-helpers.js';
import { startTimerDisplay, stopTimerDisplay, updateTimerDisplay } from './utils/timer-helpers.js';

// Function to send error to service worker for centralized logging
async function sendErrorToServiceWorker(message, error, context = {}) {
  try {
    // Import sanitizeErrorForLogging for stack trace sanitization
    const { sanitizeErrorForLogging } = await import('../scripts/utils/security.js');
    
    // Sanitize error before sending (removes sensitive information from stack traces)
    const sanitizedError = error ? sanitizeErrorForLogging(error) : null;
    
    const errorData = {
      message: message,
      error: sanitizedError ? {
        name: sanitizedError.name,
        message: sanitizedError.message,
        stack: sanitizedError.stack,
        ...(sanitizedError.code && { code: sanitizedError.code })
      } : null,
      context: context,
      source: 'popup',
      timestamp: Date.now(),
      url: window.location.href
    };
    
    // Send to service worker (fire and forget - don't wait for response)
    chrome.runtime.sendMessage({
      action: 'logError',
      data: errorData
    }).catch(() => {
      // Ignore errors when sending error report (to avoid infinite loop)
    });
  } catch (sendError) {
    // CRITICAL: Fallback to console.error if sending to service worker fails
    // This is the only place where console.error is acceptable in sendErrorToServiceWorker
    // It's a fallback when the service worker is unavailable
    try {
      if (typeof originalLogError === 'function') {
        originalLogError('Failed to send error to service worker', sendError);
      } else {
        console.error('[ClipAIble] Failed to send error to service worker', sendError);
      }
    } catch (loggingError) {
      // Ultimate fallback if even error logging fails
      console.error('[ClipAIble] Failed to send error to service worker', sendError);
      console.error('[ClipAIble] Failed to log sendError failure:', loggingError);
    }
  }
}

// Enhanced logError that also sends to service worker
const enhancedLogError = function(message, error = null) {
  // Call original logError
  originalLogError(message, error);
  
  // Also send to service worker
  sendErrorToServiceWorker(message, error, {
    source: 'popup.logError'
  });
};

// Replace logError with enhanced version
const logError = enhancedLogError;

// Global error handler for uncaught errors
// Uses logError with fallback to console.error if logging system is not yet initialized
window.addEventListener('error', (event) => {
  const errorMessage = `Global error handler caught error: ${event.message || 'Unknown error'}`;
  
  try {
    if (typeof logError === 'function') {
      logError(errorMessage, event.error);
      if (event.filename || event.lineno) {
        logError('Error location', new Error(`File: ${event.filename || 'unknown'}, Line: ${event.lineno || 'unknown'}, Col: ${event.colno || 'unknown'}`));
      }
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      console.error('[ClipAIble] popup.js:', errorMessage, event.error, event.filename, event.lineno);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    console.error('[ClipAIble] popup.js:', errorMessage, event.error, event.filename, event.lineno);
    console.error('[ClipAIble] Failed to log error:', loggingError);
  }
  
  // Always try to send to service worker for centralized logging
  sendErrorToServiceWorker(errorMessage, event.error, {
    source: 'popup.globalError',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Global error handler for unhandled promise rejections
// Uses logError with fallback to console.error if logging system is not yet initialized
window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = `Unhandled promise rejection: ${event.reason?.message || String(event.reason)}`;
  const error = event.reason instanceof Error 
    ? event.reason 
    : new Error(String(event.reason));
  
  try {
    if (typeof logError === 'function') {
      logError(errorMessage, error);
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      console.error('[ClipAIble] popup.js:', errorMessage, event.reason);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    console.error('[ClipAIble] popup.js:', errorMessage, event.reason);
    console.error('[ClipAIble] Failed to log rejection:', loggingError);
  }
  
  // Always try to send to service worker for centralized logging
  sendErrorToServiceWorker(errorMessage, error, {
    source: 'popup.unhandledRejection'
  });
});


// DOM Elements
const elements = {
  apiProviderSelect: null,
  apiKey: null,
  apiKeyLabel: null,
  apiKeyInputGroup: null,
  toggleApiKey: null,
  claudeApiKey: null,
  toggleClaudeApiKey: null,
  geminiApiKey: null,
  toggleGeminiApiKey: null,
  googleApiKey: null,
  toggleGoogleApiKey: null,
  googleApiGroup: null,
  saveGoogleApiKey: null,
  saveApiKey: null,
  savePdfBtn: null,
  saveIcon: null,
  saveText: null,
  mainFormatSelect: null,
  cancelBtn: null,
  generateSummaryBtn: null,
  summaryContainer: null,
  summaryToggle: null,
  summaryContent: null,
  summaryText: null,
  summaryCopyBtn: null,
  summaryDownloadBtn: null,
  summaryCloseBtn: null,
  toggleSettings: null,
  settingsPanel: null,
  toggleStats: null,
  statsPanel: null,
  modeSelect: null,
  modeHint: null,
  useCache: null,
  useCacheGroup: null,
  modelSelect: null,
  addModelBtn: null,
  customModelDropdown: null,
  customModelOptions: null,
  addModelDialog: null,
  addModelInput: null,
  addModelConfirm: null,
  addModelCancel: null,
  outputFormat: null,
  generateToc: null,
  generateAbstract: null,
  pageMode: null,
  pageModeGroup: null,
  languageSelect: null,
  translateImages: null,
  translateImagesGroup: null,
  stylePreset: null,
  fontFamily: null,
  fontFamilyContainer: null,
  fontFamilyTrigger: null,
  fontFamilyValue: null,
  fontFamilyOptions: null,
  fontSize: null,
  bgColor: null,
  bgColorText: null,
  textColor: null,
  textColorText: null,
  headingColor: null,
  headingColorText: null,
  linkColor: null,
  linkColorText: null,
  resetStylesBtn: null,
  clearStatsBtn: null,
  clearCacheBtn: null,
  enableCache: null,
  enableStats: null,
  exportSettingsBtn: null,
  importSettingsBtn: null,
  importFileInput: null,
  statusDot: null,
  statusText: null,
  progressContainer: null,
  progressBar: null,
  progressText: null,
  themeSelect: null,
  uiLanguageSelect: null,
  audioProvider: null,
  audioProviderGroup: null,
  elevenlabsApiKey: null,
  toggleElevenlabsApiKey: null,
  saveElevenlabsApiKey: null,
  elevenlabsApiKeyGroup: null,
  elevenlabsModel: null,
  elevenlabsModelGroup: null,
  elevenlabsFormat: null,
  elevenlabsFormatGroup: null,
  qwenApiKey: null,
  toggleQwenApiKey: null,
  saveQwenApiKey: null,
  qwenApiKeyGroup: null,
  respeecherApiKey: null,
  toggleRespeecherApiKey: null,
  saveRespeecherApiKey: null,
  respeecherApiKeyGroup: null,
  respeecherAdvancedGroup: null,
  respeecherTemperature: null,
  respeecherTemperatureValue: null,
  respeecherRepetitionPenalty: null,
  respeecherRepetitionPenaltyValue: null,
  respeecherTopP: null,
  respeecherTopPValue: null,
  googleTtsApiKey: null,
  toggleGoogleTtsApiKey: null,
  saveGoogleTtsApiKey: null,
  googleTtsApiKeyGroup: null,
  audioVoice: null,
  audioVoiceGroup: null,
  audioSpeed: null,
  audioSpeedGroup: null,
  audioSpeedValue: null
};

// State polling timeout
const statePollingTimeoutRef = { current: null };

// Timer interval for display updates
const timerIntervalRef = { current: null };

// Current start time from background (persists across popup reopens)
const currentStartTimeRef = { current: null };
let audioVoiceMap = {};

// State references for core module
const stateRefs = {
  statePollingTimeout: statePollingTimeoutRef,
  timerInterval: timerIntervalRef,
  currentStartTime: currentStartTimeRef
};

// Helper functions for safe element access and manipulation
// Wrapped to pass elements object
function getElementLocal(key) {
  return getElement(key, elements);
}

function setElementDisplayLocal(key, displayValue) {
  return setElementDisplay(key, displayValue, elements);
}

function setElementGroupDisplayLocal(key, displayValue) {
  return setElementGroupDisplay(key, displayValue, elements);
}

// Wrapped functions to pass required parameters
function startTimerDisplayLocal(startTime) {
  return startTimerDisplay(startTime, currentStartTimeRef, timerIntervalRef, elements);
}

function stopTimerDisplayLocal() {
  return stopTimerDisplay(currentStartTimeRef, timerIntervalRef);
}

function updateTimerDisplayLocal() {
  return updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements);
}

function saveAudioVoiceLocal(provider, voice) {
  return saveAudioVoice(provider, voice, audioVoiceMap);
}

// Apply UI localization (kept for backward compatibility, now uses uiModule)
async function applyLocalization() {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.uiModule) {
    return windowWithModules.uiModule.applyLocalization();
  }
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  
  // Apply translations to elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    if (!(element instanceof HTMLElement)) return;
    const key = element.getAttribute('data-i18n');
    const translation = locale[key] || UI_LOCALES.en[key] || key;
    
    if (element instanceof HTMLInputElement && (element.type === 'text' || element.type === 'password')) {
      // For inputs, check if they have a separate placeholder key
      if (element.hasAttribute('data-i18n-placeholder')) {
        const placeholderKey = element.getAttribute('data-i18n-placeholder');
        element.placeholder = locale[placeholderKey] || UI_LOCALES.en[placeholderKey] || '';
      } else {
        element.placeholder = translation;
      }
    } else if (element instanceof HTMLOptionElement) {
      // Options are handled separately
    } else {
      element.textContent = translation;
    }
  });
  
  // Handle elements with only data-i18n-placeholder (no data-i18n)
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    if (!(element instanceof HTMLInputElement)) return;
    if (!element.hasAttribute('data-i18n')) {
      const placeholderKey = element.getAttribute('data-i18n-placeholder');
      element.placeholder = locale[placeholderKey] || UI_LOCALES.en[placeholderKey] || '';
    }
  });
  
  // Handle select options with data-i18n
  document.querySelectorAll('select option[data-i18n]').forEach(option => {
    const key = option.getAttribute('data-i18n');
    const translation = locale[key] || UI_LOCALES.en[key] || key;
    option.textContent = translation;
  });
  
  // Update custom select options after localization
  document.querySelectorAll('.custom-select').forEach(container => {
    const select = container.querySelector('select');
    if (!select) return;
    
    const optionsDiv = container.querySelector('.custom-select-options');
    const valueSpan = container.querySelector('.custom-select-value');
    if (!optionsDiv || !valueSpan) return;
    
    // Update custom options from native select
    const customOptions = optionsDiv.querySelectorAll('.custom-select-option');
    Array.from(select.options).forEach((nativeOption, index) => {
      const customOption = customOptions[index];
      if (customOption) {
        customOption.textContent = nativeOption.textContent;
        if (nativeOption.selected || select.value === nativeOption.value) {
          customOption.classList.add('selected');
          valueSpan.textContent = nativeOption.textContent;
        } else {
          customOption.classList.remove('selected');
        }
      }
    });
  });
  
  // Update select options for language selector (header version - short codes)
  if (elements.uiLanguageSelect) {
    // Keep short codes (EN, RU, etc.) for header selector
    // Only update selected value if needed
    const currentValue = elements.uiLanguageSelect.value;
    if (currentValue !== langCode) {
      elements.uiLanguageSelect.value = langCode;
    }
  }
  
  // Update title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    if (!(element instanceof HTMLElement)) return;
    const key = element.getAttribute('data-i18n-title');
    element.title = locale[key] || UI_LOCALES.en[key] || key;
  });
  
  // Update aria-label attributes
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria-label');
    element.setAttribute('aria-label', locale[key] || UI_LOCALES.en[key] || key);
  });
  
  // Update specific dynamic elements
  if (elements.modeHint) {
    const mode = elements.modeSelect?.value || 'selector';
    elements.modeHint.textContent = mode === 'selector' 
      ? (locale.extractionModeHint || UI_LOCALES.en.extractionModeHint)
      : (locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract);
  }
  
  // Update output format button text
  if (elements.saveText) {
    // Button text is always "Save" now, format is selected in dropdown
    elements.saveText.textContent = locale.save || UI_LOCALES.en.save || 'Save';
  }
  
  // Update document language
  document.documentElement.lang = langCode;
}

// DEPRECATED: applyTheme function removed - use uiModule.applyTheme() instead
// This is a temporary stub for backward compatibility during initialization
// It will be replaced by uiModule.applyTheme() after modules are initialized
function applyTheme() {
  // This function is a stub - actual implementation is in uiModule
  // It's only used during module initialization, after which uiModule.applyTheme() is used
  const windowWithModules = window;
  if (windowWithModules.uiModule && windowWithModules.uiModule.applyTheme) {
    return windowWithModules.uiModule.applyTheme();
  }
  // Fallback: basic theme application if uiModule not yet available
  if (!elements.themeSelect) {
    return;
  }
  const theme = elements.themeSelect.value;
  let actualTheme = theme;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    actualTheme = prefersDark ? 'dark' : 'light';
  }
  document.body.setAttribute('data-theme', actualTheme);
  document.documentElement.setAttribute('data-theme', actualTheme);
}

// Initialize popup
async function init() {
  log('popup.js: init() started');
  
  try {
    // Initialize DOM elements
    initializeDOMElements(elements);
    
    // Initialize all modules
    const modules = initializeModules({
      elements,
      formatTime,
      startTimerDisplay: startTimerDisplayLocal,
      getElement: getElementLocal,
      setElementDisplay: setElementDisplayLocal,
      setElementGroupDisplay: setElementGroupDisplayLocal,
      setDisplayForIds,
      currentStartTimeRef,
      timerIntervalRef,
      showToast,
      STORAGE_KEYS,
      DEFAULT_STYLES,
      STYLE_PRESETS,
      debouncedSaveSettings,
      saveAudioVoice: saveAudioVoiceLocal,
      setCustomSelectValue,
      applyTheme,
      markdownToHtml,
      audioVoiceMap,
      t,
      getUILanguage,
      setUILanguage,
      UI_LOCALES,
      loadAndDisplayStats,
      applyLocalization,
      initAllCustomSelects,
      logError,
      log,
      logWarn,
      setStatus,
      setProgress,
      stopTimerDisplay: stopTimerDisplayLocal,
      decryptApiKey,
      maskApiKey,
      encryptApiKey,
      getProviderFromModel,
      detectVideoPlatform,
      sanitizeMarkdownHtml,
      CONFIG,
      stateRefs,
      initUI,
      initStats,
      initSettings,
      initCore,
      initHandlers
    });
    
    // Finalize initialization: load settings, apply localization, setup event listeners
    await finalizeInitialization(modules, initAllCustomSelects);
    
    // Store settingsModule reference for saveVoiceBeforeClose function
    // This allows saveVoiceBeforeClose to access settingsModule without using window object
    const settingsModuleRef = modules.settingsModule;
    
    // Override saveVoiceBeforeClose to use settingsModule from modules
    const originalSaveVoiceBeforeClose = saveVoiceBeforeClose;
    window.saveVoiceBeforeClose = async function() {
      // Use settingsModule from modules instead of window
      if (!isSavingSettings && elements.audioVoice && elements.audioProvider && settingsModuleRef && settingsModuleRef.saveAudioVoice) {
        isSavingSettings = true;
        try {
          const provider = elements.audioProvider.value || 'openai';
          const selectedIndex = elements.audioVoice.selectedIndex;
          const selectedOption = elements.audioVoice.options[selectedIndex];
          
          // CRITICAL: Use the same logic as saveAudioVoice - get voice ID from dataset.voiceId or option.value
          let voiceToSave = null;
          
          if (selectedOption) {
            // Priority 1: dataset.voiceId (most reliable)
            if (selectedOption.dataset && selectedOption.dataset.voiceId) {
              voiceToSave = selectedOption.dataset.voiceId;
            }
            // Priority 2: option.value (if not an index)
            else if (selectedOption.value && !/^\d+$/.test(String(selectedOption.value))) {
              voiceToSave = selectedOption.value;
            }
            // Priority 3: Use getVoiceIdByIndex if value is an index
            else if (selectedOption.value && /^\d+$/.test(String(selectedOption.value)) && settingsModuleRef.getVoiceIdByIndex) {
              voiceToSave = settingsModuleRef.getVoiceIdByIndex(provider, selectedIndex);
            }
          }
          
          // If still no valid voice, try to get from current value
          if (!voiceToSave && elements.audioVoice.value && !/^\d+$/.test(String(elements.audioVoice.value))) {
            voiceToSave = elements.audioVoice.value;
          }
          
          // Only save if we have a valid voice ID (not an index)
          if (voiceToSave && voiceToSave !== '' && !/^\d+$/.test(String(voiceToSave))) {
            // CRITICAL: Use saveAudioVoice from settings module - it handles audioVoiceMap correctly
            settingsModuleRef.saveAudioVoice(provider, voiceToSave);
            
            // CRITICAL: Also force immediate save (don't wait for debounce)
            // Get current audioVoiceMap from storage to ensure we have latest
            const storageResult = await chrome.storage.local.get([STORAGE_KEYS.AUDIO_VOICE_MAP]);
            let currentMap = storageResult[STORAGE_KEYS.AUDIO_VOICE_MAP] || {};
            
            // CRITICAL: Ensure format is correct (with 'current' property)
            if (!currentMap.current || typeof currentMap.current !== 'object' || Array.isArray(currentMap.current)) {
              // Convert old format to new format
              if (typeof currentMap === 'object' && !Array.isArray(currentMap) && !('current' in currentMap)) {
                currentMap = { current: { ...currentMap } };
              } else {
                currentMap = { current: {} };
              }
            }
            
            // Update the voice for the provider
            currentMap.current[provider] = voiceToSave;
            
            // Save immediately
            await chrome.storage.local.set({ [STORAGE_KEYS.AUDIO_VOICE_MAP]: currentMap });
          }
        } catch (error) {
          logError('Error saving voice before close', error);
        } finally {
          isSavingSettings = false;
        }
      }
    };
    
    log('popup.js: init() completed successfully');
  } catch (error) {
    // Use logError for centralized logging (console.error is redundant here)
    logError('CRITICAL: init() failed completely', error);
    // Show error to user
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const errorText = await t('errorCheckConsole');
      statusText.textContent = errorText;
    }
  }
}

// DEPRECATED: Model and API provider functions moved to popup/settings.js
// These functions are kept for backward compatibility but redirect to window.settingsModule
// Functions: formatModelLabel, updateModelList, showCustomModelDropdown, showAddModelDialog,
// addCustomModel, hideDefaultModel, removeCustomModel, updateApiProviderUI
// Use window.settingsModule.* instead

// loadSettings() moved to settings.js module
// Use window.settingsModule.loadSettings() instead

// setupEventListeners() moved to handlers.js module
// Use handlersModule() instead

// DEPRECATED: applyTheme function removed - use uiModule.applyTheme() instead

// Reset a single style setting to default
async function resetStyleSetting(type) {
  switch (type) {
    case 'fontFamily':
      elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
      setCustomSelectValue(DEFAULT_STYLES.fontFamily);
      await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
      break;
    case 'fontSize':
      elements.fontSize.value = DEFAULT_STYLES.fontSize;
      await chrome.storage.local.set({ [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize });
      break;
    case 'bgColor':
      elements.bgColor.value = DEFAULT_STYLES.bgColor;
      elements.bgColorText.value = DEFAULT_STYLES.bgColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor });
      break;
    case 'textColor':
      elements.textColor.value = DEFAULT_STYLES.textColor;
      elements.textColorText.value = DEFAULT_STYLES.textColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor });
      break;
    case 'headingColor':
      elements.headingColor.value = DEFAULT_STYLES.headingColor;
      elements.headingColorText.value = DEFAULT_STYLES.headingColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor });
      break;
    case 'linkColor':
      elements.linkColor.value = DEFAULT_STYLES.linkColor;
      elements.linkColorText.value = DEFAULT_STYLES.linkColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor });
      break;
  }
  const resetText = await t('resetToDefault');
  showToast(resetText, 'success');
}

// Reset all style settings to defaults
async function resetAllStyles() {
  elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
  setCustomSelectValue(DEFAULT_STYLES.fontFamily);
  elements.fontSize.value = DEFAULT_STYLES.fontSize;
  elements.bgColor.value = DEFAULT_STYLES.bgColor;
  elements.bgColorText.value = DEFAULT_STYLES.bgColor;
  elements.textColor.value = DEFAULT_STYLES.textColor;
  elements.textColorText.value = DEFAULT_STYLES.textColor;
  elements.headingColor.value = DEFAULT_STYLES.headingColor;
  elements.headingColorText.value = DEFAULT_STYLES.headingColor;
  elements.linkColor.value = DEFAULT_STYLES.linkColor;
  elements.linkColorText.value = DEFAULT_STYLES.linkColor;
  
  // Reset style preset to dark (default)
  elements.stylePreset.value = 'dark';
  const stylePresetContainer = document.getElementById('stylePresetContainer');
  if (stylePresetContainer) {
    const valueSpan = stylePresetContainer.querySelector('.custom-select-value');
    const selectedOption = stylePresetContainer.querySelector('[data-value="dark"]');
    if (valueSpan && selectedOption) {
      valueSpan.textContent = selectedOption.textContent;
      stylePresetContainer.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      selectedOption.classList.add('selected');
    }
  }
  
  await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
  await chrome.storage.local.set({
    [STORAGE_KEYS.STYLE_PRESET]: 'dark',
    [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize,
    [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor,
    [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor,
    [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor,
    [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor
  });
  
  const allStylesResetText = await t('allStylesReset');
  showToast(allStylesResetText, 'success');
}

// handleCancel() moved to core.js module

// handleGenerateSummary() moved to core.js module

// toggleSummary() moved to core.js module

// closeSummary() moved to core.js module

// copySummary() moved to core.js module

// downloadSummary() moved to core.js module

// Set custom font select value programmatically
function setCustomSelectValue(value) {
  const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
  options.forEach(opt => {
    opt.classList.remove('selected');
    if (opt.dataset.value === value) {
      opt.classList.add('selected');
      elements.fontFamilyValue.textContent = opt.textContent;
      elements.fontFamilyValue.style.fontFamily = opt.style.fontFamily;
    }
  });
}

// Universal function to convert native select to custom-select
function initCustomSelect(selectId, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) return null;
  
  // Skip if already converted
  if (select.closest('.custom-select')) return select.closest('.custom-select');
  
  // Create wrapper structure
  const container = document.createElement('div');
  container.className = 'custom-select';
  container.id = `${selectId}Container`;
  
  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.id = `${selectId}Trigger`;
  
  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select-value';
  valueSpan.id = `${selectId}Value`;
  
  const arrow = document.createElement('span');
  arrow.className = 'custom-select-arrow';
  arrow.textContent = '▾';
  
  trigger.appendChild(valueSpan);
  trigger.appendChild(arrow);
  
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'custom-select-options';
  optionsDiv.id = `${selectId}Options`;
  
  // Function to populate options
  const populateOptions = () => {
    optionsDiv.innerHTML = '';
    if (!(select instanceof HTMLSelectElement)) return;
    Array.from(select.options).forEach((option) => {
      const customOption = document.createElement('div');
      customOption.className = 'custom-select-option';
      customOption.dataset.value = option.value;
      
      // Preserve data-i18n attribute if present
      if (option.hasAttribute('data-i18n')) {
        customOption.setAttribute('data-i18n', option.getAttribute('data-i18n'));
      }
      
      customOption.textContent = option.textContent;
      if (option.selected || select.value === option.value) {
        customOption.classList.add('selected');
        valueSpan.textContent = option.textContent;
      }
      optionsDiv.appendChild(customOption);
    });
  };
  
  populateOptions();
  
  container.appendChild(trigger);
  container.appendChild(optionsDiv);
  
  // Replace select with container structure
  select.style.display = 'none';
  select.style.position = 'absolute';
  select.style.opacity = '0';
  select.style.pointerEvents = 'none';
  select.parentNode.insertBefore(container, select);
  container.appendChild(select);
  
  // Event handlers
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    
    // Close all other custom selects
    document.querySelectorAll('.custom-select.open').forEach(otherSelect => {
      if (otherSelect !== container) {
        otherSelect.classList.remove('open');
      }
    });
    
    // Close model dropdown if open
    if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
      elements.customModelDropdown.style.display = 'none';
    }
    
    // Toggle current select
    if (isOpen) {
      container.classList.remove('open');
    } else {
      container.classList.add('open');
    }
  });
  
  optionsDiv.addEventListener('click', (e) => {
    // Defer all work to avoid blocking main thread
    setTimeout(() => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const option = target.closest('.custom-select-option');
      if (!(option instanceof HTMLElement)) return;
      
      const value = option.dataset.value;
      if (!value) return;
      
      // Defer DOM updates to requestAnimationFrame
      requestAnimationFrame(() => {
        // Update native select
        if (select instanceof HTMLSelectElement) {
          select.value = value;
        }
        select.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Update display
        valueSpan.textContent = option.textContent;
        
        // Update selected state
        optionsDiv.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Close dropdown
        container.classList.remove('open');
        
        // Call custom callback if provided
        if (options.onChange) {
          options.onChange(value);
        }
      });
    }, 0);
  }, { passive: true });
  
  // Close dropdown when clicking outside (handled globally for all selects)
  
  // Sync with native select value changes
  select.addEventListener('change', () => {
    if (!(select instanceof HTMLSelectElement)) return;
    const selectedOption = optionsDiv.querySelector(`[data-value="${select.value}"]`);
    if (selectedOption instanceof HTMLElement) {
      valueSpan.textContent = selectedOption.textContent;
      optionsDiv.querySelectorAll('.custom-select-option').forEach(opt => {
        if (opt instanceof HTMLElement) {
          opt.classList.remove('selected');
        }
      });
      selectedOption.classList.add('selected');
    } else {
      // If option not found, repopulate (for dynamic selects)
      populateOptions();
    }
  });
  
  // Watch for option changes (for dynamic selects)
  const observer = new MutationObserver(() => {
    if (!(select instanceof HTMLSelectElement)) return;
    const currentValue = select.value;
    populateOptions();
    // Restore value after repopulation
    if (currentValue && select instanceof HTMLSelectElement) {
      select.value = currentValue;
      const selectedOption = optionsDiv.querySelector(`[data-value="${currentValue}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
        valueSpan.textContent = selectedOption.textContent;
      }
    }
  });
  observer.observe(select, { childList: true, subtree: true });
  
  return container;
}

// Initialize all custom selects
function initAllCustomSelects() {
  // List of select IDs to convert (excluding modelSelect which has its own custom dropdown)
  // outputFormat is hidden (moved to main screen as mainFormatSelect)
  const selectIds = [
    'apiProviderSelect',
    'modeSelect',
    'mainFormatSelect',
    'audioProvider',
    'elevenlabsModel',
    'elevenlabsFormat',
    'googleTtsModel',
    'googleTtsVoice',
    'audioVoice',
    'pageMode',
    'languageSelect',
    'stylePreset',
    'uiLanguageSelect',
    'themeSelect'
  ];
  
  selectIds.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select && !select.closest('.custom-select')) {
      initCustomSelect(selectId);
    }
  });
}

// DEPRECATED: UI visibility functions moved to popup/settings/ui-visibility.js
// These functions are kept for backward compatibility but redirect to window.settingsModule
// Functions: updateModeHint, updateCacheVisibility, hideAllAudioFields, updateOutputFormatUI
// Use window.settingsModule.* instead

// DEPRECATED: updateVoiceList function removed - use settingsModule.updateVoiceList() instead

// DEPRECATED: Audio provider UI and translation visibility functions moved to popup/settings/
// These functions are kept for backward compatibility but redirect to window.settingsModule
// Functions: updateAudioProviderUI, updateTranslationVisibility
// Use window.settingsModule.* instead

// Save API keys to storage
async function saveApiKey() {
  const provider = elements.apiProviderSelect?.value || 'openai';
  const apiKey = elements.apiKey.value.trim();
  
  // Check if main API key is provided (not masked)
  const hasKey = apiKey && !apiKey.startsWith('****');
  
  if (!hasKey) {
    const pleaseEnterKeyText = await t('pleaseEnterAtLeastOneApiKey');
    showToast(pleaseEnterKeyText, 'error');
    return;
  }

  const keysToSave = {};
  
  // Save selected provider
  keysToSave[STORAGE_KEYS.API_PROVIDER] = provider;
  
  // Save API key for selected provider
  if (apiKey) {
    // If masked (user didn't change it), keep existing encrypted value
    if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
      if (provider === 'openai') {
        keysToSave[STORAGE_KEYS.API_KEY] = elements.apiKey.dataset.encrypted;
      } else if (provider === 'claude') {
        keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = elements.apiKey.dataset.encrypted;
      } else if (provider === 'gemini') {
        keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = elements.apiKey.dataset.encrypted;
      } else if (provider === 'grok') {
        keysToSave[STORAGE_KEYS.GROK_API_KEY] = elements.apiKey.dataset.encrypted;
      } else if (provider === 'openrouter') {
        keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY] = elements.apiKey.dataset.encrypted;
      }
    } else if (!apiKey.startsWith('****')) {
      // New key provided, validate and encrypt
      if (provider === 'openai') {
        if (!apiKey.startsWith('sk-')) {
          const invalidOpenAiKeyText = await t('invalidOpenAiKeyFormat');
          showToast(invalidOpenAiKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.API_KEY] = await encryptApiKey(apiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      } else if (provider === 'claude') {
        if (!apiKey.startsWith('sk-ant-')) {
          const invalidClaudeKeyText = await t('invalidClaudeKeyFormat');
          showToast(invalidClaudeKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = await encryptApiKey(apiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      } else if (provider === 'gemini') {
        if (!apiKey.startsWith('AIza')) {
          const invalidGeminiKeyText = await t('invalidGeminiKeyFormat');
          showToast(invalidGeminiKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = await encryptApiKey(apiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      } else if (provider === 'grok') {
        if (!apiKey.startsWith('xai-')) {
          const invalidGrokKeyText = await t('invalidGrokKeyFormat');
          showToast(invalidGrokKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.GROK_API_KEY] = await encryptApiKey(apiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      } else if (provider === 'openrouter') {
        // OpenRouter API keys typically start with 'sk-or-' but we'll be lenient
        if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
          const invalidOpenRouterKeyText = await t('invalidOpenRouterKeyFormat');
          showToast(invalidOpenRouterKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY] = await encryptApiKey(apiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      }
    }
  }
  
  // Google API key is now saved separately via saveGoogleApiKey button in settings
  // Removed from here to avoid confusion

  // Remove null values before saving (explicitly remove keys)
  const keysToRemove = [];
  for (const [key, value] of Object.entries(keysToSave)) {
    if (value === null) {
      keysToRemove.push(key);
      delete keysToSave[key];
    }
  }
  
  // Save keys
  if (Object.keys(keysToSave).length > 0) {
    await chrome.storage.local.set(keysToSave);
  }
  
  // Remove keys that should be deleted
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  
  const apiKeysSavedText = await t('apiKeysSaved');
  showToast(apiKeysSavedText, 'success');
}

// Check current processing state from background or storage
// checkProcessingState() moved to core.js module



// Start polling for state updates
// startStatePolling() moved to core.js module



// Check summary generation status from storage AND processingState
// checkSummaryStatus() moved to core.js module



// Update UI based on processing state
// updateUIFromState() moved to core.js module



// mapStageLabel() moved to core.js module



// Handle Save PDF button click
// handleSavePdf() moved to core.js module



// extractPageContent() moved to core.js module

// Set status indicator (kept for backward compatibility, now uses uiModule)
function setStatus(type, text, startTime = null) {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.uiModule) {
    return windowWithModules.uiModule.setStatus(type, text, startTime);
  }
  elements.statusDot.className = 'status-dot';
  if (type === 'processing') {
    elements.statusDot.classList.add('processing');
    // Add timer display for processing status (use startTime from background or currentStartTime)
    const effectiveStartTime = startTime || currentStartTimeRef.current;
    const elapsed = effectiveStartTime ? Math.floor((Date.now() - effectiveStartTime) / 1000) : 0;
    // SECURITY: Escape status text to prevent XSS attacks
    const escapedText = escapeHtmlUtil(text);
    elements.statusText.innerHTML = `${escapedText} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    // Ensure timer is running if we have a startTime
    if (effectiveStartTime && !timerIntervalRef.current) {
      startTimerDisplayLocal(effectiveStartTime);
    }
  } else if (type === 'error') {
    elements.statusDot.classList.add('error');
    elements.statusText.textContent = text;
  } else {
    elements.statusText.textContent = text;
  }
}

// Set progress bar (kept for backward compatibility, now uses uiModule)
function setProgress(percent, show = true) {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.uiModule) {
    return windowWithModules.uiModule.setProgress(percent, show);
  }
  elements.progressContainer.style.display = show ? 'block' : 'none';
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${Math.round(percent)}%`;
}

// Show toast notification (kept for backward compatibility, now uses uiModule)
function showToast(message, type = 'success') {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.uiModule) {
    return windowWithModules.uiModule.showToast(message, type);
  }
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}


// CRITICAL: Function to save voice before popup closes
// This function is overridden in init() to use settingsModule from modules instead of window
// The override is set up after modules are initialized
async function saveVoiceBeforeClose() {
  // Save any pending debounced settings first
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
  }
  
  // This function is overridden in init() with the actual implementation
  // that uses settingsModule from modules instead of window.settingsModule
  logWarn('saveVoiceBeforeClose called but not yet initialized - this should not happen');
}

// Cleanup on popup close - use multiple events for reliability
window.addEventListener('beforeunload', saveVoiceBeforeClose);
window.addEventListener('unload', saveVoiceBeforeClose);
window.addEventListener('pagehide', saveVoiceBeforeClose);

// Cleanup timers on popup close
window.addEventListener('beforeunload', () => {
  if (statePollingTimeoutRef.current) {
    clearTimeout(statePollingTimeoutRef.current);
    statePollingTimeoutRef.current = null;
  }
  if (timerIntervalRef.current) {
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }
});

// ========================================
// STATISTICS
// ========================================

async function loadAndDisplayStats() {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.statsModule) {
    return windowWithModules.statsModule.loadAndDisplayStats();
  }
  // Fallback to original implementation if module not initialized
  try {
    const [statsResponse, cacheResponse] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getStats' }),
      chrome.runtime.sendMessage({ action: 'getCacheStats' })
    ]);
    
    if (statsResponse && statsResponse.stats) {
      await displayStats(statsResponse.stats);
    }
    
    if (cacheResponse && cacheResponse.stats) {
      displayCacheStats(cacheResponse.stats);
    }
  } catch (error) {
    logError('Failed to load stats', error);
  }
}

async function displayStats(stats) {
  // Update main counters
  document.getElementById('statTotal').textContent = stats.totalSaved || 0;
  document.getElementById('statMonth').textContent = stats.thisMonth || 0;
  
  // Update format counts
  document.getElementById('formatPdf').textContent = stats.byFormat?.pdf || 0;
  document.getElementById('formatEpub').textContent = stats.byFormat?.epub || 0;
  document.getElementById('formatFb2').textContent = stats.byFormat?.fb2 || 0;
  document.getElementById('formatMarkdown').textContent = stats.byFormat?.markdown || 0;
  document.getElementById('formatAudio').textContent = stats.byFormat?.audio || 0;
  
  // Update history
  const historyContainer = document.getElementById('statsHistory');
  if (stats.history && stats.history.length > 0) {
    historyContainer.innerHTML = stats.history.map((item, index) => {
      const date = new Date(item.date);
      const dateStr = formatRelativeDate(date);
      const timeStr = item.processingTime > 0 ? `${Math.round(item.processingTime / 1000)}s` : '';
      return `
        <div class="history-item" data-index="${index}" data-url="${escapeHtml(item.url || '')}">
          <a href="${escapeHtml(item.url || '#')}" class="history-link" target="_blank" title="Open original article">
            <div class="history-title">${escapeHtml(item.title)}</div>
            <div class="history-meta">
              <span class="history-format">${item.format}</span>
              <span class="history-domain">${escapeHtml(item.domain)}</span>
              ${timeStr ? `<span class="history-time">${timeStr}</span>` : ''}
              <span class="history-date">${dateStr}</span>
            </div>
          </a>
          <button class="history-delete" data-index="${index}" title="Delete from history">✕</button>
        </div>
      `;
    }).join('');
    
    // Add delete handlers
    historyContainer.querySelectorAll('.history-delete').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const indexStr = btn.dataset.index;
        const index = indexStr ? parseInt(indexStr, 10) : NaN;
        await chrome.runtime.sendMessage({ action: 'deleteHistoryItem', index });
        await loadAndDisplayStats();
      });
    });
  } else {
    const noDataText = await t('noDataYet');
    historyContainer.innerHTML = `<div class="stats-empty" data-i18n="noDataYet">${noDataText}</div>`;
  }
  
  // Footer removed - replaced with statistics collection checkbox
}

// DEPRECATED: Use escapeHtmlUtil from scripts/utils/html.js instead
// Kept for backward compatibility with existing code

async function displayCacheStats(stats) {
  const domainsEl = document.getElementById('cacheDomains');
  if (domainsEl) {
    domainsEl.textContent = stats.validDomains || 0;
  }
  
  // Display cached domains list
  const domainsListEl = document.getElementById('cacheDomainsList');
  if (domainsListEl && stats.domains) {
    if (stats.domains.length === 0) {
      const noCachedDomainsText = await t('noCachedDomains');
      domainsListEl.innerHTML = `<div class="stats-empty" data-i18n="noCachedDomains">${noCachedDomainsText}</div>`;
    } else {
      domainsListEl.innerHTML = stats.domains.map(item => {
        if (item.invalidated) return ''; // Skip invalidated domains
        
        return `
          <div class="cache-domain-item">
            <span class="cache-domain-name" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</span>
            <div class="cache-domain-meta">
              <span>${item.age}</span>
            </div>
            <button class="cache-domain-delete" data-domain="${escapeHtml(item.domain)}" data-i18n-title="deleteFromCache">✕</button>
          </div>
        `;
      }).filter(html => html).join('');
      
      // Add delete handlers
      domainsListEl.querySelectorAll('.cache-domain-delete').forEach(btn => {
        if (!(btn instanceof HTMLElement)) return;
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const domain = btn.dataset.domain;
          const langCode = await getUILanguage();
          const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
          const deleteConfirm = (locale.deleteDomainFromCache || UI_LOCALES.en.deleteDomainFromCache).replace('{domain}', domain);
          if (confirm(deleteConfirm)) {
            await chrome.runtime.sendMessage({ action: 'deleteDomainFromCache', domain });
            await loadAndDisplayStats();
            const domainRemovedText = await t('domainRemovedFromCache');
            showToast(domainRemovedText, 'success');
          }
        });
      });
    }
  }
}

// Initialize when DOM is ready
// For ES modules, DOM might already be loaded when script executes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
      // Use logError for centralized logging with fallback
      try {
        if (typeof logError === 'function') {
          logError('init() failed after DOMContentLoaded', error);
        } else {
          // Fallback if logError is not yet available
          console.error('[ClipAIble] popup.js: init() failed after DOMContentLoaded', error);
        }
      } catch (loggingError) {
        // Ultimate fallback if even error logging fails
        console.error('[ClipAIble] popup.js: init() failed after DOMContentLoaded', error);
        console.error('[ClipAIble] Failed to log init error:', loggingError);
      }
    });
  });
} else {
  // DOM is already loaded, call init immediately
  init().catch(error => {
    // Use logError for centralized logging with fallback
    try {
      if (typeof logError === 'function') {
        logError('init() failed immediately', error);
      } else {
        // Fallback if logError is not yet available
        console.error('[ClipAIble] popup.js: init() failed immediately', error);
      }
    } catch (loggingError) {
      // Ultimate fallback if even error logging fails
      console.error('[ClipAIble] popup.js: init() failed immediately', error);
      console.error('[ClipAIble] Failed to log init error:', loggingError);
    }
  });
}
