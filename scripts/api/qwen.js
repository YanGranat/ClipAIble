import { fetchBufferedResponse } from './fetch-buffered-response.js';
// @ts-check
// Qwen TTS Text-to-Speech API module for ClipAIble extension
// Uses workspace synthesis or the legacy multimodal endpoint.

import { log } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { createApiError } from './http-errors.js';
import { DEFAULT_QWEN_TTS_MODEL, DEFAULT_QWEN_TTS_VOICE, QWEN_AUDIO_VOICES, QWEN_LEGACY_VOICES, getDefaultTtsVoice, getQwenTtsEndpoint, isQwenAudioModel, isQwenVoiceCompatible } from './tts-catalog.js';
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
  
  const modernModel = isQwenAudioModel(qwenModel);
  const apiUrl = getQwenTtsEndpoint(qwenModel, qwenWorkspaceId, qwenRegion);
  if (!isQwenVoiceCompatible(qwenModel, voice)) {
    throw new Error(modernModel ? 'Select a Qwen Audio 3.1 voice in audio settings.'
      : 'Select a voice supported by the selected Qwen TTS model in audio settings.');
  }
  const validVoice = voice;
  
  // Detect or use provided language
  const detectedLang = String(language || 'auto').toLowerCase().split(/[-_]/)[0];
  const languageType = Object.hasOwn(QWEN_CONFIG.LANGUAGES, detectedLang) ? QWEN_CONFIG.LANGUAGES[detectedLang] : 'Auto';
  
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
      async ({ signal }) => {
        await checkCancellation('Qwen TTS request', options.processingRunId);
        
        const fetchResponse = await fetchBufferedResponse(apiUrl, {
          signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
          body: JSON.stringify(requestBody)
        }, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('TTS response', options.processingRunId) });

        if (!fetchResponse.ok) throw await createApiError(fetchResponse, 'Qwen TTS');
        return fetchResponse;
      },
      {
        signal: options.signal,
        checkCancelled: () => checkCancellation('Qwen TTS retry', options.processingRunId),
        onRetry: (attempt, delay) => {
          log(`Qwen TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    options.signal?.throwIfAborted();
    await checkCancellation('Qwen TTS response', options.processingRunId);
    if (fetchError.name === 'AbortError') {
      throw await handleTimeoutError('Qwen TTS');
    }
    if (fetchError.status || fetchError.translationKey) {
      throw fetchError;
    }
    throw await handleNetworkError(fetchError, 'Qwen TTS');
  }
  
  let responseData;
  try { responseData = await response.json(); }
  catch { throw invalidSpeechAudio('Invalid Qwen TTS response'); }
  options.signal?.throwIfAborted();
  await checkCancellation('Qwen audio download', options.processingRunId);
  if (responseData?.error || (responseData?.code && !['Success', '200'].includes(String(responseData.code)))) {
    throw await createApiError(response, 'Qwen TTS', responseData);
  }

  const audio = responseData?.output?.audio;
  const url = audio ? audio.url : responseData?.output?.audio_url;
  const encoded = typeof audio === 'string' ? audio : audio?.data;
  const buffer = url
    ? await downloadSpeechAudio(url, options)
    : decodeSpeechAudio(encoded);
  if (!buffer.byteLength) throw invalidSpeechAudio('Empty Qwen TTS audio');
  log('Qwen TTS audio ready', { audioSize: buffer.byteLength });
  return buffer;
}

function invalidSpeechAudio(message) {
  return Object.assign(new Error(message), {
    translationKey: 'errorTtsInvalidAudio', translationParams: {}, retryable: false
  });
}

/** @param {string} url @param {Partial<import('../types.js').TTSOptions>} options */
async function downloadSpeechAudio(url, options) {
  let address;
  try { address = new URL(url); }
  catch { throw invalidSpeechAudio('Invalid Qwen TTS audio URL'); }
  if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || !isValidExternalUrl(address.origin)) {
    throw invalidSpeechAudio('Invalid Qwen TTS audio URL');
  }

  const checkCancelled = () => checkCancellation('Qwen audio download', options.processingRunId);
  try {
    const response = await fetchBufferedResponse(url, { signal: options.signal }, CONFIG.API_TIMEOUT_MS, { checkCancelled });
    if (!response.ok) throw invalidSpeechAudio('Qwen TTS audio not available');
    const audio = await response.arrayBuffer();
    options.signal?.throwIfAborted();
    await checkCancelled();
    return audio;
  } catch (error) {
    options.signal?.throwIfAborted();
    await checkCancelled();
    if (error.translationKey) throw error;
    throw invalidSpeechAudio('Qwen TTS audio download failed');
  }
}

/** @param {unknown} encoded */
function decodeSpeechAudio(encoded) {
  if (typeof encoded !== 'string' || !encoded) throw invalidSpeechAudio('Missing Qwen TTS audio');
  const base64 = encoded.startsWith('data:') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
  try { return Uint8Array.from(atob(base64), byte => byte.charCodeAt(0)).buffer; }
  catch { throw invalidSpeechAudio('Invalid Qwen TTS audio encoding'); }
}

/**
 * Get available voices
 * @returns {Array<{id: string, name: string}>} Array of voice objects
 */
export function getVoices() {
  return QWEN_CONFIG.VOICES;
}

