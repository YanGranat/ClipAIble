// @ts-check
// Popup script for ClipAIble extension
//
/**
 * @typedef {Window & {
 *   uiModule?: Object;
 *   statsModule?: Object;
 *   settingsModule?: Object;
 *   coreModule?: Object;
 *   handlersModule?: Object;
 *   themeChangeListener?: (e: MediaQueryListEvent) => void;
 * }} WindowWithModules
 */
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

log('[ClipAIble Popup] Starting imports', { timestamp: Date.now() });

import { encryptApiKey, decryptApiKey, maskApiKey, isEncrypted, isMaskedKey } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, setUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logWarn, logDebug } from '../scripts/utils/logging.js';
import { enhancedLogError, initGlobalErrorHandlers } from './utils/error-handling.js';
import { initPdfFileSelectionHandler } from './utils/pdf-dialog.js';
import { CONFIG } from '../scripts/utils/config.js';
import { getProviderFromModel } from '../scripts/api/index.js';
import { detectVideoPlatform } from '../scripts/utils/video.js';
import { sanitizeMarkdownHtml } from '../scripts/utils/html.js';
import { initUI } from './ui.js';
import { initCustomSelect } from './utils/custom-select.js';
import { initStats } from './stats.js';
import { initSettings } from './settings.js';
import { initCore } from './core.js';
import { initHandlers } from './handlers.js';
import { initializeDOMElements, initializeModules, finalizeInitialization } from './utils/init-helpers.js';
import { groupDependencies } from './utils/dependencies.js';
import { STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS, ELEMENT_IDS } from './constants.js';
import { getElement, setElementDisplay, setElementGroupDisplay, setDisplayForIds } from './utils/dom-helpers.js';
import { markdownToHtml, formatTime, escapeHtml } from './utils/format-helpers.js';
import { debouncedSaveSettings, saveAudioVoice } from './utils/settings-helpers.js';

import { startTimerDisplay, stopTimerDisplay } from './utils/timer-helpers.js';

// Long-lived port to signal to service worker that popup is open.
// This enables completion notifications when popup is closed.
/** @type {chrome.runtime.Port|null} */
let popupOpenPort = null;

function connectPopupOpenPort() {
  log('[ClipAIble Popup] connectPopupOpenPort called', {
    timestamp: Date.now(),
    alreadyHasPort: !!popupOpenPort,
    hasChromeRuntime: !!chrome?.runtime,
    hasChromeRuntimeConnect: !!chrome?.runtime?.connect
  });

  try {
    if (popupOpenPort) {
      log('[ClipAIble Popup] Port already exists, skipping connection', { timestamp: Date.now() });
      return;
    }
    if (!chrome?.runtime?.connect) {
      log('[ClipAIble Popup] chrome.runtime.connect not available, skipping', { timestamp: Date.now() });
      return;
    }

    log('[ClipAIble Popup] Connecting popup port to service worker', { timestamp: Date.now() });
    popupOpenPort = chrome.runtime.connect({ name: 'clipaible_popup' });

    log('[ClipAIble Popup] Popup port connected successfully', {
      timestamp: Date.now(),
      portName: popupOpenPort.name,
      hasOnDisconnect: typeof popupOpenPort.onDisconnect === 'function'
    });

    popupOpenPort.onDisconnect.addListener(() => {
      log('[ClipAIble Popup] Popup port disconnected', { timestamp: Date.now() });
      popupOpenPort = null;
    });
  } catch (e) {
    // Non-critical: notifications will still work, but may show even if popup is open.
    logWarn('[ClipAIble Popup] Failed to connect popup open port', {
      timestamp: Date.now(),
      error: e.message,
      stack: e.stack
    });
  }
}

// Module references (replaces window.*Module pattern)
let uiModuleRef = null;
let statsModuleRef = null;
let settingsModuleRef = null;

// Use enhanced logError that also sends to service worker
// Must be defined before initGlobalErrorHandlers() which uses it
const logError = enhancedLogError;

// Initialize global error handlers early (before anything can break)
initGlobalErrorHandlers();

// Initialize PDF file selection handler
initPdfFileSelectionHandler();


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
  generateKeyThesesBtn: null,
  keyThesesContainer: null,
  keyThesesToggle: null,
  keyThesesContent: null,
  keyThesesText: null,
  keyThesesCopyBtn: null,
  keyThesesDownloadBtn: null,
  keyThesesCloseBtn: null,
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
  qwenModel: null,
  qwenModelGroup: null,
  qwenWorkspaceId: null,
  qwenWorkspaceGroup: null,
  qwenRegion: null,
  qwenRegionGroup: null,
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


function saveAudioVoiceLocal(provider, voice) {
  return saveAudioVoice(provider, voice, audioVoiceMap);
}

function applyLocalization() {
  return uiModuleRef.applyLocalization();
}

function applyTheme() {
  return uiModuleRef.applyTheme();
}

// Initialize popup
async function init() {
  log('popup.js: init() started');
  connectPopupOpenPort();
  
  try {
    // Initialize DOM elements
    initializeDOMElements(elements);
    
    // Group dependencies for cleaner module initialization
    const groupedDeps = groupDependencies({
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
      escapeHtml,
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
    
    // Initialize all modules with grouped dependencies
    const modules = /** @type {any} */ (initializeModules)(groupedDeps);
    
    // Publish delegates before loading settings or installing their consumers.
    uiModuleRef = modules.uiModule;
    statsModuleRef = modules.statsModule;
    settingsModuleRef = modules.settingsModule;
    await finalizeInitialization(modules, initAllCustomSelects, setCustomSelectValue);
    
    log('popup.js: init() completed successfully');
  } catch (error) {
    // Use logError for centralized logging (console.error is redundant here)
    logError('CRITICAL: init() failed completely', error);
    // Show error to user
    const statusText = document.getElementById(ELEMENT_IDS.STATUS_TEXT);
    if (statusText) {
      const errorText = await t('errorCheckConsole');
      statusText.textContent = errorText;
    }
  }
}


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
  showToast(resetText, 'success', { key: 'resetToDefault' });
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
  const stylePresetContainer = document.getElementById(ELEMENT_IDS.STYLE_PRESET_CONTAINER);
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
  showToast(allStylesResetText, 'success', { key: 'allStylesReset' });
}


// Set custom font select value programmatically
function setCustomSelectValue(value) {
  if (!elements.fontFamilyOptions || !elements.fontFamilyValue) {
    logWarn('setCustomSelectValue: elements not initialized', { 
      hasOptions: !!elements.fontFamilyOptions, 
      hasValue: !!elements.fontFamilyValue 
    });
    return;
  }
  
  const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
  let found = false;
  const compareValue = (value || '').trim();
  
  logDebug('setCustomSelectValue: setting font family', { 
    value, 
    compareValue, 
    optionsCount: options.length,
    availableValues: Array.from(options).map(o => ({ value: o.dataset.value || '', text: o.textContent }))
  });
  
  options.forEach(opt => {
    opt.classList.remove('selected');
    // Match by exact value or empty string for default
    const optValue = (opt.dataset.value || '').trim();
    if (optValue === compareValue) {
      opt.classList.add('selected');
      const optionText = opt.textContent || '';
      elements.fontFamilyValue.textContent = optionText;
      logDebug('setCustomSelectValue: found matching option', { 
        optValue, 
        optionText,
        hasFontClass: opt.classList.length > 1
      });
      
      // Apply font family style if option has font class
      if (opt.classList.contains('font-segoe-ui')) {
        elements.fontFamilyValue.style.fontFamily = 'Segoe UI, sans-serif';
      } else if (opt.classList.contains('font-arial')) {
        elements.fontFamilyValue.style.fontFamily = 'Arial, sans-serif';
      } else if (opt.classList.contains('font-georgia')) {
        elements.fontFamilyValue.style.fontFamily = 'Georgia, serif';
      } else if (opt.classList.contains('font-times-new-roman')) {
        elements.fontFamilyValue.style.fontFamily = 'Times New Roman, serif';
      } else if (opt.classList.contains('font-verdana')) {
        elements.fontFamilyValue.style.fontFamily = 'Verdana, sans-serif';
      } else if (opt.classList.contains('font-tahoma')) {
        elements.fontFamilyValue.style.fontFamily = 'Tahoma, sans-serif';
      } else if (opt.classList.contains('font-trebuchet-ms')) {
        elements.fontFamilyValue.style.fontFamily = 'Trebuchet MS, sans-serif';
      } else {
        elements.fontFamilyValue.style.fontFamily = opt.style.fontFamily || '';
      }
      found = true;
    }
  });
  
  // If value not found, reset to default
  if (!found && value) {
    logWarn('setCustomSelectValue: font family value not found', { 
      value, 
      compareValue,
      availableValues: Array.from(options).map(o => ({ value: o.dataset.value || '', text: o.textContent }))
    });
    // Reset to default
    setCustomSelectValue('');
  } else if (!found && !value) {
    // Empty value is default - this is OK
    logDebug('setCustomSelectValue: setting to default (empty value)');
  }
}

// Universal function to convert native select to custom-select
// Initialize all custom selects
function initAllCustomSelects() {
  // List of select IDs to convert (excluding modelSelect which has its own custom dropdown)
  // outputFormat is hidden (moved to main screen as mainFormatSelect)
  const selectIds = [
    'apiProviderSelect',
    'modeSelect',
    'mainFormatSelect',
    'audioProvider',
    'qwenModel',
    'qwenRegion',
    'elevenlabsModel',
    'elevenlabsFormat',
    'googleTtsModel',
    'googleTtsVoice',
    'audioVoice',
    'pageMode',
    'languageSelect',
    'imageTranslationProvider',
    'geminiImageModel',
    'stylePreset',
    'uiLanguageSelect',
    'themeSelect'
  ];
  
  selectIds.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select && !select.closest('.custom-select')) {
      initCustomSelect(selectId, { onOpen: () => {
        if (elements.customModelDropdown) {
          elements.customModelDropdown.classList.add('hidden');
          elements.customModelDropdown.style.display = 'none';
        }
      } });
    }
  });
}


function setStatus(type, text, startTime = null, translation = null) {
  return uiModuleRef.setStatus(type, text, startTime, translation);
}

function setProgress(percent, show = true) {
  return uiModuleRef.setProgress(percent, show);
}

function showToast(message, type = 'success', translation = null) {
  return uiModuleRef.showToast(message, type, translation);
}

// Best-effort: explicitly disconnect popup port on close.
window.addEventListener('beforeunload', () => {
  try {
    popupOpenPort?.disconnect();
  } catch {
    // Ignore errors on unload.
  } finally {
    popupOpenPort = null;
  }
});

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

function loadAndDisplayStats() {
  return statsModuleRef.loadAndDisplayStats();
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
