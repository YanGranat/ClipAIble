// @ts-check
// Article processing orchestration for background service worker
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize orchestration module with dependencies
 * @param {import('../types.js').OrchestrationDependencies} deps - Dependencies object
 * @returns {{startArticleProcessing: function(import('../types.js').ProcessingData, Function): Promise<boolean>, continueProcessingPipeline: function(import('../types.js').ProcessingData, import('../types.js').ExtractionResult, import('../types.js').StopKeepAliveFunction?): Promise<void>}} Orchestration functions
 */
export function initOrchestration(deps) {
  const {
    log,
    logWarn,
    CONFIG,
    getProcessingState,
    setError,
    setResult,
    updateState,
    ERROR_CODES,
    PROCESSING_STAGES,
    validateAndInitializeProcessing,
    handlePdfPageProcessing,
    handleVideoPageProcessing,
    handleStandardArticleProcessing,
    checkCancellation,
    updateProgress,
    getUILanguageCached,
    handleTranslation,
    handleAbstractGeneration,
    detectEffectiveLanguage,
    translateContent,
    translateImages,
    detectSourceLanguage,
    generateAbstract,
    detectContentLanguage,
    DocumentGeneratorFactory,
    detectPdfPage,
    getOriginalPdfUrl,
    detectVideoPlatform,
    tSync,
    startKeepAlive,
    stopKeepAlive
  } = deps;

  /**
   * Start article processing
   * @param {import('../types.js').ProcessingData} data - Processing data
   * @param {import('../types.js').ExtractFromPageFunction} extractFromPageInlined - Inline extraction function
   * @returns {Promise<boolean>}
   */
  async function startArticleProcessing(data, extractFromPageInlined) {
  // Validate and initialize processing
  if (!(await validateAndInitializeProcessing(data, stopKeepAlive, startKeepAlive))) {
    return false;
  }
  
  const processingStartTime = Date.now();
  
  // DETAILED LOGGING: All processing settings at start
  const logData = {
    // Basic data
    url: data.url,
    title: data.title,
    tabId: data.tabId,
    htmlLength: data.html?.length || 0,
    htmlPreview: data.html ? data.html.substring(0, 500) + '...' : null,
    
    // Processing settings
    mode: data.mode,
    outputFormat: data.outputFormat,
    generateToc: data.generateToc,
    generateAbstract: data.generateAbstract,
    
    // AI settings
    model: data.model,
    hasApiKey: !!data.apiKey,
    apiKeyLength: data.apiKey?.length || 0,
    apiKeyPrefix: data.apiKey ? (data.apiKey.startsWith('sk-') ? 'sk-' : data.apiKey.startsWith('AIza') ? 'AIza' : data.apiKey.startsWith('xai-') ? 'xai-' : 'other') : null,
    apiProvider: data.apiProvider,
    
    // Translation settings
    targetLanguage: data.targetLanguage,
    translateImages: data.translateImages,
    
    // PDF settings
    pageMode: data.pageMode,
    fontFamily: data.fontFamily,
    fontSize: data.fontSize,
    bgColor: data.bgColor,
    textColor: data.textColor,
    headingColor: data.headingColor,
    linkColor: data.linkColor,
    
    // Audio settings
    audioProvider: data.audioProvider,
    audioVoice: data.audioVoice,
    audioSpeed: data.audioSpeed,
    audioFormat: data.audioFormat,
    
    // Cache settings
    useCache: data.useCache,
    
    // Processing state
    processingStartTime: processingStartTime,
    timestamp: Date.now()
  };
  
  log('=== START ARTICLE PROCESSING: ALL SETTINGS ===', logData);
  
  log('🚀 Starting article processing', {
    mode: data.mode,
    model: data.model,
    outputFormat: data.outputFormat,
    generateToc: data.generateToc,
    generateAbstract: data.generateAbstract,
    url: data.url,
    htmlLength: data.html?.length || 0
  });
  
  // CRITICAL: Log audio parameters if output format is audio
  if (data.outputFormat === 'audio') {
    log('[ClipAIble Background] ===== AUDIO PARAMETERS IN startArticleProcessing =====', {
      timestamp: Date.now(),
      audioProvider: data.audioProvider,
      audioVoice: data.audioVoice,
      audioVoiceType: typeof data.audioVoice,
      googleTtsVoice: data.googleTtsVoice,
      googleTtsVoiceType: typeof data.googleTtsVoice,
      googleTtsModel: data.googleTtsModel,
      googleTtsPrompt: data.googleTtsPrompt,
      audioSpeed: data.audioSpeed,
      audioFormat: data.audioFormat,
      url: data.url,
      willBeUsedForAudio: true
    });
  }
  
  const processingStartTimeRef = { current: processingStartTime };
  
  // Check if this is a PDF page
  // Get tab URL to check for Chrome PDF viewer
  let tabUrl = null;
  try {
    if (data.tabId) {
      const tab = await chrome.tabs.get(data.tabId);
      tabUrl = tab.url;
    }
  } catch (e) {
    logWarn('Failed to get tab URL for PDF detection', e);
  }
  
  const pdfInfo = detectPdfPage(data.url, tabUrl);
  if (pdfInfo && pdfInfo.isPdf) {
    log('📄 Detected PDF page - processing as PDF document');
    // Process as PDF page - skip selector/extract modes
    let pdfUrl = pdfInfo.originalUrl;
    
    // If original URL is not available (Chrome PDF viewer), try to get it
    if (!pdfUrl && data.tabId) {
      pdfUrl = await getOriginalPdfUrl(data.tabId);
    }
    
    if (!pdfUrl) {
      const uiLang = await getUILanguageCached();
      await setError({
        message: tSync('errorPdfUrlNotFound', uiLang) || 'Could not determine PDF file URL',
        code: ERROR_CODES.VALIDATION_ERROR
      }, stopKeepAlive);
      return false;
    }
    
    return await handlePdfPageProcessing(
      data,
      pdfUrl,
      stopKeepAlive,
      continueProcessingPipeline,
      processingStartTimeRef
    );
  }
  
  // Check if this is a video page (YouTube/Vimeo)
  const videoInfo = detectVideoPlatform(data.url);
  if (videoInfo) {
    log(`🎥 Detected ${videoInfo.platform} video page - processing as video`);
    // Process as video page - skip selector/extract modes
    return await handleVideoPageProcessing(
      data,
      videoInfo,
      stopKeepAlive,
      continueProcessingPipeline,
      processingStartTimeRef
    );
  }
  
  // Standard article processing
  log('📰 Processing as standard article page');
  return await handleStandardArticleProcessing(
    data,
    stopKeepAlive,
    continueProcessingPipeline,
    extractFromPageInlined,
    processingStartTimeRef
  );
}

  /**
   * Continue processing pipeline after content extraction
   * Handles: translation, TOC/Abstract generation, document generation
   * Used by both standard article processing and video processing
   * @param {import('../types.js').ProcessingData} data - Original processing data
   * @param {import('../types.js').ExtractionResult} result - Extracted content result
   * @param {import('../types.js').StopKeepAliveFunction} [stopKeepAliveParam] - Function to stop keep-alive (passed as parameter for backward compatibility)
   * @returns {Promise<void>}
   */
  async function continueProcessingPipeline(data, result, stopKeepAliveParam) {
    const pipelineStartTime = Date.now();
    // Use parameter if provided, otherwise use injected dependency
    // Note: stopKeepAliveParam is kept for backward compatibility with existing callers
    // but we use the injected stopKeepAlive from deps for consistency
    const actualStopKeepAlive = stopKeepAliveParam || stopKeepAlive;
    
    log('🔄 Starting processing pipeline', {
      outputFormat: data.outputFormat,
      hasContent: !!result.content,
      contentItems: result.content?.length || 0,
      willTranslate: data.language && data.language !== 'auto',
      willGenerateAbstract: data.generateAbstract && data.outputFormat !== 'audio'
    });
    
    // Check if processing was cancelled
  await checkCancellation('start of pipeline');
  
  // CRITICAL: Save original detectedLanguage BEFORE translation
  // If translation happens, the content will be in target language, but we need to preserve
  // the source language for abstract generation when language is 'auto'
  const originalDetectedLanguage = result.detectedLanguage;
  if (originalDetectedLanguage) {
    log('🌍 LANGUAGE DETECTION: Preserving original detected language before translation', {
      originalDetectedLanguage,
      reason: 'Will be needed for abstract generation if language is auto',
      willTranslate: data.language && data.language !== 'auto'
    });
  }
  
  // Handle translation step
  const translationStartTime = Date.now();
  result = await handleTranslation(
    data,
    result,
    translateContent,
    translateImages,
    detectSourceLanguage,
    updateState
  );
  
  // CRITICAL: Restore original detectedLanguage if it was set before translation
  // This ensures that if language is 'auto', abstract will be generated in source language,
  // not in target language (which would be detected from translated content)
  if (originalDetectedLanguage) {
    result.detectedLanguage = originalDetectedLanguage;
    log('🌍 LANGUAGE DETECTION: Restored original detected language after translation', { 
      detectedLanguage: originalDetectedLanguage,
      reason: 'Content is now translated, but we preserve source language for abstract generation',
      targetLanguage: data.language
    });
  }
  
  const translationDuration = Date.now() - translationStartTime;
  if (data.language && data.language !== 'auto') {
    log(`✅ Translation step complete`, {
      duration: `${translationDuration}ms (${(translationDuration / 1000).toFixed(1)}s)`,
      targetLanguage: data.language
    });
  }
  
  setResult(result);
  
  const outputFormat = data.outputFormat || 'pdf';
  
  // CRITICAL: Detect language BEFORE abstract generation
  // Abstract generation needs to know the content language when language is 'auto'
  // NOTE: If translation happened, result.content is now in target language, but we preserve
  // original detectedLanguage above. If no translation happened, detectEffectiveLanguage will
  // use result.detectedLanguage if available, or detect from content if needed.
  const languageStartTime = Date.now();
  const effectiveLanguage = await detectEffectiveLanguage(
    data,
    result,
    detectContentLanguage
  );
  
  const languageDuration = Date.now() - languageStartTime;
  log(`✅ Language detection complete`, {
    effectiveLanguage,
    duration: `${languageDuration}ms`
  });
  
  // CRITICAL: Set result.detectedLanguage so handleAbstractGeneration can use it
  // If language was 'auto' and we detected it, store it in result
  // NOTE: We do NOT overwrite result.detectedLanguage if it was already set (from extraction or preserved after translation)
  if (data.language === 'auto' && effectiveLanguage !== 'auto' && !result.detectedLanguage) {
    result.detectedLanguage = effectiveLanguage;
    log('Set result.detectedLanguage for abstract generation', { detectedLanguage: effectiveLanguage });
  } else if (result.detectedLanguage) {
    log('Using already detected language from extraction', { detectedLanguage: result.detectedLanguage });
  }
  
  // Handle abstract generation step (AFTER language detection)
  // Now we can use the detected language for abstract generation
  const abstractStartTime = Date.now();
  await handleAbstractGeneration(
    data,
    result,
    generateAbstract,
    updateState
  );
  
  if (data.generateAbstract && data.outputFormat !== 'audio') {
    const abstractDuration = Date.now() - abstractStartTime;
    log(`✅ Abstract generation step complete`, {
      duration: `${abstractDuration}ms (${(abstractDuration / 1000).toFixed(1)}s)`
    });
  }
  
  // @ts-ignore - stage is allowed in UpdateStateFunction type
  updateState({ stage: PROCESSING_STAGES.GENERATING.id, progress: 65 });
  
  // Check if processing was cancelled before document generation
  await checkCancellation('document generation');
  
  const generationStartTime = Date.now();
  log(`📄 Starting document generation`, {
    format: outputFormat,
    effectiveLanguage,
    contentItems: result.content?.length || 0
  });
  
  // DETAILED LOGGING: Log content before PDF generation
  log('=== CONTENT BEFORE PDF GENERATION ===', {
    title: result.title,
    author: result.author,
    publishDate: result.publishDate,
    contentItemsCount: result.content?.length || 0,
    outputFormat,
    effectiveLanguage,
    timestamp: Date.now()
  });
  
  // Log ALL content items with FULL text - NO TRUNCATION
  // Only log full content if verbose logging is enabled (prevents memory/performance issues)
  if (result.content && Array.isArray(result.content)) {
    if (CONFIG?.VERBOSE_LOGGING) {
      log('=== CONTENT ITEMS BEFORE PDF (ALL - FULL TEXT) ===', {
        totalItems: result.content.length
      });
      
      // Log each item separately for full visibility (only in verbose mode)
      result.content.forEach((item, idx) => {
        log(`=== CONTENT ITEM BEFORE PDF [${idx}] ===`, {
          index: idx,
          type: item.type,
          text: item.text || item.html || '', // FULL TEXT - NO TRUNCATION
          textLength: (item.text || item.html || '').length,
          html: item.html || null, // FULL HTML - NO TRUNCATION
          htmlLength: item.html ? item.html.length : 0,
          wasTranslated: item.translated || false,
          hasGoogleTranslateText: (item.text || item.html || '').includes('Исходный текст') || (item.text || item.html || '').includes('Оцените этот перевод') || (item.text || item.html || '').includes('Google Переводчик')
        });
      });
    } else {
      // In non-verbose mode, only log summary
      log('=== CONTENT ITEMS BEFORE PDF (SUMMARY) ===', {
        totalItems: result.content.length,
        itemsByType: result.content.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {}),
        note: 'Enable VERBOSE_LOGGING in CONFIG to see full content'
      });
    }
  }
  
  // Prepare data for factory (add effectiveLanguage for audio generation)
  const factoryData = {
    ...data,
    effectiveLanguage: effectiveLanguage
  };
  
    // Generate document using factory
    const document = await DocumentGeneratorFactory.generate(outputFormat, factoryData, result, updateState);
    
    const generationDuration = Date.now() - generationStartTime;
    const totalPipelineDuration = Date.now() - pipelineStartTime;
    
    log(`✅ Document generation complete`, {
      format: outputFormat,
      duration: `${generationDuration}ms (${(generationDuration / 1000).toFixed(1)}s)`,
      totalPipelineDuration: `${totalPipelineDuration}ms (${(totalPipelineDuration / 1000).toFixed(1)}s)`
    });
    
    return document;
    
    // Note: recordSave and completeProcessing are handled by the promise chain
    // that calls this function, not here (since we return a promise from generate*)
  }

  return {
    startArticleProcessing,
    continueProcessingPipeline
  };
}

