// @ts-check
// Video and subtitle-related message handlers
// Handlers: youtubeSubtitlesResult, extractYouTubeSubtitlesForSummary

import { log, logError } from '../utils/logging.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { extractYouTubeSubtitles } from '../extraction/video-subtitles.js';

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
      sendResponse({ error: normalized.message || 'Failed to extract subtitles', ...getErrorTranslation(normalized) });
    }
  })();
  return true;
}








