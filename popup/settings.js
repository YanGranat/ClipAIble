// Settings module for popup
// Facade module that imports and combines all settings submodules
// Handles settings loading, saving, API keys, models, UI updates, etc.

import { decryptApiKey, maskApiKey } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logError, logWarn } from '../scripts/utils/logging.js';
import { CONFIG } from '../scripts/utils/config.js';
import { getProviderFromModel } from '../scripts/api/index.js';
import { sanitizeMarkdownHtml } from '../scripts/utils/html.js';

// Import submodules
import { initApiKeys } from './settings/api-keys.js';
import { initModels } from './settings/models.js';
import { initStyles } from './settings/styles.js';
import { initAudio } from './settings/audio.js';
import { initUIVisibility } from './settings/ui-visibility.js';

/**
 * Initialize settings module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements object
 * @param {Object} deps.STORAGE_KEYS - Storage keys object
 * @param {Object} deps.DEFAULT_STYLES - Default styles object
 * @param {Object} deps.STYLE_PRESETS - Style presets object
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.showToast - Show toast function
 * @param {Function} deps.setCustomSelectValue - Set custom select value function
 * @param {Function} deps.getElement - Get element helper
 * @param {Function} deps.setElementDisplay - Set element display helper
 * @param {Function} deps.setElementGroupDisplay - Set element group display helper
 * @param {Function} deps.setDisplayForIds - Set display for IDs helper
 * @param {Function} deps.applyTheme - Apply theme function
 * @param {Function} deps.markdownToHtml - Markdown to HTML converter
 * @param {Object} deps.audioVoiceMap - Audio voice map reference
 * @returns {Object} Settings functions
 */
export function initSettings(deps) {
  const {
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
    audioVoiceMap
  } = deps;

  // Initialize submodules in correct order (respecting dependencies)
  
  // Step 1: Initialize API keys module (provides formatModelLabel)
  const apiKeysModule = initApiKeys({
    elements,
    STORAGE_KEYS,
    showToast
  });

  // Step 2: Initialize models module (needs formatModelLabel from api-keys)
  const modelsModule = initModels({
    elements,
    STORAGE_KEYS,
    formatModelLabel: apiKeysModule.formatModelLabel
  });

  // Step 3: Link updateModelList to api-keys module
  apiKeysModule.setUpdateModelList(modelsModule.updateModelList);

  // Step 4: Initialize styles module (independent)
  const stylesModule = initStyles({
    elements,
    STORAGE_KEYS,
    DEFAULT_STYLES,
    showToast,
    setCustomSelectValue
  });

  // Step 5: Initialize audio module (independent)
  const audioModule = initAudio({
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    audioVoiceMap,
    getElement,
    setElementGroupDisplay
  });

  // Step 6: Initialize UI visibility module (needs audio functions)
  const uiVisibilityModule = initUIVisibility({
    elements,
    getElement,
    setElementGroupDisplay,
    setDisplayForIds,
    hideAllAudioFields: audioModule.hideAllAudioFields,
    updateAudioProviderUI: audioModule.updateAudioProviderUI
  });

  // Load saved settings from storage
  // This is a large function (800+ lines) that loads all settings from chrome.storage.local
  // and populates the UI elements with the saved values
  async function loadSettings() {
    log('loadSettings: starting');
    try {
      log('loadSettings: requesting settings from storage');
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.API_PROVIDER,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.CLAUDE_API_KEY,
        STORAGE_KEYS.GEMINI_API_KEY,
        STORAGE_KEYS.GROK_API_KEY,
        STORAGE_KEYS.OPENROUTER_API_KEY,
        STORAGE_KEYS.GOOGLE_API_KEY,
        STORAGE_KEYS.MODEL, 
        STORAGE_KEYS.MODE,
        STORAGE_KEYS.USE_CACHE,
        STORAGE_KEYS.ENABLE_CACHE,
        STORAGE_KEYS.ENABLE_STATS,
        STORAGE_KEYS.OUTPUT_FORMAT,
        STORAGE_KEYS.GENERATE_TOC,
        STORAGE_KEYS.GENERATE_ABSTRACT,
        STORAGE_KEYS.PAGE_MODE,
        STORAGE_KEYS.LANGUAGE,
        STORAGE_KEYS.TRANSLATE_IMAGES,
        STORAGE_KEYS.STYLE_PRESET,
        STORAGE_KEYS.FONT_FAMILY,
        STORAGE_KEYS.FONT_SIZE,
        STORAGE_KEYS.BG_COLOR,
        STORAGE_KEYS.TEXT_COLOR,
        STORAGE_KEYS.HEADING_COLOR,
        STORAGE_KEYS.LINK_COLOR,
        STORAGE_KEYS.THEME,
        STORAGE_KEYS.UI_LANGUAGE,
        STORAGE_KEYS.AUDIO_PROVIDER,
        STORAGE_KEYS.ELEVENLABS_API_KEY,
        STORAGE_KEYS.ELEVENLABS_MODEL,
        STORAGE_KEYS.ELEVENLABS_STABILITY,
        STORAGE_KEYS.ELEVENLABS_SIMILARITY,
        STORAGE_KEYS.ELEVENLABS_STYLE,
        STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST,
        STORAGE_KEYS.ELEVENLABS_FORMAT,
        STORAGE_KEYS.QWEN_API_KEY,
        STORAGE_KEYS.RESPEECHER_API_KEY,
        STORAGE_KEYS.RESPEECHER_TEMPERATURE,
        STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY,
        STORAGE_KEYS.RESPEECHER_TOP_P,
        STORAGE_KEYS.GOOGLE_TTS_API_KEY,
        STORAGE_KEYS.GOOGLE_TTS_MODEL,
        STORAGE_KEYS.GOOGLE_TTS_VOICE,
        STORAGE_KEYS.GOOGLE_TTS_PROMPT,
        STORAGE_KEYS.OPENAI_INSTRUCTIONS,
        STORAGE_KEYS.AUDIO_VOICE,
        STORAGE_KEYS.AUDIO_VOICE_MAP,
        STORAGE_KEYS.AUDIO_SPEED,
        STORAGE_KEYS.SUMMARY_TEXT,
        STORAGE_KEYS.SUMMARY_GENERATING
      ]);
      
      log('loadSettings: settings retrieved from storage', { 
        hasResult: !!result,
        keysCount: Object.keys(result).length,
        apiProvider: result[STORAGE_KEYS.API_PROVIDER]
      });
      
      // Load API provider (default: openai)
      const apiProvider = result[STORAGE_KEYS.API_PROVIDER] || 'openai';
      log('loadSettings: setting API provider', { apiProvider, hasElement: !!elements.apiProviderSelect });
      if (elements.apiProviderSelect) {
        elements.apiProviderSelect.value = apiProvider;
      } else {
        logWarn('loadSettings: apiProviderSelect element not found');
      }
      
      // Load and mask API key for selected provider
      let apiKeyValue = '';
      let apiKeyEncrypted = null;
      
      if (apiProvider === 'openai' && result[STORAGE_KEYS.API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
        } catch (error) {
          logError('Failed to decrypt OpenAI API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
        }
      } else if (apiProvider === 'claude' && result[STORAGE_KEYS.CLAUDE_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Claude API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
        }
      } else if (apiProvider === 'gemini' && result[STORAGE_KEYS.GEMINI_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Gemini API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
        }
      } else if (apiProvider === 'grok' && result[STORAGE_KEYS.GROK_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Grok API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
        }
      } else if (apiProvider === 'openrouter' && result[STORAGE_KEYS.OPENROUTER_API_KEY]) {
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
        }
      }
      
      // Update UI for selected provider
      await apiKeysModule.updateApiProviderUI();
      
      // Keep old API keys in storage for backward compatibility, but don't display them
      // They will be loaded when user switches provider
      
      if (result[STORAGE_KEYS.GOOGLE_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
          elements.googleApiKey.value = maskApiKey(decrypted);
          elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Google API key', error);
          elements.googleApiKey.value = maskApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
          elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
        }
      }
      
      // Model is already set by updateApiProviderUI() -> updateModelList()
      // But we need to ensure saved model is selected if it belongs to current provider
      if (result[STORAGE_KEYS.MODEL] && elements.modelSelect) {
        const savedModel = result[STORAGE_KEYS.MODEL];
        const savedModelProvider = getProviderFromModel(savedModel);
        const currentProvider = elements.apiProviderSelect?.value || 'openai';
        
        // Only set saved model if it belongs to current provider
        // Otherwise updateModelList() has already set the first model of the provider
        if (savedModelProvider === currentProvider) {
          // Check if the model option exists in the select
          const optionExists = Array.from(elements.modelSelect.options).some(
            opt => opt.value === savedModel
          );
          if (optionExists) {
            elements.modelSelect.value = savedModel;
          }
        }
      }
      
      if (result[STORAGE_KEYS.MODE]) {
        elements.modeSelect.value = result[STORAGE_KEYS.MODE];
      }
      
      // Default: enabled (true) - cache selectors by default
      // Explicitly check for boolean false to distinguish from undefined/null
      // CRITICAL FIX: Preserve current checkbox state if storage value is undefined/null
      // This prevents race conditions where loadSettings() might overwrite a value being saved
      const useCacheValue = result[STORAGE_KEYS.USE_CACHE];
      
      if (useCacheValue === false) {
        // User explicitly disabled - respect their choice
        elements.useCache.checked = false;
      } else if (useCacheValue === true) {
        // Explicitly enabled
        elements.useCache.checked = true;
      } else {
        // First time or undefined/null
        // CRITICAL: If checkbox is already unchecked, user likely just unchecked it
        // Don't override their choice - preserve the unchecked state
        // Only set to true (default) if checkbox is in its default/checked state
        if (elements.useCache.checked === false) {
          // Checkbox is unchecked - preserve user's choice, don't save default
          // The change event handler will save the value when user changes it
          // This prevents race conditions where loadSettings() overwrites a value being saved
        } else {
          // Checkbox is checked or in default state - safe to set default
          elements.useCache.checked = true;
          try {
            // Save explicitly as boolean true to ensure it's preserved
            await chrome.storage.local.set({ [STORAGE_KEYS.USE_CACHE]: true });
          } catch (error) {
            logError('Failed to save default use_selector_cache setting', error);
          }
        }
      }
      
      // Load enableCache setting (enable_selector_caching) - INDEPENDENT setting, NO SYNC with useCache
      if (elements.enableCache) {
        const enableCacheValue = result[STORAGE_KEYS.ENABLE_CACHE];
        
        if (enableCacheValue === false) {
          elements.enableCache.checked = false;
        } else if (enableCacheValue === true) {
          elements.enableCache.checked = true;
        } else {
          // First time or undefined/null - default to true
          elements.enableCache.checked = true;
          try {
            await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_CACHE]: true });
          } catch (error) {
            logError('Failed to save default enable_selector_caching setting', error);
          }
        }
      }
      
      // Load enableStats setting with migration
      if (elements.enableStats) {
        const enableStatsValue = result[STORAGE_KEYS.ENABLE_STATS];
        
        if (enableStatsValue === false) {
          // User explicitly disabled - respect their choice
          elements.enableStats.checked = false;
        } else if (enableStatsValue === true) {
          // Explicitly enabled
          elements.enableStats.checked = true;
        } else {
          // First time or undefined/null - check if stats exist for migration
          try {
            const statsResult = await chrome.storage.local.get(['extension_stats']);
            const stats = statsResult.extension_stats;
            
            // If user has existing stats (totalSaved > 0), enable by default
            // Otherwise, default to enabled (first time)
            const shouldEnable = !stats || stats.totalSaved === 0 ? true : stats.totalSaved > 0;
            
            elements.enableStats.checked = shouldEnable;
            
            // Save default value
            try {
              await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: shouldEnable });
            } catch (error) {
              logError('Failed to save default enable_statistics setting', error);
            }
          } catch (error) {
            logError('Failed to check stats for migration', error);
            // On error, default to enabled
            elements.enableStats.checked = true;
            try {
              await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: true });
            } catch (saveError) {
              logError('Failed to save default enable_statistics setting', saveError);
            }
          }
        }
      }
      
      if (result[STORAGE_KEYS.OUTPUT_FORMAT]) {
        elements.outputFormat.value = result[STORAGE_KEYS.OUTPUT_FORMAT];
        if (elements.mainFormatSelect) {
          elements.mainFormatSelect.value = result[STORAGE_KEYS.OUTPUT_FORMAT];
        }
      }
      
      if (result[STORAGE_KEYS.GENERATE_TOC]) {
        elements.generateToc.checked = result[STORAGE_KEYS.GENERATE_TOC];
      }
      
      if (result[STORAGE_KEYS.GENERATE_ABSTRACT] !== undefined) {
        elements.generateAbstract.checked = result[STORAGE_KEYS.GENERATE_ABSTRACT];
      } else {
        elements.generateAbstract.checked = false; // Default: disabled
      }
      
      if (result[STORAGE_KEYS.PAGE_MODE]) {
        elements.pageMode.value = result[STORAGE_KEYS.PAGE_MODE];
      }
      
      if (result[STORAGE_KEYS.LANGUAGE]) {
        elements.languageSelect.value = result[STORAGE_KEYS.LANGUAGE];
      }
      
      if (result[STORAGE_KEYS.TRANSLATE_IMAGES]) {
        elements.translateImages.checked = result[STORAGE_KEYS.TRANSLATE_IMAGES];
      }
      
      // Load style preset
      const savedPreset = result[STORAGE_KEYS.STYLE_PRESET] || 'dark';
      elements.stylePreset.value = savedPreset;
      
      // Sync custom select display for stylePreset
      const stylePresetContainer = document.getElementById('stylePresetContainer');
      if (stylePresetContainer) {
        const valueSpan = stylePresetContainer.querySelector('.custom-select-value');
        const selectedOption = stylePresetContainer.querySelector(`[data-value="${savedPreset}"]`);
        if (valueSpan && selectedOption) {
          valueSpan.textContent = selectedOption.textContent;
          stylePresetContainer.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          selectedOption.classList.add('selected');
        }
      }
      
      if (result[STORAGE_KEYS.FONT_FAMILY]) {
        elements.fontFamily.value = result[STORAGE_KEYS.FONT_FAMILY];
        setCustomSelectValue(result[STORAGE_KEYS.FONT_FAMILY]);
      }
      
      if (result[STORAGE_KEYS.FONT_SIZE]) {
        // Convert old preset values to numbers
        const oldToNew = { 'small': '24', 'medium': '31', 'large': '38', 'xlarge': '45' };
        const savedSize = result[STORAGE_KEYS.FONT_SIZE];
        elements.fontSize.value = oldToNew[savedSize] || savedSize;
      }
      
      // Apply colors: if preset is not 'custom', use preset colors; otherwise use saved colors
      if (savedPreset !== 'custom' && STYLE_PRESETS[savedPreset]) {
        // Apply preset colors (always use preset colors, not saved ones)
        const colors = STYLE_PRESETS[savedPreset];
        elements.bgColor.value = colors.bgColor;
        elements.bgColorText.value = colors.bgColor;
        elements.textColor.value = colors.textColor;
        elements.textColorText.value = colors.textColor;
        elements.headingColor.value = colors.headingColor;
        elements.headingColorText.value = colors.headingColor;
        elements.linkColor.value = colors.linkColor;
        elements.linkColorText.value = colors.linkColor;
      } else {
        // Load custom colors from storage (only for 'custom' preset)
        if (result[STORAGE_KEYS.BG_COLOR]) {
          elements.bgColor.value = result[STORAGE_KEYS.BG_COLOR];
          elements.bgColorText.value = result[STORAGE_KEYS.BG_COLOR];
        } else {
          elements.bgColor.value = DEFAULT_STYLES.bgColor;
          elements.bgColorText.value = DEFAULT_STYLES.bgColor;
        }
        
        if (result[STORAGE_KEYS.TEXT_COLOR]) {
          elements.textColor.value = result[STORAGE_KEYS.TEXT_COLOR];
          elements.textColorText.value = result[STORAGE_KEYS.TEXT_COLOR];
        } else {
          elements.textColor.value = DEFAULT_STYLES.textColor;
          elements.textColorText.value = DEFAULT_STYLES.textColor;
        }
        
        if (result[STORAGE_KEYS.HEADING_COLOR]) {
          elements.headingColor.value = result[STORAGE_KEYS.HEADING_COLOR];
          elements.headingColorText.value = result[STORAGE_KEYS.HEADING_COLOR];
        } else {
          elements.headingColor.value = DEFAULT_STYLES.headingColor;
          elements.headingColorText.value = DEFAULT_STYLES.headingColor;
        }
        
        if (result[STORAGE_KEYS.LINK_COLOR]) {
          elements.linkColor.value = result[STORAGE_KEYS.LINK_COLOR];
          elements.linkColorText.value = result[STORAGE_KEYS.LINK_COLOR];
        } else {
          elements.linkColor.value = DEFAULT_STYLES.linkColor;
          elements.linkColorText.value = DEFAULT_STYLES.linkColor;
        }
      }
      
      if (result[STORAGE_KEYS.THEME] && elements.themeSelect) {
        elements.themeSelect.value = result[STORAGE_KEYS.THEME];
      }
      
      if (result[STORAGE_KEYS.UI_LANGUAGE] && elements.uiLanguageSelect) {
        elements.uiLanguageSelect.value = result[STORAGE_KEYS.UI_LANGUAGE];
      } else if (elements.uiLanguageSelect) {
        elements.uiLanguageSelect.value = 'en';
      }
      
      // Load audio settings
      if (result[STORAGE_KEYS.AUDIO_PROVIDER]) {
        elements.audioProvider.value = result[STORAGE_KEYS.AUDIO_PROVIDER];
      } else {
        elements.audioProvider.value = 'openai'; // Default
      }

      // Load per-provider voice map (backward compatible)
      if (result[STORAGE_KEYS.AUDIO_VOICE_MAP] && typeof result[STORAGE_KEYS.AUDIO_VOICE_MAP] === 'object' && !Array.isArray(result[STORAGE_KEYS.AUDIO_VOICE_MAP])) {
        // Ensure audioVoiceMap has 'current' property
        if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
          logWarn('audioVoiceMap is not properly initialized in loadSettings');
        } else {
          audioVoiceMap.current = result[STORAGE_KEYS.AUDIO_VOICE_MAP];
        }
      } else {
        // Initialize empty map if not exists
        if (audioVoiceMap && typeof audioVoiceMap === 'object' && !Array.isArray(audioVoiceMap)) {
          if (!('current' in audioVoiceMap)) {
            audioVoiceMap.current = {};
          }
        } else {
          logWarn('audioVoiceMap is not properly initialized in loadSettings');
        }
      }
      
      // Load and mask ElevenLabs API key
      if (result[STORAGE_KEYS.ELEVENLABS_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.ELEVENLABS_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('ElevenLabs API key in storage is corrupted (contains mask), clearing...');
            elements.elevenlabsApiKey.value = '';
            elements.elevenlabsApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.ELEVENLABS_API_KEY);
          } else {
            elements.elevenlabsApiKey.value = maskApiKey(decrypted);
            elements.elevenlabsApiKey.dataset.encrypted = result[STORAGE_KEYS.ELEVENLABS_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt ElevenLabs API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.elevenlabsApiKey.value = '';
          elements.elevenlabsApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.ELEVENLABS_API_KEY);
        }
      }
      
      // Load and mask Qwen API key
      if (result[STORAGE_KEYS.QWEN_API_KEY] && elements.qwenApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.QWEN_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('Qwen API key in storage is corrupted (contains mask), clearing...');
            elements.qwenApiKey.value = '';
            elements.qwenApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.QWEN_API_KEY);
          } else {
            elements.qwenApiKey.value = maskApiKey(decrypted);
            elements.qwenApiKey.dataset.encrypted = result[STORAGE_KEYS.QWEN_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt Qwen API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.qwenApiKey.value = '';
          elements.qwenApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.QWEN_API_KEY);
        }
      }
      
      // Load and mask Respeecher API key
      if (result[STORAGE_KEYS.RESPEECHER_API_KEY] && elements.respeecherApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.RESPEECHER_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('Respeecher API key in storage is corrupted (contains mask), clearing...');
            elements.respeecherApiKey.value = '';
            elements.respeecherApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.RESPEECHER_API_KEY);
          } else {
            elements.respeecherApiKey.value = maskApiKey(decrypted);
            elements.respeecherApiKey.dataset.encrypted = result[STORAGE_KEYS.RESPEECHER_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt Respeecher API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.respeecherApiKey.value = '';
          elements.respeecherApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.RESPEECHER_API_KEY);
        }
      }
      
      // Load and mask Google TTS API key
      if (result[STORAGE_KEYS.GOOGLE_TTS_API_KEY] && elements.googleTtsApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GOOGLE_TTS_API_KEY]);
          elements.googleTtsApiKey.value = maskApiKey(decrypted);
          elements.googleTtsApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_TTS_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Google TTS API key', error);
          // Keep the encrypted key in dataset even if decryption fails (same as Gemini key)
          elements.googleTtsApiKey.value = maskApiKey(result[STORAGE_KEYS.GOOGLE_TTS_API_KEY]);
          elements.googleTtsApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_TTS_API_KEY];
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_MODEL]) {
        elements.elevenlabsModel.value = result[STORAGE_KEYS.ELEVENLABS_MODEL];
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_STABILITY] !== undefined) {
        // Normalize old values to valid ElevenLabs values: 0.0, 0.5, or 1.0
        const normalizeStability = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.5;
          if (num <= 0.25) return 0.0;
          if (num <= 0.75) return 0.5;
          return 1.0;
        };
        const normalizedValue = normalizeStability(result[STORAGE_KEYS.ELEVENLABS_STABILITY]);
        elements.elevenlabsStability.value = normalizedValue;
        if (elements.elevenlabsStabilityValue) {
          elements.elevenlabsStabilityValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_STABILITY])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STABILITY, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_SIMILARITY] !== undefined) {
        // Normalize to step 0.1 (round to nearest 0.1)
        const normalizeSimilarity = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.75;
          return Math.round(num * 10) / 10;
        };
        const normalizedValue = normalizeSimilarity(result[STORAGE_KEYS.ELEVENLABS_SIMILARITY]);
        elements.elevenlabsSimilarity.value = normalizedValue;
        if (elements.elevenlabsSimilarityValue) {
          elements.elevenlabsSimilarityValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_SIMILARITY])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SIMILARITY, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_STYLE] !== undefined) {
        // Normalize to step 0.1 (round to nearest 0.1)
        const normalizeStyle = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.0;
          return Math.round(num * 10) / 10;
        };
        const normalizedValue = normalizeStyle(result[STORAGE_KEYS.ELEVENLABS_STYLE]);
        elements.elevenlabsStyle.value = normalizedValue;
        if (elements.elevenlabsStyleValue) {
          elements.elevenlabsStyleValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_STYLE])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STYLE, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST] !== undefined) {
        elements.elevenlabsSpeakerBoost.checked = result[STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST];
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_FORMAT] && elements.elevenlabsFormat) {
        elements.elevenlabsFormat.value = result[STORAGE_KEYS.ELEVENLABS_FORMAT];
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_TEMPERATURE] !== undefined && elements.respeecherTemperature) {
        elements.respeecherTemperature.value = result[STORAGE_KEYS.RESPEECHER_TEMPERATURE];
        if (elements.respeecherTemperatureValue) {
          elements.respeecherTemperatureValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_TEMPERATURE]).toFixed(1);
        }
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY] !== undefined && elements.respeecherRepetitionPenalty) {
        elements.respeecherRepetitionPenalty.value = result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY];
        if (elements.respeecherRepetitionPenaltyValue) {
          elements.respeecherRepetitionPenaltyValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY]).toFixed(1);
        }
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_TOP_P] !== undefined && elements.respeecherTopP) {
        elements.respeecherTopP.value = result[STORAGE_KEYS.RESPEECHER_TOP_P];
        if (elements.respeecherTopPValue) {
          elements.respeecherTopPValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_TOP_P]).toFixed(2);
        }
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_MODEL] && elements.googleTtsModel) {
        elements.googleTtsModel.value = result[STORAGE_KEYS.GOOGLE_TTS_MODEL];
      }
      
      if (result[STORAGE_KEYS.OPENAI_INSTRUCTIONS] !== undefined) {
        elements.openaiInstructions.value = result[STORAGE_KEYS.OPENAI_INSTRUCTIONS];
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_VOICE] && elements.googleTtsVoice) {
        elements.googleTtsVoice.value = result[STORAGE_KEYS.GOOGLE_TTS_VOICE];
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_PROMPT] !== undefined && elements.googleTtsPrompt) {
        elements.googleTtsPrompt.value = result[STORAGE_KEYS.GOOGLE_TTS_PROMPT] || '';
      }
      
      // Determine initial voice: prefer per-provider map, fallback to legacy single value
      const initialProvider = elements.audioProvider.value || 'openai';
      const legacyVoice = result[STORAGE_KEYS.AUDIO_VOICE];
      const voiceMap = (audioVoiceMap && typeof audioVoiceMap === 'object' && 'current' in audioVoiceMap) 
        ? audioVoiceMap.current 
        : (audioVoiceMap || {});
      const mappedVoice = voiceMap[initialProvider];
      const initialVoice = mappedVoice || legacyVoice;
      if (initialVoice) {
        elements.audioVoice.value = initialVoice;
        // Migrate legacy value into map for current provider
        if (!mappedVoice && legacyVoice) {
          audioModule.saveAudioVoice(initialProvider, legacyVoice);
        }
      }
      
      if (result[STORAGE_KEYS.AUDIO_SPEED]) {
        elements.audioSpeed.value = result[STORAGE_KEYS.AUDIO_SPEED];
        if (elements.audioSpeedValue) {
          elements.audioSpeedValue.textContent = result[STORAGE_KEYS.AUDIO_SPEED] + 'x';
        }
      }
      
      // Update voice list based on provider (AFTER loading audio_voice from storage)
      // This ensures that invalid voices (e.g., 'volodymyr' for Ukrainian text, or 'nova' for Respeecher)
      // are replaced with valid defaults and restores per-provider voice selection
      // ============================================
      // UI VISIBILITY INITIALIZATION
      // ============================================
      // IMPORTANT: Order matters! updateOutputFormatUI() must be called LAST because:
      // 1. It calls updateAudioProviderUI() internally (which depends on format)
      // 2. It calls updateTranslationVisibility() internally (which depends on format)
      // 3. It handles all format-specific visibility (PDF style, audio fields, TOC/abstract)
      
      // Step 1: Update voice list for current provider (populates dropdown)
      audioModule.updateVoiceList(elements.audioProvider.value);
      
      // Step 2: Apply preset colors (if preset is selected) - already done in loadSettings()
      // This code is kept for backward compatibility but colors are now applied in loadSettings()
      
      // Step 3: Update mode hint (selector vs extract mode)
      uiVisibilityModule.updateModeHint();
      
      // Step 4: Update cache visibility (only for selector mode)
      uiVisibilityModule.updateCacheVisibility();
      
      // Step 5: Update output format UI (MASTER FUNCTION - calls other update functions)
      // This is async because it calls updateTranslationVisibility() which is async
      await uiVisibilityModule.updateOutputFormatUI();
      
      // Step 6: Final safety check - ensure all audio fields are hidden if format is not audio
      // This is a defensive check in case format changed during async operations
      // or if updateOutputFormatUI() didn't properly hide fields
      const currentFormat = getElement('outputFormat')?.value;
      if (currentFormat !== 'audio') {
        audioModule.hideAllAudioFields();
      }
      
      // Step 7: Update theme icon after loading theme setting
      log('loadSettings: applying theme');
      applyTheme();
      
      // Step 8: Restore summary if it exists or check if generation is in progress
      // Check if generation flag is stale first
      if (result[STORAGE_KEYS.SUMMARY_GENERATING]) {
        const stored = await chrome.storage.local.get(['summary_generating_start_time']);
        // CRITICAL: Use shorter threshold - summary should not take more than 15 minutes
        // If it takes longer, it's likely stuck or failed
        const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes (reduced from 30)
        
        // If no timestamp exists, or timestamp is stale, reset the flag
        if (!stored.summary_generating_start_time) {
          // No timestamp - flag is from old version or was set incorrectly, reset it
          logWarn('Summary generation flag has no timestamp, resetting', {});
          await chrome.storage.local.set({ 
            [STORAGE_KEYS.SUMMARY_GENERATING]: false,
            summary_generating_start_time: null
          });
          result[STORAGE_KEYS.SUMMARY_GENERATING] = false;
          
          // Ensure button is enabled after reset
          if (elements.generateSummaryBtn) {
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
          }
        } else {
          const timeSinceStart = Date.now() - stored.summary_generating_start_time;
          
          if (timeSinceStart > STALE_THRESHOLD) {
            // Flag is stale - reset it
            logWarn('Summary generation flag is stale on load, resetting', { timeSinceStart });
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            result[STORAGE_KEYS.SUMMARY_GENERATING] = false;
            
            // Ensure button is enabled after reset
            if (elements.generateSummaryBtn) {
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
            }
          }
        }
      }
      
      if (result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.generateSummaryBtn) {
        // Summary generation was in progress - show status
        const generatingText = await t('generatingSummary') || 'Generating summary...';
        elements.generateSummaryBtn.textContent = generatingText;
        elements.generateSummaryBtn.disabled = true;
        
        // CRITICAL: Don't automatically restore summary here
        // Summary will be handled by checkSummaryStatus polling
        // This prevents showing stale summary after extension reload
        log('loadSettings: Summary generation in progress - will be handled by checkSummaryStatus polling');
      }
      
      // CRITICAL: Summary persists across popup opens/closes
      // Only cleared by: 1) extension reload (handled in background.js), 2) new generation start, 3) close button
      // If summary exists and not generating, show it immediately
      // Background.js clears summary on reload, so if it exists here, it's valid
      if (result[STORAGE_KEYS.SUMMARY_TEXT] && !result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.summaryText && elements.summaryContainer) {
        const savedSummary = result[STORAGE_KEYS.SUMMARY_TEXT];
        elements.summaryText.dataset.originalMarkdown = savedSummary;
        const htmlSummary = markdownToHtml(savedSummary);
        // SECURITY: Sanitize HTML to prevent XSS attacks from AI-generated content
        const sanitizedHtml = sanitizeMarkdownHtml(htmlSummary);
        elements.summaryText.innerHTML = sanitizedHtml;
        elements.summaryContainer.style.display = 'block';
        log('loadSettings: Summary restored from storage');
      } else if (!result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.summaryContainer) {
        // No summary and not generating - hide container
        elements.summaryContainer.style.display = 'none';
        log('loadSettings: No summary to restore');
      }
      
      log('loadSettings: completed successfully');
    } catch (error) {
      logError('CRITICAL: loadSettings() failed', error);
      logError('loadSettings: error details', { 
        message: error.message, 
        stack: error.stack,
        errorName: error.name
      });
      // Re-throw to prevent silent failures
      throw error;
    }
  }

  // Return all functions from all modules
  return {
    // From api-keys module
    formatModelLabel: apiKeysModule.formatModelLabel,
    updateApiProviderUI: apiKeysModule.updateApiProviderUI,
    saveApiKey: apiKeysModule.saveApiKey,
    
    // From models module
    updateModelList: modelsModule.updateModelList,
    showCustomModelDropdown: modelsModule.showCustomModelDropdown,
    showAddModelDialog: modelsModule.showAddModelDialog,
    addCustomModel: modelsModule.addCustomModel,
    hideDefaultModel: modelsModule.hideDefaultModel,
    removeCustomModel: modelsModule.removeCustomModel,
    
    // From styles module
    resetStyleSetting: stylesModule.resetStyleSetting,
    resetAllStyles: stylesModule.resetAllStyles,
    
    // From audio module
    saveAudioVoice: audioModule.saveAudioVoice,
    hideAllAudioFields: audioModule.hideAllAudioFields,
    updateVoiceList: audioModule.updateVoiceList,
    updateAudioProviderUI: audioModule.updateAudioProviderUI,
    
    // From UI visibility module
    updateModeHint: uiVisibilityModule.updateModeHint,
    updateCacheVisibility: uiVisibilityModule.updateCacheVisibility,
    updateTranslationVisibility: uiVisibilityModule.updateTranslationVisibility,
    updateOutputFormatUI: uiVisibilityModule.updateOutputFormatUI,
    
    // From main module (loadSettings)
    loadSettings
  };
}
