// @ts-check
// Google Gemini 2.5 TTS API module for ClipAIble extension
// 
// Uses Generative Language API (generativelanguage.googleapis.com)
// - API key via x-goog-api-key header
// - IMPORTANT: Prompt style is combined with text in contents field as "Say {prompt}: {text}"
//   According to Google API documentation, the API handles this correctly and the prompt is NOT spoken
//   However, the format requires combining prompt and text in the contents field
//
// NO FALLBACKS - if API fails, error is thrown immediately

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { handleApiError, handleTimeoutError, handleNetworkError } from '../utils/api-error-handler.js';

/**
 * Google Gemini 2.5 TTS API configuration
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
  MODELS: [
    'gemini-2.5-pro-preview-tts',           // High control for structured workflows
    'gemini-2.5-flash-preview-tts',         // Low latency, cost-efficient
    'gemini-2.5-flash-lite-preview-tts'  // Preview: single-speaker only
  ],
  
  // Default model
  MODEL: 'gemini-2.5-pro-preview-tts',
  
  // API endpoint base URL
  // Generative Language API - uses API key via x-goog-api-key header
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
  
  // Text length limit per request (32k tokens, roughly 24k characters)
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
 * Convert raw PCM audio data to WAV format
 * @param {ArrayBuffer} pcmData - Raw PCM audio data
 * @param {number} sampleRate - Sample rate in Hz (default: 24000)
 * @param {number} bitsPerSample - Bits per sample (default: 16)
 * @param {number} numChannels - Number of channels (default: 1 for mono)
 * @returns {ArrayBuffer} WAV-formatted audio buffer
 */
function pcmToWav(pcmData, sampleRate = 24000, bitsPerSample = 16, numChannels = 1) {
  const pcmLength = pcmData.byteLength;
  const headerSize = 44;
  const totalSize = headerSize + pcmLength;
  
  const wavBuffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(wavBuffer);
  const dataView = new DataView(wavBuffer);
  
  // Write WAV header
  // "RIFF" chunk descriptor
  view[0] = 0x52; // R
  view[1] = 0x49; // I
  view[2] = 0x46; // F
  view[3] = 0x46; // F
  
  // File size - 8
  dataView.setUint32(4, totalSize - 8, true);
  
  // "WAVE" format
  view[8] = 0x57;  // W
  view[9] = 0x41;  // A
  view[10] = 0x56; // V
  view[11] = 0x45; // E
  
  // "fmt " sub-chunk
  view[12] = 0x66; // f
  view[13] = 0x6D; // m
  view[14] = 0x74; // t
  view[15] = 0x20; // (space)
  
  // Sub-chunk size (16 for PCM)
  dataView.setUint32(16, 16, true);
  
  // Audio format (1 = PCM)
  dataView.setUint16(20, 1, true);
  
  // Number of channels
  dataView.setUint16(22, numChannels, true);
  
  // Sample rate
  dataView.setUint32(24, sampleRate, true);
  
  // Byte rate (sample rate * num channels * bytes per sample)
  dataView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  
  // Block align (num channels * bytes per sample)
  dataView.setUint16(32, numChannels * (bitsPerSample / 8), true);
  
  // Bits per sample
  dataView.setUint16(34, bitsPerSample, true);
  
  // "data" sub-chunk
  view[36] = 0x64; // d
  view[37] = 0x61; // a
  view[38] = 0x74; // t
  view[39] = 0x61; // a
  
  // Data chunk size
  dataView.setUint32(40, pcmLength, true);
  
  // Copy PCM data
  const pcmView = new Uint8Array(pcmData);
  view.set(pcmView, 44);
  
  return wavBuffer;
}

// formatTextWithPrompt function removed - no longer needed
// Cloud Text-to-Speech API uses separate prompt/text fields, so no formatting needed

/**
 * Convert text to speech using Google Gemini 2.5 TTS API
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
  
  // API expects voice name in lowercase
  const voiceNameForApi = validVoice.id.toLowerCase();
  
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
    if (prompt) {
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
            { text: contentsText }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceNameForApi
            }
          }
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
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
          
          try {
            // Generative Language API: API key via x-goog-api-key header
            const fetchResponse = await fetch(endpointUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey.trim()
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal
            });
            
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
          } finally {
            // CRITICAL: Always clear timeout in finally to prevent memory leaks
            if (timeout) {
              clearTimeout(timeout);
            }
          }
        },
        {
          onRetry: (attempt, delay) => {
            log(`Google Gemini TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        throw handleTimeoutError('Google Gemini TTS');
      }
      
      if (fetchError.status) {
        throw fetchError; // Already handled by handleApiError
      }
      
      throw handleNetworkError(fetchError, 'Google Gemini TTS');
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
  if (responseData.candidates && responseData.candidates[0]) {
    const candidate = responseData.candidates[0];
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
  
  // Google TTS returns raw PCM data (24kHz, 16-bit, mono) without WAV header
  // Need to wrap it in WAV header for playback
  const audioBuffer = pcmToWav(pcmData, 24000, 16, 1);
  
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
