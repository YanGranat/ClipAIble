// @ts-check
// Common API error handler for TTS providers
// Handles HTTP errors consistently across all TTS providers

import { logError } from '../logging.js';
import { getUILanguage, tSync } from '../../locales.js';

/**
 * @typedef {Error & {
 *   status?: number;
 *   statusCode?: number;
 *   response?: Response;
 *   retryable?: boolean;
 *   data?: any;
 * }} ApiError
 */

/**
 * HTTP status codes that should trigger retry
 */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Handle API error response
 * @param {Response} response - Fetch response object
 * @param {string} providerName - Provider name for error messages (e.g., 'Qwen3-TTS-Flash', 'Respeecher', 'ElevenLabs')
 * @param {{parseErrorData?: (errorData: any) => any, customErrorHandler?: (errorData: any, errorText: string, response: Response) => string|null}} [options] - Additional options
 * @returns {Promise<import('../../types.js').ApiError>} Error object with status and message
 * @throws {Error} If error parsing fails
 */
export async function handleApiError(response, providerName, options = {}) {
  const { parseErrorData, customErrorHandler } = options;
  
  // Check if error is retryable
  if (RETRYABLE_STATUS_CODES.includes(response.status)) {
    /** @type {ApiError} */
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
    errorData = parseErrorData(errorData);
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
  
  /** @type {ApiError} */
  const error = new Error(errorMsg);
  error.status = response.status;
  error.data = errorData;
  
  return error;
}

/**
 * Handle timeout error
 * @param {string} providerName - Provider name
 * @returns {Promise<Error>} Error object
 */
export async function handleTimeoutError(providerName) {
  const uiLang = await getUILanguage();
  return new Error(tSync('errorProviderTimeout', uiLang).replace('{provider}', providerName));
}

/**
 * Handle network error
 * @param {Error} networkError - Network error
 * @param {string} providerName - Provider name
 * @returns {Promise<Error>} Error object
 */
export async function handleNetworkError(networkError, providerName) {
  logError(`${providerName} network error`, networkError);
  const uiLang = await getUILanguage();
  return new Error(tSync('errorProviderNetworkError', uiLang).replace('{provider}', providerName).replace('{error}', networkError.message || 'unknown'));
}

