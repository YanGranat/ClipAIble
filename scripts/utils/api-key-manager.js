// TTS API key management utility
// Handles decryption and validation of TTS provider API keys

// @ts-check

import { decryptApiKey } from './encryption.js';
import { getUILanguage, tSync } from '../locales.js';
import { log, logError } from './logging.js';

/**
 * TTS API key manager
 * Handles decryption and validation of API keys for different TTS providers
 */
export class TTSApiKeyManager {
  /**
   * Get decrypted API key for TTS provider
   * @param {string} provider - TTS provider ('openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'offline')
   * @param {Object} data - Processing data object with API keys
   * @param {string} [data.apiKey] - OpenAI API key
   * @param {string} [data.elevenlabsApiKey] - ElevenLabs API key
   * @param {string} [data.qwenApiKey] - Qwen API key
   * @param {string} [data.respeecherApiKey] - Respeecher API key
   * @param {string} [data.googleTtsApiKey] - Google TTS API key
   * @returns {Promise<string|null>} Decrypted API key or null for offline provider
   * @throws {Error} If API key is required but missing or invalid
   */
  static async getDecryptedKey(provider, data) {
    const config = {
      'elevenlabs': { key: data.elevenlabsApiKey, name: 'ElevenLabs' },
      'qwen': { key: data.qwenApiKey, name: 'Qwen' },
      'respeecher': { key: data.respeecherApiKey, name: 'Respeecher' },
      'google': { key: data.googleTtsApiKey, name: 'GoogleTTS' },
      'openai': { key: data.apiKey, name: 'OpenAI' },
      'offline': { key: null, name: 'Offline' }
    };
    
    const providerConfig = config[provider];
    if (!providerConfig) {
      throw new Error(`Unknown TTS provider: ${provider}`);
    }
    
    // Offline provider doesn't need API key
    if (provider === 'offline') {
      return null;
    }
    
    // Check if API key is provided
    if (!providerConfig.key) {
      const uiLang = await getUILanguage();
      throw new Error(tSync(`error${providerConfig.name}KeyRequired`, uiLang));
    }
    
    // Decrypt API key
    try {
      const decrypted = await decryptApiKey(providerConfig.key);
      // Security: Log only metadata, never the actual key or prefix
      log(`${providerConfig.name} API key decrypted`, { 
        keyLength: decrypted?.length || 0,
        isAscii: /^[\x00-\x7F]*$/.test(decrypted || '')
      });
      return decrypted;
    } catch (error) {
      logError(`Failed to decrypt ${providerConfig.name} API key`, error);
      const uiLang = await getUILanguage();
      throw new Error(tSync(`error${providerConfig.name}KeyInvalid`, uiLang));
    }
  }
}

