// @ts-check
// Security utilities for ClipAIble extension

import { logError, logWarn } from './logging.js';

/**
 * Maximum size for postMessage data (10MB)
 */
export const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum size for HTML content (50MB)
 */
export const MAX_HTML_SIZE = 50 * 1024 * 1024;

/**
 * Validate URL to prevent SSRF attacks
 * Blocks internal addresses and non-HTTP(S) protocols
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe
 */
export function isValidExternalUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    
    // Block non-HTTP(S) protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      logWarn('Invalid URL protocol', { protocol: urlObj.protocol });
      return false;
    }
    
    // Block internal/localhost addresses
    const hostname = urlObj.hostname.toLowerCase();
    
    // Block localhost variants
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.startsWith('127.')) {
      logWarn('Blocked localhost URL', { hostname });
      return false;
    }
    
    // Block private network ranges
    if (hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') ||
        hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') ||
        hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') ||
        hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') ||
        hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') ||
        hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') ||
        hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') ||
        hostname.startsWith('172.31.')) {
      logWarn('Blocked private network URL', { hostname });
      return false;
    }
    
    // Block link-local addresses
    if (hostname.startsWith('169.254.')) {
      logWarn('Blocked link-local URL', { hostname });
      return false;
    }
    
    return true;
  } catch (e) {
    logWarn('Invalid URL format', { url: url.substring(0, 100), error: e.message });
    return false;
  }
}

/**
 * Validate message size to prevent DoS attacks
 * @param {any} data - Data to validate
 * @returns {boolean} True if data size is acceptable
 */
export function isValidMessageSize(data) {
  try {
    const size = JSON.stringify(data).length;
    if (size > MAX_MESSAGE_SIZE) {
      logWarn('Message too large', { size, maxSize: MAX_MESSAGE_SIZE });
      return false;
    }
    return true;
  } catch (e) {
    logError('Failed to validate message size', e);
    return false;
  }
}

/**
 * Sanitize text to prevent prompt injection attacks
 * Removes common injection patterns from user content
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizePromptInput(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove common injection patterns (case-insensitive)
  let sanitized = text
    // Direct instruction overrides
    .replace(/ignore\s+previous\s+instructions/gi, '')
    .replace(/forget\s+everything\s+above/gi, '')
    .replace(/forget\s+all\s+previous/gi, '')
    .replace(/disregard\s+previous/gi, '')
    .replace(/new\s+instructions?:/gi, '')
    .replace(/override\s+instructions/gi, '')
    // System role attempts
    .replace(/system\s*:/gi, '')
    .replace(/assistant\s*:/gi, '')
    .replace(/user\s*:/gi, '')
    // JSON/structured data injection attempts
    .replace(/```json\s*\{[\s\S]*?"instructions"[\s\S]*?\}```/gi, '')
    .replace(/<instructions>[\s\S]*?<\/instructions>/gi, '')
    // Base64/encoded injection attempts (common pattern)
    .replace(/base64[:\s]+[A-Za-z0-9+\/]{50,}/gi, '')
    // Multiple newlines (could hide instructions)
    .replace(/\n{10,}/g, '\n\n');
  
  return sanitized.trim();
}

/**
 * Safe JSON parse with error handling
 * @param {string} str - JSON string to parse
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} Parsed object or default value
 */
export function safeJsonParse(str, defaultValue = null) {
  if (!str || typeof str !== 'string') {
    return defaultValue;
  }
  
  try {
    return JSON.parse(str);
  } catch (e) {
    logError('JSON parse failed', { 
      error: e.message, 
      preview: str.substring(0, 200) 
    });
    return defaultValue;
  }
}

/**
 * Sanitize error data for logging (remove sensitive information)
 * @param {any} error - Error object or data
 * @returns {any} Sanitized error data
 */
export function sanitizeErrorForLogging(error) {
  if (!error || typeof error !== 'object') {
    return error;
  }
  
  const sanitized = { ...error };
  
  // Remove API keys from URL
  if (sanitized.url && typeof sanitized.url === 'string') {
    sanitized.url = sanitized.url.replace(/[?&](key|api_key|apikey|token|access_token)=[^&]*/gi, '$1=***');
  }
  
  // Limit response size
  if (sanitized.response) {
    if (typeof sanitized.response === 'string') {
      sanitized.response = sanitized.response.substring(0, 200);
    } else if (typeof sanitized.response === 'object') {
      const responseStr = JSON.stringify(sanitized.response);
      sanitized.response = responseStr.substring(0, 200);
    }
  }
  
  // Remove sensitive fields
  const sensitiveFields = ['apiKey', 'api_key', 'apikey', 'token', 'access_token', 'password', 'secret'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***';
    }
  }
  
  return sanitized;
}

/**
 * Sanitize filename to prevent path traversal and invalid characters
 * @param {string} name - Raw filename (without extension)
 * @returns {string} Sanitized filename safe for download
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') {
    return 'file';
  }
  
  // Remove path traversal attempts (../, ..\, etc.)
  let sanitized = name
    .replace(/\.\./g, '')           // Remove .. sequences
    .replace(/[<>:"/\\|?*]/g, '')   // Remove invalid characters for Windows/Unix
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')          // Remove leading/trailing underscores
    .replace(/^\.|\.$/g, '')        // Remove leading/trailing dots
    .substring(0, 200);             // Limit length (longer than before to allow more descriptive names)
  
  // Ensure filename is not empty after sanitization
  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'file';
  }
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}

