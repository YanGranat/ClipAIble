// Initialization helper utilities for popup
// Provides helper functions for popup initialization to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../../scripts/utils/logging.js';

/**
 * Initialize all DOM elements
 * @param {Object} elements - Elements object to populate
 * @returns {void}
 */
export function initializeDOMElements(elements) {
  // API Provider and Keys
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
  
  // Main controls
  elements.savePdfBtn = document.getElementById('savePdfBtn');
  elements.saveIcon = document.getElementById('saveIcon');
  elements.saveText = document.getElementById('saveText');
  elements.mainFormatSelect = document.getElementById('mainFormatSelect');
  elements.cancelBtn = document.getElementById('cancelBtn');
  
  // Summary
  elements.generateSummaryBtn = document.getElementById('generateSummaryBtn');
  elements.summaryContainer = document.getElementById('summaryContainer');
  elements.summaryToggle = document.getElementById('summaryToggle');
  elements.summaryContent = document.getElementById('summaryContent');
  elements.summaryText = document.getElementById('summaryText');
  elements.summaryCopyBtn = document.getElementById('summaryCopyBtn');
  elements.summaryDownloadBtn = document.getElementById('summaryDownloadBtn');
  elements.summaryCloseBtn = document.getElementById('summaryCloseBtn');
  
  // Settings and Stats
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
  
  // Processing options
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
  
  // Styles
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
  
  // Status and Progress
  elements.statusDot = document.querySelector('.status-dot');
  elements.statusText = document.getElementById('statusText');
  elements.progressContainer = document.getElementById('progressContainer');
  elements.progressBar = document.getElementById('progressBar');
  elements.progressText = document.getElementById('progressText');
  
  // Theme and Language
  elements.themeSelect = document.getElementById('themeSelect');
  elements.uiLanguageSelect = document.getElementById('uiLanguageSelect');
  
  // Audio settings
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
  elements.audioSpeedNote = document.getElementById('audioSpeedNote');
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
}

/**
 * Initialize all modules
 * @param {Object} deps - Dependencies for module initialization
 * @param {Function} deps.initUI - UI module initializer
 * @param {Function} deps.initStats - Stats module initializer
 * @param {Function} deps.initSettings - Settings module initializer
 * @param {Function} deps.initCore - Core module initializer
 * @param {Function} deps.initHandlers - Handlers module initializer
 * @returns {Object} Initialized modules
 */
export function initializeModules(deps) {
  const {
    elements,
    formatTime,
    startTimerDisplay,
    getElement,
    setElementDisplay,
    setElementGroupDisplay,
    setDisplayForIds,
    currentStartTimeRef,
    timerIntervalRef,
    showToast,
    STORAGE_KEYS,
    DEFAULT_STYLES,
    STYLE_PRESETS,
    debouncedSaveSettings,
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
    stopTimerDisplay,
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
  } = deps;
  
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
 * @param {Object} modules - Initialized modules
 * @param {Function} initAllCustomSelects - Function to initialize custom selects
 * @returns {Promise<void>}
 */
export async function finalizeInitialization(modules, initAllCustomSelects) {
  const { settingsModule, uiModule, handlersModule, coreModule } = modules;
  
  /** @type {WindowWithModules} */
  const windowWithModules = window;
  
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
    const version = manifest.version || '3.2.2';
    const versionElement = document.getElementById('versionText');
    if (versionElement) {
      versionElement.textContent = `v${version}`;
    }
  } catch (error) {
    logError('Failed to load version', error);
  }
}

