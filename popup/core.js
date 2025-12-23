// @ts-check
// Core business logic for popup
// Facade module that imports and combines all core submodules
// This module contains all business logic functions that handle
// content processing, summary generation, and state management

// Import submodules
import { initSummary } from './core/summary.js';
import { initProcessing } from './core/processing.js';
import { initState } from './core/state.js';

/**
 * Initialize core module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.getUILanguage - Get UI language function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.showToast - Show toast notification function
 * @param {Function} deps.setStatus - Set status function
 * @param {Function} deps.setProgress - Set progress function
 * @param {Function} deps.stopTimerDisplay - Stop timer display function
 * @param {Function} deps.startTimerDisplay - Start timer display function
 * @param {Function} deps.decryptApiKey - Decrypt API key function
 * @param {Function} deps.getProviderFromModel - Get provider from model function
 * @param {Function} deps.detectVideoPlatform - Detect video platform function
 * @param {Function} deps.markdownToHtml - Markdown to HTML converter
 * @param {Function} deps.sanitizeMarkdownHtml - Sanitize markdown HTML function
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

  // Markdown to HTML converter
  function markdownToHtmlLocal(markdown) {
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

  // Use provided markdownToHtml or fallback to local
  const markdownToHtmlFn = markdownToHtml || markdownToHtmlLocal;

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

  // Step 2: Initialize state module (needs checkSummaryStatus from summary)
  const stateModule = initState({
    elements,
    t,
    logError,
    logWarn,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    checkSummaryStatus: summaryModule.checkSummaryStatus,
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
    
    // From state module
    checkProcessingState: stateModule.checkProcessingState,
    startStatePolling: stateModule.startStatePolling,
    updateUIFromState: stateModule.updateUIFromState,
    mapStageLabel: stateModule.mapStageLabel,
    
    // Utility functions
    markdownToHtml: markdownToHtmlFn
  };
}
