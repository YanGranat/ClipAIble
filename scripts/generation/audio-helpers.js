// @ts-check
// Helper functions for audio generation module
// Extracted to reduce complexity and improve maintainability

import { log, logDebug } from '../utils/logging.js';
import { AUDIO_CONFIG } from './audio-prep.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';

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
 * Build settings object for logging
 * @param {Object} params - Generation parameters
 * @returns {Object} Settings object
 */
export function buildAudioSettings(params) {
  const {
    provider = 'openai',
    voice = AUDIO_CONFIG.DEFAULT_VOICE,
    speed = AUDIO_CONFIG.DEFAULT_SPEED,
    format = 'mp3',
    language = 'auto',
    tabId = null,
    content,
    title,
    apiKey,
    ttsApiKey,
    model,
    elevenlabsModel,
    elevenlabsFormat,
    elevenlabsStability,
    elevenlabsSimilarity,
    elevenlabsStyle,
    elevenlabsSpeakerBoost,
    googleTtsModel,
    googleTtsVoice,
    googleTtsPrompt,
    respeecherTemperature,
    respeecherRepetitionPenalty,
    respeecherTopP,
    openaiInstructions
  } = params;

  return {
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
}

/**
 * Validate audio generation parameters
 * @param {Object} params - Generation parameters
 * @param {string} provider - TTS provider
 * @throws {Error} If validation fails
 */
export async function validateAudioParams(params, provider) {
  const { content, apiKey, ttsApiKey } = params;
  const uiLang = await getUILanguageCached();

  if (!content || content.length === 0) {
    throw new Error(tSync('errorNoContentToConvert', uiLang));
  }

  if (!apiKey) {
    throw new Error(tSync('errorNoApiKeyForTextPrep', uiLang));
  }

  if (!ttsApiKey && provider !== 'offline') {
    const providerName = getProviderName(provider);
    throw new Error(tSync('errorNoTtsApiKey', uiLang).replace('{provider}', providerName));
  }
}

/**
 * Get TTS instructions based on language
 * @param {string} language - Language code
 * @returns {string|null} TTS instructions or null
 */
export function getTTSInstructions(language) {
  return language !== 'auto' ? LANGUAGE_TTS_INSTRUCTIONS[language] : null;
}

/**
 * Determine TTS voice and format based on provider
 * @param {string} provider - TTS provider
 * @param {string} voice - Default voice
 * @param {string} format - Default format
 * @param {string} googleTtsVoice - Google TTS voice (if applicable)
 * @returns {{voice: string, format: string}} TTS voice and format
 */
export function getTTSVoiceAndFormat(provider, voice, format, googleTtsVoice) {
  const ttsVoice = provider === 'google' ? googleTtsVoice : voice;
  // Google TTS and Offline TTS always return WAV format, format parameter is ignored
  const ttsFormat = (provider === 'google' || provider === 'offline') ? 'wav' : format;
  return { ttsVoice, ttsFormat };
}

/**
 * Get provider display name
 * @param {string} provider - TTS provider
 * @returns {string} Provider display name
 */
export function getProviderName(provider) {
  const names = {
    'offline': 'Piper TTS (offline)',
    'elevenlabs': 'ElevenLabs',
    'qwen': 'Qwen',
    'google': 'Google Gemini TTS',
    'respeecher': 'Respeecher',
    'openai': 'OpenAI'
  };
  return names[provider] || 'Unknown';
}

/**
 * Build TTS options object for chunksToSpeech
 * @param {Object} params - Generation parameters
 * @param {string} ttsVoice - TTS voice
 * @param {string} ttsFormat - TTS format
 * @param {string} ttsPrompt - TTS prompt (if applicable)
 * @param {string} instructions - TTS instructions
 * @returns {Object} TTS options
 */
export function buildTTSOptions(params, ttsVoice, ttsFormat, ttsPrompt, instructions) {
  const {
    provider,
    speed,
    openaiInstructions,
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
    tabId
  } = params;

  return {
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
    tabId: tabId || null
  };
}

/**
 * Log audio generation start
 * @param {Date} entryTime - Entry timestamp
 * @param {Object} params - Generation parameters
 * @param {Object} allSettings - Settings object
 */
export function logAudioGenerationStart(entryTime, params, allSettings) {
  log('[ClipAIble Audio Generation] === generateAudio ENTRY POINT ===', {
    timestamp: entryTime,
    hasParams: !!params,
    paramsKeys: params ? Object.keys(params) : [],
    hasUpdateState: typeof params.updateState === 'function'
  });

  logDebug('[ClipAIble Audio Generation] === generateAudio START ===', {
    timestamp: entryTime,
    paramsKeys: params ? Object.keys(params) : []
  });

  log('[ClipAIble Audio Generation] Parameters extracted with all settings', allSettings);

  const instructions = getTTSInstructions(params.language || 'auto');
  log('[ClipAIble Audio Generation] Starting audio generation', {
    timestamp: Date.now(),
    title: params.title,
    contentItems: params.content?.length,
    model: params.model,
    provider: params.provider || 'openai',
    voice: params.voice,
    speed: params.speed,
    format: params.format,
    language: params.language,
    tabId: params.tabId,
    hasInstructions: !!instructions
  });
}

/**
 * Log prepared chunks information
 * @param {Array} preparedChunks - Prepared chunks
 * @param {string} provider - TTS provider
 * @param {string} ttsVoice - TTS voice
 * @param {number} speed - TTS speed
 * @param {string} ttsFormat - TTS format
 * @param {string} language - Language code
 */
export function logPreparedChunks(preparedChunks, provider, ttsVoice, speed, ttsFormat, language) {
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
}

/**
 * Log TTS call preparation
 * @param {string} provider - TTS provider
 * @param {string} ttsVoice - TTS voice
 * @param {number} speed - TTS speed
 * @param {string} ttsFormat - TTS format
 * @param {string} language - Language code
 * @param {number} tabId - Tab ID
 * @param {number} chunksCount - Number of chunks
 * @param {boolean} hasTtsApiKey - Whether TTS API key is present
 */
export function logTTSCallPreparation(provider, ttsVoice, speed, ttsFormat, language, tabId, chunksCount, hasTtsApiKey) {
  log('[ClipAIble Audio Generation] CRITICAL: Voice parameter before chunksToSpeech', {
    timestamp: Date.now(),
    provider,
    voice: ttsVoice,
    voiceType: typeof ttsVoice,
    voiceValue: String(ttsVoice),
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
    tabId,
    chunksCount,
    hasTtsApiKey
  });

  log('[ClipAIble Audio Generation] Calling chunksToSpeech', {
    provider,
    voice: ttsVoice,
    speed,
    format: ttsFormat,
    language,
    tabId,
    chunksCount,
    timestamp: Date.now()
  });
}

/**
 * Log TTS completion
 * @param {Date} startTime - Start timestamp
 * @param {ArrayBuffer} audioBuffer - Generated audio buffer
 */
export function logTTSCompletion(startTime, audioBuffer) {
  const duration = Date.now() - startTime;
  log('[ClipAIble Audio Generation] === chunksToSpeech COMPLETE ===', {
    timestamp: Date.now(),
    duration,
    hasAudioBuffer: !!audioBuffer,
    audioBufferSize: audioBuffer?.byteLength
  });
}

