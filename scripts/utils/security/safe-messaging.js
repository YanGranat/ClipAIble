/**
 * Safe messaging utilities to prevent "Unchecked runtime.lastError" spam
 * Wraps chrome.runtime.sendMessage and chrome.tabs.sendMessage with proper error handling
 * @date 2026-01-01
 */

/**
 * Safely send message using Promise API with proper error handling
 * Prevents "Unchecked runtime.lastError" by checking lastError in callback
 * @param {import('../../types.js').MessageRequest} message - Message to send
 * @param {{targetTabId?: number, timeout?: number}} options - Options
 * @returns {Promise<any>} Response or rejection
 * @example
 * // Send message to background script
 * try {
 *   const response = await safeSendMessage({
 *     action: 'getState'
 *   });
 *   console.log('State:', response.state);
 * } catch (error) {
 *   console.error('Failed to get state:', error.message);
 * }
 * @example
 * // Send message to specific tab
 * try {
 *   const response = await safeSendMessage({
 *     action: 'extractContent',
 *     data: { url: 'https://example.com' }
 *   }, { targetTabId: 123 });
 *   console.log('Content extracted:', response.content);
 * } catch (error) {
 *   console.error('Failed to extract content:', error.message);
 * }
 */
export function safeSendMessage(message, options = {}) {
  return new Promise((resolve, reject) => {
    // Use callback-based API to properly handle lastError
    const callback = (response) => {
      // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
        // Silently reject - don't log connection errors as they're expected when receiver is closed
        reject(new Error(errorMsg));
        return;
      }
      
      if (response === undefined) {
        reject(new Error('No response from receiver'));
        return;
      }
      
      resolve(response);
    };
    
    if (options.targetTabId) {
      // Use chrome.tabs.sendMessage for tab-specific messages
      chrome.tabs.sendMessage(options.targetTabId, message, callback);
    } else {
      // Use chrome.runtime.sendMessage for runtime messages
      chrome.runtime.sendMessage(message, callback);
    }
  });
}

/**
 * Safely send message with timeout
 * @param {import('../../types.js').MessageRequest} message - Message to send
 * @param {{targetTabId?: number, timeout?: number}} options - Options
 * @returns {Promise<any>} Response or rejection
 * @example
 * // Send message with 10 second timeout
 * try {
 *   const response = await safeSendMessageWithTimeout({
 *     action: 'processArticle',
 *     data: { url: 'https://example.com' }
 *   }, { timeout: 10000 });
 *   console.log('Processing started:', response);
 * } catch (error) {
 *   if (error.message.includes('timeout')) {
 *     console.error('Request timed out');
 *   } else {
 *     console.error('Request failed:', error.message);
 *   }
 * }
 */
export function safeSendMessageWithTimeout(message, options = {}) {
  const timeout = options.timeout || 30000; // Default 30 seconds
  
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms`));
    }, timeout);
  });
  
  const messagePromise = safeSendMessage(message, options);
  
  return Promise.race([messagePromise, timeoutPromise]).finally(() => {
    // Clear timeout if message completed before timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

