// Audio generation module for ClipAIble extension
// Orchestrates text preparation and TTS conversion

// @typedef {import('../types.js').ContentItem} ContentItem

import { log } from '../utils/logging.js';
import { prepareContentForAudio } from './audio-prep.js';
import { chunksToSpeech, getAudioExtension } from '../api/tts.js';
import { PROCESSING_STAGES, getProcessingState } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';
import { cleanTitleForFilename } from '../utils/html.js';
import {
  buildAudioSettings,
  validateAudioParams,
  getTTSInstructions,
  getTTSVoiceAndFormat,
  getProviderName,
  buildTTSOptions,
  logAudioGenerationStart,
  logPreparedChunks,
  logTTSCallPreparation,
  logTTSCompletion
} from './audio-helpers.js';

/**
 * Generate audio file from article content
 * @param {Object} params - Generation parameters
 * @param {Array} params.content - Content items from extraction
 * @param {string} params.title - Article title
 * @param {string} params.apiKey - API key for text preparation (OpenAI/Claude/Gemini)
 * @param {string} params.ttsApiKey - API key for TTS (OpenAI or ElevenLabs)
 * @param {string} params.model - Model for text preparation (e.g., 'gpt-5.1')
 * @param {string} params.provider - TTS provider: 'openai' or 'elevenlabs' (default: 'openai')
 * @param {string} params.voice - TTS voice (OpenAI: voice name, ElevenLabs: voice ID)
 * @param {number} params.speed - TTS speed 0.25-4.0 (default: 1.0)
 * @param {string} params.format - Audio format (default: 'mp3')
 * @param {string} params.language - Target language for TTS pronunciation (default: 'auto')
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update callback
 * @returns {Promise<void>} Triggers download when complete
 */
export async function generateAudio(params, updateState) {
  const entryTime = Date.now();
  const {
    content,
    title,
    apiKey,
    ttsApiKey,
    model,
    provider = 'openai',
    voice,
    speed,
    format = 'mp3',
    language = 'auto',
    googleTtsVoice,
    googleTtsPrompt,
    tabId = null
  } = params;

  // Build settings and log start
  const allSettings = buildAudioSettings(params);
  logAudioGenerationStart(entryTime, { ...params, updateState }, allSettings);

  // Validate parameters
  validateAudioParams(params, provider);
  
  // Step 1: Prepare content for audio (using main model like GPT-5.1)
  // Get current progress to avoid rollback (e.g., if translation was done, progress might be 60%)
  const currentState = getProcessingState();
  const currentProgress = currentState?.progress || 0;
  // Start from current progress if >= 60% (translation was done), otherwise start from 5%
  // This prevents progress rollback when starting audio generation after translation
  const startProgress = currentProgress >= 60 ? currentProgress : 5;
  
  updateState?.({ 
    stage: PROCESSING_STAGES.GENERATING.id,
    status: 'Preparing article for audio narration...', 
    progress: startProgress 
  });
  
  // For offline TTS, skip AI cleanup to avoid unnecessary API calls and costs
  // Offline TTS will use basic cleanup instead
  const useAICleanup = provider !== 'offline';
  
  log('[ClipAIble Audio Generation] Text preparation mode', {
    provider,
    useAICleanup,
    reason: useAICleanup 
      ? 'Using AI cleanup for better text quality' 
      : 'Using basic cleanup for offline TTS (no API calls needed)'
  });
  
  const preparedChunks = await prepareContentForAudio(
    content,
    title,
    useAICleanup ? apiKey : null, // Pass null API key for offline to skip AI cleanup
    useAICleanup ? model : null,  // Pass null model for offline to skip AI cleanup
    language,
    updateState,
    provider // Pass provider to control cleanup mode
  );
  
  if (!preparedChunks || preparedChunks.length === 0) {
    throw new Error('Failed to prepare content for audio');
  }
  
  // Determine voice and format based on provider
  const { ttsVoice, ttsFormat } = getTTSVoiceAndFormat(provider, voice, format, googleTtsVoice);
  const ttsPrompt = provider === 'google' ? googleTtsPrompt : null;

  // Log prepared chunks
  logPreparedChunks(preparedChunks, provider, ttsVoice, speed, ttsFormat, language);

  // Step 2: Convert chunks to speech (using selected TTS provider)
  const providerName = getProviderName(provider);
  updateState?.({ 
    stage: PROCESSING_STAGES.GENERATING.id,
    status: `Converting to speech using ${providerName}...`, 
    progress: 60 
  });

  // Log TTS call preparation
  logTTSCallPreparation(provider, ttsVoice, speed, ttsFormat, language, tabId, preparedChunks.length, !!ttsApiKey);

  // Generate TTS instructions
  const instructions = getTTSInstructions(language);
  const ttsOptions = buildTTSOptions(params, ttsVoice, ttsFormat, ttsPrompt, instructions);

  // Convert chunks to speech
  const chunksToSpeechStart = Date.now();
  const audioBuffer = await chunksToSpeech(preparedChunks, ttsApiKey, ttsOptions, updateState);
  
  // Log completion
  logTTSCompletion(chunksToSpeechStart, audioBuffer);
  
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Audio generation returned empty result');
  }
  
  // Detect actual format from buffer (API may return different format than requested)
  const actualFormat = detectAudioFormat(audioBuffer);
  
  log('Audio generated', { 
    totalSize: audioBuffer.byteLength,
    requestedFormat: format,
    actualFormat
  });
  
  // Step 3: Download the audio file
  updateState?.({ 
    stage: PROCESSING_STAGES.GENERATING.id,
    status: 'Downloading audio file...', 
    progress: 98 
  });
  
  const extension = getAudioExtension(actualFormat);
  // Title should already be cleaned in background.js, but do final cleanup just in case
  const cleanTitle = cleanTitleForFilename(title || 'article');
  const filename = sanitizeFilename(cleanTitle) + '.' + extension;
  
  // Use actual format for MIME/extension to avoid corrupt files (e.g., WAV from Qwen/Respeecher)
  await downloadAudio(audioBuffer, filename, actualFormat);
  
  updateState?.({ 
    stage: PROCESSING_STAGES.COMPLETE.id,
    status: 'Done!', 
    progress: 100 
  });
  
  log('Audio download complete', { filename });
}

/**
 * Download audio buffer as file
 * @param {ArrayBuffer} buffer - Audio data
 * @param {string} filename - Target filename
 * @param {string} format - Audio format for MIME type
 */
async function downloadAudio(buffer, filename, format) {
  const mimeType = getMimeType(format);
  
  // Create blob from buffer
  const blob = new Blob([buffer], { type: mimeType });

  // In MV3 service worker URL.createObjectURL may be unavailable.
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);

  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url: objectUrl,
        filename: filename,
        saveAs: true
      });
      log('Audio download initiated', { filename, size: buffer.byteLength });
    } finally {
      urlApi.revokeObjectURL(objectUrl);
    }
  } else {
    // Fallback for environments without createObjectURL (MV3 SW)
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    log('Audio download initiated (data URL fallback)', { filename, size: buffer.byteLength });
  }
}

/**
 * Detect audio format from buffer header
 * @param {ArrayBuffer} buffer - Audio buffer
 * @returns {string} Detected format ('wav', 'mp3', 'ogg', etc.)
 */
function detectAudioFormat(buffer) {
  if (!buffer || buffer.byteLength < 12) return 'mp3';
  
  const view = new Uint8Array(buffer);
  
  // WAV: starts with "RIFF" and has "WAVE" at offset 8
  if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 &&
      view[8] === 0x57 && view[9] === 0x41 && view[10] === 0x56 && view[11] === 0x45) {
    return 'wav';
  }
  
  // MP3: starts with ID3 tag or frame sync
  if ((view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) || // ID3
      (view[0] === 0xFF && (view[1] & 0xE0) === 0xE0)) { // Frame sync
    return 'mp3';
  }
  
  // OGG: starts with "OggS"
  if (view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) {
    return 'ogg';
  }
  
  // FLAC: starts with "fLaC"
  if (view[0] === 0x66 && view[1] === 0x4C && view[2] === 0x61 && view[3] === 0x43) {
    return 'flac';
  }
  
  // Default to mp3
  return 'mp3';
}

/**
 * Get MIME type for format
 * @param {string} format - Audio format
 * @returns {string} MIME type
 */
function getMimeType(format) {
  const types = {
    'mp3': 'audio/mpeg',
    'opus': 'audio/opus',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'pcm': 'audio/pcm'
  };
  return types[format] || 'audio/mpeg';
}

// cleanTitleForFilename is now imported from utils/html.js

/**
 * Estimate audio duration from text
 * Average speaking rate: ~150 words per minute
 * @param {string} text - Text to estimate
 * @returns {number} Estimated duration in seconds
 */
export function estimateAudioDuration(text) {
  if (!text) return 0;
  
  const wordCount = text.split(/\s+/).filter(w => w).length;
  const wordsPerMinute = 150;
  
  return Math.ceil((wordCount / wordsPerMinute) * 60);
}

/**
 * Format duration as MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

