// Pipeline helper utilities for ClipAIble extension
// Provides common patterns for processing pipeline to reduce code duplication

// @ts-check

import { isCancelled } from '../../state/processing.js';
import { getUILanguage, tSync } from '../../locales.js';
import { updateState, getProcessingState } from '../../state/processing.js';
import { PROCESSING_STAGES } from '../../state/processing.js';
import { log, logError, logWarn } from '../logging.js';
import { recordSave } from '../../stats/index.js';
import { completeProcessing, setError } from '../../state/processing.js';
import { handleError } from '../error-handler.js';
import { detectContentLanguage, generateSummary, generateAbstract } from '../../translation/index.js';
import { CONFIG } from '../config.js';

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
 * @returns {void}
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
 * @param {{id: string, label?: string, name?: string, order?: number}} stage - Processing stage object (from PROCESSING_STAGES)
 * @param {string} statusKey - Translation key for status message
 * @param {number} progress - Progress percentage (0-100)
 * @param {{replacements?: Array<string>, extra?: Record<string, any>}} [options={}] - Additional options
 * @returns {Promise<void>}
 */
export async function updateProgress(stage, statusKey, progress, options = {}) {
  const uiLang = await getUILanguageCached();
  let status = tSync(statusKey, uiLang);
  
  // Apply replacements if provided
  if (options.replacements && Array.isArray(options.replacements)) {
    // Simple replacement: replace {0}, {1}, etc. with replacement values
    options.replacements.forEach((replacement, index) => {
      status = status.replace(`{${index}}`, String(replacement));
    });
  }
  
  updateState({ 
    stage: stage.id, 
    status, 
    progress,
    ...options.extra
  });
}

/**
 * Finalize processing: record stats, update state, and complete
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {{current: number}|null} processingStartTimeRef - Reference object with current property (can be null)
 * @returns {Promise<void>}
 */
export async function finalizeProcessing(data, stopKeepAlive, processingStartTimeRef) {
  log('🎉 Processing complete - file ready for download');
  
  // Record stats (non-blocking - errors are handled inside recordSave)
  try {
    const processingTime = processingStartTimeRef && processingStartTimeRef.current 
      ? Date.now() - processingStartTimeRef.current 
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
  // outputFormat is part of ProcessingState type (used for UI display and polling intervals)
  updateState({ outputFormat: savedFormat });
  
  if (processingStartTimeRef && processingStartTimeRef.current !== null) {
    processingStartTimeRef.current = null;
  }
  await completeProcessing(stopKeepAlive);
}

/**
 * Handle processing result: continue pipeline and finalize
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {function(): Promise<void>} stopKeepAlive - Function to stop keep-alive
 * @param {{current: number}} processingStartTimeRef - Reference object with current property
 * @param {function(import('../../types.js').ProcessingData, import('../../types.js').ExtractionResult, Function?): Promise<void>} continuePipeline - Function to continue processing pipeline
 * @returns {Promise<void>}
 */
export async function handleProcessingResult(data, result, stopKeepAlive, processingStartTimeRef, continuePipeline) {
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
  
  await continuePipeline(data, result, stopKeepAlive);
  
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
      mode: data.mode,
      ...errorContext.context
    }
  });
  
  // Set error with normalized message and code
  await setError({
    message: normalized.userMessage || normalized.message || 'Processing failed',
    code: normalized.userCode || normalized.code
  }, stopKeepAlive);
}

/**
 * Handle translation step in processing pipeline
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {function(import('../../types.js').ExtractionResult, string, string, string, function(Partial<import('../../types.js').ProcessingState>): void): Promise<import('../../types.js').ExtractionResult>} translateContent - Function to translate content
 * @param {function(Array<import('../../types.js').ContentItem>, string, string, string, string, string, function(Partial<import('../../types.js').ProcessingState>): void): Promise<Array<import('../../types.js').ContentItem>>} translateImages - Function to translate images
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
  const language = data.language || 'auto';
  const hasImageTranslation = data.translateImages && data.googleApiKey;
  
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
    hasImageTranslation ? 40 : 42
  );
  
  // Translate images first if enabled
  if (hasImageTranslation) {
    await checkCancellation('image translation');
    
    log('Starting image translation', { targetLanguage: language });
    await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusAnalyzingImages', 40);
    
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
      data.apiKey, data.googleApiKey, data.model, updateState
    );
    log('✅ Image translation complete');
  }
  
  // Check if processing was cancelled before text translation
  await checkCancellation('text translation');
  
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
  
  await updateProgress(PROCESSING_STAGES.TRANSLATING, 'statusTranslatingText', 45);
  try {
    result = await translateContent(result, language, data.apiKey, data.model, updateState);
    log(`✅ Translation complete: content translated to ${language}`, { title: result.title });
  } catch (error) {
    // Use constant pattern matching instead of string includes
    const isAuthError = ['authentication', '401', '403', 'unauthorized', 'forbidden']
      .some(pattern => (error.message || '').toLowerCase().includes(pattern));
    if (isAuthError) {
      logError('Translation failed: authentication error', error);
      const uiLang = await getUILanguageCached();
      const errorMsg = tSync('errorAuthFailed', uiLang);
      updateState({ 
        currentStage: PROCESSING_STAGES.TRANSLATING.id,
        status: errorMsg, 
        progress: 0,
        error: 'AUTH_ERROR'
      });
      throw new Error(errorMsg);
    }
    // For other errors, log but continue without translation
    logError('Translation failed, continuing without translation', error);
    await updateProgress(PROCESSING_STAGES.TRANSLATING, 'errorTranslationFailed', 60);
  }
  
  return result;
}

/**
 * Handle abstract generation step in processing pipeline
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {function(Array<import('../../types.js').ContentItem>, string, string, string, string?, function(Partial<import('../../types.js').ProcessingState>): void?): Promise<string>} generateAbstract - Function to generate abstract
 * @param {function(Partial<import('../../types.js').ProcessingState>): void} updateState - Function to update state
 * @returns {Promise<void>}
 */
export async function handleAbstractGeneration(
  data,
  result,
  generateAbstract,
  updateState
) {
  // Check if processing was cancelled before abstract generation
  await checkCancellation('abstract generation');
  
  // Generate abstract if enabled (but skip for audio format)
  const shouldGenerateAbstract = data.generateAbstract && 
                                 data.outputFormat !== 'audio' && 
                                 result.content && 
                                 result.content.length > 0 && 
                                 data.apiKey;
  if (!shouldGenerateAbstract) {
    log('⏭️  Abstract generation skipped (not enabled or audio format)');
    return;
  }
  
  log('📝 Starting abstract generation');
  // CRITICAL: TLDR and article must always be in the same language
  // - If user selected a specific target language (data.language !== 'auto'), use that language
  //   (article is already translated to target language, so TLDR should be in target language too)
  // - If language is 'auto', use detected source language from result
  //   (article is in source language, so TLDR should be in source language too)
  let abstractLang = data.language || 'auto';
  
  log('🌍 LANGUAGE DETECTION: Determining language for abstract generation', {
    userSelectedLanguage: data.language || 'auto',
    hasDetectedLanguage: !!result.detectedLanguage,
    detectedLanguage: result.detectedLanguage,
    currentAbstractLang: abstractLang
  });
  
  // CRITICAL: If language is 'auto', use detected language from result (source language)
  // Language detection happens BEFORE abstract generation, so result.detectedLanguage is available
  if (abstractLang === 'auto' && result.detectedLanguage) {
    abstractLang = result.detectedLanguage;
    log('🌍 LANGUAGE DETECTION: Using detected source language for abstract', { 
      detectedLanguage: abstractLang,
      source: 'result.detectedLanguage',
      reason: 'Article and TLDR must be in the same language (source language)',
      method: 'auto mode - using detected source language'
    });
  } else if (abstractLang !== 'auto') {
    log('🌍 LANGUAGE DETECTION: Using target language for abstract', {
      targetLanguage: abstractLang,
      source: 'user selection',
      reason: 'Article and TLDR must be in the same language (target language)',
      method: 'user selected specific target language'
    });
  } else {
    log('⚠️ LANGUAGE DETECTION: No language available for abstract, using auto', {
      abstractLang: 'auto',
      hasDetectedLanguage: !!result.detectedLanguage,
      reason: 'No detected language and user selected auto'
    });
  }
  
  // CRITICAL: For PDF, use generateAbstract (TLDR 2-4 sentences) for PDF abstract/TLDR
  // This is different from generateSummary which is used for full summary in popup
  // PDF processing extracts text page by page in one chat, then we need to send
  // the complete text to LLM in a NEW chat to generate abstract
  // We can detect PDF by checking if result.markdown exists (PDF processing sets this)
  const isPdfResult = result.markdown && typeof result.markdown === 'string' && result.markdown.length > 0;
  
  try {
    await updateProgress(PROCESSING_STAGES.GENERATING, 'stageGeneratingAbstract', 62);
    
    if (isPdfResult) {
      // For PDF: use generateAbstract (TLDR 2-4 sentences) for PDF abstract/TLDR
      // This is different from generateSummary which is used for full summary in popup
      // CRITICAL: result.content should already be translated if translation was performed
      // (handleTranslation is called before handleAbstractGeneration in continueProcessingPipeline)
      const wasTranslated = data.language && data.language !== 'auto';
      log('📝 ABSTRACT GENERATION: Starting PDF abstract generation', {
        contentItemsCount: result.content?.length || 0,
        markdownLength: result.markdown?.length || 0,
        abstractLanguage: abstractLang,
        userSelectedLanguage: data.language,
        wasTranslated: wasTranslated,
        contentLanguage: wasTranslated ? 'translated (target language)' : 'original (source language)',
        functionName: 'generateAbstract',
        expectedOutput: 'TLDR 2-4 sentences',
        note: wasTranslated 
          ? 'Content is TRANSLATED - abstract will be generated from translated content in target language'
          : 'Content is ORIGINAL - abstract will be generated from original content in source language'
      });
      
      // CRITICAL: Use generateAbstract (not generateSummary) for PDF TLDR
      // generateAbstract generates TLDR 2-4 sentences
      // generateSummary generates full summary for popup
      const abstract = await generateAbstract(
        result.content, 
        result.title || data.title || 'PDF Document',
        data.apiKey,
        data.model,
        abstractLang,
        updateState
      );
      
      if (abstract) {
        log('✅ Abstract (TLDR) generated successfully', { 
          length: abstract.length,
          preview: abstract.substring(0, 200),
          sentenceCount: abstract.split(/[.!?]+/).filter(s => s.trim().length > 0).length
        });
        result.abstract = abstract;
        return;
      } else {
        logWarn('PDF abstract generation returned empty result');
      }
    } else {
      // For non-PDF: use generateAbstract as before
      const wasTranslated = data.language && data.language !== 'auto';
      log('📝 ABSTRACT GENERATION: Starting non-PDF abstract generation', {
        contentItemsCount: result.content?.length || 0,
        abstractLanguage: abstractLang,
        userSelectedLanguage: data.language,
        wasTranslated: wasTranslated,
        contentLanguage: wasTranslated ? 'translated (target language)' : 'original (source language)',
        note: wasTranslated 
          ? 'Content is TRANSLATED - abstract will be generated from translated content in target language'
          : 'Content is ORIGINAL - abstract will be generated from original content in source language'
      });
      
      const abstract = await generateAbstract(
        result.content, 
        result.title || data.title || 'Untitled',
        data.apiKey,
        data.model,
        abstractLang,
        updateState
      );
      if (abstract) {
        log('✅ Abstract generated successfully', { length: abstract.length });
        result.abstract = abstract;
        return;
      }
    }
  } catch (error) {
    logWarn('Abstract generation failed, continuing without abstract', error);
  }
}

/**
 * Detect effective language for document generation
 * @param {import('../../types.js').ProcessingData} data - Processing data
 * @param {import('../../types.js').ExtractionResult} result - Extracted content result
 * @param {function(Array<import('../../types.js').ContentItem>, string, string): Promise<string>} detectContentLanguage - Function to detect content language
 * @returns {Promise<string>} Effective language code
 */
export async function detectEffectiveLanguage(
  data,
  result,
  detectContentLanguage
) {
  log('🔍 LANGUAGE DETECTION: Starting effective language detection', {
    requestedLanguage: data.language || 'auto',
    hasDetectedLanguage: !!result.detectedLanguage,
    detectedLanguage: result.detectedLanguage,
    contentItemsCount: result.content?.length || 0,
    hasApiKey: !!data.apiKey,
    model: data.model
  });
  
  let effectiveLanguage = data.language || 'auto';
  if (effectiveLanguage === 'auto') {
    // Use detected language from automatic extraction if available
    if (result.detectedLanguage) {
      effectiveLanguage = result.detectedLanguage;
      const sourceType = result.detectedLanguage ? 'AI selector extraction' : 'automatic extraction';
      log('🌍 LANGUAGE DETECTION: Using language from extraction', { 
        detectedLanguage: effectiveLanguage,
        source: sourceType,
        method: 'from extraction result',
        reason: 'User selected auto, using detected source language'
      });
    } else if (result.content && result.content.length > 0 && data.apiKey) {
      // Fallback to AI detection if API key available
      // CRITICAL: Only detect from content if result.detectedLanguage is not already set
      // If it was set before translation, we preserve it (see orchestration.js)
      // If content was translated, detecting from translated content would give wrong result
      if (result.detectedLanguage) {
        log('🌍 LANGUAGE DETECTION: Skipping AI detection (language already set)', {
          reason: 'result.detectedLanguage already set (from extraction or preserved after translation)',
          detectedLanguage: result.detectedLanguage,
          effectiveLanguage: result.detectedLanguage,
          method: 'using existing detectedLanguage'
        });
        effectiveLanguage = result.detectedLanguage;
      } else {
        log('🤖 LANGUAGE DETECTION: Calling AI for language detection', {
          contentItemsCount: result.content.length,
          model: data.model,
          warning: 'Content may be translated - detection may give target language instead of source',
          method: 'AI detection via detectContentLanguage'
        });
        try {
          const detectedLang = await detectContentLanguage(result.content, data.apiKey, data.model);
          log('🌍 LANGUAGE DETECTION: AI detection result received', {
            detectedLanguage: detectedLang,
            method: 'AI detection',
            model: data.model
          });
          if (detectedLang && detectedLang !== 'unknown') {
            // CRITICAL: Use detected language even if it's 'en' - we need to know the actual language
            // This is important for abstract generation which needs to know the content language
            effectiveLanguage = detectedLang;
            // Also set result.detectedLanguage so it can be used by abstract generation
            result.detectedLanguage = detectedLang;
            log('✅ LANGUAGE DETECTION: Using AI-detected language', {
              effectiveLanguage,
              method: 'AI detection',
              storedIn: 'result.detectedLanguage'
            });
          } else {
            log('⚠️ LANGUAGE DETECTION: AI detected invalid language, keeping auto', {
              detectedLang,
              effectiveLanguage: 'auto',
              reason: 'AI returned invalid or unknown language code'
            });
          }
        } catch (error) {
          logWarn('⚠️ LANGUAGE DETECTION: AI detection failed, skipping', {
            reason: 'AI detection API call failed',
            method: 'skipping detection (fallback)',
            impact: 'Will use default/auto language',
            error: error.message
          });
        }
      }
    } else {
      log('⚠️ LANGUAGE DETECTION: No detection possible, keeping auto', {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        hasApiKey: !!data.apiKey,
        effectiveLanguage: 'auto',
        reason: 'No content or API key available for detection'
      });
    }
  } else {
    log('🌍 LANGUAGE DETECTION: Using user-selected language', {
      effectiveLanguage,
      source: 'user selection',
      method: 'direct user input',
      reason: 'User explicitly selected target language'
    });
  }
  
  log(`✅ LANGUAGE DETECTION: Complete - effective language: ${effectiveLanguage}`, {
    effectiveLanguage,
    requestedLanguage: data.language || 'auto',
    finalLanguage: effectiveLanguage
  });
  
  return effectiveLanguage;
}

