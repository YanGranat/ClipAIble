// @ts-check
// Voice download and verification for Piper TTS

import { log, logError, logWarn } from '../../utils/logging.js';
import { DEFAULT_VOICES } from './voice-selection.js';

/**
 * Ensure voice model is downloaded and verified
 * @param {Object} params - Parameters
 * @param {string} params.voiceId - Voice ID to download
 * @param {string} params.langCode - Language code
 * @param {string} params.messageId - Message ID for logging
 * @param {function(): Promise<string[]>} params.getStoredWithWorker - Get stored voices
 * @param {function(string, function?): Promise<void>} params.downloadWithWorker - Download voice
 * @param {function(string): Promise<void>} params.removeWithWorker - Remove voice
 * @param {function(string, string): Promise<Blob>} params.predictWithWorker - Predict for integrity test
 * @param {function(): Promise<void>} params.initTTSWorker - Init TTS worker
 * @param {Object} params.state - State object
 * @returns {Promise<string>} Downloaded voice ID
 */
export async function ensureVoiceDownloaded({
  voiceId,
  langCode,
  messageId,
  getStoredWithWorker,
  downloadWithWorker,
  removeWithWorker,
  predictWithWorker,
  initTTSWorker,
  state
}) {
  // Check if voice is already stored
  if (!state.getTTSWorker()) {
    await initTTSWorker();
  }
  if (!state.getTTSWorker()) {
    throw new Error('TTS Worker not available');
  }
  
  const stored = await getStoredWithWorker();
  
  log(`[ClipAIble TTS] Stored voices check`, {
    messageId,
    voiceId,
    isStored: stored.includes(voiceId),
    storedCount: stored.length
  });
  
  if (stored.includes(voiceId)) {
    return voiceId;
  }
  
  // Validate voiceId before download
  if (!voiceId || voiceId === 'undefined' || voiceId.trim() === '') {
    const fallback = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
    logWarn(`[ClipAIble TTS] Invalid voiceId, using fallback`, { messageId, voiceId, fallback });
    voiceId = fallback;
  }
  
  // Download voice
  log(`[ClipAIble TTS] Downloading voice`, { messageId, voiceId });
  
  let lastPercent = -1;
  try {
    await downloadWithWorker(voiceId, (progress) => {
      if (progress.total > 0) {
        const percent = Math.round((progress.loaded * 100) / progress.total);
        if (percent >= lastPercent + 10 || percent === 100) {
          log(`[ClipAIble TTS] Download progress`, { messageId, voiceId, percent });
          lastPercent = percent;
        }
      }
    });
  } catch (downloadError) {
    // Handle 404 errors
    if (isVoiceNotFoundError(downloadError)) {
      throw new Error(`Voice "${voiceId}" not found. Please select a valid voice.`);
    }
    throw downloadError;
  }
  
  // Verify download with retries
  await verifyVoiceStored({
    voiceId,
    messageId,
    getStoredWithWorker,
    initTTSWorker,
    state
  });
  
  // Wait for IndexedDB
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test model integrity
  await testModelIntegrity({
    voiceId,
    messageId,
    predictWithWorker,
    downloadWithWorker,
    removeWithWorker,
    initTTSWorker,
    state
  });
  
  return voiceId;
}

/**
 * Verify voice is stored after download
 * @param {Object} params - Parameters
 * @param {string} params.voiceId - Voice ID
 * @param {string} params.messageId - Message ID
 * @param {function(): Promise<string[]>} params.getStoredWithWorker - Get stored
 * @param {function(): Promise<void>} params.initTTSWorker - Init worker
 * @param {Object} params.state - State
 * @returns {Promise<void>}
 */
async function verifyVoiceStored({ voiceId, messageId, getStoredWithWorker, initTTSWorker, state }) {
  const maxAttempts = 10;
  const delay = 1000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!state.getTTSWorker()) {
      await initTTSWorker();
    }
    
    const stored = await getStoredWithWorker();
    
    if (stored.includes(voiceId)) {
      log(`[ClipAIble TTS] Voice verified in storage`, { messageId, voiceId, attempt });
      return;
    }
    
    if (attempt < maxAttempts) {
      log(`[ClipAIble TTS] Voice not found, retrying`, { messageId, voiceId, attempt });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Voice "${voiceId}" not stored after ${maxAttempts} verification attempts`);
}

/**
 * Test model integrity with minimal predict call
 * @param {Object} params - Parameters
 * @param {string} params.voiceId - Voice ID
 * @param {string} params.messageId - Message ID
 * @param {function(string, string): Promise<Blob>} params.predictWithWorker - Predict
 * @param {function(string, function?): Promise<void>} params.downloadWithWorker - Download
 * @param {function(string): Promise<void>} params.removeWithWorker - Remove
 * @param {function(): Promise<void>} params.initTTSWorker - Init worker
 * @param {Object} params.state - State
 * @returns {Promise<void>}
 */
async function testModelIntegrity({
  voiceId,
  messageId,
  predictWithWorker,
  downloadWithWorker,
  removeWithWorker,
  initTTSWorker,
  state
}) {
  try {
    log(`[ClipAIble TTS] Testing model integrity`, { messageId, voiceId });
    
    if (!state.shouldUseWorker() || !state.getTTSWorker()) {
      await initTTSWorker();
    }
    
    const testBlob = await predictWithWorker('test', voiceId);
    
    if (!testBlob || testBlob.size === 0) {
      throw new Error('Empty result from integrity test');
    }
    
    log(`[ClipAIble TTS] Model integrity test passed`, { messageId, voiceId, size: testBlob.size });
  } catch (error) {
    logError(`[ClipAIble TTS] Model integrity test failed`, { messageId, voiceId, error: error.message });
    
    // Try to recover - remove and re-download
    if (state.shouldUseWorker() && state.getTTSWorker()) {
      try {
        await removeWithWorker(voiceId);
        await downloadWithWorker(voiceId);
        log(`[ClipAIble TTS] Re-downloaded model after integrity failure`, { messageId, voiceId });
      } catch (recoveryError) {
        throw new Error(`Model integrity test failed and recovery failed: ${error.message}`);
      }
    } else {
      throw new Error(`Model integrity test failed: ${error.message}`);
    }
  }
}

/**
 * Check if error indicates voice not found (404)
 * @param {Error} error - Error to check
 * @returns {boolean} True if voice not found error
 */
function isVoiceNotFoundError(error) {
  const msg = error.message || '';
  return msg.includes('Unexpected token') ||
         msg.includes('is not valid JSON') ||
         msg.includes('JSON.parse') ||
         msg.includes('Entry not found') ||
         msg.includes('404') ||
         msg.includes('not found');
}
