// @ts-check
// Summary generation helper functions
// Shared logic for extractContentOnly and generateSummary handlers

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { getProcessingState } from '../state/processing.js';
import { generateSummary } from '../translation/index.js';
import { getUILanguage } from '../locales.js';
import { CONFIG } from '../utils/config.js';

/**
 * Start summary generation with proper state management
 * @param {Object} data - Summary generation data
 * @param {Function} startKeepAlive - Function to start keep-alive
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Function} sendResponse - Response function (optional, for immediate response)
 * @returns {Promise<void>}
 */
export async function startSummaryGeneration(data, startKeepAlive, stopKeepAlive, sendResponse = null) {
  const startTime = Date.now();
  
  try {
    // CRITICAL: Check if summary is already generating to prevent race conditions
    const existingState = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
    if (existingState.summary_generating && existingState.summary_generating_start_time) {
      const timeSinceStart = Date.now() - existingState.summary_generating_start_time;
      
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
        logWarn('Summary generation already in progress (recent flag with progress), skipping duplicate request', {
          timeSinceStart,
          existingStartTime: existingState.summary_generating_start_time,
          hasSummary,
          hasRecentSave
        });
        if (sendResponse) {
          sendResponse({ error: 'Summary generation is already in progress' });
        }
        return;
      } else if (timeSinceStart < HUNG_THRESHOLD_MS && !hasSummary && !hasRecentSave) {
        // Flag is very recent BUT no progress - likely hung, clear it and continue
        logWarn('Summary generation flag set recently but no progress detected - clearing and continuing', {
          timeSinceStart,
          existingStartTime: existingState.summary_generating_start_time,
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
            existingStartTime: existingState.summary_generating_start_time,
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
          logWarn('Summary generation already in progress (progress detected), skipping duplicate request', {
            timeSinceStart,
            existingStartTime: existingState.summary_generating_start_time,
            hasSummary,
            hasRecentSave
          });
          if (sendResponse) {
            sendResponse({ error: 'Summary generation is already in progress' });
          }
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
    
    await chrome.storage.local.set({
      summary_generating: true,
      summary_generating_start_time: startTime
    });
    
    log('summary_generating flag set', { startTime, timestamp: Date.now() });
    
    // CRITICAL: Start keep-alive for summary generation
    // This ensures service worker stays alive during generation even if popup is closed
    startKeepAlive();
    log('Keep-alive started for summary generation', { timestamp: Date.now() });
    
    // CRITICAL: Respond immediately if sendResponse provided (like processArticle does)
    // This allows popup to close without interrupting generation
    if (sendResponse) {
      sendResponse({ started: true });
      log('Response sent to popup - generation will continue in background', { timestamp: Date.now() });
    }
    
    // Continue generation asynchronously
    log('=== CALLING generateSummary FUNCTION ===', {
      contentItemsCount: data.contentItems?.length || 0,
      url: data.url,
      model: data.model,
      language: data.language,
      timestamp: Date.now()
    });
    
    const summaryStartTime = Date.now();
    
    // Log periodic updates for long-running summary generation
    const summaryProgressInterval = setInterval(() => {
      const elapsed = Date.now() - summaryStartTime;
      const elapsedSeconds = Math.round(elapsed / 1000);
      log('Summary generation still in progress...', {
        elapsedSeconds,
        elapsedMinutes: Math.round(elapsedSeconds / 60 * 10) / 10,
        model: data.model,
        contentItemsCount: data.contentItems?.length || 0
      });
    }, 30000); // Log every 30 seconds
    
    let result;
    try {
      result = await generateSummary(data);
    } finally {
      // CRITICAL: Always clear interval, even if generateSummary throws
      if (summaryProgressInterval) {
        clearInterval(summaryProgressInterval);
      }
    }
    
    log('=== SUMMARY GENERATION SUCCESS ===', { 
      hasSummary: !!result?.summary,
      summaryLength: result?.summary?.length || 0,
      timestamp: Date.now()
    });
    
    // CRITICAL: Save summary to storage immediately after generation
    // This ensures summary persists even if popup is closed or tab is switched
    try {
      log('Saving summary to storage', { summaryLength: result.summary?.length || 0 });
      await chrome.storage.local.set({
        summary_text: result.summary,
        summary_generating: false,
        summary_generating_start_time: null,
        summary_saved_timestamp: Date.now() // Save timestamp to identify fresh summaries
      });
      log('Summary saved to storage successfully', { 
        summaryLength: result.summary?.length || 0,
        timestamp: Date.now()
      });
    } catch (storageError) {
      logError('Failed to save summary to storage', storageError);
      // Still clear flag even if save failed
      try {
        await chrome.storage.local.set({
          summary_generating: false,
          summary_generating_start_time: null
        });
      } catch (clearError) {
        logError('Failed to clear summary_generating flag after storage error', clearError);
      }
    }
    
    // CRITICAL: Stop keep-alive after summary generation completes
    // Only stop if no other processing is active
    const finalState = getProcessingState();
    if (!finalState.isProcessing) {
      await stopKeepAlive();
      log('Keep-alive stopped after summary generation complete', { timestamp: Date.now() });
    } else {
      log('Keep-alive kept active - other processing in progress', { timestamp: Date.now() });
    }
    
    log('=== SUMMARY GENERATION COMPLETE ===', { timestamp: Date.now() });
  } catch (error) {
    const normalized = await handleError(error, {
      source: 'summaryGeneration',
      errorType: 'abstractGenerationFailed',
      logError: true,
      createUserMessage: false,
      context: {
        url: data.url || '',
        timestamp: Date.now()
      }
    });
    
    // CRITICAL: Clear generating flag on error
    // Summary generation does NOT use processingState, so just clear the flag
    try {
      await chrome.storage.local.set({
        summary_generating: false,
        summary_generating_start_time: null
      });
      log('summary_generating flag cleared on error', { timestamp: Date.now() });
    } catch (storageError) {
      logError('Failed to clear summary_generating flag on error', storageError);
    }
    
    // CRITICAL: Stop keep-alive on error
    // Only stop if no other processing is active
    const finalState = getProcessingState();
    if (!finalState.isProcessing) {
      await stopKeepAlive();
      log('Keep-alive stopped after summary generation error', { timestamp: Date.now() });
    } else {
      log('Keep-alive kept active - other processing in progress', { timestamp: Date.now() });
    }
    
    throw normalized;
  }
}








