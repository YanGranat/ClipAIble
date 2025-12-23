// Pipeline helper utilities for ClipAIble extension
// Provides common patterns for processing pipeline to reduce code duplication

// @ts-check

import { isCancelled } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';
import { updateState, getProcessingState } from '../state/processing.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { log, logError } from './logging.js';
import { recordSave } from '../stats/index.js';
import { completeProcessing, setError } from '../state/processing.js';
import { handleError } from './error-handler.js';

// Cache for UI language to avoid repeated async calls
let cachedUILang = null;

/**
 * Get UI language with caching
 * @returns {Promise<string>} UI language code
 */
export async function getUILanguageCached() {
  if (!cachedUILang) {
    cachedUILang = await getUILanguage();
  }
  return cachedUILang;
}

/**
 * Clear UI language cache (useful when language changes)
 */
export function clearUILanguageCache() {
  cachedUILang = null;
}

/**
 * Check if processing was cancelled and throw error if so
 * @param {string} [context] - Context description (e.g., 'before translation')
 * @throws {Error} Cancellation error with localized message
 */
export async function checkCancellation(context = '') {
  if (isCancelled()) {
    log(`Processing cancelled${context ? ` before ${context}` : ''}`);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('statusCancelled', uiLang));
  }
}

/**
 * Update processing progress with localized status
 * @param {Object} stage - Processing stage object (from PROCESSING_STAGES)
 * @param {string} statusKey - Translation key for status message
 * @param {number} progress - Progress percentage (0-100)
 * @param {Object} [options] - Additional options
 * @param {Array<string>} [options.replacements] - Replacement values for translation
 * @param {Object} [options.extra] - Extra state properties to update
 */
export async function updateProgress(stage, statusKey, progress, options = {}) {
  const uiLang = await getUILanguageCached();
  const status = tSync(statusKey, uiLang, ...(options.replacements || []));
  updateState({ 
    stage: stage.id, 
    status, 
    progress,
    ...options.extra
  });
}

/**
 * Finalize processing: record stats, update state, and complete
 * @param {Object} data - Processing data
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Object} processingStartTimeRef - Reference object with processingStartTime property (can be null)
 */
export async function finalizeProcessing(data, stopKeepAlive, processingStartTimeRef) {
  log('File generation complete');
  
  // Record stats (non-blocking - errors are handled inside recordSave)
  try {
    const processingTime = processingStartTimeRef && processingStartTimeRef.processingStartTime 
      ? Date.now() - processingStartTimeRef.processingStartTime 
      : 0;
    const state = getProcessingState();
    const savedTitle = state.result?.title || data.title || 'Untitled';
    const savedFormat = data.outputFormat || 'pdf';
    
    await recordSave({
      title: savedTitle,
      url: data.url,
      format: savedFormat,
      processingTime
    });
  } catch (error) {
    logError('Failed to record stats (non-critical)', error);
    // Continue even if stats recording fails
  }
  
  // Store format in state for success message
  const state = getProcessingState();
  const savedFormat = data.outputFormat || 'pdf';
  // @ts-ignore - outputFormat is stored in state but not in ProcessingState type (used for UI display)
  updateState({ outputFormat: savedFormat });
  
  if (processingStartTimeRef && processingStartTimeRef.processingStartTime !== null) {
    processingStartTimeRef.processingStartTime = null;
  }
  await completeProcessing(stopKeepAlive);
}

/**
 * Handle processing result: continue pipeline and finalize
 * @param {Object} data - Processing data
 * @param {Object} result - Extracted content result
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Object} processingStartTimeRef - Reference object with processingStartTime property
 * @param {Function} continuePipeline - Function to continue processing pipeline
 */
export async function handleProcessingResult(data, result, stopKeepAlive, processingStartTimeRef, continuePipeline) {
  log('Processing complete', { 
    title: result.title, 
    contentItems: result.content?.length || 0,
    outputFormat: data.outputFormat
  });
  
  // Continue with standard pipeline: translation, TOC/Abstract, generation
  // CRITICAL: Log voice before passing to continueProcessingPipeline
  if (data.outputFormat === 'audio') {
    log('[ClipAIble Background] ===== VOICE BEFORE continueProcessingPipeline =====', {
      timestamp: Date.now(),
      outputFormat: data.outputFormat,
      audioProvider: data.audioProvider,
      audioVoice: data.audioVoice,
      audioVoiceType: typeof data.audioVoice,
      audioVoiceString: String(data.audioVoice || ''),
      isNumeric: /^\d+$/.test(String(data.audioVoice || '')),
      hasUnderscore: data.audioVoice && String(data.audioVoice).includes('_'),
      hasDash: data.audioVoice && String(data.audioVoice).includes('-'),
      isValidFormat: data.audioVoice && (String(data.audioVoice).includes('_') || String(data.audioVoice).includes('-')),
      googleTtsVoice: data.googleTtsVoice,
      VOICE_STRING: `VOICE="${String(data.audioVoice || '')}"`, // Explicit string for visibility
      source: 'handleProcessingResult',
      willBePassedToContinueProcessingPipeline: true
    });
  }
  
  log('About to call continueProcessingPipeline', {
    outputFormat: data.outputFormat,
    timestamp: Date.now()
  });
  
  await continuePipeline(data, result, stopKeepAlive);
  
  // After generation, finalize processing
  await finalizeProcessing(data, stopKeepAlive, processingStartTimeRef);
}

/**
 * Handle processing error: normalize and set error state
 * @param {Error} error - Error object
 * @param {Object} data - Processing data
 * @param {Function} stopKeepAlive - Function to stop keep-alive
 * @param {Object} errorContext - Additional error context (source, errorType, context)
 * @returns {Promise<void>}
 */
export async function handleProcessingError(error, data, stopKeepAlive, errorContext = {}) {
  logError('Processing failed', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    errorName: error?.name,
    timestamp: Date.now(),
    ...errorContext
  });
  
  // Check if processing was cancelled - don't set error if cancelled
  if (isCancelled()) {
    log('Processing was cancelled, not setting error');
    return;
  }
  
  const normalized = await handleError(error, {
    source: errorContext.source || 'articleProcessing',
    errorType: errorContext.errorType || 'contentExtractionFailed',
    logError: true,
    createUserMessage: true,
    context: {
      url: data.url,
      format: data.outputFormat,
      mode: data.mode || data.extractionMode,
      ...errorContext.context
    }
  });
  
  // Set error with normalized message and code
  await setError({
    message: normalized.userMessage || normalized.message || 'Processing failed',
    code: normalized.userCode || normalized.code
  }, stopKeepAlive);
}

