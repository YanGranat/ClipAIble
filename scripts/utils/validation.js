// Validation utilities for ClipAIble extension

import { setError, ERROR_CODES } from '../state/processing.js';

/**
 * Validate API keys for audio generation
 * Checks if the required API key is present for the selected audio provider
 * 
 * @param {Object} data - Processing data object
 * @param {string} data.outputFormat - Output format ('audio' or other)
 * @param {string} data.audioProvider - Audio provider ('openai', 'elevenlabs', 'qwen', 'respeecher', 'google')
 * @param {string} [data.apiKey] - OpenAI API key
 * @param {string} [data.elevenlabsApiKey] - ElevenLabs API key
 * @param {string} [data.qwenApiKey] - Qwen API key
 * @param {string} [data.respeecherApiKey] - Respeecher API key
 * @param {string} [data.googleTtsApiKey] - Google TTS API key
 * @param {Function} stopKeepAlive - Function to stop keep-alive mechanism
 * @returns {Promise<boolean>} true if validation passed, false if failed
 */
export async function validateAudioApiKeys(data, stopKeepAlive) {
  // Only validate for audio format
  if ((data.outputFormat || 'pdf') !== 'audio') {
    return true;
  }
  
  const provider = data.audioProvider || 'openai';
  
  // Map of provider names to their API key fields and display names
  const providerConfig = {
    openai: {
      key: data.apiKey,
      name: 'OpenAI'
    },
    elevenlabs: {
      key: data.elevenlabsApiKey,
      name: 'ElevenLabs'
    },
    qwen: {
      key: data.qwenApiKey,
      name: 'Qwen'
    },
    respeecher: {
      key: data.respeecherApiKey,
      name: 'Respeecher'
    },
    google: {
      key: data.googleTtsApiKey,
      name: 'Google TTS'
    }
  };
  
  const config = providerConfig[provider];
  
  if (!config) {
    await setError({
      message: `Unknown audio provider: ${provider}`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive);
    return false;
  }
  
  if (!config.key) {
    await setError({
      message: `${config.name} API key is required for audio. Please add it in settings.`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive);
    return false;
  }
  
  return true;
}




