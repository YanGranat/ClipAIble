// Complex message handlers with complex logic
// Handlers: extractContentOnly, generateSummary, logModelDropdown

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { getProcessingState } from '../state/processing.js';
import { getUILanguage } from '../locales.js';
import { startSummaryGeneration } from './summary.js';

/**
 * Handle extractContentOnly request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Function} processWithSelectorMode - Function to process with selector mode
 * @param {Function} processWithExtractMode - Function to process with extract mode
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleExtractContentOnly(
  request, 
  sender, 
  sendResponse, 
  processWithSelectorMode, 
  processWithExtractMode,
  startKeepAlive,
  stopKeepAlive
) {
  log('=== extractContentOnly REQUEST RECEIVED ===', { 
    hasData: !!request.data,
    url: request.data?.url,
    mode: request.data?.mode,
    hasHtml: !!request.data?.html,
    htmlLength: request.data?.html?.length || 0,
    hasApiKey: !!request.data?.apiKey,
    hasModel: !!request.data?.model,
    autoGenerateSummary: request.data?.autoGenerateSummary || false,
    timestamp: Date.now()
  });
  
  const { html, url, title, apiKey, model, mode, useCache, tabId, autoGenerateSummary, language } = request.data;
  
  if (!html || !url || !apiKey || !model) {
    logError('extractContentOnly missing required parameters', {
      hasHtml: !!html,
      hasUrl: !!url,
      hasApiKey: !!apiKey,
      hasModel: !!model
    });
    sendResponse({ error: 'Missing required parameters' });
    return true;
  }
  
  const processFunction = mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  log('Starting content extraction', { mode, url, autoGenerateSummary, timestamp: Date.now() });
  
  // CRITICAL: Respond immediately to allow popup to close
  // Then continue extraction and optionally generate summary in background
  sendResponse({ success: true, extracting: true });
  
  processFunction({ html, url, title, apiKey, model, mode, useCache, tabId })
    .then(async result => {
      log('=== extractContentOnly SUCCESS ===', {
        title: result.title,
        contentItemsCount: result.content?.length || 0,
        hasContent: !!result.content,
        isArray: Array.isArray(result.content),
        autoGenerateSummary,
        timestamp: Date.now()
      });
      
      // CRITICAL: If autoGenerateSummary is true, automatically start summary generation
      // This allows popup to close and summary will generate in background
      if (autoGenerateSummary && result.content && result.content.length > 0) {
        log('=== AUTO-STARTING SUMMARY GENERATION ===', {
          contentItemsCount: result.content.length,
          url,
          model,
          language,
          timestamp: Date.now()
        });
        
        // CRITICAL: Summary generation should NOT use processingState
        // It should only use summary_generating flag to avoid interfering with document generation UI
        const currentState = getProcessingState();
        if (currentState.isProcessing) {
          logWarn('Cannot auto-generate summary while PDF is processing');
        } else {
          // Use shared summary generation function
          try {
            await startSummaryGeneration({
              contentItems: result.content,
              apiKey: apiKey,
              model: model,
              url: url,
              language: language || await getUILanguage()
            }, startKeepAlive, stopKeepAlive);
            
            log('=== AUTO-SUMMARY GENERATION COMPLETE ===', { timestamp: Date.now() });
          } catch (error) {
            logError('Failed to start auto-summary generation', error);
          }
        }
      }
    })
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'contentExtractionFailed',
        logError: true,
        createUserMessage: false,
        context: { operation: 'extractContentOnly' }
      });
      logError('=== extractContentOnly FAILED ===', {
        error: normalized.message,
        code: normalized.code,
        timestamp: Date.now()
      });
    });
  return true;
}

/**
 * Handle generateSummary request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleGenerateSummary(request, sender, sendResponse, startKeepAlive, stopKeepAlive) {
  log('=== generateSummary REQUEST RECEIVED ===', { 
    hasData: !!request.data,
    hasContent: !!request.data?.contentItems,
    contentItemsCount: request.data?.contentItems?.length || 0,
    url: request.data?.url,
    model: request.data?.model,
    hasApiKey: !!request.data?.apiKey,
    language: request.data?.language,
    timestamp: Date.now()
  });
  
  // CRITICAL: Use same state management as PDF generation for reliability
  // Check if PDF is already processing - if so, reject summary request
  const currentState = getProcessingState();
  if (currentState.isProcessing) {
    logWarn('Cannot generate summary while PDF is processing', {
      currentStateStatus: currentState.status,
      currentStateProgress: currentState.progress
    });
    sendResponse({ error: 'Another operation is already in progress' });
    return true;
  }
  
  log('Starting summary generation - no conflicts with PDF processing');
  
  // CRITICAL: Summary generation should NOT use processingState or startProcessing
  // It should only use summary_generating flag to avoid interfering with document generation UI
  // Summary generation is independent and should not affect "Creating document..." status
  
  // Set summary_generating flag and start generation
  // Use async IIFE to handle await properly
  (async () => {
    try {
      await startSummaryGeneration(request.data, startKeepAlive, stopKeepAlive, sendResponse);
    } catch (error) {
      logError('Failed to start summary generation', error);
      if (!sendResponse.toString().includes('already sent')) {
        sendResponse({ error: error.message || 'Failed to start summary generation' });
      }
    }
  })();
  
  return true;
}

/**
 * Handle logModelDropdown request
 */
export function handleLogModelDropdown(request, sender, sendResponse) {
  // Log model dropdown events to service worker console
  const { level, message, data } = request;
  const logMessage = `[ModelDropdown] ${message}`;
  if (data) {
    log(logMessage, data);
  } else {
    log(logMessage);
  }
  sendResponse({ logged: true });
  return true;
}



