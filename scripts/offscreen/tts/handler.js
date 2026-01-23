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
 * @property {function(): Promise<void>} initTTSWorker - Initialize TTS worker
 * @property {function(): Promise<Object>} initPiperTTS - Initialize Piper TTS module
 * @property {function(string, string): Promise<Blob>} predictWithWorker - Predict with worker
 * @property {function(): Promise<any[]>} getVoicesWithWorker - Get voices
 * @property {function(): Promise<string[]>} getStoredWithWorker - Get stored voices
 * @property {function(string, function?): Promise<void>} downloadWithWorker - Download voice
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
 * @param {boolean} [data.hasUnlimitedStorage] - Has unlimited storage
 * @param {function(Object): void} sendResponse - Response function
 * @param {TTSContext} context - TTS context with helper functions
 * @returns {Promise<void>}
 */
export async function handlePiperTTS(messageId, data, sendResponse, context) {
  const requestStart = Date.now();
  const { text, options = {} } = data;
  let { language = 'en', voice = null } = options;
  
  log(`[ClipAIble TTS] Request start`, {
    messageId,
    textLength: text?.length,
    language,
    voice
  });
  
  try {
    // 1. Initialize TTS Worker
    await initializeTTS(messageId, context);

    // 2. Check if we need to restart worker (after large chunk processing)
    // Large chunks (>5000 chars) can corrupt the worker state
    const textLength = data.text?.length || 0;
    if (textLength > 5000) {
      log(`[ClipAIble TTS] Large text detected (${textLength} chars), checking worker health`, {
        messageId,
        textLength
      });

      // Simple health check - if worker exists, assume it's healthy for large texts
      // The real issue is that worker gets corrupted AFTER processing, not before
      // So we check health and restart if needed before processing large texts
      if (context.state.getTTSWorker()) {
        try {
          // Quick test with minimal text
          const testResult = await context.predictWithWorker('test', 'en_US-lessac-medium');
          if (testResult) {
            log(`[ClipAIble TTS] Worker health check passed for large text`, {
              messageId,
              textLength
            });
          }
        } catch (healthError) {
          logWarn(`[ClipAIble TTS] Worker health check failed, restarting worker`, {
            messageId,
            textLength,
            error: healthError.message
          });

          // Restart worker
          if (context.state.getTTSWorker()) {
            context.state.getTTSWorker().terminate();
            context.state.setTTSWorker(null);
            context.state.setUseWorker(true);
          }

          // Re-initialize
          await initializeTTS(messageId, context);
        }
      }
    }
    
    // 2. Initialize TTS Module (for stored/download operations)
    let tts = context.state.getTTSModule();
    if (!tts) {
      tts = await context.initPiperTTS();
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

    // 6. Handle voice switching (clear caches if voice changed)
    const switchResult = await handleVoiceSwitching({
      newVoiceId: downloadedVoiceId,
      messageId,
      state: context.state,
      tts,
      initPiperTTS: context.initPiperTTS
    });
    tts = switchResult.tts;

    // 7. Sanitize text
    const sanitizedText = sanitizeText(text, langCode, messageId);
    if (sanitizedText.length === 0) {
      throw new Error('Text is empty after sanitization');
    }

    // 8. Synthesize
    const wavBlob = await synthesizeText({
      text: sanitizedText,
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
