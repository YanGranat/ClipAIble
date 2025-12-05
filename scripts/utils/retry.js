// Retry utility for API calls with exponential backoff

import { log, logWarn, logError } from './logging.js';

/**
 * Retryable HTTP status codes (temporary errors)
 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  delays: [1000, 2000, 4000], // Exponential backoff: 1s, 2s, 4s
  retryableStatusCodes: RETRYABLE_STATUS_CODES
};

/**
 * Check if error is retryable based on status code
 * @param {number} statusCode - HTTP status code
 * @param {Array<number>} retryableCodes - List of retryable status codes
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(statusCode, retryableCodes) {
  return retryableCodes.includes(statusCode);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call function with retry logic
 * @param {Function} fn - Function to call (should return Promise)
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {Array<number>} options.delays - Array of delay times in ms for each retry
 * @param {Array<number>} options.retryableStatusCodes - HTTP status codes that should trigger retry
 * @param {Function} options.onRetry - Callback called before each retry (attempt, delay)
 * @param {Function} options.shouldRetry - Custom function to determine if should retry (error) => boolean
 * @returns {Promise<any>} Result of function call
 */
export async function callWithRetry(fn, options = {}) {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    ...options
  };
  
  let lastError;
  let attempt = 0;
  
  while (attempt <= config.maxRetries) {
    try {
      const result = await fn();
      if (attempt > 0) {
        log(`Retry successful after ${attempt} attempt(s)`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      let shouldRetry = false;
      
      if (config.shouldRetry) {
        shouldRetry = config.shouldRetry(error);
      } else {
        // Default: check status code if error has it
        const statusCode = error.status || error.statusCode || 
          (error.response && error.response.status);
        
        if (statusCode) {
          shouldRetry = isRetryableError(statusCode, config.retryableStatusCodes);
        } else if (error.name === 'AbortError' || error.message?.includes('timeout')) {
          // Network timeouts are retryable
          shouldRetry = true;
        }
      }
      
      // Don't retry if max attempts reached or error is not retryable
      if (attempt >= config.maxRetries || !shouldRetry) {
        if (attempt > 0) {
          logError(`Retry failed after ${attempt} attempt(s)`, lastError);
        }
        throw lastError;
      }
      
      // Calculate delay for this retry
      const delay = config.delays[attempt] || config.delays[config.delays.length - 1];
      
      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, delay);
      } else {
        logWarn(`Retrying... (attempt ${attempt + 1}/${config.maxRetries}, waiting ${delay}ms)`, {
          error: error.message,
          statusCode: error.status || error.statusCode
        });
      }
      
      // Wait before retry
      await sleep(delay);
      attempt++;
    }
  }
  
  throw lastError;
}

/**
 * Wrap fetch call with retry logic
 * @param {string} url - Request URL
 * @param {RequestInit} init - Fetch options
 * @param {Object} retryOptions - Retry configuration
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, init = {}, retryOptions = {}) {
  return callWithRetry(
    async () => {
      const response = await fetch(url, init);
      
      // If response is not ok and status is retryable, throw error
      if (!response.ok) {
        const retryableCodes = retryOptions.retryableStatusCodes || DEFAULT_RETRY_CONFIG.retryableStatusCodes;
        if (isRetryableError(response.status, retryableCodes)) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          error.response = response;
          throw error;
        }
        // Non-retryable error - throw immediately
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      
      return response;
    },
    retryOptions
  );
}
