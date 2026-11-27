// Voice validation utility for TTS providers
// Validates and normalizes voice parameters for different TTS providers

// @ts-check

import { CONFIG } from '../config.js';
import { logWarn } from '../logging.js';
import { DEFAULT_OPENROUTER_TTS_VOICE } from '../../api/tts-catalog.js';
import { resolveSupertonicVoice } from '../../api/supertonic-config.js';

/**
 * Voice validator for TTS providers
 */
export class VoiceValidator {
  /**
   * Validate and normalize voice parameter for TTS provider
   * @param {string} provider - TTS provider ('openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'offline')
   * @param {string|number|null|undefined} audioVoice - Audio voice from user input
   * @param {string|null|undefined} googleTtsVoice - Google TTS voice (for google provider)
   * @param {string} defaultVoice - Default voice to use if validation fails
   * @param {string|null|undefined} [openrouterTtsVoice] - OpenRouter speech voice
   * @returns {string} Validated voice string
   */
  static validate(provider, audioVoice, googleTtsVoice, defaultVoice, openrouterTtsVoice) {
    // Google TTS uses separate voice parameter
    if (provider === 'google') {
      return googleTtsVoice || 'Callirrhoe';
    }
    if (provider === 'openrouter') return openrouterTtsVoice || DEFAULT_OPENROUTER_TTS_VOICE;
    if (provider === 'supertonic') return resolveSupertonicVoice(audioVoice);
    
    const voice = audioVoice || defaultVoice;
    
    // Validate numeric index (invalid - indicates UI bug or old format)
    if (/^\d+$/.test(String(voice))) {
      logWarn('Invalid voice: numeric index detected', { voice, provider });
      return defaultVoice;
    }
    
    // Validate offline voice format (must contain _ and -)
    if (provider === 'offline') {
      const voiceStr = String(voice || '');
      if (voiceStr && !voiceStr.includes('_') && !voiceStr.includes('-')) {
        logWarn('Invalid offline voice format', { voice, provider });
        return defaultVoice;
      }
    }
    
    return String(voice);
  }
}

