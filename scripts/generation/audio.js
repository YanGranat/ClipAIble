// Audio generation module for ClipAIble extension
// Orchestrates text preparation and TTS conversion

import { log, logError } from '../utils/logging.js';
import { prepareContentForAudio, AUDIO_CONFIG } from './audio-prep.js';
import { chunksToSpeech, getAudioExtension } from '../api/tts.js';

// Language to TTS instruction mapping
const LANGUAGE_TTS_INSTRUCTIONS = {
  'en': 'Read in clear English with natural pronunciation.',
  'ru': 'Читай на русском языке с естественным произношением.',
  'uk': 'Читай українською мовою з природною вимовою.',
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
 * @param {Function} updateState - State update callback
 * @returns {Promise<void>} Triggers download when complete
 */
export async function generateAudio(params, updateState) {
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
    elevenlabsModel = 'eleven_multilingual_v2'
  } = params;
  
  // Generate TTS instructions based on language
  const instructions = language !== 'auto' ? LANGUAGE_TTS_INSTRUCTIONS[language] : null;
  
  log('Starting audio generation', { 
    title, 
    contentItems: content?.length,
    model,
    provider,
    voice,
    speed,
    format,
    language,
    elevenlabsModel: provider === 'elevenlabs' ? elevenlabsModel : undefined,
    hasInstructions: !!instructions
  });
  
  if (!content || content.length === 0) {
    throw new Error('No content to convert to audio');
  }
  
  if (!apiKey) {
    throw new Error('No API key provided for text preparation');
  }
  
  if (!ttsApiKey) {
    throw new Error(`No ${provider} API key provided for TTS`);
  }
  
  // Step 1: Prepare content for audio (using main model like GPT-5.1)
  updateState?.({ 
    status: 'Preparing article for audio narration...', 
    progress: 5 
  });
  
  const preparedChunks = await prepareContentForAudio(
    content,
    title,
    apiKey,
    model,
    language,
    updateState
  );
  
  if (!preparedChunks || preparedChunks.length === 0) {
    throw new Error('Failed to prepare content for audio');
  }
  
  log('Content prepared', { 
    chunkCount: preparedChunks.length,
    totalCharacters: preparedChunks.reduce((sum, c) => sum + c.text.length, 0)
  });
  
  // Step 2: Convert chunks to speech (using selected TTS provider)
  updateState?.({ 
    status: `Converting to speech using ${provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}...`, 
    progress: 60 
  });
  
  const audioBuffer = await chunksToSpeech(
    preparedChunks,
    ttsApiKey,
    { provider, voice, speed, format, instructions, elevenlabsModel },
    updateState
  );
  
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    throw new Error('Audio generation returned empty result');
  }
  
  log('Audio generated', { 
    totalSize: audioBuffer.byteLength,
    format
  });
  
  // Step 3: Download the audio file
  updateState?.({ 
    status: 'Downloading audio file...', 
    progress: 98 
  });
  
  const extension = getAudioExtension(format);
  const filename = sanitizeFilename(title || 'article') + '.' + extension;
  
  await downloadAudio(audioBuffer, filename, format);
  
  updateState?.({ 
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
  
  // Create data URL
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to create data URL'));
    reader.readAsDataURL(blob);
  });
  
  // Download using Chrome downloads API
  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
  });
  
  log('Audio download initiated', { filename, size: buffer.byteLength });
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
    'pcm': 'audio/pcm'
  };
  return types[format] || 'audio/mpeg';
}

/**
 * Sanitize filename for safe download
 * @param {string} name - Raw filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, '_')         // Replace spaces with underscores
    .replace(/_+/g, '_')          // Collapse multiple underscores
    .replace(/^_|_$/g, '')        // Remove leading/trailing underscores
    .substring(0, 100);           // Limit length
}

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

