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
    stateRefs
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
