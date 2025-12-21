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
import { initCore } from './core.js';
import { initHandlers } from './handlers.js';

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

// Markdown to HTML converter
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
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Horizontal rules
  html = html.replace(/^(\s*[-*]{3,}\s*)$/gm, '<hr>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/(?<!`)(?<!\*)\*(?!\*)([^*`]+?)(?<!\*)\*(?!\*)(?!`)/g, '<em>$1</em>');
  html = html.replace(/(?<!`)(?<!_)_(?!_)([^_`]+?)(?<!_)_(?!_)(?!`)/g, '<em>$1</em>');
  
  // Restore code blocks
  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`CODE_BLOCK_${index}`, codeBlock);
  });
  
  // Convert newlines to <br>
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.match(/^<(h[1-6])>.*<\/\1>$/)) {
      return line;
    }
    if (line.trim() === '<hr>') {
      return line;
    }
    return line + '<br>';
  });
  
  html = processedLines.join('');
  
  // Clean up
  html = html.replace(/<br><\/(h[1-6])>/g, '</$1>');
  html = html.replace(/<br><hr>/g, '<hr>');
  html = html.replace(/<hr><br>/g, '<hr>');
  
  return html;
}

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
    if (group instanceof HTMLElement) {
      group.style.display = displayValue;
    }
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
    if (group instanceof HTMLElement) {
      group.style.display = displayValue;
    }
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
      // DETAILED LOGGING: Saving to storage
      console.log('[ClipAIble Popup] ===== debouncedSaveSettings: ABOUT TO SAVE =====', {
        timestamp: Date.now(),
        key,
        keyType: typeof key,
        value,
        valueType: typeof value,
        isAudioVoice: key === 'audio_voice' || key === STORAGE_KEYS.AUDIO_VOICE,
        isAudioVoiceMap: key === 'audio_voice_map' || key === STORAGE_KEYS.AUDIO_VOICE_MAP,
        isNumeric: /^\d+$/.test(String(value)),
        isObject: typeof value === 'object' && !Array.isArray(value),
        objectKeys: typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : null
      });
      
      await chrome.storage.local.set({ [key]: value });
      
      // DETAILED LOGGING: Saved to storage
      console.log('[ClipAIble Popup] ===== debouncedSaveSettings: SAVED TO STORAGE =====', {
        timestamp: Date.now(),
        key,
        value,
        saved: true,
        storageKey: key
      });
      
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
  currentStartTimeRef.current = startTime;
  if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  // Update immediately, then set interval
  updateTimerDisplay();
  timerIntervalRef.current = setInterval(updateTimerDisplay, 1000);
  log('Timer started', { startTime, currentStartTime: currentStartTimeRef.current });
}

// Stop the timer display
function stopTimerDisplay() {
  if (timerIntervalRef.current) {
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }
  currentStartTimeRef.current = null;
}

// Update timer display in status text
function updateTimerDisplay() {
  if (!currentStartTimeRef.current) {
    // Try to get startTime from state if currentStartTime is not set
    chrome.runtime.sendMessage({ action: 'getState' }).then(state => {
      if (state && state.isProcessing && state.startTime) {
        currentStartTimeRef.current = state.startTime;
        updateTimerDisplay(); // Retry after setting startTime
      }
    }).catch(() => {});
    return;
  }
  const elapsed = Math.floor((Date.now() - currentStartTimeRef.current) / 1000);
  const timerSpan = document.getElementById('timerDisplay');
  if (timerSpan) {
    timerSpan.textContent = formatTime(elapsed);
  } else {
    // Timer element not found - try to recreate it if status is processing
    if (elements.statusText) {
      // Extract text without timer if it exists
      const textContent = elements.statusText.textContent || elements.statusText.innerText || '';
      const statusText = textContent.replace(/\s*\(\d{2}:\d{2}\)\s*$/, '').trim();
      const elapsed = Math.floor((Date.now() - currentStartTimeRef.current) / 1000);
      elements.statusText.innerHTML = `${statusText} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    }
  }
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
  elements.saveGoogleApiKey = document.getElementById('saveGoogleApiKey');
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
  // Note: currentStartTimeRef and timerIntervalRef are already defined above
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
    audioVoiceMap: { current: audioVoiceMap },
    t, // Add translation function for localization (async)
    getUILanguage // Add getUILanguage for tSync
  });
  
  // Make modules available globally for use in other functions
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  windowWithModules.uiModule = uiModule;
  windowWithModules.statsModule = statsModule;
  windowWithModules.settingsModule = settingsModule;
  
  // Initialize core module (business logic)
  const coreModule = initCore({
    elements,
    STORAGE_KEYS,
    t,
    getUILanguage,
    logError,
    log,
    logWarn,
    showToast,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    decryptApiKey,
    getProviderFromModel,
    detectVideoPlatform,
    markdownToHtml,
    sanitizeMarkdownHtml,
    CONFIG,
    stateRefs
  });
  windowWithModules.coreModule = coreModule;
  
  // Initialize handlers module (event listeners)
  const handlersModule = initHandlers({
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
    handleSavePdf: coreModule.handleSavePdf,
    handleCancel: coreModule.handleCancel,
    handleGenerateSummary: coreModule.handleGenerateSummary,
    toggleSummary: coreModule.toggleSummary,
    copySummary: coreModule.copySummary,
    downloadSummary: coreModule.downloadSummary,
    closeSummary: coreModule.closeSummary
  });
  windowWithModules.handlersModule = handlersModule;
  
  // Load settings after modules are initialized
  try {
    log('init: calling loadSettings()');
    if (windowWithModules.settingsModule && windowWithModules.settingsModule.loadSettings) {
      await windowWithModules.settingsModule.loadSettings();
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
    // @ts-ignore - handlersModule is returned from initHandlers which has setupEventListeners method
    const handlersModuleTyped = /** @type {{setupEventListeners: () => void}} */ (handlersModule);
    if (handlersModuleTyped && typeof handlersModuleTyped.setupEventListeners === 'function') {
      handlersModuleTyped.setupEventListeners();
    } else {
      logError('CRITICAL: handlersModule.setupEventListeners is not a function');
    }
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
    await coreModule.checkProcessingState();
  } catch (error) {
    logError('CRITICAL: checkProcessingState() failed in init()', error);
    // Continue initialization even if checkProcessingState fails
  }
  
  // Start polling for state updates
  try {
    coreModule.startStatePolling();
  } catch (error) {
    logError('CRITICAL: startStatePolling() failed in init()', error);
    // Continue initialization even if startStatePolling fails
  }

  // Load and display version
  try {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version || '3.1.0';
    const versionElement = document.getElementById('versionText');
    if (versionElement) {
      versionElement.textContent = `v${version}`;
    }
  } catch (error) {
    logError('Failed to load version', error);
  }
  
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
      { value: 'gemini-3-flash-preview', isCustom: false },
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
    /** @type {Record<string, any>} */
    const modelsByProvider = savedModelsByProvider && typeof savedModelsByProvider === 'object' ? savedModelsByProvider : {};
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.MODEL]: modelToSelect,
      [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
        ...modelsByProvider,
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
    gemini: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
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
      const target = e.target;
      if (target instanceof HTMLElement && (target.classList.contains('custom-model-delete') || target.closest('.custom-model-delete'))) {
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

// setupEventListeners() moved to handlers.js module
// Use handlersModule() instead

// Apply theme based on user preference or system preference (kept for backward compatibility, now uses uiModule)
function applyTheme() {
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  if (windowWithModules.uiModule) {
    return windowWithModules.uiModule.applyTheme();
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
    /** @type {WindowWithModules} */
    const windowWithModules = window;
    if (windowWithModules.themeChangeListener) {
      mediaQuery.removeListener(windowWithModules.themeChangeListener);
    }
    
    windowWithModules.themeChangeListener = handleThemeChange;
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
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const option = target.closest('.custom-select-option');
    if (!(option instanceof HTMLElement)) return;
    
    const value = option.dataset.value;
    if (!value) return;
    
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

// Update mode hint text
async function updateModeHint() {
  const mode = elements.modeSelect.value;
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  
  if (mode === 'automatic') {
    elements.modeHint.textContent = locale.extractionModeHintAutomatic || UI_LOCALES.en.extractionModeHintAutomatic;
  } else if (mode === 'selector') {
    elements.modeHint.textContent = locale.extractionModeHint || UI_LOCALES.en.extractionModeHint;
  } else {
    elements.modeHint.textContent = locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract;
  }
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
// DEPRECATED: This function is kept for backward compatibility but should use settingsModule.updateVoiceList instead
// This function uses old format audioVoiceMap[provider] instead of audioVoiceMap.current[provider]
function updateVoiceList(provider) {
  if (!elements.audioVoice) return;
  
  // CRITICAL: Use settingsModule.updateVoiceList if available (new implementation)
  if (window.settingsModule && window.settingsModule.updateVoiceList) {
    console.warn('[ClipAIble Popup] Using deprecated updateVoiceList, redirecting to settingsModule.updateVoiceList');
    window.settingsModule.updateVoiceList(provider);
    return;
  }
  
  // Fallback to old implementation (should not be reached in normal flow)
  // IMPORTANT: restore per-provider saved voice if available
  // CRITICAL: Check both old format and new format
  const oldFormatVoice = audioVoiceMap?.[provider] || '';
  const newFormatVoice = audioVoiceMap?.current?.[provider] || '';
  const savedProviderVoice = newFormatVoice || oldFormatVoice;
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
  if (!(audioProvider instanceof HTMLSelectElement)) return;
  
  // Safety check: If format is not audio, hide all audio fields and return
  const outputFormat = getElement('outputFormat');
  const format = outputFormat instanceof HTMLSelectElement ? outputFormat.value : '';
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
  if (audioSpeed instanceof HTMLInputElement) {
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
  // CRITICAL: Use settingsModule.updateVoiceList instead of deprecated updateVoiceList
  if (window.settingsModule && window.settingsModule.updateVoiceList) {
    window.settingsModule.updateVoiceList(provider);
  } else {
    // Fallback to old implementation (should not happen in normal flow)
    console.warn('[ClipAIble Popup] settingsModule.updateVoiceList not available, using deprecated updateVoiceList');
    updateVoiceList(provider);
  }
}

// Show/hide translation-related UI based on language selection
async function updateTranslationVisibility() {
  const languageSelect = getElement('languageSelect');
  const translateImages = getElement('translateImages');
  const outputFormat = getElement('outputFormat');
  
  if (!(languageSelect instanceof HTMLSelectElement) || !(translateImages instanceof HTMLInputElement) || !(outputFormat instanceof HTMLSelectElement)) return;
  
  const isTranslating = languageSelect.value !== 'auto';
  const translateImagesEnabled = translateImages.checked;
  const isAudio = outputFormat.value === 'audio';
  
  // Show image translation option only when translating AND not audio format
  // Audio format doesn't use images, so translation option is not needed
  setElementGroupDisplay('translateImagesGroup', (isTranslating && !isAudio) ? 'block' : 'none');
  
  // Show Google API key input when image translation is enabled
  setElementGroupDisplay('googleApiGroup', (isTranslating && translateImagesEnabled) ? 'block' : 'none');
  
  // Show hint if translateImages is enabled but Google key is missing
  const translateImagesHint = getElement('translateImagesHint');
  if (isTranslating && translateImagesEnabled && translateImagesHint) {
    const googleApiKey = getElement('googleApiKey');
    const googleApiKeyValue = (googleApiKey instanceof HTMLInputElement ? googleApiKey.value : '').trim() || '';
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
    elements.statusText.innerHTML = `${text} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    // Ensure timer is running if we have a startTime
    if (effectiveStartTime && !timerIntervalRef.current) {
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
async function saveVoiceBeforeClose() {
  // Save any pending debounced settings first
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
  }
  
  // CRITICAL: Use saveAudioVoice from settings module to ensure consistency
  if (!isSavingSettings && elements.audioVoice && elements.audioProvider && window.settingsModule && window.settingsModule.saveAudioVoice) {
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
        else if (selectedOption.value && /^\d+$/.test(String(selectedOption.value)) && window.settingsModule.getVoiceIdByIndex) {
          voiceToSave = window.settingsModule.getVoiceIdByIndex(provider, selectedIndex);
        }
      }
      
      // If still no valid voice, try to get from current value
      if (!voiceToSave && elements.audioVoice.value && !/^\d+$/.test(String(elements.audioVoice.value))) {
        voiceToSave = elements.audioVoice.value;
      }
      
      // Only save if we have a valid voice ID (not an index)
      if (voiceToSave && voiceToSave !== '' && !/^\d+$/.test(String(voiceToSave))) {
        // CRITICAL: Use saveAudioVoice from settings module - it handles audioVoiceMap correctly
        window.settingsModule.saveAudioVoice(provider, voiceToSave);
        
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
        
        // Save synchronously before closing
        await chrome.storage.local.set({ 
          [STORAGE_KEYS.AUDIO_VOICE]: voiceToSave,
          [STORAGE_KEYS.AUDIO_VOICE_MAP]: currentMap
        });
        
        console.log('[ClipAIble Popup] CRITICAL: Saved voice before close', {
          timestamp: Date.now(),
          provider,
          voiceToSave,
          selectedIndex,
          datasetVoiceId: selectedOption?.dataset?.voiceId,
          optionValue: selectedOption?.value,
          voiceMap: currentMap
        });
      } else {
        console.warn('[ClipAIble Popup] CRITICAL: Cannot save voice before close - invalid voice ID', {
          timestamp: Date.now(),
          provider,
          voiceToSave,
          selectedIndex,
          optionValue: selectedOption?.value,
          datasetVoiceId: selectedOption?.dataset?.voiceId
        });
      }
    } catch (error) {
      console.error('[ClipAIble Popup] Failed to save settings before close', error);
    } finally {
      isSavingSettings = false;
    }
  }
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeDate(date) {
  const now = new Date();
  const dateTime = date instanceof Date ? date.getTime() : (typeof date === 'number' ? date : Date.now());
  const diffMs = now.getTime() - dateTime;
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
