import { fetchBufferedResponse } from './fetch-buffered-response.js';
// @ts-check
// Qwen TTS Text-to-Speech API module for ClipAIble extension
// Uses workspace synthesis or the legacy multimodal endpoint.

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { DEFAULT_QWEN_TTS_MODEL, DEFAULT_QWEN_TTS_VOICE, QWEN_AUDIO_VOICES, QWEN_LEGACY_VOICES, getDefaultTtsVoice, getQwenTtsEndpoint, isQwenAudioModel } from './tts-catalog.js';
import { isValidExternalUrl } from '../utils/security.js';

/**
 * Qwen TTS API configuration
 * @readonly
 * @const {{
 *   MODEL: string,
 *   MAX_INPUT: number,
 *   SAMPLE_RATE: number,
 *   FORMAT: string,
 *   DEFAULT_VOICE: string,
 *   DEFAULT_SPEED: number,
 *   VOICES: Array<{id: string, name: string}>
 * }}
 */
export const QWEN_CONFIG = {
  // Default synthesis model
  MODEL: DEFAULT_QWEN_TTS_MODEL,
  
  // Text length limit per request (Qwen TTS limit is 600 characters!)
  MAX_INPUT: 600,
  
  // Output requested by the audio pipeline
  SAMPLE_RATE: 24000,
  FORMAT: 'wav',
  
  // Default voice
  DEFAULT_VOICE: DEFAULT_QWEN_TTS_VOICE,
  
  // Speed is not supported; keep neutral value for UI consistency
  DEFAULT_SPEED: 1.0,
  
  // Voices shared by the current Flash and Plus models
  VOICES: QWEN_AUDIO_VOICES,
  LEGACY_VOICES: QWEN_LEGACY_VOICES,
  // Supported language types for Qwen TTS
  LANGUAGES: {
    'en': 'English',
    'zh': 'Chinese',
    'ru': 'Russian',
    'fr': 'French',
    'it': 'Italian',
    'es': 'Spanish',
    'de': 'German',
    'ja': 'Japanese',
    'ko': 'Korean',
    'pt': 'Portuguese'
  },
  
  // Output format (fixed by API)
  DEFAULT_FORMAT: 'wav'
};

/**
 * Detect language from text (simple heuristic)
 * @param {string} text - Text to analyze
 * @returns {string} Language code
 */
function detectLanguage(text) {
  if (!text || text.length === 0) return 'en';
  
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const japanese = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const korean = (text.match(/[\uac00-\ud7a3]/g) || []).length;
  
  if (cyrillic > text.length * 0.3) return 'ru';
  if (chinese > text.length * 0.3) return 'zh';
  if (japanese > text.length * 0.2) return 'ja';
  if (korean > text.length * 0.2) return 'ko';
  
  return 'en';
}

/**
 * Convert text to speech using Qwen TTS API
 * @param {string} text - Text to convert (max 500 characters)
 * @param {string} apiKey - Alibaba Cloud DashScope API key
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format)
 * @throws {Error} If text is empty or too long (max 500 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If Qwen API request fails
 * @throws {Error} If network error occurs
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const {
    qwenModel = QWEN_CONFIG.MODEL,
    voice = getDefaultTtsVoice('qwen', qwenModel),
    language = null,
    qwenWorkspaceId = '',
    qwenRegion = 'singapore',
    speed = 1.0
  } = options;
  
  log('Qwen TTS start', { textLength: text?.length, voice, language });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > QWEN_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds Qwen TTS limit: ${text.length} > ${QWEN_CONFIG.MAX_INPUT} characters. Text must be split into smaller chunks.`);
  }
  
  if (!apiKey) {
    throw new Error('No DashScope API key provided');
  }
  
  // Validate API key format
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new Error('Invalid DashScope API key format');
  }
  
  // Check for masked key
  if (apiKey.startsWith('****') || apiKey.startsWith('••••')) {
    throw new Error('API key appears to be masked. Please re-enter your DashScope API key.');
  }
  
  // Validate voice - use default if invalid
  const modernModel = isQwenAudioModel(qwenModel);
  const apiUrl = getQwenTtsEndpoint(qwenModel, qwenWorkspaceId, qwenRegion);
  if (modernModel && QWEN_CONFIG.LEGACY_VOICES.some(v => v.id === voice)) {
    throw new Error('Select a Qwen Audio 3.1 voice in audio settings.');
  }
  if (!modernModel && QWEN_AUDIO_VOICES.some(v => v.id === voice)) {
    throw new Error('Select a voice supported by the selected Qwen TTS model in audio settings.');
  }
  const validVoice = voice;
  
  // Detect or use provided language
  const detectedLang = language || detectLanguage(text);
  const languageType = QWEN_CONFIG.LANGUAGES[detectedLang] || 'English';
  
  // Each API generation uses its own synthesis parameters.
  const requestBody = {
    model: qwenModel,
    input: modernModel ? {
      text,
      voice: validVoice,
      format: 'wav',
      sample_rate: 24000,
      rate: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
    } : {
      text: text,
      voice: validVoice,
      language_type: languageType
    }
  };
  
  let response;
  
  try {
    response = await callWithRetry(
      async () => {
        await checkCancellation('Qwen TTS request', options.processingRunId);
        
        try {
          const fetchResponse = await fetchBufferedResponse(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify(requestBody)
          }, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('TTS response', options.processingRunId) });
          
          if (!fetchResponse.ok) {
            const error = await handleApiError(fetchResponse, 'Qwen TTS');
            throw error;
          }
          
          return fetchResponse;
        } catch (e) {
          throw e;
        }
      },
      {
        onRetry: (attempt, delay) => {
          log(`Qwen TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    await checkCancellation('Qwen TTS response', options.processingRunId);
    if (fetchError.name === 'AbortError') {
      throw await handleTimeoutError('Qwen TTS');
    }
    if (fetchError.status) {
      throw fetchError; // Already handled by handleApiError
    }
    throw await handleNetworkError(fetchError, 'Qwen TTS');
  }
  
  // Parse JSON response
  let responseData;
  try {
    responseData = await response.json();
  } catch (e) {
    logError('Failed to parse Qwen TTS response', e);
    throw new Error('Invalid response from Qwen TTS API');
  }
  
  log('Qwen TTS response received', { code: responseData.code, hasOutput: !!responseData.output });
  await checkCancellation('Qwen audio download', options.processingRunId);
  
  // Check for API errors
  if (responseData.code && responseData.code !== 'Success' && responseData.code !== '200') {
    logError('Qwen TTS API error', responseData);
    throw new Error(responseData.message || `Qwen TTS API error: ${responseData.code}`);
  }
  
  // Extract audio data from response
  // Qwen TTS returns audio URL that needs to be fetched
  let audioBuffer;
  
  if (responseData.output?.audio) {
    const audioData = responseData.output.audio;
    
    // If audio contains URL, fetch it
    if (audioData.url) {
      // SECURITY: Validate URL before fetching
      if (!isValidExternalUrl(audioData.url)) {
        logError('Invalid audio URL from Qwen API', { url: audioData.url?.substring(0, 100) });
        throw new Error('Invalid audio URL received from API');
      }
      
      try {
        const audioResponse = await fetchBufferedResponse(audioData.url, {}, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('Qwen audio download', options.processingRunId) });
        if (!audioResponse.ok) {
          throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
        }
        audioBuffer = await audioResponse.arrayBuffer();
      } catch (e) {
        logError('Failed to fetch audio from URL', e);
        throw new Error(`Failed to download audio: ${e.message}`);
      }
    }
    // If audio is base64 string
    else if (typeof audioData === 'string') {
      audioBuffer = base64ToArrayBuffer(audioData);
    }
    // If audio has data field with base64
    else if (audioData.data && typeof audioData.data === 'string') {
      audioBuffer = base64ToArrayBuffer(audioData.data);
    }
    else {
      logError('Unknown audio format', { audioData });
      throw new Error('Unknown audio format in Qwen TTS response');
    }
  }
  // Check for audio_url at output level
  else if (responseData.output?.audio_url) {
    log('Fetching audio from audio_url', { url: responseData.output.audio_url.substring(0, 100) + '...' });
    
    // SECURITY: Validate URL before fetching
    if (!isValidExternalUrl(responseData.output.audio_url)) {
      logError('Invalid audio URL from Qwen API', { url: responseData.output.audio_url?.substring(0, 100) });
      throw new Error('Invalid audio URL received from API');
    }
    
    try {
      const audioResponse = await fetchBufferedResponse(responseData.output.audio_url, {}, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('Qwen audio download', options.processingRunId) });
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
      }
      audioBuffer = await audioResponse.arrayBuffer();
    } catch (e) {
      logError('Failed to fetch audio from audio_url', e);
      throw new Error(`Failed to download audio: ${e.message}`);
    }
  }
  else {
    logError('No audio data in Qwen TTS response', {
      responseKeys: Object.keys(responseData),
      outputKeys: responseData.output ? Object.keys(responseData.output) : [],
      output: responseData.output
    });
    throw new Error('No audio data received from Qwen TTS API');
  }
  
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Empty audio data from Qwen TTS API');
  }
  
  log('Qwen TTS audio ready', { audioSize: audioBuffer.byteLength });
  
  return audioBuffer;
}

/**
 * Convert base64 string to ArrayBuffer
 * @param {string|object} base64 - Base64 encoded string or object with data
 * @returns {ArrayBuffer} Decoded ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  // Handle different input types
  let base64String;
  
  if (typeof base64 === 'string') {
    base64String = base64;
  } else if (base64 && typeof base64 === 'object') {
    // If it's an object, try to extract string data
    base64String = base64.data || base64.content || base64.audio || JSON.stringify(base64);
    log('base64ToArrayBuffer received object, extracted string', { 
      originalType: typeof base64,
      extractedLength: base64String?.length 
    });
  } else {
    throw new Error(`Invalid audio data type: ${typeof base64}`);
  }
  
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Could not extract base64 string from audio data');
  }
  
  // Remove data URL prefix if present
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  
  // Decode base64
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    logError('Failed to decode base64', { error: e.message, dataPreview: base64Data.substring(0, 100) });
    throw new Error(`Failed to decode base64 audio: ${e.message}`);
  }
}

/**
 * Get available voices
 * @returns {Array<{id: string, name: string}>} Array of voice objects
 */
export function getVoices() {
  return QWEN_CONFIG.VOICES;
}

