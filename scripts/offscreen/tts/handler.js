// @ts-check
// Main PIPER_TTS handler for offscreen document

import { log, logError, logWarn } from '../../utils/logging.js';
import { detectLanguage } from '../utils/language-detection.js';
import { normalizeLanguageCode, getBaseLangCode, selectVoice } from './voice-selection.js';
import { ensureVoiceDownloaded } from './voice-download.js';
import { handleVoiceSwitching } from './voice-switching.js';
import { sanitizeText } from './text-processing.js';
import { synthesizeText } from './synthesis.js';
import { sendTTSResponse } from './response.js';

/**
 * @typedef {Object} TTSContext
 * @property {typeof import('../worker/init.js').initTTSWorker} initTTSWorker - Initialize TTS worker
 * @property {function(): Promise<Object>} initPiperTTS - Initialize Piper TTS module
 * @property {typeof import('../worker/api.js').predictWithWorker} predictWithWorker - Predict with worker
 * @property {function(): Promise<any[]>} getVoicesWithWorker - Get voices
 * @property {function(): Promise<string[]>} getStoredWithWorker - Get stored voices
 * @property {typeof import('../worker/api.js').downloadWithWorker} downloadWithWorker - Download voice
 * @property {function(string): Promise<void>} removeWithWorker - Remove voice
 * @property {Object} state - State object
 */

/**
 * Handle PIPER_TTS message
 * @param {string} messageId - Message ID
 * @param {Object} data - Message data
 * @param {string} data.text - Text to synthesize
 * @param {Object} [data.options] - Options
 * @param {string} [data.options.language] - Language code
 * @param {string|null} [data.options.voice] - Voice ID or name
 * @param {number} [data.options.speed] - Synthesis speed
 * @param {string} [data.processingRunId] - Captured operation identity
 * @param {import('../../types.js').PiperProgress} [data.piperProgress] - Overall synthesis position
 * @param {boolean} [data.hasUnlimitedStorage] - Has unlimited storage
 * @param {function(Object): void} sendResponse - Response function
 * @param {TTSContext} context - TTS context with helper functions
 * @returns {Promise<void>}
 */
export async function handlePiperTTS(messageId, data, sendResponse, context) {
  const requestStart = Date.now();
  const { text, options = {} } = data;
  let { language = 'en', voice = null } = options;
  const assertCurrent = () => {
    if (data.processingRunId && context.state.getProcessingRunId() !== data.processingRunId) {
      throw new Error('TTS processing cancelled');
    }
  };

  log('[ClipAIble TTS] === handlePiperTTS STARTED ===', { marker: 'TTS_HANDLER_START',
    timestamp: requestStart,
    messageId,
    textLength: text?.length,
    textPreview: text?.substring(0, 100),
    textWordsCount: text ? text.split(' ').length : 0,
    language,
    voice,
    voiceType: typeof voice,
    voiceString: String(voice || ''),
    hasOptions: !!options,
    optionsKeys: Object.keys(options),
    hasUnlimitedStorage: data.hasUnlimitedStorage,
    contextKeys: Object.keys(context),
    hasInitTTSWorker: typeof context.initTTSWorker === 'function',
    hasInitPiperTTS: typeof context.initPiperTTS === 'function',
    hasPredictWithWorker: typeof context.predictWithWorker === 'function',
    hasState: !!context.state
  });
  
  try {
    // 1. Initialize TTS Worker
    assertCurrent();
    await initializeTTS(messageId, context);
    assertCurrent();

    // 2. Initialize TTS Module (for stored/download operations)
    let tts = context.state.getTTSModule();
    if (!tts) {
      tts = await context.initPiperTTS();
      assertCurrent();
    }

    // 3. Detect/normalize language
    if (language === 'auto') {
      language = detectLanguage(text);
      log(`[ClipAIble TTS] Language detected`, { messageId, language });
    }
    language = normalizeLanguageCode(language);
    const langCode = getBaseLangCode(language);

    // 4. Select voice
    const { voiceId, isFallback } = await selectVoice({
      requestedVoice: voice,
      langCode,
      messageId,
      getVoicesWithWorker: context.getVoicesWithWorker,
      initTTSWorker: context.initTTSWorker,
      state: context.state
    });

    assertCurrent();

    // 6. Handle voice switching (clear caches if voice changed)
    const switchResult = await handleVoiceSwitching({
      newVoiceId: voiceId,
      messageId,
      state: context.state,
      tts,
      initTTSWorker: context.initTTSWorker
    });
    assertCurrent();
    tts = switchResult.tts;

    // 5. Ensure voice is downloaded
    const downloadedVoiceId = await ensureVoiceDownloaded({
      voiceId,
      langCode,
      messageId,
      getStoredWithWorker: context.getStoredWithWorker,
      downloadWithWorker: context.downloadWithWorker,
      removeWithWorker: context.removeWithWorker,
      predictWithWorker: context.predictWithWorker,
      initTTSWorker: context.initTTSWorker,
      state: context.state
    });

    assertCurrent();

    // 7. Sanitize text
    const sanitizedText = sanitizeText(text, langCode, messageId);
    if (sanitizedText.length === 0) {
      throw new Error('Text is empty after sanitization');
    }

    // 8. Synthesize
    const wavBlob = await synthesizeText({
      text: sanitizedText,
      speed: options.speed ?? 1,
      processingRunId: data.processingRunId,
      piperProgress: data.piperProgress,
      voiceId: downloadedVoiceId,
      langCode,
      messageId,
      predictWithWorker: context.predictWithWorker,
      getStoredWithWorker: context.getStoredWithWorker,
      downloadWithWorker: context.downloadWithWorker,
      removeWithWorker: context.removeWithWorker,
      initTTSWorker: context.initTTSWorker,
      state: context.state
    });
    
    assertCurrent();

    // 9. Send response
    await sendTTSResponse({
      wavBlob,
      messageId,
      hasUnlimitedStorage: data.hasUnlimitedStorage || false,
      sendResponse
    });

    const totalDuration = Date.now() - requestStart;
    log(`[ClipAIble TTS] Request complete`, {
      messageId,
      totalDuration,
      voiceId: downloadedVoiceId,
      textLength: sanitizedText.length,
      audioSize: wavBlob.size
    });
    
  } catch (error) {
    const totalDuration = Date.now() - requestStart;
    logError(`[ClipAIble TTS] Request failed`, {
      messageId,
      error: error.message,
      stack: error.stack,
      totalDuration
    });
    
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * Initialize TTS worker
 * @param {string} messageId - Message ID
 * @param {TTSContext} context - Context
 * @returns {Promise<void>}
 */
async function initializeTTS(messageId, context) {
  log(`[ClipAIble TTS] Initializing`, {
    messageId,
    useWorker: context.state.shouldUseWorker(),
    hasWorker: context.state.hasTTSWorker()
  });
  
  // If Worker doesn't exist, try to create it (even if useWorker was set to false due to inactivity timeout)
  if (!context.state.hasTTSWorker()) {
    // Reset useWorker flag to allow recreation after inactivity timeout
    context.state.setUseWorker(true);
    await context.initTTSWorker();
    
    if (!context.state.getTTSWorker()) {
      throw new Error('TTS Worker initialization failed');
    }
    
    log(`[ClipAIble TTS] Worker initialized`, { messageId });
  } else if (context.state.shouldUseWorker()) {
    // Worker exists and is enabled, just verify it's still valid
    log(`[ClipAIble TTS] Worker already exists`, { messageId });
  } else {
    // Worker exists but useWorker is false - this shouldn't happen, but handle it
    log(`[ClipAIble TTS] Worker exists but useWorker is false, resetting`, { messageId });
    context.state.setUseWorker(true);
  }
}
