// Text-to-Speech API module for ClipAIble extension
// Supports OpenAI, ElevenLabs, Qwen3-TTS-Flash, Respeecher, and Google Cloud TTS providers

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { AUDIO_CONFIG } from '../generation/audio-prep.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { textToSpeech as elevenlabsTTS, ELEVENLABS_CONFIG } from './elevenlabs.js';
import { textToSpeech as qwenTTS, QWEN_CONFIG } from './qwen.js';
import { textToSpeech as respeecherTTS, RESPEECHER_CONFIG } from './respeecher.js';
import { textToSpeech as googleTTS, GOOGLE_TTS_CONFIG } from './google-tts.js';

/**
 * Convert text to speech using TTS API (OpenAI, ElevenLabs, Qwen, Respeecher, or Google Cloud TTS)
 * @param {string} text - Text to convert
 * @param {string} apiKey - API key (OpenAI, ElevenLabs, Qwen, Respeecher, or Google Cloud)
 * @param {Object} options - TTS options
 * @param {string} options.provider - Provider: 'openai', 'elevenlabs', 'qwen', 'respeecher', or 'google' (default: 'openai')
 * @param {string} options.voice - Voice to use
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0)
 * @param {string} options.format - Output format (default: 'mp3')
 * @param {string} options.instructions - Voice style instructions (OpenAI only)
 * @param {string} options.language - Language code for Qwen (auto-detected if not provided)
 * @param {number} options.pitch - Pitch -20.0 to 20.0 (Google Cloud TTS only, default: 0.0)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const { provider = 'openai' } = options;
  
  if (provider === 'elevenlabs') {
    return textToSpeechElevenLabs(text, apiKey, options);
  } else if (provider === 'qwen') {
    return textToSpeechQwen(text, apiKey, options);
  } else if (provider === 'respeecher') {
    return textToSpeechRespeecher(text, apiKey, options);
  } else if (provider === 'google') {
    return textToSpeechGoogle(text, apiKey, options);
  } else {
    return textToSpeechOpenAI(text, apiKey, options);
  }
}

/**
 * Convert text to speech using OpenAI TTS API
 * @param {string} text - Text to convert (max 4096 characters)
 * @param {string} apiKey - OpenAI API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice to use (default: 'nova')
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0)
 * @param {string} options.format - Output format: mp3, opus, aac, flac, wav, pcm (default: 'mp3')
 * @param {string} options.instructions - Voice style instructions (optional, only for gpt-4o-mini-tts)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
async function textToSpeechOpenAI(text, apiKey, options = {}) {
  const {
    voice = AUDIO_CONFIG.DEFAULT_VOICE,
    speed = AUDIO_CONFIG.DEFAULT_SPEED,
    format = 'mp3',
    instructions = null,
    openaiInstructions = null
  } = options;
  
  // Use custom instructions if provided, otherwise use default instructions
  const finalInstructions = openaiInstructions || instructions;
  
  log('TTS request', { textLength: text?.length, voice, speed, format, hasInstructions: !!finalInstructions });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > AUDIO_CONFIG.TTS_MAX_INPUT) {
    throw new Error(`Text exceeds TTS limit: ${text.length} > ${AUDIO_CONFIG.TTS_MAX_INPUT} characters`);
  }
  
  if (!apiKey) {
    throw new Error('No API key provided');
  }
  
  // Validate voice
  if (!AUDIO_CONFIG.VOICES.includes(voice)) {
    log(`Invalid voice "${voice}", using default "${AUDIO_CONFIG.DEFAULT_VOICE}"`);
  }
  
  // Validate speed
  const validSpeed = Math.max(AUDIO_CONFIG.MIN_SPEED, Math.min(AUDIO_CONFIG.MAX_SPEED, speed));
  
  const requestBody = {
    model: 'gpt-4o-mini-tts',
    input: text,
    voice: AUDIO_CONFIG.VOICES.includes(voice) ? voice : AUDIO_CONFIG.DEFAULT_VOICE,
    response_format: format,
    speed: validSpeed
  };
  
  // Add instructions if provided (for voice style control)
  if (finalInstructions) {
    requestBody.instructions = finalInstructions;
  }
  
  let response;
  
  try {
    log('Sending TTS request to OpenAI...');
    
    response = await callWithRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
        
        try {
          const fetchResponse = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          if (!fetchResponse.ok) {
            const retryableCodes = CONFIG.RETRYABLE_STATUS_CODES;
            if (retryableCodes.includes(fetchResponse.status)) {
              const error = new Error(`HTTP ${fetchResponse.status}`);
              error.status = fetchResponse.status;
              error.response = fetchResponse;
              clearTimeout(timeout);
              throw error;
            }
            
            // Non-retryable error
            let errorData;
            try {
              errorData = await fetchResponse.json();
            } catch (e) {
              errorData = { error: { message: `HTTP ${fetchResponse.status}` } };
            }
            const error = new Error(errorData.error?.message || `TTS API error: ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            clearTimeout(timeout);
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
          log(`TTS API retry attempt ${attempt}, waiting ${delay}ms...`);
        }
      }
    );
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      logError('TTS API request timed out');
      throw new Error('TTS request timed out. Please try again.');
    }
    if (fetchError.status) {
      throw new Error(fetchError.message || `TTS API error: ${fetchError.status}`);
    }
    logError('TTS network error', fetchError);
    throw new Error(`TTS network error: ${fetchError.message}`);
  }
  
  // Get audio data as ArrayBuffer
  const audioBuffer = await response.arrayBuffer();
  
  log('TTS response received', { 
    audioSize: audioBuffer.byteLength,
    contentType: response.headers.get('content-type')
  });
  
  return audioBuffer;
}

/**
 * Split text if it exceeds TTS limit
 * @param {string} text - Text to check/split
 * @param {number} maxLength - Maximum length per chunk
 * @returns {Array<string>} Array of text parts
 */
function splitIfTooLong(text, maxLength) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const parts = [];
  let remaining = text;
  
  while (remaining.length > maxLength) {
    // Find a good split point (end of sentence or word)
    let splitPoint = maxLength;
    
    // Try to find sentence end
    const sentenceEnd = remaining.lastIndexOf('. ', maxLength);
    if (sentenceEnd > maxLength * 0.5) {
      splitPoint = sentenceEnd + 1;
    } else {
      // Fall back to word boundary
      const wordEnd = remaining.lastIndexOf(' ', maxLength);
      if (wordEnd > maxLength * 0.5) {
        splitPoint = wordEnd;
      }
    }
    
    parts.push(remaining.substring(0, splitPoint).trim());
    remaining = remaining.substring(splitPoint).trim();
  }
  
  if (remaining) {
    parts.push(remaining);
  }
  
  // Safety: enforce hard cap to avoid provider errors (e.g., Respeecher 450 chars)
  const capped = [];
  for (const part of parts) {
    let current = part;
    while (current.length > maxLength) {
      capped.push(current.slice(0, maxLength));
      current = current.slice(maxLength).trimStart();
    }
    if (current) capped.push(current);
  }

  return capped;
}

/**
 * Convert text to speech using ElevenLabs TTS API
 * @param {string} text - Text to convert (max 5000 characters)
 * @param {string} apiKey - ElevenLabs API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID to use (default: Rachel)
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0)
 * @param {string} options.format - Output format (default: 'mp3_44100_128')
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
async function textToSpeechElevenLabs(text, apiKey, options = {}) {
  const {
    voice = ELEVENLABS_CONFIG.DEFAULT_VOICE_ID,
    speed = ELEVENLABS_CONFIG.DEFAULT_SPEED,
    format = ELEVENLABS_CONFIG.DEFAULT_FORMAT,
    elevenlabsFormat = ELEVENLABS_CONFIG.DEFAULT_FORMAT,
    elevenlabsModel = ELEVENLABS_CONFIG.DEFAULT_MODEL,
    elevenlabsStability = 0.5,
    elevenlabsSimilarity = 0.75,
    elevenlabsStyle = 0.0,
    elevenlabsSpeakerBoost = true
  } = options;
  
  // Use elevenlabsFormat if provided, otherwise use format
  const finalFormat = elevenlabsFormat || format;
  
  return elevenlabsTTS(text, apiKey, { 
    voiceId: voice, 
    speed, 
    format: finalFormat, 
    modelId: elevenlabsModel,
    stability: elevenlabsStability,
    similarityBoost: elevenlabsSimilarity,
    style: elevenlabsStyle,
    useSpeakerBoost: elevenlabsSpeakerBoost
  });
}

/**
 * Convert text to speech using Qwen3-TTS-Flash API
 * @param {string} text - Text to convert (max 600 characters - very strict!)
 * @param {string} apiKey - Alibaba Cloud DashScope API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice name to use (default: 'Cherry')
 * @param {number} options.speed - Speech speed 0.5-2.0 (default: 1.0, not directly supported)
 * @param {string} options.language - Language code (auto-detected if not provided)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
async function textToSpeechQwen(text, apiKey, options = {}) {
  const {
    voice = QWEN_CONFIG.DEFAULT_VOICE,
    speed = QWEN_CONFIG.DEFAULT_SPEED,
    language = null
  } = options;
  
  return qwenTTS(text, apiKey, { voice, speed, language });
}

/**
 * Convert text to speech using Respeecher API
 * @param {string} text - Text to convert (max 450 characters)
 * @param {string} apiKey - Respeecher API key
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID to use (default: 'samantha')
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format)
 */
async function textToSpeechRespeecher(text, apiKey, options = {}) {
  const {
    voice = RESPEECHER_CONFIG.DEFAULT_VOICE,
    language = null,
    respeecherTemperature = 1.0,
    respeecherRepetitionPenalty = 1.0,
    respeecherTopP = 1.0
  } = options;
  
  return respeecherTTS(text, apiKey, { 
    voice, 
    language,
    temperature: respeecherTemperature,
    repetition_penalty: respeecherRepetitionPenalty,
    top_p: respeecherTopP
  });
}

/**
 * Convert text to speech using Google Gemini 2.5 Pro TTS API
 * @param {string} text - Text to convert (max 5000 characters)
 * @param {string} apiKey - Google API key (same as Gemini API key)
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice name to use (default: 'Callirrhoe')
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0, not supported by Google TTS)
 * @param {string} options.format - Audio format (not supported by Google TTS, always returns WAV)
 * @param {string} options.prompt - Optional style prompt for voice control (emotion, tone)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
async function textToSpeechGoogle(text, apiKey, options = {}) {
  const {
    voice = GOOGLE_TTS_CONFIG.DEFAULT_VOICE,
    prompt = null,
    googleTtsPrompt = null,
    model = 'gemini-2.5-pro-preview-tts',
    googleTtsModel = null
  } = options;
  
  // Use explicit googleTtsModel if provided, otherwise use model
  const finalModel = googleTtsModel || model;
  
  // Use explicit googleTtsPrompt if provided, otherwise use prompt
  const finalPrompt = googleTtsPrompt || prompt;
  
  // Google TTS always returns WAV format (24kHz, 16-bit, mono)
  // Speed is not supported by API
  return googleTTS(text, apiKey, { voice, prompt: finalPrompt, model: finalModel });
}

/**
 * Convert multiple text chunks to speech and concatenate
 * 
 * Note: Requests are processed sequentially (one at a time) to avoid hitting
 * concurrent request limits. For Respeecher, this means we stay within the
 * 5 concurrent requests limit (1 for free trial accounts).
 * 
 * @param {Array<{text: string, index: number}>} chunks - Prepared text chunks
 * @param {string} apiKey - API key (OpenAI, ElevenLabs, Qwen, Respeecher, or Google Cloud)
 * @param {Object} options - TTS options
 * @param {string} options.provider - Provider: 'openai', 'elevenlabs', 'qwen', 'respeecher', or 'google' (default: 'openai')
 * @param {Function} updateState - State update callback
 * @returns {Promise<ArrayBuffer>} Concatenated audio data
 */
export async function chunksToSpeech(chunks, apiKey, options = {}, updateState = null) {
  log('=== chunksToSpeech START ===', {
    chunksCount: chunks?.length,
    provider: options.provider,
    voice: options.voice
  });
  
  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks provided for TTS');
  }
  
  const provider = options.provider || 'openai';
  let maxInput;
  if (provider === 'elevenlabs') {
    maxInput = ELEVENLABS_CONFIG.MAX_INPUT;
  } else if (provider === 'qwen') {
    maxInput = QWEN_CONFIG.MAX_INPUT;
  } else if (provider === 'respeecher') {
    maxInput = RESPEECHER_CONFIG.MAX_INPUT;
  } else if (provider === 'google') {
    maxInput = GOOGLE_TTS_CONFIG.MAX_INPUT;
  } else {
    maxInput = AUDIO_CONFIG.TTS_MAX_INPUT;
  }
  
  log('TTS provider config', { provider, maxInput });
  
  // Expand chunks that exceed TTS limit
  const expandedChunks = [];
  for (const chunk of chunks) {
    const parts = splitIfTooLong(chunk.text, maxInput);
    for (let i = 0; i < parts.length; i++) {
      expandedChunks.push({
        text: parts[i],
        index: chunk.index,
        subIndex: parts.length > 1 ? i : null
      });
    }
  }
  
  log('Chunks expanded', { originalChunks: chunks.length, expandedChunks: expandedChunks.length });
  
  const audioBuffers = [];
  const progressBase = 60; // Start at 60% (after preparation)
  const progressRange = 35; // Use 60-95% for TTS conversion
  
  for (let i = 0; i < expandedChunks.length; i++) {
    const chunk = expandedChunks[i];
    const progress = progressBase + Math.floor((i / expandedChunks.length) * progressRange);
    
    updateState?.({
      stage: PROCESSING_STAGES.GENERATING.id,
      status: `Converting segment ${i + 1}/${expandedChunks.length} to speech...`, 
      progress 
    });
    
    try {
      // Pass all options including ElevenLabs advanced settings and OpenAI instructions
      const audioBuffer = await textToSpeech(chunk.text, apiKey, options);
      audioBuffers.push(audioBuffer);
    } catch (error) {
      logError(`Failed to convert chunk ${i + 1}`, error);
      throw new Error(`Failed to convert segment ${i + 1}: ${error.message}`);
    }
  }
  
  // Log all buffers before concatenation
  log('=== CONCATENATION START ===', { buffersCount: audioBuffers.length });
  
  // Concatenate all audio buffers
  updateState?.({ status: 'Assembling audio file...', progress: 95 });
  
  const concatenated = concatenateAudioBuffers(audioBuffers);
  
  // Check final result
  log('=== CONCATENATION COMPLETE ===', { chunkCount: audioBuffers.length, totalSize: concatenated.byteLength });
  
  return concatenated;
}

/**
 * Check if buffer is WAV format (starts with RIFF)
 * @param {ArrayBuffer} buffer - Audio buffer
 * @returns {boolean} True if WAV
 */
function isWavBuffer(buffer) {
  if (!buffer || buffer.byteLength < 12) return false;
  const view = new Uint8Array(buffer);
  // Check for "RIFF" at start and "WAVE" at offset 8
  return view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 &&
         view[8] === 0x57 && view[9] === 0x41 && view[10] === 0x56 && view[11] === 0x45;
}

/**
 * Find the data chunk in a WAV buffer
 * @param {Uint8Array} view - WAV buffer view
 * @returns {{dataStart: number, dataSize: number}} Data chunk info
 */
function findWavDataChunk(view) {
  let offset = 12; // Skip RIFF header
  
  while (offset < view.length - 8) {
    const chunkId = String.fromCharCode(view[offset], view[offset + 1], view[offset + 2], view[offset + 3]);
    const chunkSize = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
    
    if (chunkId === 'data') {
      return { dataStart: offset + 8, dataSize: chunkSize };
    }
    
    offset += 8 + chunkSize;
    // Ensure even offset
    if (chunkSize % 2 !== 0) offset++;
  }
  
  // If no data chunk found, assume everything after header is data
  return { dataStart: 44, dataSize: view.length - 44 };
}

/**
 * Concatenate multiple WAV buffers into one
 * @param {Array<ArrayBuffer>} buffers - Array of WAV buffers
 * @returns {ArrayBuffer} Combined WAV buffer
 */
function concatenateWavBuffers(buffers) {
  log('=== WAV CONCATENATION START ===', { buffersCount: buffers.length });
  
  // Extract audio data from each buffer
  const dataChunks = [];
  let totalDataSize = 0;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let numChannels = 1;
  
  for (let i = 0; i < buffers.length; i++) {
    const view = new Uint8Array(buffers[i]);
    const { dataStart, dataSize } = findWavDataChunk(view);
    
    // Extract format info from first buffer
    if (i === 0 && view.length >= 44) {
      numChannels = view[22] | (view[23] << 8);
      sampleRate = view[24] | (view[25] << 8) | (view[26] << 16) | (view[27] << 24);
      bitsPerSample = view[34] | (view[35] << 8);
      log('WAV format detected', { numChannels, sampleRate, bitsPerSample });
    }
    
    const audioData = view.slice(dataStart, dataStart + dataSize);
    dataChunks.push(audioData);
    totalDataSize += audioData.length;
  }
  
  // Create new WAV file
  const headerSize = 44;
  const totalSize = headerSize + totalDataSize;
  const result = new ArrayBuffer(totalSize);
  const view = new Uint8Array(result);
  const dataView = new DataView(result);
  
  // Write WAV header
  // "RIFF"
  view[0] = 0x52; view[1] = 0x49; view[2] = 0x46; view[3] = 0x46;
  // File size - 8
  dataView.setUint32(4, totalSize - 8, true);
  // "WAVE"
  view[8] = 0x57; view[9] = 0x41; view[10] = 0x56; view[11] = 0x45;
  // "fmt "
  view[12] = 0x66; view[13] = 0x6D; view[14] = 0x74; view[15] = 0x20;
  // fmt chunk size (16 for PCM)
  dataView.setUint32(16, 16, true);
  // Audio format (1 = PCM)
  dataView.setUint16(20, 1, true);
  // Number of channels
  dataView.setUint16(22, numChannels, true);
  // Sample rate
  dataView.setUint32(24, sampleRate, true);
  // Byte rate
  dataView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  // Block align
  dataView.setUint16(32, numChannels * (bitsPerSample / 8), true);
  // Bits per sample
  dataView.setUint16(34, bitsPerSample, true);
  // "data"
  view[36] = 0x64; view[37] = 0x61; view[38] = 0x74; view[39] = 0x61;
  // Data size
  dataView.setUint32(40, totalDataSize, true);
  
  // Copy all audio data
  let offset = headerSize;
  for (const chunk of dataChunks) {
    view.set(chunk, offset);
    offset += chunk.length;
  }
  
  log('=== WAV CONCATENATION COMPLETE ===', { chunksCount: dataChunks.length, totalSize });
  
  return result;
}

/**
 * Concatenate multiple audio ArrayBuffers
 * Handles both MP3 (simple concat) and WAV (proper header merging)
 * @param {Array<ArrayBuffer>} buffers - Array of audio buffers
 * @returns {ArrayBuffer} Concatenated buffer
 */
function concatenateAudioBuffers(buffers) {
  log('concatenateAudioBuffers called', { buffersCount: buffers?.length });
  
  if (!buffers || buffers.length === 0) return new ArrayBuffer(0);
  
  if (buffers.length === 1) return buffers[0];
  
  // Check if buffers are WAV format
  if (isWavBuffer(buffers[0])) {
    return concatenateWavBuffers(buffers);
  }
  
  // For MP3 and other formats, simple concatenation works
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  
  // Create new buffer
  const result = new ArrayBuffer(totalLength);
  const view = new Uint8Array(result);
  
  // Copy all buffers
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    const bufferView = new Uint8Array(buffer);
    
    view.set(bufferView, offset);
    offset += buffer.byteLength;
  }

  return result;
}

/**
 * Get MIME type for audio format
 * @param {string} format - Audio format (mp3, opus, aac, flac, wav, pcm, LINEAR16, OGG_OPUS, ALAW, MULAW, or ElevenLabs format)
 * @returns {string} MIME type
 */
export function getAudioMimeType(format) {
  // Handle ElevenLabs formats
  if (format.startsWith('mp3')) {
    return 'audio/mpeg';
  } else if (format.startsWith('pcm')) {
    return 'audio/pcm';
  } else if (format.startsWith('ulaw')) {
    return 'audio/basic';
  }
  
  // Google Gemini TTS formats
  const googleFormats = {
    'LINEAR16': 'audio/wav',
    'OGG_OPUS': 'audio/ogg',
    'ALAW': 'audio/basic',
    'MULAW': 'audio/basic',
    'PCM': 'audio/pcm'
  };
  if (googleFormats[format]) {
    return googleFormats[format];
  }
  
  // OpenAI formats
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'opus': 'audio/opus',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'wav': 'audio/wav',
    'pcm': 'audio/pcm'
  };
  return mimeTypes[format] || 'audio/mpeg';
}

/**
 * Get file extension for audio format
 * @param {string} format - Audio format
 * @returns {string} File extension
 */
export function getAudioExtension(format) {
  // Handle ElevenLabs formats
  if (format.startsWith('mp3')) {
    return 'mp3';
  } else if (format.startsWith('pcm')) {
    return 'pcm';
  } else if (format.startsWith('ulaw')) {
    return 'ulaw';
  }
  
  // Google Gemini TTS formats
  const googleExtensions = {
    'LINEAR16': 'wav',
    'OGG_OPUS': 'opus',
    'ALAW': 'alaw',
    'MULAW': 'ulaw',
    'PCM': 'pcm',
    'MP3': 'mp3'
  };
  if (googleExtensions[format]) {
    return googleExtensions[format];
  }
  
  // OpenAI formats
  const extensions = {
    'mp3': 'mp3',
    'opus': 'opus',
    'aac': 'aac',
    'flac': 'flac',
    'wav': 'wav',
    'pcm': 'pcm'
  };
  return extensions[format] || 'mp3';
}

