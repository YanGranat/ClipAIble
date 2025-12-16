// ElevenLabs Text-to-Speech API module for ClipAIble extension

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';

/**
 * ElevenLabs TTS API configuration
 */
export const ELEVENLABS_CONFIG = {
  // API endpoint
  API_URL: 'https://api.elevenlabs.io/v1/text-to-speech',
  
  // Default model (eleven_v3 is most expressive, supports 70+ languages)
  DEFAULT_MODEL: 'eleven_v3',
  
  // Available models
  MODELS: [
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (stable, natural)' },
    { id: 'eleven_v3', name: 'v3 (most expressive)' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (fast)' }
  ],
  
  // Default voice (Rachel - popular English voice)
  // Users can change this in settings
  DEFAULT_VOICE_ID: '21m00Tcm4TlvDq8ikWAM',
  
  // Popular voices (voice IDs from ElevenLabs library)
  POPULAR_VOICES: [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (female, clear)' },
    { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (female, strong)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (female, warm)' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (male, deep)' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (female, young)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (male, calm)' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (male, authoritative)' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (male, expressive)' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (male, friendly)' }
  ],
  
  // Text length limits (ElevenLabs has 5000 char limit per request)
  MAX_INPUT: 5000,
  
  // Speed range (0.25 - 4.0)
  MIN_SPEED: 0.25,
  MAX_SPEED: 4.0,
  DEFAULT_SPEED: 1.0,
  
  // Output formats
  FORMATS: {
    'mp3_44100_128': 'mp3',
    'mp3_44100_192': 'mp3',
    'mp3_22050_32': 'mp3',
    'pcm_16000': 'pcm',
    'pcm_22050': 'pcm',
    'pcm_24000': 'pcm',
    'pcm_44100': 'pcm',
    'ulaw_8000': 'ulaw'
  },
  
  DEFAULT_FORMAT: 'mp3_44100_192' // Highest quality MP3 format (192kbps)
};

/**
 * Convert text to speech using ElevenLabs TTS API
 * @param {string} text - Text to convert (max 5000 characters)
 * @param {string} apiKey - ElevenLabs API key
 * @param {Object} options - TTS options
 * @param {string} options.voiceId - Voice ID to use (default: Rachel)
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0)
 * @param {string} options.modelId - Model ID (default: 'eleven_multilingual_v2')
 * @param {string} options.format - Output format (default: 'mp3_44100_128')
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const {
    voiceId = ELEVENLABS_CONFIG.DEFAULT_VOICE_ID,
    speed = ELEVENLABS_CONFIG.DEFAULT_SPEED,
    modelId = ELEVENLABS_CONFIG.DEFAULT_MODEL,
    format = ELEVENLABS_CONFIG.DEFAULT_FORMAT,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.0,
    useSpeakerBoost = true
  } = options;
  
  log('ElevenLabs textToSpeech called', { 
    textLength: text?.length, 
    voiceId, 
    speed, 
    modelId,
    format
  });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > ELEVENLABS_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds ElevenLabs limit: ${text.length} > ${ELEVENLABS_CONFIG.MAX_INPUT} characters`);
  }
  
  if (!apiKey) {
    throw new Error('No ElevenLabs API key provided');
  }
  
  // Check if key is masked (not a real key)
  if (apiKey.startsWith('****') || apiKey.startsWith('••••')) {
    logError('ElevenLabs API key is masked, not decrypted properly', { 
      keyLength: apiKey.length
    });
    throw new Error('ElevenLabs API key not found. Please save your API key in settings first.');
  }
  
  // Validate API key contains only ASCII characters (required for HTTP headers)
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7F]*$/.test(apiKey)) {
    logError('ElevenLabs API key contains invalid characters', { 
      keyLength: apiKey.length,
      // Security: Don't log key prefix
      keyLength: apiKey?.length || 0
    });
    throw new Error('Invalid ElevenLabs API key format. Please re-enter your API key in settings.');
  }
  
  // Validate speed
  const validSpeed = Math.max(
    ELEVENLABS_CONFIG.MIN_SPEED, 
    Math.min(ELEVENLABS_CONFIG.MAX_SPEED, speed)
  );
  
  // Validate stability - must be exactly 0.0, 0.5, or 1.0 (enforced by UI slider)
  const validStability = stability === 0.0 || stability === 0.5 || stability === 1.0 
    ? stability 
    : 0.5; // Default fallback if invalid value somehow passed
  
  const requestBody = {
    text: text,
    model_id: modelId,
    voice_settings: {
      stability: validStability,
      similarity_boost: Math.max(0, Math.min(1, similarityBoost)),
      style: Math.max(0, Math.min(1, style)),
      use_speaker_boost: useSpeakerBoost,
      speed: validSpeed
    }
  };
  
  const url = `${ELEVENLABS_CONFIG.API_URL}/${voiceId}`;
  
  let response;
  
  try {
    log('Sending TTS request to ElevenLabs...');
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            clearTimeout(timeout);
            const error = await handleApiError(fetchResponse, 'ElevenLabs', {
              parseErrorData: (errorData) => {
                // ElevenLabs uses 'detail' instead of 'error'
                if (errorData.detail) {
                  return { error: { message: errorData.detail.message || errorData.detail } };
                }
                return errorData;
              },
              customErrorHandler: (errorData, errorText, response) => {
                // Handle quota exceeded
                if (response.status === 429 || errorData.detail?.message?.includes('quota')) {
                  return 'ElevenLabs quota exceeded. Please check your subscription or try again later.';
                }
                return null; // Use default extraction
              }
            });
            throw error;
          }
          
          clearTimeout(timeout);
          return fetchResponse;
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`ElevenLabs TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      throw handleTimeoutError('ElevenLabs');
    }
    if (fetchError.status) {
      throw fetchError; // Already handled by handleApiError
    }
    throw handleNetworkError(fetchError, 'ElevenLabs');
  }
  
  // Get audio data as ArrayBuffer
  const audioBuffer = await response.arrayBuffer();
  
  log('ElevenLabs TTS response received', { 
    audioSize: audioBuffer.byteLength,
    contentType: response.headers.get('content-type')
  });
  
  return audioBuffer;
}

/**
 * Get available voices from ElevenLabs API
 * @param {string} apiKey - ElevenLabs API key
 * @returns {Promise<Array>} Array of voice objects
 */
export async function getVoices(apiKey) {
  if (!apiKey) {
    throw new Error('No ElevenLabs API key provided');
  }
  
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status}`);
    }
    
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    logError('Failed to fetch ElevenLabs voices', error);
    // Return popular voices as fallback
    return ELEVENLABS_CONFIG.POPULAR_VOICES;
  }
}

/**
 * Get MIME type for audio format
 * @param {string} format - Audio format (mp3_44100_128, pcm_16000, etc.)
 * @returns {string} MIME type
 */
export function getAudioMimeType(format) {
  if (format.startsWith('mp3')) {
    return 'audio/mpeg';
  } else if (format.startsWith('pcm')) {
    return 'audio/pcm';
  } else if (format.startsWith('ulaw')) {
    return 'audio/basic';
  }
  return 'audio/mpeg';
}

/**
 * Get file extension for audio format
 * @param {string} format - Audio format
 * @returns {string} File extension
 */
export function getAudioExtension(format) {
  if (format.startsWith('mp3')) {
    return 'mp3';
  } else if (format.startsWith('pcm')) {
    return 'pcm';
  } else if (format.startsWith('ulaw')) {
    return 'ulaw';
  }
  return 'mp3';
}

