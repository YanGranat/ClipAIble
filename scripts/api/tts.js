import { isWavBuffer, pcmToWav } from './audio-format.js';
import { textToSpeech as openaiTTS } from './openai-tts.js';
// @ts-check
// Text-to-Speech API module for ClipAIble extension
// Supports OpenAI, ElevenLabs, Qwen3-TTS-Flash, Respeecher, Google Cloud TTS, and Piper TTS (offline) providers

import { log, logError, logDebug, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { callWithRetry } from '../utils/retry.js';
import { AUDIO_CONFIG } from '../generation/audio-prep.js';
import { DEFAULT_GOOGLE_TTS_MODEL, getDefaultTtsVoice } from './tts-catalog.js';
import { PROCESSING_STAGES, getScopedUpdateState } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';
import { getUILanguageCached, checkCancellation } from '../utils/pipeline-helpers.js';

logDebug('[ClipAIble TTS] Loading TTS provider modules...', {
  timestamp: Date.now()
});

import { textToSpeech as elevenlabsTTS, ELEVENLABS_CONFIG } from './elevenlabs.js';
import { textToSpeech as qwenTTS, QWEN_CONFIG } from './qwen.js';
import { textToSpeech as respeecherTTS, RESPEECHER_CONFIG } from './respeecher.js';
import { textToSpeech as googleTTS, GOOGLE_TTS_CONFIG } from './google-tts.js';

logDebug('[ClipAIble TTS] Loading offline TTS module...', {
  timestamp: Date.now()
});

// Import offline TTS module - it doesn't load WASM on import, only when used
// WASM and voice models are initialized in the offscreen speech worker on demand.
import { textToSpeech as offlineTTS, OFFLINE_TTS_CONFIG } from './offline-tts-offscreen.js';

logDebug('[ClipAIble TTS] === MODULE LOADED ===', {
  timestamp: Date.now(),
  hasOfflineTTS: typeof offlineTTS === 'function',
  hasElevenlabsTTS: typeof elevenlabsTTS === 'function',
  hasQwenTTS: typeof qwenTTS === 'function',
  hasRespeecherTTS: typeof respeecherTTS === 'function',
  hasGoogleTTS: typeof googleTTS === 'function',
  hasLog: typeof log === 'function',
  hasLogError: typeof logError === 'function'
});

log('[ClipAIble TTS] TTS module initialized with all providers', {
  timestamp: Date.now(),
  providers: ['openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'offline']
});

/**
 * Convert text to speech using TTS API (OpenAI, ElevenLabs, Qwen, Respeecher, Google Cloud TTS, or Offline)
 * @param {string} text - Text to convert (required)
 * @param {string} [apiKey] - API key (OpenAI, ElevenLabs, Qwen, Respeecher, or Google Cloud) - optional for 'offline' provider, required for others
 * @param {import('../types.js').TTSOptions} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV for OpenAI/offline/Google; provider-selected format for others)
 * @throws {Error} If text is empty or too long
 * @throws {Error} If API key is missing (for non-offline providers)
 * @throws {Error} If TTS API request fails
 * @throws {Error} If network error occurs
 * @throws {Error} If TTS provider is invalid
 * @see {@link generateAudio} For complete audio generation from article content
 * @example
 * // Use OpenAI TTS (default)
 * const audio = await textToSpeech('Hello world', 'sk-...', {
 *   provider: 'openai',
 *   voice: 'marin',
 *   speed: 1.0
 * });
 * const blob = new Blob([audio], { type: 'audio/wav' });
 * const url = URL.createObjectURL(blob);
 * @example
 * // Use offline TTS (no API key needed)
 * const audio = await textToSpeech('Hello world', null, {
 *   provider: 'offline',
 *   voice: 'en_US-lessac-medium',
 *   language: 'en',
 *   tabId: 123
 * });
 * const blob = new Blob([audio], { type: 'audio/wav' });
 * @example
 * // Use ElevenLabs TTS
 * const audio = await textToSpeech('Hello world', 'elevenlabs-api-key', {
 *   provider: 'elevenlabs',
 *   voice: '21m00Tcm4TlvDq8ikWAM',
 *   speed: 1.2
 * });
 */
export async function textToSpeech(text, apiKey, options = {}) {
  await checkCancellation('TTS request', options.processingRunId);
  const entryTime = Date.now();
  const { provider = 'openai' } = options;
  if (!['openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'offline'].includes(provider)) {
    const translationKey = 'errorUnknownAudioProvider';
    const translationParams = { provider: String(provider) };
    throw Object.assign(new Error(tSync(translationKey, await getUILanguage(), translationParams)), { translationKey, translationParams });
  }
  
  log('[ClipAIble TTS] === textToSpeech ENTRY POINT ===', {
    timestamp: entryTime,
    provider,
    textLength: text?.length,
    hasApiKey: !!apiKey,
    hasTabId: !!options.tabId,
    optionsKeys: Object.keys(options),
    options: JSON.stringify(options).substring(0, 200)
  });
  
  logDebug('[ClipAIble TTS] textToSpeech called', { 
    provider, 
    textLength: text?.length, 
    hasApiKey: !!apiKey, 
    hasTabId: !!options.tabId,
    optionsKeys: Object.keys(options),
    timestamp: entryTime
  });
  
  if (provider === 'offline') {
    log('[ClipAIble TTS] === ROUTING TO OFFLINE TTS ===', {
      timestamp: Date.now(),
      textLength: text?.length,
      tabId: options.tabId,
      voice: options.voice,
      language: options.language,
      speed: options.speed
    });
    
    logDebug('[ClipAIble TTS] Using offline TTS provider', { 
      textLength: text?.length, 
      tabId: options.tabId,
      voice: options.voice,
      language: options.language,
      speed: options.speed
    });
    
    const offlineStart = Date.now();
    try {
      const result = await textToSpeechOffline(text, null, options);
      log('[ClipAIble TTS] === OFFLINE TTS COMPLETE ===', {
        timestamp: Date.now(),
        duration: Date.now() - offlineStart,
        resultSize: result?.byteLength
      });
      return result;
    } catch (error) {
      logError('[ClipAIble TTS] === OFFLINE TTS FAILED ===', {
        timestamp: Date.now(),
        duration: Date.now() - offlineStart,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  } else if (provider === 'elevenlabs') {
    logDebug('[ClipAIble TTS] Routing to ElevenLabs TTS');
    return textToSpeechElevenLabs(text, apiKey, options);
  } else if (provider === 'qwen') {
    logDebug('[ClipAIble TTS] Routing to Qwen TTS');
    return textToSpeechQwen(text, apiKey, options);
  } else if (provider === 'respeecher') {
    logDebug('[ClipAIble TTS] Routing to Respeecher TTS');
    return textToSpeechRespeecher(text, apiKey, options);
  } else if (provider === 'google') {
    logDebug('[ClipAIble TTS] Routing to Google TTS');
    return textToSpeechGoogle(text, apiKey, options);
  } else {
    logDebug('[ClipAIble TTS] Routing to OpenAI TTS (default)');
    return textToSpeechOpenAI(text, apiKey, options);
  }
}

/** Convert text to speech using OpenAI Realtime audio. */
async function textToSpeechOpenAI(text, apiKey, options = {}) {
  return callWithRetry(() => openaiTTS(text, apiKey, options), {
    shouldRetry: error => error.retryable === false ? false : undefined,
    onRetry: (attempt, delay) => log(`TTS API retry attempt ${attempt}, waiting ${delay}ms...`)
  });
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
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (MP3 format)
 * @throws {Error} If text is empty or too long (max 5000 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If ElevenLabs TTS API request fails
 * @throws {Error} If network error occurs
 */
async function textToSpeechElevenLabs(text, apiKey, options = {}) {
  const {
    voice = ELEVENLABS_CONFIG.DEFAULT_VOICE_ID,
    speed = ELEVENLABS_CONFIG.DEFAULT_SPEED,
    format = ELEVENLABS_CONFIG.DEFAULT_FORMAT,
    elevenlabsFormat = null,
    elevenlabsModel = ELEVENLABS_CONFIG.DEFAULT_MODEL,
    elevenlabsStability = 0.5,
    elevenlabsSimilarity = 0.75,
    elevenlabsStyle = 0.0,
    elevenlabsSpeakerBoost = true
  } = options;
  
  // Use elevenlabsFormat if provided, otherwise use format
  const finalFormat = elevenlabsFormat || (format === 'mp3' ? ELEVENLABS_CONFIG.DEFAULT_FORMAT : format);
  
  return elevenlabsTTS(text, apiKey, { 
    voiceId: voice, 
    speed, 
    format: finalFormat, 
    modelId: elevenlabsModel,
    stability: elevenlabsStability,
    similarityBoost: elevenlabsSimilarity,
    style: elevenlabsStyle,
    useSpeakerBoost: elevenlabsSpeakerBoost,
    processingRunId: options.processingRunId
  });
}

/**
 * Convert text to speech using Qwen3-TTS-Flash API
 * @param {string} text - Text to convert (max 600 characters - very strict!)
 * @param {string} apiKey - Alibaba Cloud DashScope API key
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format)
 * @throws {Error} If text is empty or too long (max 600 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If Qwen TTS API request fails
 * @throws {Error} If network error occurs
 */
async function textToSpeechQwen(text, apiKey, options = {}) {
  const {
    voice = getDefaultTtsVoice('qwen', options.qwenModel),
    speed = QWEN_CONFIG.DEFAULT_SPEED,
    language = null
  } = options;
  
  return qwenTTS(text, apiKey, { ...options, voice, speed, language, processingRunId: options.processingRunId });
}

/**
 * Convert text to speech using Respeecher API
 * @param {string} text - Text to convert (max 450 characters)
 * @param {string} apiKey - Respeecher API key
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format)
 * @throws {Error} If text is empty or too long (max 450 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If Respeecher TTS API request fails
 * @throws {Error} If network error occurs
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
    respeecherTemperature,
    respeecherRepetitionPenalty,
    respeecherTopP,
    processingRunId: options.processingRunId
  });
}

/**
 * Convert text to speech using Google Gemini 2.5 Pro TTS API
 * @param {string} text - Text to convert (max 5000 characters)
 * @param {string} apiKey - Google API key (same as Gemini API key)
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format, 24kHz, 16-bit, mono)
 * @throws {Error} If text is empty or too long (max 5000 characters)
 * @throws {Error} If API key is missing
 * @throws {Error} If Google TTS API request fails
 * @throws {Error} If network error occurs
 */
async function textToSpeechGoogle(text, apiKey, options = {}) {
  const {
    voice = GOOGLE_TTS_CONFIG.DEFAULT_VOICE,
    prompt = null,
    googleTtsPrompt = null,
    model = DEFAULT_GOOGLE_TTS_MODEL,
    googleTtsModel = null
  } = options;
  
  // Use explicit googleTtsModel if provided, otherwise use model
  const finalModel = googleTtsModel || model;
  
  // Use explicit googleTtsPrompt if provided, otherwise use prompt
  const finalPrompt = googleTtsPrompt || prompt;
  
  // Google TTS always returns WAV format (24kHz, 16-bit, mono)
  // Speed is not supported by API
  return googleTTS(text, apiKey, { voice, prompt: finalPrompt, model: finalModel, processingRunId: options.processingRunId });
}

/**
 * Convert text to speech using offline WASM TTS
 * WASM TTS requires window object, so if called from service worker,
 * it will execute in page context via executeScript
 * @param {string} text - Text to convert (max 10000 characters)
 * @param {string} apiKey - Not used for offline TTS
 * @param {Partial<import('../types.js').TTSOptions> & {pitch?: number, volume?: number}} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as WAV ArrayBuffer
 * @throws {Error} If text is empty or too long (max 10000 characters)
 * @throws {Error} If tabId is missing when window is not available
 * @throws {Error} If offline TTS execution fails
 */
async function textToSpeechOffline(text, apiKey, options = {}) {
  const entryTime = Date.now();
  log('[ClipAIble TTS] === textToSpeechOffline ENTRY ===', {
    timestamp: entryTime,
    textLength: text?.length,
    hasApiKey: !!apiKey,
    optionsKeys: Object.keys(options),
    options: JSON.stringify(options).substring(0, 200)
  });
  
  const {
    voice = null,
    speed = OFFLINE_TTS_CONFIG.DEFAULT_SPEED,
    pitch = OFFLINE_TTS_CONFIG.DEFAULT_PITCH,
    volume = OFFLINE_TTS_CONFIG.DEFAULT_VOLUME,
    language = null,
    tabId = null
  } = options;

  logDebug('[ClipAIble TTS] textToSpeechOffline parameters extracted', {
    timestamp: Date.now(),
    voice,
    speed,
    pitch,
    volume,
    language,
    tabId,
    textLength: text?.length
  });

  log('[ClipAIble TTS] textToSpeechOffline (Offscreen Document) called', { 
    textLength: text?.length, 
    voice,
    speed,
    language,
    pitch,
    volume,
    tabId,
    timestamp: entryTime
  });
  
  logDebug('[ClipAIble TTS] Checking offlineTTS function availability', {
    timestamp: Date.now(),
    hasOfflineTTS: typeof offlineTTS === 'function',
    offlineTTSType: typeof offlineTTS
  });
  
  if (typeof offlineTTS !== 'function') {
    const uiLang = await getUILanguage();
    const error = new Error(tSync('errorTtsOfflineNotAvailable', uiLang));
    logError('[ClipAIble TTS] === CRITICAL ERROR ===', {
      timestamp: Date.now(),
      error: error.message,
      offlineTTSType: typeof offlineTTS,
      offlineTTSValue: offlineTTS
    });
    logError('[ClipAIble TTS] offlineTTS is not a function', {
      type: typeof offlineTTS,
      value: offlineTTS
    });
    throw error;
  }
  
  log('[ClipAIble TTS] Calling offlineTTS function...', {
    timestamp: Date.now(),
    textLength: text.length,
    voice,
    speed,
    language
  });
  
  // Use offscreen document - works from any context (service worker, popup, content script)
  // No need for tabId or window context
  const callStart = Date.now();
  try {
    const result = await offlineTTS(text, { voice, speed, language, processingRunId: options.processingRunId });
    const callDuration = Date.now() - callStart;
    
    log('[ClipAIble TTS] === offlineTTS call SUCCESS ===', {
      timestamp: Date.now(),
      duration: callDuration,
      resultType: typeof result,
      resultSize: result?.byteLength,
      isArrayBuffer: result instanceof ArrayBuffer
    });
    
    log('[ClipAIble TTS] offlineTTS call completed', {
      duration: callDuration,
      resultSize: result?.byteLength,
      totalDuration: Date.now() - entryTime
    });
    
    return result;
  } catch (error) {
    const callDuration = Date.now() - callStart;
    logError('[ClipAIble TTS] === offlineTTS call FAILED ===', {
      timestamp: Date.now(),
      duration: callDuration,
      error: error.message,
      errorName: error.name,
      stack: error.stack,
      totalDuration: Date.now() - entryTime
    });
    logError('[ClipAIble TTS] offlineTTS call failed', {
      error: error.message,
      duration: callDuration,
      stack: error.stack
    });
    throw error;
  }
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
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Concatenated audio data as ArrayBuffer
 * @throws {Error} If chunks array is empty
 * @throws {Error} If API key is missing (for non-offline providers)
 * @throws {Error} If TTS conversion fails for any chunk
 * @throws {Error} If network error occurs
 */
export async function chunksToSpeech(chunks, apiKey, options = {}, updateState = null) {
  await checkCancellation('TTS conversion', options.processingRunId);
  const uiLang = await getUILanguageCached();
  if (updateState) updateState = getScopedUpdateState(options.processingRunId, updateState);
  const entryTime = Date.now();
  log('[ClipAIble TTS] === chunksToSpeech ENTRY POINT ===', {
    timestamp: entryTime,
    chunksCount: chunks?.length || 0,
    hasApiKey: !!apiKey,
    optionsKeys: Object.keys(options),
    provider: options.provider,
    hasUpdateState: typeof updateState === 'function'
  });
  
  logDebug('[ClipAIble TTS] === chunksToSpeech START ===', {
    timestamp: entryTime,
    chunksCount: chunks?.length,
    provider: options.provider,
    voice: options.voice,
    tabId: options.tabId,
    hasApiKey: !!apiKey
  });
  
  if (!chunks || chunks.length === 0) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorTtsNoChunks', uiLang));
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
  } else if (provider === 'offline') {
    maxInput = OFFLINE_TTS_CONFIG.MAX_INPUT;
  } else {
    maxInput = AUDIO_CONFIG.TTS_MAX_INPUT;
  }
  
  log('TTS provider config', { provider, maxInput });
  
  // Analyze chunk sizes before expansion
  const maxChunkSize = chunks.length > 0 ? Math.max(...chunks.map(c => c.text.length)) : 0;
  const chunksOverLimit = chunks.filter(c => c.text.length > maxInput).length;
  const maxChunkUsage = Math.round((maxChunkSize / maxInput) * 100);
  
  log('📊 TTS chunk analysis', {
    totalChunks: chunks.length,
    maxChunkSize: maxChunkSize,
    ttsLimit: maxInput,
    maxChunkUsage: `${maxChunkUsage}%`,
    chunksOverLimit: chunksOverLimit,
    warning: maxChunkUsage > 90 ? '⚠️ Large chunks need splitting' : 'OK'
  });
  
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
  
  log('Chunks expanded', { 
    originalChunks: chunks.length, 
    expandedChunks: expandedChunks.length,
    expansionRatio: chunks.length > 0 ? `${Math.round((expandedChunks.length / chunks.length) * 100)}%` : '0%'
  });
  
  const audioBuffers = [];
  const progressBase = 60; // Start at 60% (after preparation)
  const progressRange = 35; // Use 60-95% for TTS conversion
  
  // NOTE: Progress updates during audio generation
  // TTS operations run in Web Worker (isolated from main thread),
  // so we can safely update progress without blocking Worker operations
  // Using async tracker to update progress every 2 seconds without blocking
  const isAudioFormat = true; // This function is only called for audio
  
  // Update at start to show generation has begun
  if (updateState && expandedChunks.length > 0) {
    updateState({
      stage: PROCESSING_STAGES.GENERATING.id,
      status: tSync('statusGeneratingAudio', uiLang),
      statusTranslationKey: 'statusGeneratingAudio', statusTranslationParams: {},
      progress: progressBase
    });
  }
  
  // Async progress tracker - updates UI every 2 seconds without blocking Worker
  let processedChunks = 0;
  const totalChunks = expandedChunks.length;
  let progressTrackerInterval = null;
  
  log('[ClipAIble TTS] Progress tracker setup', {
    totalChunks,
    hasUpdateState: typeof updateState === 'function',
    willEnableTracker: updateState && totalChunks > 1
  });
  
  if (updateState && totalChunks > 1) {
    // Only enable tracker if there are multiple chunks (single chunk completes too fast)
    log('[ClipAIble TTS] Enabling progress tracker', {
      totalChunks,
      updateInterval: 2000
    });
    progressTrackerInterval = setInterval(() => {
      if (processedChunks < totalChunks) {
        const estimatedProgress = progressBase + Math.floor(
          (processedChunks / totalChunks) * progressRange
        );
        log('[ClipAIble TTS] Progress tracker update', {
          processedChunks,
          totalChunks,
          estimatedProgress
        });
        updateState?.({
          status: tSync('statusGeneratingAudioChunks', uiLang, { current: processedChunks, total: totalChunks }),
          statusTranslationKey: 'statusGeneratingAudioChunks', statusTranslationParams: { current: processedChunks, total: totalChunks },
          progress: Math.min(estimatedProgress, 94) // Cap at 94% to leave room for final update
        });
      }
    }, 2000); // Update every 2 seconds
  } else {
    log('[ClipAIble TTS] Progress tracker NOT enabled', {
      reason: !updateState ? 'no updateState callback' : 'single chunk (totalChunks <= 1)',
      totalChunks,
      hasUpdateState: typeof updateState === 'function'
    });
  }
  
  const failedChunks = [];
  
  try {
    for (let i = 0; i < expandedChunks.length; i++) {
      // Check if processing was cancelled before processing each chunk
      await checkCancellation(`TTS chunk ${i + 1}/${expandedChunks.length}`, options.processingRunId);
      
      const chunk = expandedChunks[i];
      let chunkProcessed = false;
      let lastChunkError = null;
      
      // Use centralized retry logic for each chunk
      try {
        const audioBuffer = await callWithRetry(
          async () => {
            await checkCancellation('TTS retry', options.processingRunId);
            // Pass all options including ElevenLabs advanced settings, OpenAI instructions, and tabId for offline TTS
            return provider === 'openai' ? await openaiTTS(chunk.text, apiKey, options) : await textToSpeech(chunk.text, apiKey, options);
          },
          {
            maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
            delays: CONFIG.RETRY_DELAYS,
            retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
            shouldRetry: error => error.retryable === false ? false : undefined,
            onRetry: (attempt, delay) => {
              logWarn(`Chunk ${i + 1} failed, retrying... (attempt ${attempt}/${CONFIG.RETRY_MAX_ATTEMPTS + 1}, waiting ${delay}ms)`, {
                chunkIndex: i + 1,
                totalChunks: expandedChunks.length
              });
            }
          }
        );
        await checkCancellation('TTS response', options.processingRunId);
        
        audioBuffers.push(audioBuffer);
        processedChunks = i + 1; // Update counter for progress tracker
        chunkProcessed = true;
      } catch (error) {
        await checkCancellation('TTS failure', options.processingRunId);
        if (error.retryable === false) throw error;
        lastChunkError = error;
        
        const chunkError = {
          index: i + 1,
          total: expandedChunks.length,
          error: error?.message || 'Unknown error',
          status: error?.status,
          retries: CONFIG.RETRY_MAX_ATTEMPTS + 1
        };
        failedChunks.push(chunkError);
        
        logError(`Failed to convert chunk ${i + 1}/${expandedChunks.length} after ${CONFIG.RETRY_MAX_ATTEMPTS + 1} attempts`, {
          chunkIndex: i + 1,
          totalChunks: expandedChunks.length,
          error: error?.message,
          status: error?.status,
          failedChunksCount: failedChunks.length,
          processedChunksCount: audioBuffers.length,
          willContinue: true
        });
        
        // Continue with next chunk instead of throwing error
        // This allows partial success - we'll handle failed chunks at the end
      }
    }
    
    // Check if we have any successfully processed chunks
    if (audioBuffers.length === 0) {
      const uiLang = await getUILanguageCached();
      const errorMsg = failedChunks.length > 0
        ? `All ${expandedChunks.length} chunks failed. Last error: ${failedChunks[failedChunks.length - 1].error}`
        : 'All chunks failed to convert';
      throw Object.assign(new Error(tSync('errorTtsAllChunksFailed', uiLang) || errorMsg), {
        translationKey: 'errorTtsAllChunksFailed', translationParams: {}
      });
    }
    
    // Log summary of failed chunks (if any)
    if (failedChunks.length > 0) {
      const successRate = ((audioBuffers.length / expandedChunks.length) * 100).toFixed(1);
      logWarn(`TTS processing completed with ${failedChunks.length} failed chunk(s)`, {
        totalChunks: expandedChunks.length,
        successfulChunks: audioBuffers.length,
        failedChunks: failedChunks.length,
        successRate: `${successRate}%`,
        failedChunkIndices: failedChunks.map(c => c.index),
        note: 'Incomplete audio will not be exported'
      });
      throw Object.assign(new Error(tSync('errorAudioChunksFailed', uiLang, { failed: failedChunks.length, total: expandedChunks.length })), {
        translationKey: 'errorAudioChunksFailed', translationParams: { failed: failedChunks.length, total: expandedChunks.length }
      });
    }
  } finally {
    // Clean up progress tracker
    if (progressTrackerInterval) {
      clearInterval(progressTrackerInterval);
      progressTrackerInterval = null;
    }
  }
  
  // Log all buffers before concatenation
  await checkCancellation('audio assembly', options.processingRunId);
  log('=== CONCATENATION START ===', { buffersCount: audioBuffers.length });
  
  // Final progress update before concatenation
  updateState?.({ 
    status: tSync('statusAssemblingAudio', uiLang),
    statusTranslationKey: 'statusAssemblingAudio', statusTranslationParams: {},
    progress: 95 
  });
  
  const concatenated = concatenateAudioBuffers(audioBuffers);
  
  // Check final result
  log('=== CONCATENATION COMPLETE ===', { chunkCount: audioBuffers.length, totalSize: concatenated.byteLength });
  
  return concatenated;
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
  
  const pcm = new Uint8Array(totalDataSize);
  let offset = 0;
  for (const chunk of dataChunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  const result = pcmToWav(pcm.buffer, sampleRate, bitsPerSample, numChannels);
  const totalSize = result.byteLength;
  
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

