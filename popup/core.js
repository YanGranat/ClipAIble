import { markdownToHtml as renderMarkdown } from '../scripts/utils/html/html.js';
// @ts-check
// Core business logic for popup
// Facade module that imports and combines all core submodules
// This module contains all business logic functions that handle
// content processing, summary generation, and state management

// Import submodules
import { initSummary } from './core/summary.js';
import { initKeyTheses } from './core/key-theses.js';
import { initProcessing } from './core/processing.js';
import { initState } from './core/state.js';
import { getExportPageIssue, inspectExportRequirements, readExportOptions } from './core/export-readiness.js';
import { AUDIO_PREPARATION_PROMPT_KEY } from '../scripts/settings/prompt-catalog.js';
import { OPENROUTER_KEY_SLOTS } from '../scripts/utils/storage/openrouter-key-slots.js';
import { SUPERTONIC_MODEL_STATUS_KEY } from '../scripts/api/supertonic-config.js';

/**
 * Initialize core module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {function(string, string?): Promise<string>} deps.t - Translation function
 * @param {function(): Promise<string>} deps.getUILanguage - Get UI language function
 * @param {function(...*): void} deps.logError - Error logging function
 * @param {function(...*): void} deps.log - Log function
 * @param {function(...*): void} deps.logWarn - Warning logging function
 * @param {function(string, string?): void} deps.showToast - Show toast notification function
 * @param {function(string, string?, number?): void} deps.setStatus - Set status function
 * @param {function(number, boolean?): void} deps.setProgress - Set progress function
 * @param {function(): void} deps.stopTimerDisplay - Stop timer display function
 * @param {function(): void} deps.startTimerDisplay - Start timer display function
 * @param {function(string, string): Promise<string>} deps.decryptApiKey - Decrypt API key function
 * @param {function(string): import('../scripts/types.js').AIProvider} deps.getProviderFromModel - Get provider from model function
 * @param {function(): any} deps.detectVideoPlatform - Detect video platform function
 * @param {function(string): string} deps.markdownToHtml - Markdown to HTML converter
 * @param {function(string): string} deps.sanitizeMarkdownHtml - Sanitize markdown HTML function
 * @param {Object} deps.CONFIG - Configuration object
 * @param {Object} deps.stateRefs - State references object (for statePollingTimeout, timerInterval, currentStartTime)
 * @param {Object} [deps.settingsModule] - Settings module (optional, for getVoiceIdByIndex)
 * @returns {Object} Core functions
 */
export function initCore(deps) {
  const {
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
  } = deps;

  // Format seconds to MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const markdownToHtmlFn = markdownToHtml || renderMarkdown;

  // Initialize submodules in correct order (respecting dependencies)
  
  // Step 1: Initialize summary module (needs markdownToHtmlFn)
  const summaryModule = initSummary({
    elements,
    STORAGE_KEYS,
    t,
    getUILanguage,
    logError,
    log,
    logWarn,
    showToast,
    decryptApiKey,
    getProviderFromModel,
    detectVideoPlatform,
    markdownToHtmlFn,
    sanitizeMarkdownHtml,
    CONFIG
  });

  const keyThesesModule = initKeyTheses({
    elements,
    STORAGE_KEYS,
    t,
    getUILanguage,
    logError,
    log,
    logWarn,
    showToast,
    decryptApiKey,
    getProviderFromModel,
    detectVideoPlatform,
    markdownToHtmlFn,
    sanitizeMarkdownHtml,
    CONFIG
  });

  // Step 2: Initialize state module (needs checkSummaryStatus and checkKeyThesesStatus)
  const stateModule = initState({
    elements,
    t,
    log,
    logError,
    logWarn,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    checkSummaryStatus: summaryModule.checkSummaryStatus,
    checkKeyThesesStatus: keyThesesModule.checkKeyThesesStatus,
    async getExportReadiness() {
      const options = readExportOptions(elements, getProviderFromModel, settingsModule?.getVoiceIdByIndex);
      const inputs = Object.fromEntries(['apiKey', 'googleApiKey', 'openaiImageKey', 'openrouterImageKey', 'openrouterTtsKey'].map(name => {
        const input = elements[name];
        return [name, input && { value: input.value, dataset: { ...input.dataset } }];
      }));
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageIssue = getExportPageIssue(tab);
      if (pageIssue) return pageIssue;
      return (await inspectExportRequirements(options, inputs, decryptApiKey, t, tab.url)).issue;
    },
    stateRefs
  });

  const exportInputs = new Set(['modeSelect', 'mainFormatSelect', 'outputFormat', 'apiProviderSelect', 'modelSelect',
    'languageSelect', 'audioProvider', 'audioVoice', 'translateImages', 'imageTranslationProvider', 'geminiImageModel',
    'apiKey', 'googleApiKey', 'openaiImageKey', 'elevenlabsApiKey', 'googleTtsApiKey', 'qwenApiKey', 'respeecherApiKey',
    'openrouterImageModel', 'openrouterImageKey', 'openrouterTtsKey', 'openrouterTtsModel', 'openrouterTtsVoice',
    'qwenWorkspaceId', 'qwenModel', 'qwenRegion', 'googleTtsModel', 'googleTtsVoice'].map(name => elements[name]));
  const refresh = event => {
    if (exportInputs.has(event.target)) stateModule.refreshExportReadiness();
  };
  globalThis.document?.addEventListener('change', refresh);
  globalThis.document?.addEventListener('input', refresh);
  chrome.storage?.onChanged?.addListener((changes, area) => {
    const model = changes[SUPERTONIC_MODEL_STATUS_KEY];
    if (area === 'local' && model && elements.audioProvider?.value === 'supertonic' &&
        (/** @type {import('../scripts/api/supertonic-model.js').SupertonicModelStatus|undefined} */ (model.oldValue))?.state !==
        (/** @type {import('../scripts/api/supertonic-model.js').SupertonicModelStatus|undefined} */ (model.newValue))?.state) {
      stateModule.refreshExportReadiness();
    }
    if (area === 'local' && (changes.openai_api_key || changes[AUDIO_PREPARATION_PROMPT_KEY] || Object.values(OPENROUTER_KEY_SLOTS).some(key => changes[key]))) {
      stateModule.refreshExportReadiness();
    }
  });

  // Step 3: Initialize processing module (needs state functions and settingsModule for getVoiceIdByIndex)
  const processingModule = initProcessing({
    elements,
    t,
    logError,
    log,
    logWarn,
    showToast,
    setStatus,
    setProgress,
    stopTimerDisplay,
    decryptApiKey,
    getProviderFromModel,
    startStatePolling: stateModule.startStatePolling,
    checkProcessingState: stateModule.checkProcessingState,
    getPresentedProcessingRunId: stateModule.getPresentedProcessingRunId,
    noteProcessingAdmission: stateModule.noteProcessingAdmission,
    notePreparation: stateModule.notePreparation,
    finishPreparation: stateModule.finishPreparation,
    stateRefs,
    settingsModule
  });

  // Return all core functions from all modules
  return {
    // From processing module
    handleCancel: processingModule.handleCancel,
    handleSavePdf: processingModule.handleSavePdf,
    extractPageContent: processingModule.extractPageContent,
    
    // From summary module
    handleGenerateSummary: summaryModule.handleGenerateSummary,
    toggleSummary: summaryModule.toggleSummary,
    copySummary: summaryModule.copySummary,
    downloadSummary: summaryModule.downloadSummary,
    closeSummary: summaryModule.closeSummary,
    checkSummaryStatus: summaryModule.checkSummaryStatus,

    // From key theses module
    handleGenerateKeyTheses: keyThesesModule.handleGenerateKeyTheses,
    toggleKeyTheses: keyThesesModule.toggleKeyTheses,
    copyKeyTheses: keyThesesModule.copyKeyTheses,
    downloadKeyTheses: keyThesesModule.downloadKeyTheses,
    closeKeyTheses: keyThesesModule.closeKeyTheses,
    checkKeyThesesStatus: keyThesesModule.checkKeyThesesStatus,

    // From state module
    checkProcessingState: stateModule.checkProcessingState,
    startStatePolling: stateModule.startStatePolling,
    updateUIFromState: stateModule.updateUIFromState,
    mapStageLabel: stateModule.mapStageLabel,
    
    // Utility functions
    markdownToHtml: markdownToHtmlFn
  };
}
