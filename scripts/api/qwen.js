// Qwen3-TTS-Flash Text-to-Speech API module for ClipAIble extension
// Uses DashScope multimodal-generation API

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { isValidExternalUrl } from '../utils/security.js';

/**
 * Qwen3-TTS-Flash API configuration
 */
export const QWEN_CONFIG = {
  // API endpoint (Alibaba Cloud DashScope - International/Singapore)
  API_URL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  
  // Model name - using 2025-11-27 snapshot with 49 voices
  MODEL: 'qwen3-tts-flash-2025-11-27',
  
  // Text length limit per request (Qwen3-TTS-Flash limit is 600 characters!)
  MAX_INPUT: 600,
  
  // Speed is not supported by Qwen3-TTS-Flash API
  // Sample rate is fixed at 24kHz, format is always WAV
  SAMPLE_RATE: 24000,
  FORMAT: 'wav',
  
  // Default voice
  DEFAULT_VOICE: 'Elias',
  
  // Speed is not supported; keep neutral value for UI consistency
  DEFAULT_SPEED: 1.0,
  
  // Available voices for Qwen3-TTS-Flash-2025-11-27 (49 voices)
  // Grouped by use case for better selection
  VOICES: [
    // Best for articles/education
    { id: 'Elias', name: 'Elias (academic, storytelling)' },
    { id: 'Neil', name: 'Neil (news anchor, professional)' },
    { id: 'Katerina', name: 'Katerina (female, mature, rhythmic)' },
    { id: 'Ryan', name: 'Ryan (male, dramatic, realistic)' },
    
    // Language-specific voices
    { id: 'Alek', name: 'Alek (Russian voice)' },
    { id: 'Jennifer', name: 'Jennifer (American English female)' },
    { id: 'Emilien', name: 'Emilien (French gentleman)' },
    { id: 'Lenn', name: 'Lenn (German, rational)' },
    { id: 'Dolce', name: 'Dolce (Italian)' },
    { id: 'Bodega', name: 'Bodega (Spanish)' },
    { id: 'Sonrisa', name: 'Sonrisa (Latin American Spanish)' },
    { id: 'Andre', name: 'Andre (Portuguese European)' },
    { id: 'Radio Gol', name: 'Radio Gol (Portuguese Brazilian)' },
    { id: 'Sohee', name: 'Sohee (Korean)' },
    { id: 'Ono Anna', name: 'Ono Anna (Japanese)' },
    
    // General purpose
    { id: 'Cherry', name: 'Cherry (female, sunny, friendly)' },
    { id: 'Ethan', name: 'Ethan (male, warm, energetic)' },
    { id: 'Serena', name: 'Serena (female, gentle)' },
    { id: 'Chelsie', name: 'Chelsie (female, anime style)' },
    { id: 'Aiden', name: 'Aiden (American young man)' },
    { id: 'Maia', name: 'Maia (female, intelligent, gentle)' },
    { id: 'Kai', name: 'Kai (male, relaxing)' },
    { id: 'Nofish', name: 'Nofish (designer, no retroflex)' },
    
    // Character voices
    { id: 'Eldric Sage', name: 'Eldric Sage (old wise man)' },
    { id: 'Arthur', name: 'Arthur (old storyteller)' },
    { id: 'Bellona', name: 'Bellona (powerful, epic)' },
    { id: 'Vincent', name: 'Vincent (raspy, heroic)' },
    { id: 'Mia', name: 'Mia (female, gentle as snow)' },
    { id: 'Seren', name: 'Seren (female, soothing, ASMR)' },
    
    // Playful/Cute
    { id: 'Momo', name: 'Momo (playful, cute)' },
    { id: 'Vivian', name: 'Vivian (cool, slightly grumpy)' },
    { id: 'Moon', name: 'Moon (carefree)' },
    { id: 'Bella', name: 'Bella (loli voice)' },
    { id: 'Mochi', name: 'Mochi (child voice)' },
    { id: 'Bunny', name: 'Bunny (cute loli)' },
    { id: 'Pip', name: 'Pip (mischievous child)' },
    { id: 'Stella', name: 'Stella (magical girl)' },
    { id: 'Nini', name: 'Nini (sweet neighbor girl)' },
    { id: 'Ebona', name: 'Ebona (whispering, scary)' }
  ],
  
  // Supported language types for Qwen3-TTS-Flash
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
 * Convert text to speech using Qwen3-TTS-Flash API
 * @param {string} text - Text to convert (max 500 characters)
 * @param {string} apiKey - Alibaba Cloud DashScope API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice name to use (default: 'Cherry')
 * @param {string} options.language - Language code (auto-detected if not provided)
 * @param {number} options.speed - Speech speed (not directly supported)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const {
    voice = QWEN_CONFIG.DEFAULT_VOICE,
    language = null
  } = options;
  
  log('Qwen TTS start', { textLength: text?.length, voice, language });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > QWEN_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds Qwen3-TTS-Flash limit: ${text.length} > ${QWEN_CONFIG.MAX_INPUT} characters. Text must be split into smaller chunks.`);
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
  const validVoice = QWEN_CONFIG.VOICES.find(v => v.id === voice) 
    ? voice 
    : QWEN_CONFIG.DEFAULT_VOICE;
  
  // Detect or use provided language
  const detectedLang = language || detectLanguage(text);
  const languageType = QWEN_CONFIG.LANGUAGES[detectedLang] || 'English';
  
  // Qwen3-TTS-Flash request body format
  // Note: API only supports WAV format at 24kHz, no format/sample_rate parameters
  const requestBody = {
    model: QWEN_CONFIG.MODEL,
    input: {
      text: text,
      voice: validVoice,
      language_type: languageType
    }
  };
  
  let response;
  
  try {
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch(QWEN_CONFIG.API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            clearTimeout(timeout);
            const error = await handleApiError(fetchResponse, 'Qwen3-TTS-Flash');
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
          log(`Qwen3-TTS-Flash API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      throw handleTimeoutError('Qwen3-TTS-Flash');
    }
    if (fetchError.status) {
      throw fetchError; // Already handled by handleApiError
    }
    throw handleNetworkError(fetchError, 'Qwen3-TTS-Flash');
  }
  
  // Parse JSON response
  let responseData;
  try {
    responseData = await response.json();
  } catch (e) {
    logError('Failed to parse Qwen3-TTS-Flash response', e);
    throw new Error('Invalid response from Qwen3-TTS-Flash API');
  }
  
  log('Qwen TTS response received', { code: responseData.code, hasOutput: !!responseData.output });
  
  // Check for API errors
  if (responseData.code && responseData.code !== 'Success' && responseData.code !== '200') {
    logError('Qwen3-TTS-Flash API error', responseData);
    throw new Error(responseData.message || `Qwen3-TTS-Flash API error: ${responseData.code}`);
  }
  
  // Extract audio data from response
  // Qwen3-TTS-Flash returns audio URL that needs to be fetched
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
        const audioResponse = await fetch(audioData.url);
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
      throw new Error('Unknown audio format in Qwen3-TTS-Flash response');
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
      const audioResponse = await fetch(responseData.output.audio_url);
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
    logError('No audio data in Qwen3-TTS-Flash response', { 
      responseKeys: Object.keys(responseData),
      outputKeys: responseData.output ? Object.keys(responseData.output) : [],
      output: responseData.output
    });
    throw new Error('No audio data received from Qwen3-TTS-Flash API');
  }
  
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Empty audio data from Qwen3-TTS-Flash API');
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

