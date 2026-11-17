// @ts-check
// Validation utilities for ClipAIble extension

import { DEFAULT_QWEN_TTS_MODEL, getQwenTtsEndpoint } from '../../api/tts-catalog.js';
import { setError, ERROR_CODES } from '../../state/processing.js';

/**
 * Validate API keys for audio generation
 * Checks if the required API key is present for the selected audio provider
 * Note: 'offline' provider doesn't require API key
 * 
 * @param {Partial<import('../../types.js').ProcessingData>} data - Processing data object
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive mechanism
 * @returns {Promise<boolean>} True if validation passed, false if failed
 * @throws {Error} If validation fails (error is set in state)
 */
export async function validateAudioApiKeys(data, stopKeepAlive) {
  // Only validate for audio format
  if ((data.outputFormat || 'pdf') !== 'audio') {
    return true;
  }
  
  const provider = data.audioProvider || 'openai';
  
  // Offline TTS doesn't require API key
  if (provider === 'offline') {
    return true;
  }

  let openaiKey;
  if (provider === 'openai') {
    try {
      openaiKey = (await chrome.storage.local.get(['openai_api_key'])).openai_api_key;
    } catch (error) {
      await setError({
        message: 'Could not read the OpenAI TTS API key. Please try again.',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive, data.processingRunId);
      return false;
    }
  }
  
  // Map of provider names to their API key fields and display names
  const providerConfig = {
    openai: {
      key: openaiKey,
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
    }, stopKeepAlive, data.processingRunId);
    return false;
  }
  
  if (!config.key) {
    await setError({
      message: `${config.name} API key is required for audio. Please add it in settings.`,
      code: ERROR_CODES.VALIDATION_ERROR
    }, stopKeepAlive, data.processingRunId);
    return false;
  }
  
  if (provider === 'qwen') {
    try {
      getQwenTtsEndpoint(data.qwenModel || DEFAULT_QWEN_TTS_MODEL, data.qwenWorkspaceId, data.qwenRegion);
    } catch (error) {
      await setError({ message: error.message, code: ERROR_CODES.VALIDATION_ERROR }, stopKeepAlive, data.processingRunId);
      return false;
    }
  }
  return true;
}





