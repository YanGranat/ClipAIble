// Tests for security utility functions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidExternalUrl,
  isValidMessageSize,
  safeJsonParse,
  sanitizeErrorForLogging,
  sanitizeFilename,
  MAX_MESSAGE_SIZE,
  MAX_HTML_SIZE
} from '../../scripts/utils/security.js';

// Mock logging
vi.mock('../../scripts/utils/logging.js', () => ({
  logError: vi.fn(),
  logWarn: vi.fn()
}));

describe('security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidExternalUrl', () => {
    it('should return false for null or undefined', () => {
      expect(isValidExternalUrl(null)).toBe(false);
      expect(isValidExternalUrl(undefined)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidExternalUrl(123)).toBe(false);
      expect(isValidExternalUrl({})).toBe(false);
      expect(isValidExternalUrl([])).toBe(false);
    });

    it('should return true for valid HTTPS URL', () => {
      expect(isValidExternalUrl('https://example.com')).toBe(true);
      expect(isValidExternalUrl('https://example.com/path')).toBe(true);
      expect(isValidExternalUrl('https://example.com:443/path?query=1')).toBe(true);
    });

    it('should return true for valid HTTP URL', () => {
      expect(isValidExternalUrl('http://example.com')).toBe(true);
    });

    it('should return false for localhost', () => {
      expect(isValidExternalUrl('http://localhost')).toBe(false);
      expect(isValidExternalUrl('http://localhost:3000')).toBe(false);
      expect(isValidExternalUrl('https://localhost')).toBe(false);
    });

    it('should return false for 127.0.0.1', () => {
      expect(isValidExternalUrl('http://127.0.0.1')).toBe(false);
      expect(isValidExternalUrl('http://127.0.0.1:3000')).toBe(false);
      expect(isValidExternalUrl('http://127.1.1.1')).toBe(false);
    });

    it('should return false for 0.0.0.0', () => {
      expect(isValidExternalUrl('http://0.0.0.0')).toBe(false);
    });

    it('should return false for IPv6 localhost', () => {
      const result = isValidExternalUrl('http://[::1]');
      expect(result).toBe(false);
    });

    it('should return false for private network ranges', () => {
      expect(isValidExternalUrl('http://192.168.1.1')).toBe(false);
      expect(isValidExternalUrl('http://10.0.0.1')).toBe(false);
      expect(isValidExternalUrl('http://172.16.0.1')).toBe(false);
      expect(isValidExternalUrl('http://172.31.255.255')).toBe(false);
    });

    it('should return false for link-local addresses', () => {
      expect(isValidExternalUrl('http://169.254.1.1')).toBe(false);
    });

    it('should return false for non-HTTP(S) protocols', () => {
      expect(isValidExternalUrl('ftp://example.com')).toBe(false);
      expect(isValidExternalUrl('file:///path/to/file')).toBe(false);
      expect(isValidExternalUrl('javascript:alert(1)')).toBe(false);
      expect(isValidExternalUrl('data:text/html,<html>')).toBe(false);
    });

    it('should return false for invalid URL format', () => {
      expect(isValidExternalUrl('not a url')).toBe(false);
      expect(isValidExternalUrl('example.com')).toBe(false);
    });

    it('should be case-insensitive for hostname', () => {
      expect(isValidExternalUrl('http://LOCALHOST')).toBe(false);
      expect(isValidExternalUrl('http://EXAMPLE.COM')).toBe(true);
    });
  });

  describe('isValidMessageSize', () => {
    it('should return true for small data', () => {
      expect(isValidMessageSize({ small: 'data' })).toBe(true);
      expect(isValidMessageSize('small string')).toBe(true);
    });

    it('should return false for data exceeding MAX_MESSAGE_SIZE', () => {
      const largeData = { data: 'x'.repeat(MAX_MESSAGE_SIZE + 1) };
      expect(isValidMessageSize(largeData)).toBe(false);
    });

    it('should return true for data at MAX_MESSAGE_SIZE limit', () => {
      const data = { data: 'x'.repeat(MAX_MESSAGE_SIZE - 100) };
      expect(isValidMessageSize(data)).toBe(true);
    });

    it('should handle circular references gracefully', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      // Should not throw, but may return false due to JSON.stringify failure
      expect(() => isValidMessageSize(circular)).not.toThrow();
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"')).toBe('string');
      expect(safeJsonParse('123')).toBe(123);
    });

    it('should return default value for invalid JSON', () => {
      expect(safeJsonParse('invalid json', 'default')).toBe('default');
      expect(safeJsonParse('{invalid}', null)).toBe(null);
    });

    it('should return default value for null or undefined', () => {
      expect(safeJsonParse(null, 'default')).toBe('default');
      expect(safeJsonParse(undefined, 'default')).toBe('default');
    });

    it('should return default value for non-string input', () => {
      expect(safeJsonParse(123, 'default')).toBe('default');
      expect(safeJsonParse({}, 'default')).toBe('default');
    });

    it('should return null as default if not specified', () => {
      expect(safeJsonParse('invalid')).toBe(null);
    });
  });

  describe('sanitizeErrorForLogging', () => {
    it('should return non-object values as-is', () => {
      expect(sanitizeErrorForLogging(null)).toBe(null);
      expect(sanitizeErrorForLogging(undefined)).toBe(undefined);
      expect(sanitizeErrorForLogging('string')).toBe('string');
      expect(sanitizeErrorForLogging(123)).toBe(123);
    });

    it('should sanitize API keys in URL', () => {
      const error = {
        url: 'https://api.example.com?api_key=secret123&other=value'
      };
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized.url).toContain('api_key=***');
      expect(sanitized.url).not.toContain('secret123');
    });

    it('should sanitize tokens in URL', () => {
      const error = {
        url: 'https://api.example.com?token=secret123'
      };
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized.url).toContain('token=***');
    });

    it('should limit response string size', () => {
      const error = {
        response: 'x'.repeat(500)
      };
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized.response.length).toBeLessThanOrEqual(200);
    });

    it('should limit response object size', () => {
      const error = {
        response: { data: 'x'.repeat(500) }
      };
      const sanitized = sanitizeErrorForLogging(error);
      const responseStr = JSON.stringify(sanitized.response);
      // Allow small margin for JSON formatting
      expect(responseStr.length).toBeLessThanOrEqual(250);
    });

    it('should remove sensitive fields', () => {
      const error = {
        apiKey: 'secret',
        api_key: 'secret2',
        token: 'secret3',
        password: 'secret4',
        secret: 'secret5',
        other: 'safe'
      };
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized.apiKey).toBe('***');
      expect(sanitized.api_key).toBe('***');
      expect(sanitized.token).toBe('***');
      expect(sanitized.password).toBe('***');
      expect(sanitized.secret).toBe('***');
      expect(sanitized.other).toBe('safe');
    });

    it('should preserve other fields', () => {
      const error = {
        message: 'Error message',
        code: 500,
        stack: 'Stack trace'
      };
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized.message).toBe('Error message');
      expect(sanitized.code).toBe(500);
      expect(sanitized.stack).toBe('Stack trace');
    });
  });

  describe('sanitizeFilename', () => {
    it('should return "file" for null or undefined', () => {
      expect(sanitizeFilename(null)).toBe('file');
      expect(sanitizeFilename(undefined)).toBe('file');
    });

    it('should return "file" for non-string input', () => {
      expect(sanitizeFilename(123)).toBe('file');
      expect(sanitizeFilename({})).toBe('file');
    });

    it('should remove path traversal attempts', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd');
      expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('windowssystem32');
    });

    it('should remove invalid characters', () => {
      expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('filename');
      expect(sanitizeFilename('file<name>')).toBe('filename');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('file name')).toBe('file_name');
      expect(sanitizeFilename('file  name')).toBe('file_name');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeFilename('file___name')).toBe('file_name');
    });

    it('should remove leading/trailing underscores', () => {
      expect(sanitizeFilename('_filename_')).toBe('filename');
    });

    it('should remove leading/trailing dots', () => {
      expect(sanitizeFilename('.filename.')).toBe('filename');
    });

    it('should limit length to 200 characters', () => {
      const longName = 'x'.repeat(300);
      const sanitized = sanitizeFilename(longName);
      expect(sanitized.length).toBeLessThanOrEqual(200);
    });

    it('should remove control characters', () => {
      expect(sanitizeFilename('file\x00name')).not.toContain('\x00');
      expect(sanitizeFilename('file\nname')).not.toContain('\n');
      // Spaces are replaced with underscores, so newline becomes space then underscore
      expect(sanitizeFilename('file\nname')).toContain('file');
      expect(sanitizeFilename('file\nname')).toContain('name');
    });

    it('should return "file" if result is empty after sanitization', () => {
      expect(sanitizeFilename('...')).toBe('file');
      expect(sanitizeFilename('___')).toBe('file');
    });

    it('should preserve valid characters', () => {
      expect(sanitizeFilename('valid_filename-123')).toBe('valid_filename-123');
    });
  });
});

