// Popup script for ClipAIble extension
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
import { log, logError as originalLogError, logWarn } from '../scripts/utils/logging.js';
import { CONFIG } from '../scripts/utils/config.js';
import { RESPEECHER_CONFIG } from '../scripts/api/respeecher.js';
import { AUDIO_CONFIG } from '../scripts/generation/audio-prep.js';
import { getProviderFromModel, callAI } from '../scripts/api/index.js';
import { detectVideoPlatform } from '../scripts/utils/video.js';
import { processSubtitlesWithAI } from '../scripts/extraction/video-processor.js';
import { sanitizeMarkdownHtml } from '../scripts/utils/html.js';
import { initUI } from './ui.js';
import { initStats } from './stats.js';
import { initSettings } from './settings.js';

// Function to send error to service worker for centralized logging
async function sendErrorToServiceWorker(message, error, context = {}) {
  try {
    const errorData = {
      message: message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code })
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
    // Ignore errors when sending error report (to avoid infinite loop)
    console.error('[ClipAIble] Failed to send error to service worker', sendError);
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

// Global error handler for unhandled promise rejections
window.addEventListener('error', (event) => {
  const errorMessage = `Global error handler caught error: ${event.message || 'Unknown error'}`;
  console.error('[ClipAIble] popup.js:', errorMessage, event.error, event.filename, event.lineno);
  
  sendErrorToServiceWorker(errorMessage, event.error, {
    source: 'popup.globalError',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const errorMessage = `Unhandled promise rejection: ${event.reason?.message || String(event.reason)}`;
  console.error('[ClipAIble] popup.js:', errorMessage, event.reason);
  
  const error = event.reason instanceof Error 
    ? event.reason 
    : new Error(String(event.reason));
  
  sendErrorToServiceWorker(errorMessage, error, {
    source: 'popup.unhandledRejection'
  });
});

const STORAGE_KEYS = {
  API_KEY: 'openai_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  GROK_API_KEY: 'grok_api_key',
  OPENROUTER_API_KEY: 'openrouter_api_key',
  GOOGLE_API_KEY: 'google_api_key',
  API_PROVIDER: 'api_provider',
  MODEL: 'openai_model',
  MODEL_BY_PROVIDER: 'model_by_provider', // Store selected model for each provider
  CUSTOM_MODELS: 'custom_models',
  HIDDEN_MODELS: 'hidden_models',
  MODE: 'extraction_mode',
  USE_CACHE: 'use_selector_cache',
  ENABLE_CACHE: 'enable_selector_caching',
  ENABLE_STATS: 'enable_statistics',
  OUTPUT_FORMAT: 'output_format',
  GENERATE_TOC: 'generate_toc',
  GENERATE_ABSTRACT: 'generate_abstract',
  PAGE_MODE: 'page_mode',
  LANGUAGE: 'pdf_language',
  TRANSLATE_IMAGES: 'translate_images',
  STYLE_PRESET: 'pdf_style_preset',
  FONT_FAMILY: 'pdf_font_family',
  FONT_SIZE: 'pdf_font_size',
  BG_COLOR: 'pdf_bg_color',
  TEXT_COLOR: 'pdf_text_color',
  HEADING_COLOR: 'pdf_heading_color',
  LINK_COLOR: 'pdf_link_color',
  THEME: 'popup_theme',
  UI_LANGUAGE: 'ui_language',
  AUDIO_PROVIDER: 'audio_provider',
  ELEVENLABS_API_KEY: 'elevenlabs_api_key',
  ELEVENLABS_MODEL: 'elevenlabs_model',
  ELEVENLABS_STABILITY: 'elevenlabs_stability',
  ELEVENLABS_SIMILARITY: 'elevenlabs_similarity',
  ELEVENLABS_STYLE: 'elevenlabs_style',
  ELEVENLABS_SPEAKER_BOOST: 'elevenlabs_speaker_boost',
  ELEVENLABS_FORMAT: 'elevenlabs_format',
  QWEN_API_KEY: 'qwen_api_key',
  RESPEECHER_API_KEY: 'respeecher_api_key',
  RESPEECHER_TEMPERATURE: 'respeecher_temperature',
  RESPEECHER_REPETITION_PENALTY: 'respeecher_repetition_penalty',
  RESPEECHER_TOP_P: 'respeecher_top_p',
  GOOGLE_TTS_API_KEY: 'google_tts_api_key',
  GOOGLE_TTS_MODEL: 'google_tts_model',
  AUDIO_VOICE: 'audio_voice',
  AUDIO_VOICE_MAP: 'audio_voice_map',
  AUDIO_SPEED: 'audio_speed',
  OPENAI_INSTRUCTIONS: 'openai_instructions',
  GOOGLE_TTS_VOICE: 'google_tts_voice',
  GOOGLE_TTS_PROMPT: 'google_tts_prompt',
  SUMMARY_TEXT: 'summary_text',
  SUMMARY_GENERATING: 'summary_generating'
};

// Default style values
const DEFAULT_STYLES = {
  fontFamily: '',
  fontSize: '31',
  bgColor: '#303030',
  textColor: '#b9b9b9',
  headingColor: '#cfcfcf',
  linkColor: '#6cacff'
};

// Style presets - carefully designed color schemes
// Each preset tested for WCAG AA contrast (min 4.5:1 for text)
const STYLE_PRESETS = {
  // Dark theme - user's custom default
  dark: {
    bgColor: '#303030',
    textColor: '#b9b9b9',
    headingColor: '#cfcfcf',
    linkColor: '#6cacff'
  },
  // Light theme - Modern clean design
  // Slightly off-white to reduce eye strain
  light: {
    bgColor: '#f8f9fa',      // Soft white (not pure white)
    textColor: '#343a40',    // Dark gray text (contrast ~10:1)
    headingColor: '#212529', // Near-black headings
    linkColor: '#0d6efd'     // Bootstrap blue links
  },
  // Sepia theme - E-reader style (Kindle-inspired)
  // Warm tones for comfortable extended reading
  sepia: {
    bgColor: '#faf4e8',      // Warm cream background
    textColor: '#5d4e37',    // Warm brown text (contrast ~7:1)
    headingColor: '#3d2e1f', // Dark chocolate headings
    linkColor: '#8b6914'     // Muted gold links
  },
  // High Contrast - Accessibility focused
  // Maximum contrast for visual impairment (WCAG AAA: 21:1)
  contrast: {
    bgColor: '#000000',      // Pure black
    textColor: '#ffffff',    // Pure white (contrast 21:1)
    headingColor: '#ffd700', // Gold headings (softer than yellow)
    linkColor: '#00bfff'     // DeepSkyBlue (softer than cyan)
  }
};

const MODE_HINTS = {
  selector: 'AI finds article blocks, script extracts content',
  extract: 'AI extracts and processes all content'
};

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
let statePollingTimeout = null;

// Timer interval for display updates
let timerInterval = null;

// Current start time from background (persists across popup reopens)
let currentStartTime = null;
let audioVoiceMap = {};

// Helper functions for safe element access and manipulation
/**
 * Safely get element from elements object
 * @param {string} key - Key in elements object
 * @returns {HTMLElement|null} Element or null if not found
 */
function getElement(key) {
  const el = elements[key];
  if (!el) {
    logWarn(`Element not found: ${key}`);
    return null;
  }
  return el;
}

/**
 * Safely set display style for element
 * @param {string} key - Key in elements object
 * @param {string} displayValue - CSS display value ('flex', 'none', 'block', etc.)
 */
function setElementDisplay(key, displayValue) {
  const el = getElement(key);
  if (el) {
    el.style.display = displayValue;
  }
}

/**
 * Safely set display style for element group (finds .setting-item parent)
 * @param {string} key - Key in elements object
 * @param {string} displayValue - CSS display value
 */
function setElementGroupDisplay(key, displayValue) {
  const el = getElement(key);
  if (el) {
    const group = el.closest('.setting-item') || el;
    group.style.display = displayValue;
  }
}

function setDisplayForIds(ids, displayValue) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) {
      logWarn(`Element not found by ID: ${id}`);
      return;
    }
    const group = el.closest('.setting-item') || el;
    group.style.display = displayValue;
  });
}

// Debounce timer for settings save
let settingsSaveTimer = null;

// Format seconds to MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Debounced settings save - saves settings after 500ms of inactivity
let isSavingSettings = false; // Flag to prevent concurrent saves
function debouncedSaveSettings(key, value, callback = null) {
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
  }
  
  settingsSaveTimer = setTimeout(async () => {
    // Prevent concurrent saves
    if (isSavingSettings) {
      // If already saving, schedule another save after current one completes
      if (callback) {
        const originalCallback = callback;
        callback = async () => {
          await originalCallback();
          // Retry save after current one completes
          setTimeout(() => debouncedSaveSettings(key, value, null), 100);
        };
      } else {
        // Retry save after current one completes
        setTimeout(() => debouncedSaveSettings(key, value, callback), 100);
      }
      return;
    }
    
    isSavingSettings = true;
    try {
      await chrome.storage.local.set({ [key]: value });
      if (callback) await callback();
    } catch (error) {
      logError('Failed to save settings', error);
    } finally {
      isSavingSettings = false;
      settingsSaveTimer = null;
    }
  }, 500);
}

// Save audio voice per provider with backward-compatible flat key
function saveAudioVoice(provider, voice) {
  if (!provider) return;
  if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
    audioVoiceMap = {};
  }
  audioVoiceMap[provider] = voice;
  debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE, voice);
  debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE_MAP, audioVoiceMap);
}

// Start the timer display updates
function startTimerDisplay(startTime) {
  if (!startTime) {
    logWarn('startTimerDisplay called without startTime');
    return;
  }
  currentStartTime = startTime;
  if (timerInterval) clearInterval(timerInterval);
  // Update immediately, then set interval
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
  log('Timer started', { startTime, currentStartTime });
}

// Stop the timer display
function stopTimerDisplay() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  currentStartTime = null;
}

// Update timer display in status text
function updateTimerDisplay() {
  if (!currentStartTime) {
    // Try to get startTime from state if currentStartTime is not set
    chrome.runtime.sendMessage({ action: 'getState' }).then(state => {
      if (state && state.isProcessing && state.startTime) {
        currentStartTime = state.startTime;
        updateTimerDisplay(); // Retry after setting startTime
      }
    }).catch(() => {});
    return;
  }
  const elapsed = Math.floor((Date.now() - currentStartTime) / 1000);
  const timerSpan = document.getElementById('timerDisplay');
  if (timerSpan) {
    timerSpan.textContent = formatTime(elapsed);
  } else {
    // Timer element not found - try to recreate it if status is processing
    if (elements.statusText) {
      // Extract text without timer if it exists
      const textContent = elements.statusText.textContent || elements.statusText.innerText || '';
      const statusText = textContent.replace(/\s*\(\d{2}:\d{2}\)\s*$/, '').trim();
      const elapsed = Math.floor((Date.now() - currentStartTime) / 1000);
      elements.statusText.innerHTML = `${statusText} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    }
  }
}

// Apply UI localization (kept for backward compatibility, now uses uiModule)
async function applyLocalization() {
  if (window.uiModule) {
    return window.uiModule.applyLocalization();
  }
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  
  // Apply translations to elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = locale[key] || UI_LOCALES.en[key] || key;
    
    if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'password')) {
      // For inputs, check if they have a separate placeholder key
      if (element.hasAttribute('data-i18n-placeholder')) {
        const placeholderKey = element.getAttribute('data-i18n-placeholder');
        element.placeholder = locale[placeholderKey] || UI_LOCALES.en[placeholderKey] || '';
      } else {
        element.placeholder = translation;
      }
    } else if (element.tagName === 'OPTION') {
      // Options are handled separately
    } else {
      element.textContent = translation;
    }
  });
  
  // Handle elements with only data-i18n-placeholder (no data-i18n)
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
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

// Initialize popup
async function init() {
  log('popup.js: init() started');
  
  try {
    // Get DOM elements
    elements.apiProviderSelect = document.getElementById('apiProviderSelect');
  elements.apiKey = document.getElementById('apiKey');
  elements.apiKeyLabel = document.getElementById('apiKeyLabel');
  elements.apiKeyInputGroup = document.getElementById('apiKeyInputGroup');
  elements.toggleApiKey = document.getElementById('toggleApiKey');
  elements.claudeApiKey = document.getElementById('claudeApiKey');
  elements.toggleClaudeApiKey = document.getElementById('toggleClaudeApiKey');
  elements.geminiApiKey = document.getElementById('geminiApiKey');
  elements.toggleGeminiApiKey = document.getElementById('toggleGeminiApiKey');
  elements.googleApiKey = document.getElementById('googleApiKey');
  elements.toggleGoogleApiKey = document.getElementById('toggleGoogleApiKey');
  elements.googleApiGroup = document.getElementById('googleApiGroup');
  elements.saveApiKey = document.getElementById('saveApiKey');
  elements.savePdfBtn = document.getElementById('savePdfBtn');
  elements.saveIcon = document.getElementById('saveIcon');
  elements.saveText = document.getElementById('saveText');
  elements.mainFormatSelect = document.getElementById('mainFormatSelect');
  elements.cancelBtn = document.getElementById('cancelBtn');
  elements.generateSummaryBtn = document.getElementById('generateSummaryBtn');
  elements.summaryContainer = document.getElementById('summaryContainer');
  elements.summaryToggle = document.getElementById('summaryToggle');
  elements.summaryContent = document.getElementById('summaryContent');
  elements.summaryText = document.getElementById('summaryText');
  elements.summaryCopyBtn = document.getElementById('summaryCopyBtn');
  elements.summaryDownloadBtn = document.getElementById('summaryDownloadBtn');
  elements.summaryCloseBtn = document.getElementById('summaryCloseBtn');
  elements.toggleSettings = document.getElementById('toggleSettings');
  elements.settingsPanel = document.getElementById('settingsPanel');
  elements.toggleStats = document.getElementById('toggleStats');
  elements.statsPanel = document.getElementById('statsPanel');
  elements.clearStatsBtn = document.getElementById('clearStatsBtn');
  elements.clearCacheBtn = document.getElementById('clearCacheBtn');
  elements.enableCache = document.getElementById('enableCache');
  elements.enableStats = document.getElementById('enableStats');
  elements.exportSettingsBtn = document.getElementById('exportSettingsBtn');
  elements.importSettingsBtn = document.getElementById('importSettingsBtn');
  elements.importFileInput = document.getElementById('importFileInput');
  elements.modeSelect = document.getElementById('modeSelect');
  elements.modeHint = document.getElementById('modeHint');
  elements.useCache = document.getElementById('useCache');
  elements.useCacheGroup = document.getElementById('useCacheGroup');
  elements.modelSelect = document.getElementById('modelSelect');
  elements.addModelBtn = document.getElementById('addModelBtn');
  elements.customModelDropdown = document.getElementById('customModelDropdown');
  elements.customModelOptions = document.getElementById('customModelOptions');
  elements.outputFormat = document.getElementById('outputFormat');
  elements.generateToc = document.getElementById('generateToc');
  elements.generateAbstract = document.getElementById('generateAbstract');
  elements.pageMode = document.getElementById('pageMode');
  elements.pageModeGroup = document.getElementById('pageModeGroup');
  elements.languageSelect = document.getElementById('languageSelect');
  elements.translateImages = document.getElementById('translateImages');
  elements.translateImagesGroup = document.getElementById('translateImagesGroup');
  // Find hint element - it's the <p> with class "setting-hint" inside translateImagesGroup
  const translateImagesHintEl = elements.translateImagesGroup?.querySelector('.setting-hint');
  if (translateImagesHintEl) {
    elements.translateImagesHint = translateImagesHintEl;
  }
  elements.stylePreset = document.getElementById('stylePreset');
  elements.fontFamily = document.getElementById('fontFamily');
  elements.fontFamilyContainer = document.getElementById('fontFamilyContainer');
  elements.fontFamilyTrigger = document.getElementById('fontFamilyTrigger');
  elements.fontFamilyValue = document.getElementById('fontFamilyValue');
  elements.fontFamilyOptions = document.getElementById('fontFamilyOptions');
  elements.fontSize = document.getElementById('fontSize');
  elements.resetStylesBtn = document.getElementById('resetStylesBtn');
  elements.bgColor = document.getElementById('bgColor');
  elements.bgColorText = document.getElementById('bgColorText');
  elements.textColor = document.getElementById('textColor');
  elements.textColorText = document.getElementById('textColorText');
  elements.headingColor = document.getElementById('headingColor');
  elements.headingColorText = document.getElementById('headingColorText');
  elements.linkColor = document.getElementById('linkColor');
  elements.linkColorText = document.getElementById('linkColorText');
  elements.statusDot = document.querySelector('.status-dot');
  elements.statusText = document.getElementById('statusText');
  elements.progressContainer = document.getElementById('progressContainer');
  elements.progressBar = document.getElementById('progressBar');
  elements.progressText = document.getElementById('progressText');
  elements.themeSelect = document.getElementById('themeSelect');
  elements.uiLanguageSelect = document.getElementById('uiLanguageSelect');
  elements.audioProvider = document.getElementById('audioProvider');
  elements.audioProviderGroup = document.getElementById('audioProviderGroup');
  elements.elevenlabsApiKey = document.getElementById('elevenlabsApiKey');
  elements.toggleElevenlabsApiKey = document.getElementById('toggleElevenlabsApiKey');
  elements.saveElevenlabsApiKey = document.getElementById('saveElevenlabsApiKey');
  elements.elevenlabsApiKeyGroup = document.getElementById('elevenlabsApiKeyGroup');
  elements.elevenlabsModel = document.getElementById('elevenlabsModel');
  elements.elevenlabsModelGroup = document.getElementById('elevenlabsModelGroup');
  elements.elevenlabsFormat = document.getElementById('elevenlabsFormat');
  elements.elevenlabsFormatGroup = document.getElementById('elevenlabsFormatGroup');
  elements.elevenlabsAdvancedGroup = document.getElementById('elevenlabsAdvancedGroup');
  elements.elevenlabsStability = document.getElementById('elevenlabsStability');
  elements.elevenlabsStabilityValue = document.getElementById('elevenlabsStabilityValue');
  elements.elevenlabsSimilarity = document.getElementById('elevenlabsSimilarity');
  elements.elevenlabsSimilarityValue = document.getElementById('elevenlabsSimilarityValue');
  elements.elevenlabsStyle = document.getElementById('elevenlabsStyle');
  elements.elevenlabsStyleValue = document.getElementById('elevenlabsStyleValue');
  elements.elevenlabsSpeakerBoost = document.getElementById('elevenlabsSpeakerBoost');
  elements.openaiInstructions = document.getElementById('openaiInstructions');
  elements.openaiInstructionsGroup = document.getElementById('openaiInstructionsGroup');
  elements.qwenApiKey = document.getElementById('qwenApiKey');
  elements.toggleQwenApiKey = document.getElementById('toggleQwenApiKey');
  elements.saveQwenApiKey = document.getElementById('saveQwenApiKey');
  elements.qwenApiKeyGroup = document.getElementById('qwenApiKeyGroup');
  elements.respeecherApiKey = document.getElementById('respeecherApiKey');
  elements.toggleRespeecherApiKey = document.getElementById('toggleRespeecherApiKey');
  elements.saveRespeecherApiKey = document.getElementById('saveRespeecherApiKey');
  elements.respeecherApiKeyGroup = document.getElementById('respeecherApiKeyGroup');
  elements.respeecherAdvancedGroup = document.getElementById('respeecherAdvancedGroup');
  elements.respeecherTemperature = document.getElementById('respeecherTemperature');
  elements.respeecherTemperatureValue = document.getElementById('respeecherTemperatureValue');
  elements.respeecherRepetitionPenalty = document.getElementById('respeecherRepetitionPenalty');
  elements.respeecherRepetitionPenaltyValue = document.getElementById('respeecherRepetitionPenaltyValue');
  elements.respeecherTopP = document.getElementById('respeecherTopP');
  elements.respeecherTopPValue = document.getElementById('respeecherTopPValue');
  elements.googleTtsApiKey = document.getElementById('googleTtsApiKey');
  elements.toggleGoogleTtsApiKey = document.getElementById('toggleGoogleTtsApiKey');
  elements.saveGoogleTtsApiKey = document.getElementById('saveGoogleTtsApiKey');
  elements.googleTtsApiKeyGroup = document.getElementById('googleTtsApiKeyGroup');
  elements.audioVoice = document.getElementById('audioVoice');
  elements.audioVoiceGroup = document.getElementById('audioVoiceGroup');
  elements.audioSpeed = document.getElementById('audioSpeed');
  elements.audioSpeedGroup = document.getElementById('audioSpeedGroup');
  elements.audioSpeedValue = document.getElementById('audioSpeedValue');
  elements.googleTtsModel = document.getElementById('googleTtsModel');
  elements.googleTtsModelGroup = document.getElementById('googleTtsModelGroup');
  elements.googleTtsVoice = document.getElementById('googleTtsVoice');
  elements.googleTtsVoiceGroup = document.getElementById('googleTtsVoiceGroup');
  elements.googleTtsPrompt = document.getElementById('googleTtsPrompt');
  elements.googleTtsPromptGroup = document.getElementById('googleTtsPromptGroup');
  
  // Add themeSelect to elements object for consistency
  if (!elements.themeSelect) {
    logWarn('Theme select element not found');
  }
  
  // Initialize UI module
  const currentStartTimeRef = { current: currentStartTime };
  const timerIntervalRef = { current: timerInterval };
  const uiModule = initUI({
    elements,
    formatTime,
    startTimerDisplay,
    getElement,
    setElementDisplay,
    setElementGroupDisplay,
    setDisplayForIds,
    currentStartTime: currentStartTimeRef,
    timerInterval: timerIntervalRef
  });
  
  // Initialize stats module
  const statsModule = initStats({
    showToast
  });
  
  // Initialize settings module
  const settingsModule = initSettings({
    elements,
    STORAGE_KEYS,
    DEFAULT_STYLES,
    STYLE_PRESETS,
    debouncedSaveSettings,
    showToast,
    setCustomSelectValue,
    getElement,
    setElementDisplay,
    setElementGroupDisplay,
    setDisplayForIds,
    applyTheme,
    markdownToHtml,
    audioVoiceMap: { current: audioVoiceMap }
  });
  
  // Make modules available globally for use in other functions
  window.uiModule = uiModule;
  window.statsModule = statsModule;
  window.settingsModule = settingsModule;
  
  // Load settings after modules are initialized
  try {
    log('init: calling loadSettings()');
    if (window.settingsModule && window.settingsModule.loadSettings) {
      await window.settingsModule.loadSettings();
    } else {
      logError('CRITICAL: settingsModule.loadSettings not available');
      throw new Error('settingsModule.loadSettings not available');
    }
    log('init: loadSettings() completed successfully');
  } catch (error) {
    logError('CRITICAL: loadSettings() failed in init()', error);
    logError('init: loadSettings error details', { 
      message: error.message, 
      stack: error.stack 
    });
    // Continue initialization even if loadSettings fails
  }
  
  try {
    await uiModule.applyLocalization();
  } catch (error) {
    logError('CRITICAL: applyLocalization() failed in init()', error);
    // Continue initialization even if applyLocalization fails
  }
  
  try {
    uiModule.applyTheme();
  } catch (error) {
    logError('CRITICAL: applyTheme() failed in init()', error);
    // Continue initialization even if applyTheme fails
  }
  
  try {
    setupEventListeners();
  } catch (error) {
    logError('CRITICAL: setupEventListeners() failed in init()', error);
    // This is critical - without event listeners, buttons won't work
    // Don't throw - continue initialization to allow settings to load
    // Error is logged, user can see it in console
  }
  
  // Initialize custom selects (convert native selects to custom dropdowns)
  try {
    initAllCustomSelects();
  } catch (error) {
    logError('CRITICAL: initAllCustomSelects() failed in init()', error);
    // Continue initialization even if initAllCustomSelects fails
  }
  
  // Check current processing state
  try {
    await checkProcessingState();
  } catch (error) {
    logError('CRITICAL: checkProcessingState() failed in init()', error);
    // Continue initialization even if checkProcessingState fails
  }
  
  // Start polling for state updates
  try {
    startStatePolling();
  } catch (error) {
    logError('CRITICAL: startStatePolling() failed in init()', error);
    // Continue initialization even if startStatePolling fails
  }

  // Load and display version
  try {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version || '3.0.1';
    const versionElement = document.getElementById('versionText');
    if (versionElement) {
      versionElement.textContent = `v${version}`;
    }
  } catch (error) {
    logError('Failed to load version', error);
  }
  
  log('popup.js: init() completed successfully');
  } catch (error) {
    console.error('[ClipAIble] popup.js: CRITICAL ERROR in init()', error);
    logError('CRITICAL: init() failed completely', error);
    // Show error to user
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const errorText = await t('errorCheckConsole');
      statusText.textContent = errorText;
    }
  }
}

// Format model label with code name and reasoning effort
function formatModelLabel(modelValue) {
  if (!modelValue) return '';
  
  let modelName = modelValue;
  let reasoningEffort = null;
  
  // Check for high reasoning suffix (e.g., gpt-5.1-high)
  if (modelValue.endsWith('-high')) {
    modelName = modelValue.replace(/-high$/, '');
    reasoningEffort = 'high';
  } else if (modelValue === 'gpt-5.2' || modelValue.startsWith('gpt-5.2-pro')) {
    // GPT-5.2 models use medium reasoning by default
    reasoningEffort = 'medium';
  }
  
  // Use code name as base label
  let label = modelName;
  
  // Add reasoning effort suffix if present
  if (reasoningEffort) {
    label += ` (reasoning effort - ${reasoningEffort})`;
  }
  
  return label;
}

// Update model list based on selected provider
async function updateModelList() {
  if (!elements.apiProviderSelect || !elements.modelSelect) return;
  
  const provider = elements.apiProviderSelect.value;
  const uiLang = await getUILanguage();
  const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
  
  // Load custom models from storage
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS, STORAGE_KEYS.HIDDEN_MODELS]);
  const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
  const providerCustomModels = customModels[provider] || [];
  const hiddenModels = storageResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
  const providerHiddenModels = hiddenModels[provider] || [];
  
  // Define default models for each provider (using code names)
  const modelsByProvider = {
    openai: [
      { value: 'gpt-5.2', isCustom: false },
      { value: 'gpt-5.2-high', isCustom: false },
      { value: 'gpt-5.1', isCustom: false },
      { value: 'gpt-5.1-high', isCustom: false }
    ],
    claude: [
      { value: 'claude-sonnet-4-5', isCustom: false }
    ],
    gemini: [
      { value: 'gemini-3-pro-preview', isCustom: false }
    ],
    grok: [
      { value: 'grok-4-1-fast-reasoning', isCustom: false }
    ],
    openrouter: [
      { value: 'openai/gpt-5.1', isCustom: false },
      { value: 'openai/gpt-5.1-high', isCustom: false },
      { value: 'google/gemini-3-pro-preview', isCustom: false },
      { value: 'anthropic/claude-opus-4.5', isCustom: false },
      { value: 'deepseek/deepseek-v3.2', isCustom: false },
      { value: 'mistralai/mistral-nemo', isCustom: false },
      { value: 'qwen/qwen3-235b-a22b-2507', isCustom: false },
      { value: 'mistralai/devstral-2512:free', isCustom: false },
      { value: 'nex-agi/deepseek-v3.1-nex-n1:free', isCustom: false },
      { value: 'openai/gpt-oss-120b:free', isCustom: false },
      { value: 'z-ai/glm-4.5-air:free', isCustom: false }
    ]
  };
  
  // Get default models for provider and filter out hidden ones
  const defaultModels = (modelsByProvider[provider] || modelsByProvider.openai)
    .filter(model => !providerHiddenModels.includes(model.value));
  
  // Add custom models (also filter out hidden custom models)
  const customModelsList = providerCustomModels
    .filter(modelValue => !providerHiddenModels.includes(modelValue))
    .map(modelValue => ({
      value: modelValue,
      isCustom: true
    }));
  
  // Combine default and custom models
  const allModels = [...defaultModels, ...customModelsList];
  
  const currentValue = elements.modelSelect.value;
  
  // Clear existing options
  elements.modelSelect.innerHTML = '';
  
  // Add models for selected provider
  allModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.value;
    option.textContent = formatModelLabel(model.value);
    option.dataset.isCustom = model.isCustom ? 'true' : 'false';
    elements.modelSelect.appendChild(option);
  });
  
  // Load saved model for this provider
  const storageResult2 = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
  const savedModelsByProvider = storageResult2[STORAGE_KEYS.MODEL_BY_PROVIDER] || {};
  const savedModelForProvider = savedModelsByProvider[provider];
  
  // Try to restore saved model for this provider
  let modelToSelect = null;
  if (savedModelForProvider) {
    const modelExists = allModels.some(m => m.value === savedModelForProvider);
    if (modelExists) {
      modelToSelect = savedModelForProvider;
    }
  }
  
  // If no saved model or saved model doesn't exist, check current model
  if (!modelToSelect) {
    const currentModelProvider = getProviderFromModel(currentValue);
    if (currentModelProvider === provider) {
      // Current model belongs to this provider - check if it exists
      const modelExists = allModels.some(m => m.value === currentValue);
      if (modelExists) {
        modelToSelect = currentValue;
      }
    }
  }
  
  // If still no model, use first in list
  if (!modelToSelect && allModels.length > 0) {
    modelToSelect = allModels[0].value;
  }
  
  // Set selected model
  if (modelToSelect) {
    elements.modelSelect.value = modelToSelect;
    // Save to both general model key (for backward compatibility) and provider-specific
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.MODEL]: modelToSelect,
      [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
        ...savedModelsByProvider,
        [provider]: modelToSelect
      }
    });
  }
}

// Show custom model dropdown with delete buttons
async function showCustomModelDropdown() {
  if (!elements.customModelDropdown || !elements.customModelOptions) {
    return;
  }
  
  // Close all other custom selects
  document.querySelectorAll('.custom-select.open').forEach(select => {
    select.classList.remove('open');
  });
  if (elements.fontFamilyContainer) {
    elements.fontFamilyContainer.classList.remove('open');
  }
  
  // Show dropdown immediately to prevent race condition with click handler
  elements.customModelDropdown.style.display = 'block';
  
  const provider = elements.apiProviderSelect.value;
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
  const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
  const providerCustomModels = customModels[provider] || [];
  
  // Get all models (default + custom)
  const modelsByProvider = {
    openai: ['gpt-5.2', 'gpt-5.2-high', 'gpt-5.1', 'gpt-5.1-high'],
    claude: ['claude-sonnet-4-5'],
    gemini: ['gemini-3-pro-preview'],
    grok: ['grok-4-1-fast-reasoning'],
    openrouter: [
      'openai/gpt-5.1', 'openai/gpt-5.1-high', 'google/gemini-3-pro-preview',
      'anthropic/claude-opus-4.5', 'deepseek/deepseek-v3.2', 'mistralai/mistral-nemo',
      'qwen/qwen3-235b-a22b-2507', 'mistralai/devstral-2512:free',
      'nex-agi/deepseek-v3.1-nex-n1:free', 'openai/gpt-oss-120b:free', 'z-ai/glm-4.5-air:free'
    ]
  };
  
  const defaultModels = modelsByProvider[provider] || modelsByProvider.openai;
  const allModels = [...defaultModels, ...providerCustomModels];
  
  // Get hidden models
  const hiddenResult = await chrome.storage.local.get([STORAGE_KEYS.HIDDEN_MODELS]);
  const hiddenModels = hiddenResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
  const providerHiddenModels = hiddenModels[provider] || [];
  
  // Filter out hidden models
  const visibleModels = allModels.filter(modelValue => !providerHiddenModels.includes(modelValue));
  
  // Clear dropdown
  elements.customModelOptions.innerHTML = '';
  
  // Get currently selected model
  const currentModel = elements.modelSelect ? elements.modelSelect.value : null;
  
  // Add models to dropdown
  for (const modelValue of visibleModels) {
    const isCustom = providerCustomModels.includes(modelValue);
    const isSelected = modelValue === currentModel;
    const optionDiv = document.createElement('div');
    optionDiv.className = 'custom-model-option' + (isSelected ? ' selected' : '');
    optionDiv.dataset.modelValue = modelValue;
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-model-label';
    labelSpan.textContent = formatModelLabel(modelValue);
    
    optionDiv.appendChild(labelSpan);
    
    // Add delete button for all models
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'custom-model-delete';
    deleteBtn.innerHTML = '×';
    const deleteModelText = await t('deleteModel');
    const hideModelText = await t('hideModel');
    deleteBtn.title = isCustom ? deleteModelText : hideModelText;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isCustom) {
        await removeCustomModel(modelValue);
      } else {
        await hideDefaultModel(modelValue);
      }
    });
    optionDiv.appendChild(deleteBtn);
    
    // Add click handler to entire option div for full-width clickable area
    optionDiv.addEventListener('click', (e) => {
      // Don't trigger selection if clicking on delete button
      if (e.target.classList.contains('custom-model-delete') || e.target.closest('.custom-model-delete')) {
        return;
      }
      
      e.stopPropagation();
      e.stopImmediatePropagation();
      // Update select value and close dropdown
      elements.modelSelect.value = modelValue;
      elements.customModelDropdown.style.display = 'none';
      // Trigger change event to save settings
      elements.modelSelect.dispatchEvent(new Event('change'));
    });
    
    elements.customModelOptions.appendChild(optionDiv);
  }
}

// Show dialog for adding new model
async function showAddModelDialog() {
  const provider = elements.apiProviderSelect.value;
  const uiLang = await getUILanguage();
  const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
  
  const modelName = prompt(locale.addModelPrompt || 'Enter model name (e.g., gpt-5.2, claude-sonnet-4-5):');
  
  if (!modelName || !modelName.trim()) {
    return;
  }
  
  const trimmedName = modelName.trim();
  
  // Validate model name format - allow alphanumeric, hyphens, underscores, slashes, colons, dots
  if (!trimmedName.match(/^[a-z0-9][a-z0-9\-_\/:\.]*$/i)) {
    const errorMsg = locale.addModelInvalidFormat || 'Invalid model name format. Use code name like gpt-5.2 or claude-sonnet-4-5';
    alert(errorMsg);
    return;
  }
  
  // Check if model already exists
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
  const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
  const providerCustomModels = customModels[provider] || [];
  
  if (providerCustomModels.includes(trimmedName)) {
    const errorMsg = locale.addModelAlreadyExists || 'This model already exists';
    alert(errorMsg);
    return;
  }
  
  // Add model
  await addCustomModel(trimmedName);
}

// Add custom model to storage
async function addCustomModel(modelValue) {
  const provider = elements.apiProviderSelect.value;
  
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
  const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
  
  if (!customModels[provider]) {
    customModels[provider] = [];
  }
  
  if (!customModels[provider].includes(modelValue)) {
    customModels[provider].push(modelValue);
    await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_MODELS]: customModels });
    
    // Update model list
    await updateModelList();
    
    // Select the newly added model
    if (elements.modelSelect) {
      elements.modelSelect.value = modelValue;
      await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: modelValue });
    }
  }
}

// Hide default model from list
async function hideDefaultModel(modelValue) {
  const provider = elements.apiProviderSelect.value;
  
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.HIDDEN_MODELS]);
  const hiddenModels = storageResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
  
  if (!hiddenModels[provider]) {
    hiddenModels[provider] = [];
  }
  
  if (!hiddenModels[provider].includes(modelValue)) {
    hiddenModels[provider].push(modelValue);
    await chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN_MODELS]: hiddenModels });
    
    // If hidden model was selected, select first available model
    if (elements.modelSelect && elements.modelSelect.value === modelValue) {
      const firstOption = elements.modelSelect.options[0];
      if (firstOption) {
        elements.modelSelect.value = firstOption.value;
        await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: firstOption.value });
      }
    }
    
    // Update model list
    await updateModelList();
    
    // Update custom dropdown if visible
    if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
      await showCustomModelDropdown();
    }
  }
}

// Remove custom model from storage
async function removeCustomModel(modelValue) {
  const provider = elements.apiProviderSelect.value;
  
  const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
  const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
  
  if (customModels[provider]) {
    customModels[provider] = customModels[provider].filter(m => m !== modelValue);
    await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_MODELS]: customModels });
    
    // If removed model was selected, select first available model
    if (elements.modelSelect && elements.modelSelect.value === modelValue) {
      const firstOption = elements.modelSelect.options[0];
      if (firstOption) {
        elements.modelSelect.value = firstOption.value;
        await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: firstOption.value });
      }
    }
    
    // Update model list
    await updateModelList();
    
    // Update custom dropdown if visible
    if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
      await showCustomModelDropdown();
    }
  }
}

// Load saved settings from storage
// Update API provider UI (label, placeholder, model list)
async function updateApiProviderUI() {
  if (!elements.apiProviderSelect || !elements.apiKeyLabel || !elements.apiKey) return;
  
  const provider = elements.apiProviderSelect.value;
  const uiLang = await getUILanguage();
  const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
  
  let labelKey, placeholderKey, placeholderText;
  
  if (provider === 'openai') {
    labelKey = 'openaiApiKey';
    placeholderKey = 'enterOpenAiApiKey';
    placeholderText = 'sk-...';
  } else if (provider === 'claude') {
    labelKey = 'claudeApiKey';
    placeholderKey = 'enterClaudeApiKey';
    placeholderText = 'sk-ant-...';
  } else if (provider === 'gemini') {
    labelKey = 'geminiApiKey';
    placeholderKey = 'enterGeminiApiKey';
    placeholderText = 'AIza...';
  } else if (provider === 'grok') {
    labelKey = 'grokApiKey';
    placeholderKey = 'enterGrokApiKey';
    placeholderText = 'xai-...';
  } else if (provider === 'openrouter') {
    labelKey = 'openrouterApiKey';
    placeholderKey = 'enterOpenRouterApiKey';
    placeholderText = 'sk-or-...';
  }
  
  if (labelKey && elements.apiKeyLabel) {
    elements.apiKeyLabel.textContent = locale[labelKey] || labelKey;
    elements.apiKeyLabel.setAttribute('data-i18n', labelKey);
  }
  
  if (placeholderKey && elements.apiKey) {
    const placeholder = locale[placeholderKey] || placeholderText;
    elements.apiKey.setAttribute('data-i18n-placeholder', placeholderKey);
    elements.apiKey.placeholder = placeholder;
  }
  
  // Update model list based on provider
  await updateModelList();
}

// loadSettings() moved to settings.js module
// Use window.settingsModule.loadSettings() instead

// Setup event listeners
function setupEventListeners() {
  log('setupEventListeners: starting');
  
  if (elements.toggleApiKey && elements.apiKey) {
    elements.toggleApiKey.addEventListener('click', async () => {
      const input = elements.apiKey;
      if (!input) return;
      const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted; // Store decrypted for quick hide
        } catch (error) {
          logError('Failed to decrypt API key', error);
          // If decryption fails, try to use current value if it's not masked
          if (!input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('****')) {
        // Key is already visible or not masked
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      if (elements.toggleApiKey) {
        elements.toggleApiKey.querySelector('.eye-icon').textContent = '🔒';
      }
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      if (elements.toggleApiKey) {
        elements.toggleApiKey.querySelector('.eye-icon').textContent = '👁';
      }
    }
  });
  }

  if (elements.toggleClaudeApiKey && elements.claudeApiKey) {
    elements.toggleClaudeApiKey.addEventListener('click', async () => {
      const input = elements.claudeApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          logError('Failed to decrypt API key', error);
          if (!input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '👁';
      }
    });
  }

  if (elements.toggleGeminiApiKey && elements.geminiApiKey) {
    elements.toggleGeminiApiKey.addEventListener('click', async () => {
      const input = elements.geminiApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          logError('Failed to decrypt API key', error);
          if (!input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '👁';
      }
    });
  }

  elements.toggleGoogleApiKey.addEventListener('click', async () => {
    const input = elements.googleApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          logError('Failed to decrypt API key', error);
          if (!input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '👁';
    }
  });

  // API provider selector change handler
  if (elements.apiProviderSelect) {
    elements.apiProviderSelect.addEventListener('change', async () => {
      // Close custom dropdown when provider changes
      if (elements.customModelDropdown) {
        elements.customModelDropdown.style.display = 'none';
      }
      const provider = elements.apiProviderSelect.value;
      
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
          elements.toggleApiKey.querySelector('.eye-icon').textContent = '👁';
        }
      }
      
      // Update UI (label, placeholder)
      if (window.settingsModule) {
        await window.settingsModule.updateApiProviderUI();
      } else {
        await updateApiProviderUI();
      }
    });
  }

  if (elements.saveApiKey) {
    elements.saveApiKey.addEventListener('click', () => {
      if (window.settingsModule) {
        window.settingsModule.saveApiKey();
      } else {
        saveApiKey();
      }
    });
  }

  if (elements.toggleSettings) {
    elements.toggleSettings.addEventListener('click', () => {
      const isOpen = elements.settingsPanel.classList.contains('open');
      
      if (isOpen) {
        elements.settingsPanel.classList.remove('open');
      } else {
        // Opening - close stats if open
        if (elements.statsPanel && elements.statsPanel.classList.contains('open')) {
          elements.statsPanel.classList.remove('open');
        }
        if (elements.settingsPanel) {
          elements.settingsPanel.classList.add('open');
        }
      }
    });
  }

  if (elements.toggleStats) {
    elements.toggleStats.addEventListener('click', async () => {
    const isOpen = elements.statsPanel.classList.contains('open');
    
    if (isOpen) {
      elements.statsPanel.classList.remove('open');
    } else {
      // Opening - close settings if open
      if (elements.settingsPanel.classList.contains('open')) {
        elements.settingsPanel.classList.remove('open');
      }
      
      // Load data BEFORE opening
      await loadAndDisplayStats();
      
      // Then open
      if (elements.statsPanel) {
        elements.statsPanel.classList.add('open');
      }
    }
  });
  }

  if (elements.clearStatsBtn) {
    elements.clearStatsBtn.addEventListener('click', async () => {
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    const clearStatsConfirm = locale.clearAllStatisticsConfirm || UI_LOCALES.en.clearAllStatisticsConfirm;
    if (confirm(clearStatsConfirm)) {
      await chrome.runtime.sendMessage({ action: 'clearStats' });
      await loadAndDisplayStats();
      const locale = await t('statisticsCleared');
      showToast(locale, 'success');
    }
  });
  }

  if (elements.clearCacheBtn) {
    elements.clearCacheBtn.addEventListener('click', async () => {
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    const clearCacheConfirm = locale.clearSelectorCacheConfirm || UI_LOCALES.en.clearSelectorCacheConfirm;
    if (confirm(clearCacheConfirm)) {
      await chrome.runtime.sendMessage({ action: 'clearSelectorCache' });
      await loadAndDisplayStats();
      const locale = await t('cacheCleared');
      showToast(locale, 'success');
    }
  });
  }

  if (elements.exportSettingsBtn) {
    elements.exportSettingsBtn.addEventListener('click', async () => {
    try {
      // Simple confirm dialogs
      const includeStatsText = await t('includeStatisticsInExport');
      const includeCacheText = await t('includeSelectorCacheInExport');
      
      const includeStats = window.confirm(includeStatsText || 'Include statistics in export?');
      const includeCache = window.confirm(includeCacheText || 'Include selector cache in export?');
      
      elements.exportSettingsBtn.disabled = true;
      const exportingText = await t('exporting');
      elements.exportSettingsBtn.textContent = exportingText;
      
      const response = await chrome.runtime.sendMessage({
        action: 'exportSettings',
        includeStats,
        includeCache
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Download file
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `clipaible-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(url);
      }
      
      const settingsExportedText = await t('settingsExportedSuccessfully');
      showToast(settingsExportedText, 'success');
    } catch (error) {
      logError('Export failed', error);
      const exportFailedText = await t('exportFailed');
      showToast(`${exportFailedText}: ${error.message}`, 'error');
    } finally {
      elements.exportSettingsBtn.disabled = false;
      const exportSettingsText = await t('exportSettings');
      elements.exportSettingsBtn.textContent = exportSettingsText;
    }
  });
  }

  if (elements.importSettingsBtn && elements.importFileInput) {
    elements.importSettingsBtn.addEventListener('click', () => {
      elements.importFileInput.click();
    });

    elements.importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
      
      // Parse to check if valid
      const data = JSON.parse(text);
      if (!data.settings) {
        throw new Error('Invalid export file');
      }
      
      // Simple confirm dialogs
      const importStatsText = await t('includeStatisticsInImport');
      const importCacheText = await t('includeSelectorCacheInImport');
      const overwriteText = await t('overwriteExistingSettings');
      
      const importStats = data.statistics && window.confirm(importStatsText || 'Import statistics (if present)?');
      const importCache = data.selectorCache && window.confirm(importCacheText || 'Import selector cache (if present)?');
      const overwriteExisting = window.confirm(overwriteText || 'Overwrite existing settings?');
      
      elements.importSettingsBtn.disabled = true;
      const importingText = await t('importing');
      elements.importSettingsBtn.textContent = importingText;
      
      const response = await chrome.runtime.sendMessage({
        action: 'importSettings',
        jsonData: text,
        options: {
          importStats,
          importCache,
          overwriteExisting
        }
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      const result = response.result;
      let message = `Imported ${result.settingsImported} settings`;
      if (result.settingsSkipped > 0) {
        message += `, ${result.settingsSkipped} skipped`;
      }
      if (result.statsImported) message += ', statistics';
      if (result.cacheImported) message += ', cache';
      
      showToast(message, 'success');
      
      // Reload settings and stats
      if (window.settingsModule && window.settingsModule.loadSettings) {
        await window.settingsModule.loadSettings();
      }
      await loadAndDisplayStats();
      
      // Update model list if custom_models or hidden_models were imported
      if (result.settingsImported > 0) {
        if (window.settingsModule) {
          await window.settingsModule.updateModelList();
        } else {
          await updateModelList();
        }
      }
      
      // Reload page to apply settings
      if (result.settingsImported > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
      
    } catch (error) {
      logError('Import failed', error);
      const importFailedText = await t('importFailed');
      showToast(`${importFailedText}: ${error.message}`, 'error');
    } finally {
      elements.importSettingsBtn.disabled = false;
      const importSettingsText = await t('importSettings');
      elements.importSettingsBtn.textContent = importSettingsText;
      elements.importFileInput.value = ''; // Reset input
    }
    });
  }

  elements.modelSelect.addEventListener('change', async () => {
    const selectedModel = elements.modelSelect.value;
    const provider = elements.apiProviderSelect?.value || 'openai';
    
    // Save to general model key (for backward compatibility)
    debouncedSaveSettings(STORAGE_KEYS.MODEL, selectedModel);
    
    // Save to provider-specific storage
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
    const modelsByProvider = storageResult[STORAGE_KEYS.MODEL_BY_PROVIDER] || {};
    await chrome.storage.local.set({
      [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
        ...modelsByProvider,
        [provider]: selectedModel
      }
    });
  });

  // Add model button handler
  if (elements.addModelBtn) {
    elements.addModelBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.settingsModule) {
        await window.settingsModule.showAddModelDialog();
      } else {
        await showAddModelDialog();
      }
    });
  }

  // Show custom dropdown on model select click
  // Track when dropdown was opened to prevent race condition
  let dropdownOpenTime = 0;
  
  if (elements.modelSelect) {
    // Use mousedown to intercept before native dropdown opens
    elements.modelSelect.addEventListener('mousedown', async (e) => {
      const isVisible = elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none';
      
      if (isVisible) {
        // If dropdown is visible, close it without opening native dropdown
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        elements.customModelDropdown.style.display = 'none';
      } else {
        // If dropdown is not visible, prevent native dropdown and show custom one
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        dropdownOpenTime = Date.now();
        if (window.settingsModule) {
          await window.settingsModule.showCustomModelDropdown();
        } else {
          await showCustomModelDropdown();
        }
      }
    }, true); // Use capture phase

    // Model select change handler - update custom dropdown if visible
    elements.modelSelect.addEventListener('change', async () => {
      // Update custom dropdown if it's visible (for when user uses keyboard navigation)
      if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
        if (window.settingsModule) {
          await window.settingsModule.showCustomModelDropdown();
        } else {
          await showCustomModelDropdown();
        }
      }
    });
  }

  // Close custom dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdownDisplay = elements.customModelDropdown?.style.display;
    const now = Date.now();
    const timeSinceOpen = now - dropdownOpenTime;
    
    if (!elements.customModelDropdown || dropdownDisplay === 'none') {
      return;
    }
    
    // Don't close if dropdown was just opened (within 150ms) - prevents race condition
    if (timeSinceOpen < 150) {
      return;
    }
    
    // Don't close if click is inside dropdown, on select, or on add button
    if (elements.customModelDropdown.contains(e.target) ||
        (elements.modelSelect && elements.modelSelect.contains(e.target)) ||
        (elements.addModelBtn && elements.addModelBtn.contains(e.target))) {
      return;
    }
    
    // Close dropdown
    elements.customModelDropdown.style.display = 'none';
  });

  elements.modeSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.MODE, elements.modeSelect.value, async () => {
      if (window.settingsModule) {
        await window.settingsModule.updateModeHint();
        window.settingsModule.updateCacheVisibility();
      } else {
        await updateModeHint();
        updateCacheVisibility();
      }
    });
  });

  elements.useCache.addEventListener('change', async () => {
    const value = elements.useCache.checked;
    // Save immediately (not debounced) to ensure it's preserved
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.USE_CACHE]: value });
    } catch (error) {
      logError('Failed to save use_selector_cache setting', error);
    }
  });
  
  // Handle enableCache checkbox in stats section - INDEPENDENT setting, does NOT affect useCache
  if (elements.enableCache) {
    elements.enableCache.addEventListener('change', async () => {
      const value = elements.enableCache.checked;
      // Save immediately (not debounced) to ensure it's preserved
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_CACHE]: value });
      } catch (error) {
        logError('Failed to save enable_selector_caching setting', error);
      }
    });
  }
  
  // Handle enableStats checkbox in stats section
  if (elements.enableStats) {
    elements.enableStats.addEventListener('change', async () => {
      const value = elements.enableStats.checked;
      // Save immediately (not debounced) to ensure it's preserved
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: value });
      } catch (error) {
        logError('Failed to save enable_statistics setting', error);
      }
    });
  }
  
  /**
   * Event listener for output format change
   * When format changes, update UI visibility and save setting
   */
  elements.outputFormat.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, elements.outputFormat.value, async () => {
      // Sync main format select
      if (elements.mainFormatSelect) {
        elements.mainFormatSelect.value = elements.outputFormat.value;
      }
      // updateOutputFormatUI() handles all UI visibility updates based on format
      // It calls updateAudioProviderUI() and updateTranslationVisibility() internally
      if (window.settingsModule) {
        await window.settingsModule.updateOutputFormatUI();
      } else {
        await updateOutputFormatUI();
      }
    });
  });
  
  // Sync main format select with settings format
  if (elements.mainFormatSelect) {
    elements.mainFormatSelect.addEventListener('change', () => {
      elements.outputFormat.value = elements.mainFormatSelect.value;
      debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, elements.mainFormatSelect.value, async () => {
        if (window.settingsModule) {
          await window.settingsModule.updateOutputFormatUI();
        } else {
          await updateOutputFormatUI();
        }
      });
    });
  }

  elements.generateToc.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.GENERATE_TOC, elements.generateToc.checked);
  });
  
  elements.generateAbstract.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.GENERATE_ABSTRACT, elements.generateAbstract.checked);
  });

  elements.pageMode.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.PAGE_MODE, elements.pageMode.value);
  });

  elements.languageSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.LANGUAGE, elements.languageSelect.value, async () => {
      if (window.settingsModule) {
        await window.settingsModule.updateTranslationVisibility();
      } else {
        await updateTranslationVisibility();
      }
    });
  });

  elements.translateImages.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.TRANSLATE_IMAGES, elements.translateImages.checked, async () => {
      if (window.settingsModule) {
        await window.settingsModule.updateTranslationVisibility();
      } else {
        await updateTranslationVisibility();
      }
    });
  });
  
  // Style preset handler
  elements.stylePreset.addEventListener('change', async () => {
    const preset = elements.stylePreset.value;
    
    // Save preset immediately (no debounce) to ensure it's saved
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: preset });
    } catch (error) {
      logError('Failed to save style preset', error);
    }
    
    if (preset !== 'custom' && STYLE_PRESETS[preset]) {
      // Apply preset colors immediately (UI update)
      const colors = STYLE_PRESETS[preset];
      
      elements.bgColor.value = colors.bgColor;
      elements.bgColorText.value = colors.bgColor;
      elements.textColor.value = colors.textColor;
      elements.textColorText.value = colors.textColor;
      elements.headingColor.value = colors.headingColor;
      elements.headingColorText.value = colors.headingColor;
      elements.linkColor.value = colors.linkColor;
      elements.linkColorText.value = colors.linkColor;
      
      // Save all colors immediately (no debounce) to ensure they're saved
      try {
        await chrome.storage.local.set({
          [STORAGE_KEYS.BG_COLOR]: colors.bgColor,
          [STORAGE_KEYS.TEXT_COLOR]: colors.textColor,
          [STORAGE_KEYS.HEADING_COLOR]: colors.headingColor,
          [STORAGE_KEYS.LINK_COLOR]: colors.linkColor
        });
      } catch (error) {
        logError('Failed to save preset colors', error);
      }
    }
  });

  // Custom font family dropdown
  elements.fontFamilyTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = elements.fontFamilyContainer.classList.contains('open');
    
    // Close all other custom selects
    document.querySelectorAll('.custom-select.open').forEach(otherSelect => {
      if (otherSelect !== elements.fontFamilyContainer) {
        otherSelect.classList.remove('open');
      }
    });
    
    // Close model dropdown if open
    if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
      elements.customModelDropdown.style.display = 'none';
    }
    
    // Toggle current select
    if (isOpen) {
      elements.fontFamilyContainer.classList.remove('open');
    } else {
      elements.fontFamilyContainer.classList.add('open');
    }
  });

  elements.fontFamilyOptions.addEventListener('click', async (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    
    const value = option.dataset.value;
    const text = option.textContent;
    const fontStyle = option.style.fontFamily;
    
    // Update hidden input
    elements.fontFamily.value = value;
    
    // Update display with same font style
    elements.fontFamilyValue.textContent = text;
    elements.fontFamilyValue.style.fontFamily = fontStyle;
    
    // Update selected state
    elements.fontFamilyOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');
    
    // Close dropdown
    elements.fontFamilyContainer.classList.remove('open');
    
    // Save setting
    debouncedSaveSettings(STORAGE_KEYS.FONT_FAMILY, value);
  });

  // Close dropdown when clicking outside
  // Global click handler to close all custom selects when clicking outside
  // (This is added once, not per select)
  if (!window.customSelectClickHandlerAdded) {
    document.addEventListener('click', (e) => {
      // Close all custom selects if click is outside
      document.querySelectorAll('.custom-select.open').forEach(select => {
        if (!select.contains(e.target)) {
          select.classList.remove('open');
        }
      });
      
      // Also close font family dropdown if open
      if (elements.fontFamilyContainer && !elements.fontFamilyContainer.contains(e.target)) {
        elements.fontFamilyContainer.classList.remove('open');
      }
      
      // Also close model dropdown if open and click is outside
      if (elements.customModelDropdown && 
          elements.customModelDropdown.style.display !== 'none' &&
          !elements.customModelDropdown.contains(e.target) &&
          !(elements.modelSelect && elements.modelSelect.contains(e.target)) &&
          !(elements.addModelBtn && elements.addModelBtn.contains(e.target))) {
        elements.customModelDropdown.style.display = 'none';
      }
    });
    window.customSelectClickHandlerAdded = true;
  }

  elements.fontSize.addEventListener('change', () => {
    const size = parseInt(elements.fontSize.value) || 31;
    elements.fontSize.value = size;
    debouncedSaveSettings(STORAGE_KEYS.FONT_SIZE, String(size));
  });

  // Color handlers - sync picker and text input
  // Helper to switch to custom preset when colors are changed manually
  function setPresetToCustom() {
    if (elements.stylePreset.value !== 'custom') {
      elements.stylePreset.value = 'custom';
      chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: 'custom' });
    }
  }

  elements.bgColor.addEventListener('input', () => { elements.bgColorText.value = elements.bgColor.value; });
  elements.bgColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColor.value);
  });
  elements.bgColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.bgColorText.value)) {
      elements.bgColor.value = elements.bgColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColorText.value);
    } else { elements.bgColorText.value = elements.bgColor.value; }
  });

  elements.textColor.addEventListener('input', () => { elements.textColorText.value = elements.textColor.value; });
  elements.textColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColor.value);
  });
  elements.textColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.textColorText.value)) {
      elements.textColor.value = elements.textColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColorText.value);
    } else { elements.textColorText.value = elements.textColor.value; }
  });

  elements.headingColor.addEventListener('input', () => { elements.headingColorText.value = elements.headingColor.value; });
  elements.headingColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColor.value);
  });
  elements.headingColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.headingColorText.value)) {
      elements.headingColor.value = elements.headingColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColorText.value);
    } else { elements.headingColorText.value = elements.headingColor.value; }
  });

  elements.linkColor.addEventListener('input', () => { elements.linkColorText.value = elements.linkColor.value; });
  elements.linkColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColor.value);
  });
  elements.linkColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.linkColorText.value)) {
      elements.linkColor.value = elements.linkColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColorText.value);
    } else { elements.linkColorText.value = elements.linkColor.value; }
  });

  // Reset individual settings
  document.querySelectorAll('.btn-reset-inline').forEach(btn => {
    btn.addEventListener('click', async () => {
      const resetType = btn.dataset.reset;
      if (window.settingsModule) {
        await window.settingsModule.resetStyleSetting(resetType);
      } else {
        await resetStyleSetting(resetType);
      }
    });
  });

  // Reset all styles
  elements.resetStylesBtn.addEventListener('click', async () => {
    if (window.settingsModule) {
      await window.settingsModule.resetAllStyles();
    } else {
      await resetAllStyles();
    }
  });

  elements.savePdfBtn.addEventListener('click', handleSavePdf);
  elements.cancelBtn.addEventListener('click', handleCancel);
  
  // Summary handlers
  if (elements.generateSummaryBtn) {
    elements.generateSummaryBtn.addEventListener('click', handleGenerateSummary);
  }
  if (elements.summaryToggle) {
    elements.summaryToggle.addEventListener('click', toggleSummary);
  }
  if (elements.summaryCopyBtn) {
    elements.summaryCopyBtn.addEventListener('click', copySummary);
  }
  if (elements.summaryDownloadBtn) {
    elements.summaryDownloadBtn.addEventListener('click', downloadSummary);
  }
  if (elements.summaryCloseBtn) {
    elements.summaryCloseBtn.addEventListener('click', closeSummary);
  }
  
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.THEME, elements.themeSelect.value, () => {
        applyTheme();
      });
    });
  }
  
  if (elements.uiLanguageSelect) {
    elements.uiLanguageSelect.addEventListener('change', async () => {
      const langCode = elements.uiLanguageSelect.value;
      await setUILanguage(langCode);
      await applyLocalization();
      // Reload settings to update all UI text
      if (window.settingsModule && window.settingsModule.loadSettings) {
        await window.settingsModule.loadSettings();
      }
      // Update custom selects after localization
      initAllCustomSelects();
    });
  }
  
  // Audio settings handlers
  if (elements.elevenlabsModel) {
    elements.elevenlabsModel.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_MODEL, elements.elevenlabsModel.value);
    });
  }
  
  if (elements.elevenlabsFormat) {
    elements.elevenlabsFormat.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_FORMAT, elements.elevenlabsFormat.value);
    });
  }
  
  elements.audioVoice.addEventListener('change', () => {
    const provider = elements.audioProvider?.value || 'openai';
    if (window.settingsModule) {
      window.settingsModule.saveAudioVoice(provider, elements.audioVoice.value);
    } else {
      saveAudioVoice(provider, elements.audioVoice.value);
    }
  });
  
  elements.audioSpeed.addEventListener('input', () => {
    const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
    elements.audioSpeedValue.textContent = speed + 'x';
  });
  
  elements.audioSpeed.addEventListener('change', () => {
    const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_SPEED, speed);
  });
  
  // ElevenLabs advanced settings
  if (elements.elevenlabsStability) {
    elements.elevenlabsStability.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsStability.value);
      elements.elevenlabsStabilityValue.textContent = value.toFixed(1);
    });
    
    elements.elevenlabsStability.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsStability.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STABILITY, value);
    });
  }
  
  if (elements.elevenlabsSimilarity) {
    elements.elevenlabsSimilarity.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsSimilarity.value);
      elements.elevenlabsSimilarityValue.textContent = value.toFixed(1);
    });
    
    elements.elevenlabsSimilarity.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsSimilarity.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SIMILARITY, value);
    });
  }
  
  if (elements.elevenlabsStyle) {
    elements.elevenlabsStyle.addEventListener('input', () => {
      const value = parseFloat(elements.elevenlabsStyle.value);
      elements.elevenlabsStyleValue.textContent = value.toFixed(1);
    });
    
    elements.elevenlabsStyle.addEventListener('change', () => {
      const value = parseFloat(elements.elevenlabsStyle.value);
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STYLE, value);
    });
  }
  
  if (elements.elevenlabsSpeakerBoost) {
    elements.elevenlabsSpeakerBoost.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST, elements.elevenlabsSpeakerBoost.checked);
    });
  }
  
  // OpenAI instructions
  if (elements.openaiInstructions) {
    elements.openaiInstructions.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.OPENAI_INSTRUCTIONS, elements.openaiInstructions.value.trim());
    });
  }
  
  // Audio provider handler
  if (elements.audioProvider) {
    /**
     * Event listener for audio provider change
     * When provider changes, update voice list and provider-specific UI visibility
     */
    elements.audioProvider.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.AUDIO_PROVIDER, elements.audioProvider.value, () => {
        if (window.settingsModule) {
          // Update voice list first (populates dropdown with provider-specific voices)
          window.settingsModule.updateVoiceList(elements.audioProvider.value);
          // Then update UI visibility (shows/hides provider-specific fields)
          window.settingsModule.updateAudioProviderUI();
        } else {
          // Update voice list first (populates dropdown with provider-specific voices)
          updateVoiceList(elements.audioProvider.value);
          // Then update UI visibility (shows/hides provider-specific fields)
          updateAudioProviderUI();
        }
      });
    });
  }
  
  if (elements.googleTtsModel) {
    elements.googleTtsModel.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_MODEL, elements.googleTtsModel.value);
    });
  }
  
  if (elements.googleTtsVoice) {
    elements.googleTtsVoice.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_VOICE, elements.googleTtsVoice.value);
    });
  }
  
  
  if (elements.googleTtsPrompt) {
    elements.googleTtsPrompt.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_PROMPT, elements.googleTtsPrompt.value.trim());
    });
  }
  
  // Respeecher advanced settings
  if (elements.respeecherTemperature) {
    elements.respeecherTemperature.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherTemperature.value).toFixed(1);
      if (elements.respeecherTemperatureValue) {
        elements.respeecherTemperatureValue.textContent = value;
      }
    });
    
    elements.respeecherTemperature.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherTemperature.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TEMPERATURE, value);
    });
  }
  
  if (elements.respeecherRepetitionPenalty) {
    elements.respeecherRepetitionPenalty.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherRepetitionPenalty.value).toFixed(1);
      if (elements.respeecherRepetitionPenaltyValue) {
        elements.respeecherRepetitionPenaltyValue.textContent = value;
      }
    });
    
    elements.respeecherRepetitionPenalty.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherRepetitionPenalty.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY, value);
    });
  }
  
  if (elements.respeecherTopP) {
    elements.respeecherTopP.addEventListener('input', () => {
      const value = parseFloat(elements.respeecherTopP.value).toFixed(2);
      if (elements.respeecherTopPValue) {
        elements.respeecherTopPValue.textContent = value;
      }
    });
    
    elements.respeecherTopP.addEventListener('change', () => {
      const value = parseFloat(elements.respeecherTopP.value);
      debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TOP_P, value);
    });
  }
  
  // ElevenLabs API key handlers
  if (elements.toggleElevenlabsApiKey) {
    elements.toggleElevenlabsApiKey.addEventListener('click', async () => {
      const input = elements.elevenlabsApiKey;
      const isPassword = input.type === 'password';
      const eyeIcon = elements.toggleElevenlabsApiKey.querySelector('.eye-icon');
      
      if (isPassword) {
        if (input.dataset.encrypted) {
          try {
            const decrypted = await decryptApiKey(input.dataset.encrypted);
            input.value = decrypted;
            input.dataset.decrypted = decrypted;
          } catch (error) {
            logError('Failed to decrypt ElevenLabs API key', error);
            const errorMsg = await t('errorDecryptFailed');
            showToast(errorMsg, 'error');
            if (!input.value.startsWith('****')) {
              input.dataset.decrypted = input.value;
            }
          }
        } else if (input.value && !input.value.startsWith('****')) {
          input.dataset.decrypted = input.value;
        }
        input.type = 'text';
        if (eyeIcon) eyeIcon.textContent = '🔒';
      } else {
        if (input.dataset.decrypted) {
          input.value = maskApiKey(input.dataset.decrypted);
        } else {
          input.value = maskApiKey(input.value);
        }
        input.type = 'password';
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    });
  }
  
  if (elements.saveElevenlabsApiKey) {
    elements.saveElevenlabsApiKey.addEventListener('click', async () => {
      const key = elements.elevenlabsApiKey.value.trim();
      if (!key) {
        const pleaseEnterKeyText = await t('pleaseEnterElevenlabsApiKey');
        showToast(pleaseEnterKeyText, 'error');
        return;
      }
      
      // Skip if key is masked (already saved) - silently return
      if (key.startsWith('****') || key.startsWith('••••')) {
        return;
      }
      
      // Validate API key is ASCII only (required for HTTP headers)
      if (!/^[\x20-\x7E]+$/.test(key)) {
        const invalidKeyText = await t('invalidKeyFormat');
        showToast(invalidKeyText, 'error');
        return;
      }
      
      // Validate key looks like ElevenLabs format (typically starts with sk_ or is alphanumeric)
      if (key.length < 10) {
        const keyTooShortText = await t('keyTooShort');
        showToast(keyTooShortText, 'error');
        return;
      }
      
      try {
        const encrypted = await encryptApiKey(key);
        await chrome.storage.local.set({ [STORAGE_KEYS.ELEVENLABS_API_KEY]: encrypted });
        elements.elevenlabsApiKey.value = maskApiKey(key);
        elements.elevenlabsApiKey.type = 'password';
        elements.elevenlabsApiKey.dataset.encrypted = encrypted;
        if (elements.toggleElevenlabsApiKey) {
          elements.toggleElevenlabsApiKey.textContent = '👁';
        }
        const elevenlabsKeySavedText = await t('elevenlabsKeySaved');
        showToast(elevenlabsKeySavedText, 'success');
      } catch (error) {
        logError('Failed to save ElevenLabs API key', error);
        const failedToSaveText = await t('failedToSave');
        showToast(failedToSaveText, 'error');
      }
    });
  }
  
  // Qwen API key handlers
  if (elements.toggleQwenApiKey) {
    elements.toggleQwenApiKey.addEventListener('click', async () => {
      const input = elements.qwenApiKey;
      const isPassword = input.type === 'password';
      const eyeIcon = elements.toggleQwenApiKey.querySelector('.eye-icon');
      
      if (isPassword) {
        if (input.dataset.encrypted) {
          try {
            const decrypted = await decryptApiKey(input.dataset.encrypted);
            input.value = decrypted;
            input.dataset.decrypted = decrypted;
          } catch (error) {
            logError('Failed to decrypt Qwen API key', error);
            const errorMsg = await t('errorDecryptFailed');
            showToast(errorMsg, 'error');
            if (!input.value.startsWith('****')) {
              input.dataset.decrypted = input.value;
            }
          }
        } else if (input.value && !input.value.startsWith('****')) {
          input.dataset.decrypted = input.value;
        }
        input.type = 'text';
        if (eyeIcon) eyeIcon.textContent = '🔒';
      } else {
        if (input.dataset.decrypted) {
          input.value = maskApiKey(input.dataset.decrypted);
        } else {
          input.value = maskApiKey(input.value);
        }
        input.type = 'password';
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    });
  }
  
  if (elements.saveQwenApiKey) {
    elements.saveQwenApiKey.addEventListener('click', async () => {
      const key = elements.qwenApiKey.value.trim();
      if (!key) {
        const pleaseEnterKeyText = await t('pleaseEnterQwenApiKey');
        showToast(pleaseEnterKeyText, 'error');
        return;
      }
      
      // Skip if key is masked (already saved) - silently return
      if (key.startsWith('****') || key.startsWith('••••')) {
        return;
      }
      
      // Validate API key is ASCII only (required for HTTP headers)
      if (!/^[\x20-\x7E]+$/.test(key)) {
        const invalidKeyText = await t('invalidKeyFormat');
        showToast(invalidKeyText, 'error');
        return;
      }
      
      // Validate key looks like Qwen format (typically alphanumeric, at least 10 chars)
      if (key.length < 10) {
        const keyTooShortText = await t('keyTooShort');
        showToast(keyTooShortText, 'error');
        return;
      }
      
      try {
        const encrypted = await encryptApiKey(key);
        await chrome.storage.local.set({ [STORAGE_KEYS.QWEN_API_KEY]: encrypted });
        elements.qwenApiKey.value = maskApiKey(key);
        elements.qwenApiKey.type = 'password';
        elements.qwenApiKey.dataset.encrypted = encrypted;
        if (elements.toggleQwenApiKey) {
          elements.toggleQwenApiKey.querySelector('.eye-icon').textContent = '👁';
        }
        const qwenKeySavedText = await t('qwenKeySaved');
        showToast(qwenKeySavedText, 'success');
      } catch (error) {
        logError('Failed to save Qwen API key', error);
        const failedToSaveText = await t('failedToSave');
        showToast(failedToSaveText, 'error');
      }
    });
  }
  
  // Respeecher API key handlers
  if (elements.toggleRespeecherApiKey) {
    elements.toggleRespeecherApiKey.addEventListener('click', async () => {
      const input = elements.respeecherApiKey;
      const isPassword = input.type === 'password';
      const eyeIcon = elements.toggleRespeecherApiKey.querySelector('.eye-icon');
      
      if (isPassword) {
        if (input.dataset.encrypted) {
          try {
            const decrypted = await decryptApiKey(input.dataset.encrypted);
            input.value = decrypted;
            input.dataset.decrypted = decrypted;
          } catch (error) {
            logError('Failed to decrypt Respeecher API key', error);
            const errorMsg = await t('errorDecryptFailed');
            showToast(errorMsg, 'error');
            if (!input.value.startsWith('****')) {
              input.dataset.decrypted = input.value;
            }
          }
        } else if (input.value && !input.value.startsWith('****')) {
          input.dataset.decrypted = input.value;
        }
        input.type = 'text';
        if (eyeIcon) eyeIcon.textContent = '🔒';
      } else {
        if (input.dataset.decrypted) {
          input.value = maskApiKey(input.dataset.decrypted);
        } else {
          input.value = maskApiKey(input.value);
        }
        input.type = 'password';
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    });
  }
  
  if (elements.saveRespeecherApiKey) {
    elements.saveRespeecherApiKey.addEventListener('click', async () => {
      const key = elements.respeecherApiKey.value.trim();
      if (!key) {
        const pleaseEnterKeyText = await t('pleaseEnterRespecherApiKey');
        showToast(pleaseEnterKeyText, 'error');
        return;
      }
      
      // Skip if key is masked (already saved) - silently return
      if (key.startsWith('****') || key.startsWith('••••')) {
        return;
      }
      
      // Validate API key is ASCII only (required for HTTP headers)
      if (!/^[\x20-\x7E]+$/.test(key)) {
        const invalidKeyText = await t('invalidKeyFormat');
        showToast(invalidKeyText, 'error');
        return;
      }
      
      // Validate key length
      if (key.length < 10) {
        const keyTooShortText = await t('keyTooShort');
        showToast(keyTooShortText, 'error');
        return;
      }
      
      try {
        const encrypted = await encryptApiKey(key);
        await chrome.storage.local.set({ [STORAGE_KEYS.RESPEECHER_API_KEY]: encrypted });
        elements.respeecherApiKey.value = maskApiKey(key);
        elements.respeecherApiKey.type = 'password';
        elements.respeecherApiKey.dataset.encrypted = encrypted;
        if (elements.toggleRespeecherApiKey) {
          elements.toggleRespeecherApiKey.querySelector('.eye-icon').textContent = '👁';
        }
        const respeecherKeySavedText = await t('respeecherKeySaved');
        showToast(respeecherKeySavedText, 'success');
      } catch (error) {
        logError('Failed to save Respeecher API key', error);
        const failedToSaveText = await t('failedToSave');
        showToast(failedToSaveText, 'error');
      }
    });
  }
  
  // Google TTS API key handlers
  if (elements.toggleGoogleTtsApiKey) {
    elements.toggleGoogleTtsApiKey.addEventListener('click', async () => {
      const input = elements.googleTtsApiKey;
      const isPassword = input.type === 'password';
      const eyeIcon = elements.toggleGoogleTtsApiKey.querySelector('.eye-icon');
      
      if (isPassword) {
        if (input.dataset.encrypted) {
          try {
            const decrypted = await decryptApiKey(input.dataset.encrypted);
            input.value = decrypted;
            input.dataset.decrypted = decrypted;
          } catch (error) {
            logError('Failed to decrypt Google TTS API key', error);
            const errorMsg = await t('errorDecryptFailed');
            showToast(errorMsg, 'error');
            if (!input.value.startsWith('****')) {
              input.dataset.decrypted = input.value;
            }
          }
        } else if (input.value && !input.value.startsWith('****')) {
          input.dataset.decrypted = input.value;
        }
        input.type = 'text';
        if (eyeIcon) eyeIcon.textContent = '🔒';
      } else {
        if (input.dataset.decrypted) {
          input.value = maskApiKey(input.dataset.decrypted);
        } else {
          input.value = maskApiKey(input.value);
        }
        input.type = 'password';
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    });
  }
  
  if (elements.saveGoogleTtsApiKey) {
    elements.saveGoogleTtsApiKey.addEventListener('click', async () => {
      const key = elements.googleTtsApiKey.value.trim();
      if (!key) {
        const pleaseEnterKeyText = await t('pleaseEnterGoogleTtsApiKey');
        showToast(pleaseEnterKeyText, 'error');
        return;
      }
      
      // Skip if key is masked (already saved) - silently return
      if (key.startsWith('****') || key.startsWith('••••')) {
        return;
      }
      
      // Validate API key format (Google API keys start with AIza)
      if (!key.startsWith('AIza')) {
        const invalidKeyText = await t('invalidGoogleTtsKeyFormat');
        showToast(invalidKeyText, 'error');
        return;
      }
      
      // Validate API key is ASCII only
      if (!/^[\x20-\x7E]+$/.test(key)) {
        const invalidKeyText = await t('invalidKeyFormat');
        showToast(invalidKeyText, 'error');
        return;
      }
      
      // Validate key length
      if (key.length < 20) {
        const keyTooShortText = await t('keyTooShort');
        showToast(keyTooShortText, 'error');
        return;
      }
      
      try {
        const encrypted = await encryptApiKey(key);
        await chrome.storage.local.set({ [STORAGE_KEYS.GOOGLE_TTS_API_KEY]: encrypted });
        elements.googleTtsApiKey.value = maskApiKey(key);
        elements.googleTtsApiKey.type = 'password';
        elements.googleTtsApiKey.dataset.encrypted = encrypted;
        if (elements.toggleGoogleTtsApiKey) {
          elements.toggleGoogleTtsApiKey.querySelector('.eye-icon').textContent = '👁';
        }
        const googleTtsKeySavedText = await t('googleTtsKeySaved');
        showToast(googleTtsKeySavedText, 'success');
      } catch (error) {
        logError('Failed to save Google TTS API key', error);
        const failedToSaveText = await t('failedToSave');
        showToast(failedToSaveText, 'error');
      }
    });
  }
}

// Apply theme based on user preference or system preference (kept for backward compatibility, now uses uiModule)
function applyTheme() {
  if (window.uiModule) {
    return window.uiModule.applyTheme();
  }
  if (!elements.themeSelect) {
    return; // Theme select not available, skip
  }
  const theme = elements.themeSelect.value;
  let actualTheme = theme;
  
  if (theme === 'auto') {
    // Detect system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    actualTheme = prefersDark ? 'dark' : 'light';
  }
  
  document.body.setAttribute('data-theme', actualTheme);
  document.documentElement.setAttribute('data-theme', actualTheme);
  
  // Listen for system theme changes if auto is selected
  if (theme === 'auto') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e) => {
      const newTheme = e.matches ? 'dark' : 'light';
      document.body.setAttribute('data-theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    };
    
    // Remove old listener if exists
    if (window.themeChangeListener) {
      mediaQuery.removeListener(window.themeChangeListener);
    }
    
    window.themeChangeListener = handleThemeChange;
    mediaQuery.addListener(handleThemeChange);
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

// Handle Cancel button click
async function handleCancel() {
  if (!elements.cancelBtn) {
    logWarn('Cancel button not found');
    return;
  }
  try {
    // Disable button to prevent double-clicks
    elements.cancelBtn.disabled = true;
    await chrome.runtime.sendMessage({ action: 'cancelProcessing' });
    const cancelledText = await t('processingCancelled');
    showToast(cancelledText, 'success');
    const readyText = await t('ready');
    setStatus('ready', readyText);
    setProgress(0, false);
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    if (elements.cancelBtn) {
      elements.cancelBtn.style.display = 'none';
      elements.cancelBtn.disabled = false; // Re-enable for next time
    }
  } catch (error) {
    logError('Error cancelling', error);
    if (elements.cancelBtn) {
      elements.cancelBtn.disabled = false; // Re-enable on error
    }
  }
}

// Handle Generate Summary button click
async function handleGenerateSummary() {
  if (!elements.generateSummaryBtn || !elements.summaryContainer) {
    logWarn('Summary elements not found');
    return;
  }
  
  // CRITICAL: Check all required UI elements before proceeding
  const requiredElements = [
    'modelSelect',
    'apiKey',
    'modeSelect',
    'useCache'
  ];
  
  const missingElements = requiredElements.filter(key => !elements[key]);
  if (missingElements.length > 0) {
    logError('Required UI elements not found', { missingElements });
    const errorText = await t('uiElementsNotFound') || 'Required UI elements not found. Please refresh the page.';
    showToast(errorText, 'error');
    return;
  }
  
  // Variables for API key and model (used for both extraction and summary generation)
  let apiKey = null;
  let model = null;
  let provider = null;
  
  try {
    // CRITICAL: Clear old summary from storage FIRST, then set generating flag
    // This prevents checkSummaryStatus and loadSettings from restoring old summary
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.SUMMARY_GENERATING]: true,
      summary_generating_start_time: Date.now(),
      [STORAGE_KEYS.SUMMARY_TEXT]: null // Clear summary text
    });
    
    // Also explicitly remove from storage to ensure it's gone completely
    await chrome.storage.local.remove([STORAGE_KEYS.SUMMARY_TEXT, 'summary_saved_timestamp']);
    
    // CRITICAL: Clear old summary from UI
    // Hide summary container and clear content
    if (elements.summaryContainer) {
      elements.summaryContainer.style.display = 'none';
    }
    if (elements.summaryText) {
      elements.summaryText.innerHTML = '';
      elements.summaryText.dataset.originalMarkdown = '';
    }
    
    log('Old summary cleared from UI and storage before starting new generation');
    
    // CRITICAL: Disable button immediately and show status
    elements.generateSummaryBtn.disabled = true;
    const generatingText = await t('generatingSummary') || 'Generating summary...';
    elements.generateSummaryBtn.textContent = generatingText;
    log('Generate summary button clicked - flag set, button disabled and status updated', { text: generatingText });
    
    // Get current tab URL first - needed for validation
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    log('Tab query result', { 
      hasTab: !!tab, 
      tabId: tab?.id, 
      tabUrl: tab?.url,
      tabUrlType: typeof tab?.url,
      tabUrlLength: tab?.url?.length
    });
    
    if (!tab) {
      // CRITICAL: Clear generating flag if tab is not available
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SUMMARY_GENERATING]: false,
        summary_generating_start_time: null
      });
      
      logError('No tab found when generating summary');
      const noTabText = await t('noTabAvailable') || 'No active tab found. Please open a web page.';
      showToast(noTabText, 'error');
      elements.generateSummaryBtn.disabled = false;
      const generateSummaryText = await t('generateSummary') || 'Generate Summary';
      elements.generateSummaryBtn.textContent = generateSummaryText;
      return;
    }
    
    // Check if URL is accessible (not chrome://, about:, etc.)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      // CRITICAL: Clear generating flag if URL is not accessible
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SUMMARY_GENERATING]: false,
        summary_generating_start_time: null
      });
      
      logError('Tab URL is not accessible for content extraction', { url: tab.url, tabId: tab.id });
      const inaccessibleText = await t('pageNotAccessible') || 'This page is not accessible for content extraction. Please open a regular web page.';
      showToast(inaccessibleText, 'error');
      elements.generateSummaryBtn.disabled = false;
      const generateSummaryText = await t('generateSummary') || 'Generate Summary';
      elements.generateSummaryBtn.textContent = generateSummaryText;
      return;
    }
    
    const currentUrl = tab.url; // CRITICAL: Store URL for use in generateSummary
    
    // Normalize URLs for comparison (remove trailing slashes, fragments, etc.)
    function normalizeUrl(url) {
      if (!url) return '';
      try {
        const urlObj = new URL(url);
        // Remove fragment, normalize path
        urlObj.hash = '';
        let path = urlObj.pathname;
        if (path.endsWith('/') && path.length > 1) {
          path = path.slice(0, -1);
        }
        urlObj.pathname = path;
        return urlObj.toString();
      } catch {
        return url;
      }
    }
    
    // CRITICAL: Always extract content first (never use cached content from state/storage)
    // Flow: User clicks "Generate Summary" -> Extract content (with cache if enabled) -> Generate summary
    // If cached selectors exist and useCache is enabled, they will be used for faster extraction
    // But content is always extracted fresh for summary generation
    let contentItems = null;
    
    // Check if it's YouTube or regular page
    {
      // Check if it's YouTube
      const videoInfo = detectVideoPlatform(tab.url);
      
      if (videoInfo && videoInfo.platform === 'youtube') {
        // Extract and process YouTube subtitles
        // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
        elements.generateSummaryBtn.disabled = true;
        
        // CRITICAL: Ensure content script is loaded before extracting subtitles
        // Content script should be loaded via manifest.json, but give it time
        // Try sending a test message to content script to verify it's loaded
        let contentScriptLoaded = false;
        try {
          const pingResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
          if (pingResponse && pingResponse.success) {
            contentScriptLoaded = true;
            log('Content script is loaded and responding', { timestamp: pingResponse.timestamp });
          }
        } catch (pingError) {
          // Content script may not respond to ping - this is normal
          // Just give it some time to load
          logWarn('Content script ping failed or not responding (may be normal)', pingError);
        }
        
        // Small delay to ensure content script is loaded (if not already loaded)
        if (!contentScriptLoaded) {
          log('Waiting for content script to load...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        try {
          // CRITICAL: Call subtitle extraction through background script
          // This ensures correct context and access to content script
          // (same approach as PDF creation)
          const extractResponse = await chrome.runtime.sendMessage({
            action: 'extractYouTubeSubtitlesForSummary',
            data: { tabId: tab.id }
          });
          
          if (extractResponse.error) {
            throw new Error(extractResponse.error);
          }
          
          const subtitlesData = extractResponse.result;
          if (!subtitlesData || !subtitlesData.subtitles || subtitlesData.subtitles.length === 0) {
            // CRITICAL: Clear generating flag if no subtitles
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            
            const noSubtitlesText = await t('errorNoSubtitles') || 'No subtitles found.';
            showToast(noSubtitlesText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
          
          // CRITICAL: For YouTube, just convert subtitles to contentItems format
          // No selectors needed - subtitles are already extracted text
          // Then send generateSummary message directly
          contentItems = subtitlesData.subtitles.map(subtitle => ({
            type: 'paragraph',
            text: subtitle.text || subtitle
          }));
          
          // Get API key and model for summary generation
          model = elements.modelSelect.value;
          provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
          apiKey = elements.apiKey.value.trim();
          
          if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
            try {
              apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
            } catch (error) {
              logError('Failed to decrypt API key', error);
              
              // CRITICAL: Clear generating flag on error
              await chrome.storage.local.set({ 
                [STORAGE_KEYS.SUMMARY_GENERATING]: false,
                summary_generating_start_time: null
              });
              
              const failedDecryptText = await t('failedToDecryptApiKey') || 'Failed to decrypt API key';
              showToast(failedDecryptText, 'error');
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
              return;
            }
          }
          
          if (!apiKey) {
            // CRITICAL: Clear generating flag if no API key
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            
            const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'AI';
            const pleaseEnterKeyText = await t(`pleaseEnter${providerName}ApiKey`) || `Please enter ${providerName} API key`;
            showToast(pleaseEnterKeyText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
          
          // CRITICAL: For YouTube, send generateSummary message directly with subtitles
          // No need for extractContentOnly - subtitles are already extracted text
          // Generation will continue in background
          const targetLanguage = elements.languageSelect?.value || 'auto';
          const uiLanguage = await getUILanguage();
          const summaryLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
          
          log('Sending generateSummary for YouTube subtitles', {
            contentItemsCount: contentItems?.length || 0,
            model: model,
            url: currentUrl,
            language: summaryLanguage
          });
          
          try {
            const response = await chrome.runtime.sendMessage({
              action: 'generateSummary',
              data: {
                contentItems: contentItems,
                apiKey: apiKey,
                model: model,
                url: currentUrl,
                language: summaryLanguage
              }
            });
            
            log('generateSummary message sent for YouTube, received immediate response', { 
              started: response?.started,
              error: response?.error 
            });
            
            if (response?.error) {
              throw new Error(response.error);
            }
            
            if (!response?.started) {
              throw new Error('Summary generation failed to start');
            }
            
            // CRITICAL: Generation started in background - exit and let checkSummaryStatus handle completion
            log('Summary generation started in background for YouTube, exiting - checkSummaryStatus will handle completion');
            return; // Exit - checkSummaryStatus will poll and handle completion
          } catch (sendError) {
            logError('Failed to send generateSummary message for YouTube', sendError);
            
            // Clear flag on error
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            
            const errorText = await t('summaryGenerationError') || 'Error starting summary generation';
            showToast(errorText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
        } catch (error) {
          logError('Failed to extract/process YouTube subtitles', error);
          
          // CRITICAL: Clear generating flag on error
          await chrome.storage.local.set({ 
            [STORAGE_KEYS.SUMMARY_GENERATING]: false,
            summary_generating_start_time: null
          });
          
          const errorText = await t('errorSubtitleProcessingFailed') || 'Failed to process subtitles';
          showToast(errorText, 'error');
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          return;
        }
      } else {
        // Regular page - extract content first
        log('Regular page detected, starting content extraction for summary', {
          url: tab.url,
          tabId: tab.id
        });
        
        // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
        elements.generateSummaryBtn.disabled = true;
        
        // Get page data
        log('About to execute script to get page HTML...');
        const htmlResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title
          })
        });
        
        if (!htmlResult || !htmlResult[0] || !htmlResult[0].result) {
          const noContentText = await t('noContentAvailable') || 'No content available.';
          showToast(noContentText, 'error');
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          return;
        }
        
        log('HTML extraction script executed', {
          hasResult: !!htmlResult,
          hasFirstResult: !!htmlResult?.[0],
          hasResultData: !!htmlResult?.[0]?.result
        });
        
        const pageData = htmlResult[0].result;
        
        log('Page data extracted', {
          hasHtml: !!pageData?.html,
          htmlLength: pageData?.html?.length || 0,
          url: pageData?.url,
          title: pageData?.title
        });
        
        // Get API key and model (will be used for both extraction and summary generation)
        model = elements.modelSelect.value;
        provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
        apiKey = elements.apiKey.value.trim();
        
        if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
          try {
            apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
          } catch (error) {
            logError('Failed to decrypt API key', error);
            const failedDecryptText = await t('failedToDecryptApiKey') || 'Failed to decrypt API key';
            showToast(failedDecryptText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
        }
        
        if (!apiKey) {
          const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'AI';
          const pleaseEnterKeyText = await t(`pleaseEnter${providerName}ApiKey`) || `Please enter ${providerName} API key`;
          showToast(pleaseEnterKeyText, 'error');
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          return;
        }
        
        // Start extraction process (content only, no file generation)
        // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
        elements.generateSummaryBtn.disabled = true;
        
        log('About to send extractContentOnly request', {
          hasHtml: !!pageData.html,
          htmlLength: pageData.html?.length || 0,
          url: pageData.url,
          title: pageData.title,
          hasApiKey: !!apiKey,
          hasModel: !!model,
          mode: elements.modeSelect.value,
          tabId: tab.id
        });
        
        // Send extraction request (content only, no file generation)
        let extractResponse;
        try {
          log('Calling chrome.runtime.sendMessage for extractContentOnly...');
          // CRITICAL: Request auto-generate summary after extraction
          // This allows popup to close and summary will generate in background
          const targetLanguage = elements.languageSelect?.value || 'auto';
          const uiLanguage = await getUILanguage();
          const summaryLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
          
          extractResponse = await chrome.runtime.sendMessage({
            action: 'extractContentOnly',
            data: {
              html: pageData.html,
              url: pageData.url,
              title: pageData.title || tab.title,
              apiKey: apiKey,
              provider: provider,
              model: model,
              mode: elements.modeSelect.value,
              useCache: elements.useCache.checked,
              tabId: tab.id,
              autoGenerateSummary: true, // CRITICAL: Auto-generate summary after extraction
              language: summaryLanguage
            }
          });
          
          // Check for chrome.runtime.lastError
          if (chrome.runtime.lastError) {
            logError('extractContentOnly sendMessage error', chrome.runtime.lastError);
            throw new Error(chrome.runtime.lastError.message || 'Failed to communicate with background script');
          }
          
          log('extractContentOnly response received', {
            hasResponse: !!extractResponse,
            hasError: !!extractResponse?.error,
            hasResult: !!extractResponse?.result,
            hasContent: !!extractResponse?.result?.content,
            contentLength: extractResponse?.result?.content?.length || 0,
            responseType: typeof extractResponse,
            responseKeys: extractResponse ? Object.keys(extractResponse) : []
          });
        } catch (sendError) {
          logError('extractContentOnly sendMessage failed', sendError);
          logError('sendError details', {
            message: sendError.message,
            stack: sendError.stack,
            name: sendError.name,
            lastError: chrome.runtime.lastError?.message
          });
          throw sendError;
        }
        
        log('After extractContentOnly try-catch block', {
          hasExtractResponse: !!extractResponse,
          extractResponseType: typeof extractResponse,
          isNull: extractResponse === null,
          isUndefined: extractResponse === undefined,
          lastError: chrome.runtime.lastError?.message
        });
        
        // Check for chrome.runtime.lastError AFTER await (it might be set after async operation)
        if (chrome.runtime.lastError) {
          logError('extractContentOnly chrome.runtime.lastError after await', chrome.runtime.lastError);
          throw new Error(chrome.runtime.lastError.message || 'Failed to communicate with background script');
        }
        
        if (!extractResponse) {
          logError('extractContentOnly returned null/undefined response', {
            lastError: chrome.runtime.lastError?.message,
            responseType: typeof extractResponse
          });
          throw new Error('No response from background script. Service worker may have died.');
        }
        
        if (extractResponse.error) {
          logError('extractContentOnly returned error', extractResponse.error);
          throw new Error(extractResponse.error);
        }
        
        // CRITICAL: If extracting: true, background is handling extraction asynchronously
        // Don't check result - just exit and let checkSummaryStatus poll for completion
        if (extractResponse.extracting === true) {
          log('extractContentOnly started async extraction - background will handle summary generation', {
            success: extractResponse.success,
            extracting: extractResponse.extracting,
            timestamp: Date.now()
          });
          
          // CRITICAL: Exit here - background will handle extraction and summary generation
          // extractContentOnly with autoGenerateSummary: true automatically starts summary generation
          // checkSummaryStatus will poll and show result when ready
          return;
        }
        
        // If not async extraction, check result synchronously
        if (!extractResponse.result || !extractResponse.result.content || !Array.isArray(extractResponse.result.content) || extractResponse.result.content.length === 0) {
          logWarn('extractContentOnly returned empty or invalid content', {
            hasResult: !!extractResponse?.result,
            hasContent: !!extractResponse?.result?.content,
            isArray: Array.isArray(extractResponse?.result?.content),
            length: extractResponse?.result?.content?.length || 0
          });
          const noContentText = await t('noContentAvailable') || 'Failed to extract content.';
          showToast(noContentText, 'error');
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          return;
        }
        
        contentItems = extractResponse.result.content;
        log('Content extracted successfully for summary', { 
          contentItemsCount: contentItems?.length || 0,
          hasApiKey: !!apiKey,
          hasModel: !!model,
          contentItemsType: typeof contentItems,
          isArray: Array.isArray(contentItems),
          apiKeyValue: apiKey ? 'present' : 'missing',
          modelValue: model || 'missing',
          autoGenerateSummary: true // Background will auto-generate summary
        });
        
        // CRITICAL: Summary generation is handled automatically by background
        // Background received autoGenerateSummary: true flag and will start generation
        // Popup can close now - summary will generate in background
        log('extractContentOnly completed with autoGenerateSummary flag - background will handle summary generation', {
          contentItemsCount: contentItems?.length || 0,
          timestamp: Date.now()
        });
        
        // CRITICAL: Exit here - background will handle summary generation
        // extractContentOnly with autoGenerateSummary: true automatically starts summary generation
        // checkSummaryStatus will poll and show result when ready
        return;
      }
    }
    
  } catch (error) {
    logError('Error generating summary', error);
    
    // Clear generating flag on error
    try {
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SUMMARY_GENERATING]: false,
        summary_generating_start_time: null
      });
    } catch (storageError) {
      logError('Failed to clear summary_generating flag on error', storageError);
    }
    
    // Show user-friendly error message
    let errorText;
    if (error.message && error.message.includes('Required UI elements not found')) {
      errorText = await t('uiElementsNotFound') || 'Required UI elements not found. Please refresh the page.';
    } else if (error.message) {
      errorText = error.message;
    } else {
      errorText = await t('summaryGenerationError') || 'Error generating summary';
    }
    
    showToast(errorText, 'error');
    
    // Restore button
    if (elements.generateSummaryBtn) {
      elements.generateSummaryBtn.disabled = false;
      const generateSummaryText = await t('generateSummary') || 'Generate Summary';
      elements.generateSummaryBtn.textContent = generateSummaryText;
    }
  } finally {
    // CRITICAL: Restore button only if generation is not in progress
    // Check storage to see if generation is still in progress (may continue in background)
    // Use double-check to avoid race conditions
    try {
      const checkResult = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING, 'summary_generating_start_time']);
      
      // CRITICAL: Only restore button if flag is definitely false AND we're not in a race condition
      // If flag is true, keep button disabled - generation is in progress
      if (!checkResult[STORAGE_KEYS.SUMMARY_GENERATING]) {
        // Double-check: wait a tiny bit and check again to avoid race condition
        // where flag was just set but not yet visible
        await new Promise(resolve => setTimeout(resolve, 100));
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
        
        if (!doubleCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
          // Generation is complete or not in progress - restore button
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          log('Summary generation complete - button restored (double-checked)');
        } else {
          // Flag was set between checks - keep button disabled
          elements.generateSummaryBtn.disabled = true;
          const generatingText = await t('generatingSummary') || 'Generating summary...';
          elements.generateSummaryBtn.textContent = generatingText;
          log('Summary generation flag found on double-check - button kept disabled');
        }
      } else {
        // Generation is still in progress - keep button disabled and show status
        elements.generateSummaryBtn.disabled = true;
        const generatingText = await t('generatingSummary') || 'Generating summary...';
        elements.generateSummaryBtn.textContent = generatingText;
        log('Summary generation still in progress - button remains disabled');
      }
    } catch (checkError) {
      // If check fails, check one more time before restoring
      logWarn('Failed to check summary generation status, checking once more', checkError);
      try {
        const finalCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
        if (!finalCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
        } else {
          // Keep disabled if flag is set
          elements.generateSummaryBtn.disabled = true;
          const generatingText = await t('generatingSummary') || 'Generating summary...';
          elements.generateSummaryBtn.textContent = generatingText;
        }
      } catch (finalError) {
        // Last resort - restore button only if we can't check
        logWarn('Final check also failed, restoring button', finalError);
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
      }
    }
  }
}

// Convert markdown to HTML for display - simple version, keep lists as text
function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Code blocks first (to avoid processing markdown inside code)
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return id;
  });
  
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Headers (process from largest to smallest to avoid conflicts)
  // Process headers BEFORE converting newlines to preserve structure
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Horizontal rules (--- or ***)
  html = html.replace(/^(\s*[-*]{3,}\s*)$/gm, '<hr>');
  
  // Bold (must come before italic)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic (single asterisk/underscore, but not inside code)
  html = html.replace(/(?<!`)(?<!\*)\*(?!\*)([^*`]+?)(?<!\*)\*(?!\*)(?!`)/g, '<em>$1</em>');
  html = html.replace(/(?<!`)(?<!_)_(?!_)([^_`]+?)(?<!_)_(?!_)(?!`)/g, '<em>$1</em>');
  
  // Restore code blocks
  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`CODE_BLOCK_${index}`, codeBlock);
  });
  
  // Convert newlines to <br> - but preserve headers and horizontal rules (they already have their own structure)
  // Split by lines and process each line
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    // If line is already a header tag or horizontal rule, don't add <br> after it
    if (line.match(/^<(h[1-6])>.*<\/\1>$/)) {
      return line;
    }
    if (line.trim() === '<hr>') {
      return line;
    }
    // Otherwise, convert newline to <br> at the end
    return line + '<br>';
  });
  
  html = processedLines.join('');
  
  // Clean up: remove <br> before closing header tags and before/after horizontal rules
  html = html.replace(/<br><\/(h[1-6])>/g, '</$1>');
  html = html.replace(/<br><hr>/g, '<hr>');
  html = html.replace(/<hr><br>/g, '<hr>');
  
  return html;
}

// Toggle summary expand/collapse
function toggleSummary() {
  if (!elements.summaryContent || !elements.summaryToggle) return;
  
  const isExpanded = elements.summaryContent.classList.contains('expanded');
  const toggleIcon = elements.summaryToggle.querySelector('.summary-toggle-icon');
  
  if (isExpanded) {
    elements.summaryContent.classList.remove('expanded');
    if (toggleIcon) toggleIcon.textContent = '▶';
  } else {
    elements.summaryContent.classList.add('expanded');
    if (toggleIcon) toggleIcon.textContent = '▼';
  }
}

// Close summary
async function closeSummary() {
  if (!elements.summaryContainer) return;
  
  try {
    // Hide summary container
    elements.summaryContainer.style.display = 'none';
    
    // Clear summary text
    if (elements.summaryText) {
      elements.summaryText.innerHTML = '';
      elements.summaryText.dataset.originalMarkdown = '';
    }
    
    // Clear summary from storage completely
    await chrome.storage.local.remove([STORAGE_KEYS.SUMMARY_TEXT, 'summary_saved_timestamp']);
    
    log('Summary closed and cleared completely');
  } catch (error) {
    logError('Failed to close summary', error);
  }
}

// Copy summary to clipboard
async function copySummary() {
  if (!elements.summaryText) return;
  
  // Get original markdown text from data attribute, fallback to textContent
  const text = elements.summaryText.dataset.originalMarkdown || 
               elements.summaryText.textContent || 
               elements.summaryText.innerText;
  if (!text) return;
  
  try {
    await navigator.clipboard.writeText(text);
    const copiedText = await t('copiedToClipboard') || 'Copied to clipboard';
    showToast(copiedText, 'success');
  } catch (error) {
    logError('Failed to copy summary', error);
    const errorText = await t('copyFailed') || 'Failed to copy';
    showToast(errorText, 'error');
  }
}

// Download summary as markdown
async function downloadSummary() {
  if (!elements.summaryText) return;
  
  // Get original markdown text from data attribute, fallback to textContent
  const text = elements.summaryText.dataset.originalMarkdown || 
               elements.summaryText.textContent || 
               elements.summaryText.innerText;
  if (!text) return;
  
  try {
    // Get title from state or use default
    const state = await chrome.runtime.sendMessage({ action: 'getState' });
    const title = (state && state.result && state.result.title) ? 
      state.result.title.replace(/[^\w\s-]/g, '').trim() : 'summary';
    
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}-summary.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
    
    const downloadedText = await t('downloaded') || 'Downloaded';
    showToast(downloadedText, 'success');
  } catch (error) {
    logError('Failed to download summary', error);
    const errorText = await t('downloadFailed') || 'Failed to download';
    showToast(errorText, 'error');
  }
}

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
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    
    const value = option.dataset.value;
    
    // Update native select
    select.value = value;
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
  
  // Close dropdown when clicking outside (handled globally for all selects)
  
  // Sync with native select value changes
  select.addEventListener('change', () => {
    const selectedOption = optionsDiv.querySelector(`[data-value="${select.value}"]`);
    if (selectedOption) {
      valueSpan.textContent = selectedOption.textContent;
      optionsDiv.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      selectedOption.classList.add('selected');
    } else {
      // If option not found, repopulate (for dynamic selects)
      populateOptions();
    }
  });
  
  // Watch for option changes (for dynamic selects)
  const observer = new MutationObserver(() => {
    const currentValue = select.value;
    populateOptions();
    // Restore value after repopulation
    if (currentValue) {
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

// Update mode hint text
async function updateModeHint() {
  const mode = elements.modeSelect.value;
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  elements.modeHint.textContent = mode === 'selector' 
    ? (locale.extractionModeHint || UI_LOCALES.en.extractionModeHint)
    : (locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract);
}

// Show/hide cache option based on mode
function updateCacheVisibility() {
  const mode = elements.modeSelect.value;
  // Only show cache option for selector mode
  elements.useCacheGroup.style.display = mode === 'selector' ? 'flex' : 'none';
}

/**
 * Hide all audio-related UI fields
 * This is a centralized function to ensure all audio fields are hidden consistently
 * Used when output format is not 'audio' (PDF, EPUB, FB2, Markdown)
 */
function hideAllAudioFields() {
  // Audio provider selector
  setElementGroupDisplay('audioProviderGroup', 'none');
  
  // Provider-specific API keys
  setElementGroupDisplay('elevenlabsApiKeyGroup', 'none');
  setElementGroupDisplay('qwenApiKeyGroup', 'none');
  setElementGroupDisplay('respeecherApiKeyGroup', 'none');
  setElementGroupDisplay('googleTtsApiKeyGroup', 'none');
  
  // Provider-specific settings
  setElementGroupDisplay('elevenlabsModelGroup', 'none');
  setElementGroupDisplay('elevenlabsFormatGroup', 'none');
  setElementGroupDisplay('elevenlabsAdvancedGroup', 'none');
  setElementGroupDisplay('googleTtsModelGroup', 'none');
  setElementGroupDisplay('googleTtsVoiceGroup', 'none');
  setElementGroupDisplay('googleTtsPromptGroup', 'none');
  setElementGroupDisplay('respeecherAdvancedGroup', 'none');
  
  // Generic audio settings (voice, speed, instructions)
  setElementGroupDisplay('audioVoiceGroup', 'none');
  setElementGroupDisplay('audioSpeedGroup', 'none');
  setElementGroupDisplay('openaiInstructionsGroup', 'none');
}

/**
 * Update UI based on output format selection
 * 
 * This function is the main coordinator for UI visibility based on format:
 * - PDF: Shows PDF-specific settings (style, page mode), hides audio settings
 * - EPUB/FB2/Markdown: Shows translation settings, hides PDF style and audio settings
 * - Audio: Shows audio provider settings, hides PDF style and TOC/abstract
 * 
 * IMPORTANT: This function calls updateAudioProviderUI() and updateTranslationVisibility()
 * to ensure all dependent UI elements are updated correctly.
 */
async function updateOutputFormatUI() {
  const format = elements.outputFormat.value;
  // Sync main format select
  if (elements.mainFormatSelect && elements.mainFormatSelect.value !== format) {
    elements.mainFormatSelect.value = format;
  }
  const isPdf = format === 'pdf';
  const isEpub = format === 'epub';
  const isAudio = format === 'audio';
  const showStyleSettings = isPdf; // Only PDF has style settings
  
  // Update button icon based on format (text stays "Save")
  const formatConfig = {
    pdf: { icon: '📄' },
    epub: { icon: '📚' },
    fb2: { icon: '📖' },
    markdown: { icon: '📝' },
    audio: { icon: '🔊' }
  };
  const config = formatConfig[format] || formatConfig.pdf;
  if (elements.saveIcon) {
    elements.saveIcon.textContent = config.icon;
  }
  
  // ============================================
  // AUDIO SETTINGS VISIBILITY
  // ============================================
  if (!isAudio) {
    // Not audio format: Hide ALL audio-related fields
    // This ensures no audio settings are visible for PDF/EPUB/FB2/Markdown
    hideAllAudioFields();
  } else {
    // Audio format selected: Show provider selector and update provider-specific UI
    setElementGroupDisplay('audioProviderGroup', 'flex');
    // updateAudioProviderUI() will show/hide provider-specific fields based on selected provider
    updateAudioProviderUI();
  }

  // ============================================
  // PDF-SPECIFIC SETTINGS VISIBILITY
  // ============================================
  // Page mode (single/multi-page) is only for PDF
  setElementGroupDisplay('pageModeGroup', isPdf ? 'flex' : 'none');

  // PDF styling controls (colors, fonts, presets) are only for PDF
  const pdfStyleIds = [
    'stylePreset',
    'fontFamily',
    'fontFamilyContainer',
    'fontSize',
    'bgColor',
    'bgColorText',
    'textColor',
    'textColorText',
    'headingColor',
    'headingColorText',
    'linkColor',
    'linkColorText',
    'pdfSettingsDivider'
  ];
  setDisplayForIds(pdfStyleIds, showStyleSettings ? '' : 'none');

  // ============================================
  // TOC AND ABSTRACT VISIBILITY
  // ============================================
  // TOC and abstract are not applicable for audio format
  const tocIds = ['generateToc', 'generateAbstract'];
  setDisplayForIds(tocIds, isAudio ? 'none' : '');
  
  // ============================================
  // TRANSLATION SETTINGS VISIBILITY
  // ============================================
  // Update translation visibility (hides image translation for audio)
  updateTranslationVisibility();
}

// Update voice list based on TTS provider
function updateVoiceList(provider) {
  if (!elements.audioVoice) return;
  
  // IMPORTANT: restore per-provider saved voice if available
  const savedProviderVoice = audioVoiceMap?.[provider] || '';
  const currentValue = savedProviderVoice || elements.audioVoice.value || '';
  elements.audioVoice.innerHTML = '';
  
  if (provider === 'elevenlabs') {
    // ElevenLabs voices (popular voices)
    const elevenlabsVoices = [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (female, clear)' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (female, strong)' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (female, warm)' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (male, deep)' },
      { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (female, young)' },
      { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (male, calm)' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (male, authoritative)' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (male, expressive)' },
      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (male, friendly)' }
    ];
    
    elevenlabsVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      elements.audioVoice.appendChild(option);
    });
    
    // Set value: use saved value if valid, otherwise use default
    if (currentValue && elevenlabsVoices.find(v => v.id === currentValue)) {
      elements.audioVoice.value = currentValue;
    } else if (currentValue) {
      elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM'; // Rachel
      saveAudioVoice(provider, '21m00Tcm4TlvDq8ikWAM');
    } else {
      elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM';
    }
    saveAudioVoice(provider, elements.audioVoice.value);
  } else if (provider === 'qwen') {
    // Qwen3-TTS-Flash-2025-11-27 voices (49 voices)
    const qwenVoices = [
      // Best for articles/education
      { id: 'Elias', name: '📚 Elias (academic, storytelling)' },
      { id: 'Neil', name: '📰 Neil (news anchor, professional)' },
      { id: 'Katerina', name: '🎭 Katerina (mature, rhythmic)' },
      { id: 'Ryan', name: '🎬 Ryan (dramatic, realistic)' },
      
      // Language-specific
      { id: 'Alek', name: '🇷🇺 Alek (Russian voice)' },
      { id: 'Jennifer', name: '🇺🇸 Jennifer (American English)' },
      { id: 'Emilien', name: '🇫🇷 Emilien (French)' },
      { id: 'Lenn', name: '🇩🇪 Lenn (German)' },
      { id: 'Dolce', name: '🇮🇹 Dolce (Italian)' },
      { id: 'Bodega', name: '🇪🇸 Bodega (Spanish)' },
      { id: 'Sonrisa', name: '🌎 Sonrisa (Latin American Spanish)' },
      { id: 'Andre', name: '🇵🇹 Andre (Portuguese European)' },
      { id: 'Radio Gol', name: '🇧🇷 Radio Gol (Portuguese Brazilian)' },
      { id: 'Sohee', name: '🇰🇷 Sohee (Korean)' },
      { id: 'Ono Anna', name: '🇯🇵 Ono Anna (Japanese)' },
      
      // General purpose
      { id: 'Cherry', name: 'Cherry (sunny, friendly)' },
      { id: 'Ethan', name: 'Ethan (warm, energetic)' },
      { id: 'Serena', name: 'Serena (gentle)' },
      { id: 'Chelsie', name: 'Chelsie (anime style)' },
      { id: 'Aiden', name: 'Aiden (American young man)' },
      { id: 'Maia', name: 'Maia (intelligent, gentle)' },
      { id: 'Kai', name: 'Kai (relaxing)' },
      { id: 'Nofish', name: 'Nofish (designer)' },
      
      // Character voices
      { id: 'Eldric Sage', name: '🧙 Eldric Sage (old wise man)' },
      { id: 'Arthur', name: '📖 Arthur (old storyteller)' },
      { id: 'Bellona', name: '⚔️ Bellona (powerful, epic)' },
      { id: 'Vincent', name: '🦸 Vincent (raspy, heroic)' },
      { id: 'Mia', name: 'Mia (gentle as snow)' },
      { id: 'Seren', name: '😴 Seren (soothing, ASMR)' }
    ];
    
    qwenVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      elements.audioVoice.appendChild(option);
    });
    
    // Set value: use saved value if valid, otherwise use default
    if (currentValue && qwenVoices.find(v => v.id === currentValue)) {
      elements.audioVoice.value = currentValue;
    } else if (currentValue) {
      elements.audioVoice.value = 'Elias'; // Default - best for articles
      saveAudioVoice(provider, 'Elias');
    } else {
      elements.audioVoice.value = 'Elias';
    }
    saveAudioVoice(provider, elements.audioVoice.value);
  } else if (provider === 'respeecher') {
    // Respeecher voices
    // Note: volodymyr is available on en-rt endpoint only, not on ua-rt
    // Ukrainian voices are available on ua-rt endpoint only
    const respeecherVoices = [
      // English voices (en-rt endpoint)
      { id: 'samantha', name: '🇺🇸 Samantha (female, American)' },
      { id: 'neve', name: '🇺🇸 Neve (female, emotional)' },
      { id: 'gregory', name: '🇺🇸 Gregory (male, emotional)' },
      { id: 'vincent', name: '🇺🇸 Vincent (male, deep)' },
      { id: 'volodymyr', name: '🇺🇦 Volodymyr (male, Ukrainian) - EN endpoint only' },
      // Ukrainian voices (ua-rt endpoint)
      { id: 'olesia-rozmova', name: '🇺🇦 Олеся: розмова (female, conversation)' },
      { id: 'olesia-media', name: '🇺🇦 Олеся: медіа (female, media)' },
      { id: 'olesia-ogoloshennia', name: '🇺🇦 Олеся: оголошення (female, announcement)' },
      { id: 'mariia-audioknyha', name: '🇺🇦 Марія: аудіокнига (female, audiobook)' },
      { id: 'oleksandr-radio', name: '🇺🇦 Олександр: радіо (male, radio)' },
      { id: 'oleksandr-reklama', name: '🇺🇦 Олександр: реклама (male, advertisement)' },
      { id: 'yevhen-reklama', name: '🇺🇦 Євген: реклама (male, advertisement)' },
      { id: 'yevhen-audioknyha', name: '🇺🇦 Євген: аудіокнига (male, audiobook)' },
      { id: 'dmitro-rozmova', name: '🇺🇦 Дмитро: розмова (male, conversation)' },
      { id: 'ihoreo-rozmova', name: '🇺🇦 Ігорео: розмова (male, conversation)' }
    ];
    
    respeecherVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      elements.audioVoice.appendChild(option);
    });
    
    // Set value: use saved value if valid, otherwise use default
    // IMPORTANT: Only change value if currentValue is invalid for this provider
    // This preserves user's selection across page reloads
    if (currentValue && respeecherVoices.find(v => v.id === currentValue)) {
      // Valid saved value - restore it
      elements.audioVoice.value = currentValue;
    } else if (currentValue) {
      // Invalid value (e.g., 'nova' from OpenAI or 'volodymyr' for Ukrainian text)
      // Use default for this provider
      elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE; // Default English voice
      // Save the new default value
      saveAudioVoice(provider, CONFIG.DEFAULT_RESPEECHER_VOICE);
    } else {
      // No saved value - use default
      elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE;
    }
    saveAudioVoice(provider, elements.audioVoice.value);
  } else {
    // OpenAI voices
    const openaiVoices = [
      { value: 'nova', name: 'Nova (female, warm)' },
      { value: 'alloy', name: 'Alloy (neutral)' },
      { value: 'echo', name: 'Echo (male)' },
      { value: 'fable', name: 'Fable (expressive)' },
      { value: 'onyx', name: 'Onyx (male, deep)' },
      { value: 'shimmer', name: 'Shimmer (female, clear)' },
      { value: 'coral', name: 'Coral (female, friendly)' },
      { value: 'sage', name: 'Sage (neutral, calm)' },
      { value: 'ash', name: 'Ash (male, authoritative)' },
      { value: 'ballad', name: 'Ballad (expressive, dramatic)' },
      { value: 'verse', name: 'Verse (rhythmic)' }
    ];
    
    openaiVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.value;
      option.textContent = voice.name;
      elements.audioVoice.appendChild(option);
    });
    
    // Set value: use saved value if valid, otherwise use default
    if (currentValue && openaiVoices.find(v => v.value === currentValue)) {
      elements.audioVoice.value = currentValue;
    } else if (currentValue) {
      elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
      saveAudioVoice(provider, CONFIG.DEFAULT_AUDIO_VOICE);
    } else {
      elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
    }
    saveAudioVoice(provider, elements.audioVoice.value);
  }
}

/**
 * Update UI visibility based on audio provider selection
 * 
 * This function shows/hides provider-specific fields based on selected TTS provider:
 * - OpenAI: Shows voice selector, speed control, instructions
 * - ElevenLabs: Shows API key, model, format, advanced settings, voice selector, speed control
 * - Google TTS: Shows API key, model, voice selector, prompt (NO speed control)
 * - Qwen: Shows API key, voice selector (NO speed control)
 * - Respeecher: Shows API key, advanced settings, voice selector (NO speed control)
 * 
 * IMPORTANT: This function assumes audio format is already selected.
 * If format is not 'audio', it calls hideAllAudioFields() and returns early.
 * 
 * Speed control is only shown for providers that support it (OpenAI, ElevenLabs).
 */
function updateAudioProviderUI() {
  const audioProvider = getElement('audioProvider');
  if (!audioProvider) return;
  
  // Safety check: If format is not audio, hide all audio fields and return
  const outputFormat = getElement('outputFormat');
  const format = outputFormat?.value;
  if (format !== 'audio') {
    hideAllAudioFields();
    return;
  }
  
  const provider = audioProvider.value;
  const isElevenLabs = provider === 'elevenlabs';
  const isGoogle = provider === 'google';
  const isQwen = provider === 'qwen';
  const isRespeecher = provider === 'respeecher';
  // Speed is not supported by Qwen, Respeecher, and Google TTS (Google uses prompt for speed control)
  const supportsSpeed = !(isQwen || isRespeecher || isGoogle);
  
  // Show/hide ElevenLabs-specific fields
  setElementGroupDisplay('elevenlabsApiKeyGroup', isElevenLabs ? 'flex' : 'none');
  setElementGroupDisplay('elevenlabsModelGroup', isElevenLabs ? 'flex' : 'none');
  setElementGroupDisplay('elevenlabsFormatGroup', isElevenLabs ? 'flex' : 'none');
  setElementGroupDisplay('elevenlabsAdvancedGroup', isElevenLabs ? 'block' : 'none');
  
  // Show/hide Google TTS-specific fields
  // Note: format is already 'audio' at this point (checked at function start)
  setElementGroupDisplay('googleTtsApiKeyGroup', isGoogle ? 'flex' : 'none');
  setElementGroupDisplay('googleTtsModelGroup', isGoogle ? 'flex' : 'none');
  setElementGroupDisplay('googleTtsVoiceGroup', isGoogle ? 'flex' : 'none');
  setElementGroupDisplay('googleTtsPromptGroup', isGoogle ? 'block' : 'none');
  
  // Show/hide Qwen-specific fields
  setElementGroupDisplay('qwenApiKeyGroup', isQwen ? 'flex' : 'none');
  
  // Show/hide Respeecher-specific fields
  setElementGroupDisplay('respeecherApiKeyGroup', isRespeecher ? 'flex' : 'none');
  setElementGroupDisplay('respeecherAdvancedGroup', isRespeecher ? 'block' : 'none');
  
  // Show/hide OpenAI instructions (only for OpenAI provider)
  const isOpenAI = provider === 'openai';
  setElementGroupDisplay('openaiInstructionsGroup', isOpenAI ? 'block' : 'none');
  
  // Show/hide generic voice selector (for OpenAI, ElevenLabs, Qwen, Respeecher)
  // Hide for Google TTS (it has its own voice selector)
  setElementGroupDisplay('audioVoiceGroup', !isGoogle ? 'flex' : 'none');
  
  // Speed control only for providers that support it
  // Hide completely for Qwen/Respeecher/Google (they don't support speed)
  setElementGroupDisplay('audioSpeedGroup', supportsSpeed ? 'flex' : 'none');
  
  const audioSpeed = getElement('audioSpeed');
  if (audioSpeed) {
    audioSpeed.disabled = !supportsSpeed;
    if (!supportsSpeed) {
      audioSpeed.value = '1.0';
      const audioSpeedValue = getElement('audioSpeedValue');
      if (audioSpeedValue) {
        audioSpeedValue.textContent = '1.0x';
      }
    }
  }
  
  const audioSpeedNote = getElement('audioSpeedNote');
  if (audioSpeedNote) {
    audioSpeedNote.style.display = 'none'; // Not needed since we hide the group completely
  }
  
  // Update voice list when provider changes
  // This ensures that the correct voices are shown and invalid voices are replaced
  updateVoiceList(provider);
}

// Show/hide translation-related UI based on language selection
async function updateTranslationVisibility() {
  const languageSelect = getElement('languageSelect');
  const translateImages = getElement('translateImages');
  const outputFormat = getElement('outputFormat');
  
  if (!languageSelect || !translateImages || !outputFormat) return;
  
  const isTranslating = languageSelect.value !== 'auto';
  const translateImagesEnabled = translateImages.checked;
  const isAudio = outputFormat.value === 'audio';
  
  // Show image translation option only when translating AND not audio format
  // Audio format doesn't use images, so translation option is not needed
  setElementGroupDisplay('translateImagesGroup', (isTranslating && !isAudio) ? 'block' : 'none');
  
  // Show Google API key input when image translation is enabled
  setElementDisplay('googleApiGroup', (isTranslating && translateImagesEnabled) ? 'block' : 'none');
  
  // Show hint if translateImages is enabled but Google key is missing
  const translateImagesHint = getElement('translateImagesHint');
  if (isTranslating && translateImagesEnabled && translateImagesHint) {
    const googleApiKey = getElement('googleApiKey');
    const googleApiKeyValue = googleApiKey?.value?.trim() || '';
    const hasGoogleKey = googleApiKeyValue && !googleApiKeyValue.startsWith('****');
    
    // Check if key exists in storage (might be encrypted/masked)
    if (!hasGoogleKey) {
      try {
        const stored = await chrome.storage.local.get(['google_api_key']);
        const storedKey = stored.google_api_key;
        if (!storedKey || (typeof storedKey === 'string' && storedKey.startsWith('****'))) {
          // No key or masked key - show hint
          const uiLang = await getUILanguage();
          const hintText = tSync('translateImagesRequiresGoogleKey', uiLang) || '⚠️ Requires Google API key for image translation';
          translateImagesHint.textContent = hintText;
          translateImagesHint.style.color = 'var(--text-warning, #ffa500)';
          return;
        }
      } catch (error) {
        // Ignore errors
      }
    }
    
    // Key exists - show normal hint
    const uiLang = await getUILanguage();
    const normalHint = tSync('translateImagesHint', uiLang) || 'Uses Google Gemini AI to translate text on images';
    translateImagesHint.textContent = normalHint;
    translateImagesHint.style.color = '';
  }
}

// Save API keys to storage
async function saveApiKey() {
  const provider = elements.apiProviderSelect?.value || 'openai';
  const apiKey = elements.apiKey.value.trim();
  const googleApiKey = elements.googleApiKey.value.trim();
  
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
  
  // Save Google API key for image translation if provided
  if (googleApiKey) {
    if (googleApiKey.startsWith('****') && elements.googleApiKey.dataset.encrypted) {
      // Keep existing encrypted key if masked
      keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = elements.googleApiKey.dataset.encrypted;
    } else if (!googleApiKey.startsWith('****')) {
      // New key provided, validate and encrypt
      if (!googleApiKey.startsWith('AIza')) {
        const invalidGoogleKeyText = await t('invalidGoogleKeyFormat');
        showToast(invalidGoogleKeyText, 'error');
        return;
      }
      try {
        keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = await encryptApiKey(googleApiKey);
      } catch (error) {
        const failedToEncryptText = await t('failedToEncryptApiKey');
        showToast(failedToEncryptText, 'error');
        logError('Encryption error', error);
        return;
      }
    }
  } else {
    // If field is empty, explicitly remove the key from storage
    // This ensures the key is cleared if user intentionally removed it
    keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = null;
  }

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
async function checkProcessingState() {
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getState' });
    await updateUIFromState(state);
  } catch (error) {
    logError('Error getting state from background', error);
    // Fallback: try to load from storage
    try {
      const stored = await chrome.storage.local.get(['processingState']);
      if (stored.processingState) {
        const savedState = stored.processingState;
        const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
        
        // If state is recent (< 2 minutes), show it
        if (timeSinceUpdate < 2 * 60 * 1000 && savedState.isProcessing) {
          updateUIFromState(savedState);
        }
      }
    } catch (storageError) {
      logError('Error loading from storage', storageError);
    }
  }
}

// Start polling for state updates
function startStatePolling() {
  // Clear existing timeout
  if (statePollingTimeout) {
    clearTimeout(statePollingTimeout);
  }
  
  let pollInterval = 2000; // Default 2s for idle (increased from 1s to reduce load)
  let failedAttempts = 0;
  let lastState = null; // Track last state for adaptive polling
  let noChangeCount = 0; // Count consecutive polls with no changes
  let isPolling = false; // Flag to prevent concurrent poll() calls
  
  async function poll() {
    // Prevent concurrent calls
    if (isPolling) {
      return;
    }
    
    isPolling = true;
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      
      // Check if state changed
      const stateChanged = JSON.stringify(state) !== JSON.stringify(lastState);
      
      if (stateChanged) {
        // State changed - reset adaptive polling
        noChangeCount = 0;
        await updateUIFromState(state);
        lastState = state;
        
        // Use faster polling when processing (increased from 300ms to 500ms)
        pollInterval = state.isProcessing ? 500 : 2000;
      } else {
        // State didn't change - increase interval (adaptive polling)
        noChangeCount++;
        
        // Exponential backoff: 500ms → 750ms → 1125ms → 1687ms → 2000ms (for processing)
        // For idle: 2000ms (no backoff needed)
        if (state.isProcessing) {
          pollInterval = Math.min(500 * Math.pow(1.5, noChangeCount), 2000);
        } else {
          pollInterval = 2000; // Keep 2s for idle state
        }
      }
      
      failedAttempts = 0;
      
      // Check summary generation status from storage
      await checkSummaryStatus();
      
    } catch (error) {
      failedAttempts++;
      logWarn('Failed to get state from background', { attempt: failedAttempts });
      
      // After 3 failed attempts, try storage
      if (failedAttempts >= 3) {
        try {
          const stored = await chrome.storage.local.get(['processingState']);
          if (stored.processingState && stored.processingState.isProcessing) {
            const timeSinceUpdate = Date.now() - (stored.processingState.lastUpdate || 0);
            if (timeSinceUpdate < 2 * 60 * 1000) {
              await updateUIFromState(stored.processingState);
            }
          }
        } catch (e) {
          // Ignore storage errors
        }
      }
      
      // Check summary status even on errors
      await checkSummaryStatus();
      
      // Increase interval on errors
      pollInterval = Math.min(pollInterval * 2, 5000);
    } finally {
      // Always reset polling flag to allow next poll
      isPolling = false;
    }
    
    // Schedule next poll
    statePollingTimeout = setTimeout(poll, pollInterval);
  }
  
  poll();
}

// Check summary generation status from storage AND processingState
async function checkSummaryStatus() {
  try {
    // CRITICAL: Summary generation now uses ONLY summary_generating flag
    // It does NOT use processingState to avoid interfering with document generation UI
    const storageResult = await chrome.storage.local.get([
      STORAGE_KEYS.SUMMARY_GENERATING,
      STORAGE_KEYS.SUMMARY_TEXT,
      'summary_generating_start_time',
      'summary_saved_timestamp'
    ]);
    
    const isSummaryGenerating = storageResult[STORAGE_KEYS.SUMMARY_GENERATING];
    
    // Check if generation flag is stale
    // CRITICAL: Use shorter threshold - summary should not take more than 15 minutes
    // If it takes longer, it's likely stuck or failed
    const STALE_THRESHOLD = CONFIG.SUMMARY_STALE_THRESHOLD_MS;
    
    if (isSummaryGenerating) {
      // Check stale threshold
      if (!storageResult.summary_generating_start_time) {
        // No timestamp - flag is from old version or was set incorrectly, reset it
        logWarn('Summary generation flag has no timestamp in checkSummaryStatus, resetting', {});
        await chrome.storage.local.set({ 
          [STORAGE_KEYS.SUMMARY_GENERATING]: false,
          summary_generating_start_time: null
        });
      } else {
        const timeSinceStart = Date.now() - storageResult.summary_generating_start_time;
        
        if (timeSinceStart > STALE_THRESHOLD) {
          // Flag is stale - reset it
          logWarn('Summary generation flag is stale, resetting', { timeSinceStart });
          await chrome.storage.local.set({ 
            [STORAGE_KEYS.SUMMARY_GENERATING]: false,
            summary_generating_start_time: null
          });
          
          // Ensure button is enabled after reset
          if (elements.generateSummaryBtn) {
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
          }
          // Exit early - flag was stale
          return;
        }
      }
    }
    
    // CRITICAL: Check if summary is generating (only from flag, not processingState)
    if (isSummaryGenerating && elements.generateSummaryBtn) {
      // Summary generation is in progress - show status
      const generatingText = await t('generatingSummary') || 'Generating summary...';
      elements.generateSummaryBtn.textContent = generatingText;
      elements.generateSummaryBtn.disabled = true;
      log('checkSummaryStatus: Generation in progress - button disabled', { text: generatingText });
    } else if (storageResult[STORAGE_KEYS.SUMMARY_TEXT] && !isSummaryGenerating && elements.summaryText && elements.summaryContainer) {
      // Summary exists and generation is not in progress - display it
      // CRITICAL: Double-check that generation is not in progress (race condition protection)
      const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
      if (doubleCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
        // Generation is in progress - don't show summary
        log('checkSummaryStatus: Generation in progress on double-check, skipping summary display');
        return;
      }
      
      // CRITICAL: Summary persists - always show if it exists and not generating
      const savedSummary = storageResult[STORAGE_KEYS.SUMMARY_TEXT];
      const currentMarkdown = elements.summaryText.dataset.originalMarkdown;
      const containerWasHidden = elements.summaryContainer.style.display === 'none';
      
      // Restore button when summary is ready
      if (elements.generateSummaryBtn) {
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
      }
      
      // Update content if it changed or container is hidden
      if (currentMarkdown !== savedSummary || containerWasHidden) {
        elements.summaryText.dataset.originalMarkdown = savedSummary;
        const htmlSummary = markdownToHtml(savedSummary);
        // SECURITY: Sanitize HTML to prevent XSS attacks from AI-generated content
        const sanitizedHtml = sanitizeMarkdownHtml(htmlSummary);
        elements.summaryText.innerHTML = sanitizedHtml;
        elements.summaryContainer.style.display = 'block';
        
        // Preserve expanded state if content is the same
        const wasExpanded = elements.summaryContent.classList.contains('expanded');
        if (containerWasHidden || !currentMarkdown) {
          // New summary or container was hidden - collapse
          elements.summaryContent.classList.remove('expanded');
          const toggleIcon = elements.summaryToggle?.querySelector('.summary-toggle-icon');
          if (toggleIcon) toggleIcon.textContent = '▶';
        } else if (wasExpanded && currentMarkdown === savedSummary) {
          // Same content - restore expanded state
          elements.summaryContent.classList.add('expanded');
          const toggleIcon = elements.summaryToggle?.querySelector('.summary-toggle-icon');
          if (toggleIcon) toggleIcon.textContent = '▼';
        }
        
        log('checkSummaryStatus: Summary displayed', { summaryLength: savedSummary?.length || 0 });
      }
    } else if (!isSummaryGenerating && elements.generateSummaryBtn) {
      // CRITICAL: If generation is not in progress and no summary, ensure button is enabled
      // BUT: Only restore if button is currently disabled (to avoid race conditions)
      // Don't restore if button is already enabled or if we're in the middle of generation
      if (elements.generateSummaryBtn.disabled) {
        // Double-check: make sure generation really is not in progress
        // Check only summary_generating flag (summary does NOT use processingState)
        const doubleCheckStorage = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
        
        const doubleCheckGenerating = doubleCheckStorage[STORAGE_KEYS.SUMMARY_GENERATING];
        
        if (!doubleCheckGenerating) {
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
          log('checkSummaryStatus: No generation in progress - button enabled');
        } else {
          // Flag was set between checks - keep button disabled
          elements.generateSummaryBtn.disabled = true;
          const generatingText = await t('generatingSummary') || 'Generating summary...';
          elements.generateSummaryBtn.textContent = generatingText;
          log('checkSummaryStatus: Generation flag found on double-check - button kept disabled');
        }
      }
    }
  } catch (error) {
    logWarn('Error checking summary status', error);
    // On error, ensure button is enabled
    if (elements.generateSummaryBtn) {
      elements.generateSummaryBtn.disabled = false;
      const generateSummaryText = await t('generateSummary') || 'Generate Summary';
      elements.generateSummaryBtn.textContent = generateSummaryText;
    }
  }
}

// Update UI based on processing state
async function updateUIFromState(state) {
  if (!state) return;
  const stageLabel = await mapStageLabel(state.currentStage);
  const statusText = stageLabel || state.status;
  
  if (state.isProcessing) {
    // Use startTime from background (persists across popup reopens)
    if (state.startTime) {
      if (currentStartTime !== state.startTime) {
        startTimerDisplay(state.startTime);
      }
      // Ensure timer is running even if startTime was already set
      if (!timerInterval && state.startTime) {
        startTimerDisplay(state.startTime);
      }
    }
    elements.savePdfBtn.disabled = true;
    elements.savePdfBtn.style.display = 'none';
    if (elements.cancelBtn) {
      elements.cancelBtn.style.display = 'block';
      elements.cancelBtn.disabled = false;
    }
    setStatus('processing', statusText, state.startTime || currentStartTime);
    setProgress(state.progress);
  } else if (state.error) {
    // Check if error is actually a cancellation - don't show as error
    const isCancelled = state.isCancelled || 
                       (state.error && (
                         state.error.includes('Cancelled') || 
                         state.error.includes('Отменено') || 
                         state.error.includes('Скасовано') ||
                         state.error.includes('Abgebrochen') ||
                         state.error.includes('Annulé') ||
                         state.error.includes('Cancelado') ||
                         state.error.includes('Annullato') ||
                         state.error.includes('已取消') ||
                         state.error.includes('キャンセル') ||
                         state.error.includes('취소됨')
                       ));
    
    if (isCancelled) {
      // Treat cancellation as ready state, not error
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      const readyText = await t('ready');
      setStatus('ready', readyText);
      setProgress(0, false);
    } else {
      // Real error - show as error
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      // Use localized error message if errorCode is available
      let errorMessage = state.error;
      if (state.errorCode) {
        const errorKeyMap = {
          'auth_error': 'errorAuth',
          'rate_limit': 'errorRateLimit',
          'timeout': 'errorTimeout',
          'network_error': 'errorNetwork',
          'parse_error': 'errorParse',
          'provider_error': 'errorProvider',
          'validation_error': 'errorValidation',
          'unknown_error': 'errorUnknown'
        };
        const errorKey = errorKeyMap[state.errorCode];
        if (errorKey) {
          errorMessage = await t(errorKey).catch(() => state.error);
        }
      }
      setStatus('error', errorMessage);
      setProgress(0, false);
    }
  } else if (state.status === 'Done!') {
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    if (elements.cancelBtn) {
      elements.cancelBtn.style.display = 'none';
    }
    // Get saved format from state or current selection
    const savedFormat = state.outputFormat || elements.mainFormatSelect?.value || elements.outputFormat?.value || 'pdf';
    const formatNames = {
      pdf: await t('saveAsPdf'),
      epub: await t('saveAsEpub'),
      fb2: await t('saveAsFb2'),
      markdown: await t('saveAsMarkdown'),
      audio: await t('saveAsAudio')
    };
    const formatName = formatNames[savedFormat] || formatNames.pdf;
    // Extract format name without "Save as" prefix
    const formatNameOnly = formatName.replace(/^(Save as|Сохранить как|Зберегти як|Speichern als|Enregistrer|Guardar|Salva|Salvar|另存为|として保存|로 저장)\s+/i, '');
    const savedText = await t('savedSuccessfully');
    const successMessage = `${formatNameOnly} ${savedText}`;
    setStatus('ready', successMessage);
    setProgress(0, false); // Hide progress bar immediately
  } else {
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    if (elements.cancelBtn) {
      elements.cancelBtn.style.display = 'none';
    }
    const readyText = await t('ready');
    setStatus('ready', readyText);
    setProgress(0, false);
  }
}

async function mapStageLabel(stageId) {
  switch (stageId) {
    case 'starting': return await t('stageStarting');
    case 'analyzing': return await t('stageAnalyzing');
    case 'extracting': return await t('stageExtracting');
    case 'translating': return await t('stageTranslating');
    case 'loading_images': return await t('stageLoadingImages');
    case 'generating': return await t('stageGenerating');
    case 'complete': return await t('stageComplete');
    default: return null;
  }
}

// Handle Save PDF button click
async function handleSavePdf() {
  const model = elements.modelSelect.value;
  // Use selected provider from dropdown, fallback to model-based detection for backward compatibility
  const provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
  
  // Get the appropriate API key based on selected provider
  let apiKey = '';
  apiKey = elements.apiKey.value.trim();
  // If masked, decrypt the encrypted version from dataset
  if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
    try {
      apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
    } catch (error) {
      logError(`Failed to decrypt ${provider} API key`, error);
      showToast(await t('failedToDecryptApiKey'), 'error');
      return;
    }
  }
  if (!apiKey) {
    const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : 'Gemini';
    showToast(await t(`pleaseEnter${providerName}ApiKey`), 'error');
    return;
  }

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }

    setStatus('processing', await t('extractingPageContent'));
    setProgress(0);
    elements.savePdfBtn.disabled = true;

    // Wait a bit for dynamic content to load (Notion, React apps, etc.)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Inject content script and get page HTML
    const htmlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent
    });

    if (!htmlResult || !htmlResult[0]?.result) {
      throw new Error('Failed to extract page content');
    }

    const pageData = htmlResult[0].result;

    // Get Google API key if needed
    let googleApiKey = elements.googleApiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (googleApiKey.startsWith('****') && elements.googleApiKey.dataset.encrypted) {
      try {
        googleApiKey = await decryptApiKey(elements.googleApiKey.dataset.encrypted);
      } catch (error) {
        logError('Failed to decrypt Google API key', error);
        // Continue without Google API key if decryption fails
        googleApiKey = '';
      }
    }
    const translateImages = elements.translateImages.checked && elements.languageSelect.value !== 'auto';

    // Send to background script for processing
    const response = await chrome.runtime.sendMessage({
      action: 'processArticle',
      data: {
        html: pageData.html,
        url: pageData.url,  // Use actual page URL (with current anchor), not tab.url
        title: pageData.title || tab.title,
        apiKey: apiKey,
        provider: provider,
        googleApiKey: googleApiKey,
        model: model,
        mode: elements.modeSelect.value,
        useCache: elements.useCache.checked,
        outputFormat: elements.mainFormatSelect?.value || elements.outputFormat.value,
        generateToc: elements.generateToc.checked,
        generateAbstract: elements.generateAbstract.checked,
        pageMode: elements.pageMode.value,
        language: elements.languageSelect.value,
        translateImages: translateImages,
        fontFamily: elements.fontFamily.value,
        fontSize: elements.fontSize.value,
        bgColor: elements.bgColor.value,
        textColor: elements.textColor.value,
        headingColor: elements.headingColor.value,
        linkColor: elements.linkColor.value,
        stylePreset: elements.stylePreset?.value || 'dark',
        tabId: tab.id,
        // Audio settings
        audioProvider: elements.audioProvider?.value || 'openai',
        audioVoice: elements.audioVoice?.value || 'nova',
        audioSpeed: parseFloat(elements.audioSpeed?.value || 1.0),
        audioFormat: 'mp3',
        elevenlabsApiKey: elements.elevenlabsApiKey?.dataset.encrypted || null,
        elevenlabsModel: elements.elevenlabsModel?.value || 'eleven_v3',
        elevenlabsFormat: elements.elevenlabsFormat?.value || 'mp3_44100_192',
        elevenlabsStability: elements.elevenlabsStability ? parseFloat(elements.elevenlabsStability.value) : 0.5,
        elevenlabsSimilarity: elements.elevenlabsSimilarity ? parseFloat(elements.elevenlabsSimilarity.value) : 0.75,
        elevenlabsStyle: elements.elevenlabsStyle ? parseFloat(elements.elevenlabsStyle.value) : 0.0,
        elevenlabsSpeakerBoost: elements.elevenlabsSpeakerBoost ? elements.elevenlabsSpeakerBoost.checked : true,
        openaiInstructions: elements.openaiInstructions ? elements.openaiInstructions.value.trim() : null,
        googleTtsModel: elements.googleTtsModel?.value || 'gemini-2.5-pro-preview-tts',
        googleTtsVoice: elements.googleTtsVoice?.value || 'Callirrhoe',
        googleTtsPrompt: elements.googleTtsPrompt?.value.trim() || null,
        respeecherTemperature: elements.respeecherTemperature ? parseFloat(elements.respeecherTemperature.value) : 1.0,
        respeecherRepetitionPenalty: elements.respeecherRepetitionPenalty ? parseFloat(elements.respeecherRepetitionPenalty.value) : 1.0,
        respeecherTopP: elements.respeecherTopP ? parseFloat(elements.respeecherTopP.value) : 1.0,
        googleTtsApiKey: elements.googleTtsApiKey?.dataset.encrypted || null,
        geminiApiKey: elements.geminiApiKey?.dataset.encrypted || null,
        qwenApiKey: elements.qwenApiKey?.dataset.encrypted || null,
        respeecherApiKey: elements.respeecherApiKey?.dataset.encrypted || null
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Processing started in background
    // Ensure state polling is active to update UI
    if (!statePollingTimeout) {
      startStatePolling();
    }
    // Immediately check state to update UI
    await checkProcessingState();

  } catch (error) {
    logError('Error', error);
    setStatus('error', error.message);
    showToast(error.message, 'error');
    elements.savePdfBtn.disabled = false;
  }
}

// Function to inject into page to extract content
function extractPageContent() {
  // Always use full HTML - let AI figure out what's important
  // This ensures we don't accidentally miss content
  const html = document.documentElement.outerHTML;
  
  // Get title from various sources
  let pageTitle = document.title;
  const h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim()) {
    pageTitle = h1.textContent.trim();
  }
  
  const images = Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    alt: img.alt || '',
    width: img.naturalWidth,
    height: img.naturalHeight
  }));

  return {
    html: html,
    images: images,
    url: window.location.href,
    title: pageTitle
  };
}

// Set status indicator (kept for backward compatibility, now uses uiModule)
function setStatus(type, text, startTime = null) {
  if (window.uiModule) {
    return window.uiModule.setStatus(type, text, startTime);
  }
  elements.statusDot.className = 'status-dot';
  if (type === 'processing') {
    elements.statusDot.classList.add('processing');
    // Add timer display for processing status (use startTime from background or currentStartTime)
    const effectiveStartTime = startTime || currentStartTime;
    const elapsed = effectiveStartTime ? Math.floor((Date.now() - effectiveStartTime) / 1000) : 0;
    elements.statusText.innerHTML = `${text} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    // Ensure timer is running if we have a startTime
    if (effectiveStartTime && !timerInterval) {
      startTimerDisplay(effectiveStartTime);
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
  if (window.uiModule) {
    return window.uiModule.setProgress(percent, show);
  }
  elements.progressContainer.style.display = show ? 'block' : 'none';
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${Math.round(percent)}%`;
}

// Show toast notification (kept for backward compatibility, now uses uiModule)
function showToast(message, type = 'success') {
  if (window.uiModule) {
    return window.uiModule.showToast(message, type);
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


// Cleanup on popup close
window.addEventListener('unload', () => {
  if (statePollingTimeout) {
    clearTimeout(statePollingTimeout);
    statePollingTimeout = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
  }
});

// ========================================
// STATISTICS
// ========================================

async function loadAndDisplayStats() {
  if (window.statsModule) {
    return window.statsModule.loadAndDisplayStats();
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
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(diffMs / 604800000);

  if (minutes < 1) return rtf.format(-0, 'minute');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (hours < 24) return rtf.format(-hours, 'hour');
  if (days < 7) return rtf.format(-days, 'day');
  return rtf.format(-weeks, 'week');
}

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
      console.error('[ClipAIble] popup.js: init() failed after DOMContentLoaded', error);
    });
  });
} else {
  // DOM is already loaded, call init immediately
  init().catch(error => {
    console.error('[ClipAIble] popup.js: init() failed immediately', error);
  });
}
