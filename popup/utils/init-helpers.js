// Initialization helper utilities for popup
// Provides helper functions for popup initialization to reduce code duplication

// @ts-check

import { log, logError, logWarn } from '../../scripts/utils/logging.js';
import { getExtensionVersion } from '../../scripts/utils/config.js';
import { groupDependencies } from './dependencies.js';

/**
 * Initialize all DOM elements
 * @param {Record<string, HTMLElement|null>} elements - Elements object to populate
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
    /** @type {any} */
    const hintElement = translateImagesHintEl;
    elements.translateImagesHint = hintElement;
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
  const currentStartTimeRef = stateRefsGroup.currentStartTimeRef;
  const timerIntervalRef = stateRefsGroup.timerIntervalRef;
  const showToast = uiHelpers.showToast;
  const STORAGE_KEYS = config.STORAGE_KEYS;
  const DEFAULT_STYLES = config.DEFAULT_STYLES;
  const STYLE_PRESETS = config.STYLE_PRESETS;
  const debouncedSaveSettings = settingsHelpers.debouncedSaveSettings;
  const setCustomSelectValue = settingsHelpers.setCustomSelectValue;
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
 * @returns {Promise<void>}
 */
export async function finalizeInitialization(modules, initAllCustomSelects) {
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
    const versionElement = document.getElementById('versionText');
    if (versionElement) {
      versionElement.textContent = `v${version}`;
    }
  } catch (error) {
    logError('Failed to load version', error);
    // Fallback: try to get from manifest directly
    try {
      const manifest = chrome.runtime.getManifest();
      const version = manifest?.version || '3.3.0';
      const versionElement = document.getElementById('versionText');
      if (versionElement) {
        versionElement.textContent = `v${version}`;
      }
    } catch (fallbackError) {
      // If all fails, leave default from HTML (v3.3.0)
    }
  }
}

