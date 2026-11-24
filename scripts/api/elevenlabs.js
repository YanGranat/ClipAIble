import { fetchBufferedResponse } from './fetch-buffered-response.js';
// @ts-check
// ElevenLabs Text-to-Speech API module for ClipAIble extension

import { log, logError, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { DEFAULT_ELEVENLABS_TTS_MODEL, DEFAULT_ELEVENLABS_TTS_VOICE, ELEVENLABS_TTS_MODELS, ELEVENLABS_TTS_VOICES, getElevenLabsCapabilities } from './tts-catalog.js';
import { isWavBuffer, muLawToPcm, pcmToWav } from './audio-format.js';

/**
 * ElevenLabs TTS API configuration
 * @readonly
 * @const {{
 *   API_URL: string,
 *   DEFAULT_MODEL: string,
 *   MODELS: Array<{id: string, name: string}>,
 *   DEFAULT_VOICE_ID: string,
 *   POPULAR_VOICES: Array<{id: string, name: string}>,
 *   MAX_INPUT: number,
 *   MIN_SPEED: number,
 *   MAX_SPEED: number,
 *   DEFAULT_SPEED: number,
 *   FORMATS: Array<string>
 * }}
 */
export const ELEVENLABS_CONFIG = {
  // API endpoint
  API_URL: 'https://api.elevenlabs.io/v1/text-to-speech',
  
  DEFAULT_MODEL: DEFAULT_ELEVENLABS_TTS_MODEL,
  
  // Available models
  MODELS: ELEVENLABS_TTS_MODELS,
  
  // Default narration voice
  DEFAULT_VOICE_ID: DEFAULT_ELEVENLABS_TTS_VOICE,
  
  // Popular voices (voice IDs from ElevenLabs library)
  POPULAR_VOICES: ELEVENLABS_TTS_VOICES,
  
  // Conservative chunk bound shared by the supported models.
  MAX_INPUT: 5000,
  
  MIN_SPEED: 0.7,
  MAX_SPEED: 1.2,
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
 * @param {Partial<import('../types.js').TTSOptions> & {voiceId?: string, modelId?: string, stability?: number, similarityBoost?: number, style?: number, useSpeakerBoost?: boolean}} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (MP3 format)
 * @throws {Error} If text is empty or too long (max 5000 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If ElevenLabs API request fails
 * @throws {Error} If network error occurs
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
  
  logDebug('ElevenLabs textToSpeech called', { 
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
  
  const capabilities = getElevenLabsCapabilities(modelId);
  const requestBody = {
    text: text,
    model_id: modelId,
    voice_settings: {
      stability: validStability,
      ...(capabilities.similarity ? { similarity_boost: Math.max(0, Math.min(1, similarityBoost)) } : {}),
      ...(capabilities.style ? { style: Math.max(0, Math.min(1, style)) } : {}),
      ...(capabilities.speakerBoost ? { use_speaker_boost: useSpeakerBoost } : {}),
      ...(capabilities.speed ? { speed: validSpeed } : {})
    }
  };
  
  if (!Object.hasOwn(ELEVENLABS_CONFIG.FORMATS, format)) throw new Error('Unsupported ElevenLabs audio format.');
  const url = `${ELEVENLABS_CONFIG.API_URL}/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
  
  let response;
  
  try {
    log('Sending TTS request to ElevenLabs...');
    
    response = await callWithRetry(
      async ({ signal }) => {
        await checkCancellation('ElevenLabs TTS request', options.processingRunId);
        
        try {
          const fetchResponse = await fetchBufferedResponse(url, {
            signal,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
          }, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('TTS response', options.processingRunId) });
          
          if (!fetchResponse.ok) {
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
          
          return fetchResponse;
        } catch (e) {
          throw e;
        }
      },
      {
        signal: options.signal,
        checkCancelled: () => checkCancellation('ElevenLabs TTS retry', options.processingRunId),
        onRetry: (attempt, delay) => {
          log(`ElevenLabs TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    options.signal?.throwIfAborted();
    await checkCancellation('ElevenLabs TTS response', options.processingRunId);
    if (fetchError.name === 'AbortError') {
      throw await handleTimeoutError('ElevenLabs');
    }
    if (fetchError.status) {
      throw fetchError; // Already handled by handleApiError
    }
    throw await handleNetworkError(fetchError, 'ElevenLabs');
  }
  
  // Get audio data as ArrayBuffer
  const audioBuffer = await response.arrayBuffer();
  
  log('ElevenLabs TTS response received', { 
    audioSize: audioBuffer.byteLength,
    contentType: response.headers.get('content-type')
  });
  
  if (isWavBuffer(audioBuffer)) return audioBuffer;
  if (format.startsWith('pcm_')) return pcmToWav(audioBuffer, Number(format.slice(4)));
  if (format === 'ulaw_8000') return pcmToWav(muLawToPcm(audioBuffer), 8000);
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
    const response = await fetchBufferedResponse('https://api.elevenlabs.io/v1/voices', {
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

