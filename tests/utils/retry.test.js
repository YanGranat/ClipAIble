// Tests for retry utility functions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callWithRetry, fetchWithRetry } from '../../scripts/utils/retry.js';
import { CONFIG } from '../../scripts/utils/config.js';

// Mock logging
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn()
}));

// Mock config
vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    RETRY_MAX_ATTEMPTS: 3,
    RETRY_DELAYS: [100, 200, 400],
    RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504],
    RETRY_NETWORK_ERRORS: true
  }
}));

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('callWithRetry', () => {
    it('should return result on first attempt if successful', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const result = await callWithRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable status code error', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500, message: 'Server error' })
        .mockResolvedValueOnce('success');
      
      const promise = callWithRetry(fn);
      
      // Fast-forward through first retry delay (with jitter)
      await vi.advanceTimersByTimeAsync(150);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should retry on network timeout error', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ name: 'AbortError', message: 'timeout' })
        .mockResolvedValueOnce('success');
      
      const promise = callWithRetry(fn);
      
      await vi.advanceTimersByTimeAsync(150);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should retry on network error when RETRY_NETWORK_ERRORS is true', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ message: 'Network error: failed to fetch' })
        .mockResolvedValueOnce('success');
      
      const promise = callWithRetry(fn);
      
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 400, message: 'Bad request' });
      
      await expect(callWithRetry(fn)).rejects.toEqual({ status: 400, message: 'Bad request' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries option', async () => {
      const error = { status: 500, message: 'Server error' };
      const fn = vi.fn().mockRejectedValue(error);
      
      const promise = callWithRetry(fn, { maxRetries: 2 });
      
      // Fast-forward through all retry delays (with jitter)
      await vi.advanceTimersByTimeAsync(150 + 250);
      
      await expect(promise).rejects.toMatchObject({ status: 500, message: 'Server error' });
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 10000);

    it('should use custom shouldRetry function', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ custom: 'error' })
        .mockResolvedValueOnce('success');
      
      const shouldRetry = vi.fn().mockReturnValue(true);
      
      const promise = callWithRetry(fn, { shouldRetry });
      
      await vi.advanceTimersByTimeAsync(150);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(shouldRetry).toHaveBeenCalledWith({ custom: 'error' });
      expect(fn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should call onRetry callback before each retry', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValueOnce('success');
      
      const onRetry = vi.fn();
      
      const promise = callWithRetry(fn, { onRetry });
      
      await vi.advanceTimersByTimeAsync(100);
      
      await promise;
      
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('should respect Retry-After header', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({
          status: 429,
          response: {
            headers: {
              get: vi.fn().mockReturnValue('5') // 5 seconds
            }
          }
        })
        .mockResolvedValueOnce('success');
      
      const promise = callWithRetry(fn);
      
      // Fast-forward through 5 seconds (5000ms)
      await vi.advanceTimersByTimeAsync(5000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should add jitter to delay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValueOnce('success');
      
      const promise = callWithRetry(fn, { delays: [1000] });
      
      // Jitter is ±20%, so delay should be between 800-1200ms
      // We'll advance by 1200ms to be safe
      await vi.advanceTimersByTimeAsync(1200);
      
      await promise;
      
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw last error after max retries', async () => {
      const error = { status: 500, message: 'Server error' };
      const fn = vi.fn().mockRejectedValue(error);
      
      const promise = callWithRetry(fn, { maxRetries: 2 });
      
      await vi.advanceTimersByTimeAsync(150 + 250);
      
      await expect(promise).rejects.toMatchObject({ status: 500, message: 'Server error' });
      expect(fn).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('fetchWithRetry', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should return response if ok', async () => {
      const response = { ok: true, status: 200 };
      global.fetch.mockResolvedValue(response);
      
      const result = await fetchWithRetry('https://example.com');
      
      expect(result).toBe(response);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable status code', async () => {
      const errorResponse = { ok: false, status: 500 };
      const successResponse = { ok: true, status: 200 };
      
      global.fetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);
      
      const promise = fetchWithRetry('https://example.com');
      
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable status code', async () => {
      const errorResponse = { ok: false, status: 400 };
      global.fetch.mockResolvedValue(errorResponse);
      
      await expect(fetchWithRetry('https://example.com')).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should pass fetch options', async () => {
      const response = { ok: true, status: 200 };
      global.fetch.mockResolvedValue(response);
      
      const options = { method: 'POST', body: 'test' };
      await fetchWithRetry('https://example.com', options);
      
      expect(global.fetch).toHaveBeenCalledWith('https://example.com', options);
    });

    it('should use custom retry options', async () => {
      const errorResponse = { ok: false, status: 500 };
      const successResponse = { ok: true, status: 200 };
      
      global.fetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);
      
      const promise = fetchWithRetry('https://example.com', {}, { maxRetries: 1 });
      
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe(successResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

