// Audio generation module for ClipAIble extension
// Orchestrates text preparation and TTS conversion

// @typedef {import('../types.js').ContentItem} ContentItem

import { log, logError, logDebug } from '../utils/logging.js';
import { prepareContentForAudio, AUDIO_CONFIG } from './audio-prep.js';
import { chunksToSpeech, getAudioExtension } from '../api/tts.js';
import { PROCESSING_STAGES, getProcessingState } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';
import { cleanTitleForFilename } from '../utils/html.js';

// Language to TTS instruction mapping
const LANGUAGE_TTS_INSTRUCTIONS = {
  'en': 'Read in clear English with natural pronunciation.',
  'ru': 'Читай на русском языке с естественным произношением.',
  'ua': 'Читай українською мовою з природною вимовою.',
  'de': 'Lies auf Deutsch mit natürlicher Aussprache vor.',
  'fr': 'Lis en français avec une prononciation naturelle.',
  'es': 'Lee en español con pronunciación natural.',
  'it': 'Leggi in italiano con pronuncia naturale.',
  'pt': 'Leia em português com pronúncia natural.',
  'zh': '用自然的中文发音朗读。',
  'ja': '自然な日本語の発音で読んでください。',
  'ko': '자연스러운 한국어 발음으로 읽어주세요.'
};

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
  log('[ClipAIble Audio Generation] === generateAudio ENTRY POINT ===', {
    timestamp: entryTime,
    hasParams: !!params,
    paramsKeys: params ? Object.keys(params) : [],
    hasUpdateState: typeof updateState === 'function'
  });
  
  logDebug('[ClipAIble Audio Generation] === generateAudio START ===', {
    timestamp: entryTime,
    paramsKeys: params ? Object.keys(params) : []
  });
  
  const {
    content,
    title,
    apiKey,
    ttsApiKey,
    model,
    provider = 'openai',
    voice = AUDIO_CONFIG.DEFAULT_VOICE,
    speed = AUDIO_CONFIG.DEFAULT_SPEED,
    format = 'mp3',
    language = 'auto',
    elevenlabsModel = 'eleven_v3',
    elevenlabsFormat = 'mp3_44100_192',
    elevenlabsStability = 0.5,
    elevenlabsSimilarity = 0.75,
    elevenlabsStyle = 0.0,
    elevenlabsSpeakerBoost = true,
    openaiInstructions = null,
    googleTtsModel = 'gemini-2.5-pro-preview-tts',
    googleTtsVoice = 'Callirrhoe',
    googleTtsPrompt = null,
    respeecherTemperature = 1.0,
    respeecherRepetitionPenalty = 1.0,
    respeecherTopP = 1.0,
    tabId = null
  } = params;
  
  // Log all settings and configuration
  const allSettings = {
    timestamp: Date.now(),
    // TTS Provider Settings
    provider,
    voice,
    speed,
    format,
    language,
    tabId,
    // Content Settings
    contentItems: content?.length,
    title: title?.substring(0, 100),
    // API Keys
    hasApiKey: !!apiKey,
    hasTtsApiKey: !!ttsApiKey,
    // Model Settings
    model,
    // Provider-specific settings
    ...(provider === 'elevenlabs' && {
      elevenlabsModel,
      elevenlabsFormat,
      elevenlabsStability,
      elevenlabsSimilarity,
      elevenlabsStyle,
      elevenlabsSpeakerBoost
    }),
    ...(provider === 'google' && {
      googleTtsModel,
      googleTtsVoice,
      hasGoogleTtsPrompt: !!googleTtsPrompt
    }),
    ...(provider === 'respeecher' && {
      respeecherTemperature,
      respeecherRepetitionPenalty,
      respeecherTopP
    }),
    ...(provider === 'openai' && {
      hasOpenaiInstructions: !!openaiInstructions
    }),
    // Audio Config
    audioConfig: {
      minChunkSize: AUDIO_CONFIG.MIN_CHUNK_SIZE,
      maxChunkSize: AUDIO_CONFIG.MAX_CHUNK_SIZE,
      idealChunkSize: AUDIO_CONFIG.IDEAL_CHUNK_SIZE,
      ttsMaxInput: AUDIO_CONFIG.TTS_MAX_INPUT,
      minSpeed: AUDIO_CONFIG.MIN_SPEED,
      maxSpeed: AUDIO_CONFIG.MAX_SPEED,
      defaultSpeed: AUDIO_CONFIG.DEFAULT_SPEED,
      defaultVoice: AUDIO_CONFIG.DEFAULT_VOICE,
      availableVoices: AUDIO_CONFIG.VOICES
    }
  };
  
  log('[ClipAIble Audio Generation] Parameters extracted with all settings', allSettings);
  
  // Generate TTS instructions based on language
  const instructions = language !== 'auto' ? LANGUAGE_TTS_INSTRUCTIONS[language] : null;
  
  log('[ClipAIble Audio Generation] Starting audio generation', {
    timestamp: Date.now(),
    title,
    contentItems: content?.length,
    model,
    provider,
    voice,
    speed,
    format,
    language,
    tabId,
    hasInstructions: !!instructions
  });
  
  log('[ClipAIble Audio Generation] Starting audio generation', { 
    title, 
    contentItems: content?.length,
    model,
    provider,
    voice,
    speed,
    format,
    language,
    tabId,
    elevenlabsModel: provider === 'elevenlabs' ? elevenlabsModel : undefined,
    hasInstructions: !!instructions,
    timestamp: entryTime
  });
  
  if (!content || content.length === 0) {
    throw new Error('No content to convert to audio');
  }
  
  if (!apiKey) {
    throw new Error('No API key provided for text preparation');
  }
  
  if (!ttsApiKey && provider !== 'offline') {
    throw new Error(`No ${provider} API key provided for TTS`);
  }
  
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
  
  // Determine voice and format based on provider (must be before logging)
  const ttsVoice = provider === 'google' ? googleTtsVoice : voice;
  // Google TTS and Offline TTS always return WAV format, format parameter is ignored
  const ttsFormat = (provider === 'google' || provider === 'offline') ? 'wav' : format;
  const ttsPrompt = provider === 'google' ? googleTtsPrompt : null;
  
  log('[ClipAIble Audio Generation] === CONTENT PREPARED FOR TTS ===', { 
    timestamp: Date.now(),
    chunkCount: preparedChunks.length,
    totalCharacters: preparedChunks.reduce((sum, c) => sum + c.text.length, 0),
    avgChunkSize: Math.round(preparedChunks.reduce((sum, c) => sum + c.text.length, 0) / preparedChunks.length),
    chunkSizes: preparedChunks.map(c => c.text.length),
    chunksPreview: preparedChunks.slice(0, 3).map((c, i) => ({
      index: i,
      length: c.text.length,
      preview: c.text.substring(0, 100) + '...'
    })),
    readyForTTS: true,
    provider,
    voice: ttsVoice,
    speed,
    format: ttsFormat,
    language
  });
  
  // Log full chunks that will be sent to TTS
  log('[ClipAIble Audio Generation] === CHUNKS TO BE SENT TO TTS (FULL CONTENT) ===', {
    timestamp: Date.now(),
    provider,
    voice: ttsVoice,
    speed,
    format: ttsFormat,
    language,
    totalChunks: preparedChunks.length,
    chunks: preparedChunks.map((chunk, idx) => ({
      index: idx,
      originalIndex: chunk.originalIndex,
      length: chunk.text.length,
      textFull: chunk.text,
      textPreview: chunk.text.substring(0, 300) + '...',
      textEnd: '...' + chunk.text.substring(Math.max(0, chunk.text.length - 100)),
      nonAsciiCount: (chunk.text.match(/[^\x00-\x7F]/g) || []).length,
      newlineCount: (chunk.text.match(/\n/g) || []).length
    }))
  });
  
  // Step 2: Convert chunks to speech (using selected TTS provider)
  const providerName = provider === 'offline' ? 'Piper TTS (offline)' :
                       (provider === 'elevenlabs' ? 'ElevenLabs' : 
                       (provider === 'qwen' ? 'Qwen' : 
                       (provider === 'google' ? 'Google Gemini TTS' : 
                       (provider === 'respeecher' ? 'Respeecher' : 'OpenAI'))));
  updateState?.({ 
    stage: PROCESSING_STAGES.GENERATING.id,
    status: `Converting to speech using ${providerName}...`, 
    progress: 60 
  });
  
  log('[ClipAIble Audio Generation] CRITICAL: Voice parameter before chunksToSpeech', {
    timestamp: Date.now(),
    provider,
    voice,
    voiceType: typeof voice,
    voiceValue: String(voice),
    ttsVoice,
    ttsVoiceType: typeof ttsVoice,
    ttsVoiceValue: String(ttsVoice),
    isNumeric: /^\d+$/.test(String(ttsVoice)),
    hasUnderscore: ttsVoice && String(ttsVoice).includes('_'),
    hasDash: ttsVoice && String(ttsVoice).includes('-'),
    isFullVoiceId: ttsVoice && String(ttsVoice).includes('_') && String(ttsVoice).includes('-')
  });
  
  log('[ClipAIble Audio Generation] === PREPARING TO CALL chunksToSpeech ===', {
    timestamp: Date.now(),
    provider,
    voice: ttsVoice,
    speed,
    format: ttsFormat,
    language,
    tabId: params.tabId || null,
    chunksCount: preparedChunks.length,
    hasTtsApiKey: !!ttsApiKey
  });
  
  log('[ClipAIble Audio Generation] Calling chunksToSpeech', {
    provider,
    voice: ttsVoice,
    speed,
    format: ttsFormat,
    language,
    tabId: params.tabId || null,
    chunksCount: preparedChunks.length,
    timestamp: Date.now()
  });
  
  const chunksToSpeechStart = Date.now();
  const audioBuffer = await chunksToSpeech(
    preparedChunks,
    ttsApiKey,
    { 
      provider, 
      voice: ttsVoice, 
      speed, 
      format: ttsFormat, 
      instructions: openaiInstructions || instructions, 
      openaiInstructions: openaiInstructions,
      prompt: ttsPrompt,
      googleTtsPrompt: ttsPrompt,
      elevenlabsModel,
      elevenlabsFormat,
      elevenlabsStability,
      elevenlabsSimilarity,
      elevenlabsStyle,
      elevenlabsSpeakerBoost,
      googleTtsModel,
      respeecherTemperature,
      respeecherRepetitionPenalty,
      respeecherTopP,
      language,
      tabId: params.tabId || null // Pass tabId for offline TTS
    },
    updateState
  );
  
  const chunksToSpeechDuration = Date.now() - chunksToSpeechStart;
  log('[ClipAIble Audio Generation] === chunksToSpeech COMPLETE ===', {
    timestamp: Date.now(),
    duration: chunksToSpeechDuration,
    hasAudioBuffer: !!audioBuffer,
    audioBufferSize: audioBuffer?.byteLength
  });
  
  log('[ClipAIble Audio Generation] chunksToSpeech completed', {
    duration: chunksToSpeechDuration,
    audioBufferSize: audioBuffer?.byteLength,
    timestamp: Date.now()
  });
  
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

