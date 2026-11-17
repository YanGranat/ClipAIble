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

import { encryptApiKey, decryptApiKey, maskApiKey, isEncrypted, isMaskedKey, saveApiKeySettings } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, setUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logWarn, logDebug } from '../scripts/utils/logging.js';
import { enhancedLogError, initGlobalErrorHandlers } from './utils/error-handling.js';
import { initPdfFileSelectionHandler } from './utils/pdf-dialog.js';
import { CONFIG } from '../scripts/utils/config.js';
import { getProviderFromModel } from '../scripts/api/index.js';
import { detectVideoPlatform } from '../scripts/utils/video.js';
import { sanitizeMarkdownHtml, escapeHtml as escapeHtmlUtil } from '../scripts/utils/html.js';
import { initUI } from './ui.js';
import { initCustomSelect } from './utils/custom-select.js';
import { initStats, getSafeHistoryUrl } from './stats.js';
import { initSettings } from './settings.js';
import { initCore } from './core.js';
import { initHandlers } from './handlers.js';
import { initializeDOMElements, initializeModules, finalizeInitialization } from './utils/init-helpers.js';
import { groupDependencies } from './utils/dependencies.js';
import { STORAGE_KEYS, DEFAULT_STYLES, STYLE_PRESETS, ELEMENT_IDS } from './constants.js';
import { getElement, setElementDisplay, setElementGroupDisplay, setDisplayForIds } from './utils/dom-helpers.js';
import { markdownToHtml, formatTime, escapeHtml, formatRelativeDate } from './utils/format-helpers.js';
import { debouncedSaveSettings, saveAudioVoice } from './utils/settings-helpers.js';

import { startTimerDisplay, stopTimerDisplay, updateTimerDisplay } from './utils/timer-helpers.js';

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

function updateTimerDisplayLocal() {
  return updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements);
}

function saveAudioVoiceLocal(provider, voice) {
  return saveAudioVoice(provider, voice, audioVoiceMap);
}

// Apply UI localization (kept for backward compatibility, now uses uiModule)
async function applyLocalization() {
  if (uiModuleRef) {
    return uiModuleRef.applyLocalization();
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
  
  // Special handling for fontFamily (uses hidden input, not select)
  if (elements.fontFamily && elements.fontFamilyOptions && elements.fontFamilyValue) {
    const currentValue = elements.fontFamily.value || '';
    const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
    options.forEach(opt => {
      // Update text from data-i18n if present
      if (opt.hasAttribute('data-i18n')) {
        const key = opt.getAttribute('data-i18n');
        const translation = locale[key] || UI_LOCALES.en[key] || key;
        opt.textContent = translation;
      }
      // Update selected state and displayed value
      const optValue = opt.dataset.value || '';
      if (optValue === currentValue) {
        opt.classList.add('selected');
        elements.fontFamilyValue.textContent = opt.textContent;
        // Apply font family style
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
      } else {
        opt.classList.remove('selected');
      }
    });
  }
  
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
    elements.modeHint.textContent = mode === 'automatic'
      ? (locale.extractionModeHintAutomatic || UI_LOCALES.en.extractionModeHintAutomatic)
      : mode === 'selector'
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

/**
 * Apply theme to popup
 * @deprecated Use uiModule.applyTheme() instead. This is a temporary stub for backward compatibility during initialization.
 * @returns {void}
 */
function applyTheme() {
  // This function is a stub - actual implementation is in uiModule
  // It's only used during module initialization, after which uiModule.applyTheme() is used
  if (uiModuleRef && uiModuleRef.applyTheme) {
    return uiModuleRef.applyTheme();
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
    
    // Finalize initialization: load settings, apply localization, setup event listeners
    await finalizeInitialization(modules, initAllCustomSelects, setCustomSelectValue);
    
    // Store module references for functions that need them (replaces window.*Module pattern)
    uiModuleRef = modules.uiModule;
    statsModuleRef = modules.statsModule;
    settingsModuleRef = modules.settingsModule;
    
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
  showToast(allStylesResetText, 'success');
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
      } else if (provider === 'deepseek') {
        keysToSave[STORAGE_KEYS.DEEPSEEK_API_KEY] = elements.apiKey.dataset.encrypted;
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
      } else if (provider === 'deepseek') {
        // DeepSeek API keys start with 'sk-'
        if (!apiKey.startsWith('sk-')) {
          const invalidDeepSeekKeyText = await t('invalidDeepSeekKeyFormat');
          showToast(invalidDeepSeekKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.DEEPSEEK_API_KEY] = await encryptApiKey(apiKey);
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
  
  await saveApiKeySettings(keysToSave, keysToRemove);
  
  const apiKeysSavedText = await t('apiKeysSaved');
  showToast(apiKeysSavedText, 'success');
}


// Set status indicator (kept for backward compatibility, now uses uiModule)
function setStatus(type, text, startTime = null) {
  if (uiModuleRef) {
    return uiModuleRef.setStatus(type, text, startTime);
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
  if (uiModuleRef) {
    return uiModuleRef.setProgress(percent, show);
  }
  if (show) {
    elements.progressContainer.classList.remove('hidden');
    elements.progressContainer.style.display = 'block';
  } else {
    elements.progressContainer.classList.add('hidden');
    elements.progressContainer.style.display = 'none';
  }
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${Math.round(percent)}%`;
}

// Show toast notification (kept for backward compatibility, now uses uiModule)
function showToast(message, type = 'success') {
  if (uiModuleRef) {
    return uiModuleRef.showToast(message, type);
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

// ========================================
// STATISTICS
// ========================================

async function loadAndDisplayStats() {
  if (statsModuleRef) {
    return statsModuleRef.loadAndDisplayStats();
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
  document.getElementById(ELEMENT_IDS.STAT_TOTAL).textContent = stats.totalSaved || 0;
  document.getElementById(ELEMENT_IDS.STAT_MONTH).textContent = stats.thisMonth || 0;

  // Update format counts
  document.getElementById(ELEMENT_IDS.FORMAT_PDF).textContent = stats.byFormat?.pdf || 0;
  document.getElementById(ELEMENT_IDS.FORMAT_EPUB).textContent = stats.byFormat?.epub || 0;
  document.getElementById(ELEMENT_IDS.FORMAT_FB2).textContent = stats.byFormat?.fb2 || 0;
  document.getElementById(ELEMENT_IDS.FORMAT_MARKDOWN).textContent = stats.byFormat?.markdown || 0;
  document.getElementById(ELEMENT_IDS.FORMAT_AUDIO).textContent = stats.byFormat?.audio || 0;
  
  // Update history
  const historyContainer = document.getElementById(ELEMENT_IDS.STATS_HISTORY);
  if (Array.isArray(stats.history) && stats.history.length > 0) {
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    const openOriginalArticleText = locale.openOriginalArticle || UI_LOCALES.en.openOriginalArticle;
    historyContainer.innerHTML = stats.history.map((item, index) => {
      if (!item || typeof item !== 'object') return '';
      const date = new Date(item.date);
      const dateStr = formatRelativeDate(date);
      const timeStr = item.processingTime > 0 ? `${Math.round(item.processingTime / 1000)}s` : '';
      return `
        <div class="history-item" data-index="${index}" data-url="${escapeHtml(item.url || '')}">
          <a href="${escapeHtml(getSafeHistoryUrl(item.url))}" class="history-link" target="_blank" rel="noopener" title="${escapeHtml(openOriginalArticleText)}">
            <div class="history-title">${escapeHtml(item.title)}</div>
            <div class="history-meta">
              <span class="history-format">${escapeHtml(item.format)}</span>
              <span class="history-domain">${escapeHtml(item.domain)}</span>
              ${timeStr ? `<span class="history-time">${timeStr}</span>` : ''}
              <span class="history-date">${dateStr}</span>
            </div>
          </a>
          <button class="history-delete" data-index="${index}" data-i18n-title="deleteFromHistory" title="Delete from history">✕</button>
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
  const domainsEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS);
  if (domainsEl) {
    domainsEl.textContent = stats.validDomains || 0;
  }
  
  // Display cached domains list
  const domainsListEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS_LIST);
  if (domainsListEl && Array.isArray(stats.domains)) {
    if (stats.domains.length === 0) {
      const noCachedDomainsText = await t('noCachedDomains');
      domainsListEl.innerHTML = `<div class="stats-empty" data-i18n="noCachedDomains">${noCachedDomainsText}</div>`;
    } else {
      domainsListEl.innerHTML = stats.domains.map(item => {
        if (!item || typeof item !== 'object') return '';
        if (item.invalidated) return ''; // Skip invalidated domains
        
        return `
          <div class="cache-domain-item">
            <span class="cache-domain-name" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</span>
            <div class="cache-domain-meta">
              <span>${escapeHtml(item.age)}</span>
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
