// Settings helper utilities for ClipAIble extension
// Provides common functions for working with settings from storage

// @ts-check

import { CONFIG } from './config.js';
import { getProviderFromModel } from '../api/index.js';
import { decryptApiKey } from './encryption.js';
import { VoiceValidator } from './voice-validator.js';
import { log, logDebug, logWarn } from './logging.js';

/**
 * Determine provider and model from settings
 * @param {Record<string, any>} settings - Settings object from storage
 * @returns {{provider: string, model: string}} Provider and model
 */
export function determineProviderAndModel(settings) {
  // Determine provider: use api_provider from settings, fallback to getProviderFromModel
  let provider = settings.api_provider || 'openai';
  
  // Determine model: use model_by_provider for selected provider, fallback to openai_model
  let model = 'gpt-5.1'; // Default fallback
  if (settings.model_by_provider && typeof settings.model_by_provider === 'object' && settings.model_by_provider[provider]) {
    model = String(settings.model_by_provider[provider]);
  } else if (settings.openai_model) {
    model = String(settings.openai_model);
    // If using openai_model, verify provider matches
    const modelProvider = getProviderFromModel(model);
    if (modelProvider !== provider) {
      // Provider mismatch - use model's provider
      provider = modelProvider;
    }
  }
  
  return { provider, model };
}

/**
 * Get API key for provider from settings
 * @param {string} provider - Provider name
 * @param {Record<string, any>} settings - Settings object from storage
 * @returns {string|null} Encrypted API key or null
 */
export function getProviderApiKey(provider, settings) {
  const keyMap = {
    'openai': settings.openai_api_key,
    'claude': settings.claude_api_key,
    'gemini': settings.gemini_api_key,
    'grok': settings.grok_api_key,
    'openrouter': settings.openrouter_api_key
  };
  
  return keyMap[provider] || null;
}

/**
 * Decrypt API key for provider from settings
 * @param {string} provider - Provider name
 * @param {Record<string, any>} settings - Settings object from storage
 * @returns {Promise<string>} Decrypted API key
 * @throws {Error} If decryption fails
 */
export async function getDecryptedProviderApiKey(provider, settings) {
  const encryptedKey = getProviderApiKey(provider, settings);
  
  if (!encryptedKey || typeof encryptedKey !== 'string') {
    throw new Error(`No API key configured for provider: ${provider}`);
  }
  
  try {
    return await decryptApiKey(encryptedKey);
  } catch (error) {
    throw new Error(`Failed to decrypt ${provider} API key: ${error.message}`);
  }
}

/**
 * Get voice from settings for audio provider
 * @param {string} audioProvider - Audio provider name
 * @param {Record<string, any>} settings - Settings object from storage
 * @returns {string} Voice string
 */
export function getVoiceFromSettings(audioProvider, settings) {
  const provider = String(audioProvider || 'openai');
  
  // CRITICAL: Log all voice-related settings for debugging
  log('[ClipAIble Background] CRITICAL: Voice selection from settings', {
    provider,
    audio_provider: settings.audio_provider,
    audio_voice_map: settings.audio_voice_map,
    audio_voice_map_type: typeof settings.audio_voice_map,
    audio_voice_map_keys: settings.audio_voice_map ? Object.keys(settings.audio_voice_map) : [],
    audio_voice: settings.audio_voice,
    audio_voice_type: typeof settings.audio_voice,
    google_tts_voice: settings.google_tts_voice,
    DEFAULT_AUDIO_VOICE: CONFIG.DEFAULT_AUDIO_VOICE
  });
  
  if (provider === 'google') {
    // Google TTS has its own voice setting
    const googleVoice = String(settings.google_tts_voice || 'Callirrhoe');
    logDebug('[ClipAIble Background] Using Google TTS voice', { googleVoice });
    return googleVoice;
  }
  
  // CRITICAL: Check if audio_voice_map has 'current' property (new format)
  // or is a direct map (old format)
  let voiceMap = {};
  if (settings.audio_voice_map && typeof settings.audio_voice_map === 'object') {
    // Check if it's the new format with 'current' property
    if ('current' in settings.audio_voice_map && typeof settings.audio_voice_map.current === 'object') {
      voiceMap = settings.audio_voice_map.current;
      logDebug('[ClipAIble Background] Using audio_voice_map.current (new format)', {
        voiceMap,
        voiceMapKeys: Object.keys(voiceMap)
      });
    } else {
      // Old format: direct map
      voiceMap = settings.audio_voice_map;
      logDebug('[ClipAIble Background] Using audio_voice_map directly (old format)', {
        voiceMap,
        voiceMapKeys: Object.keys(voiceMap)
      });
    }
  }
  
  let selectedVoice = voiceMap[provider] || settings.audio_voice || CONFIG.DEFAULT_AUDIO_VOICE;
  let finalVoice = String(selectedVoice);
  
  // Use VoiceValidator for validation
  finalVoice = VoiceValidator.validate(provider, finalVoice, settings.google_tts_voice, CONFIG.DEFAULT_AUDIO_VOICE);
  
  log('[ClipAIble Background] CRITICAL: Final voice selected from storage', {
    timestamp: Date.now(),
    provider,
    voiceMap,
    voiceMapProviderValue: voiceMap[provider],
    audio_voice: settings.audio_voice,
    selectedVoice,
    finalVoice,
    finalVoiceType: typeof finalVoice,
    finalVoiceString: String(finalVoice),
    isValidFormat: finalVoice && (finalVoice.includes('_') || finalVoice.includes('-')),
    source: voiceMap[provider] ? 'voiceMap' : (settings.audio_voice ? 'audio_voice' : 'DEFAULT'),
    VOICE_STRING: `VOICE="${String(finalVoice)}"`, // Explicit string for visibility
    willBePassedToTTS: true,
    storageLocation: 'getVoiceFromSettings'
  });
  
  return finalVoice;
}

/**
 * Get audio speed from settings
 * @param {Record<string, any>} settings - Settings object from storage
 * @returns {number} Audio speed (default: CONFIG.DEFAULT_AUDIO_SPEED)
 */
export function getAudioSpeedFromSettings(settings) {
  const audioSpeed = settings.audio_speed;
  const speedStr = audioSpeed && typeof audioSpeed === 'string' ? audioSpeed : String(CONFIG.DEFAULT_AUDIO_SPEED);
  const speed = parseFloat(speedStr);
  return isNaN(speed) ? CONFIG.DEFAULT_AUDIO_SPEED : speed;
}



