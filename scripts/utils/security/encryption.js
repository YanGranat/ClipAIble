// @ts-check
// Encryption utilities for API keys
// Uses Web Crypto API for secure encryption

/**
 * @typedef {import('../../types.js').AIProvider} AIProvider
 */

import { log, logError, logWarn } from '../logging.js';
import { getProcessingState } from '../../state/processing.js';
import { getInstallationKey } from './key-store.js';

// Cache for encryption key to avoid regenerating
let cachedEncryptionKey = null;

// Cache for decrypted API keys (in-memory, per-provider, cleared after processing)
// Security: Keys are only cached during processing, cleared on resetState()
// Additional security: Auto-clear cache after 10 minutes of inactivity
// Maximum security: Force clear after 30 minutes regardless of processing state
const decryptedKeyCache = new Map(); // provider:ciphertext -> decryptedKey
let cacheClearTimeout = null;
let cacheStartTime = null; // Track when cache was first populated
const CACHE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - normal timeout
const MAX_CACHE_TIME_MS = 30 * 60 * 1000; // 30 minutes - maximum time keys can stay in memory

/** Serialize API key storage transactions across extension pages and workers. */
export function withApiKeyStorageLock(operation) {
  return navigator.locks.request('clipaible-api-key-storage', operation);
}

/** Persist validated API key settings without racing startup migration. */
export function saveApiKeySettings(values, keysToRemove = []) {
  return withApiKeyStorageLock(async () => {
    if (Object.keys(values).length) await chrome.storage.local.set(values);
    if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove);
  });
}

/** Remove a corrupt value only while it still matches the inspected snapshot. */
export function removeApiKeyIfUnchanged(storageKey, expectedValue) {
  return withApiKeyStorageLock(async () => {
    const stored = await chrome.storage.local.get(storageKey);
    if (stored[storageKey] === expectedValue) await chrome.storage.local.remove(storageKey);
  });
}

/**
 * Recreate the key needed to read legacy stored values.
 * @returns {Promise<CryptoKey>} Encryption key
 */
async function getLegacyEncryptionKey() {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  try {
    // Use extension runtime ID as base material
    const runtimeId = chrome.runtime.id || 'clipaible-default';
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(runtimeId),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive key using PBKDF2
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('clipaible-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    cachedEncryptionKey = key;
    return key;
  } catch (error) {
    logError('Failed to generate encryption key', error);
    throw new Error('Encryption key generation failed');
  }
}

/**
 * Encryption prefix marker for better validation
 * @readonly
 * @const {string}
 */
const ENCRYPTION_PREFIX = 'ENC:';
const CURRENT_ENCRYPTION_PREFIX = 'ENC:v2:';

/**
 * Check if string is encrypted (base64 format with specific pattern)
 * Supports both new format (with ENC: prefix) and old format (backward compatibility)
 * @param {string} value - Value to check
 * @returns {boolean} True if encrypted
 */
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  
  // New format: check for ENC: prefix
  if (value.startsWith(ENCRYPTION_PREFIX)) {
    const base64Part = value.substring(value.startsWith(CURRENT_ENCRYPTION_PREFIX) ? CURRENT_ENCRYPTION_PREFIX.length : ENCRYPTION_PREFIX.length);
    return /^[A-Za-z0-9+/=]{40,}$/.test(base64Part);
  }
  
  // Old format (backward compatibility): check for base64 pattern and minimum length
  // Encrypted values are base64 strings, typically longer than plain API keys
  return /^[A-Za-z0-9+/=]{50,}$/.test(value) && value.length > 50;
}

/**
 * Encrypt API key
 * @param {string} plaintext - Plain text API key
 * @returns {Promise<string>} Base64 encoded encrypted string
 */
export async function encryptApiKey(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Invalid plaintext for encryption');
  }

  if (plaintext.startsWith(CURRENT_ENCRYPTION_PREFIX)) {
    await decryptStoredValue(plaintext);
    return plaintext;
  }
  if (plaintext.startsWith(ENCRYPTION_PREFIX)) {
    plaintext = await decryptStoredValue(plaintext);
  }

  // A legacy ciphertext has no marker. Authenticate it before treating a
  // base64-shaped API key as encrypted.
  if (isEncrypted(plaintext)) {
    try {
      plaintext = await decryptStoredValue(plaintext);
    } catch {
      // Unmarked values that cannot be authenticated are plaintext keys.
    }
  }

  try {
    const key = await getInstallationKey(true);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64 for storage
    const base64 = btoa(String.fromCharCode(...combined));
    // Add prefix marker for better validation
    return CURRENT_ENCRYPTION_PREFIX + base64;
  } catch (error) {
    logError('Encryption failed', error);
    throw new Error(`Failed to encrypt API key: ${error.message}`);
  }
}

/**
 * Authenticate and decrypt a stored ciphertext, including the legacy format.
 * @param {string} value - Stored ciphertext
 * @returns {Promise<string>} Plaintext
 */
async function decryptStoredValue(value) {
  const current = value.startsWith(CURRENT_ENCRYPTION_PREFIX);
  const key = current ? await getInstallationKey(false) : await getLegacyEncryptionKey();
  const base64Data = current ? value.substring(CURRENT_ENCRYPTION_PREFIX.length)
    : value.startsWith(ENCRYPTION_PREFIX) ? value.substring(ENCRYPTION_PREFIX.length) : value;
  const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    key,
    combined.slice(12)
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt API key
 * @param {string} encryptedBase64 - Base64 encoded encrypted string
 * @returns {Promise<string>} Decrypted plain text API key
 */
export async function decryptApiKey(encryptedBase64) {
  if (!encryptedBase64 || typeof encryptedBase64 !== 'string') {
    throw new Error('Invalid encrypted value for decryption');
  }

  // If not encrypted (plain text), return as is (for backward compatibility)
  if (!encryptedBase64.startsWith(ENCRYPTION_PREFIX) && !isEncrypted(encryptedBase64)) {
    logWarn('API key appears to be plain text, returning as is');
    return encryptedBase64;
  }

  try {
    return await decryptStoredValue(encryptedBase64);
  } catch (error) {
    logError('Decryption failed', error);
    // Unmarked legacy keys may also be genuine base64-shaped provider keys.
    if (!encryptedBase64.startsWith(ENCRYPTION_PREFIX)) return encryptedBase64;
    throw new Error('Stored API key could not be decrypted');
  }
}

/**
 * Get decrypted API key with caching (per-provider)
 * Cache is cleared after processing to ensure security
 * @param {string} encryptedKey - Encrypted API key (or plain text for backward compatibility)
 * @param {AIProvider} provider - Provider name
 * @returns {Promise<string>} Decrypted API key
 */
export async function getDecryptedKeyCached(encryptedKey, provider) {
  if (!encryptedKey || !provider) {
    throw new Error('Invalid parameters for getDecryptedKeyCached');
  }
  
  const cacheKey = `${provider}:${encryptedKey}`;
  if (decryptedKeyCache.has(cacheKey)) {
    log('Using cached decrypted key', { provider });
    return decryptedKeyCache.get(cacheKey);
  }
  
  // Decrypt and cache
  let decrypted;
  try {
    decrypted = await decryptApiKey(encryptedKey);
    
    // Valid decryption - cache the result
    decryptedKeyCache.set(cacheKey, decrypted);
    
    // Track cache start time for maximum timeout enforcement
    if (cacheStartTime === null) {
      cacheStartTime = Date.now();
    }
    
    log('Decrypted key cached', { provider });
    
    // Schedule automatic cache clear after timeout (security: prevent keys from staying in memory too long)
    scheduleCacheClear();
  } catch (error) {
    // SECURITY: If decryption throws an error, clear cache entry for this key
    logError('Decryption error, clearing cache entry', { provider, error: error.message });
    decryptedKeyCache.delete(cacheKey);
    // Re-throw to let caller handle the error
    throw error;
  }
  
  return decrypted;
}

/**
 * Schedule automatic cache clear after timeout
 * Security: Ensures keys don't remain in memory indefinitely
 * Important: For long operations (>10 min), cache is cleared after max timeout (30 min) regardless of processing state
 */
function scheduleCacheClear() {
  // Clear existing timeout
  if (cacheClearTimeout) {
    clearTimeout(cacheClearTimeout);
  }
  
  // Schedule new timeout
  cacheClearTimeout = setTimeout(() => {
    const processingState = getProcessingState();
    const cacheAge = cacheStartTime ? (Date.now() - cacheStartTime) : 0;
    
    // SECURITY: Force clear cache after maximum time, even if processing is active
    // This prevents keys from staying in memory indefinitely during very long operations
    // IMPORTANT: Keys will be re-decrypted on next use - this does NOT break processing
    if (cacheAge >= MAX_CACHE_TIME_MS) {
      logWarn('Decrypted key cache maximum time reached, forcing clear for security (even during processing)', {
        cacheAge,
        maxTime: MAX_CACHE_TIME_MS,
        isProcessing: processingState.isProcessing
      });
      clearDecryptedKeyCache();
      cacheClearTimeout = null;
      // NOTE: scheduleCacheClear() will be called again on next getDecryptedKeyCached() call
      // This ensures continuous protection for very long operations (5+ hours)
      return;
    }
    
    // Normal timeout: Check if processing is active - don't clear cache during active processing
    if (processingState.isProcessing) {
      // Processing is active - reschedule cache clear (don't interrupt long operations)
      log('Cache clear postponed - processing is active', { 
        status: processingState.status,
        progress: processingState.progress,
        cacheAge
      });
      scheduleCacheClear(); // Reschedule for another timeout period
      return;
    }
    
    // Processing is not active - safe to clear cache
    if (decryptedKeyCache.size > 0) {
      logWarn('Decrypted key cache timeout reached, clearing for security');
      clearDecryptedKeyCache();
    }
    cacheClearTimeout = null;
  }, CACHE_TIMEOUT_MS);
}

/**
 * Clear decrypted key cache (called after processing completes)
 * Security: Ensures keys don't remain in memory
 * Also called on service worker restart to ensure clean state
 */
export function clearDecryptedKeyCache() {
  const cacheSize = decryptedKeyCache.size;
  decryptedKeyCache.clear();
  
  // Reset cache start time
  cacheStartTime = null;
  
  // Clear timeout if exists
  if (cacheClearTimeout) {
    clearTimeout(cacheClearTimeout);
    cacheClearTimeout = null;
  }
  
  log('Decrypted key cache cleared', { clearedKeys: cacheSize });
}

/**
 * Mask API key for display (shows only last 4 characters)
 * Uses asterisks (*) for ASCII compatibility
 * Shows more asterisks for longer keys to better represent typical API key length
 * @param {string} key - API key (encrypted or plain)
 * @returns {string} Masked key (e.g., "************abcd" for long keys)
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '************';
  if (key.length <= 4) return '************';
  
  // For typical API keys (20-60 chars), show 12-16 asterisks
  // This gives better visual representation of key length
  const asteriskCount = Math.min(Math.max(12, Math.floor(key.length * 0.3)), 20);
  return '*'.repeat(asteriskCount) + key.slice(-4);
}

/**
 * Check if value is a masked key (starts with mask pattern)
 * @param {string} value - Value to check
 * @returns {boolean} True if masked
 */
export function isMaskedKey(value) {
  if (!value || typeof value !== 'string') return false;
  // Check for both old (••••) and new (****) mask patterns
  // Also check for longer mask patterns (12+ asterisks)
  return value.startsWith('****') || value.startsWith('••••') || /^\*{12,}/.test(value);
}
