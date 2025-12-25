// @ts-check
// Complex message handlers with complex logic
// Handlers: extractContentOnly, generateSummary, logModelDropdown

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { getProcessingState } from '../state/processing.js';
import { getUILanguage } from '../locales.js';
import { startSummaryGeneration } from './summary.js';
import { CONFIG } from '../utils/config.js';

/**
 * Handle extractContentOnly request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Function} processWithSelectorMode - Function to process with selector mode (wrapped with extractFromPageInlined)
 * @param {Function} processWithExtractMode - Function to process with extract mode
 * @param {Function} processWithoutAI - Function to process without AI (automatic mode)
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
  processWithoutAI,
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
  
  log('=== extractContentOnly: Extracted parameters ===', {
    hasHtml: !!html,
    htmlLength: html?.length || 0,
    hasUrl: !!url,
    url: url,
    hasTitle: !!title,
    hasApiKey: !!apiKey,
    hasModel: !!model,
    mode: mode,
    hasTabId: !!tabId,
    tabId: tabId,
    autoGenerateSummary: autoGenerateSummary,
    timestamp: Date.now()
  });
  
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
  
  log('=== extractContentOnly: Selecting process function ===', {
    mode: mode,
    hasProcessWithoutAI: typeof processWithoutAI === 'function',
    hasProcessWithSelectorMode: typeof processWithSelectorMode === 'function',
    hasProcessWithExtractMode: typeof processWithExtractMode === 'function',
    timestamp: Date.now()
  });
  
  // Select processing function based on mode
  // processWithSelectorMode is already wrapped with extractFromPageInlined in background.js
  const processFunction = mode === 'automatic'
    ? processWithoutAI
    : mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  log('=== extractContentOnly: Process function selected ===', {
    mode: mode,
    functionName: processFunction?.name || 'unknown',
    timestamp: Date.now()
  });
  
  log('Starting content extraction', { mode, url, autoGenerateSummary, timestamp: Date.now() });
  
  // CRITICAL: Respond immediately to allow popup to close
  // Then continue extraction and optionally generate summary in background
  sendResponse({ success: true, extracting: true });
  
  log('=== extractContentOnly: Calling processFunction ===', {
    mode: mode,
    functionName: processFunction?.name || 'unknown',
    hasTabId: !!tabId,
    timestamp: Date.now()
  });
  
  // Use async IIFE with proper error handling
  // Add .catch() for additional protection against unhandled rejections
  (async () => {
    try {
      const result = await processFunction({ html, url, title, apiKey, model, mode, useCache, tabId });
      log('=== extractContentOnly: processFunction completed ===', {
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : [],
        timestamp: Date.now()
      });
      
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
        // It should only use summary_generating flag to avoid interfering with document/audio generation UI
        // Summary generation can run in parallel with any document/audio generation - they are independent operations
        // CRITICAL: Check if summary is already generating to prevent race conditions
        const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
        if (summaryState.summary_generating && summaryState.summary_generating_start_time) {
            // CRITICAL: Use static import - dynamic import() is disallowed in Service Worker
            const timeSinceStart = Date.now() - summaryState.summary_generating_start_time;
            // CRITICAL: Check if generation actually started by looking for progress indicators
            // If flag is set but there's no progress, it's likely hung
            const progressCheck = await chrome.storage.local.get(['summary_text', 'summary_saved_timestamp']);
            const hasSummary = !!progressCheck.summary_text;
            const hasRecentSave = progressCheck.summary_saved_timestamp && 
              (Date.now() - progressCheck.summary_saved_timestamp) < 60000; // Saved in last minute
            
            // CRITICAL: Use shorter threshold for "hung" flag detection
            // If flag is set but generation hasn't started in 5 seconds AND no progress, it's likely hung
            const HUNG_THRESHOLD_MS = 5 * 1000; // 5 seconds
            if (timeSinceStart < HUNG_THRESHOLD_MS && (hasSummary || hasRecentSave)) {
              // Flag is very recent AND there's progress - generation is actually running
              logWarn('Cannot auto-generate summary - summary generation already in progress (recent flag with progress)', {
                timeSinceStart,
                existingStartTime: summaryState.summary_generating_start_time,
                hasSummary,
                hasRecentSave
              });
              return; // Exit early - generation is actually running
            } else if (timeSinceStart < HUNG_THRESHOLD_MS && !hasSummary && !hasRecentSave) {
              // Flag is very recent BUT no progress - likely hung, clear it and continue
              logWarn('Summary generation flag set recently but no progress detected - clearing and continuing', {
                timeSinceStart,
                existingStartTime: summaryState.summary_generating_start_time,
                hasSummary,
                hasRecentSave,
                threshold: HUNG_THRESHOLD_MS
              });
              await chrome.storage.local.set({
                summary_generating: false,
                summary_generating_start_time: null
              });
              
              // Continue with generation
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
              return; // Exit early after handling hung flag
            } else if (timeSinceStart < CONFIG.SUMMARY_STALE_THRESHOLD_MS) {
              // Flag is set but generation might be hung (between 5 seconds and 15 minutes)
              // Check if there's actual progress by looking for summary_text or other indicators
              // (progressCheck already done above, reuse it)
              if (!hasSummary && !hasRecentSave) {
                // No progress detected - flag is likely hung, clear it and continue
                logWarn('Summary generation flag appears hung (no progress detected), clearing and continuing', {
                  timeSinceStart,
                  existingStartTime: summaryState.summary_generating_start_time,
                  hasSummary,
                  hasRecentSave
                });
                await chrome.storage.local.set({
                  summary_generating: false,
                  summary_generating_start_time: null
                });
                
                // Continue with generation
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
                return; // Exit early after handling hung flag
              } else {
                // Progress detected - generation is actually running
                logWarn('Cannot auto-generate summary - summary generation already in progress (progress detected)', {
                  timeSinceStart,
                  existingStartTime: summaryState.summary_generating_start_time,
                  hasSummary,
                  hasRecentSave
                });
                return; // Exit early - don't start new generation
              }
            } else {
              // Flag is stale, clear it and continue
              logWarn('Summary generation flag is stale, clearing and continuing', {
                timeSinceStart,
                threshold: CONFIG.SUMMARY_STALE_THRESHOLD_MS
              });
              await chrome.storage.local.set({
                summary_generating: false,
                summary_generating_start_time: null
              });
              
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
          } else {
            // No existing summary generation, proceed
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
        } catch (error) {
      logError('=== extractContentOnly: processFunction FAILED ===', {
        error: error?.message || String(error),
        errorStack: error?.stack,
        errorName: error?.name,
        timestamp: Date.now()
      });
      
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
    }
  })().catch(error => {
    // Additional protection: catch any errors that might occur in the async IIFE itself
    // (e.g., errors in error handling logic)
    logError('=== extractContentOnly: Unhandled error in async IIFE ===', {
      error: error?.message || String(error),
      errorStack: error?.stack,
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
  
  // CRITICAL: Summary generation should NOT use processingState or startProcessing
  // It should only use summary_generating flag to avoid interfering with document/audio generation UI
  // Summary generation is independent and can run in parallel with any document/audio generation
  // They are separate operations and should not block each other
  
  // Set summary_generating flag and start generation
  // Use async IIFE to handle await properly
  let responseSent = false;
  const safeSendResponse = (response) => {
    if (!responseSent) {
      try {
        sendResponse(response);
        responseSent = true;
      } catch (sendError) {
        logError('Failed to send response in handleGenerateSummary', sendError);
      }
    }
  };
  
  (async () => {
    try {
      // CRITICAL: Check if summary is already generating to prevent race conditions
      const summaryState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
      if (summaryState.summary_generating && summaryState.summary_generating_start_time) {
        // CRITICAL: Use static import - dynamic import() is disallowed in Service Worker
        const timeSinceStart = Date.now() - summaryState.summary_generating_start_time;
        
        // CRITICAL: Check if generation actually started by looking for progress indicators
        // If flag is set but there's no progress, it's likely hung
        const progressCheck = await chrome.storage.local.get(['summary_text', 'summary_saved_timestamp']);
        const hasSummary = !!progressCheck.summary_text;
        const hasRecentSave = progressCheck.summary_saved_timestamp && 
          (Date.now() - progressCheck.summary_saved_timestamp) < 60000; // Saved in last minute
        
        // CRITICAL: Use shorter threshold for "hung" flag detection
        // If flag is set but generation hasn't started in 5 seconds AND no progress, it's likely hung
        const HUNG_THRESHOLD_MS = 5 * 1000; // 5 seconds
        
        if (timeSinceStart < HUNG_THRESHOLD_MS && (hasSummary || hasRecentSave)) {
          // Flag is very recent AND there's progress - generation is actually running
          logWarn('Summary generation already in progress (recent flag with progress)', {
            timeSinceStart,
            existingStartTime: summaryState.summary_generating_start_time,
            hasSummary,
            hasRecentSave
          });
          safeSendResponse({ error: 'Summary generation is already in progress' });
          return;
        } else if (timeSinceStart < HUNG_THRESHOLD_MS && !hasSummary && !hasRecentSave) {
          // Flag is very recent BUT no progress - likely hung, clear it and continue
          logWarn('Summary generation flag set recently but no progress detected - clearing and continuing', {
            timeSinceStart,
            existingStartTime: summaryState.summary_generating_start_time,
            hasSummary,
            hasRecentSave,
            threshold: HUNG_THRESHOLD_MS
          });
          await chrome.storage.local.set({
            summary_generating: false,
            summary_generating_start_time: null
          });
          // Continue with generation (don't return)
        } else if (timeSinceStart < CONFIG.SUMMARY_STALE_THRESHOLD_MS) {
          // Flag is set but generation might be hung (between 5 seconds and 15 minutes)
          // Check if there's actual progress
          if (!hasSummary && !hasRecentSave) {
            // No progress detected - flag is likely hung, clear it and continue
            logWarn('Summary generation flag appears hung (no progress detected), clearing and continuing', {
              timeSinceStart,
              existingStartTime: summaryState.summary_generating_start_time,
              hasSummary,
              hasRecentSave
            });
            await chrome.storage.local.set({
              summary_generating: false,
              summary_generating_start_time: null
            });
            // Continue with generation (don't return)
          } else {
            // Progress detected - generation is actually running
            logWarn('Summary generation already in progress (progress detected)', {
              timeSinceStart,
              existingStartTime: summaryState.summary_generating_start_time,
              hasSummary,
              hasRecentSave
            });
            safeSendResponse({ error: 'Summary generation is already in progress' });
            return;
          }
        } else {
          // Flag is stale, clear it and continue
          logWarn('Summary generation flag is stale, clearing and continuing', {
            timeSinceStart,
            threshold: CONFIG.SUMMARY_STALE_THRESHOLD_MS
          });
          await chrome.storage.local.set({
            summary_generating: false,
            summary_generating_start_time: null
          });
        }
      }
      
      log('Starting summary generation - no conflicts with PDF processing or existing summary generation');
      
      await startSummaryGeneration(request.data, startKeepAlive, stopKeepAlive, safeSendResponse);
    } catch (error) {
      logError('Failed to start summary generation', error);
      safeSendResponse({ error: error.message || 'Failed to start summary generation' });
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




