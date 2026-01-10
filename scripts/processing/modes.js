// Processing modes module for ClipAIble extension
// Handles different content extraction modes: automatic, selector, extract

// @ts-check

import { log, logError, logWarn, logDebug } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { callAI, getProviderFromModel } from '../api/index.js';
import { callWithRetry } from '../utils/retry.js';
import { 
  EXTRACT_SYSTEM_PROMPT,
  buildChunkSystemPrompt,
  buildChunkUserPrompt,
  SELECTOR_SYSTEM_PROMPT,
  buildSelectorUserPrompt
} from '../extraction/prompts.js';
import { splitHtmlIntoChunks, deduplicateContent, trimHtmlForAnalysis } from '../extraction/html-utils.js';
import { cleanTitleFromServiceTokens } from '../utils/html.js';
import { detectLanguageByCharacters } from '../translation/index.js';
import { extractAutomaticallyInlined } from '../extraction/automatic.js';
import { getUILanguage, tSync } from '../locales.js';
import { checkCancellation, getUILanguageCached, updateProgress } from '../utils/pipeline-helpers.js';
import { cleanAuthor } from '../utils/author-validator.js';
import { 
  getCachedSelectors, 
  cacheSelectors, 
  markCacheSuccess, 
  invalidateCache
} from '../cache/selectors.js';

/**
 * Get selectors from AI for selector mode
 * @param {string} html - HTML content
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<Object>} Selectors object
 */
export async function getSelectorsFromAI(html, url, title, apiKey, model) {
  logDebug('getSelectorsFromAI called', { url, model, htmlLength: html.length });
  
  // SECURITY: Validate HTML size before processing
  const MAX_HTML_SIZE = 50 * 1024 * 1024; // 50MB
  if (html && html.length > MAX_HTML_SIZE) {
    logError('HTML too large for selector extraction', { size: html.length, maxSize: MAX_HTML_SIZE });
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorHtmlTooLarge', uiLang));
  }
  
  const systemPrompt = SELECTOR_SYSTEM_PROMPT;
  const userPrompt = buildSelectorUserPrompt(html, url, title);
  
  logDebug('Sending request to AI...', { model, promptLength: userPrompt.length });
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  /** @type {import('../types.js').RetryOptions} */
  const retryOptions = {
    maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
    delays: CONFIG.RETRY_DELAYS,
    retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
  };
  const parsed = await callWithRetry(
    () => callAI(systemPrompt, userPrompt, apiKey, model, true),
    retryOptions
  );
  log('Parsed selectors', parsed);
  
  return parsed;
}

/**
 * Process content without AI (automatic mode)
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @returns {Promise<Object>} {title, author, content, publishDate, detectedLanguage}
 */
export async function processWithoutAI(data) {
  log('=== processWithoutAI: ENTRY ===', {
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    timestamp: Date.now()
  });
  
  // DETAILED LOGGING: All initial conditions and settings
  log('=== ALL INITIAL CONDITIONS AND SETTINGS ===', {
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
    
    // Audio settings (if applicable)
    audioProvider: data.audioProvider,
    audioVoice: data.audioVoice,
    audioSpeed: data.audioSpeed,
    audioFormat: data.audioFormat,
    
    // Cache settings
    useCache: data.useCache,
    
    // All other settings
    allDataKeys: Object.keys(data || {}),
    timestamp: Date.now()
  });
  
  const { html, url, title, tabId } = data;

  log('⚡ Automatic mode: Starting content extraction (no AI required)');
  log('Input data', { url, title, htmlLength: html?.length, tabId: tabId });

  const uiLang = await getUILanguage();
  if (!html) throw new Error(tSync('errorNoHtmlContent', uiLang));
  if (!tabId) throw new Error(tSync('errorTabIdRequired', uiLang));

  // Check if processing was cancelled
  await checkCancellation('automatic extraction');

  const uiLangExtracting = await getUILanguage();
  const extractingStatus = tSync('statusExtractingContent', uiLangExtracting);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: extractingStatus, progress: 5 });

  log('=== processWithoutAI: About to execute script ===', {
    tabId: tabId,
    url: url,
    hasExtractAutomaticallyInlined: typeof extractAutomaticallyInlined === 'function',
    timestamp: Date.now()
  });

  // Performance optimization: only collect debug info if LOG_LEVEL is DEBUG (0)
  // This significantly reduces memory and CPU usage in production
  const enableDebugInfo = CONFIG.LOG_LEVEL === 0; // 0 = DEBUG level

  // Execute automatic extraction in page context with timeout
  let results;
  try {
    log('=== processWithoutAI: Creating timeout and script promises ===', {
      enableDebugInfo: enableDebugInfo,
      logLevel: CONFIG.LOG_LEVEL,
      timestamp: Date.now()
    });
    
    // Add timeout to prevent hanging
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(async () => {
        logError('=== processWithoutAI: TIMEOUT TRIGGERED ===', {
          timeout: CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT,
          timestamp: Date.now()
        });
        const uiLang = await getUILanguage();
        reject(new Error(tSync('errorExtractionTimeout', uiLang).replace('{seconds}', String(CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT / 1000))));
      }, CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT);
    });
    
    log('=== processWithoutAI: Calling chrome.scripting.executeScript ===', {
      tabId: tabId,
      url: url,
      enableDebugInfo: enableDebugInfo,
      timestamp: Date.now()
    });
    
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractAutomaticallyInlined,
      args: [url, enableDebugInfo] // Pass enableDebugInfo flag
    });
    
    log('=== processWithoutAI: Waiting for Promise.race ===', {
      timestamp: Date.now()
    });
    
    try {
      results = await Promise.race([scriptPromise, timeoutPromise]);
      // Clear timeout if script completed successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } catch (error) {
      // Clear timeout on error too
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Check if error is due to tab being closed
      if (chrome.runtime.lastError) {
        const lastError = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
        if (lastError.includes('No tab with id') || lastError.includes('tab was closed') || lastError.includes('Invalid tab ID')) {
          const uiLang = await getUILanguage();
          throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
        }
      }
      
      // Check if tab is still available
      try {
        await chrome.tabs.get(tabId);
      } catch (tabError) {
        const uiLang = await getUILanguage();
        throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
      }
      
      throw error;
    }
    
    log('=== processWithoutAI: Promise.race completed ===', {
      hasResults: !!results,
      resultsLength: results?.length,
      timestamp: Date.now()
    });
    
    log('Automatic extraction executed', { resultsLength: results?.length });
    
    // DETAILED LOGGING: Log page information from debugInfo
    if (results && results[0] && results[0].result && results[0].result.debugInfo) {
      const debugInfo = results[0].result.debugInfo;
      
      if (debugInfo.pageInfo) {
        log('=== PAGE INFORMATION (FROM EXTRACTION) ===', debugInfo.pageInfo);
      }
      
      if (debugInfo.metaTags) {
        log('=== META TAGS (FROM EXTRACTION) ===', debugInfo.metaTags);
      }
      
      if (debugInfo.documentStructure) {
        log('=== DOCUMENT STRUCTURE (FROM EXTRACTION) ===', debugInfo.documentStructure);
      }
      
      if (debugInfo.mainContentPreview) {
        log('=== MAIN CONTENT PREVIEW (FROM EXTRACTION) ===', debugInfo.mainContentPreview);
      }
      
      if (debugInfo.documentHTMLFull) {
        log('=== DOCUMENT HTML PREVIEW (FROM EXTRACTION) ===', {
          documentHTMLPreview: debugInfo.documentHTMLFull.substring(0, 500) + '...',
          documentHTMLLength: debugInfo.documentHTMLFull?.length || 0
        });
      }
      
      if (debugInfo.bodyHTMLFull) {
        const bodyHTMLPreview = debugInfo.bodyHTMLFull.length > 1000 ? debugInfo.bodyHTMLFull.substring(0, 1000) + '...' : debugInfo.bodyHTMLFull;
        log('=== BODY HTML PREVIEW (FROM EXTRACTION) ===', {
          bodyHTMLPreview,
          bodyHTMLLength: debugInfo.bodyHTMLFull?.length || 0
        });
      }
      
      if (debugInfo.googleTranslateState) {
        log('=== GOOGLE TRANSLATE STATE (FROM EXTRACTION) ===', debugInfo.googleTranslateState);
      }
      
      if (debugInfo.firstParagraphCheck) {
        log('=== FIRST PARAGRAPH CHECK (FROM EXTRACTION) ===', debugInfo.firstParagraphCheck);
      }
      
      if (debugInfo.firstParagraphAsSeen) {
        log('=== FIRST PARAGRAPH AS SEEN BY EXTRACTION SCRIPT ===', debugInfo.firstParagraphAsSeen);
      }
      
      // CRITICAL: Compare HTML from popup vs HTML seen by extraction script
      // This will show if Google Translate modified DOM before extraction
      if (data.html && debugInfo.documentHTMLFull) {
        const popupHTMLPreview = data.html.length > 1000 ? data.html.substring(0, 1000) + '...' : data.html;
        const extractionHTMLPreview = debugInfo.documentHTMLFull.length > 1000 ? debugInfo.documentHTMLFull.substring(0, 1000) + '...' : debugInfo.documentHTMLFull;
        log('=== HTML COMPARISON: POPUP vs EXTRACTION SCRIPT ===', {
          popupHTMLLength: data.html.length,
          extractionHTMLLength: debugInfo.documentHTMLFull.length,
          lengthsMatch: data.html.length === debugInfo.documentHTMLFull.length,
          popupHTMLPreview,
          extractionHTMLPreview,
          htmlsMatch: data.html === debugInfo.documentHTMLFull,
          timestamp: Date.now()
        });
      }
      
      // CRITICAL: Log extraction logs summary (not full logs to reduce size)
      if (debugInfo.extractionLogs && Array.isArray(debugInfo.extractionLogs)) {
        const logTypes = debugInfo.extractionLogs.reduce((acc, log) => {
          const type = log.type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        log('=== EXTRACTION LOGS SUMMARY (FROM PAGE) ===', {
          totalLogs: debugInfo.extractionLogs.length,
          logTypes,
          note: 'Full logs removed to reduce log size'
        });
        
        // Also log each log separately for better visibility
        debugInfo.extractionLogs.forEach((logEntry, idx) => {
          log(`=== EXTRACTION LOG [${idx}]: ${logEntry.type} ===`, logEntry.data);
        });
      }
    }
    
    // DETAILED LOGGING: Log full extraction result
    if (results && results[0] && results[0].result) {
      const extractionResult = results[0].result;
      log('=== EXTRACTION RESULT DETAILED LOG ===', {
        title: extractionResult.title,
        author: extractionResult.author,
        publishDate: extractionResult.publishDate,
        detectedLanguage: extractionResult.detectedLanguage,
        contentItemsCount: extractionResult.content?.length || 0,
        timestamp: Date.now()
      });
      
      // Log content items summary only (no full text to reduce log size)
      if (extractionResult.content && Array.isArray(extractionResult.content)) {
        const itemsByType = extractionResult.content.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {});
        const totalTextLength = extractionResult.content.reduce((sum, item) => {
          return sum + ((item.text || item.html || '').length);
        }, 0);
        
        log('=== EXTRACTED CONTENT ITEMS (SUMMARY) ===', {
          totalItems: extractionResult.content.length,
          itemsByType,
          totalTextLength,
          avgTextLength: Math.round(totalTextLength / extractionResult.content.length),
          note: 'Full text logging removed to reduce log size'
        });
      }
    }
  } catch (scriptError) {
    logError('=== processWithoutAI: Script execution FAILED ===', {
      error: scriptError?.message || String(scriptError),
      errorStack: scriptError?.stack,
      errorName: scriptError?.name,
      timestamp: Date.now()
    });
    logError('Automatic extraction script execution failed', scriptError);
    const uiLang = await getUILanguageCached();
    const errorMsg = scriptError instanceof Error ? scriptError.message : 'Unknown error';
    throw new Error(tSync('errorExtractionExecutionFailed', uiLang).replace('{error}', errorMsg));
  }

  log('=== processWithoutAI: Validating results ===', {
    hasResults: !!results,
    resultsLength: results?.length,
    hasFirstResult: !!results?.[0],
    firstResultKeys: results?.[0] ? Object.keys(results[0]) : [],
    timestamp: Date.now()
  });

  if (!results || !results[0]) {
    logError('=== processWithoutAI: Empty results ===', {
      results: results,
      timestamp: Date.now()
    });
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorExtractionEmptyResults', uiLang));
  }

  if (results[0].error) {
    const error = results[0].error;
    logError('=== processWithoutAI: Result contains error ===', {
      error: error,
      timestamp: Date.now()
    });
    logError('Automatic extraction error', error);
    const uiLang = await getUILanguage();
    const errorMsg = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
    throw new Error(tSync('errorExtractionError', uiLang).replace('{error}', errorMsg));
  }

  /** @type {import('../types.js').InjectionResult} */
  const automaticResult = results[0].result;
  
  if (!automaticResult) {
    logError('=== processWithoutAI: No result in results[0] ===', {
      results0Keys: Object.keys(results[0]),
      timestamp: Date.now()
    });
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorExtractionNoResult', uiLang));
  }
  
  log('=== processWithoutAI: Results validated successfully ===', {
    hasResult: !!automaticResult,
    resultKeys: automaticResult ? Object.keys(automaticResult) : [],
    timestamp: Date.now()
  });

  const result = automaticResult;
  const imageCount = result.content ? result.content.filter(item => item.type === 'image').length : 0;
  
  // Log debug info if available and LOG_LEVEL is DEBUG (0)
  // Performance optimization: skip debug logging in production (LOG_LEVEL >= 1)
  if (result.debugInfo && CONFIG.LOG_LEVEL === 0) {
    log('Automatic extraction debug info', {
      foundElements: result.debugInfo.foundElements,
      imageCount: result.debugInfo.imageCount,
      allByType: result.debugInfo.allByType,
      filteredElements: result.debugInfo.filteredElements,
      filteredByType: result.debugInfo.filteredByType,
      excludedByType: result.debugInfo.excludedByType,
      excludedImageCount: result.debugInfo.excludedImageCount,
      filteredImageCount: result.debugInfo.filteredImageCount,
      processedCount: result.debugInfo.processedCount,
      skippedCount: result.debugInfo.skippedCount,
      finalImageCount: result.debugInfo.finalImageCount,
      contentTypes: result.debugInfo.contentTypes,
      finalContentTypes: result.debugInfo.finalContentTypes,
      duplicateHeadingsRemoved: result.debugInfo.duplicateHeadingsRemoved
    });
  }
  
  const automaticExtractionDetails = {
    title: result.title,
    author: result.author || 'N/A',
    publishDate: result.publishDate || 'N/A',
    contentItems: result.content?.length || 0,
    imageCount: imageCount,
    contentTypes: result.content ? [...new Set(result.content.map(item => item?.type).filter(Boolean))] : [],
    contentByType: result.content ? result.content.reduce((acc, item) => {
      const type = item?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}) : {},
    contentPreview: result.content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      level: item.level || null,
      textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
      textPreview: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 200),
      hasHtml: !!(item.html && item.html !== item.text),
      htmlLength: item.html ? item.html.length : 0
    })) || [],
    totalTextLength: result.content ? result.content.reduce((sum, item) => {
      const text = (item.text || '').replace(/<[^>]+>/g, '').trim();
      return sum + text.length;
    }, 0) : 0,
    headingCount: result.content ? result.content.filter(item => item.type === 'heading').length : 0,
    paragraphCount: result.content ? result.content.filter(item => item.type === 'paragraph').length : 0,
    listCount: result.content ? result.content.filter(item => item.type === 'list').length : 0,
    quoteCount: result.content ? result.content.filter(item => item.type === 'quote').length : 0,
    hasError: !!result.error,
    error: result.error
  };
  
  log('=== EXTRACTION RESULT (AUTOMATIC MODE) ===', automaticExtractionDetails);
  
  // Log full content structure for debugging
  if (result.content && result.content.length > 0) {
    log('=== EXTRACTED CONTENT FULL STRUCTURE (AUTOMATIC) ===', {
      totalItems: result.content.length,
      items: result.content.map((item, idx) => ({
        index: idx,
        type: item.type,
        level: item.level || null,
        textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
        textFull: (item.text || '').replace(/<[^>]+>/g, '').trim(),
        htmlLength: item.html ? item.html.length : 0,
        hasImage: item.type === 'image' ? {
          url: item.url || item.src || 'N/A',
          alt: item.alt || 'N/A'
        } : null,
        listItems: item.type === 'list' && item.items ? {
          count: item.items.length,
          ordered: item.ordered || false,
          itemsPreview: item.items.slice(0, 3).map((li, liIdx) => {
            let text = '';
            if (typeof li === 'string') {
              text = li.substring(0, 100);
            } else if (typeof li === 'object' && li !== null && 'html' in li) {
              // Type guard: li is object with html property
              const liWithHtml = /** @type {{html?: string}} */ (li);
              text = (liWithHtml.html || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
            }
            return { index: liIdx, text };
          })
        } : null
      }))
    });
  }
  
  // Log error details if present
  if (result.error) {
    logError('Automatic extraction returned error in result', {
      error: result.error,
      errorStack: result.errorStack
    });
  }

  if (!result.content || result.content.length === 0) {
    // Provide more detailed error message
    const errorMsg = result.error 
      ? `Automatic extraction failed: ${result.error}. The page structure may be too complex. Try using AI modes.`
      : 'Automatic extraction returned no content. The page structure may be too complex. Try using AI modes.';
    throw new Error(errorMsg);
  }

  // Detect language from content
  let detectedLanguage = 'en';
  try {
    // Extract text for language detection
    let text = '';
    for (const item of result.content) {
      if (item.text) {
        const textOnly = item.text.replace(/<[^>]+>/g, ' ').trim();
        text += textOnly + ' ';
        if (text.length > 5000) break;
      }
    }
    
    if (text.trim()) {
      // Use character-based detection (no AI needed)
      log('🔍 LANGUAGE DETECTION: Starting character-based detection (automatic mode)', {
        textLength: text.length,
        method: 'detectLanguageByCharacters',
        source: 'automatic extraction mode'
      });
      detectedLanguage = detectLanguageByCharacters(text);
      log('🌍 LANGUAGE DETECTION: Character-based detection result', { 
        detectedLanguage,
        method: 'character analysis',
        source: 'automatic extraction mode'
      });
    } else {
      log('⚠️ LANGUAGE DETECTION: No text found for detection, using default', {
        defaultLanguage: 'en',
        source: 'automatic extraction mode'
      });
    }
  } catch (error) {
    logWarn('Language detection failed, using default', error);
  }

  updateState({ progress: 15 });

  // CRITICAL: Clean author to remove anonymous/invalid values
  const cleanedAuthor = cleanAuthor(result.author || '');
  
  log(`✅ Automatic extraction complete: ${result.content?.length || 0} content items, language: ${detectedLanguage}`);
  
  return {
    title: result.title || title || 'Untitled',
    author: cleanedAuthor,
    content: result.content,
    publishDate: result.publishDate || '',
    detectedLanguage: detectedLanguage
  };
}

/**
 * Process content with extract mode (AI Extract)
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processWithExtractMode(data) {
  const { html, url, title, apiKey, model } = data;

  log('🤖 AI Extract mode: Starting content extraction with AI');
  log('Input data', { url, title, htmlLength: html?.length, model });

  const uiLang = await getUILanguage();
  if (!html) throw new Error(tSync('errorNoHtmlContent', uiLang));
  if (!apiKey) throw new Error(tSync('errorTtsNoApiKey', uiLang));

  // Check if processing was cancelled before extract mode processing
  await checkCancellation('extract mode processing');

  await updateProgress(PROCESSING_STAGES.ANALYZING, 'statusAnalyzingPage', 5);

  // FULL HTML BEFORE CHUNKING
  log('=== FULL HTML BEFORE CHUNKING (AI EXTRACT MODE) ===', {
    url,
    title,
    model,
    htmlLength: html.length,
    htmlFull: html, // FULL HTML - NO TRUNCATION
    htmlPreview: html.substring(0, 2000) + (html.length > 2000 ? '...' : ''),
    htmlEnd: html.length > 2000 ? html.substring(html.length - 2000) : html,
    timestamp: Date.now()
  });
  
  const chunks = splitHtmlIntoChunks(html, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
  
  const avgChunkSize = chunks.length > 0 ? Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length) : 0;
  const maxChunkSize = chunks.length > 0 ? Math.max(...chunks.map(c => c.length)) : 0;
  const maxChunkUsage = Math.round((maxChunkSize / CONFIG.CHUNK_SIZE) * 100);
  
  log(`📦 HTML split into ${chunks.length} chunks for AI processing`, { 
    totalLength: html.length,
    chunkSizeLimit: CONFIG.CHUNK_SIZE,
    avgChunkSize: avgChunkSize,
    maxChunkSize: maxChunkSize,
    maxChunkUsage: `${maxChunkUsage}%`,
    warning: maxChunkUsage > 90 ? '⚠️ Large chunks' : 'OK'
  });
  

  const uiLangExtracting = await getUILanguage();
  const extractingContentStatus = tSync('statusExtractingContent', uiLangExtracting);
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: extractingContentStatus, progress: 10 });
  
  // Check if processing was cancelled before chunk processing
  await checkCancellation('chunk processing');
  
  let result;
  if (chunks.length === 1) {
    result = await processSingleChunk(chunks[0], url, title, apiKey, model);
  } else {
    result = await processMultipleChunks(chunks, url, title, apiKey, model);
  }
  
  log(`✅ AI Extract mode complete: ${result.content?.length || 0} content items extracted`, { title: result.title });

  if (!result.content || result.content.length === 0) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorExtractModeNoContent', uiLang));
  }

  // CRITICAL: Clean author to remove anonymous/invalid values
  if (result.author) {
    result.author = cleanAuthor(result.author);
  }

  return result;
}

/**
 * Process single chunk for extract mode
 * @param {string} html - HTML chunk
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<Object>} {title, content, publishDate}
 */
async function processSingleChunk(html, url, title, apiKey, model) {
  log('processSingleChunk', { url, htmlLength: html.length });
  
  // Check if processing was cancelled before single chunk processing
  await checkCancellation('single chunk processing');
  
  const userPrompt = `Extract article content with ALL formatting preserved. Copy text EXACTLY.

Base URL: ${url}
Page title: ${title}

HTML:
${html}`;

  await updateProgress(PROCESSING_STAGES.ANALYZING, 'stageAnalyzing', 10);
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  /** @type {import('../types.js').RetryOptions} */
  const retryOptions2 = {
    maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
    delays: CONFIG.RETRY_DELAYS,
    retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
  };
  const result = await callWithRetry(
    () => callAI(EXTRACT_SYSTEM_PROMPT, userPrompt, apiKey, model, true),
    retryOptions2
  );
  
  // When jsonResponse=true, callAI returns parsed JSON object (AIResponse), not string
  /** @type {any} */ const resultAny = result;
  
  log('Single chunk result', { title: resultAny.title, items: resultAny.content?.length });
  
  // Clean title from service data if present
  if (resultAny.title) {
    resultAny.title = cleanTitleFromServiceTokens(resultAny.title, resultAny.title);
  }
  
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, progress: 15 });
  return resultAny;
}

/**
 * Process multiple chunks for extract mode
 * @param {Array<string>} chunks - HTML chunks
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<Object>} {title, content, publishDate}
 */
async function processMultipleChunks(chunks, url, title, apiKey, model) {
  const chunksStartTime = Date.now();
  const totalChunks = chunks.length;
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const avgChunkSize = Math.round(totalSize / totalChunks);
  const maxChunkSize = Math.max(...chunks.map(c => c.length));
  
  log(`🔄 Processing ${totalChunks} chunks with AI`, { 
    url,
    totalSize: `${(totalSize / 1024).toFixed(1)} KB`,
    avgChunkSize: `${(avgChunkSize / 1024).toFixed(1)} KB`,
    maxChunkSize: `${(maxChunkSize / 1024).toFixed(1)} KB`,
    estimatedTime: `${Math.ceil(totalChunks * 3)}s (rough estimate: ~3s per chunk)`
  });
  
  const allContent = [];
  let articleTitle = title;
  let publishDate = '';
  const chunkDurations = [];

  for (let i = 0; i < chunks.length; i++) {
    // Check if processing was cancelled
    await checkCancellation('chunk processing');
    
    const isFirst = i === 0;
    
    log(`📦 Processing chunk ${i + 1}/${chunks.length}`, { chunkLength: chunks[i].length, isFirst });
    
    const progressBase = 5 + Math.floor((i / chunks.length) * 10);
    const chunkStatus = tSync('statusProcessingChunk', await getUILanguageCached())
      .replace('{current}', String(i + 1))
      .replace('{total}', String(chunks.length));
    updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: chunkStatus, progress: progressBase });

    // FULL CHUNK HTML LOGGING
    log(`=== FULL CHUNK ${i + 1}/${chunks.length} HTML FOR AI EXTRACTION ===`, {
      chunkIndex: i,
      totalChunks: chunks.length,
      url,
      title,
      model,
      chunkLength: chunks[i].length,
      chunkFull: chunks[i], // FULL CHUNK HTML - NO TRUNCATION
      chunkPreview: chunks[i].substring(0, 2000) + (chunks[i].length > 2000 ? '...' : ''),
      chunkEnd: chunks[i].length > 2000 ? chunks[i].substring(chunks[i].length - 2000) : chunks[i],
      timestamp: Date.now()
    });
    
    const systemPrompt = buildChunkSystemPrompt(i, chunks.length);
    const userPrompt = buildChunkUserPrompt(chunks[i], url, title, i, chunks.length);
    const chunkStartTime = Date.now();
    const promptSize = systemPrompt.length + userPrompt.length;

    // FULL PROMPT LOGGING FOR EACH CHUNK
    log(`=== FULL PROMPT FOR CHUNK ${i + 1}/${chunks.length} AI EXTRACTION ===`, {
      chunkIndex: i,
      totalChunks: chunks.length,
      url,
      title,
      model,
      systemPromptLength: systemPrompt.length,
      systemPromptFull: systemPrompt, // FULL SYSTEM PROMPT
      userPromptLength: userPrompt.length,
      userPromptFull: userPrompt, // FULL USER PROMPT - INCLUDES FULL HTML CHUNK
      userPromptPreview: userPrompt.substring(0, 2000) + (userPrompt.length > 2000 ? '...' : ''),
      userPromptEnd: userPrompt.length > 2000 ? userPrompt.substring(userPrompt.length - 2000) : userPrompt,
      timestamp: Date.now()
    });

    log(`📦 Processing chunk ${i + 1}/${chunks.length}`, {
      chunkSize: `${(chunks[i].length / 1024).toFixed(1)} KB`,
      promptSize: `${(promptSize / 1024).toFixed(1)} KB`,
      isFirst: isFirst
    });

    try {
      // Wrap callAI with retry mechanism for reliability (429/5xx errors)
      /** @type {import('../types.js').RetryOptions} */
      const retryOptions4 = {
        maxRetries: 3,
        delays: [1000, 2000, 4000],
        retryableStatusCodes: [429, 500, 502, 503, 504]
      };
      const result = await callWithRetry(
        () => callAI(systemPrompt, userPrompt, apiKey, model, true),
        retryOptions4
      );
      
      // When jsonResponse=true, callAI returns parsed JSON object (AIResponse), not string
      /** @type {any} */ const resultAny = result;
      
      const chunkDuration = Date.now() - chunkStartTime;
      chunkDurations.push(chunkDuration);
      const avgDuration = chunkDurations.reduce((a, b) => a + b, 0) / chunkDurations.length;
      const remainingChunks = chunks.length - (i + 1);
      const estimatedRemaining = Math.round(remainingChunks * avgDuration / 1000);
      
      log(`✅ Chunk ${i + 1}/${chunks.length} processed`, {
        duration: `${chunkDuration}ms`,
        contentItems: resultAny.content?.length || 0,
        title: resultAny.title,
        avgDuration: `${Math.round(avgDuration)}ms`,
        estimatedRemaining: `${estimatedRemaining}s`
      });
      
      if (isFirst) {
        if (resultAny.title) {
          // Clean title from service data using shared utility
          articleTitle = cleanTitleFromServiceTokens(resultAny.title, resultAny.title);
        }
        if (resultAny.publishDate) publishDate = resultAny.publishDate;
      }
      
      if (resultAny.content && Array.isArray(resultAny.content)) {
        allContent.push(...resultAny.content);
      }
    } catch (error) {
      logError(`Failed to process chunk ${i + 1}`, error);
      throw error;
    }
  }

  const totalDuration = Date.now() - chunksStartTime;
  const avgChunkDuration = chunkDurations.length > 0 
    ? Math.round(chunkDurations.reduce((a, b) => a + b, 0) / chunkDurations.length)
    : 0;
  const minChunkDuration = chunkDurations.length > 0 ? Math.min(...chunkDurations) : 0;
  const maxChunkDuration = chunkDurations.length > 0 ? Math.max(...chunkDurations) : 0;
  
  log(`✅ All ${chunks.length} chunks processed`, {
    totalDuration: `${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`,
    contentItems: allContent.length,
    avgChunkDuration: `${avgChunkDuration}ms`,
    minChunkDuration: `${minChunkDuration}ms`,
    maxChunkDuration: `${maxChunkDuration}ms`,
    throughput: `${(chunks.length / (totalDuration / 1000)).toFixed(2)} chunks/sec`,
    url
  });
  
  const dedupStartTime = Date.now();
  // FULL ALL CONTENT BEFORE DEDUPLICATION
  log('=== FULL ALL CONTENT BEFORE DEDUPLICATION (MULTIPLE CHUNKS) ===', {
    url,
    title,
    model,
    totalChunks: chunks.length,
    allContentItemsCount: allContent.length,
    allContentFull: JSON.stringify(allContent, null, 2), // FULL CONTENT - NO TRUNCATION
    allContentPreview: allContent.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: item.text ? item.text.replace(/<[^>]+>/g, '').trim().substring(0, 300) : null,
      textLength: item.text ? item.text.replace(/<[^>]+>/g, '').trim().length : 0
    })),
    allContentEnd: allContent.slice(-10).map((item, idx) => ({
      index: allContent.length - 10 + idx,
      type: item.type,
      text: item.text ? item.text.replace(/<[^>]+>/g, '').trim().substring(0, 300) : null,
      textLength: item.text ? item.text.replace(/<[^>]+>/g, '').trim().length : 0
    })),
    timestamp: Date.now()
  });
  
  const deduplicated = deduplicateContent(allContent);
  
  // FULL DEDUPLICATED CONTENT
  log('=== FULL DEDUPLICATED CONTENT (MULTIPLE CHUNKS) ===', {
    url,
    title,
    model,
    totalChunks: chunks.length,
    deduplicatedItemsCount: deduplicated.length,
    removedItems: allContent.length - deduplicated.length,
    deduplicatedContentFull: JSON.stringify(deduplicated, null, 2), // FULL CONTENT - NO TRUNCATION
    deduplicatedContentPreview: deduplicated.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: item.text ? item.text.replace(/<[^>]+>/g, '').trim().substring(0, 300) : null,
      textLength: item.text ? item.text.replace(/<[^>]+>/g, '').trim().length : 0
    })),
    deduplicatedContentEnd: deduplicated.slice(-10).map((item, idx) => ({
      index: deduplicated.length - 10 + idx,
      type: item.type,
      text: item.text ? item.text.replace(/<[^>]+>/g, '').trim().substring(0, 300) : null,
      textLength: item.text ? item.text.replace(/<[^>]+>/g, '').trim().length : 0
    })),
    timestamp: Date.now()
  });
  const dedupDuration = Date.now() - dedupStartTime;
  const duplicatesRemoved = allContent.length - deduplicated.length;
  
  log(`✅ Deduplication complete`, {
    uniqueItems: deduplicated.length,
    duplicatesRemoved: duplicatesRemoved,
    dedupDuration: `${dedupDuration}ms`,
    duplicateRate: `${Math.round((duplicatesRemoved / allContent.length) * 100)}%`
  });

  return {
    title: articleTitle,
    content: deduplicated,
    publishDate: publishDate
  };
}

/**
 * Extract content using selectors (executes script in page context)
 * @param {number} tabId - Tab ID
 * @param {{title?: string, content?: string, author?: string, date?: string, [key: string]: string|undefined}} selectors - Selectors object from AI
 * @param {string} baseUrl - Base URL for resolving relative links
 * @param {(selectors: Record<string, string|undefined>, baseUrl: string) => any} extractFromPageInlined - Inline extraction function (must be passed from background.js)
 * @returns {Promise<import('../types.js').InjectionResult>} Extracted content result
 */
export async function extractContentWithSelectors(tabId, selectors, baseUrl, extractFromPageInlined) {
  log('extractContentWithSelectors', { tabId, selectors, baseUrl });
  
  const uiLang = await getUILanguage();
  if (!tabId) {
    throw new Error(tSync('errorTabIdRequired', uiLang));
  }
  
  // CRITICAL: tabId is the ID of the tab where the button was clicked
  // Even if user switched to another tab, this tabId still points to the original tab
  // The script will execute on that tab, extracting content from the page that was active
  // when the button was clicked. This ensures we process the correct page.
  
  // Verify that the tab still has the expected URL (user might have navigated away)
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== baseUrl) {
      log('Tab URL mismatch detected', { 
        expectedUrl: baseUrl, 
        actualUrl: tab.url,
        message: 'Tab URL differs from expected URL - page may have navigated. Continuing anyway, but content may be from wrong page.'
      });
      // Note: We continue anyway because the user might have intentionally navigated,
      // but we log the mismatch for debugging
    }
  } catch (tabError) {
    log('Failed to verify tab URL', { error: tabError?.message, tabId });
    // Continue anyway - tab might be closed, but we'll try to execute script
  }
  
  // SECURITY: Validate baseUrl before passing to executeScript
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error(tSync('errorInvalidBaseUrl', uiLang));
  }
  
  // SECURITY: Validate selectors structure
  if (!selectors || typeof selectors !== 'object') {
    throw new Error(tSync('errorInvalidSelectors', uiLang));
  }
  
  // Validate selectors.exclude is an array if present
  if (selectors.exclude && !Array.isArray(selectors.exclude)) {
    throw new Error(tSync('errorInvalidSelectorsExclude', uiLang));
  }
  
  let results;
  try {
    // Execute extraction function directly in the page context
    // Using world: 'MAIN' to access page's DOM properly
    // SECURITY: baseUrl and selectors are validated above
    results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractFromPageInlined,
      args: [selectors, baseUrl]
    });
    log('Script executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('Script execution failed', scriptError);
    
    // Check if error is due to tab being closed
    if (chrome.runtime.lastError) {
      const lastError = chrome.runtime.lastError.message || String(chrome.runtime.lastError);
      if (lastError.includes('No tab with id') || lastError.includes('tab was closed') || lastError.includes('Invalid tab ID')) {
        const uiLang = await getUILanguage();
        throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
      }
    }
    
    // Check if tab is still available
    try {
      await chrome.tabs.get(tabId);
    } catch (tabError) {
      const uiLang = await getUILanguage();
      throw new Error(tSync('errorTabClosedDuringProcessing', uiLang));
    }
    
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorScriptExecutionFailed', uiLang).replace('{error}', scriptError.message || 'unknown'));
  }

  if (!results || !results[0]) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorScriptEmptyResults', uiLang));
  }
  
  /** @type {import('../types.js').InjectionResult} */
  const injectionResult = results[0].result;
  
  // Log extraction debug info if available
  // Note: background.js returns debugInfo as 'debug' property
  const debugInfo = injectionResult?.debug || injectionResult?.debugInfo;
  if (debugInfo) {
    // Log detailed logs if available
    if (debugInfo.detailedLogs && debugInfo.detailedLogs.length > 0) {
      log('=== DETAILED EXTRACTION LOGS ===', {
        totalLogs: debugInfo.detailedLogs.length,
        logsByType: debugInfo.detailedLogs.reduce((acc, log) => {
          acc[log.type] = (acc[log.type] || 0) + 1;
          return acc;
        }, {}),
        allLogs: debugInfo.detailedLogs
      });
    }
    
    if (debugInfo.extractionDebug) {
      log('=== EXTRACTION DEBUG INFO ===', {
        containerSelector: debugInfo.extractionDebug.containerSelector,
        contentSelector: debugInfo.extractionDebug.contentSelector,
        containersFound: debugInfo.extractionDebug.containersFound,
        containerFound: debugInfo.extractionDebug.containerFound,
        contentElementsFound: debugInfo.extractionDebug.contentElementsFound,
        strategiesUsed: debugInfo.extractionDebug.strategiesUsed,
        elementsProcessed: debugInfo.elementsProcessed,
        elementsExcluded: debugInfo.elementsExcluded,
        headingCount: debugInfo.headingCount
      });
    } else {
      logWarn('extractionDebug not available in debugInfo', {
        hasDebugInfo: !!debugInfo,
        debugInfoKeys: debugInfo ? Object.keys(debugInfo) : [],
        hasExtractionDebug: !!(debugInfo && debugInfo.extractionDebug)
      });
    }
  } else {
    logWarn('debugInfo not available in injectionResult', {
      hasInjectionResult: !!injectionResult,
      injectionResultKeys: injectionResult ? Object.keys(injectionResult) : [],
      hasDebug: !!(injectionResult && injectionResult.debug),
      hasDebugInfo: !!(injectionResult && injectionResult.debugInfo)
    });
  }
  
  if (injectionResult && 'error' in injectionResult && injectionResult.error) {
    const error = injectionResult.error;
    logError('Script execution error', error);
    let errorMsg = '';
    if (typeof error === 'string') {
      errorMsg = error;
    } else if (error && typeof error === 'object') {
      const errorObj = /** @type {Record<string, any>} */ (error);
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        errorMsg = errorObj.message;
      } else {
        errorMsg = String(error);
      }
    } else {
      errorMsg = String(error);
    }
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorScriptError', uiLang).replace('{error}', errorMsg));
  }
  
  if (!injectionResult) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorScriptNoResult', uiLang));
  }

  // Log detailed extraction result with full content preview
  const extractionDetails = {
    title: injectionResult.title,
    author: injectionResult.author || 'N/A',
    publishDate: injectionResult.publishDate || 'N/A',
    contentItems: injectionResult.content?.length || 0,
    contentTypes: injectionResult.content ? [...new Set(injectionResult.content.map(item => item?.type).filter(Boolean))] : [],
    contentByType: injectionResult.content ? injectionResult.content.reduce((acc, item) => {
      const type = item?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}) : {},
    contentPreview: injectionResult.content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      level: item.level || null,
      textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
      textPreview: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 200),
      hasHtml: !!(item.html && item.html !== item.text),
      htmlLength: item.html ? item.html.length : 0
    })) || [],
    totalTextLength: injectionResult.content ? injectionResult.content.reduce((sum, item) => {
      const text = (item.text || '').replace(/<[^>]+>/g, '').trim();
      return sum + text.length;
    }, 0) : 0,
    imageCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'image').length : 0,
    headingCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'heading').length : 0,
    paragraphCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'paragraph').length : 0,
    listCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'list').length : 0,
    quoteCount: injectionResult.content ? injectionResult.content.filter(item => item.type === 'quote').length : 0
  };
  
  log('=== EXTRACTION RESULT (SELECTOR MODE) ===', extractionDetails);
  
  // Log full content structure for debugging
  if (injectionResult.content && injectionResult.content.length > 0) {
    log('=== EXTRACTED CONTENT FULL STRUCTURE ===', {
      totalItems: injectionResult.content.length,
      items: injectionResult.content.map((item, idx) => ({
        index: idx,
        type: item.type,
        level: item.level || null,
        textLength: (item.text || '').replace(/<[^>]+>/g, '').trim().length,
        textFull: (item.text || '').replace(/<[^>]+>/g, '').trim(),
        htmlLength: item.html ? item.html.length : 0,
        hasImage: item.type === 'image' ? {
          url: item.url || item.src || 'N/A',
          alt: item.alt || 'N/A'
        } : null,
        listItems: item.type === 'list' && item.items ? {
          count: item.items.length,
          ordered: item.ordered || false,
          itemsPreview: item.items.slice(0, 3).map((li, liIdx) => {
            let text = '';
            if (typeof li === 'string') {
              text = li.substring(0, 100);
            } else if (typeof li === 'object' && li !== null && 'html' in li) {
              // Type guard: li is object with html property
              const liWithHtml = /** @type {{html?: string}} */ (li);
              text = (liWithHtml.html || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
            }
            return { index: liIdx, text };
          })
        } : null
      }))
    });
  }
  
  // Log subtitle debug info if available
  if (injectionResult && injectionResult.debug && injectionResult.debug.subtitleDebug) {
    const subDebug = injectionResult.debug.subtitleDebug;
    log('=== SUBTITLE EXTRACTION DEBUG ===', {
      subtitleFound: subDebug.subtitleFound,
      subtitleText: subDebug.subtitleText,
      firstHeadingFound: subDebug.firstHeadingFound,
      firstHeadingIndex: subDebug.firstHeadingIndex,
      firstHeadingText: subDebug.firstHeadingText,
      titleInContent: subDebug.titleInContent,
      titleAdded: subDebug.titleAdded,
      subtitleInserted: subDebug.subtitleInserted,
      subtitleInsertIndex: subDebug.subtitleInsertIndex,
      elementsProcessedBeforeFirstHeading: subDebug.elementsProcessedBeforeFirstHeading,
      totalContentItemsBeforeInsert: subDebug.totalContentItemsBeforeInsert,
      articleTitle: injectionResult.title
    });
    
    // Log content before insert with full details
    if (subDebug.contentBeforeInsert && subDebug.contentBeforeInsert.length > 0) {
      log('Content BEFORE subtitle insert (first 5 items):');
      subDebug.contentBeforeInsert.forEach((item, idx) => {
        log(`  [${item.index}] ${item.type}: "${item.text}"`);
      });
    } else {
      log('Content BEFORE subtitle insert: EMPTY or not logged');
    }
    
    // Log content after insert with full details
    if (subDebug.contentAfterInsert && subDebug.contentAfterInsert.length > 0) {
      log('Content AFTER subtitle insert (first 5 items):');
      subDebug.contentAfterInsert.forEach((item, idx) => {
        log(`  [${item.index}] ${item.type}: "${item.text}"`);
      });
    } else {
      log('Content AFTER subtitle insert: EMPTY or not logged');
    }
    
    // Log actual final content structure with FULL text (not truncated)
    const firstItems = injectionResult.content?.slice(0, 10).map((item, idx) => ({
      index: idx,
      type: item.type,
      level: ('level' in item ? item.level : null) || null,
      text: (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim(),
      textLength: (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim().length
    }));
    log('Final content structure (first 10 items with FULL text):');
    firstItems?.forEach((item) => {
      const levelStr = item.level ? ` (level ${item.level})` : '';
      log(`  [${item.index}] ${item.type}${levelStr}: "${item.text.substring(0, 150)}${item.text.length > 150 ? '...' : ''}" (${item.textLength} chars)`);
    });
    
    // Check if subtitle is actually in the right position
    const subtitleIndex = injectionResult.content?.findIndex(item => item.type === 'subtitle');
    const titleIndex = injectionResult.content?.findIndex(item => 
      item.type === 'heading' && 
      (('text' in item ? item.text : '') || '').replace(/<[^>]+>/g, '').trim() === injectionResult.title
    );
    log('Position check:', {
      subtitleIndex: subtitleIndex !== undefined ? subtitleIndex : 'NOT FOUND',
      titleIndex: titleIndex !== undefined ? titleIndex : 'NOT FOUND',
      expectedSubtitleIndex: titleIndex !== undefined ? titleIndex + 1 : 'N/A',
      isSubtitleRightAfterTitle: subtitleIndex === titleIndex + 1
    });
  } else {
    log('No subtitle debug info available');
  }
  
  return injectionResult;
}

/**
 * Process content with selector mode (AI Selector)
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {(selectors: Object, baseUrl: string) => any} extractFromPageInlined - Inline extraction function (must be passed from background.js)
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processWithSelectorMode(data, extractFromPageInlined) {
  const { html, url, title, apiKey, model, tabId } = data;
  
  log('🎯 AI Selector mode: Starting content extraction');
  log('Input data', { url, title, htmlLength: html?.length, tabId });
  
  const uiLang = await getUILanguage();
  if (!html) throw new Error(tSync('errorNoHtmlContent', uiLang));
  if (!apiKey) throw new Error(tSync('errorTtsNoApiKey', uiLang));
  if (!tabId) throw new Error(tSync('errorNoTabId', uiLang));
  
  // Check cache first (if enabled)
  let selectors;
  let fromCache = false;
  // Explicit check: use cache if explicitly true, or if undefined/null (default: true)
  // Only skip cache if explicitly false
  const useCache = data.useCache !== false; // true if undefined/null/true, false only if explicitly false
  
  if (useCache) {
    /** @type {import('../types.js').ExtendedCacheEntry|null} */
    const cached = await getCachedSelectors(url);
    if (cached) {
      selectors = cached.selectors;
      fromCache = true;
      await updateProgress(PROCESSING_STAGES.ANALYZING, 'statusUsingCachedSelectors', 3);
      log(`💾 Using cached selectors (${cached.successCount || 0} previous successes)`, { url });
    }
  }
  
  if (!fromCache) {
    // Check if processing was cancelled before AI analysis
    await checkCancellation('AI selector analysis');
    
    await updateProgress(PROCESSING_STAGES.ANALYZING, 'stageAnalyzing', 3);
    
    // Trim HTML for analysis
    // DeepSeek and Qwen have smaller context windows, use 200k instead of 450k
    const provider = getProviderFromModel(model);
    const isQwen = provider === 'openrouter' && model && model.toLowerCase().includes('qwen');
    const maxHtmlLength = (provider === 'deepseek' || isQwen) ? 200000 : CONFIG.MAX_HTML_FOR_ANALYSIS;
    
    log('Trimming HTML for analysis...', { provider, maxHtmlLength });
    const htmlForAnalysis = trimHtmlForAnalysis(html, maxHtmlLength);
    const htmlUsagePercent = Math.round((html.length / maxHtmlLength) * 100);
    log('Trimmed HTML', { 
      originalLength: html.length, 
      trimmedLength: htmlForAnalysis.length,
      limit: maxHtmlLength,
      provider,
      usage: `${htmlUsagePercent}%`,
      warning: htmlUsagePercent > 80 ? '⚠️ Close to limit' : 'OK'
    });
    
    // Get selectors from AI
    log('🤖 Requesting selectors from AI...');
    try {
      selectors = await getSelectorsFromAI(htmlForAnalysis, url, title, apiKey, model);
      log('✅ Selectors received from AI', selectors);
    } catch (error) {
      logError('Failed to get selectors from AI', error);
      const uiLang = await getUILanguage();
      throw new Error(tSync('errorSelectorAnalysisFailed', uiLang).replace('{error}', error.message || 'unknown'));
    }
    
    if (!selectors) {
      const uiLang = await getUILanguage();
      throw new Error(tSync('errorAiEmptySelectors', uiLang));
    }
  }
  
  // Check if processing was cancelled before content extraction
  await checkCancellation('content extraction');
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusExtractingFromPage', 5);
  
  // Extract content using selectors
  log('🔍 Extracting content using selectors...', { tabId });
  
  
  let extractedContent;
  try {
    extractedContent = await extractContentWithSelectors(tabId, selectors, url, extractFromPageInlined);
    
    log(`✅ Content extracted: ${extractedContent?.content?.length || 0} items`, { 
      title: extractedContent?.title
    });
  } catch (error) {
    // Invalidate cache if extraction failed with cached selectors
    if (fromCache) {
      logWarn('⚠️ FALLBACK: Extraction failed with cached selectors - invalidating cache and will retry', {
        reason: 'Cached selectors failed to extract content',
        method: 'cache invalidation + retry',
        impact: 'Will request new selectors from AI on next attempt',
        url
      });
      await invalidateCache(url);
    }
    logError('Failed to extract content with selectors', error);
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorContentExtractionFailed', uiLang).replace('{error}', error.message || 'unknown'));
  }
  
  if (!extractedContent || !extractedContent.content) {
    if (fromCache) await invalidateCache(url);
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorNoContentExtracted', uiLang));
  }
  
  if (extractedContent.content.length === 0) {
    if (fromCache) await invalidateCache(url);
    const selectorsStr = JSON.stringify(selectors);
    const truncated = selectorsStr.length > 200 ? selectorsStr.substring(0, 200) + '...' : selectorsStr;
    logError('Extracted content is empty', { selectors: truncated });
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorContentEmpty', uiLang));
  }
  
  // Cache selectors after successful extraction ONLY
  // If extraction failed, cache is already invalidated above
  try {
    if (!fromCache) {
      await cacheSelectors(url, selectors);
    } else {
      await markCacheSuccess(url);
    }
  } catch (error) {
    logError('Failed to update cache (non-critical)', error);
    // Don't throw - cache update failure shouldn't break extraction
  }
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusProcessingComplete', 8);
  
  const publishDate = selectors.publishDate || extractedContent.publishDate || '';
  const finalTitle = extractedContent.title || title;
  const rawAuthor = extractedContent.author || selectors.author || '';
  
  // CRITICAL: Clean author to remove anonymous/invalid values
  const finalAuthor = cleanAuthor(rawAuthor);
  
  // NOTE: Title and author separation is now handled by AI in prompts
  // AI is instructed to return clean title (without author) in "title" field
  // and author name (without prefixes) in "author" field
  // If AI returns title with author included, it's a prompt issue - improve prompts, don't add code-side fixes
  // This approach is site-agnostic and works for all languages (not just "from/by" patterns)
  
  // Extract detected language from selectors (if AI provided it)
  const detectedLanguage = selectors.detectedLanguage || null;
  
  if (detectedLanguage) {
    log('🌍 LANGUAGE DETECTION: AI selector returned language', { 
      detectedLanguage,
      source: 'AI selector mode',
      method: 'AI analysis during selector extraction'
    });
  } else {
    log('⚠️ LANGUAGE DETECTION: No language detected by AI selector (will be detected later)', {
      source: 'AI selector mode',
      nextStep: 'Language will be detected in detectEffectiveLanguage step'
    });
  }
  
  log(`✅ AI Selector mode complete: ${extractedContent.content.length} content items extracted`, { 
    title: finalTitle, 
    author: finalAuthor,
    detectedLanguage: detectedLanguage || 'not detected'
  });
  
  return {
    title: finalTitle,
    author: finalAuthor,
    content: extractedContent.content,
    publishDate: publishDate,
    detectedLanguage: detectedLanguage || undefined
  };
}

