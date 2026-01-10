// @ts-check
// Processing-related message handlers
// Handlers: processArticle, generatePdfDebugger

import { log, logError } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { completeProcessing, setError } from '../state/processing.js';
import { generatePdfWithDebugger } from '../generation/pdf.js';

/**
 * Handle processArticle request
 * @param {import('../types.js').MessageRequest} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @param {function(import('../types.js').ProcessingData, Function): Promise<boolean>} startArticleProcessing - Function to start article processing
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleProcessArticle(request, sender, sendResponse, startArticleProcessing, stopKeepAlive) {
  // DETAILED LOGGING: Voice in processArticle request
  // CRITICAL: Always log voice information, even if not present
  log('[ClipAIble Background] ===== VOICE IN processArticle REQUEST =====', {
    timestamp: Date.now(),
    audioProvider: request.data?.audioProvider,
    audioVoice: request.data?.audioVoice,
    audioVoiceType: typeof request.data?.audioVoice,
    audioVoiceString: String(request.data?.audioVoice || ''),
    isNumeric: /^\d+$/.test(String(request.data?.audioVoice || '')),
    hasUnderscore: request.data?.audioVoice && String(request.data?.audioVoice).includes('_'),
    hasDash: request.data?.audioVoice && String(request.data?.audioVoice).includes('-'),
    isValidFormat: request.data?.audioVoice && (String(request.data?.audioVoice).includes('_') || String(request.data?.audioVoice).includes('-')),
    googleTtsVoice: request.data?.googleTtsVoice,
    outputFormat: request.data?.outputFormat,
    VOICE_STRING: `VOICE="${String(request.data?.audioVoice || '')}"`, // Explicit string for visibility
    willBeUsed: request.data?.outputFormat === 'audio',
    source: 'popup_request'
  });
  
  log('=== handleProcessArticle: ENTRY ===', {
    hasData: !!request.data,
    dataKeys: request.data ? Object.keys(request.data) : [],
    mode: request.data?.mode,
    url: request.data?.url,
    hasTabId: !!request.data?.tabId,
    tabId: request.data?.tabId,
    hasHtml: !!request.data?.html,
    htmlLength: request.data?.html?.length || 0,
    outputFormat: request.data?.outputFormat,
    timestamp: Date.now()
  });
  
  // DETAILED LOGGING: All request data and settings
  log('=== ALL REQUEST DATA AND SETTINGS ===', {
    // Basic data
    url: request.data?.url,
    title: request.data?.title,
    tabId: request.data?.tabId,
    htmlLength: request.data?.html?.length || 0,
    htmlPreview: request.data?.html ? request.data.html.substring(0, 500) + '...' : null,
    
    // Processing settings
    mode: request.data?.mode,
    outputFormat: request.data?.outputFormat,
    generateToc: request.data?.generateToc,
    generateAbstract: request.data?.generateAbstract,
    
    // AI settings
    model: request.data?.model,
    hasApiKey: !!request.data?.apiKey,
    apiKeyLength: request.data?.apiKey?.length || 0,
    apiKeyPrefix: request.data?.apiKey ? (request.data.apiKey.startsWith('sk-') ? 'sk-' : request.data.apiKey.startsWith('AIza') ? 'AIza' : request.data.apiKey.startsWith('xai-') ? 'xai-' : 'other') : null,
    apiProvider: request.data?.apiProvider,
    
    // Translation settings
    targetLanguage: request.data?.targetLanguage,
    translateImages: request.data?.translateImages,
    
    // PDF settings
    pageMode: request.data?.pageMode,
    fontFamily: request.data?.fontFamily,
    fontSize: request.data?.fontSize,
    bgColor: request.data?.bgColor,
    textColor: request.data?.textColor,
    headingColor: request.data?.headingColor,
    linkColor: request.data?.linkColor,
    
    // Audio settings
    audioProvider: request.data?.audioProvider,
    audioVoice: request.data?.audioVoice,
    audioSpeed: request.data?.audioSpeed,
    audioFormat: request.data?.audioFormat,
    
    // Cache settings
    useCache: request.data?.useCache,
    
    // All keys
    allKeys: Object.keys(request.data || {}),
    timestamp: Date.now()
  });
  
  log('=== handleProcessArticle: Checking startArticleProcessing ===', {
    hasStartArticleProcessing: typeof startArticleProcessing === 'function',
    functionName: startArticleProcessing?.name || 'unknown',
    timestamp: Date.now()
  });
  
  if (typeof startArticleProcessing !== 'function') {
    logError('=== handleProcessArticle: startArticleProcessing is not a function ===', {
      type: typeof startArticleProcessing,
      timestamp: Date.now()
    });
    sendResponse({ error: 'startArticleProcessing is not a function' });
    return true;
  }
  
  log('=== handleProcessArticle: About to call startArticleProcessing ===', {
    timestamp: Date.now()
  });
  
  const processingPromise = startArticleProcessing(request.data);
  
  log('=== handleProcessArticle: startArticleProcessing called, got promise ===', {
    isPromise: processingPromise instanceof Promise,
    timestamp: Date.now()
  });
  
  // Use async IIFE with proper error handling and safe sendResponse
  (async () => {
    try {
      const result = await processingPromise;
      log('=== handleProcessArticle: startArticleProcessing SUCCESS ===', {
        hasResult: !!result,
        resultType: typeof result,
        timestamp: Date.now()
      });
      
      log('=== handleProcessArticle: Sending response ===', {
        timestamp: Date.now()
      });
      
      // Check for Chrome runtime errors before sending response
      if (chrome.runtime.lastError) {
        logError('=== handleProcessArticle: chrome.runtime.lastError before sendResponse ===', {
          error: chrome.runtime.lastError.message,
          timestamp: Date.now()
        });
        return;
      }
      
      try {
        sendResponse({ started: true });
        log('=== handleProcessArticle: Response sent ===', {
          timestamp: Date.now()
        });
      } catch (sendError) {
        logError('=== handleProcessArticle: sendResponse failed ===', {
          error: sendError.message,
          lastError: chrome.runtime.lastError?.message,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logError('=== handleProcessArticle: startArticleProcessing FAILED ===', {
        error: error?.message || String(error),
        errorStack: error?.stack,
        errorName: error?.name,
        timestamp: Date.now()
      });
      
      const normalized = await handleError(error, {
        source: 'messageHandler',
        errorType: 'contentExtractionFailed',
        logError: true,
        createUserMessage: true, // Use centralized user-friendly message
      });
      
      logError('=== handleProcessArticle: Sending error response ===', {
        errorMessage: normalized.message,
        timestamp: Date.now()
      });
      
      // Check for Chrome runtime errors before sending error response
      if (chrome.runtime.lastError) {
        logError('=== handleProcessArticle: chrome.runtime.lastError before error sendResponse ===', {
          error: chrome.runtime.lastError.message,
          timestamp: Date.now()
        });
        return;
      }
      
      try {
        sendResponse({ error: normalized.message || 'Processing failed' });
      } catch (sendError) {
        logError('=== handleProcessArticle: sendResponse failed in error path ===', {
          error: sendError.message,
          lastError: chrome.runtime.lastError?.message,
          timestamp: Date.now()
        });
      }
    }
  })();
  
  log('=== handleProcessArticle: Returning true ===', {
    timestamp: Date.now()
  });
  
  return true;
}

/**
 * Handle generatePdfDebugger request
 * @param {import('../types.js').MessageRequest} request - Request object
 * @param {import('../types.js').ChromeRuntimeMessageSender} sender - Sender object
 * @param {function(import('../types.js').MessageResponse): void} sendResponse - Response function
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @returns {boolean} - Always returns true for async handlers
 */
export function handleGeneratePdfDebugger(request, sender, sendResponse, stopKeepAlive) {
  // CRITICAL: Validate request.data before destructuring to prevent crashes
  if (!request.data || typeof request.data !== 'object') {
    logError('generatePdfDebugger: Invalid or missing data', {
      hasData: !!request.data,
      dataType: typeof request.data
    });
    sendResponse({ error: 'generatePdfDebugger requires data object' });
    return true;
  }
  
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
        createUserMessage: true, // Use centralized user-friendly message
      });
      logError('generatePdfDebugger failed', normalized);
    });
  
  sendResponse({ success: true });
  return true;
}




