// Video and subtitle-related message handlers
// Handlers: youtubeSubtitlesResult, extractYouTubeSubtitlesForSummary

import { log, logError } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { extractYouTubeSubtitles } from '../extraction/video-subtitles.js';

/**
 * Handle youtubeSubtitlesResult request
 * CRITICAL: This is a fallback handler - don't return true to allow message to pass through
 * to temporary listener in extractYouTubeSubtitles
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @returns {boolean} - Returns false to let message pass through to temporary listener
 */
export function handleYoutubeSubtitlesResult(request, sender, sendResponse) {
  log('🟢 Received youtubeSubtitlesResult in main listener (fallback)', {
    action: request.action,
    type: request.type,
    hasError: !!request.error,
    hasResult: !!request.result,
    subtitleCount: request.result?.subtitles?.length || 0
  });
  
  // The extractYouTubeSubtitles function creates a temporary listener
  // that should catch this message. We save to storage for popup,
  // but DON'T return true here - let the message pass through to temporary listener
  // Save to storage for popup to use (as fallback)
  // Use Promise-based approach since we're in a callback
  if (request.result && !request.error) {
    chrome.storage.local.set({
      lastSubtitles: {
        subtitles: request.result.subtitles,
        metadata: request.result.metadata,
        timestamp: Date.now()
      }
    }).then(() => {
      log('🟢 Saved subtitles to storage for popup (fallback)', {
        subtitleCount: request.result.subtitles?.length || 0
      });
    }).catch(async error => {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'storageSaveFailed',
        logError: true,
        createUserMessage: false,
        context: { operation: 'saveSubtitles' }
      });
      logError('Failed to save subtitles to storage', normalized);
    });
  }
  
  // CRITICAL: Don't return true here! Let the message pass through to temporary listener
  // The temporary listener will handle it and return true
  // However, we need to acknowledge receipt to content script
  // So we send response but don't return true, allowing message to pass through
  // Note: In Chrome Extensions, if a listener returns false/undefined, the message
  // continues to other listeners. But sendResponse can only be called once.
  // So we send response here, but let the message pass through to temporary listener
  // The temporary listener will also try to sendResponse, but that's OK - it will be ignored
  sendResponse({ success: true, acknowledged: true, message: 'Received by main listener (passing through)' });
  return false; // Let other listeners (temporary one) handle it
}

/**
 * Handle extractYouTubeSubtitlesForSummary request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleExtractYouTubeSubtitlesForSummary(request, sender, sendResponse) {
  log('extractYouTubeSubtitlesForSummary request received', { tabId: request.data?.tabId });
  const { tabId } = request.data || {};
  if (!tabId) {
    sendResponse({ error: 'Tab ID is required' });
    return true;
  }
  extractYouTubeSubtitles(tabId)
    .then(result => {
      log('extractYouTubeSubtitlesForSummary success', { subtitleCount: result?.subtitles?.length || 0 });
      sendResponse({ success: true, result });
    })
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'subtitleExtractionFailed',
        logError: true,
        createUserMessage: false
      });
      sendResponse({ error: normalized.message || 'Failed to extract subtitles' });
    });
  return true;
}

