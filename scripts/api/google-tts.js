import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { isWavBuffer, pcmToWav } from './audio-format.js';
// @ts-check
// Google Gemini TTS API module

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { resolveGoogleTtsSelection } from './tts-catalog.js';

/**
 * Google Gemini TTS API configuration
 * @readonly
 * @const {{
 *   API_BASE: string,
 *   MAX_INPUT: number
 * }}
 */
export const GOOGLE_TTS_CONFIG = {
  // API endpoint base URL
  // Generative Language API - uses API key via x-goog-api-key header
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  
  // Character bound; the API also enforces its model token budget.
  MAX_INPUT: 24000
};

function speechResponseError(message, translationKey = 'errorFailedToParseResponse', cause = undefined) {
  return Object.assign(new Error(message, { cause }), { translationKey });
}

/**
 * Convert text to speech using Google Gemini TTS API
 * @param {string} text - Text to convert (max 24000 characters)
 * @param {string} apiKey - Google API key (same as Gemini API key)
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format, 24kHz, 16-bit, mono)
 * @throws {Error} If text is empty or too long (max 24000 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If Google TTS API request fails
 * @throws {Error} If network error occurs
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const { model, voice } = resolveGoogleTtsSelection(options.model, options.voice);
  const style = options.prompt?.trim();

  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > GOOGLE_TTS_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds Gemini TTS limit: ${text.length} > ${GOOGLE_TTS_CONFIG.MAX_INPUT} characters. Text must be split into smaller chunks.`);
  }
  
  if (!apiKey) {
    throw new Error('No Google API key provided');
  }
  
  // Validate API key format
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new Error('Invalid Google API key format');
  }
  
  // Check for masked key
  if (apiKey.startsWith('****') || apiKey.startsWith('••••')) {
    throw new Error('API key appears to be masked. Please re-enter your Google API key.');
  }
  
  const requestBody = {
    contents: [{ parts: [{ text, ...(style ? { speech_metadata: { style } } : {}) }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { voice } }
    }
  };
  const endpointUrl = `${GOOGLE_TTS_CONFIG.API_BASE}/models/${model}:generateContent`;
  logDebug('Google TTS request', { model, voice, textLength: text.length, hasStyle: !!style });

  let response;
  try {
    response = await callWithRetry(async ({ signal }) => {
      await checkCancellation('Google TTS request', options.processingRunId);
      const fetchResponse = await fetchBufferedResponse(endpointUrl, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
        body: JSON.stringify(requestBody)
      }, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('Google TTS response', options.processingRunId) });

      if (!fetchResponse.ok) {
        logWarn('Google TTS request rejected', { model, status: fetchResponse.status });
        const error = await handleApiError(fetchResponse, 'Google Gemini TTS');
        if (fetchResponse.status === 404) {
          Object.assign(error, { translationKey: 'errorModelNotFound', translationParams: { model } });
        }
        throw error;
      }
      return fetchResponse;
    }, {
      signal: options.signal,
      checkCancelled: () => checkCancellation('Google TTS retry', options.processingRunId),
      onRetry: (attempt, delay) => log(`Google Gemini TTS API retry attempt ${attempt}, waiting ${delay}ms...`)
    });
  } catch (fetchError) {
    options.signal?.throwIfAborted();
    await checkCancellation('Google TTS response', options.processingRunId);
    if (fetchError.name === 'AbortError') throw await handleTimeoutError('Google Gemini TTS');
    if (fetchError.status) throw fetchError;
    throw await handleNetworkError(fetchError, 'Google Gemini TTS');
  }
  
  // Parse JSON response
  let responseData;
  try {
    responseData = await response.json();
    log('Google TTS response received', { 
      hasAudioContent: !!responseData.audioContent,
      hasCandidates: !!(responseData.candidates && responseData.candidates.length > 0),
      responseKeys: Object.keys(responseData)
    });
  } catch (e) {
    logError('Failed to parse Google Gemini TTS response', e);
    throw speechResponseError('Invalid response from Google Gemini TTS API', undefined, e);
  }
  
  // Check for API errors
  if (responseData.error) {
    logError('Google Gemini TTS API error', responseData.error);
    throw speechResponseError(responseData.error.message || 'Google Gemini TTS API error', 'errorAudioGenerationFailed');
  }
  
  // Extract audio data from response
  // Generative Language API returns candidates[0].content.parts[0].inlineData.data (base64-encoded PCM audio)
  let base64Data;
  let audioMimeType;
  if (responseData.candidates && responseData.candidates[0]) {
    const candidate = responseData.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw speechResponseError(`Incomplete audio from Google Gemini TTS: ${candidate.finishReason}`);
    }
    if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      logError('Invalid candidate structure in Google Gemini TTS response', { 
        candidate: JSON.stringify(candidate).substring(0, 500)
      });
      throw speechResponseError('Invalid response structure from Google Gemini TTS API');
    }
    const part = candidate.content.parts[0];
    if (!part.inlineData || !part.inlineData.data) {
      logError('No inlineData in Google Gemini TTS response', { 
        part: JSON.stringify(part).substring(0, 500),
        responseKeys: Object.keys(responseData)
      });
      throw speechResponseError('No audio data in Google Gemini TTS API response', 'errorNoAudioDataReturned');
    }
    base64Data = part.inlineData.data;
    audioMimeType = part.inlineData.mimeType;
  } else {
    logError('No candidates in Google Gemini TTS response', { 
      responseData: JSON.stringify(responseData).substring(0, 500),
      responseKeys: Object.keys(responseData)
    });
    throw speechResponseError('No audio data received from Google Gemini TTS API', 'errorNoAudioDataReturned');
  }
  
  // Decode base64 to ArrayBuffer
  // Google returns WAV by default and can return raw PCM.
  let pcmData;
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    pcmData = bytes.buffer;
  } catch (e) {
    logError('Failed to decode base64 audio', e);
    throw speechResponseError(`Failed to decode audio: ${e.message}`, undefined, e);
  }
  
  if (!pcmData || pcmData.byteLength === 0) {
    throw speechResponseError('Empty audio data from Google Gemini TTS API', 'errorNoAudioDataReturned');
  }
  
  const hasWavHeader = isWavBuffer(pcmData);
  const wavResponse = /^audio\/(?:wav|x-wav|wave)(?:;|$)/i.test(audioMimeType || '');
  if (wavResponse && !hasWavHeader) throw speechResponseError('Invalid WAV audio from Google Gemini TTS');
  if (!audioMimeType && !hasWavHeader) throw speechResponseError('Missing audio format from Google Gemini TTS');
  if (!hasWavHeader && audioMimeType && !/^audio\/(?:l16|pcm)(?:;|$)/i.test(audioMimeType)) {
    throw speechResponseError('Unsupported audio format from Google Gemini TTS');
  }
  if (!hasWavHeader && pcmData.byteLength % 2 !== 0) throw speechResponseError('Incomplete PCM audio from Google Gemini TTS');
  const sampleRate = Number(/(?:^|;)\s*rate=([^;]+)/i.exec(audioMimeType || '')?.[1] || 24000);
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || sampleRate > 0x7fffffff) {
    throw speechResponseError('Invalid PCM sample rate from Google Gemini TTS');
  }
  const audioBuffer = hasWavHeader ? pcmData : pcmToWav(pcmData, sampleRate, 16, 1);
  
  log('Google Gemini TTS audio ready', { 
    pcmSize: pcmData.byteLength, 
    wavSize: audioBuffer.byteLength 
  });
  
  return audioBuffer;
}
