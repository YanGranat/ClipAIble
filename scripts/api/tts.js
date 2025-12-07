// Text-to-Speech API module for ClipAIble extension
// Supports OpenAI and ElevenLabs providers

import { log, logError } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { AUDIO_CONFIG } from '../generation/audio-prep.js';
import { textToSpeech as elevenlabsTTS, ELEVENLABS_CONFIG } from './elevenlabs.js';

/**
 * Convert text to speech using TTS API (OpenAI or ElevenLabs)
 * @param {string} text - Text to convert
 * @param {string} apiKey - API key (OpenAI or ElevenLabs)
 * @param {Object} options - TTS options
 * @param {string} options.provider - Provider: 'openai' or 'elevenlabs' (default: 'openai')
 * @param {string} options.voice - Voice to use (OpenAI: voice name, ElevenLabs: voice ID)
 * @param {number} options.speed - Speech speed 0.25-4.0 (default: 1.0)
 * @param {string} options.format - Output format (default: 'mp3')
 * @param {string} options.instructions - Voice style instructions (OpenAI only)
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
 */
export async function textToSpeech(text, apiKey, options = {}) {
  const { provider = 'openai' } = options;
  
  if (provider === 'elevenlabs') {
    return textToSpeechElevenLabs(text, apiKey, options);
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
    instructions = null
  } = options;
  
  log('textToSpeech called', { 
    textLength: text?.length, 
    voice, 
    speed, 
    format,
    hasInstructions: !!instructions
  });
  
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
  if (instructions) {
    requestBody.instructions = instructions;
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
            const retryableCodes = [429, 500, 502, 503, 504];
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
  
  log('Text exceeds TTS limit, splitting', { length: text.length, limit: maxLength });
  
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
  
  return parts;
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
    elevenlabsModel = ELEVENLABS_CONFIG.DEFAULT_MODEL
  } = options;
  
  return elevenlabsTTS(text, apiKey, { voiceId: voice, speed, format, modelId: elevenlabsModel });
}

/**
 * Convert multiple text chunks to speech and concatenate
 * @param {Array<{text: string, index: number}>} chunks - Prepared text chunks
 * @param {string} apiKey - API key (OpenAI or ElevenLabs)
 * @param {Object} options - TTS options
 * @param {string} options.provider - Provider: 'openai' or 'elevenlabs' (default: 'openai')
 * @param {Function} updateState - State update callback
 * @returns {Promise<ArrayBuffer>} Concatenated audio data
 */
export async function chunksToSpeech(chunks, apiKey, options = {}, updateState = null) {
  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks provided for TTS');
  }
  
  const provider = options.provider || 'openai';
  const maxInput = provider === 'elevenlabs' ? ELEVENLABS_CONFIG.MAX_INPUT : AUDIO_CONFIG.TTS_MAX_INPUT;
  
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
  
  log('Converting chunks to speech', { 
    originalChunks: chunks.length, 
    expandedChunks: expandedChunks.length 
  });
  
  const audioBuffers = [];
  const progressBase = 60; // Start at 60% (after preparation)
  const progressRange = 35; // Use 60-95% for TTS conversion
  
  for (let i = 0; i < expandedChunks.length; i++) {
    const chunk = expandedChunks[i];
    const progress = progressBase + Math.floor((i / expandedChunks.length) * progressRange);
    
    updateState?.({ 
      status: `Converting segment ${i + 1}/${expandedChunks.length} to speech...`, 
      progress 
    });
    
    try {
      const audioBuffer = await textToSpeech(chunk.text, apiKey, options);
      audioBuffers.push(audioBuffer);
      
      log(`Chunk ${i + 1}/${expandedChunks.length} converted`, { 
        textLength: chunk.text.length,
        audioSize: audioBuffer.byteLength 
      });
    } catch (error) {
      logError(`Failed to convert chunk ${i + 1}`, error);
      throw new Error(`Failed to convert segment ${i + 1}: ${error.message}`);
    }
  }
  
  // Concatenate all audio buffers
  updateState?.({ status: 'Assembling audio file...', progress: 95 });
  
  const concatenated = concatenateAudioBuffers(audioBuffers);
  
  log('Audio concatenation complete', { 
    totalSize: concatenated.byteLength,
    chunkCount: audioBuffers.length
  });
  
  return concatenated;
}

/**
 * Concatenate multiple audio ArrayBuffers
 * For MP3 format, we can simply concatenate the buffers
 * @param {Array<ArrayBuffer>} buffers - Array of audio buffers
 * @returns {ArrayBuffer} Concatenated buffer
 */
function concatenateAudioBuffers(buffers) {
  if (!buffers || buffers.length === 0) {
    return new ArrayBuffer(0);
  }
  
  if (buffers.length === 1) {
    return buffers[0];
  }
  
  // Calculate total length
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  
  // Create new buffer
  const result = new ArrayBuffer(totalLength);
  const view = new Uint8Array(result);
  
  // Copy all buffers
  let offset = 0;
  for (const buffer of buffers) {
    view.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return result;
}

/**
 * Get MIME type for audio format
 * @param {string} format - Audio format (mp3, opus, aac, flac, wav, pcm, or ElevenLabs format)
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

