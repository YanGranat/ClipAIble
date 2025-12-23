// Helper functions for audio preparation module
// Extracted to reduce complexity and improve maintainability

import { log, logWarn } from '../utils/logging.js';
import { AUDIO_CONFIG } from './audio-prep.js';
import { getProcessingState } from '../state/processing.js';

/**
 * Build preparation settings object for logging
 * @param {Object} params - Preparation parameters
 * @param {boolean} useAICleanup - Whether AI cleanup is used
 * @returns {Object} Settings object
 */
export function buildPreparationSettings(params, useAICleanup) {
  const { content, title, language, model, apiKey, provider } = params;

  return {
    timestamp: Date.now(),
    // Content Settings
    contentItems: content?.length,
    title: title?.substring(0, 100),
    titleLength: title?.length,
    // Language Settings
    language,
    // Model Settings
    model,
    hasApiKey: !!apiKey,
    // Provider and Cleanup Mode
    provider: provider || 'unknown',
    useAICleanup,
    cleanupMode: useAICleanup ? 'AI-powered' : 'basic',
    // Audio Config
    audioConfig: {
      minChunkSize: AUDIO_CONFIG.MIN_CHUNK_SIZE,
      maxChunkSize: AUDIO_CONFIG.MAX_CHUNK_SIZE,
      idealChunkSize: AUDIO_CONFIG.IDEAL_CHUNK_SIZE,
      ttsMaxInput: AUDIO_CONFIG.TTS_MAX_INPUT
    },
    // Current State
    currentProgress: getProcessingState()?.progress || 0
  };
}

/**
 * Log content analysis before conversion
 * @param {Array} content - Content items
 * @param {string} title - Article title
 */
export function logContentAnalysis(content, title) {
  log('=== prepareContentForAudio: CONTENT ANALYSIS ===', {
    timestamp: Date.now(),
    contentItems: content?.length || 0,
    contentTypes: content ? [...new Set(content.map(item => item?.type).filter(Boolean))] : [],
    contentByType: content ? content.reduce((acc, item) => {
      const type = item?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}) : {},
    contentPreview: content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
      textPreview: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 100),
      hasHtml: !!(item.html && item.html !== item.text)
    })) || [],
    totalEstimatedLength: content ? content.reduce((sum, item) => {
      const text = (item.text || '').replace(/<[^>]+>/g, '').trim();
      return sum + text.length;
    }, 0) : 0,
    title: title?.substring(0, 100),
    titleLength: title?.length
  });
}

/**
 * Log plain text conversion completion
 * @param {Array} content - Original content items
 * @param {string} plainText - Converted plain text
 */
export function logPlainTextConversion(content, plainText) {
  log('=== prepareContentForAudio: PLAIN TEXT CONVERSION COMPLETE ===', {
    timestamp: Date.now(),
    originalContentItems: content?.length || 0,
    plainTextLength: plainText.length,
    plainTextPreview: plainText.substring(0, 200) + '...',
    plainTextEnd: '...' + plainText.substring(Math.max(0, plainText.length - 100)),
    newlineCount: (plainText.match(/\n/g) || []).length,
    paragraphCount: (plainText.match(/\n\n+/g) || []).length + 1,
    nonAsciiCount: (plainText.match(/[^\x00-\x7F]/g) || []).length
  });
}

/**
 * Log chunk splitting information
 * @param {string} fullText - Full text to split
 */
export function logChunkSplitting(fullText) {
  log('=== prepareContentForAudio: Splitting text into chunks ===', {
    fullTextLength: fullText.length,
    targetChunkSize: AUDIO_CONFIG.IDEAL_CHUNK_SIZE,
    minChunkSize: AUDIO_CONFIG.MIN_CHUNK_SIZE,
    maxChunkSize: AUDIO_CONFIG.MAX_CHUNK_SIZE,
    estimatedChunks: Math.ceil(fullText.length / AUDIO_CONFIG.IDEAL_CHUNK_SIZE),
    fullTextPreview: fullText.substring(0, 200),
    fullTextEnd: '...' + fullText.substring(Math.max(0, fullText.length - 100))
  });
}

/**
 * Log chunk splitting results
 * @param {Array} chunks - Split chunks
 */
export function logChunkSplittingResults(chunks) {
  log('=== prepareContentForAudio: Text split into chunks ===', {
    totalChunks: chunks.length,
    chunkSizes: chunks.map(c => c.text.length),
    totalChars: chunks.reduce((sum, c) => sum + c.text.length, 0),
    avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length),
    minChunkSize: Math.min(...chunks.map(c => c.text.length)),
    maxChunkSize: Math.max(...chunks.map(c => c.text.length)),
    chunksPreview: chunks.slice(0, 3).map((c, i) => ({
      index: i,
      length: c.text.length,
      preview: c.text.substring(0, 100) + '...'
    }))
  });
}

/**
 * Process single chunk for audio
 * @param {Object} chunk - Chunk to process
 * @param {number} chunkIndex - Index of chunk
 * @param {number} totalChunks - Total number of chunks
 * @param {boolean} useAICleanup - Whether to use AI cleanup
 * @param {string} apiKey - API key (if AI cleanup)
 * @param {string} model - Model (if AI cleanup)
 * @param {string} language - Language code
 * @param {Function} prepareChunkForAudio - AI cleanup function
 * @param {Function} basicCleanup - Basic cleanup function
 * @returns {Promise<{text: string, index: number, originalIndex: number}>} Prepared chunk
 */
export async function processChunkForAudio(
  chunk,
  chunkIndex,
  totalChunks,
  useAICleanup,
  apiKey,
  model,
  language,
  prepareChunkForAudio,
  basicCleanup
) {
  const chunkStartTime = Date.now();

  log('=== prepareContentForAudio: Processing chunk ===', {
    chunkIndex,
    totalChunks,
    chunkLength: chunk.text.length,
    chunkPreview: chunk.text.substring(0, 150) + '...'
  });

  let preparedText;
  if (useAICleanup) {
    preparedText = await prepareChunkForAudio(
      chunk.text,
      chunkIndex,
      totalChunks,
      apiKey,
      model,
      language
    );
  } else {
    log('=== prepareContentForAudio: Using basic cleanup (offline TTS) ===', {
      chunkIndex,
      totalChunks,
      originalLength: chunk.text.length,
      originalPreview: chunk.text.substring(0, 150) + '...',
      language
    });

    preparedText = basicCleanup(chunk.text, language);

    log('=== prepareContentForAudio: Basic cleanup complete ===', {
      chunkIndex,
      originalLength: chunk.text.length,
      cleanedLength: preparedText.length,
      lengthChange: preparedText.length - chunk.text.length,
      cleanedPreview: preparedText.substring(0, 150) + '...'
    });
  }

  const chunkDuration = Date.now() - chunkStartTime;

  if (preparedText && preparedText.length > 0) {
    log('=== prepareContentForAudio: Chunk processed successfully ===', {
      chunkIndex,
      originalLength: chunk.text.length,
      preparedLength: preparedText.length,
      duration: chunkDuration,
      lengthChange: preparedText.length - chunk.text.length,
      lengthChangePercent: Math.round(((preparedText.length - chunk.text.length) / chunk.text.length) * 100)
    });

    return {
      text: preparedText,
      index: chunkIndex,
      originalIndex: chunk.index
    };
  } else {
    logWarn('=== prepareContentForAudio: Chunk resulted in empty text ===', {
      chunkIndex,
      originalLength: chunk.text.length,
      duration: chunkDuration
    });
    return null;
  }
}

/**
 * Log audio preparation completion
 * @param {string} plainText - Original plain text
 * @param {Array} chunks - Original chunks
 * @param {Array} preparedChunks - Prepared chunks
 * @param {string} provider - TTS provider
 * @param {boolean} useAICleanup - Whether AI cleanup was used
 */
export function logAudioPreparationComplete(plainText, chunks, preparedChunks, provider, useAICleanup) {
  const totalOriginalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  const totalPreparedChars = preparedChunks.reduce((sum, c) => sum + c.text.length, 0);
  const overallChange = totalPreparedChars - totalOriginalChars;
  const overallPercent = Math.round((overallChange / totalOriginalChars) * 100);

  log('=== AUDIO PREPARATION COMPLETE ===', {
    timestamp: Date.now(),
    originalPlainTextLength: plainText.length,
    totalOriginalChars,
    totalPreparedChars,
    overallChange: `${overallChange > 0 ? '+' : ''}${overallChange} (${overallPercent}%)`,
    chunksCreated: preparedChunks.length,
    chunkSizes: preparedChunks.map(c => c.text.length),
    avgChunkSize: Math.round(totalPreparedChars / preparedChunks.length),
    minChunkSize: Math.min(...preparedChunks.map(c => c.text.length)),
    maxChunkSize: Math.max(...preparedChunks.map(c => c.text.length)),
    chunksPreview: preparedChunks.slice(0, 3).map((c, i) => ({
      index: i,
      length: c.text.length,
      preview: c.text.substring(0, 100) + '...'
    })),
    readyForTTS: true,
    provider: provider || 'unknown',
    useAICleanup
  });

  // Log full prepared chunks for debugging
  log('=== PREPARED CHUNKS FULL CONTENT FOR TTS ===', {
    timestamp: Date.now(),
    totalChunks: preparedChunks.length,
    chunks: preparedChunks.map((chunk, idx) => ({
      index: idx,
      originalIndex: chunk.originalIndex,
      length: chunk.text.length,
      textFull: chunk.text,
      textPreview: chunk.text.substring(0, 300) + '...',
      textEnd: '...' + chunk.text.substring(Math.max(0, chunk.text.length - 100)),
      nonAsciiCount: (chunk.text.match(/[^\x00-\x7F]/g) || []).length,
      newlineCount: (chunk.text.match(/\n/g) || []).length,
      paragraphCount: (chunk.text.match(/\n\n+/g) || []).length + 1
    }))
  });

  // Warn if overall text was significantly reduced
  if (overallPercent < -15) {
    logWarn('=== WARNING: Text significantly reduced during preparation ===', {
      originalLength: totalOriginalChars,
      preparedLength: totalPreparedChars,
      reduction: `${Math.abs(overallPercent)}%`
    });
  }
}

