// Encryption utilities for API keys
// Uses Web Crypto API for secure encryption

import { log, logError, logWarn } from './logging.js';

// Cache for encryption key to avoid regenerating
let cachedEncryptionKey = null;

/**
 * Get or generate encryption key based on extension ID
 * Uses PBKDF2 to derive a key from extension runtime ID
 * @returns {Promise<CryptoKey>} Encryption key
 */
async function getEncryptionKey() {
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
 * Check if string is encrypted (base64 format with specific pattern)
 * @param {string} value - Value to check
 * @returns {boolean} True if encrypted
 */
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  // Encrypted values are base64 strings, typically longer than plain API keys
  // Check for base64 pattern and minimum length
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

  // If already encrypted, return as is
  if (isEncrypted(plaintext)) {
    log('API key already encrypted, skipping');
    return plaintext;
  }

  try {
    const key = await getEncryptionKey();
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
    log('API key encrypted successfully');
    return base64;
  } catch (error) {
    logError('Encryption failed', error);
    throw new Error(`Failed to encrypt API key: ${error.message}`);
  }
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
  if (!isEncrypted(encryptedBase64)) {
    logWarn('API key appears to be plain text, returning as is');
    return encryptedBase64;
  }

  try {
    const key = await getEncryptionKey();
    
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    // Extract IV (first 12 bytes) and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    const plaintext = new TextDecoder().decode(decrypted);
    log('API key decrypted successfully');
    return plaintext;
  } catch (error) {
    logError('Decryption failed', error);
    // If decryption fails, try returning as plain text (for migration)
    logWarn('Decryption failed, returning as plain text (may be unencrypted key)');
    return encryptedBase64;
  }
}

/**
 * Mask API key for display (shows only last 4 characters)
 * Uses asterisks (*) for ASCII compatibility
 * @param {string} key - API key (encrypted or plain)
 * @returns {string} Masked key (e.g., "****abcd")
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '****';
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

/**
 * Check if value is a masked key (starts with mask pattern)
 * @param {string} value - Value to check
 * @returns {boolean} True if masked
 */
export function isMaskedKey(value) {
  if (!value || typeof value !== 'string') return false;
  // Check for both old (••••) and new (****) mask patterns
  return value.startsWith('****') || value.startsWith('••••');
}
