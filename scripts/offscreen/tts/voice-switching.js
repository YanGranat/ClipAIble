// @ts-check
// Voice switching logic for Piper TTS

import { log, logError, logWarn } from '../../utils/logging.js';

/**
 * Handle voice switching - clear caches if voice changed
 * @param {Object} params - Parameters
 * @param {string} params.newVoiceId - New voice ID
 * @param {string} params.messageId - Message ID for logging
 * @param {Object} params.state - State object
 * @param {Object|null} params.tts - TTS module reference
 * @param {function(): Promise<Object>} params.initPiperTTS - Function to init Piper TTS
 * @returns {Promise<{voiceChanged: boolean, tts: Object}>} Result with updated tts reference
 */
export async function handleVoiceSwitching({
  newVoiceId,
  messageId,
  state,
  tts,
  initPiperTTS
}) {
  const previousVoiceId = state.getLastUsedVoiceId();
  const voiceChanged = previousVoiceId !== null && 
                       previousVoiceId !== newVoiceId && 
                       newVoiceId !== null;
  
  // Update tracking immediately
  state.setLastUsedVoiceId(newVoiceId);
  
  log(`[ClipAIble TTS] Voice check`, {
    messageId,
    previousVoiceId,
    newVoiceId,
    voiceChanged
  });
  
  if (!voiceChanged) {
    return { voiceChanged: false, tts };
  }
  
  log(`[ClipAIble TTS] Voice switching detected`, {
    messageId,
    previousVoice: previousVoiceId,
    newVoice: newVoiceId
  });
  
  // Clear TtsSession singleton
  let singletonCleared = false;
  try {
    if (tts && tts.TtsSession) {
      tts.TtsSession._instance = null;
      singletonCleared = true;
      log(`[ClipAIble TTS] TtsSession singleton cleared`, { messageId });
    }
  } catch (err) {
    logWarn(`[ClipAIble TTS] Failed to clear singleton`, { messageId, error: err.message });
  }
  
  // Clear module cache
  state.setTTSModule(null);
  
  // Reload module
  let updatedTts = tts;
  try {
    const freshTts = await initPiperTTS();
    if (freshTts && typeof freshTts.predict === 'function') {
      updatedTts = freshTts;
      log(`[ClipAIble TTS] Module reloaded successfully`, { messageId });
    }
  } catch (err) {
    logError(`[ClipAIble TTS] Module reload failed`, { messageId, error: err.message });
  }
  
  // Clear Worker cache
  await clearWorkerCache({ messageId, state });
  
  log(`[ClipAIble TTS] Voice switching complete`, {
    messageId,
    singletonCleared,
    previousVoice: previousVoiceId,
    newVoice: newVoiceId
  });
  
  return { voiceChanged: true, tts: updatedTts };
}

/**
 * Clear Worker cache by sending CLEAR_CACHE message
 * @param {Object} params - Parameters
 * @param {string} params.messageId - Message ID
 * @param {Object} params.state - State object
 * @returns {Promise<void>}
 */
async function clearWorkerCache({ messageId, state }) {
  if (!state.shouldUseWorker() || !state.getTTSWorker()) {
    logWarn(`[ClipAIble TTS] Cannot clear Worker cache - Worker not available`, { messageId });
    return;
  }
  
  const clearCacheId = `clear_${messageId}_${Date.now()}`;
  
  try {
    const clearPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.getTTSWorker().removeEventListener('message', handler);
        reject(new Error('CLEAR_CACHE timeout'));
      }, 5000);
      
      const handler = (event) => {
        if (event.data?.type === 'CLEAR_CACHE_SUCCESS' && event.data?.id === clearCacheId) {
          clearTimeout(timeout);
          state.getTTSWorker().removeEventListener('message', handler);
          resolve();
        }
      };
      
      state.getTTSWorker().addEventListener('message', handler);
    });
    
    state.getTTSWorker().postMessage({ type: 'CLEAR_CACHE', id: clearCacheId });
    
    await clearPromise;
    log(`[ClipAIble TTS] Worker cache cleared`, { messageId });
  } catch (err) {
    logError(`[ClipAIble TTS] Failed to clear Worker cache`, { messageId, error: err.message });
  }
}
