// @ts-check
// Security utilities for ClipAIble extension

import { logError, logWarn } from '../logging.js';

/**
 * Maximum size for postMessage data (10MB)
 */
export const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum size for HTML content (50MB)
 */
export const MAX_HTML_SIZE = 50 * 1024 * 1024;

/**
 * Validate URL to prevent SSRF (Server-Side Request Forgery) attacks
 * Blocks internal addresses and non-HTTP(S) protocols
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe for external requests
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
    
    // Block localhost variants (IPv4 and IPv6)
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.startsWith('127.')) {
      logWarn('Blocked localhost URL', { hostname });
      return false;
    }
    
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      const address = hostname.slice(1, -1);
      const firstHextet = parseInt(address.split(':')[0], 16) || 0;

      // IPv6 unspecified, link-local (fe80::/10), and unique local (fc00::/7).
      if (address === '::' ||
          (firstHextet & 0xffc0) === 0xfe80 ||
          (firstHextet & 0xfe00) === 0xfc00) {
        logWarn('Blocked internal IPv6 URL', { hostname });
        return false;
      }

      // URL normalizes IPv4-mapped addresses to their hexadecimal form.
      const mapped = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);
        const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
        return isValidExternalUrl(`http://${ipv4}`);
      }
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
 * Validate message size to prevent DoS (Denial of Service) attacks
 * Checks if serialized JSON size exceeds maximum allowed size
 * @param {any} data - Data to validate
 * @returns {boolean} True if data size is acceptable (within MAX_MESSAGE_SIZE limit)
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
 * Safe JSON parse with error handling
 * Parses JSON string and returns default value if parsing fails
 * @param {string} str - JSON string to parse
 * @param {any} [defaultValue=null] - Default value if parsing fails
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
 * Sanitize stack trace to remove sensitive information (file paths, line numbers with tokens)
 * @param {string} stack - Stack trace string
 * @returns {string} Sanitized stack trace
 */
function sanitizeStackTrace(stack) {
  if (!stack || typeof stack !== 'string') {
    return stack;
  }
  
  // Remove file paths that might contain sensitive information
  // Keep function names and line numbers but remove full paths
  let sanitized = stack
    // Remove chrome-extension:// URLs (keep only filename)
    .replace(/chrome-extension:\/\/[^/]+\/([^:]+):(\d+):(\d+)/g, '$1:$2:$3')
    // Remove file:// URLs (keep only filename)
    .replace(/file:\/\/\/[^:]+:(\d+):(\d+)/g, '$1:$2')
    // Remove absolute paths (keep only filename)
    .replace(/\/[^:]+:(\d+):(\d+)/g, '$1:$2')
    // Remove query parameters from URLs in stack traces
    .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s]*/gi, '$1***');
  
  return sanitizeLogText(sanitized);
}

/** Redact credentials embedded in diagnostic text without removing context. */
export function sanitizeLogText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s]*/gi, '$1***')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ***')
    .replace(/(?:sk-(?:proj-|svcacct-|ant-|or-v1-)[A-Za-z0-9_-]+|\bsk[-_][A-Za-z0-9]+(?![A-Za-z0-9_-])|\bAIza[A-Za-z0-9_-]+|\bxai-[A-Za-z0-9_-]+|\bgh[pousr]_[A-Za-z0-9_]+|\bgithub_pat_[A-Za-z0-9_]+)\b/g, '***')
    .replace(/(\b(?:(?:[a-z][a-z0-9]*[_-])?api[_-]?key|access[_-]?token|token|password|secret|authorization)["']?\s*[:=]\s*)(?:(['"])[^'"\r\n]*\2|[^\s,;]+)/gi, '$1$2***$2');
}

/**
 * Sanitize error data for logging (remove sensitive information)
 * @param {any} error - Error object or data
 * @returns {any} Sanitized error data
 */
export function sanitizeErrorForLogging(error) {
  if (!error || typeof error !== 'object') {
    return sanitizeLogText(error);
  }
  
  const seen = new WeakSet();
  const sensitiveName = (name) => {
    const normalized = String(name).toLowerCase().replace(/[_-]/g, '');
    return normalized.endsWith('apikey') || ['token', 'accesstoken', 'password', 'secret', 'authorization', 'cookie', 'setcookie'].includes(normalized);
  };
  const copy = (value) => {
    if (!value || typeof value !== 'object') {
      return sanitizeLogText(value);
    }
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map(copy);
    const result = {};
    if (value instanceof Error) {
      result.message = copy(value.message);
      result.stack = sanitizeStackTrace(value.stack);
      result.name = copy(value.name);
    }
    for (const [key, item] of Object.entries(value)) {
      result[key] = sensitiveName(key) || (key === 'value' && sensitiveName(value.key)) ? '***' : copy(item);
    }
    return result;
  };
  const sanitized = copy(error);
  
  // Sanitize stack trace if present
  if (sanitized.stack && typeof sanitized.stack === 'string') {
    sanitized.stack = sanitizeStackTrace(sanitized.stack);
  }
  
  // Remove API keys from URL
  if (sanitized.url && typeof sanitized.url === 'string') {
    sanitized.url = sanitized.url.replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&]*/gi, '$1***');
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
  
  return sanitized;
}

/**
 * Sanitize filename to prevent path traversal and invalid characters
 * Removes path traversal attempts (../), invalid characters, and limits length
 * @param {string} name - Raw filename (without extension)
 * @returns {string} Sanitized filename safe for download (max 200 characters)
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') {
    return 'file';
  }
  
  // Remove path traversal attempts (../, ..\, etc.)
  let sanitized = name
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove controls before empty-name checks
    .replace(/\.\./g, '')           // Remove .. sequences
    .replace(/[<>:"/\\|?*]/g, '')   // Remove invalid characters for Windows/Unix
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')          // Remove leading/trailing underscores
    .replace(/^\.+|[. ]+$/g, '')
    .substring(0, 200)
    .replace(/[\uD800-\uDBFF]$/, '')
    .replace(/[. ]+$/g, '');
  
  // Ensure filename is not empty after sanitization
  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'file';
  }
  
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(sanitized)) sanitized = '_' + sanitized;
  
  return sanitized;
}

