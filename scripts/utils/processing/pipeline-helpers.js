// Pipeline helper utilities for ClipAIble extension
// Provides common patterns for processing pipeline to reduce code duplication

// @ts-check
import { supportsDocumentAbstract } from '../../processing/export-requirements.js';

import { isCancelled, isCurrentProcessingRun, getScopedUpdateState, getProcessingSignal, markProcessingRequestStarted } from '../../state/processing.js';
import { getDocumentReadyMessage, getExportFormatLabelKey, getUILanguage, tSync } from '../../locales.js';
import { updateState, getProcessingState } from '../../state/processing.js';
import { PROCESSING_STAGES } from '../../state/processing.js';
import { log, logError, logWarn } from '../logging.js';
import { recordSave } from '../../stats/index.js';
import { completeProcessing, setError, cancelProcessing } from '../../state/processing.js';
import { handleError } from '../error-handler.js';
import { detectSourceLanguage } from '../../translation/detection.js';
import { CONFIG } from '../config.js';
import { isPopupOpen } from '../../background/popup-connection.js';
import { createNotification } from '../../background/notifications.js';
import { isImageTranslationEnabled } from '../../api/image-translation-catalog.js';
import { isPdfSelectionCancelled } from '../pdf-errors.js';

// Cache for UI language to avoid repeated async calls
let cachedUILang = null;
let uiLanguageEpoch = 0;
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && Object.hasOwn(changes, 'ui_language')) clearUILanguageCache();
});

/**
 * Get UI language with caching
 * @returns {Promise<string>} UI language code
 */
export async function getUILanguageCached() {
  if (!cachedUILang) {
    const epoch = uiLanguageEpoch;
    const language = await getUILanguage();
    if (epoch !== uiLanguageEpoch) return getUILanguageCached();
    cachedUILang = language;
  }
  return cachedUILang;
}

/**
 * Clear UI language cache (useful when language changes)
 * @returns {void}
 */
export function clearUILanguageCache() {
  uiLanguageEpoch++;
  cachedUILang = null;
}

export function getProcessingCallbacks(data) {
  if (data.extractionOnly) {
    return { updateState: () => {}, updateProgress: async () => {}, checkCancellation: data.checkCancelled || (() => {}) };
  }
  return {
    updateState: getScopedUpdateState(data.processingRunId),
    updateProgress: (stage, statusKey, progress, options = {}) => updateProgress(stage, statusKey, progress, { ...options, processingRunId: data.processingRunId }),
    checkCancellation: (context) => checkCancellation(context, data.processingRunId)
  };
}

export function getAIRequestOptions(data) {
  const { provider, processingRunId, extractionOnly, checkCancelled, promptOverrides } = data;
  return {
    provider,
    ...(promptOverrides && { promptOverrides }),
    signal: data.signal || (!extractionOnly && processingRunId !== undefined ? getProcessingSignal(processingRunId) : undefined),
    onRequestStart: () => { if (!extractionOnly && processingRunId !== undefined) markProcessingRequestStarted(processingRunId); },
    checkCancelled: () => {
      const checkOwner = () => {
        if (!extractionOnly && isCancelled(processingRunId)) {
          const signal = getProcessingSignal(processingRunId);
          throw signal.reason instanceof Error ? signal.reason : new DOMException('Processing cancelled', 'AbortError');
        }
      };
      checkOwner();
      const pending = checkCancelled?.();
      if (pending?.then) return pending.then(checkOwner);
      checkOwner();
    }
  };
}

/**
 * Check if processing was cancelled and throw error if so
 * @param {string} [context] - Context description (e.g., 'before translation')
 * @param {string} [runId] - Captured document operation identity
 * @throws {Error} Cancellation error with localized message
 */
export async function checkCancellation(context = '', runId) {
  if (isCancelled(runId)) {
    log(`Processing cancelled${context ? ` before ${context}` : ''}`);
    const signal = getProcessingSignal(runId);
    if (signal.reason instanceof Error) throw signal.reason;
    throw Object.assign(new DOMException('Processing cancelled', 'AbortError'), { translationKey: 'statusCancelled', translationParams: {}, retryable: false });
  }
}

/**
 * Update processing progress with localized status
 * @param {{id: string, label?: string, name?: string, order?: number}} stage - Processing stage object (from PROCESSING_STAGES)
 * @param {string} statusKey - Translation key for status message
 * @param {number} progress - Progress percentage (0-100)
 * @param {{replacements?: Array<string>, params?: Record<string, string|number>, extra?: Record<string, any>, processingRunId?: string}} [options={}] - Additional options
 * @returns {Promise<void>}
 */
export async function updateProgress(stage, statusKey, progress, options = {}) {
  if (!isCurrentProcessingRun(options.processingRunId)) return;
  const uiLang = await getUILanguageCached();
  const params = { ...options.params };
  
  // Apply replacements if provided
  if (options.replacements && Array.isArray(options.replacements)) {
    // Simple replacement: replace {0}, {1}, etc. with replacement values
    options.replacements.forEach((replacement, index) => {
      params[index] = String(replacement);
    });
  }
  
  updateState({ 
    stage: stage.id, 
    status: tSync(statusKey, uiLang, params),
    statusTranslationKey: statusKey,
    statusTranslationParams: params,
    progress,
    ...options.extra
  }, options.processingRunId);
}

/**
 * Finalize processing: record stats, update state, and complete
 * @param {Pick<import('../../types.js').ProcessingData, 'title'|'url'|'processingRunId'|'outputFormat'>} data - Completion identity and metadata
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {{current: number}|null} processingStartTimeRef - Reference object with current property (can be null)
 * @returns {Promise<void>}
 */
export async function finalizeProcessing(data, stopKeepAlive, processingStartTimeRef) {
  if (isCancelled(data.processingRunId)) return;
  log('🎉 Processing complete - file ready for download');
  
  // Record stats (non-blocking - errors are handled inside recordSave)
  try {
    const processingTime = processingStartTimeRef && processingStartTimeRef.current 
      ? Date.now() - processingStartTimeRef.current 
      : 0;
    const savedFormat = data.outputFormat || 'pdf';
    
    await recordSave({
      title: data.title || '',
      url: data.url,
      format: savedFormat,
      processingTime
    });
  } catch (error) {
    logError('Failed to record stats (non-critical)', error);
    // Continue even if stats recording fails
  }
  if (isCancelled(data.processingRunId)) return;
  
  // Store format in state for success message
  const savedFormat = data.outputFormat || 'pdf';
  // outputFormat is part of ProcessingState type (used for UI display and polling intervals)
  updateState({ outputFormat: savedFormat }, data.processingRunId);
  
  if (processingStartTimeRef && processingStartTimeRef.current !== null) {
    processingStartTimeRef.current = null;
  }
  await completeProcessing(stopKeepAlive, data.processingRunId);
  if (isCancelled(data.processingRunId)) return;

  // Show completion notification only if popup is closed.
  // This is useful for long operations when user switches to other tasks.
  try {
    if (isPopupOpen()) {
      log('Completion notification skipped (popup is open)', { timestamp: Date.now() });
      return;
    }

    const uiLang = await getUILanguageCached();
    const state = getProcessingState();
    const savedFormat = data.outputFormat || state.outputFormat || 'pdf';
    const formatKey = getExportFormatLabelKey(savedFormat) || 'formatPdf';
    const formatLabel = tSync(formatKey, uiLang);

    const notice = getDocumentReadyMessage(formatLabel, state.imageTranslationFailureCount, state.documentAbstractFailed);
    const ready = tSync(notice.key, uiLang, notice.params);
    const message = notice.detailKey ? ready + '\n' + tSync(notice.detailKey, uiLang) : ready;

    log('Showing completion notification (popup is closed)', {
      timestamp: Date.now(),
      outputFormat: savedFormat,
      message
    });
    if (isCancelled(data.processingRunId) || isPopupOpen()) return;
    await createNotification(message);
  } catch (notifError) {
    logWarn('Failed to show completion notification (non-critical)', {
      error: notifError?.message || String(notifError)
    });
  }
}

/**
 * Handle processing result: continue pipeline and finalize
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {{current: number}} processingStartTimeRef - Reference object with current property
 * @param {import('../../types.js').ContinueProcessingPipelineFunction} continuePipeline - Function to continue processing pipeline
 * @returns {Promise<void>}
 */
export async function handleProcessingResult(data, result, stopKeepAlive, processingStartTimeRef, continuePipeline) {
  if (isCancelled(data.processingRunId)) return;
  log(`✅ Content extraction complete: ${result.content?.length || 0} items`, { 
    title: result.title,
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
  
  const generationResult = await continuePipeline(data, result, stopKeepAlive);
  if (isCancelled(data.processingRunId)) return;
  if ((data.outputFormat || 'pdf') === 'pdf' && generationResult && typeof generationResult === 'object' &&
      'deferred' in generationResult && generationResult.deferred === true) return;
  
  // After generation, finalize processing
  await finalizeProcessing(data, stopKeepAlive, processingStartTimeRef);
}

/**
 * Handle processing error: normalize and set error state
 * @param {Error} error - Error object
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {{source?: string, errorType?: string, context?: any}} [errorContext={}] - Additional error context
 * @returns {Promise<void>}
 * @throws {Error} If error handling fails
 */
export async function handleProcessingError(error, data, stopKeepAlive, errorContext = {}) {
  if (isCancelled(data.processingRunId)) return;
  if (isPdfSelectionCancelled(error)) {
    if (data.processingRunId) await cancelProcessing(stopKeepAlive, data.processingRunId);
    return;
  }
  logError('Processing failed', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    errorName: error?.name,
    timestamp: Date.now(),
    ...errorContext
  });
  
  // Check if processing was cancelled - don't set error if cancelled
  if (isCancelled(data.processingRunId)) {
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
      mode: data.mode,
      ...errorContext.context
    }
  });
  
  // Set error with normalized message and code
  await setError({
    message: normalized.userMessage || normalized.message || 'Processing failed',
    code: normalized.userCode || normalized.code,
    translationKey: normalized.translationKey,
    translationParams: normalized.translationParams
  }, stopKeepAlive, data.processingRunId);
}

/**
 * Handle translation step in processing pipeline
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {typeof import('../../translation/text.js').translateContent} translateContent - Function to translate content
 * @param {typeof import('../../translation/images.js').translateImages} translateImages - Function to translate images
 * @param {function(Array<import('../../types.js').ContentItem>): string} detectSourceLanguage - Function to detect source language (synchronous)
 * @param {function(Partial<import('../../types.js').ProcessingState>): void} updateState - Function to update state
 * @returns {Promise<import('../../types.js').ExtractionResult>} Updated result with translated content
 */
export async function handleTranslation(
  data,
  result,
  translateContent,
  translateImages,
  detectSourceLanguage,
  updateState
) {
  await checkCancellation('translation', data.processingRunId);
  updateState = getScopedUpdateState(data.processingRunId, updateState);
  const language = data.language || 'auto';
  const hasImageTranslation = isImageTranslationEnabled(data);
  
  // Only translate if user explicitly selected a target language (not 'auto')
  if (language === 'auto' || !result.content || result.content.length === 0) {
    // No translation needed - skip to generation progress
    log('⏭️  Translation skipped (auto language or no content)');
    updateState({ currentStage: PROCESSING_STAGES.GENERATING.id, progress: 60 });
    return result;
  }
  
  log(`🌐 Starting translation to ${language}${hasImageTranslation ? ' (with image translation)' : ''}`);
  await updateProgress(
    PROCESSING_STAGES.TRANSLATING, 
    'statusTranslatingContent', 
    hasImageTranslation ? 40 : 42,
    { processingRunId: data.processingRunId }
  );
  
  // Translate images first if enabled
  if (hasImageTranslation) {
    await checkCancellation('image translation', data.processingRunId);
    
    log('Starting image translation', { targetLanguage: language });
    await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusAnalyzingImages', 40, { processingRunId: data.processingRunId });
    
    // Use detected language from automatic extraction if available, otherwise detect from content
    let sourceLang;
    if (result.detectedLanguage) {
      sourceLang = result.detectedLanguage;
      log('🌍 LANGUAGE DETECTION: Using detected language for image translation', {
        sourceLanguage: sourceLang,
        targetLanguage: language,
        source: 'result.detectedLanguage (from extraction)'
      });
    } else {
      log('🔍 LANGUAGE DETECTION: Detecting source language from content for image translation', {
        targetLanguage: language,
        method: 'detectSourceLanguage (character-based)'
      });
      sourceLang = detectSourceLanguage(result.content);
      log('🌍 LANGUAGE DETECTION: Source language detected for image translation', {
        sourceLanguage: sourceLang,
        targetLanguage: language,
        method: 'character-based detection'
      });
    }
    result.content = await translateImages(
      result.content, sourceLang, language, 
      data.apiKey, data.googleApiKey, data.model, updateState, {
        ...getAIRequestOptions(data), imageTranslationProvider: data.imageTranslationProvider, geminiImageModel: data.geminiImageModel,
        openrouterImageModel: data.openrouterImageModel,
        imageApiKey: data.imageApiKey, outputFormat: data.outputFormat
      }
    );
    log('✅ Image translation complete');
  }
  
  // Check if processing was cancelled before text translation
  await checkCancellation('text translation', data.processingRunId);
  
  log('Starting text translation', { targetLanguage: language });
  
  // Analyze content size for translation
  const totalTextLength = result.content ? result.content.reduce((sum, item) => {
    const text = (item.text || '').replace(/<[^>]+>/g, '').trim();
    return sum + text.length;
  }, 0) : 0;
  const estimatedBatches = Math.ceil(totalTextLength / CONFIG.TRANSLATION_CHUNK_SIZE);
  const usagePercent = Math.round((totalTextLength / (CONFIG.TRANSLATION_CHUNK_SIZE * 100)) * 100); // Rough estimate
  
  log('📊 Translation metrics', {
    totalTextLength: totalTextLength,
    chunkSizeLimit: CONFIG.TRANSLATION_CHUNK_SIZE,
    estimatedBatches: estimatedBatches,
    contentItems: result.content?.length || 0
  });
  
  await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusTranslatingText', 45, { processingRunId: data.processingRunId });
  result = await translateContent(result, language, data.apiKey, data.model, updateState, getAIRequestOptions(data));
  await getAIRequestOptions(data).checkCancelled();
  log(`✅ Translation complete: content translated to ${language}`, { title: result.title });
  
  return result;
}

/**
 * Handle abstract generation step in processing pipeline
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {typeof import('../../translation/generation.js').generateAbstract} generateAbstract - Function to generate abstract
 * @param {function(Partial<import('../../types.js').ProcessingState>): void} updateState - Function to update state
 * @returns {Promise<void>}
 */
export async function handleAbstractGeneration(
  data,
  result,
  generateAbstract,
  updateState
) {
  updateState = getScopedUpdateState(data.processingRunId, updateState);
  // Check if processing was cancelled before abstract generation
  await checkCancellation('abstract generation', data.processingRunId);
  
  if (!data.generateAbstract || !supportsDocumentAbstract(data.mode, data.outputFormat)) return;

  const abstractLang = data.language && data.language !== 'auto' ? data.language : await getUILanguageCached();
  let abstract;
  if (result.content?.length && data.apiKey) {
    const options = getAIRequestOptions(data);
    const fallbackTitle = result.markdown ? 'PDF Document' : 'Untitled';
    try {
      await updateProgress(PROCESSING_STAGES.GENERATING, 'stageGeneratingAbstract', 62, { processingRunId: data.processingRunId });
      await options.checkCancelled();
      abstract = await generateAbstract(
        result.content, result.title || data.title || fallbackTitle,
        data.apiKey, data.model, abstractLang, updateState, options
      );
    } catch {
      await options.checkCancelled();
      logWarn('Abstract generation failed');
    }
    await options.checkCancelled();
  }
  if (typeof abstract === 'string' && abstract.trim()) result.abstract = abstract;
  else updateState({ documentAbstractFailed: true });
}

/**
 * Detect effective language for document generation
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {typeof import('../../translation/detection.js').detectContentLanguage} detectContentLanguage - Function to detect content language
 * @returns {Promise<string>} Effective language code
 */
export async function detectEffectiveLanguage(
  data,
  result,
  detectContentLanguage
) {
  if (data.language && data.language !== 'auto') return data.language;
  if (result.detectedLanguage) return result.detectedLanguage;
  if (!result.content?.length) return 'auto';

  let detectedLanguage;
  if (data.mode === 'automatic') {
    detectedLanguage = detectSourceLanguage(result.content);
  } else if (data.apiKey) {
    try {
      detectedLanguage = await detectContentLanguage(result.content, data.apiKey, data.model, getAIRequestOptions(data));
    } catch (error) {
      logWarn('Language detection failed', error);
    }
  }
  if (!detectedLanguage || detectedLanguage === 'unknown') return 'auto';
  result.detectedLanguage = detectedLanguage;
  return detectedLanguage;
}

