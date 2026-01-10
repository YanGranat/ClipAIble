// @ts-check
// Video and subtitle-related message handlers
// Handlers: youtubeSubtitlesResult, extractYouTubeSubtitlesForSummary

import { log, logError } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { extractYouTubeSubtitles } from '../extraction/video-subtitles.js';

/**
 * Handle youtubeSubtitlesResult request
 * CRITICAL: This is a fallback handler - don't return true to allow message to pass through
 * to temporary listener in extractYouTubeSubtitles
 * @param {import('../types.js').MessageRequest} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {boolean} - Returns false to let message pass through to temporary listener
 */
export function handleYoutubeSubtitlesResult(request, sender, sendResponse) {
  // Note: youtubeSubtitlesResult message has a different structure than standard MessageRequest
  // It has result/error at the top level, not in data property
  /** @type {any} */ const requestAny = request;
  const result = requestAny.result;
  const error = requestAny.error;
  
  log('🟢 Received youtubeSubtitlesResult in main listener (fallback)', {
    action: request.action,
    type: request.type,
    hasError: !!error,
    hasResult: !!result,
    subtitleCount: result?.subtitles?.length || 0
  });
  
  // The extractYouTubeSubtitles function creates a temporary listener
  // that should catch this message. We save to storage for popup,
  // but DON'T return true here - let the message pass through to temporary listener
  // Save to storage for popup to use (as fallback)
  // Use async IIFE since we're in a callback
  if (result && !error) {
    (async () => {
      try {
        await chrome.storage.local.set({
          lastSubtitles: {
            subtitles: result.subtitles,
            metadata: result.metadata,
            timestamp: Date.now()
          }
        });
        log('🟢 Saved subtitles to storage for popup (fallback)', {
          subtitleCount: result.subtitles?.length || 0
        });
      } catch (error) {
        const normalized = await handleError(error, {
          source: 'messageHandler',
          errorType: 'storageSaveFailed',
          logError: true,
          createUserMessage: false,
          context: { operation: 'saveSubtitles' }
        });
        logError('Failed to save subtitles to storage', normalized);
      }
    })();
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
 * @param {import('../types.js').MessageRequest} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleExtractYouTubeSubtitlesForSummary(request, sender, sendResponse) {
  log('extractYouTubeSubtitlesForSummary request received', { tabId: request.data?.tabId });
  const { tabId } = request.data || {};
  if (!tabId) {
    sendResponse({ error: 'Tab ID is required' });
    return true;
  }
  (async () => {
    try {
      const result = await extractYouTubeSubtitles(tabId);
      log('extractYouTubeSubtitlesForSummary success', { subtitleCount: result?.subtitles?.length || 0 });
      sendResponse({ success: true, result });
    } catch (error) {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'subtitleExtractionFailed',
        logError: true,
        createUserMessage: false
      });
      sendResponse({ error: normalized.message || 'Failed to extract subtitles' });
    }
  })();
  return true;
}








