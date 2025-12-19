// Respeecher Text-to-Speech API module for ClipAIble extension
// Ukrainian company - supports English and Ukrainian TTS
//
// Implementation notes:
// - We use native fetch API instead of @respeecher/respeecher-js SDK
//   because: 1) Chrome Extension service worker environment, 2) No build step needed,
//   3) Full control over request/response handling, 4) Smaller bundle size
// - We use the Bytes endpoint (not WebSocket) because:
//   - Simpler implementation for our use case (sequential requests + concatenation)
//   - Suitable for generating complete audio files from articles
//   - WebSocket would be better for real-time streaming and multiple concurrent generations
//     but adds complexity we don't need for article-to-audio conversion
// - SDK available at: https://www.npmjs.com/package/@respeecher/respeecher-js
//   (not needed for our use case)
// See: https://space.respeecher.com/docs/api/tts/bytes
//      https://space.respeecher.com/docs/api/tts/web-socket
//      https://space.respeecher.com/docs/sdks/type-script

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';

/**
 * Respeecher TTS API configuration
 * 
 * We use the Bytes endpoint for simplicity:
 * - POST /v1/public/tts/{lang}/tts/bytes
 * - Returns complete WAV file (16-bit LE PCM)
 * - Maximum response size: 100 MB (audio truncated above this)
 * 
 * WebSocket endpoint (wss://api.respeecher.com/v1/public/tts/{lang}/tts/websocket)
 * would provide better latency and support for concurrent generations,
 * but Bytes endpoint is sufficient for our article-to-audio use case.
 */
export const RESPEECHER_CONFIG = {
  // API endpoints - Bytes endpoint (HTTP POST)
  // According to https://space.respeecher.com/docs/models-and-languages:
  // - en-rt: English only, default model
  // - ua-rt: Ukrainian primarily, with some support for other languages
  API_URL_EN: 'https://api.respeecher.com/v1/public/tts/en-rt/tts/bytes',
  API_URL_UA: 'https://api.respeecher.com/v1/public/tts/ua-rt/tts/bytes',
  VOICES_URL_EN: 'https://api.respeecher.com/v1/public/tts/en-rt/voices',
  VOICES_URL_UA: 'https://api.respeecher.com/v1/public/tts/ua-rt/voices',
  
  // Text length limit per request (450 characters per their demo)
  MAX_INPUT: 450,
  
  // Sample rate (fixed by API)
  SAMPLE_RATE: 22050,
  FORMAT: 'wav',
  
  // API limits according to https://space.respeecher.com/docs/limits:
  // - Maximum of 5 concurrent TTS generations (1 for free trial accounts)
  // - Maximum response size of 100 MB for Bytes endpoint (audio truncated above this)
  MAX_RESPONSE_SIZE: 100 * 1024 * 1024, // 100 MB in bytes
  MAX_CONCURRENT_REQUESTS: 5, // 1 for free trial
  
  // Default voice
  // For Ukrainian text, use olesia-media (most common on ua-rt)
  // For English text, use samantha
  DEFAULT_VOICE: 'samantha',
  DEFAULT_VOICE_UA: 'olesia-media',
  
  // Available voices for Respeecher TTS
  // Note: Voices are hardcoded here for simplicity, but can be fetched dynamically
  // via GET /v1/public/tts/{lang}/voices endpoint (see getVoicesFromAPI function)
  // English voices
  VOICES_EN: [
    { id: 'samantha', name: 'Samantha (female, American)', gender: 'female', accent: 'American' },
    { id: 'neve', name: 'Neve (female, emotional)', gender: 'female', accent: 'American' },
    { id: 'gregory', name: 'Gregory (male, emotional)', gender: 'male', accent: 'American' },
    { id: 'vincent', name: 'Vincent (male, deep)', gender: 'male', accent: 'American' }
  ],
  
  // Ukrainian voices (from Playground: https://space.respeecher.com/playground)
  // These are the actual voices available on ua-rt endpoint
  // Note: volodymyr is NOT available on ua-rt, only on en-rt
  VOICES_UA: [
    { id: 'olesia-rozmova', name: 'Олеся: розмова (female, conversation)', gender: 'female', accent: 'Ukrainian' },
    { id: 'olesia-media', name: 'Олеся: медіа (female, media)', gender: 'female', accent: 'Ukrainian' },
    { id: 'olesia-ogoloshennia', name: 'Олеся: оголошення (female, announcement)', gender: 'female', accent: 'Ukrainian' },
    { id: 'mariia-audioknyha', name: 'Марія: аудіокнига (female, audiobook)', gender: 'female', accent: 'Ukrainian' },
    { id: 'oleksandr-radio', name: 'Олександр: радіо (male, radio)', gender: 'male', accent: 'Ukrainian' },
    { id: 'oleksandr-reklama', name: 'Олександр: реклама (male, advertisement)', gender: 'male', accent: 'Ukrainian' },
    { id: 'yevhen-reklama', name: 'Євген: реклама (male, advertisement)', gender: 'male', accent: 'Ukrainian' },
    { id: 'yevhen-audioknyha', name: 'Євген: аудіокнига (male, audiobook)', gender: 'male', accent: 'Ukrainian' },
    { id: 'dmitro-rozmova', name: 'Дмитро: розмова (male, conversation)', gender: 'male', accent: 'Ukrainian' },
    { id: 'ihoreo-rozmova', name: 'Ігорео: розмова (male, conversation)', gender: 'male', accent: 'Ukrainian' }
  ],
  
  // All voices combined for UI
  // Note: volodymyr is available on en-rt endpoint only, not on ua-rt
  VOICES: [
    { id: 'samantha', name: '🇺🇸 Samantha (female, American)' },
    { id: 'neve', name: '🇺🇸 Neve (female, emotional)' },
    { id: 'gregory', name: '🇺🇸 Gregory (male, emotional)' },
    { id: 'vincent', name: '🇺🇸 Vincent (male, deep)' },
    { id: 'volodymyr', name: '🇺🇦 Volodymyr (male, Ukrainian) - EN endpoint only' },
    // Ukrainian voices (ua-rt endpoint)
    { id: 'olesia-rozmova', name: '🇺🇦 Олеся: розмова (female, conversation)' },
    { id: 'olesia-media', name: '🇺🇦 Олеся: медіа (female, media)' },
    { id: 'olesia-ogoloshennia', name: '🇺🇦 Олеся: оголошення (female, announcement)' },
    { id: 'mariia-audioknyha', name: '🇺🇦 Марія: аудіокнига (female, audiobook)' },
    { id: 'oleksandr-radio', name: '🇺🇦 Олександр: радіо (male, radio)' },
    { id: 'oleksandr-reklama', name: '🇺🇦 Олександр: реклама (male, advertisement)' },
    { id: 'yevhen-reklama', name: '🇺🇦 Євген: реклама (male, advertisement)' },
    { id: 'yevhen-audioknyha', name: '🇺🇦 Євген: аудіокнига (male, audiobook)' },
    { id: 'dmitro-rozmova', name: '🇺🇦 Дмитро: розмова (male, conversation)' },
    { id: 'ihoreo-rozmova', name: '🇺🇦 Ігорео: розмова (male, conversation)' }
  ],
  
  // Supported languages
  LANGUAGES: {
    'en': 'English',
    'ua': 'Ukrainian'
  },
  
  // Voice to language mapping
  // Note: volodymyr is on en-rt endpoint, but can handle Ukrainian text
  // Ukrainian voices are on ua-rt endpoint
  VOICE_LANGUAGE: {
    'samantha': 'en',
    'neve': 'en',
    'gregory': 'en',
    'vincent': 'en',
    'volodymyr': 'en', // Available on en-rt endpoint only
    // Ukrainian voices (ua-rt endpoint)
    'olesia-rozmova': 'ua',
    'olesia-media': 'ua',
    'olesia-ogoloshennia': 'ua',
    'mariia-audioknyha': 'ua',
    'oleksandr-radio': 'ua',
    'oleksandr-reklama': 'ua',
    'yevhen-reklama': 'ua',
    'yevhen-audioknyha': 'ua',
    'dmitro-rozmova': 'ua',
    'ihoreo-rozmova': 'ua'
  }
};

/**
 * Detect language from text (for auto-selecting endpoint)
 * @param {string} text - Text to analyze
 * @returns {string} Language code ('en' or 'ua')
 */
function detectLanguage(text) {
  if (!text || text.length === 0) return 'en';
  
  // Count Ukrainian-specific characters (і, ї, є, ґ)
  const ukrainianSpecific = (text.match(/[іїєґІЇЄҐ]/g) || []).length;
  // Count general Cyrillic
  const cyrillic = (text.match(/[А-Яа-яЁёІіЇїЄєҐґ]/g) || []).length;
  
  // If has Ukrainian-specific characters, it's Ukrainian
  if (ukrainianSpecific > 0) return 'ua';
  
  // If mostly Cyrillic but no Ukrainian-specific, could be Russian or Ukrainian
  // Respeecher Ukrainian model handles both reasonably
  if (cyrillic > text.length * 0.3) return 'ua';
  
  return 'en';
}

/**
 * Get the appropriate API URL based on voice
 * According to https://space.respeecher.com/docs/models-and-languages:
 * - en-rt: English only, default model
 * - ua-rt: Ukrainian primarily, with some support for other languages
 *   (useful for passages in other languages within Ukrainian text)
 * 
 * IMPORTANT: According to Quickstart docs, both voices (samantha and volodymyr)
 * are returned from /v1/public/tts/en-rt/voices endpoint. This suggests that:
 * - All voices may be available on both endpoints
 * - Or we should use en-rt endpoint for all voices
 * 
 * @param {string} voice - Voice ID
 * @param {string} textLanguage - Language of the text to convert (optional)
 * @returns {string} API URL
 */
function getApiUrl(voice, textLanguage = null) {
  // According to Models & Languages docs:
  // - en-rt: English only
  // - ua-rt: Ukrainian primarily, with some support for other languages
  //
  // We select endpoint based on TEXT language:
  // - Ukrainian text -> ua-rt endpoint (ONLY, no fallback)
  // - English text -> en-rt endpoint
  
  if (textLanguage === 'ua') {
    return RESPEECHER_CONFIG.API_URL_UA;
  }
  
  // Default to English endpoint for English text
  return RESPEECHER_CONFIG.API_URL_EN;
}

/**
 * Convert text to speech using Respeecher API
 * @param {string} text - Text to convert (max 450 characters)
 * @param {string} apiKey - Respeecher API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID to use (default: 'samantha')
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format)
 */
export async function textToSpeech(text, apiKey, options = {}) {
  log('Respeecher TTS start', { textLength: text?.length, voice: options.voice, language: options.language });
  
  const {
    voice = RESPEECHER_CONFIG.DEFAULT_VOICE,
    language = null, // Explicit language can override auto-detection
    temperature = 1.0,
    repetition_penalty = 1.0,
    top_p = 1.0
  } = options;
  
  log('Respeecher textToSpeech called', { textLength: text?.length, voice, language });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > RESPEECHER_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds Respeecher limit: ${text.length} > ${RESPEECHER_CONFIG.MAX_INPUT} characters. Text must be split into smaller chunks.`);
  }
  
  if (!apiKey) {
    throw new Error('No Respeecher API key provided');
  }
  
  // Validate API key format
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new Error('Invalid Respeecher API key format. API key should be at least 10 characters long. Get your API key from https://space.respeecher.com/api-keys');
  }
  
  // Check for masked key
  if (apiKey.startsWith('****') || apiKey.startsWith('••••')) {
    throw new Error('API key appears to be masked. Please re-enter your Respeecher API key from https://space.respeecher.com/api-keys');
  }
  
  // Detect text language if not provided or if 'auto'
  // Convert 'auto' to null so detectLanguage can work
  const detectedLang = (language && language !== 'auto') ? language : detectLanguage(text);
  
  // IMPORTANT: volodymyr is available on en-rt endpoint only, not on ua-rt
  // Ukrainian voices are available on ua-rt endpoint only
  // If Ukrainian text but voice is volodymyr, switch to Ukrainian voice BEFORE determining endpoint
  let validVoice = voice;
  
  const isUkrainianText = detectedLang === 'ua';
  const isVolodymyrVoice = voice === 'volodymyr';
  
  if (isUkrainianText && isVolodymyrVoice) {
    log('WARN: volodymyr is not available on ua-rt endpoint. Switching to Ukrainian voice for Ukrainian text.', {
      requestedVoice: voice,
      detectedLang: detectedLang,
      newVoice: RESPEECHER_CONFIG.DEFAULT_VOICE_UA,
      reason: 'volodymyr is only available on en-rt endpoint, but text is Ukrainian'
    });
    validVoice = RESPEECHER_CONFIG.DEFAULT_VOICE_UA;
    log('Voice switched', { oldVoice: voice, newVoice: validVoice });
  }
  
  // Validate voice - use default if invalid
  if (!RESPEECHER_CONFIG.VOICES.find(v => v.id === validVoice)) {
    validVoice = (detectedLang === 'ua' ? RESPEECHER_CONFIG.DEFAULT_VOICE_UA : RESPEECHER_CONFIG.DEFAULT_VOICE);
    log('Voice not found in config, using default', {
      requestedVoice: voice,
      validVoice: validVoice,
      detectedLang: detectedLang
    });
  }
  
  // Get appropriate API URL based on text language (not voice language)
  // According to docs: ua-rt for Ukrainian text, en-rt for English text
  // We need to use the correct endpoint for the text language
  let apiUrl = getApiUrl(validVoice, detectedLang);
  
  const isUkrainianEndpoint = apiUrl.includes('ua-rt');
  const isUkrainianVoice = RESPEECHER_CONFIG.VOICE_LANGUAGE[validVoice] === 'ua';
  
  // Respeecher request body format
  // According to https://space.respeecher.com/docs/api/tts/sampling-params-guide:
  // - sampling_params are optional and can override default values for each voice
  // - Default sampling_params for each voice can be obtained via /voices endpoint
  // - Available params: temperature, top_p, top_k, min_p, presence_penalty,
  //   repetition_penalty, frequency_penalty, seed
  const samplingParams = {};
  if (temperature !== 1.0) samplingParams.temperature = temperature;
  if (repetition_penalty !== 1.0) samplingParams.repetition_penalty = repetition_penalty;
  if (top_p !== 1.0) samplingParams.top_p = top_p;
  
  const requestBody = {
    transcript: text,
    voice: {
      id: validVoice,
      ...(Object.keys(samplingParams).length > 0 ? { sampling_params: samplingParams } : {})
    }
  };
  
  // Store these for error handling
  const storedApiUrl = apiUrl;
  const storedIsUkrainianEndpoint = isUkrainianEndpoint;
  const storedIsUkrainianVoice = isUkrainianVoice;
  const storedValidVoice = validVoice;
  
  // For Ukrainian endpoint, try to get available voices first
  // Note: Documentation only shows example for en-rt/voices, but we try ua-rt/voices
  // If it fails, we'll use hardcoded voice IDs
  if (isUkrainianEndpoint) {
    try {
      const voicesUrl = RESPEECHER_CONFIG.VOICES_URL_UA;
      const voicesResponse = await fetch(voicesUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey.trim()
        }
      });
      if (voicesResponse.ok) {
        const availableVoices = await voicesResponse.json();
        const voiceFound = availableVoices?.find(v => v.id === validVoice);
        if (!voiceFound) {
          const ukrainianVoice = availableVoices?.find(v => v.accent === 'Ukrainian') || availableVoices?.[0];
          if (ukrainianVoice) {
            validVoice = ukrainianVoice.id;
            requestBody.voice.id = ukrainianVoice.id;
          }
        }
      }
    } catch (error) {
      logWarn('Voice list fetch failed for Ukrainian endpoint, using defaults', { error: error.message });
    }
  }
  
  let response;
  
  try {
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
          try {
          // Respeecher supports both header and query parameter auth
          // Try header first (preferred method)
          const apiKeyParam = apiKey.trim();
          // According to https://space.respeecher.com/docs/quickstart:
          // "In browsers, the JavaScript API for WebSockets may not allow custom headers,
          // so the query string option is preferred there."
          // We're in a Chrome Extension service worker, but let's use query parameter as primary method
          // since it's recommended for browser environments
          
          // Method: X-API-Key header (as required by OpenAPI spec)
          let fetchResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKeyParam
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            clearTimeout(timeout);
            
            // Log full response details for debugging
            const responseHeaders = {};
            fetchResponse.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            
            const error = await handleApiError(fetchResponse, 'Respeecher', {
              customErrorHandler: (errorData, errorText, response) => {
                // Log error details
                log('Respeecher API error response', {
                  status: response.status,
                  statusText: response.statusText,
                  errorData,
                  errorText: errorText?.substring(0, 500),
                  responseHeaders,
                  url: apiUrl,
                  method: 'POST',
                  hasApiKey: !!apiKeyParam,
                  keyLength: apiKeyParam.length,
                  // Security: Don't log key prefix/suffix
                  keyLength: apiKeyParam?.length || 0
                });
                
                const baseErrorMsg = errorData.error?.message || errorData.message || errorData.detail || errorText || `Respeecher API error: ${response.status}`;
                
                // Make error message more user-friendly
                if (response.status === 402) {
                  return `Respeecher API insufficient balance (402 Payment Required).\n\n` +
                         `Your Respeecher account doesn't have enough credits to generate audio.\n\n` +
                         `How to fix:\n` +
                         `1. Go to https://space.respeecher.com/\n` +
                         `2. Check your account balance\n` +
                         `3. Add credits to your account\n` +
                         `4. Try again\n\n` +
                         `Original error: ${baseErrorMsg}`;
                } else if (response.status === 401) {
                  return `Respeecher API authentication failed (401 Unauthorized).\n\n` +
                         `Possible causes:\n` +
                         `1. API key is incorrect or expired\n` +
                         `2. API key doesn't have access to TTS API\n` +
                         `3. API key format is wrong\n\n` +
                         `How to fix:\n` +
                         `1. Go to https://space.respeecher.com/api-keys\n` +
                         `2. Make sure you're logged in\n` +
                         `3. Create a new API key\n` +
                         `4. Copy the FULL key (it should be longer than 20 characters)\n` +
                         `5. Paste it in the extension settings\n\n` +
                         `Note: You need to be registered and logged in to get an API key.\n` +
                         `Original error: ${baseErrorMsg}`;
                } else if (response.status === 400 && baseErrorMsg.includes('voice not found')) {
                  // Voice not found error
                  const endpointName = storedApiUrl.includes('ua-rt') ? 'Ukrainian' : 'English';
                  return `Respeecher voice not found (400 Bad Request).\n\n` +
                         `The voice "${storedValidVoice}" is not available for the ${endpointName} endpoint.\n\n` +
                         `Possible causes:\n` +
                         `1. Voice ID is incorrect for this endpoint\n` +
                         `2. Voice may not be available for your API key\n` +
                         `3. API key may not have access to this voice\n\n` +
                         `How to fix:\n` +
                         `1. Check available voices for ${endpointName} endpoint at https://space.respeecher.com/docs\n` +
                         `2. Try using a different voice from the list\n` +
                         `3. Verify your API key has access to TTS API\n\n` +
                         `Original error: ${baseErrorMsg}`;
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
          log(`Respeecher API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      throw handleTimeoutError('Respeecher');
    }
    if (fetchError.status) {
      throw fetchError; // Already handled by handleApiError
    }
    throw handleNetworkError(fetchError, 'Respeecher');
  }
  
  // Respeecher returns WAV audio directly as binary
  const audioBuffer = await response.arrayBuffer();
  
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Empty audio data from Respeecher API');
  }
  
  // Check response size limit (100 MB according to docs)
  // https://space.respeecher.com/docs/limits
  if (audioBuffer.byteLength >= RESPEECHER_CONFIG.MAX_RESPONSE_SIZE) {
    log('WARN: Respeecher response size exceeds or approaches 100 MB limit', {
      size: audioBuffer.byteLength,
      limit: RESPEECHER_CONFIG.MAX_RESPONSE_SIZE,
      note: 'Audio may have been silently truncated by API'
    });
  }
  
  // Verify it's WAV format
  const header = new Uint8Array(audioBuffer.slice(0, 4));
  const isWav = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46; // "RIFF"
  
  if (!isWav) {
    log('WARN: Respeecher response does not appear to be WAV format', {
      headerBytes: Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '),
      expected: '52 49 46 46 (RIFF)'
    });
  }
  
  log('Respeecher response received', { 
    audioSize: audioBuffer.byteLength,
    audioSizeMB: (audioBuffer.byteLength / (1024 * 1024)).toFixed(2),
    isWav,
    headerBytes: Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '),
    withinLimit: audioBuffer.byteLength < RESPEECHER_CONFIG.MAX_RESPONSE_SIZE
  });
  
  return audioBuffer;
}

/**
 * Get available voices (hardcoded list)
 * @returns {Array<{id: string, name: string}>} Array of voice objects
 */
export function getVoices() {
  return RESPEECHER_CONFIG.VOICES;
}

/**
 * Get voices for a specific language (hardcoded list)
 * @param {string} lang - Language code ('en' or 'ua')
 * @returns {Array} Array of voice objects
 */
export function getVoicesForLanguage(lang) {
  if (lang === 'ua') {
    return RESPEECHER_CONFIG.VOICES_UA;
  }
  return RESPEECHER_CONFIG.VOICES_EN;
}

/**
 * Fetch available voices from Respeecher API
 * According to https://space.respeecher.com/docs/api/voices/list:
 * - GET /v1/public/tts/{lang}/voices
 * - Returns array of voice objects with id, full_name, gender, accent, age, sampling_params
 * - Requires X-API-Key header
 * 
 * @param {string} apiKey - Respeecher API key
 * @param {string} language - Language code ('en' or 'ua')
 * @returns {Promise<Array>} Array of voice objects from API
 */
export async function getVoicesFromAPI(apiKey, language = 'en') {
  const voicesUrl = language === 'ua' 
    ? RESPEECHER_CONFIG.VOICES_URL_UA 
    : RESPEECHER_CONFIG.VOICES_URL_EN;
  
  log('Fetching voices from Respeecher API', { language, url: voicesUrl });
  
  try {
    // Use X-API-Key header only (as per OpenAPI spec)
    // Security: Never use query parameters for API keys - they can leak in logs/proxy/history
    const response = await fetch(voicesUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey.trim()
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to fetch voices: ${response.status} ${errorText}`);
    }
    
    const voices = await response.json();
    log('Voices fetched from API', { count: voices?.length, language });
    return voices;
  } catch (error) {
    logError('Failed to fetch voices from API', error);
    throw error;
  }
}

