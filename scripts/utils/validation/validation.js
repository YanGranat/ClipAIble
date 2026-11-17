// @ts-check
// Validation utilities for ClipAIble extension

import { DEFAULT_QWEN_TTS_MODEL, getQwenTtsEndpoint, OPENAI_TTS_VOICES, DEFAULT_OPENAI_TTS_VOICE } from '../../api/tts-catalog.js';
import { setError, ERROR_CODES } from '../../state/processing.js';
import { getUILanguage, tSync } from '../../locales.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, IMAGE_TRANSLATION_PROVIDERS, getImageTranslationApiKey, isImageTranslationEnabled } from '../../api/image-translation-catalog.js';
import { isMaskedKey } from '../encryption.js';

/** Validate image translation settings before article processing. */
export async function validateImageTranslation(data, stopKeepAlive) {
  if (!isImageTranslationEnabled(data)) return true;
  const provider = data.imageTranslationProvider ?? DEFAULT_IMAGE_TRANSLATION_PROVIDER;
  let key, params;
  if (!IMAGE_TRANSLATION_PROVIDERS.includes(provider)) {
    key = 'errorImageProviderUnsupported'; params = { provider: String(provider) };
  } else {
    const apiKey = getImageTranslationApiKey(data);
    if (typeof apiKey === 'string' && apiKey.trim() && !isMaskedKey(apiKey.trim())) return true;
    key = 'errorImageKeyRequired'; params = { provider: provider === 'openai' ? 'OpenAI' : 'Google' };
  }
  const language = await getUILanguage();
  await setError({ message: tSync(key, language, params), code: ERROR_CODES.VALIDATION_ERROR,
    translationKey: key, translationParams: params }, stopKeepAlive, data.processingRunId);
  return false;
}

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

  const language = await getUILanguage();
  const fail = async (key, params = {}) => {
    await setError({ message: tSync(key, language, params), code: ERROR_CODES.VALIDATION_ERROR,
      translationKey: key, translationParams: params }, stopKeepAlive, data.processingRunId);
    return false;
  };
  if (provider === 'openai') {
    const voice = data.audioVoice === undefined ? DEFAULT_OPENAI_TTS_VOICE : data.audioVoice;
    if (!OPENAI_TTS_VOICES.includes(voice)) return fail('errorOpenaiVoiceUnavailable', { voice: String(voice) });
  }

  let openaiKey;
  if (provider === 'openai') {
    try {
      openaiKey = (await chrome.storage.local.get(['openai_api_key'])).openai_api_key;
    } catch (error) {
      return fail('errorAudioKeyRead');
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
  
  const config = Object.hasOwn(providerConfig, provider) ? providerConfig[provider] : null;
  
  if (!config) {
    return fail('errorUnknownAudioProvider', { provider });
  }
  
  if (!config.key) {
    return fail('errorAudioApiKeyRequired', { provider: config.name });
  }
  
  if (provider === 'qwen') {
    try {
      getQwenTtsEndpoint(data.qwenModel || DEFAULT_QWEN_TTS_MODEL, data.qwenWorkspaceId, data.qwenRegion);
    } catch (error) {
      return fail(error.translationKey, error.translationParams);
    }
  }
  return true;
}





