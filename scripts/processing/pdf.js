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
import { PDF_TO_MARKDOWN_SYSTEM_PROMPT, buildPdfPageUserPrompt } from '../extraction/prompts.js';
import { extractPdfViaOffscreen, getPdfMetadata, renderAllPdfPages, readRenderedPdfPage } from '../api/pdf-offscreen.js';
import { removePdfOperation } from '../api/pdf-operation-storage.js';
import { extractPdfDataFromTab } from '../api/pdf-data-extractor.js';
import { validatePdfData } from '../api/pdf-storage.js';
import { requestPdfFileSelectionViaMessage } from '../api/pdf-selection.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { fetchPdfFile } from '../offscreen/pdf/utils/pdf-fetcher.js';
import { createPdfError, localizePdfError } from '../utils/pdf-errors.js';

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
 * Process PDF page - extract content using PDF.js
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processPdfPage(data, pdfUrl) {
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
    result = await extractPdfContent(pdfUrl, pdfData, { ...requestOptions, processingRunId: data.processingRunId, onProgress: progressCallback });
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
export async function processPdfPageWithAI(data, pdfUrl) {
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
    throw createPdfError(tSync('errorTtsNoApiKey', uiLang), 'errorTtsNoApiKey');
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
  
  log(`PDF has ${numPages} pages - starting parallel extraction`);
  
  // Stage 2: Process each page with AI (10-40%)
  // Keep only the immediately preceding text turn and its signed assistant blocks.
  const allMarkdownParts = [];
  const messageHistory = [];
  const processedPages = []; // Track successfully processed pages
  const failedPages = []; // Track failed pages
  
  log('[ClipAIble PDF Processing] === CHAT HISTORY INITIALIZED ===', {
    numPages,
    messageHistoryInitialLength: messageHistory.length,
    systemPromptLength: PDF_TO_MARKDOWN_SYSTEM_PROMPT.length
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
      const userPrompt = buildPdfPageUserPrompt(imageData, pageNum, numPages, pageNum === 1, shouldExtractMetadata);
      const { result: pageResponse, assistantMessage } = await callAIWithImageAndHistory(
        PDF_TO_MARKDOWN_SYSTEM_PROMPT, userPrompt, imageData, messageHistory,
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
      allMarkdownParts.push({ pageNum, markdown: pageMarkdown, length: pageMarkdown.length,
        mergeWithPrevious: pageData.mergeWithPrevious });
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
  failedPages.length = 0;

  // Combine all markdown parts into single markdown text
  // Sort by page number to ensure correct order
  allMarkdownParts.sort((a, b) => a.pageNum - b.pageNum);
  
  // CRITICAL: Log all markdown parts before combining - FULL TEXT
  log('=== BEFORE COMBINING PAGES: ALL MARKDOWN PARTS (FULL) ===', {
    totalParts: allMarkdownParts.length,
    parts: allMarkdownParts.map((part, idx) => ({
      index: idx,
      pageNum: part.pageNum,
      markdownFull: part.markdown || '',
      markdownLength: part.markdown?.length || 0,
      mergeWithPrevious: part.mergeWithPrevious,
      markdownFirstChars: part.markdown?.substring(0, 200) || null,
      markdownLastChars: part.markdown && part.markdown.length > 200 ? part.markdown.substring(part.markdown.length - 200) : null
    }))
  });
  
  // Join pages using merge instructions from LLM
  let combinedMarkdown = '';
  for (let i = 0; i < allMarkdownParts.length; i++) {
    const part = allMarkdownParts[i];
    if (!part.markdown || !part.markdown.trim().length) {
      continue; // Skip empty parts
    }
    
    if (i === 0) {
      // First page - no merge needed
      combinedMarkdown = part.markdown.trim();
    } else {
      // Determine separator based on merge instruction from LLM
      const mergeType = part.mergeWithPrevious || 'paragraph';
      let separator = '';
      
      switch (mergeType) {
        case 'direct':
          // Direct continuation - add space to prevent word merging
          separator = ' ';
          break;
        case 'newline':
          // New line but same paragraph - single newline
          separator = '\n';
          break;
        case 'paragraph':
        default:
          // New paragraph or section - double newline
          separator = '\n\n';
          break;
      }
      
      // Add separator and page content
      combinedMarkdown += separator + part.markdown.trim();
    }
  }
  
  // CRITICAL: Log combined markdown immediately after combining - FULL TEXT
  log('=== AFTER COMBINING PAGES: COMBINED MARKDOWN (FULL) ===', {
    combinedMarkdownFull: combinedMarkdown,
    combinedMarkdownLength: combinedMarkdown.length,
    combinedMarkdownFirstChars: combinedMarkdown.substring(0, 500),
    combinedMarkdownLastChars: combinedMarkdown.length > 500 ? combinedMarkdown.substring(combinedMarkdown.length - 500) : null,
    totalPages: allMarkdownParts.length
  });
  
  if (!combinedMarkdown.trim()) {
    const uiLang = await getUILanguageCached();
    throw createPdfError(tSync('errorPdfNoContent', uiLang), 'errorPdfNoContent');
  }
  
  // Extract title from first H1 heading (if exists) and remove it from markdown
  // CRITICAL: If title was extracted from metadata, we MUST remove the duplicate H1 from markdown
  // Check if title is from metadata (not default/fallback values)
  const isDefaultTitle = !hasDocumentTitle;
  const titleFromMetadata = !isDefaultTitle;
  
  if (!titleFromMetadata) {
    // Title not found in metadata, try to extract from first H1
    // Look for H1 anywhere in the markdown (not just at the start)
    const firstH1Match = combinedMarkdown.match(/^#\s+(.+?)(?:\n|$)/m);
    if (firstH1Match && firstH1Match[1]) {
      const extractedTitle = firstH1Match[1].trim();
      // Check if it looks like a real title (not a filename, not too short)
      if (extractedTitle && 
          extractedTitle.length > 10 && 
          !extractedTitle.match(/\.pdf$/i) &&
          !extractedTitle.match(/^\d+[-_]/)) {
        documentTitle = extractedTitle;
        log('Extracted title from first H1', { title: documentTitle });
        
        // Remove the first H1 from markdown
        combinedMarkdown = combinedMarkdown.replace(/^#\s+.+?(?:\n|$)/m, '').trim();
        log('Removed first H1 from markdown');
      } else {
        log('First H1 does not look like a real title, keeping default', { 
          h1Text: extractedTitle,
          currentTitle: documentTitle 
        });
      }
    } else {
      log('No H1 found in markdown to extract title from', { currentTitle: documentTitle });
    }
  } else {
    // Title was extracted from metadata - MUST remove duplicate H1 from markdown
    log('Title extracted from metadata, checking for duplicate H1 in markdown', { title: documentTitle });
    
    // Find ALL H1 headings in the markdown and check which one matches the title
    const h1Matches = [...combinedMarkdown.matchAll(/^#\s+(.+?)(?:\n|$)/gm)];
    log(`Found ${h1Matches.length} H1 headings in markdown`, { 
      h1Headings: h1Matches.map(m => m[1].trim()),
      metadataTitle: documentTitle 
    });
    
    if (h1Matches.length > 0) {
      const titleLower = documentTitle.toLowerCase().trim();
      
      // Find the H1 that best matches the metadata title
      let bestMatch = null;
      let bestMatchIndex = -1;
      
      for (let i = 0; i < h1Matches.length; i++) {
        const h1Title = h1Matches[i][1].trim();
        const h1Lower = h1Title.toLowerCase().trim();
        
        // Check if this H1 matches the metadata title
        if (titleLower === h1Lower) {
          bestMatch = h1Title;
          bestMatchIndex = i;
          break; // Found a match, use it
        }
      }
      
      if (bestMatch) {
        // Remove the matching H1 from markdown
        // We need to remove the specific H1 that matches, not just the first one
        const lines = combinedMarkdown.split('\n');
        let removed = false;
        const newLines = [];
        let h1Count = 0;
        
        for (const line of lines) {
          const h1Match = line.match(/^#\s+(.+?)$/);
          if (h1Match) {
            h1Count++;
            if (h1Count === bestMatchIndex + 1) {
              // This is the H1 we want to remove
              const h1Title = h1Match[1].trim();
              const h1Lower = h1Title.toLowerCase().trim();
              if (titleLower === h1Lower) {
                removed = true;
                log('Removing duplicate H1 title from markdown', { 
                  metadataTitle: documentTitle, 
                  h1Title: h1Title,
                  h1Index: bestMatchIndex + 1
                });
                continue; // Skip this line
              }
            }
          }
          newLines.push(line);
        }
        
        if (removed) {
          combinedMarkdown = newLines.join('\n').trim();
          log('Removed duplicate H1 from markdown');
          
          // CRITICAL: Log markdown after removing duplicate H1 - FULL TEXT
          log('=== AFTER REMOVING DUPLICATE H1: COMBINED MARKDOWN (FULL) ===', {
            combinedMarkdownFull: combinedMarkdown,
            combinedMarkdownLength: combinedMarkdown.length,
            combinedMarkdownFirstChars: combinedMarkdown.substring(0, 500),
            combinedMarkdownLastChars: combinedMarkdown.length > 500 ? combinedMarkdown.substring(combinedMarkdown.length - 500) : null,
            removedH1Title: bestMatch,
            metadataTitle: documentTitle
          });
        } else {
          log('Could not find matching H1 to remove', { 
            metadataTitle: documentTitle,
            allH1s: h1Matches.map(m => m[1].trim())
          });
        }
      } else {
        log('No H1 found that matches metadata title, keeping all H1s', { 
          metadataTitle: documentTitle, 
          allH1s: h1Matches.map(m => m[1].trim())
        });
      }
    }
  }
  
  // CRITICAL: Log final combined markdown before parsing - FULL TEXT
  log('=== FINAL COMBINED MARKDOWN BEFORE PARSING (FULL) ===', {
    combinedMarkdownFull: combinedMarkdown,
    combinedMarkdownLength: combinedMarkdown.length,
    combinedMarkdownFirstChars: combinedMarkdown.substring(0, 500),
    combinedMarkdownLastChars: combinedMarkdown.length > 500 ? combinedMarkdown.substring(combinedMarkdown.length - 500) : null,
    documentTitle,
    documentAuthor,
    documentPublishDate
  });
  
  updateState({ progress: 40 });
  
  // Parse Markdown to extract structured elements for document generation
  // This allows generating PDF, EPUB, FB2, audio from the Markdown
  // CRITICAL: Parse BEFORE logging to avoid "Cannot access before initialization" error
  const parsedElements = parseMarkdownToElements(combinedMarkdown);
  
  // Log final metadata status
  const metadataStatus = {
    title: documentTitle && documentTitle !== 'Untitled PDF' && documentTitle !== data.title ? 'found' : 'not found',
    author: documentAuthor && documentAuthor.trim() !== '' ? 'found' : 'not found',
    date: documentPublishDate && documentPublishDate.trim() !== '' ? 'found' : 'not found'
  };
  
  log(`✅ PDF AI processing complete: ${parsedElements.length} content items extracted from ${numPages} pages`, {
    title: documentTitle,
    author: documentAuthor,
    publishDate: documentPublishDate,
    metadataStatus,
    markdownLength: combinedMarkdown.length,
    totalPages: numPages,
    processedPages: processedPages.length,
    failedPages: failedPages.length,
    markdownPartsCount: allMarkdownParts.length,
    metadataSearchPages: Math.min(MAX_METADATA_SEARCH_PAGES, numPages)
  });
  
  // CRITICAL: Log parsed elements - FULL TEXT
  log('=== PARSED ELEMENTS FROM MARKDOWN (FULL) ===', {
    totalElements: parsedElements.length,
    elements: parsedElements.map((el, idx) => ({
      index: idx,
      type: el.type,
      level: el.level || null,
      // FULL TEXT - NO TRUNCATION
      textFull: el.text || el.html || el.src || el.alt || '',
      textLength: (el.text || el.html || el.src || el.alt || '').length,
      textFirstChars: (el.text || el.html || el.src || el.alt || '').substring(0, 200),
      textLastChars: (el.text || el.html || el.src || el.alt || '') && (el.text || el.html || el.src || el.alt || '').length > 200 
        ? (el.text || el.html || el.src || el.alt || '').substring((el.text || el.html || el.src || el.alt || '').length - 200)
        : null,
      hasId: !!el.id,
      id: el.id || null
    }))
  });
  
  // Log table elements found
  const tableElements = parsedElements.filter(e => e.type === 'table');
  if (tableElements.length > 0) {
    log(`[PDF Processing] Found ${tableElements.length} table(s) in parsed elements`, {
      tableCount: tableElements.length,
      tables: tableElements.map((t, idx) => ({
        index: idx,
        rowCount: t.rows?.length || 0,
        firstRowPreview: t.rows?.[0]?.slice(0, 3).join('|') || 'empty'
      }))
    });
  } else {
    // Check if markdown contains table syntax
    const hasTableSyntax = combinedMarkdown.includes('|') && combinedMarkdown.match(/\|[^\n]+\|/);
    if (hasTableSyntax) {
      logWarn(`[PDF Processing] Markdown contains table syntax but no tables were parsed`, {
        markdownPreview: combinedMarkdown.substring(0, 500),
        tableMatches: combinedMarkdown.match(/\|[^\n]+\|/g)?.slice(0, 5) || []
      });
    }
  }
  
  // Return result in standard format
  const finalResult = {
    title: documentTitle,
    author: documentAuthor,
    content: parsedElements, // Structured elements parsed from Markdown
    markdown: combinedMarkdown, // Combined markdown text (for direct markdown output)
    publishDate: documentPublishDate
  };
  
  const duration = Date.now() - startTime;
  log('[ClipAIble PDF Processing] === FUNCTION EXIT (SUCCESS) ===', {
    function: 'processPdfPageWithAI',
    input: {
      pdfUrl,
      url,
      tabId,
      model,
      numPages
    },
    output: {
      title: finalResult.title,
      author: finalResult.author,
      publishDate: finalResult.publishDate,
      contentLength: finalResult.content.length,
      markdownLength: finalResult.markdown.length,
      markdownPreview: finalResult.markdown.substring(0, 200) + '...',
      processedPages: processedPages.length,
      failedPages: failedPages.length,
      totalPages: numPages
    },
    metadataStatus,
    duration,
    timestamp: Date.now()
  });
  

  return finalResult;
}

/**
 * Parse Markdown text into structured elements
 * @param {string} markdown - Markdown text
 * @returns {Array<Object>} Array of content elements
 */
function parseMarkdownToElements(markdown) {
  if (!markdown || !markdown.trim()) {
    return [];
  }
  
  const elements = [];
  const lines = markdown.split('\n');
  let currentParagraph = '';
  let currentList = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    const fence = trimmed.match(/^(`{3,}|~{3,})([^`~]*)$/);
    if (fence) {
      if (currentParagraph.trim()) elements.push({ type: 'paragraph', text: currentParagraph.trim() });
      if (currentList) elements.push(currentList);
      currentParagraph = ''; currentList = null;
      const code = [];
      let j = i + 1;
      const end = new RegExp('^' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
      for (; j < lines.length && !end.test(lines[j].trim()); j++) code.push(lines[j]);
      elements.push({ type: 'code', format: 'text', text: code.join('\n'), language: fence[2].trim().split(/\s+/)[0] });
      i = j;
      continue;
    }

    // Empty line - flush current paragraph/list
    if (!trimmed) {
      if (currentParagraph.trim()) {
        elements.push({
          type: 'paragraph',
          text: currentParagraph.trim()
        });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push(currentList);
        currentList = null;
      }
      continue;
    }
    
    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Flush current paragraph/list
      if (currentParagraph.trim()) {
        elements.push({
          type: 'paragraph',
          text: currentParagraph.trim()
        });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push(currentList);
        currentList = null;
      }
      
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      elements.push({
        type: 'heading',
        level: level,
        text: text
      });
      continue;
    }
    
    // Table
    const splitCells = value => value.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
    const separator = lines[i + 1]?.trim();
    if (trimmed.includes('|') && separator && splitCells(separator).length === splitCells(trimmed).length && splitCells(separator).every(cell => /^:?-{3,}:?$/.test(cell))) {
      // Flush current paragraph/list
      if (currentParagraph.trim()) {
        elements.push({
          type: 'paragraph',
          text: currentParagraph.trim()
        });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push(currentList);
        currentList = null;
      }
      
      // Collect table rows
      const tableRows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().includes('|')) {
        const rowLine = lines[j].trim();
        // Skip separator row (contains only dashes, colons, spaces, and pipes)
        if (!rowLine.match(/^\|[\s\-:]+(\|[\s\-:]+)*\|?$/)) {
          // Split by | and extract cells, preserving empty cells
          // Remove leading/trailing | if present, then split
          let cleanLine = rowLine;
          if (cleanLine.startsWith('|')) cleanLine = cleanLine.substring(1);
          if (cleanLine.endsWith('|')) cleanLine = cleanLine.substring(0, cleanLine.length - 1);
          const cells = splitCells(cleanLine);
          // Keep row even if some cells are empty (tables can have empty cells)
          if (cells.length > 0) {
            tableRows.push(cells); // Store as array directly, not as object with cells property
          }
        }
        j++;
      }
      i = j - 1; // Skip processed lines
      
      if (tableRows.length > 0) {
        // First row is typically the header row in Markdown tables
        // Extract headers and data rows
        const headers = tableRows[0] || [];
        const dataRows = tableRows.slice(1);
        
        log(`[PDF Processing] Parsed table with ${tableRows.length} rows (${headers.length} headers, ${dataRows.length} data rows)`, {
          totalRows: tableRows.length,
          headerCells: headers.length,
          dataRowCount: dataRows.length,
          headerPreview: headers.slice(0, 3).join('|'),
          firstDataRowPreview: dataRows[0]?.slice(0, 3).join('|') || 'none'
        });
        
        elements.push({
          type: 'table',
          headers: headers, // Header row as array
          rows: dataRows, // Data rows as array of arrays
          hasHeaders: headers.length > 0
        });
      } else {
        logWarn(`[PDF Processing] Table detection failed - no valid rows found`, {
          line: trimmed.substring(0, 100)
        });
      }
      continue;
    }
    
    // List item (ordered or unordered)
    const listMatch = trimmed.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      // Flush current paragraph
      if (currentParagraph.trim()) {
        elements.push({
          type: 'paragraph',
          text: currentParagraph.trim()
        });
        currentParagraph = '';
      }
      
      const indent = listMatch[1].length;
      const marker = listMatch[2];
      const itemText = listMatch[3].trim();
      const isOrdered = /^\d+\.$/.test(marker);
      
      // Start new list or add to current
      if (!currentList || currentList.ordered !== isOrdered) {
        if (currentList) {
          elements.push(currentList);
        }
        currentList = {
          type: 'list',
          ordered: isOrdered,
          items: [itemText]
        };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }
    
    // Regular paragraph text
    if (currentList) {
      elements.push(currentList);
      currentList = null;
    }
    if (currentParagraph) {
      currentParagraph += ' ';
    }
    currentParagraph += trimmed;
  }
  
  // Flush remaining paragraph/list
  if (currentParagraph.trim()) {
    elements.push({
      type: 'paragraph',
      text: currentParagraph.trim()
    });
  }
  if (currentList) {
    elements.push(currentList);
  }
  
  return elements;
}


