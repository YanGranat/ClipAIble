// @ts-check
// Retry utility for API calls with exponential backoff

import { log, logWarn, logError } from './logging.js';
import { CONFIG } from './config.js';

/**
 * Retryable HTTP status codes (temporary errors)
 * @deprecated Use CONFIG.RETRYABLE_STATUS_CODES instead
 */
const RETRYABLE_STATUS_CODES = CONFIG.RETRYABLE_STATUS_CODES;

/**
 * Default retry configuration
 * Uses values from CONFIG for centralized management
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
  delays: CONFIG.RETRY_DELAYS, // Exponential backoff: 1s, 2s, 4s
  retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
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
 * @template T
 * @param {() => Promise<T>} fn - Function to call (should return Promise)
 * @param {import('../types.js').RetryOptions} [options] - Retry options
 * @returns {Promise<T>} Result of function call
 * @throws {Error} If all retry attempts fail and error is not retryable
 * @throws {Error} If max retries exceeded
 * @example
 * // Retry API call with default settings
 * const result = await callWithRetry(async () => {
 *   const response = await fetch('https://api.example.com/data');
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *   return response.json();
 * });
 * @example
 * // Retry with custom options
 * const result = await callWithRetry(async () => {
 *   return await callAPI();
 * }, {
 *   maxRetries: 3,
 *   delays: [1000, 2000, 5000],
 *   shouldRetry: (error) => error.status === 429 || error.status >= 500
 * });
 */
export async function callWithRetry(fn, options = {}) {
  const config = {
    ...DEFAULT_RETRY_CONFIG,
    ...options
  };
  
  const operationStartTime = Date.now();
  let lastError;
  let attempt = 0;
  
  log('🔄 Starting operation with retry logic', {
    maxRetries: config.maxRetries,
    retryableStatusCodes: config.retryableStatusCodes
  });
  
  while (attempt <= config.maxRetries) {
    const attemptStartTime = Date.now();
    try {
      const result = await fn();
      const attemptDuration = Date.now() - attemptStartTime;
      const totalDuration = Date.now() - operationStartTime;
      
      if (attempt > 0) {
        log(`✅ Retry successful after ${attempt} attempt(s)`, {
          attemptDuration: `${attemptDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          retriesUsed: attempt
        });
      } else {
        log('✅ Operation succeeded on first attempt', {
          duration: `${attemptDuration}ms`
        });
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
        } else if (CONFIG.RETRY_NETWORK_ERRORS) {
          // Retry on network errors (connection failed, fetch failed, etc.)
          const networkErrorPatterns = [
            'network', 'connection', 'failed to fetch', 'fetch', 
            'networkerror', 'network error', 'econnreset', 'enotfound',
            'econnrefused', 'etimedout', 'eai_again'
          ];
          const errorMsgLower = (error.message || '').toLowerCase();
          if (networkErrorPatterns.some(pattern => errorMsgLower.includes(pattern))) {
            shouldRetry = true;
          }
        }
      }
      
      // Don't retry if max attempts reached or error is not retryable
      if (attempt >= config.maxRetries || !shouldRetry) {
        const totalDuration = Date.now() - operationStartTime;
        if (attempt > 0) {
          logError(`❌ Retry failed after ${attempt} attempt(s)`, {
            totalDuration: `${totalDuration}ms`,
            error: lastError.message,
            statusCode: lastError.status || lastError.statusCode,
            reason: !shouldRetry ? 'Error is not retryable' : 'Max retries reached'
          });
        }
        throw lastError;
      }
      
      // Calculate delay for this retry
      let delay = config.delays[attempt] || config.delays[config.delays.length - 1];
      
      // Check for Retry-After header in response (if available)
      // Some APIs (e.g., OpenAI, GitHub) return Retry-After header indicating
      // when to retry. We respect this to avoid unnecessary retries.
      // Retry-After can be: seconds (number) or HTTP date string
      if (error.response && error.response.headers) {
        const retryAfter = error.response.headers.get('Retry-After');
        if (retryAfter) {
          // Retry-After can be seconds (number) or HTTP date
          // We only parse numeric seconds for simplicity
          const retryAfterSeconds = parseInt(retryAfter, 10);
          if (!isNaN(retryAfterSeconds)) {
            delay = retryAfterSeconds * 1000; // Convert to milliseconds
            log('Using Retry-After header', { retryAfterSeconds, delay });
          }
        }
      }
      
      // Add jitter (±20%) to avoid thundering herd problem
      // When multiple clients retry simultaneously (e.g., after rate limit),
      // jitter spreads out retry attempts, reducing server load spikes
      // Formula: delay ± random(0-20%) ensures staggered retries
      const jitter = delay * 0.2; // 20% of delay
      const jitterAmount = (Math.random() * 2 - 1) * jitter; // Random between -jitter and +jitter
      delay = Math.max(100, delay + jitterAmount); // Minimum 100ms to prevent too-fast retries
      const finalDelay = Math.floor(delay);
      
      const attemptDuration = Date.now() - attemptStartTime;
      const totalDuration = Date.now() - operationStartTime;
      
      // Call onRetry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, finalDelay);
      } else {
        logWarn(`🔄 Retrying operation (attempt ${attempt + 1}/${config.maxRetries})`, {
          error: error.message,
          statusCode: error.status || error.statusCode,
          attemptDuration: `${attemptDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          waitTime: `${finalDelay}ms`,
          reason: error.status ? `HTTP ${error.status}` : error.name || 'Network error'
        });
      }
      
      // Wait before retry
      await sleep(finalDelay);
      attempt++;
    }
  }
  
  throw lastError;
}

/**
 * Wrap fetch call with retry logic
 * @param {string} url - Request URL
 * @param {RequestInit} init - Fetch options
 * @param {import('../types.js').RetryOptions} retryOptions - Retry configuration
 * @returns {Promise<Response>} Fetch response
 * @throws {Error} If all retry attempts fail
 * @throws {Error} If network error occurs
 * @throws {Error} If max retries exceeded
 */
export async function fetchWithRetry(url, init = {}, retryOptions = {}) {
  return callWithRetry(
    async () => {
      const response = await fetch(url, init);
      
      // If response is not ok and status is retryable, throw error
      if (!response.ok) {
        const retryableCodes = retryOptions.retryableStatusCodes || DEFAULT_RETRY_CONFIG.retryableStatusCodes;
        if (isRetryableError(response.status, retryableCodes)) {
          /** @type {Error & {status?: number, response?: Response}} */
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          error.response = response;
          throw error;
        }
        // Non-retryable error - throw immediately
        /** @type {Error & {status?: number, response?: Response}} */
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
