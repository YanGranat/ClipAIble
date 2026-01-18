// @ts-check
// TTS synthesis for Piper TTS

import { log, logError, logWarn } from '../../utils/logging.js';
import { concatenateWavBuffers } from '../audio/wav-utils.js';
import { splitIntoSentences, checkMemory } from './text-processing.js';
import { DEFAULT_VOICES, FALLBACK_VOICES } from './voice-selection.js';

/**
 * Synthesize text to audio
 * @param {Object} params - Parameters
 * @param {string} params.text - Sanitized text
 * @param {string} params.voiceId - Voice ID
 * @param {string} params.langCode - Language code
 * @param {string} params.messageId - Message ID
 * @param {function(string, string): Promise<Blob>} params.predictWithWorker - Predict function
 * @param {function(): Promise<string[]>} params.getStoredWithWorker - Get stored function
 * @param {function(string, function?): Promise<void>} params.downloadWithWorker - Download function
 * @param {function(string): Promise<void>} params.removeWithWorker - Remove function
 * @param {function(): Promise<void>} params.initTTSWorker - Init worker function
 * @param {Object} params.state - State object
 * @returns {Promise<Blob>} Audio blob
 */
export async function synthesizeText({
  text,
  voiceId,
  langCode,
  messageId,
  predictWithWorker,
  getStoredWithWorker,
  downloadWithWorker,
  removeWithWorker,
  initTTSWorker,
  state
}) {
  const sentences = splitIntoSentences(text);
  let useStreaming = sentences.length > 1 && text.length > 2000;
  
  log(`[ClipAIble TTS] Synthesis start`, {
    messageId,
    voiceId,
    textLength: text.length,
    sentencesCount: sentences.length,
    useStreaming
  });
  
  const synthesisStart = Date.now();
  let wavBlob;
  let retryCount = 0;
  const maxRetries = 2;
  let currentVoiceId = voiceId;
  let isFallbackVoice = false;
  
  while (retryCount <= maxRetries) {
    try {
      // Check memory
      if (!checkMemory()) {
        useStreaming = true;
      }
      
      if (useStreaming && sentences.length > 1) {
        wavBlob = await synthesizeStreaming({
          sentences,
          voiceId: currentVoiceId,
          messageId,
          predictWithWorker,
          getStoredWithWorker,
          initTTSWorker,
          state
        });
      } else {
        // Force streaming for long text
        if (text.length > 2000) {
          useStreaming = true;
          continue;
        }
        
        wavBlob = await synthesizeSinglePass({
          text,
          voiceId: currentVoiceId,
          messageId,
          predictWithWorker,
          getStoredWithWorker,
          initTTSWorker,
          state
        });
      }
      
      break; // Success
    } catch (error) {
      logError(`[ClipAIble TTS] Synthesis error`, {
        messageId,
        voiceId: currentVoiceId,
        error: error.message,
        retryCount
      });
      
      // Handle model corruption
      if (isModelCorruptionError(error) && retryCount < maxRetries) {
        await handleModelCorruption({
          voiceId: currentVoiceId,
          langCode,
          messageId,
          removeWithWorker,
          downloadWithWorker,
          getStoredWithWorker,
          initTTSWorker,
          state
        });
        retryCount++;
        continue;
      }
      
      // Handle phoneme error - try fallback voice
      if (isPhonemeError(error) && !isFallbackVoice) {
        const fallbackVoiceId = await tryFallbackVoice({
          currentVoiceId,
          langCode,
          messageId,
          getStoredWithWorker,
          downloadWithWorker,
          initTTSWorker,
          state
        });
        
        if (fallbackVoiceId) {
          currentVoiceId = fallbackVoiceId;
          isFallbackVoice = true;
          retryCount = 0;
          continue;
        }
      }
      
      throw error;
    }
  }
  
  const duration = Date.now() - synthesisStart;
  log(`[ClipAIble TTS] Synthesis complete`, {
    messageId,
    voiceId: currentVoiceId,
    duration,
    blobSize: wavBlob?.size
  });
  
  return wavBlob;
}

/**
 * Synthesize using streaming (sentence by sentence)
 * @param {Object} params - Parameters
 * @returns {Promise<Blob>} Combined audio blob
 */
async function synthesizeStreaming({
  sentences,
  voiceId,
  messageId,
  predictWithWorker,
  getStoredWithWorker,
  initTTSWorker,
  state
}) {
  log(`[ClipAIble TTS] Streaming synthesis`, { messageId, sentencesCount: sentences.length });
  
  const audioChunks = [];
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    if (!checkMemory()) {
      logWarn(`[ClipAIble TTS] Memory critical, stopping`, { messageId, processed: i });
      break;
    }
    
    // Validate voice before predict - use ensureTTSWorker to handle recreation after timeout
    if (!state.getTTSWorker()) {
      // Reset useWorker flag if it was set to false due to inactivity timeout
      if (!state.shouldUseWorker()) {
        state.setUseWorker(true);
      }
      await initTTSWorker();
    }
    
    // Verify voice matches expected
    const expectedVoice = state.getLastUsedVoiceId() || voiceId;
    let predictVoiceId = voiceId;
    
    if (state.getLastUsedVoiceId() && state.getLastUsedVoiceId() !== voiceId) {
      predictVoiceId = state.getLastUsedVoiceId();
    }
    
    log(`[ClipAIble TTS] Processing sentence ${i + 1}/${sentences.length}`, {
      messageId,
      voiceId: predictVoiceId,
      sentenceLength: sentence.length
    });
    
    const blob = await predictWithWorker(sentence, predictVoiceId);
    audioChunks.push(blob);
    
    // Send progress (debounced)
    if ((i + 1) % 2 === 0 || i === sentences.length - 1) {
      try {
        chrome.runtime.sendMessage({
          action: 'TTS_PROGRESS',
          data: {
            sentenceIndex: i + 1,
            totalSentences: sentences.length,
            progressBase: 60,
            progressRange: 35
          }
        }).catch(() => {});
      } catch (e) {}
    }
  }
  
  // Concatenate WAV chunks
  const audioBuffers = await Promise.all(
    audioChunks.map(blob => blob.arrayBuffer())
  );
  
  const combinedBuffer = concatenateWavBuffers(audioBuffers);
  
  return new Blob([combinedBuffer], { type: 'audio/wav' });
}

/**
 * Synthesize in single pass
 * @param {Object} params - Parameters
 * @returns {Promise<Blob>} Audio blob
 */
async function synthesizeSinglePass({
  text,
  voiceId,
  messageId,
  predictWithWorker,
  getStoredWithWorker,
  initTTSWorker,
  state
}) {
  log(`[ClipAIble TTS] Single-pass synthesis`, { messageId, voiceId, textLength: text.length });
  
  if (!state.getTTSWorker()) {
    // Reset useWorker flag if it was set to false due to inactivity timeout
    if (!state.shouldUseWorker()) {
      state.setUseWorker(true);
    }
    await initTTSWorker();
  }
  if (!state.getTTSWorker()) {
    throw new Error('TTS Worker not available');
  }
  
  // Use tracked voice if available
  let predictVoiceId = voiceId;
  if (state.getLastUsedVoiceId() && state.getLastUsedVoiceId() !== voiceId) {
    predictVoiceId = state.getLastUsedVoiceId();
  }
  
  return await predictWithWorker(text, predictVoiceId);
}

/**
 * Handle model corruption - remove and re-download
 * @param {Object} params - Parameters
 * @returns {Promise<void>}
 */
async function handleModelCorruption({
  voiceId,
  langCode,
  messageId,
  removeWithWorker,
  downloadWithWorker,
  getStoredWithWorker,
  initTTSWorker,
  state
}) {
  log(`[ClipAIble TTS] Handling model corruption`, { messageId, voiceId });
  
  // Remove corrupted model
  if (state.shouldUseWorker() && state.getTTSWorker()) {
    try {
      await removeWithWorker(voiceId);
    } catch (e) {}
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Re-download
  try {
    await downloadWithWorker(voiceId);
    
    // Verify
    await new Promise(resolve => setTimeout(resolve, 1000));
    const stored = await getStoredWithWorker();
    
    if (!stored.includes(voiceId)) {
      throw new Error(`Model ${voiceId} not found after re-download`);
    }
    
    log(`[ClipAIble TTS] Model re-downloaded`, { messageId, voiceId });
  } catch (error) {
    // Try fallback if re-download fails
    const fallback = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'];
    if (fallback !== voiceId) {
      await downloadWithWorker(fallback);
    } else {
      throw error;
    }
  }
}

/**
 * Try to get a fallback voice
 * @param {Object} params - Parameters
 * @returns {Promise<string|null>} Fallback voice ID or null
 */
async function tryFallbackVoice({
  currentVoiceId,
  langCode,
  messageId,
  getStoredWithWorker,
  downloadWithWorker,
  initTTSWorker,
  state
}) {
  let fallbackVoiceId = FALLBACK_VOICES[langCode];
  
  if (!fallbackVoiceId || fallbackVoiceId === currentVoiceId) {
    if (langCode !== 'en') {
      fallbackVoiceId = FALLBACK_VOICES['en'];
    }
  }
  
  if (!fallbackVoiceId || fallbackVoiceId === currentVoiceId) {
    return null;
  }
  
  log(`[ClipAIble TTS] Trying fallback voice`, { messageId, fallbackVoiceId });
  
  // Ensure fallback is downloaded
  if (!state.getTTSWorker()) {
    // Reset useWorker flag if it was set to false due to inactivity timeout
    if (!state.shouldUseWorker()) {
      state.setUseWorker(true);
    }
    await initTTSWorker();
  }
  
  const stored = await getStoredWithWorker();
  if (!stored.includes(fallbackVoiceId)) {
    try {
      await downloadWithWorker(fallbackVoiceId);
    } catch (error) {
      // Try English default as last resort
      const englishFallback = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
      if (englishFallback !== fallbackVoiceId) {
        await downloadWithWorker(englishFallback);
        return englishFallback;
      }
      return null;
    }
  }
  
  return fallbackVoiceId;
}

/**
 * Check if error is model corruption
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
function isModelCorruptionError(error) {
  const msg = error.message || '';
  return msg.includes('No graph was found in the protobuf') ||
         msg.includes("Can't create a session") ||
         msg.includes('protobuf') ||
         msg.includes('ERROR_CODE: 2') ||
         msg.includes('Aborted()') ||
         msg.includes('ASSERTIONS');
}

/**
 * Check if error is phoneme error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
function isPhonemeError(error) {
  const msg = error.message || '';
  return msg.includes('indices element out of data bounds') ||
         msg.includes('Gather node') ||
         msg.includes('idx=') ||
         msg.includes('inclusive range');
}
