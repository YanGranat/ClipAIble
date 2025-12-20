// Unit tests for scripts/utils/error-handler.js

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeError,
  detectErrorCode,
  ERROR_PATTERNS
} from '../../scripts/utils/error-handler.js';
import { ERROR_CODES } from '../../scripts/state/processing.js';

describe('detectErrorCode', () => {
  it('should detect AUTH errors', () => {
    expect(detectErrorCode('Authentication failed')).toBe(ERROR_CODES.AUTH_ERROR);
    expect(detectErrorCode('401 Unauthorized')).toBe(ERROR_CODES.AUTH_ERROR);
    expect(detectErrorCode('Invalid API key')).toBe(ERROR_CODES.AUTH_ERROR);
  });

  it('should detect RATE_LIMIT errors', () => {
    expect(detectErrorCode('Rate limit exceeded')).toBe(ERROR_CODES.RATE_LIMIT);
    expect(detectErrorCode('429 Too Many Requests')).toBe(ERROR_CODES.RATE_LIMIT);
    expect(detectErrorCode('Quota exceeded')).toBe(ERROR_CODES.RATE_LIMIT);
  });

  it('should detect TIMEOUT errors', () => {
    expect(detectErrorCode('Request timeout')).toBe(ERROR_CODES.TIMEOUT);
    expect(detectErrorCode('Timed out')).toBe(ERROR_CODES.TIMEOUT);
    expect(detectErrorCode('Deadline exceeded')).toBe(ERROR_CODES.TIMEOUT);
  });

  it('should detect NETWORK errors', () => {
    expect(detectErrorCode('Network error')).toBe(ERROR_CODES.NETWORK_ERROR);
    expect(detectErrorCode('Failed to fetch')).toBe(ERROR_CODES.NETWORK_ERROR);
    expect(detectErrorCode('Connection refused')).toBe(ERROR_CODES.NETWORK_ERROR);
  });

  it('should detect PARSE errors', () => {
    expect(detectErrorCode('Parse error')).toBe(ERROR_CODES.PARSE_ERROR);
    expect(detectErrorCode('Invalid JSON')).toBe(ERROR_CODES.PARSE_ERROR);
    expect(detectErrorCode('Syntax error')).toBe(ERROR_CODES.PARSE_ERROR);
  });

  it('should detect VALIDATION errors', () => {
    expect(detectErrorCode('Validation failed')).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(detectErrorCode('Invalid input')).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(detectErrorCode('Missing required field')).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('should detect PROVIDER errors', () => {
    expect(detectErrorCode('Service unavailable')).toBe(ERROR_CODES.PROVIDER_ERROR);
    expect(detectErrorCode('503 Internal Server Error')).toBe(ERROR_CODES.PROVIDER_ERROR);
    expect(detectErrorCode('502 Bad Gateway')).toBe(ERROR_CODES.PROVIDER_ERROR);
  });

  it('should return UNKNOWN_ERROR for unrecognized errors', () => {
    expect(detectErrorCode('Some random error')).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(detectErrorCode('')).toBe(ERROR_CODES.UNKNOWN_ERROR);
  });

  it('should handle null/undefined', () => {
    expect(detectErrorCode(null)).toBe(ERROR_CODES.UNKNOWN_ERROR);
    expect(detectErrorCode(undefined)).toBe(ERROR_CODES.UNKNOWN_ERROR);
  });

  it('should be case-insensitive', () => {
    expect(detectErrorCode('AUTHENTICATION FAILED')).toBe(ERROR_CODES.AUTH_ERROR);
    expect(detectErrorCode('Rate Limit')).toBe(ERROR_CODES.RATE_LIMIT);
  });
});

describe('normalizeError', () => {
  it('should normalize Error objects', () => {
    const error = new Error('Test error');
    const normalized = normalizeError(error);
    
    expect(normalized.message).toBe('Test error');
    expect(normalized.originalError).toBe(error);
    expect(normalized.context).toBeDefined();
  });

  it('should normalize string errors', () => {
    const normalized = normalizeError('String error');
    
    expect(normalized.message).toBe('String error');
    expect(normalized.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
  });

  it('should normalize object errors', () => {
    const errorObj = { message: 'Object error', code: ERROR_CODES.AUTH_ERROR };
    const normalized = normalizeError(errorObj);
    
    expect(normalized.message).toBe('Object error');
    expect(normalized.code).toBe(ERROR_CODES.AUTH_ERROR);
  });

  it('should auto-detect error code from message', () => {
    const error = new Error('Authentication failed');
    const normalized = normalizeError(error);
    
    expect(normalized.code).toBe(ERROR_CODES.AUTH_ERROR);
  });

  it('should preserve error code if already set', () => {
    const error = new Error('Some error');
    error.code = ERROR_CODES.RATE_LIMIT;
    const normalized = normalizeError(error);
    
    expect(normalized.code).toBe(ERROR_CODES.RATE_LIMIT);
  });

  it('should detect error code from HTTP status', () => {
    // Create an Error-like object with status property
    const error = new Error('Error');
    error.status = 401;
    const normalized = normalizeError(error);
    
    expect(normalized.code).toBe(ERROR_CODES.AUTH_ERROR);
  });

  it('should include context', () => {
    const error = new Error('Test');
    const normalized = normalizeError(error, { source: 'test', errorType: 'testError' });
    
    expect(normalized.context.source).toBe('test');
    expect(normalized.context.errorType).toBe('testError');
    expect(normalized.context.timestamp).toBeDefined();
  });

  it('should handle nested error objects', () => {
    const errorObj = { error: { message: 'Nested error' } };
    const normalized = normalizeError(errorObj);
    
    expect(normalized.message).toBe('Nested error');
  });

  it('should handle unknown error types', () => {
    const normalized = normalizeError(123);
    
    expect(normalized.message).toBe('Unknown error');
    expect(normalized.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
  });
});

describe('ERROR_PATTERNS', () => {
  it('should have all required pattern categories', () => {
    expect(ERROR_PATTERNS.AUTH).toBeDefined();
    expect(ERROR_PATTERNS.RATE_LIMIT).toBeDefined();
    expect(ERROR_PATTERNS.TIMEOUT).toBeDefined();
    expect(ERROR_PATTERNS.NETWORK).toBeDefined();
    expect(ERROR_PATTERNS.PARSE).toBeDefined();
    expect(ERROR_PATTERNS.VALIDATION).toBeDefined();
    expect(ERROR_PATTERNS.PROVIDER).toBeDefined();
  });

  it('should have arrays of patterns', () => {
    expect(Array.isArray(ERROR_PATTERNS.AUTH)).toBe(true);
    expect(Array.isArray(ERROR_PATTERNS.RATE_LIMIT)).toBe(true);
    expect(Array.isArray(ERROR_PATTERNS.TIMEOUT)).toBe(true);
  });

  it('should have non-empty pattern arrays', () => {
    expect(ERROR_PATTERNS.AUTH.length).toBeGreaterThan(0);
    expect(ERROR_PATTERNS.RATE_LIMIT.length).toBeGreaterThan(0);
    expect(ERROR_PATTERNS.TIMEOUT.length).toBeGreaterThan(0);
  });
});

