// @ts-check
// Dependency grouping for popup initialization
// Groups related dependencies to reduce parameter count in initializeModules

/**
 * Group dependencies for module initialization
 * @param {Object} rawDeps - Raw dependencies from popup.js
 * @returns {Object} Grouped dependencies with logical grouping (domHelpers, formatHelpers, etc.)
 */
export function groupDependencies(rawDeps) {
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
    saveAudioVoice,
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
  } = rawDeps;

  return {
    // DOM elements
    elements,
    
    // DOM helpers
    domHelpers: {
      getElement,
      setElementDisplay,
      setElementGroupDisplay,
      setDisplayForIds
    },
    
    // Format helpers
    formatHelpers: {
      formatTime,
      markdownToHtml,
      escapeHtml: rawDeps.escapeHtml || (() => {})
    },
    
    // Settings helpers
    settingsHelpers: {
      debouncedSaveSettings,
      saveAudioVoice,
      setCustomSelectValue
    },
    
    // Logging
    logging: {
      log,
      logError,
      logWarn
    },
    
    // Localization
    localization: {
      t,
      getUILanguage,
      setUILanguage,
      UI_LOCALES,
      applyLocalization
    },
    
    // Config and constants
    config: {
      STORAGE_KEYS,
      DEFAULT_STYLES,
      STYLE_PRESETS,
      CONFIG
    },
    
    // State references
    stateRefs: {
      currentStartTimeRef,
      timerIntervalRef,
      stateRefs,
      audioVoiceMap
    },
    
    // UI helpers
    uiHelpers: {
      showToast,
      setStatus,
      setProgress,
      applyTheme,
      loadAndDisplayStats,
      initAllCustomSelects
    },
    
    // API helpers
    apiHelpers: {
      decryptApiKey,
      maskApiKey,
      encryptApiKey,
      getProviderFromModel,
      detectVideoPlatform,
      sanitizeMarkdownHtml
    },
    
    // Timer helpers
    timerHelpers: {
      startTimerDisplay,
      stopTimerDisplay
    },
    
    // Module initializers
    moduleInitializers: {
      initUI,
      initStats,
      initSettings,
      initCore,
      initHandlers
    }
  };
}

