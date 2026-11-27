import { concatenateWav, readWav } from '../utils/wav.js';
import { isWavBuffer, pcmToWav } from './audio-format.js';
import { textToSpeech as openaiTTS } from './openai-tts.js';
// @ts-check
// Text-to-Speech API module for ClipAIble extension
// Supports OpenAI, ElevenLabs, Qwen3-TTS-Flash, Respeecher, Google Cloud TTS, and Piper TTS (offline) providers

import { log, logError, logDebug, logWarn } from '../utils/logging.js';
import { callWithRetry } from '../utils/retry.js';
import { DEFAULT_GOOGLE_TTS_MODEL, getDefaultTtsVoice, getOpenRouterTtsModel, resolveOpenRouterTtsSelection, OPENAI_TTS_MAX_INPUT } from './tts-catalog.js';
import { splitNarrationText } from '../utils/narration-chunks.js';
import { SUPERTONIC_MAX_INPUT } from './supertonic-config.js';
import { synthesizeSupertonic } from './supertonic-model.js';
import { PROCESSING_STAGES, getProcessingSignal, getScopedUpdateState, markProcessingRequestStarted } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';
import { getUILanguageCached, checkCancellation } from '../utils/pipeline-helpers.js';

logDebug('[ClipAIble TTS] Loading TTS provider modules...', {
  timestamp: Date.now()
});

import { textToSpeech as elevenlabsTTS, ELEVENLABS_CONFIG } from './elevenlabs.js';
import { textToSpeech as qwenTTS, QWEN_CONFIG } from './qwen.js';
import { textToSpeech as respeecherTTS, RESPEECHER_CONFIG, resolveRespeecherLanguage } from './respeecher.js';
import { textToSpeech as googleTTS, GOOGLE_TTS_CONFIG } from './google-tts.js';
import { textToSpeech as openrouterTTS, normalizeOpenRouterSpeechInput } from './openrouter-tts.js';

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
  providers: ['openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'openrouter', 'offline']
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
  options = { ...options, signal: options.signal ?? (options.processingRunId === undefined ? undefined : getProcessingSignal(options.processingRunId)) };
  const entryTime = Date.now();
  const { provider = 'openai' } = options;
  if (!['openai', 'elevenlabs', 'qwen', 'respeecher', 'google', 'openrouter', 'offline', 'supertonic'].includes(provider)) {
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
    optionKeys: Object.keys(options)
  });
  
  logDebug('[ClipAIble TTS] textToSpeech called', { 
    provider, 
    textLength: text?.length, 
    hasApiKey: !!apiKey, 
    hasTabId: !!options.tabId,
    optionsKeys: Object.keys(options),
    timestamp: entryTime
  });
  
  if (provider === 'supertonic') {
    markProcessingRequestStarted(options.processingRunId);
    return synthesizeSupertonic(text, options);
  }

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
  } else if (provider === 'openrouter') {
    return openrouterTTS(text, apiKey, options);
  } else {
    logDebug('[ClipAIble TTS] Routing to OpenAI TTS (default)');
    return textToSpeechOpenAI(text, apiKey, options);
  }
}

/** Convert text to speech using OpenAI Realtime audio. */
async function textToSpeechOpenAI(text, apiKey, options = {}) {
  return callWithRetry(({ signal }) => {
    markProcessingRequestStarted(options.processingRunId);
    return openaiTTS(text, apiKey, { ...options, signal });
  }, {
    signal: options.signal ?? (options.processingRunId === undefined ? undefined : getProcessingSignal(options.processingRunId)),
    checkCancelled: () => checkCancellation('OpenAI TTS retry', options.processingRunId),
    shouldRetry: error => error.retryable === false ? false : undefined,
    onRetry: (attempt, delay) => log(`TTS API retry attempt ${attempt}, waiting ${delay}ms...`)
  });
}

export function getTtsInputLimit(provider, openrouterModel = undefined) {
  switch (provider) {
    case 'elevenlabs': return ELEVENLABS_CONFIG.MAX_INPUT;
    case 'qwen': return QWEN_CONFIG.MAX_INPUT;
    case 'respeecher': return RESPEECHER_CONFIG.MAX_INPUT;
    case 'google': return GOOGLE_TTS_CONFIG.MAX_INPUT;
    case 'openrouter': return getOpenRouterTtsModel(openrouterModel).maxInput;
    case 'offline': return OFFLINE_TTS_CONFIG.MAX_INPUT;
    case 'supertonic': return SUPERTONIC_MAX_INPUT;
    default: return OPENAI_TTS_MAX_INPUT;
  }
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
    signal: options.signal,
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
    signal: options.signal,
    processingRunId: options.processingRunId
  });
}

/**
 * Convert text to speech using the Google Gemini TTS API
 * @param {string} text - Text to convert
 * @param {string} apiKey - Google API key (same as Gemini API key)
 * @param {Partial<import('../types.js').TTSOptions>} [options={}] - TTS options
 * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer (WAV format, 24kHz, 16-bit, mono)
 * @throws {Error} If text is empty or exceeds the provider limit
 * @throws {Error} If API key is missing
 * @throws {Error} If Google TTS API request fails
 * @throws {Error} If network error occurs
 */
async function textToSpeechGoogle(text, apiKey, options = {}) {
  const {
    voice,
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
  return googleTTS(text, apiKey, { voice, prompt: finalPrompt, model: finalModel, signal: options.signal, processingRunId: options.processingRunId });
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
    optionKeys: Object.keys(options)
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
 * @returns {Promise<ArrayBuffer | Blob>} Concatenated audio data
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
  if (provider === 'respeecher') {
    options = { ...options, language: resolveRespeecherLanguage(chunks.map(chunk => chunk.text).join('\n'), options.language) };
  }
  const maxInput = getTtsInputLimit(provider, options.openrouterTtsModel);
  const routerSelection = provider === 'openrouter'
    ? resolveOpenRouterTtsSelection(options.openrouterTtsModel, options.openrouterTtsVoice) : null;
  
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
    const text = routerSelection ? normalizeOpenRouterSpeechInput(chunk.text, routerSelection.model, routerSelection.voice) : chunk.text;
    const parts = splitNarrationText(text, maxInput);
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
  
  try {
    for (let i = 0; i < expandedChunks.length; i++) {
      await checkCancellation(`TTS chunk ${i + 1}/${expandedChunks.length}`, options.processingRunId);
      const chunk = expandedChunks[i];
      if (provider !== 'openai') markProcessingRequestStarted(options.processingRunId);
      const audioBuffer = provider === 'openai'
        ? await textToSpeechOpenAI(chunk.text, apiKey, options)
        : await textToSpeech(chunk.text, apiKey, options);
      await checkCancellation('TTS response', options.processingRunId);
      markProcessingRequestStarted(options.processingRunId);
      audioBuffers.push(audioBuffer);
      processedChunks = i + 1;
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
  
  const concatenated = concatenateAudioBuffers(audioBuffers, options.returnBlob === true);
  
  // Check final result
  log('=== CONCATENATION COMPLETE ===', { chunkCount: audioBuffers.length, totalSize: concatenated instanceof Blob ? concatenated.size : concatenated.byteLength });
  
  return concatenated;
}

/**
 * Concatenate multiple audio ArrayBuffers
 * Handles both MP3 (simple concat) and WAV (proper header merging)
 * @param {Array<ArrayBuffer>} buffers - Array of audio buffers
 * @param {boolean} [asBlob=false] - Preserve the assembled audio as Blob parts
 * @returns {ArrayBuffer|Blob} Concatenated audio
 */
function concatenateAudioBuffers(buffers, asBlob = false) {
  log('concatenateAudioBuffers called', { buffersCount: buffers?.length });
  
  if (!buffers || buffers.length === 0) return new ArrayBuffer(0);
  
  // Check if buffers are WAV format
  if (isWavBuffer(buffers[0])) {
    if (buffers.length === 1 && !asBlob) { readWav(buffers[0]); return buffers[0]; }
    return concatenateWav(buffers, asBlob);
  }
  if (asBlob) return new Blob(buffers);
  if (buffers.length === 1) return buffers[0];
  
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

