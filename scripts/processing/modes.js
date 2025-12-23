// Processing modes module for ClipAIble extension
// Handles different content extraction modes: automatic, extract

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
import { splitHtmlIntoChunks, deduplicateContent } from '../extraction/html-utils.js';
import { cleanTitleFromServiceTokens } from '../utils/html.js';
import { detectLanguageByCharacters } from '../translation/index.js';
import { extractAutomaticallyInlined } from '../extraction/automatic.js';
import { getUILanguage, tSync } from '../locales.js';
import { checkCancellation, getUILanguageCached } from '../utils/pipeline-helpers.js';

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
    
    // Add timeout to prevent hanging (30 seconds should be enough for most pages)
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        logError('=== processWithoutAI: TIMEOUT TRIGGERED ===', {
          timeout: 30000,
          timestamp: Date.now()
        });
        reject(new Error('Automatic extraction timeout after 30 seconds'));
      }, 30000);
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

