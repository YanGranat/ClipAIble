// Common API error handler for TTS providers
// Handles HTTP errors consistently across all TTS providers

import { logError, logWarn } from './logging.js';

/**
 * HTTP status codes that should trigger retry
 */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Handle API error response
 * @param {Response} response - Fetch response object
 * @param {string} providerName - Provider name for error messages (e.g., 'Qwen3-TTS-Flash', 'Respeecher', 'ElevenLabs')
 * @param {Object} options - Additional options
 * @param {Function} options.parseErrorData - Custom function to parse error data from response
 * @param {Function} options.customErrorHandler - Custom function to handle specific status codes (receives errorData, errorText, response, returns error message or null)
 * @returns {Error} Error object with status and message
 */
export async function handleApiError(response, providerName, options = {}) {
  const { parseErrorData, customErrorHandler } = options;
  
  // Check if error is retryable
  if (RETRYABLE_STATUS_CODES.includes(response.status)) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    error.response = response;
    error.retryable = true;
    return error;
  }
  
  // Non-retryable error - try to get error message
  let errorData;
  let errorText;
  
  try {
    errorText = await response.text();
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      // If JSON parse fails, use text as error message
      errorData = { error: { message: errorText || `HTTP ${response.status}` } };
    }
  } catch (e) {
    errorData = { error: { message: `HTTP ${response.status}` } };
  }
  
  // Use custom parser if provided
  if (parseErrorData) {
    errorData = parseErrorData(errorData, errorText, response);
  }
  
  // Try custom error handler first
  let errorMsg = null;
  if (customErrorHandler) {
    errorMsg = customErrorHandler(errorData, errorText, response);
  }
  
  // If custom handler didn't provide message, use default extraction
  if (!errorMsg) {
    errorMsg = errorData.error?.message || 
               errorData.message || 
               errorData.detail || 
               errorText || 
               `${providerName} API error: ${response.status}`;
  }
  
  const error = new Error(errorMsg);
  error.status = response.status;
  error.data = errorData;
  
  return error;
}

/**
 * Handle timeout error
 * @param {string} providerName - Provider name
 * @returns {Error} Error object
 */
export function handleTimeoutError(providerName) {
  return new Error(`${providerName} request timed out. Please try again.`);
}

/**
 * Handle network error
 * @param {Error} networkError - Network error
 * @param {string} providerName - Provider name
 * @returns {Error} Error object
 */
export function handleNetworkError(networkError, providerName) {
  logError(`${providerName} network error`, networkError);
  return new Error(`${providerName} network error: ${networkError.message}`);
}

