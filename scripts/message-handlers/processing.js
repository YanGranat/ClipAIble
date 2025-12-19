// Processing-related message handlers
// Handlers: processArticle, generatePdfDebugger

import { log, logError } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { completeProcessing, setError } from '../state/processing.js';
import { generatePdfWithDebugger } from '../generation/pdf.js';

/**
 * Handle processArticle request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Function} startArticleProcessing - Function to start article processing
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleProcessArticle(request, sender, sendResponse, startArticleProcessing, stopKeepAlive) {
  startArticleProcessing(request.data)
    .then(() => {
      sendResponse({ started: true });
    })
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'contentExtractionFailed',
        logError: true,
        createUserMessage: false
      });
      sendResponse({ error: normalized.message || 'Processing failed' });
    });
  return true;
}

/**
 * Handle generatePdfDebugger request
 * @param {Object} request - Request object
 * @param {Object} sender - Sender object
 * @param {Function} sendResponse - Response function
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleGeneratePdfDebugger(request, sender, sendResponse, stopKeepAlive) {
  const { title, pageMode, contentWidth, contentHeight } = request.data;
  const tabId = sender.tab?.id;
  
  if (!tabId) {
    sendResponse({ error: 'No tab ID' });
    return true;
  }
  
  log('generatePdfDebugger', { title, pageMode, contentWidth, contentHeight, tabId });
  
  generatePdfWithDebugger(
    tabId, title, pageMode, contentWidth, contentHeight,
    async () => await completeProcessing(stopKeepAlive),
    async (errorMsg) => await setError(errorMsg, stopKeepAlive)
  )
    .then(() => log('PDF generated and downloaded'))
    .catch(async error => {
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'pdfGenerationFailed',
        logError: true,
        createUserMessage: false
      });
      logError('generatePdfDebugger failed', normalized);
    });
  
  sendResponse({ success: true });
  return true;
}


