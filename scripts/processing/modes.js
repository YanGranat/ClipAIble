// Processing modes module for ClipAIble extension
// Handles different content extraction modes: automatic, selector, extract

// @ts-check

// @typedef {import('../types.js').InjectionResult} InjectionResult
// @typedef {import('../types.js').RetryOptions} RetryOptions

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { callAI } from '../api/index.js';
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
  log('getSelectorsFromAI called', { url, model, htmlLength: html.length });
  
  // SECURITY: Validate HTML size before processing
  const MAX_HTML_SIZE = 50 * 1024 * 1024; // 50MB
  if (html && html.length > MAX_HTML_SIZE) {
    logError('HTML too large for selector extraction', { size: html.length, maxSize: MAX_HTML_SIZE });
    throw new Error('HTML content is too large to process');
  }
  
  const systemPrompt = SELECTOR_SYSTEM_PROMPT;
  const userPrompt = buildSelectorUserPrompt(html, url, title);
  
  log('Sending request to AI...', { model, promptLength: userPrompt.length });
  
  // Wrap callAI with retry mechanism for reliability (429/5xx errors)
  /** @type {RetryOptions} */
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
 * @param {Object} data - Processing data
 * @param {string} data.html - HTML content
 * @param {string} data.url - Page URL
 * @param {string} data.title - Page title
 * @param {number} data.tabId - Tab ID
 * @returns {Promise<Object>} {title, author, content, publishDate, detectedLanguage}
 */
export async function processWithoutAI(data) {
  log('=== processWithoutAI: ENTRY ===', {
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    timestamp: Date.now()
  });
  
  const { html, url, title, tabId } = data;

  log('=== AUTOMATIC MODE START (NO AI) ===');
  log('Input data', { url, title, htmlLength: html?.length, tabId: tabId });

  if (!html) throw new Error('No HTML content provided');
  if (!tabId) throw new Error('Tab ID is required for automatic extraction');

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
      timeoutId = setTimeout(() => {
        logError('=== processWithoutAI: TIMEOUT TRIGGERED ===', {
          timeout: CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT,
          timestamp: Date.now()
        });
        reject(new Error(`Automatic extraction timeout after ${CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT / 1000} seconds`));
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
      }
    } catch (error) {
      // Clear timeout on error too
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
    
    log('=== processWithoutAI: Promise.race completed ===', {
      hasResults: !!results,
      resultsLength: results?.length,
      timestamp: Date.now()
    });
    
    log('Automatic extraction executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('=== processWithoutAI: Script execution FAILED ===', {
      error: scriptError?.message || String(scriptError),
      errorStack: scriptError?.stack,
      errorName: scriptError?.name,
      timestamp: Date.now()
    });
    logError('Automatic extraction script execution failed', scriptError);
    throw new Error(`Failed to execute automatic extraction: ${scriptError.message}`);
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
    throw new Error('Automatic extraction returned empty results');
  }

  if (results[0].error) {
    const error = results[0].error;
    logError('=== processWithoutAI: Result contains error ===', {
      error: error,
      timestamp: Date.now()
    });
    logError('Automatic extraction error', error);
    throw new Error(`Automatic extraction error: ${error && typeof error === 'object' && 'message' in error ? error.message : String(error)}`);
  }

  /** @type {InjectionResult} */
  const automaticResult = results[0].result;
  
  if (!automaticResult) {
    logError('=== processWithoutAI: No result in results[0] ===', {
      results0Keys: Object.keys(results[0]),
      timestamp: Date.now()
    });
    throw new Error('Automatic extraction returned no result');
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
              // @ts-ignore - li is object with html property
              text = (li.html || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
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
      detectedLanguage = detectLanguageByCharacters(text);
      log('Language detected automatically', { language: detectedLanguage });
    }
  } catch (error) {
    logWarn('Language detection failed, using default', error);
  }

  updateState({ progress: 15 });

  return {
    title: result.title || title || 'Untitled',
    author: result.author || '',
    content: result.content,
    publishDate: result.publishDate || '',
    detectedLanguage: detectedLanguage
  };
}

/**
 * Process content with extract mode (AI Extract)
 * @param {Object} data - Processing data
 * @param {string} data.html - HTML content
 * @param {string} data.url - Page URL
 * @param {string} data.title - Page title
 * @param {string} data.apiKey - API key
 * @param {string} data.model - Model name
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processWithExtractMode(data) {
  const { html, url, title, apiKey, model } = data;

  log('=== EXTRACT MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, model });

  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');

  // Check if processing was cancelled before extract mode processing
  await checkCancellation('extract mode processing');

  await updateProgress(PROCESSING_STAGES.ANALYZING, 'statusAnalyzingPage', 5);

  const chunks = splitHtmlIntoChunks(html, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
  
  log('HTML split into chunks', { 
    totalLength: html.length, 
    chunkCount: chunks.length,
    chunkSizes: chunks.map(c => c.length)
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
  
  log('=== EXTRACT MODE END ===', { title: result.title, items: result.content?.length });

  if (!result.content || result.content.length === 0) {
    throw new Error('AI Extract mode returned no content. The page may use dynamic loading. Try scrolling to load all content before saving.');
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
  /** @type {RetryOptions} */
  const retryOptions2 = {
    maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
    delays: CONFIG.RETRY_DELAYS,
    retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
  };
  const result = await callWithRetry(
    () => callAI(EXTRACT_SYSTEM_PROMPT, userPrompt, apiKey, model, true),
    retryOptions2
  );
  
  log('Single chunk result', { title: result.title, items: result.content?.length });
  
  // Clean title from service data if present
  if (result.title) {
    result.title = cleanTitleFromServiceTokens(result.title, result.title);
  }
  
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, progress: 15 });
  return result;
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
  log('processMultipleChunks', { chunkCount: chunks.length, url });
  
  const allContent = [];
  let articleTitle = title;
  let publishDate = '';

  for (let i = 0; i < chunks.length; i++) {
    // Check if processing was cancelled
    await checkCancellation('chunk processing');
    
    const isFirst = i === 0;
    
    log(`Processing chunk ${i + 1}/${chunks.length}`, { chunkLength: chunks[i].length, isFirst });
    
    const progressBase = 5 + Math.floor((i / chunks.length) * 10);
    const chunkStatus = tSync('statusProcessingChunk', await getUILanguageCached())
      .replace('{current}', String(i + 1))
      .replace('{total}', String(chunks.length));
    updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: chunkStatus, progress: progressBase });

    const systemPrompt = buildChunkSystemPrompt(i, chunks.length);
    const userPrompt = buildChunkUserPrompt(chunks[i], url, title, i, chunks.length);

    try {
      // Wrap callAI with retry mechanism for reliability (429/5xx errors)
      /** @type {RetryOptions} */
      const retryOptions4 = {
        maxRetries: 3,
        delays: [1000, 2000, 4000],
        retryableStatusCodes: [429, 500, 502, 503, 504]
      };
      const result = await callWithRetry(
        () => callAI(systemPrompt, userPrompt, apiKey, model, true),
        retryOptions4
      );
      
      log(`Chunk ${i + 1} result`, { title: result.title, contentItems: result.content?.length });
      
      if (isFirst) {
        if (result.title) {
          // Clean title from service data using shared utility
          articleTitle = cleanTitleFromServiceTokens(result.title, result.title);
        }
        if (result.publishDate) publishDate = result.publishDate;
      }
      
      if (result.content && Array.isArray(result.content)) {
        allContent.push(...result.content);
      }
    } catch (error) {
      logError(`Failed to process chunk ${i + 1}`, error);
      throw error;
    }
  }

  log('All chunks processed', { totalItems: allContent.length });
  
  const deduplicated = deduplicateContent(allContent);
  log('After deduplication', { items: deduplicated.length });

  return {
    title: articleTitle,
    content: deduplicated,
    publishDate: publishDate
  };
}

/**
 * Extract content using selectors (executes script in page context)
 * @param {number} tabId - Tab ID
 * @param {Object} selectors - Selectors object from AI
 * @param {string} baseUrl - Base URL for resolving relative links
 * @param {Function} extractFromPageInlined - Inline extraction function (must be passed from background.js)
 * @returns {Promise<InjectionResult>} Extracted content result
 */
export async function extractContentWithSelectors(tabId, selectors, baseUrl, extractFromPageInlined) {
  log('extractContentWithSelectors', { tabId, selectors, baseUrl });
  
  if (!tabId) {
    throw new Error('Tab ID is required for content extraction');
  }
  
  // SECURITY: Validate baseUrl before passing to executeScript
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Invalid baseUrl: must be a non-empty string');
  }
  
  // SECURITY: Validate selectors structure
  if (!selectors || typeof selectors !== 'object') {
    throw new Error('Invalid selectors: must be an object');
  }
  
  // Validate selectors.exclude is an array if present
  if (selectors.exclude && !Array.isArray(selectors.exclude)) {
    throw new Error('Invalid selectors.exclude: must be an array');
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
    throw new Error(`Failed to execute script on page: ${scriptError.message}`);
  }

  if (!results || !results[0]) {
    throw new Error('Script execution returned empty results');
  }
  
  /** @type {InjectionResult} */
  const injectionResult = results[0].result;
  
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
    throw new Error(`Script error: ${errorMsg}`);
  }
  
  if (!injectionResult) {
    throw new Error('Script returned no result');
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
              // @ts-ignore - li is object with html property
              text = (li.html || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
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
 * @param {Object} data - Processing data
 * @param {string} data.html - HTML content
 * @param {string} data.url - Page URL
 * @param {string} data.title - Page title
 * @param {string} data.apiKey - API key
 * @param {string} data.model - Model name
 * @param {number} data.tabId - Tab ID
 * @param {boolean} [data.useCache] - Whether to use selector cache
 * @param {Function} extractFromPageInlined - Inline extraction function (must be passed from background.js)
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processWithSelectorMode(data, extractFromPageInlined) {
  const { html, url, title, apiKey, model, tabId } = data;
  
  log('=== SELECTOR MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, tabId });
  
  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');
  if (!tabId) throw new Error('No tab ID provided');
  
  // Check cache first (if enabled)
  let selectors;
  let fromCache = false;
  // Explicit check: use cache if explicitly true, or if undefined/null (default: true)
  // Only skip cache if explicitly false
  const useCache = data.useCache !== false; // true if undefined/null/true, false only if explicitly false
  
  if (useCache) {
    /** @type {import('../cache/selectors.js').ExtendedCacheEntry|null} */
    const cached = await getCachedSelectors(url);
    if (cached) {
      selectors = cached.selectors;
      fromCache = true;
      await updateProgress(PROCESSING_STAGES.ANALYZING, 'statusUsingCachedSelectors', 3);
      log('Using cached selectors', { url, successCount: cached.successCount || 0 });
    }
  }
  
  if (!fromCache) {
    // Check if processing was cancelled before AI analysis
    await checkCancellation('AI selector analysis');
    
    await updateProgress(PROCESSING_STAGES.ANALYZING, 'stageAnalyzing', 3);
    
    // Trim HTML for analysis
    log('Trimming HTML for analysis...');
    const htmlForAnalysis = trimHtmlForAnalysis(html, CONFIG.MAX_HTML_FOR_ANALYSIS);
    log('Trimmed HTML', { originalLength: html.length, trimmedLength: htmlForAnalysis.length });
    
    // Get selectors from AI
    log('Requesting selectors from AI...');
    try {
      selectors = await getSelectorsFromAI(htmlForAnalysis, url, title, apiKey, model);
      log('Received selectors from AI', selectors);
    } catch (error) {
      logError('Failed to get selectors from AI', error);
      throw new Error(`AI selector analysis failed: ${error.message}`);
    }
    
    if (!selectors) {
      throw new Error('AI returned empty selectors');
    }
  }
  
  // Check if processing was cancelled before content extraction
  await checkCancellation('content extraction');
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusExtractingFromPage', 5);
  
  // Extract content using selectors
  log('Extracting content using selectors...', { tabId, selectors });
  let extractedContent;
  try {
    extractedContent = await extractContentWithSelectors(tabId, selectors, url, extractFromPageInlined);
    log('Content extracted', { 
      title: extractedContent?.title,
      contentItems: extractedContent?.content?.length || 0
    });
  } catch (error) {
    // Invalidate cache if extraction failed with cached selectors
    if (fromCache) {
      log('Extraction failed with cached selectors, invalidating cache');
      await invalidateCache(url);
    }
    logError('Failed to extract content with selectors', error);
    throw new Error(`Content extraction failed: ${error.message}`);
  }
  
  if (!extractedContent || !extractedContent.content) {
    if (fromCache) await invalidateCache(url);
    throw new Error('No content extracted from page');
  }
  
  if (extractedContent.content.length === 0) {
    if (fromCache) await invalidateCache(url);
    const selectorsStr = JSON.stringify(selectors);
    const truncated = selectorsStr.length > 200 ? selectorsStr.substring(0, 200) + '...' : selectorsStr;
    logError('Extracted content is empty', { selectors: truncated });
    throw new Error('Extracted content is empty. Try switching to "AI Extract" mode.');
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
  const finalAuthor = extractedContent.author || selectors.author || '';
  
  // NOTE: Title and author separation is now handled by AI in prompts
  // AI is instructed to return clean title (without author) in "title" field
  // and author name (without prefixes) in "author" field
  // If AI returns title with author included, it's a prompt issue - improve prompts, don't add code-side fixes
  // This approach is site-agnostic and works for all languages (not just "от/by" patterns)
  
  log('=== SELECTOR MODE END ===', { title: finalTitle, author: finalAuthor, items: extractedContent.content.length });
  
  return {
    title: finalTitle,
    author: finalAuthor,
    content: extractedContent.content,
    publishDate: publishDate
  };
}

