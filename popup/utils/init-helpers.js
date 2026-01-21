// Initialization helper utilities for popup
// Provides helper functions for popup initialization to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../../scripts/utils/logging.js';
import { getExtensionVersion } from '../../scripts/utils/config.js';
import { groupDependencies } from './dependencies.js';
import { ELEMENT_IDS } from '../constants.js';

/**
 * Initialize all DOM elements
 * @param {Record<string, HTMLElement|null>} elements - Elements object to populate
 * @returns {void}
 */
export function initializeDOMElements(elements) {
  // API Provider and Keys
  elements.apiProviderSelect = document.getElementById(ELEMENT_IDS.API_PROVIDER_SELECT);
  elements.apiKey = document.getElementById(ELEMENT_IDS.API_KEY);
  elements.apiKeyLabel = document.getElementById(ELEMENT_IDS.API_KEY_LABEL);
  elements.apiKeyInputGroup = document.getElementById(ELEMENT_IDS.API_KEY_INPUT_GROUP);
  elements.toggleApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_API_KEY);
  elements.claudeApiKey = document.getElementById(ELEMENT_IDS.CLAUDE_API_KEY);
  elements.toggleClaudeApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_CLAUDE_API_KEY);
  elements.geminiApiKey = document.getElementById(ELEMENT_IDS.GEMINI_API_KEY);
  elements.toggleGeminiApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_GEMINI_API_KEY);
  elements.googleApiKey = document.getElementById(ELEMENT_IDS.GOOGLE_API_KEY);
  elements.toggleGoogleApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_GOOGLE_API_KEY);
  elements.googleApiGroup = document.getElementById(ELEMENT_IDS.GOOGLE_API_GROUP);
  elements.saveGoogleApiKey = document.getElementById(ELEMENT_IDS.SAVE_GOOGLE_API_KEY);
  elements.saveApiKey = document.getElementById(ELEMENT_IDS.SAVE_API_KEY);
  
  // Main controls
  elements.savePdfBtn = document.getElementById(ELEMENT_IDS.SAVE_PDF_BTN);
  elements.saveIcon = document.getElementById(ELEMENT_IDS.SAVE_ICON);
  elements.saveText = document.getElementById(ELEMENT_IDS.SAVE_TEXT);
  elements.mainFormatSelect = document.getElementById(ELEMENT_IDS.MAIN_FORMAT_SELECT);
  elements.cancelBtn = document.getElementById(ELEMENT_IDS.CANCEL_BTN);
  
  // Summary
  elements.generateSummaryBtn = document.getElementById(ELEMENT_IDS.GENERATE_SUMMARY_BTN);
  elements.summaryContainer = document.getElementById(ELEMENT_IDS.SUMMARY_CONTAINER);
  elements.summaryToggle = document.getElementById(ELEMENT_IDS.SUMMARY_TOGGLE);
  elements.summaryContent = document.getElementById(ELEMENT_IDS.SUMMARY_CONTENT);
  elements.summaryText = document.getElementById(ELEMENT_IDS.SUMMARY_TEXT);
  elements.summaryCopyBtn = document.getElementById(ELEMENT_IDS.SUMMARY_COPY_BTN);
  elements.summaryDownloadBtn = document.getElementById(ELEMENT_IDS.SUMMARY_DOWNLOAD_BTN);
  elements.summaryCloseBtn = document.getElementById(ELEMENT_IDS.SUMMARY_CLOSE_BTN);
  
  // Settings and Stats
  elements.toggleSettings = document.getElementById(ELEMENT_IDS.TOGGLE_SETTINGS);
  elements.settingsPanel = document.getElementById(ELEMENT_IDS.SETTINGS_PANEL);
  elements.toggleStats = document.getElementById(ELEMENT_IDS.TOGGLE_STATS);
  elements.statsPanel = document.getElementById(ELEMENT_IDS.STATS_PANEL);
  elements.clearStatsBtn = document.getElementById(ELEMENT_IDS.CLEAR_STATS_BTN);
  elements.clearCacheBtn = document.getElementById(ELEMENT_IDS.CLEAR_CACHE_BTN);
  elements.enableCache = document.getElementById(ELEMENT_IDS.ENABLE_CACHE);
  elements.enableStats = document.getElementById(ELEMENT_IDS.ENABLE_STATS);
  elements.exportSettingsBtn = document.getElementById(ELEMENT_IDS.EXPORT_SETTINGS_BTN);
  elements.importSettingsBtn = document.getElementById(ELEMENT_IDS.IMPORT_SETTINGS_BTN);
  elements.importFileInput = document.getElementById(ELEMENT_IDS.IMPORT_FILE_INPUT);
  
  // Processing options
  elements.modeSelect = document.getElementById(ELEMENT_IDS.MODE_SELECT);
  elements.modeHint = document.getElementById(ELEMENT_IDS.MODE_HINT);
  elements.useCache = document.getElementById(ELEMENT_IDS.USE_CACHE);
  elements.useCacheGroup = document.getElementById(ELEMENT_IDS.USE_CACHE_GROUP);
  elements.modelSelect = document.getElementById(ELEMENT_IDS.MODEL_SELECT);
  elements.addModelBtn = document.getElementById(ELEMENT_IDS.ADD_MODEL_BTN);
  elements.customModelDropdown = document.getElementById(ELEMENT_IDS.CUSTOM_MODEL_DROPDOWN);
  elements.customModelOptions = document.getElementById(ELEMENT_IDS.CUSTOM_MODEL_OPTIONS);
  elements.outputFormat = document.getElementById(ELEMENT_IDS.OUTPUT_FORMAT);
  elements.generateToc = document.getElementById(ELEMENT_IDS.GENERATE_TOC);
  elements.generateAbstract = document.getElementById(ELEMENT_IDS.GENERATE_ABSTRACT);
  elements.pageMode = document.getElementById(ELEMENT_IDS.PAGE_MODE);
  elements.pageModeGroup = document.getElementById(ELEMENT_IDS.PAGE_MODE_GROUP);
  elements.languageSelect = document.getElementById(ELEMENT_IDS.LANGUAGE_SELECT);
  elements.translateImages = document.getElementById(ELEMENT_IDS.TRANSLATE_IMAGES);
  elements.translateImagesGroup = document.getElementById(ELEMENT_IDS.TRANSLATE_IMAGES_GROUP);
  
  // Find hint element - it's the <p> with class "setting-hint" inside translateImagesGroup
  const translateImagesHintEl = elements.translateImagesGroup?.querySelector('.setting-hint');
  if (translateImagesHintEl) {
    /** @type {any} */
    const hintElement = translateImagesHintEl;
    elements.translateImagesHint = hintElement;
  }
  
  // Styles
  elements.stylePreset = document.getElementById(ELEMENT_IDS.STYLE_PRESET);
  elements.fontFamily = document.getElementById(ELEMENT_IDS.FONT_FAMILY);
  elements.fontFamilyContainer = document.getElementById(ELEMENT_IDS.FONT_FAMILY_CONTAINER);
  elements.fontFamilyTrigger = document.getElementById(ELEMENT_IDS.FONT_FAMILY_TRIGGER);
  elements.fontFamilyValue = document.getElementById(ELEMENT_IDS.FONT_FAMILY_VALUE);
  elements.fontFamilyOptions = document.getElementById(ELEMENT_IDS.FONT_FAMILY_OPTIONS);
  elements.fontSize = document.getElementById(ELEMENT_IDS.FONT_SIZE);
  elements.resetStylesBtn = document.getElementById(ELEMENT_IDS.RESET_STYLES_BTN);
  elements.bgColor = document.getElementById(ELEMENT_IDS.BG_COLOR);
  elements.bgColorText = document.getElementById(ELEMENT_IDS.BG_COLOR_TEXT);
  elements.textColor = document.getElementById(ELEMENT_IDS.TEXT_COLOR);
  elements.textColorText = document.getElementById(ELEMENT_IDS.TEXT_COLOR_TEXT);
  elements.headingColor = document.getElementById(ELEMENT_IDS.HEADING_COLOR);
  elements.headingColorText = document.getElementById(ELEMENT_IDS.HEADING_COLOR_TEXT);
  elements.linkColor = document.getElementById(ELEMENT_IDS.LINK_COLOR);
  elements.linkColorText = document.getElementById(ELEMENT_IDS.LINK_COLOR_TEXT);
  
  // Status and Progress
  elements.statusDot = document.querySelector('.status-dot');
  elements.statusText = document.getElementById(ELEMENT_IDS.STATUS_TEXT);
  elements.progressContainer = document.getElementById(ELEMENT_IDS.PROGRESS_CONTAINER);
  elements.progressBar = document.getElementById(ELEMENT_IDS.PROGRESS_BAR);
  elements.progressText = document.getElementById(ELEMENT_IDS.PROGRESS_TEXT);
  
  // Theme and Language
  elements.themeSelect = document.getElementById(ELEMENT_IDS.THEME_SELECT);
  elements.uiLanguageSelect = document.getElementById(ELEMENT_IDS.UI_LANGUAGE_SELECT);
  
  // Audio settings
  elements.audioProvider = document.getElementById(ELEMENT_IDS.AUDIO_PROVIDER);
  elements.audioProviderGroup = document.getElementById(ELEMENT_IDS.AUDIO_PROVIDER_GROUP);
  elements.elevenlabsApiKey = document.getElementById(ELEMENT_IDS.ELEVENLABS_API_KEY);
  elements.toggleElevenlabsApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_ELEVENLABS_API_KEY);
  elements.saveElevenlabsApiKey = document.getElementById(ELEMENT_IDS.SAVE_ELEVENLABS_API_KEY);
  elements.elevenlabsApiKeyGroup = document.getElementById(ELEMENT_IDS.ELEVENLABS_API_KEY_GROUP);
  elements.elevenlabsModel = document.getElementById(ELEMENT_IDS.ELEVENLABS_MODEL);
  elements.elevenlabsModelGroup = document.getElementById(ELEMENT_IDS.ELEVENLABS_MODEL_GROUP);
  elements.elevenlabsFormat = document.getElementById(ELEMENT_IDS.ELEVENLABS_FORMAT);
  elements.elevenlabsFormatGroup = document.getElementById(ELEMENT_IDS.ELEVENLABS_FORMAT_GROUP);
  elements.elevenlabsAdvancedGroup = document.getElementById(ELEMENT_IDS.ELEVENLABS_ADVANCED_GROUP);
  elements.elevenlabsStability = document.getElementById(ELEMENT_IDS.ELEVENLABS_STABILITY);
  elements.elevenlabsStabilityValue = document.getElementById(ELEMENT_IDS.ELEVENLABS_STABILITY_VALUE);
  elements.elevenlabsSimilarity = document.getElementById(ELEMENT_IDS.ELEVENLABS_SIMILARITY);
  elements.elevenlabsSimilarityValue = document.getElementById(ELEMENT_IDS.ELEVENLABS_SIMILARITY_VALUE);
  elements.elevenlabsStyle = document.getElementById(ELEMENT_IDS.ELEVENLABS_STYLE);
  elements.elevenlabsStyleValue = document.getElementById(ELEMENT_IDS.ELEVENLABS_STYLE_VALUE);
  elements.elevenlabsSpeakerBoost = document.getElementById(ELEMENT_IDS.ELEVENLABS_SPEAKER_BOOST);
  elements.openaiInstructions = document.getElementById(ELEMENT_IDS.OPENAI_INSTRUCTIONS);
  elements.openaiInstructionsGroup = document.getElementById(ELEMENT_IDS.OPENAI_INSTRUCTIONS_GROUP);
  elements.qwenApiKey = document.getElementById(ELEMENT_IDS.QWEN_API_KEY);
  elements.toggleQwenApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_QWEN_API_KEY);
  elements.saveQwenApiKey = document.getElementById(ELEMENT_IDS.SAVE_QWEN_API_KEY);
  elements.qwenApiKeyGroup = document.getElementById(ELEMENT_IDS.QWEN_API_KEY_GROUP);
  elements.respeecherApiKey = document.getElementById(ELEMENT_IDS.RESPEECHER_API_KEY);
  elements.toggleRespeecherApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_RESPEECHER_API_KEY);
  elements.saveRespeecherApiKey = document.getElementById(ELEMENT_IDS.SAVE_RESPEECHER_API_KEY);
  elements.respeecherApiKeyGroup = document.getElementById(ELEMENT_IDS.RESPEECHER_API_KEY_GROUP);
  elements.respeecherAdvancedGroup = document.getElementById(ELEMENT_IDS.RESPEECHER_ADVANCED_GROUP);
  elements.respeecherTemperature = document.getElementById(ELEMENT_IDS.RESPEECHER_TEMPERATURE);
  elements.respeecherTemperatureValue = document.getElementById(ELEMENT_IDS.RESPEECHER_TEMPERATURE_VALUE);
  elements.respeecherRepetitionPenalty = document.getElementById(ELEMENT_IDS.RESPEECHER_REPETITION_PENALTY);
  elements.respeecherRepetitionPenaltyValue = document.getElementById(ELEMENT_IDS.RESPEECHER_REPETITION_PENALTY_VALUE);
  elements.respeecherTopP = document.getElementById(ELEMENT_IDS.RESPEECHER_TOP_P);
  elements.respeecherTopPValue = document.getElementById(ELEMENT_IDS.RESPEECHER_TOP_P_VALUE);
  elements.googleTtsApiKey = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_API_KEY);
  elements.toggleGoogleTtsApiKey = document.getElementById(ELEMENT_IDS.TOGGLE_GOOGLE_TTS_API_KEY);
  elements.saveGoogleTtsApiKey = document.getElementById(ELEMENT_IDS.SAVE_GOOGLE_TTS_API_KEY);
  elements.googleTtsApiKeyGroup = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_API_KEY_GROUP);
  elements.audioVoice = document.getElementById(ELEMENT_IDS.AUDIO_VOICE);
  elements.audioVoiceGroup = document.getElementById(ELEMENT_IDS.AUDIO_VOICE_GROUP);
  elements.audioSpeed = document.getElementById(ELEMENT_IDS.AUDIO_SPEED);
  elements.audioSpeedGroup = document.getElementById(ELEMENT_IDS.AUDIO_SPEED_GROUP);
  elements.audioSpeedValue = document.getElementById(ELEMENT_IDS.AUDIO_SPEED_VALUE);
  elements.audioSpeedNote = document.getElementById(ELEMENT_IDS.AUDIO_SPEED_NOTE);
  elements.googleTtsModel = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_MODEL);
  elements.googleTtsModelGroup = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_MODEL_GROUP);
  elements.googleTtsVoice = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_VOICE);
  elements.googleTtsVoiceGroup = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_VOICE_GROUP);
  elements.googleTtsPrompt = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_PROMPT);
  elements.googleTtsPromptGroup = document.getElementById(ELEMENT_IDS.GOOGLE_TTS_PROMPT_GROUP);
  
  // Add themeSelect to elements object for consistency
  if (!elements.themeSelect) {
    logWarn('Theme select element not found');
  }
}

/**
 * Initialize all modules
 * Supports both flat dependencies (backward compatibility) and grouped dependencies (new approach)
 * @param {Object} rawDeps - Dependencies for module initialization (flat or grouped)
 * @returns {import('../../scripts/types.js').PopupModules} Initialized modules
 */
export function initializeModules(rawDeps) {
  // Check if dependencies are already grouped (has 'domHelpers' property)
  // If not, group them for consistency
  const isGrouped = rawDeps.domHelpers !== undefined;
  const deps = isGrouped ? rawDeps : groupDependencies(rawDeps);
  
  // Extract dependencies from grouped structure
  const {
    elements,
    domHelpers,
    formatHelpers,
    settingsHelpers,
    logging,
    localization,
    config,
    stateRefs: stateRefsGroup,
    uiHelpers,
    apiHelpers,
    timerHelpers,
    moduleInitializers
  } = deps;
  
  // Unpack grouped dependencies for backward compatibility with existing modules
  const formatTime = formatHelpers.formatTime;
  const startTimerDisplay = timerHelpers.startTimerDisplay;
  const getElement = domHelpers.getElement;
  const setElementDisplay = domHelpers.setElementDisplay;
  const setElementGroupDisplay = domHelpers.setElementGroupDisplay;
  const setDisplayForIds = domHelpers.setDisplayForIds;
  const setCustomSelectValue = deps.setCustomSelectValue;
  const currentStartTimeRef = stateRefsGroup.currentStartTimeRef;
  const timerIntervalRef = stateRefsGroup.timerIntervalRef;
  const showToast = uiHelpers.showToast;
  const STORAGE_KEYS = config.STORAGE_KEYS;
  const DEFAULT_STYLES = config.DEFAULT_STYLES;
  const STYLE_PRESETS = config.STYLE_PRESETS;
  const debouncedSaveSettings = settingsHelpers.debouncedSaveSettings;
  const applyTheme = uiHelpers.applyTheme;
  const markdownToHtml = formatHelpers.markdownToHtml;
  const audioVoiceMap = stateRefsGroup.audioVoiceMap;
  const t = localization.t;
  const getUILanguage = localization.getUILanguage;
  const setUILanguage = localization.setUILanguage;
  const UI_LOCALES = localization.UI_LOCALES;
  const loadAndDisplayStats = uiHelpers.loadAndDisplayStats;
  const applyLocalization = localization.applyLocalization;
  const initAllCustomSelects = uiHelpers.initAllCustomSelects;
  const logError = logging.logError;
  const log = logging.log;
  const logWarn = logging.logWarn;
  const setStatus = uiHelpers.setStatus;
  const setProgress = uiHelpers.setProgress;
  const stopTimerDisplay = timerHelpers.stopTimerDisplay;
  const decryptApiKey = apiHelpers.decryptApiKey;
  const maskApiKey = apiHelpers.maskApiKey;
  const encryptApiKey = apiHelpers.encryptApiKey;
  const getProviderFromModel = apiHelpers.getProviderFromModel;
  const detectVideoPlatform = apiHelpers.detectVideoPlatform;
  const sanitizeMarkdownHtml = apiHelpers.sanitizeMarkdownHtml;
  const CONFIG = config.CONFIG;
  const stateRefs = stateRefsGroup.stateRefs;
  const initUI = moduleInitializers.initUI;
  const initStats = moduleInitializers.initStats;
  const initSettings = moduleInitializers.initSettings;
  const initCore = moduleInitializers.initCore;
  const initHandlers = moduleInitializers.initHandlers;
  
  // Initialize UI module
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
    t,
    getUILanguage
  });
  
  // NOTE: Modules are no longer added to window object (removed anti-pattern)
  // All modules are returned and should be accessed through DI
  
  // Initialize core module (business logic)
  // Pass settingsModule to coreModule so it can be passed to processingModule for getVoiceIdByIndex
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
    stateRefs,
    settingsModule
  });
  
  // Initialize handlers module (event listeners)
  // Pass settingsModule to handlers so it doesn't need to use window.settingsModule
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
    closeSummary: coreModule.closeSummary,
    settingsModule
  });
  
  return {
    uiModule,
    statsModule,
    settingsModule,
    coreModule,
    handlersModule
  };
}

/**
 * Finalize initialization: load settings, apply localization, setup event listeners
 * @param {import('../../scripts/types.js').PopupModules} modules - Initialized modules
 * @param {function(): void} initAllCustomSelects - Function to initialize custom selects
 * @param {function(string): void} [setCustomSelectValue] - Function to set custom select value
 * @returns {Promise<void>}
 */
export async function finalizeInitialization(modules, initAllCustomSelects, setCustomSelectValue) {
  const { settingsModule, uiModule, handlersModule, coreModule } = modules;
  
  // Load settings after modules are initialized
  try {
    log('init: calling loadSettings()');
    if (settingsModule && settingsModule.loadSettings) {
      await settingsModule.loadSettings();
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
  
  // CRITICAL: After localization, restore fontFamily selection
  // Localization may have overwritten the selected value, so we need to restore it
  // Get elements directly from DOM since they're already initialized
  try {
    const fontFamilyInput = document.getElementById(ELEMENT_IDS.FONT_FAMILY);
    if (fontFamilyInput && fontFamilyInput instanceof HTMLInputElement) {
      const fontFamilyValue = fontFamilyInput.value || '';
      if (fontFamilyValue && setCustomSelectValue) {
        log('finalizeInitialization: restoring fontFamily selection after localization', { fontFamilyValue });
        setCustomSelectValue(fontFamilyValue);
      }
    }
  } catch (error) {
    logWarn('Failed to restore fontFamily selection after localization', error);
  }
  
  try {
    uiModule.applyTheme();
  } catch (error) {
    logError('CRITICAL: applyTheme() failed in init()', error);
    // Continue initialization even if applyTheme fails
  }
  
  try {
    // Type assertion: handlersModule is returned from initHandlers which has setupEventListeners method
    const handlersModuleTyped = /** @type {{setupEventListeners: () => void}} */ (/** @type {unknown} */ (handlersModule));
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
  
  // Check summary status immediately on popup open
  // This ensures summary is displayed if it was generated while popup was closed
  try {
    if (coreModule.checkSummaryStatus) {
      await coreModule.checkSummaryStatus();
    }
  } catch (error) {
    logError('CRITICAL: checkSummaryStatus() failed in init()', error);
    // Continue initialization even if checkSummaryStatus fails
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
    const version = getExtensionVersion();
    const versionElement = document.getElementById(ELEMENT_IDS.VERSION_TEXT);
    if (versionElement) {
      versionElement.textContent = `v${version}`;
    }
  } catch (error) {
    logError('Failed to load version', error);
    // Fallback: try to get from manifest directly
    try {
      const manifest = chrome.runtime.getManifest();
      const version = manifest?.version || '3.3.0';
      const versionElement = document.getElementById(ELEMENT_IDS.VERSION_TEXT);
      if (versionElement) {
        versionElement.textContent = `v${version}`;
      }
    } catch (fallbackError) {
      // If all fails, leave default from HTML (v3.3.0)
    }
  }
}

