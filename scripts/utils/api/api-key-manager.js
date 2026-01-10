// TTS API key management utility
// Handles decryption and validation of TTS provider API keys

// @ts-check

import { decryptApiKey } from '../security/encryption.js';
import { getUILanguage, tSync } from '../../locales.js';
import { log, logError } from '../logging.js';
import { getProviderApiKey } from '../storage/settings-helpers.js';

/**
 * TTS API key manager
 * Handles decryption and validation of API keys for different TTS providers
 */
export class TTSApiKeyManager {
  /**
   * Get decrypted API key for TTS provider
   * @param {string} provider - TTS provider ('openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'offline')
   * @param {Partial<import('../../types.js').ProcessingData>} data - Processing data object with API keys
   * @returns {Promise<string|null>} Decrypted API key or null for offline provider
   * @throws {Error} If API key is missing for non-offline provider
   * @throws {Error} If decryption fails
   * @throws {Error} If API key is required but missing or invalid
   */
  static async getDecryptedKey(provider, data) {
    // For OpenAI TTS, get OpenAI key from settings, not from data.apiKey (which may be from another AI provider)
    let openaiKey = null;
    if (provider === 'openai') {
      try {
        const settings = await chrome.storage.local.get(['openai_api_key']);
        openaiKey = settings.openai_api_key || null;
      } catch (error) {
        logError('Failed to get OpenAI API key from settings for TTS', error);
      }
    }
    
    const config = {
      'elevenlabs': { key: data.elevenlabsApiKey, name: 'ElevenLabs' },
      'qwen': { key: data.qwenApiKey, name: 'Qwen' },
      'respeecher': { key: data.respeecherApiKey, name: 'Respeecher' },
      'google': { key: data.googleTtsApiKey, name: 'GoogleTTS' },
      'openai': { key: openaiKey, name: 'OpenAI' }, // Always use OpenAI key from settings, not data.apiKey
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

