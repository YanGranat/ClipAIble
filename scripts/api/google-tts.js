import { fetchBufferedResponse } from './fetch-buffered-response.js';
import { isWavBuffer, pcmToWav } from './audio-format.js';
// @ts-check
// Google Gemini TTS API module

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';
import { DEFAULT_GOOGLE_TTS_MODEL, GOOGLE_TTS_MODELS, isModernGoogleTtsModel } from './tts-catalog.js';

/**
 * Google Gemini TTS API configuration
 * @readonly
 * @const {{
 *   MODELS: Array<string>,
 *   MODEL: string,
 *   API_BASE: string,
 *   MAX_INPUT: number,
 *   DEFAULT_VOICE: string,
 *   VOICES: Array<{id: string, name: string}>
 * }}
 */
export const GOOGLE_TTS_CONFIG = {
  // Supported TTS models (using Generative Language API endpoint)
  // Note: These models work with generativelanguage.googleapis.com endpoint
  MODELS: GOOGLE_TTS_MODELS.map(model => model.id),
  
  // Default model
  MODEL: DEFAULT_GOOGLE_TTS_MODEL,
  
  // API endpoint base URL
  // Generative Language API - uses API key via x-goog-api-key header
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  
  // Character bound; the API also enforces its model token budget.
  MAX_INPUT: 24000,
  
  // Default voice (Callirrhoe from documentation)
  DEFAULT_VOICE: 'Callirrhoe',
  
  // Available voices for Gemini 2.5 TTS (verified against actual API response)
  // Updated based on actual API error message listing supported voices
  // API returns: achernar, achird, algenib, algieba, alnilam, aoede, autonoe, callirrhoe, charon, despina, enceladus, erinome, fenrir, gacrux, iapetus, kore, laomedeia, leda, orus, puck, pulcherrima, rasalgethi, sadachbia, sadaltager, schedar, sulafat, umbriel, vindemiatrix, zephyr, zubenelgenubi
  VOICES: [
    { id: 'Zephyr', name: 'Zephyr (Bright)' },
    { id: 'Puck', name: 'Puck (Optimistic)' },
    { id: 'Charon', name: 'Charon (Informative)' },
    { id: 'Kore', name: 'Kore (Firm)' },
    { id: 'Fenrir', name: 'Fenrir (Excitable)' },
    { id: 'Leda', name: 'Leda (Youthful)' },
    { id: 'Orus', name: 'Orus (Firm)' },
    { id: 'Aoede', name: 'Aoede (Breezy)' },
    { id: 'Callirrhoe', name: 'Callirrhoe (Easy-going)' },
    { id: 'Autonoe', name: 'Autonoe (Bright)' },
    { id: 'Enceladus', name: 'Enceladus (Breathy)' },
    { id: 'Iapetus', name: 'Iapetus (Clear)' },
    { id: 'Umbriel', name: 'Umbriel (Easy-going)' },
    { id: 'Algieba', name: 'Algieba (Smooth)' },
    { id: 'Despina', name: 'Despina (Smooth)' },
    { id: 'Erinome', name: 'Erinome (Clear)' },
    { id: 'Algenib', name: 'Algenib (Gravelly)' },
    { id: 'Rasalgethi', name: 'Rasalgethi (Informative)' },
    { id: 'Laomedeia', name: 'Laomedeia (Optimistic)' },
    { id: 'Achernar', name: 'Achernar (Soft)' },
    { id: 'Alnilam', name: 'Alnilam (Firm)' },
    { id: 'Schedar', name: 'Schedar (Even)' },
    { id: 'Gacrux', name: 'Gacrux (Mature)' },
    { id: 'Pulcherrima', name: 'Pulcherrima (Forward)' },
    { id: 'Achird', name: 'Achird (Friendly)' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi (Casual)' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix (Gentle)' },
    { id: 'Sadachbia', name: 'Sadachbia (Lively)' },
    { id: 'Sadaltager', name: 'Sadaltager (Knowledgeable)' },
    { id: 'Sulafat', name: 'Sulafat (Warm)' }
  ]
};

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
  const {
    voice = GOOGLE_TTS_CONFIG.DEFAULT_VOICE,
    prompt = null,
    model = GOOGLE_TTS_CONFIG.MODEL
  } = options;
  
  log('Google Gemini TTS start', { textLength: text?.length, voice });
  
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
  
  // Validate voice - must be in the list of valid voices (NO FALLBACK)
  const validVoice = GOOGLE_TTS_CONFIG.VOICES.find(v => v.id === voice);
  if (!validVoice) {
    throw new Error(`Invalid Google TTS voice "${voice}". Supported voices: ${GOOGLE_TTS_CONFIG.VOICES.map(v => v.id).join(', ')}`);
  }
  
  const modernModel = isModernGoogleTtsModel(model);
  const voiceNameForApi = modernModel ? validVoice.id : validVoice.id.toLowerCase();
  
  // Validate model (NO FALLBACK)
  if (!GOOGLE_TTS_CONFIG.MODELS.includes(model)) {
    throw new Error(`Invalid Google TTS model "${model}". Supported models: ${GOOGLE_TTS_CONFIG.MODELS.join(', ')}`);
  }
  const validModel = model;
  
  let response;
    // Generative Language API - prompt and text are combined in contents field
    // Format: "Say {prompt}: {text}" - API handles this correctly and prompt is NOT spoken
    // NO FALLBACKS - if this fails, error is thrown immediately
    
    // Combine prompt and text if prompt is provided
    // Format: "Say {prompt}: {text}" or just "{text}" if no prompt
    let contentsText = text;
    if (prompt && !modernModel) {
      // Format prompt as instruction for the entire text
      // Example from documentation: "Say cheerfully: Have a wonderful day!"
      // API correctly processes this format and does NOT speak the prompt part
      contentsText = `Say ${prompt.trim()}: ${text}`;
      log('Style prompt combined with text (API handles correctly, prompt not spoken)', {
        prompt,
        promptLength: prompt.length,
        combinedTextLength: contentsText.length
      });
    }
    
    const requestBody = {
      contents: [
        {
          parts: [
            { text: contentsText, ...(modernModel && prompt?.trim() ? { speech_metadata: { style: prompt.trim() } } : {}) }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: modernModel ? { voice: voiceNameForApi } : { prebuiltVoiceConfig: { voiceName: voiceNameForApi } }
        }
      }
    };
    
    // Use Generative Language API endpoint with model in URL
    const endpointUrl = `${GOOGLE_TTS_CONFIG.API_BASE}/models/${validModel}:generateContent`;
    
    logDebug('Google TTS request', { 
      url: endpointUrl, 
      model: validModel,
      voice: validVoice,
      voiceNameForApi: voiceNameForApi,
      originalVoice: voice,
      textLength: text.length,
      hasPrompt: !!prompt,
      promptLength: prompt ? prompt.length : 0,
      requestBodyKeys: Object.keys(requestBody),
      requestBodyPreview: JSON.stringify(requestBody).substring(0, 500),
      contentsTextPreview: contentsText.substring(0, 200),
      contentsTextEnd: contentsText.length > 200 ? '...' + contentsText.substring(contentsText.length - 100) : ''
    });
    
    try {
      response = await callWithRetry(
        async () => {
          await checkCancellation('Google TTS request', options.processingRunId);
          
          try {
            // Generative Language API: API key via x-goog-api-key header
            const fetchResponse = await fetchBufferedResponse(endpointUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey.trim()
              },
              body: JSON.stringify(requestBody)
            }, CONFIG.API_TIMEOUT_MS, { checkCancelled: () => checkCancellation('TTS response', options.processingRunId) });
            
            if (!fetchResponse.ok) {
              // Log response details for errors to help diagnose
              try {
                // Clone response before reading to avoid consuming it
                const clonedResponse = fetchResponse.clone();
                const errorBody = await clonedResponse.text();
                const errorJson = errorBody ? (() => {
                  try {
                    return JSON.parse(errorBody);
                  } catch {
                    return { raw: errorBody };
                  }
                })() : { empty: true };
                
                  logWarn(`Google TTS ${fetchResponse.status} response`, { 
                    url: endpointUrl, 
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    errorBody: errorBody,
                    errorJson: errorJson,
                    requestBody: JSON.stringify(requestBody, null, 2),
                    requestBodyKeys: Object.keys(requestBody),
                    hasPrompt: !!prompt
                  });
              } catch (e) {
                logWarn(`Failed to read ${fetchResponse.status} response body`, { error: e.message, stack: e.stack });
              }
              // NO FALLBACKS - if Generative Language API fails, error is thrown immediately
              // This helps identify issues during testing
              
              const error = await handleApiError(fetchResponse, 'Google Gemini TTS');
              throw error;
            }
            
            return fetchResponse;
          } catch (e) {
            throw e;
          }
        },
        {
          onRetry: (attempt, delay) => {
            log(`Google Gemini TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    } catch (fetchError) {
      await checkCancellation('Google TTS response', options.processingRunId);
      if (fetchError.name === 'AbortError') {
        throw await handleTimeoutError('Google Gemini TTS');
      }
      
      if (fetchError.status) {
        throw fetchError; // Already handled by handleApiError
      }
      
      throw await handleNetworkError(fetchError, 'Google Gemini TTS');
    }
    
    if (!response) {
      throw new Error('Google Gemini TTS did not return a response');
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
    throw new Error('Invalid response from Google Gemini TTS API');
  }
  
  // Check for API errors
  if (responseData.error) {
    logError('Google Gemini TTS API error', responseData.error);
    throw new Error(responseData.error.message || 'Google Gemini TTS API error');
  }
  
  // Extract audio data from response
  // Generative Language API returns candidates[0].content.parts[0].inlineData.data (base64-encoded PCM audio)
  let base64Data;
  let audioMimeType;
  if (responseData.candidates && responseData.candidates[0]) {
    const candidate = responseData.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Incomplete audio from Google Gemini TTS: ${candidate.finishReason}`);
    }
    if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
      logError('Invalid candidate structure in Google Gemini TTS response', { 
        candidate: JSON.stringify(candidate).substring(0, 500)
      });
      throw new Error('Invalid response structure from Google Gemini TTS API');
    }
    const part = candidate.content.parts[0];
    if (!part.inlineData || !part.inlineData.data) {
      logError('No inlineData in Google Gemini TTS response', { 
        part: JSON.stringify(part).substring(0, 500),
        responseKeys: Object.keys(responseData)
      });
      throw new Error('No audio data in Google Gemini TTS API response');
    }
    base64Data = part.inlineData.data;
    audioMimeType = part.inlineData.mimeType;
  } else {
    logError('No candidates in Google Gemini TTS response', { 
      responseData: JSON.stringify(responseData).substring(0, 500),
      responseKeys: Object.keys(responseData)
    });
    throw new Error('No audio data received from Google Gemini TTS API');
  }
  
  // Decode base64 to ArrayBuffer
  // Both APIs return base64-encoded PCM audio (24kHz, 16-bit, mono)
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
    throw new Error(`Failed to decode audio: ${e.message}`);
  }
  
  if (!pcmData || pcmData.byteLength === 0) {
    throw new Error('Empty audio data from Google Gemini TTS API');
  }
  
  const hasWavHeader = isWavBuffer(pcmData);
  const wavResponse = /^audio\/(?:wav|x-wav|wave)(?:;|$)/i.test(audioMimeType || '');
  if (wavResponse && !hasWavHeader) throw new Error('Invalid WAV audio from Google Gemini TTS');
  if (modernModel && !audioMimeType && !hasWavHeader) throw new Error('Missing audio format from Google Gemini TTS');
  if (!hasWavHeader && audioMimeType && !/^audio\/(?:l16|pcm)(?:;|$)/i.test(audioMimeType)) {
    throw new Error('Unsupported audio format from Google Gemini TTS');
  }
  if (!hasWavHeader && pcmData.byteLength % 2 !== 0) throw new Error('Incomplete PCM audio from Google Gemini TTS');
  const sampleRate = Number(/(?:^|;)\s*rate=([^;]+)/i.exec(audioMimeType || '')?.[1] || 24000);
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || sampleRate > 0x7fffffff) {
    throw new Error('Invalid PCM sample rate from Google Gemini TTS');
  }
  const audioBuffer = hasWavHeader ? pcmData : pcmToWav(pcmData, sampleRate, 16, 1);
  
  log('Google Gemini TTS audio ready', { 
    pcmSize: pcmData.byteLength, 
    wavSize: audioBuffer.byteLength 
  });
  
  return audioBuffer;
}

/**
 * Get all available voices
 * @returns {Array<{id: string, name: string}>} Array of all voice objects
 */
export function getAllVoices() {
  return GOOGLE_TTS_CONFIG.VOICES;
}
