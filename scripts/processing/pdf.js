// @ts-check
// PDF page processing module for ClipAIble extension
// Handles processing of PDF pages - extracts content using PDF.js

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { checkCancellation, updateProgress, getUILanguageCached, getProcessingCallbacks, getAIRequestOptions } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractPdfContent } from '../extraction/pdf.js';
import { callAIWithImageAndHistory } from '../api/index.js';
import { CONFIG } from '../utils/config.js';
import { renderPrompt } from '../settings/prompt-catalog.js';
import { buildPdfPageUserPrompt } from '../extraction/prompts.js';
import { extractPdfViaOffscreen, getPdfMetadata, renderAllPdfPages, readRenderedPdfPage } from '../api/pdf-offscreen.js';
import { removePdfOperation } from '../api/pdf-operation-storage.js';
import { extractPdfDataFromTab } from '../api/pdf-data-extractor.js';
import { validatePdfData } from '../api/pdf-storage.js';
import { requestPdfFileSelectionViaMessage } from '../api/pdf-selection.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { fetchPdfFile } from '../offscreen/pdf/utils/pdf-fetcher.js';
import { createPdfError, localizePdfError } from '../utils/pdf-errors.js';
import { preservePdfFigures } from './pdf-figures.js';
import { joinPdfMarkdownPages, parsePdfMarkdown } from './pdf-markdown.js';

/**
 * Get PDF data with fallback strategies
 * Tries multiple methods in order: IndexedDB -> Extract from tab -> File picker (for local) or Fetch (for web)
 * @param {string} pdfUrl - PDF file URL
 * @param {number|null} tabId - Tab ID where PDF is open (for local files)
 * @returns {Promise<ArrayBuffer>} PDF file data as ArrayBuffer
 * @throws {Error} If PDF data cannot be obtained
 */
async function getPdfDataWithFallback(pdfUrl, tabId = null, requestOptions = {}) {
  await requestOptions.checkCancelled?.();
  let bytes = null;
  if (pdfUrl.startsWith('file://')) {
    let fileAccessAllowed = false;
    try { fileAccessAllowed = await chrome.extension?.isAllowedFileSchemeAccess?.() === true; }
    catch { /* The file picker remains available when the permission cannot be read. */ }
    await requestOptions.checkCancelled?.();
    if (fileAccessAllowed) {
      try { bytes = await fetchPdfFile(pdfUrl, null, requestOptions); }
      catch (error) {
        await requestOptions.checkCancelled?.();
        if (requestOptions.signal?.aborted) throw requestOptions.signal.reason;
        if (['errorPdfTooLarge', 'errorTimeout', 'statusCancelled'].includes(error.translationKey)) throw error;
        logWarn('Local PDF bytes unavailable; trying file selection', { error: error.message });
      }
    }
    if (!bytes && tabId != null) {
      try { bytes = await extractPdfDataFromTab(pdfUrl, tabId); }
      catch (error) {
        await requestOptions.checkCancelled?.();
        logWarn('PDF tab bytes unavailable; requesting file selection', { error: error.message });
      }
    }
    await requestOptions.checkCancelled?.();
    if (!bytes) bytes = await requestPdfFileSelectionViaMessage(pdfUrl, requestOptions);
    await requestOptions.checkCancelled?.();
    if (!bytes) throw createPdfError('PDF file selection cancelled', 'errorPdfDataUnavailable');
  } else if (/^https?:\/\//i.test(pdfUrl)) {
    bytes = await fetchPdfFile(pdfUrl, null, requestOptions);
  } else {
    throw createPdfError('PDF URL unavailable', 'errorPdfDataUnavailable');
  }
  await requestOptions.checkCancelled?.();
  try { validatePdfData(bytes, 'PDF acquisition'); }
  catch (error) { throw createPdfError(error.message, 'errorPdfInvalid'); }
  return fetchPdfFile(pdfUrl, bytes, requestOptions);
}

/**
 * Clean markdown text by removing metadata prefixes and code blocks
 * @param {string} markdown - Raw markdown text
 * @returns {string} Cleaned markdown text
 */
function cleanMarkdownText(markdown) {
  let cleaned = String(markdown).trim();
  
  // Remove legacy METADATA: prefix if present
  if (cleaned.startsWith('METADATA:')) {
    cleaned = cleaned.replace(/^METADATA:.*?\n\s*\n/s, '').trim();
  }
  
  return cleaned.trim();
}

/**
 * Extract and update document metadata from page metadata
 * Returns updates that should be applied to document metadata
 * @param {{title?: string, author?: string, date?: string}} pageMetadata - Metadata from page
 * @param {number} pageNum - Page number for logging
 * @param {{title?: string, author?: string, date?: string}} currentMetadata - Current document metadata
 * @param {import('../types.js').ProcessingData} data - Processing data (for checking default title)
 * @returns {{title?: string, author?: string, date?: string, foundAny: boolean, allEmpty: boolean}} Updates
 */
function extractMetadataFromPage(pageMetadata, pageNum, currentMetadata, data) {
  if (!pageMetadata) {
    return { foundAny: false, allEmpty: true };
  }
  
  const updates = {};
  let foundAny = false;
  
  // Update document title if found (only if not already set)
  if (pageMetadata.title && pageMetadata.title.trim() && 
      (!currentMetadata.title || currentMetadata.title === 'Untitled PDF' || currentMetadata.title === data.title)) {
    updates.title = pageMetadata.title.trim();
    log(`Extracted title from page ${pageNum}`, { title: updates.title, pageNum });
    foundAny = true;
  }
  
  // Update document author if found (only if not already set)
  if (pageMetadata.author && pageMetadata.author.trim() && 
      (!currentMetadata.author || currentMetadata.author === '')) {
    let cleaned = pageMetadata.author.trim();
    cleaned = cleaned.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, '');
    cleaned = cleaned.replace(/[,\s]+$/, '').trim();
    
    // CRITICAL: Use cleanAuthor to remove anonymous/invalid values
    cleaned = cleanAuthor(cleaned);
    
    if (cleaned) {
      updates.author = cleaned;
      log(`Extracted author from page ${pageNum}`, { 
        original: pageMetadata.author, 
        cleaned: updates.author, 
        pageNum 
      });
      foundAny = true;
    } else {
      log(`Ignored anonymous/invalid author from page ${pageNum}`, { 
        original: pageMetadata.author, 
        pageNum 
      });
    }
  }
  
  // Update document date if found (only if not already set)
  if (pageMetadata.date && pageMetadata.date.trim() && 
      (!currentMetadata.date || currentMetadata.date === '')) {
    let cleanDate = pageMetadata.date.trim();
    // Validate ISO format: YYYY, YYYY-MM, or YYYY-MM-DD
    if (cleanDate.match(/^\d{4}$/)) {
      updates.date = cleanDate;
    } else if (cleanDate.match(/^\d{4}-\d{2}$/)) {
      updates.date = cleanDate;
    } else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      updates.date = cleanDate;
    } else {
      // Try to extract year from invalid format
      const yearMatch = cleanDate.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        updates.date = yearMatch[0];
        logWarn(`Extracted year from invalid date format`, { 
          original: cleanDate, 
          extracted: updates.date 
        });
      } else {
        updates.date = cleanDate; // Use as-is
      }
    }
    log(`Extracted date from page ${pageNum}`, { 
      original: pageMetadata.date, 
      normalized: updates.date, 
      pageNum 
    });
    foundAny = true;
  }
  
  // Track consecutive pages with empty information
  const allEmpty = (!pageMetadata.title || !pageMetadata.title.trim()) &&
                   (!pageMetadata.author || !pageMetadata.author.trim()) &&
                   (!pageMetadata.date || !pageMetadata.date.trim());
  
  return {
    ...updates,
    foundAny,
    allEmpty
  };
}

/**
 * Parse LLM JSON response for PDF page processing
 * Handles various response formats and validates structure
 * @param {*} pageResponse - Raw response from LLM (string or object)
 * @param {number} pageNum - Page number for logging
 * @returns {Object} Parsed page data: { text, mergeWithPrevious, metadata }
 */
function parseLLMResponse(pageResponse, pageNum) {
  let pageData = pageResponse;
  if (typeof pageData === 'string') {
    const json = pageData.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      pageData = JSON.parse(json);
    } catch (cause) {
      throw new Error(`Invalid JSON response for PDF page ${pageNum}`, { cause });
    }
  }
  if (!pageData || Array.isArray(pageData) || typeof pageData !== 'object' || typeof pageData.text !== 'string') {
    throw new Error(`Missing or invalid "text" field for PDF page ${pageNum}`);
  }
  return {
    text: pageData.text,
    mergeWithPrevious: ['direct', 'newline', 'paragraph'].includes(pageData.mergeWithPrevious)
      ? pageData.mergeWithPrevious : 'paragraph',
    metadata: Object.fromEntries(['title', 'author', 'date'].map(key => [
      key, typeof pageData.metadata?.[key] === 'string' ? pageData.metadata[key] : ''
    ]))
  };
}

/**
 * Run the PDF extraction policy shared by document export and independent extraction.
 * @param {import('../types.js').ProcessingData} data
 * @param {string} pdfUrl
 */
export function processPdfDocument(data, pdfUrl) {
  return data.mode === 'selector' || data.mode === 'extract'
    ? processPdfPageWithAI(data, pdfUrl)
    : processPdfPage(data, pdfUrl);
}

/**
 * Process PDF page - extract content using PDF.js
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
async function processPdfPage(data, pdfUrl) {
  const { updateState, updateProgress, checkCancellation } = getProcessingCallbacks(data);
  const { url, tabId } = data;
  
  log('📄 Processing PDF document', { pdfUrl, url, tabId });
  
  // Check if processing was cancelled before PDF processing
  await checkCancellation('PDF processing');
  
  log('📖 Extracting content from PDF');
  // Stage 1: Extract PDF content (5-40%)
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusExtractingPdf', 5);
  
  let result;
  
  // Try to extract PDF content
  try {
    // Progress callback for extraction progress
    const progressCallback = (current, total) => {
      if (total > 1) {
        const extractionProgress = (current / total) * 35; // 35% range (5-40%)
        updateState({ progress: 5 + extractionProgress });
      }
    };
    
    const requestOptions = { ...getAIRequestOptions(data), processingRunId: data.processingRunId };
    const pdfData = await getPdfDataWithFallback(pdfUrl.split('#')[0], tabId, requestOptions);
    const preserveImagePages = !data.extractionOnly && ['pdf', 'epub', 'fb2', 'markdown'].includes(data.outputFormat || 'pdf');
    const originalLanguage = !data.language || data.language === 'auto';
    const preserveOriginalFigures = preserveImagePages && (data.outputFormat || 'pdf') === 'pdf' && originalLanguage;
    const preserveOriginalEquations = preserveImagePages && originalLanguage;
    result = await extractPdfContent(pdfUrl, pdfData, {
      ...requestOptions, preserveImagePages, preserveOriginalFigures, preserveOriginalEquations, onProgress: progressCallback
    });
    await checkCancellation('PDF extraction');
    
    log(`✅ PDF content extracted: ${result.content?.length || 0} content items`, { 
      title: result.title
    });
  } catch (error) {
    logError('Failed to extract PDF content', error);
    throw await localizePdfError(error);
  }
  
  if (!result.content || result.content.length === 0) {
    const uiLang = await getUILanguageCached();
    throw createPdfError(tSync('errorPdfNoContent', uiLang), 'errorPdfNoContent');
  }
  
  updateState({ progress: 40 });
  
  // Return result in standard format for continueProcessingPipeline
  return {
    title: result.title || data.title || 'Untitled PDF',
    author: result.author || '',
    content: result.content,
    publishDate: result.publishDate || ''
  };
}

/**
 * Process PDF page with AI - render pages as images and send to LLM
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
async function processPdfPageWithAI(data, pdfUrl) {
  const { updateState, updateProgress, checkCancellation } = getProcessingCallbacks(data);
  const startTime = Date.now();
  const { url, tabId, apiKey, model } = data;
  const requestOptions = { ...getAIRequestOptions(data), processingRunId: data.processingRunId };
  const captureOptions = { ...requestOptions, processingRunId: data.processingRunId };
  
  log('[ClipAIble PDF Processing] === FUNCTION ENTRY ===', {
    function: 'processPdfPageWithAI',
    input: {
      pdfUrl,
      url,
      tabId,
      model,
      hasApiKey: !!apiKey,
      mode: data.mode,
      outputFormat: data.outputFormat
    },
    timestamp: startTime
  });
  
  log('🤖 Processing PDF with AI (rendering pages as images)', { pdfUrl, url, tabId, model });
  
  // Check if processing was cancelled
  await checkCancellation('PDF AI processing');
  
  if (!apiKey) {
    const uiLang = await getUILanguageCached();
    throw createPdfError(tSync('errorNoApiKey', uiLang), 'errorNoApiKey');
  }
  const pdfStatusLanguage = await getUILanguageCached();
  const updatePdfStatus = (key, params, progress) => updateState({
    progress, status: tSync(key, pdfStatusLanguage, params),
    statusTranslationKey: key, statusTranslationParams: params
  });
  
  // Remove URL fragment (#page=N) before loading PDF - fetch cannot handle fragments
  // Chrome PDF viewer uses #page=N for navigation, but we need clean URL for file loading
  const cleanPdfUrl = pdfUrl.split('#')[0];
  if (cleanPdfUrl !== pdfUrl) {
    log('Removed URL fragment from PDF URL', { original: pdfUrl, cleaned: cleanPdfUrl });
  }
  
  const pdfData = await getPdfDataWithFallback(cleanPdfUrl, tabId, requestOptions);

  // Stage 1: Get PDF metadata (MINIMAL - just get page count, nothing else)
  // CRITICAL: Do this as fast as possible, no unnecessary operations
  let pdfMetadata;
  try {
    pdfMetadata = await getPdfMetadata(cleanPdfUrl, pdfData, captureOptions);
  } catch (error) {
    logError('Failed to get PDF metadata', error);
    throw await localizePdfError(error);
  }
  
  const numPages = pdfMetadata.numPages;
  const metadata = pdfMetadata.metadata || {};
  
  if (numPages === 0) {
    const uiLang = await getUILanguageCached();
    throw createPdfError(tSync('errorPdfNoContent', uiLang), 'errorPdfNoContent');
  }
  
  const systemPrompt = renderPrompt('pdfDocument', requestOptions);
  log(`PDF has ${numPages} pages - starting parallel extraction`);
  
  // Stage 2: Process each page with AI (10-40%)
  // Keep only the immediately preceding text turn and its signed assistant blocks.
  const allMarkdownParts = [];
  const messageHistory = [];
  const processedPages = []; // Track successfully processed pages
  
  log('[ClipAIble PDF Processing] === CHAT HISTORY INITIALIZED ===', {
    numPages,
    messageHistoryInitialLength: messageHistory.length,
    systemPromptLength: systemPrompt.length
  });
  let documentTitle = metadata.title || data.title || 'Untitled PDF';
  let hasDocumentTitle = typeof metadata.title === 'string' && metadata.title.trim().length > 0;
  let documentAuthor = metadata.author || '';
  let documentPublishDate = metadata.publishDate || '';
  
  // Track if we still need to search for metadata
  // We stop searching once we have all three (title, author, date) OR if we've checked enough pages
  const MAX_METADATA_SEARCH_PAGES = 5; // Limit metadata search to first N pages
  const MAX_EMPTY_METADATA_PAGES = 3; // Stop searching if N consecutive pages return empty metadata
  
  let consecutiveEmptyMetadataPages = 0; // Track consecutive pages with empty metadata
  
  const needsMetadata = (pageNum) => {
    // Stop searching if we've checked too many pages
    if (pageNum > MAX_METADATA_SEARCH_PAGES) {
      return false;
    }
    
    // Stop searching if too many consecutive pages returned empty metadata
    if (consecutiveEmptyMetadataPages >= MAX_EMPTY_METADATA_PAGES) {
      return false;
    }
    
    const hasTitle = hasDocumentTitle;
    const hasAuthor = documentAuthor && documentAuthor.trim() !== '';
    const hasDate = documentPublishDate && documentPublishDate.trim() !== '';
    
    // Continue searching if we're missing any metadata
    return !hasTitle || !hasAuthor || !hasDate;
  };
  
  log(`Starting AI processing of ${numPages} pages`, { numPages });

  updatePdfStatus('statusRenderingPdfPages', { pages: numPages, count: numPages }, 10);
  let rendered;
  const figures = { items: new Map(), bytes: 0 };
  try {
    rendered = await renderAllPdfPages(cleanPdfUrl, numPages, 2.0, pdfData, {
      ...captureOptions,
      onProgress: (current, total) => updatePdfStatus('statusRenderingPdfPages', { pages: total, count: total }, 10 + Math.floor(current / total * 10))
    });
    for (const page of rendered.pages) {
      const pageNum = page.pageNum;
      await checkCancellation(`PDF AI processing page ${pageNum}`);
      if (page.error) throw createPdfError(`PDF extraction is incomplete. Failed pages: ${pageNum}.`, 'errorPdfIncomplete', { pages: String(pageNum) });
      updatePdfStatus('statusProcessingPdfPage', { page: pageNum, pages: numPages }, 20 + Math.floor((pageNum - 1) / numPages * 20));
      const imageData = await readRenderedPdfPage(page.ref, data.processingRunId);
      await checkCancellation('PDF page image');
      const shouldExtractMetadata = needsMetadata(pageNum);
      const userPrompt = buildPdfPageUserPrompt(imageData, pageNum, numPages, pageNum === 1, shouldExtractMetadata, requestOptions);
      const { result: pageResponse, assistantMessage } = await callAIWithImageAndHistory(
        systemPrompt, userPrompt, imageData, messageHistory,
        apiKey, model, true, requestOptions
      );
      await checkCancellation('PDF page response');
      const pageData = parseLLMResponse(pageResponse, pageNum);
      const pageMarkdown = cleanMarkdownText(pageData.text);
      if (shouldExtractMetadata) {
        const changes = extractMetadataFromPage(pageData.metadata, pageNum,
          { title: documentTitle, author: documentAuthor, date: documentPublishDate }, data);
        if (changes.title) { documentTitle = changes.title; hasDocumentTitle = true; }
        if (changes.author) documentAuthor = changes.author;
        if (changes.date) documentPublishDate = changes.date;
        consecutiveEmptyMetadataPages = changes.allEmpty ? consecutiveEmptyMetadataPages + 1 : 0;
      }
      if (pageMarkdown.trim()) {
        // Retain one preceding page for continuity, without replaying its image.
        // Provider-signed assistant blocks remain opaque and intact.
        messageHistory.splice(0, messageHistory.length,
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: Array.isArray(assistantMessage) ? assistantMessage : pageMarkdown });
      }
      const markdown = await preservePdfFigures(pageMarkdown, imageData, pageNum, figures, checkCancellation);
      allMarkdownParts.push({ pageNum, markdown, mergeWithPrevious: pageData.mergeWithPrevious });
      processedPages.push(pageNum);
      updatePdfStatus('statusProcessingPdfPage', { page: pageNum, pages: numPages }, 20 + Math.floor(pageNum / numPages * 20));
    }
  } finally {
    if (rendered) await removePdfOperation(rendered.operationId);
  }

  await checkCancellation('PDF processing completion');
  const processedSet = new Set(processedPages);
  const missingPages = Array.from({ length: numPages }, (_, index) => index + 1).filter(page => !processedSet.has(page));
  if (missingPages.length) {
    throw createPdfError(`PDF extraction is incomplete. Failed pages: ${missingPages.join(', ')}.`, 'errorPdfIncomplete', { pages: missingPages.join(', ') });
  }
  allMarkdownParts.sort((first, second) => first.pageNum - second.pageNum);
  const combinedMarkdown = joinPdfMarkdownPages(allMarkdownParts, figures.items);

  if (!combinedMarkdown) {
    const uiLang = await getUILanguageCached();
    throw createPdfError(tSync('errorPdfNoContent', uiLang), 'errorPdfNoContent');
  }

  const document = parsePdfMarkdown(combinedMarkdown, figures.items, documentTitle, hasDocumentTitle);
  updateState({ progress: 40 });
  log('PDF AI processing complete', {
    pageCount: processedPages.length,
    contentItems: document.content.length,
    duration: Date.now() - startTime
  });
  return { ...document, author: documentAuthor, publishDate: documentPublishDate };
}
