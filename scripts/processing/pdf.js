// @ts-check
// PDF page processing module for ClipAIble extension
// Handles processing of PDF pages - extracts content using PDF.js

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { checkCancellation, updateProgress, getUILanguageCached } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractPdfContent } from '../extraction/pdf.js';
import { callAIWithImageAndHistory } from '../api/index.js';
import { callWithRetry } from '../utils/retry.js';
import { CONFIG } from '../utils/config.js';
import { PDF_TO_MARKDOWN_SYSTEM_PROMPT, buildPdfPageUserPrompt } from '../extraction/prompts.js';
import { extractPdfViaOffscreen, getPdfMetadata, getPdfPageDimensions, renderPdfPageImage, renderAllPdfPages } from '../api/pdf-offscreen.js';
import { extractPdfDataFromTab } from '../api/pdf-data-extractor.js';
import { getPdfData, savePdfData, removePdfData, validatePdfData } from '../api/pdf-storage.js';
import { measurePdfLayoutInOriginalTab } from '../api/pdf-cdp-render.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';

/**
 * Get PDF data with fallback strategies
 * Tries multiple methods in order: IndexedDB -> Extract from tab -> File picker (for local) or Fetch (for web)
 * @param {string} pdfUrl - PDF file URL
 * @param {number|null} tabId - Tab ID where PDF is open (for local files)
 * @returns {Promise<ArrayBuffer>} PDF file data as ArrayBuffer
 * @throws {Error} If PDF data cannot be obtained
 */
async function getPdfDataWithFallback(pdfUrl, tabId = null) {
  const isLocalFile = pdfUrl.startsWith('file://');
  
  // PRIORITY 1: Try IndexedDB (fastest if previously saved)
  let pdfData = await getPdfData(pdfUrl);
  if (pdfData) {
    log('[ClipAIble PDF Processing] ✅ PDF data loaded from IndexedDB', {
      size: pdfData.byteLength,
      sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
      method: 'indexeddb'
    });
    return pdfData;
  }
  
  if (isLocalFile && tabId) {
    // PRIORITY 2: Try extracting from open tab (works only for PDF.js extension, not Chrome built-in viewer)
    try {
      log('⚠️ FALLBACK: PDF data not in IndexedDB - trying to extract from open tab', {
        reason: 'PDF data not found in IndexedDB cache',
        method: 'tab extraction (fallback)',
        note: 'Works only for PDF.js extension, not Chrome built-in viewer',
        tabId
      });
      pdfData = await extractPdfDataFromTab(pdfUrl, tabId);
      
      // Save to IndexedDB for future use
      if (pdfData) {
        log('[ClipAIble PDF Processing] ✅ PDF data extracted from open tab, saving to IndexedDB', { 
          size: pdfData.byteLength,
          sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
          method: 'tab_extraction'
        });
        savePdfData(pdfUrl, pdfData).catch(err => {
          logWarn('[ClipAIble PDF Processing] Failed to save PDF data to IndexedDB', { error: err.message });
        });
        return pdfData;
      } else {
        logWarn('[ClipAIble PDF Processing] extractPdfDataFromTab returned null/undefined', { tabId });
      }
    } catch (extractError) {
      // This is expected for Chrome built-in PDFium viewer - preserve error context for diagnostics
      const errorContext = {
        error: extractError.message,
        errorName: extractError.name,
        errorStack: extractError.stack,
        tabId,
        pdfUrl,
        expected: true, // This is expected behavior for PDFium
        note: 'This is expected for Chrome built-in PDFium viewer - will request file selection'
      };
      
      logWarn('[ClipAIble PDF Processing] ❌ Failed to extract PDF data from open tab', errorContext);
      // Continue to file picker - this is expected behavior
    }
    
    // PRIORITY 3: If PDF data still not available, request user to select file
    logWarn('⚠️ FALLBACK: PDF data not available - requesting user to select file manually', {
      reason: 'PDF data not found in IndexedDB and tab extraction failed',
      method: 'user file selection (last resort fallback)',
      impact: 'User interaction required - manual file selection',
      pdfUrl
    });
    
    try {
      // Use message-based approach (dynamic import() is not allowed in service worker)
      pdfData = await requestPdfFileSelectionViaMessage(pdfUrl);
      
      if (pdfData) {
        log('[ClipAIble PDF Processing] ✅ PDF file selected by user, saving to IndexedDB', { 
          size: pdfData.byteLength,
          sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
          method: 'user_file_selection',
          pdfUrl
        });
        
        try {
          // CRITICAL: Save to IndexedDB first, then reload from IndexedDB
          // This ensures data is properly stored and can be accessed by offscreen document
          await savePdfData(pdfUrl, pdfData);
          log('[ClipAIble PDF Processing] ✅ PDF data saved to IndexedDB successfully', {
            pdfUrl,
            size: pdfData.byteLength
          });
        } catch (saveError) {
          logError('[ClipAIble PDF Processing] ❌ Failed to save PDF data to IndexedDB', {
            error: saveError.message,
            errorStack: saveError.stack,
            pdfUrl,
            size: pdfData.byteLength
          });
          throw saveError;
        }
        
        try {
          // Reload from IndexedDB to ensure consistency
          // This matches the successful case where data comes from IndexedDB
          pdfData = await getPdfData(pdfUrl);
          if (!pdfData) {
            logError('[ClipAIble PDF Processing] ❌ Failed to retrieve PDF data from IndexedDB after saving', {
              pdfUrl,
              note: 'Data was saved but cannot be retrieved'
            });
            throw new Error('Failed to retrieve PDF data from IndexedDB after saving');
          }
          
          log('[ClipAIble PDF Processing] ✅ PDF data reloaded from IndexedDB after user selection', {
            size: pdfData.byteLength,
            sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
            method: 'indexeddb_after_user_selection',
            pdfUrl
          });
          return pdfData;
        } catch (retrieveError) {
          logError('[ClipAIble PDF Processing] ❌ Failed to retrieve PDF data from IndexedDB', {
            error: retrieveError.message,
            errorStack: retrieveError.stack,
            pdfUrl
          });
          throw retrieveError;
        }
      } else {
        throw new Error('User cancelled PDF file selection');
      }
    } catch (fileSelectionError) {
      // Preserve original error context for diagnostics
      const errorContext = {
        error: fileSelectionError.message,
        errorName: fileSelectionError.name,
        errorStack: fileSelectionError.stack,
        pdfUrl,
        tabId
      };
      
      logWarn('[ClipAIble PDF Processing] ❌ Failed to get PDF file from user selection', errorContext);
      
      // Create new error with user-friendly message, but preserve original error as cause
      const userError = new Error('PDF data not available. Please select the PDF file when prompted, or ensure PDF is open in a browser tab.');
      if (fileSelectionError.cause) {
        userError.cause = fileSelectionError.cause;
      } else {
        userError.cause = fileSelectionError;
      }
      throw userError;
    }
  } else if (pdfUrl.startsWith('http')) {
    // PRIORITY 2: Fetch from web
    try {
      log('[ClipAIble PDF Processing] PDF data not in IndexedDB, fetching from web', { pdfUrl });
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }
      pdfData = await response.arrayBuffer();
      
      // Save to IndexedDB for next time (async, non-blocking)
      savePdfData(pdfUrl, pdfData).catch(() => {});
      
      log('[ClipAIble PDF Processing] ✅ PDF data fetched from web', {
        size: pdfData.byteLength,
        sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
        method: 'web_fetch'
      });
      return pdfData;
    } catch (fetchError) {
      logError('[ClipAIble PDF Processing] Failed to fetch PDF from web', {
        error: fetchError.message,
        pdfUrl
      });
      throw new Error(`Failed to fetch PDF from web: ${fetchError.message}`);
    }
  }
  
  throw new Error('PDF data not available. Please ensure PDF is open in a browser tab or provide a valid URL.');
}

/**
 * Request PDF file selection via message to popup (fallback when dynamic import fails)
 * @param {string} expectedPdfUrl - Expected PDF URL
 * @returns {Promise<ArrayBuffer|null>} PDF file data as ArrayBuffer, or null if user cancelled
 */
async function requestPdfFileSelectionViaMessage(expectedPdfUrl) {
  log('[ClipAIble PDF Processing] Requesting PDF file selection via message to popup', { expectedPdfUrl });
  
  return new Promise((resolve, reject) => {
    // Send message to popup to show file picker
    chrome.runtime.sendMessage({
      action: 'selectPdfFile',
      expectedPdfUrl: expectedPdfUrl
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('[ClipAIble PDF Processing] Failed to send message to popup', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (!response) {
        log('[ClipAIble PDF Processing] No response from popup - popup may be closed');
        reject(new Error('No response from popup. Please keep the extension popup open and try again.'));
        return;
      }
      
      if (response.cancelled) {
        log('[ClipAIble PDF Processing] User cancelled file selection in popup');
        resolve(null);
        return;
      }
      
      if (response.success) {
        if (response.pdfData) {
          try {
            // Convert base64 to ArrayBuffer
            log('[ClipAIble PDF Processing] Converting base64 to ArrayBuffer', {
              base64Length: response.pdfData.length,
              expectedSize: response.size
            });
            
            const binaryString = atob(response.pdfData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;
            
            // Validate ArrayBuffer
            if (!(arrayBuffer instanceof ArrayBuffer)) {
              throw new Error('Failed to convert base64 to ArrayBuffer');
            }
            
            if (arrayBuffer.byteLength === 0) {
              throw new Error('ArrayBuffer is empty after conversion');
            }
            
            if (response.size && arrayBuffer.byteLength !== response.size) {
              logWarn('[ClipAIble PDF Processing] Size mismatch after base64 conversion', {
                expected: response.size,
                actual: arrayBuffer.byteLength,
                difference: arrayBuffer.byteLength - response.size
              });
            }
            
            log('[ClipAIble PDF Processing] PDF file selected and received from popup', {
              size: arrayBuffer.byteLength,
              sizeMB: (arrayBuffer.byteLength / 1024 / 1024).toFixed(2),
              isValidArrayBuffer: arrayBuffer instanceof ArrayBuffer
            });
            
            resolve(arrayBuffer);
          } catch (conversionError) {
            logError('[ClipAIble PDF Processing] Failed to convert base64 to ArrayBuffer', {
              error: conversionError.message,
              errorStack: conversionError.stack,
              base64Length: response.pdfData?.length
            });
            reject(conversionError);
          }
        } else {
          log('[ClipAIble PDF Processing] No PDF data in response');
          resolve(null);
        }
      } else {
        reject(new Error(response.error || 'Failed to select PDF file'));
      }
    });
  });
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
  
  // Remove markdown code blocks if LLM wrapped it
  if (cleaned.startsWith('```markdown') || cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
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
  let pageData;
  
  // CRITICAL: Log raw response immediately to understand what LLM returns
  log(`[parseLLMResponse] Page ${pageNum}: RAW LLM RESPONSE RECEIVED`, {
    pageNum,
    responseType: typeof pageResponse,
    isString: typeof pageResponse === 'string',
    isObject: typeof pageResponse === 'object' && pageResponse !== null,
    isNull: pageResponse === null,
    isUndefined: pageResponse === undefined,
    responseLength: typeof pageResponse === 'string' ? pageResponse.length : null,
    responseKeys: typeof pageResponse === 'object' && pageResponse !== null ? Object.keys(pageResponse) : null,
    // Log response preview (truncated to avoid huge logs)
    responsePreview: typeof pageResponse === 'string' 
      ? pageResponse.substring(0, 500) + (pageResponse.length > 500 ? '...' : '')
      : (typeof pageResponse === 'object' && pageResponse !== null 
          ? JSON.stringify(pageResponse).substring(0, 500) + (JSON.stringify(pageResponse).length > 500 ? '...' : '')
          : String(pageResponse).substring(0, 500)),
    // If it's an object, log text field specifically
    textField: typeof pageResponse === 'object' && pageResponse !== null && 'text' in pageResponse
      ? (typeof pageResponse.text === 'string' 
          ? `"${pageResponse.text.substring(0, 500)}"` 
          : `[${typeof pageResponse.text}] ${JSON.stringify(pageResponse.text).substring(0, 200)}`)
      : null,
    textFieldType: typeof pageResponse === 'object' && pageResponse !== null && 'text' in pageResponse
      ? typeof pageResponse.text
      : null,
    textFieldLength: typeof pageResponse === 'object' && pageResponse !== null && 'text' in pageResponse && typeof pageResponse.text === 'string'
      ? pageResponse.text.length
      : null
  });
  
  try {
    // Parse response based on type
    if (typeof pageResponse === 'string') {
      let jsonString = pageResponse.trim();
      log(`[parseLLMResponse] Page ${pageNum}: Parsing string response`, {
        pageNum,
        originalLength: pageResponse.length,
        trimmedLength: jsonString.length,
        startsWithJsonBlock: jsonString.startsWith('```json'),
        startsWithCodeBlock: jsonString.startsWith('```')
      });
      
      // Remove code blocks if present
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
        log(`[parseLLMResponse] Page ${pageNum}: Removed json code block`, {
          pageNum,
          afterRemovalLength: jsonString.length
        });
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```\s*/, '').replace(/```\s*$/, '');
        log(`[parseLLMResponse] Page ${pageNum}: Removed code block`, {
          pageNum,
          afterRemovalLength: jsonString.length
        });
      }
      
      log(`[parseLLMResponse] Page ${pageNum}: About to parse JSON`, {
        pageNum,
        jsonStringPreview: jsonString.substring(0, 500),
        jsonStringLength: jsonString.length
      });
      
      pageData = JSON.parse(jsonString);
      
      log(`[parseLLMResponse] Page ${pageNum}: JSON parsed successfully`, {
        pageNum,
        parsedKeys: Object.keys(pageData || {}),
        hasText: 'text' in (pageData || {}),
        textType: typeof (pageData?.text),
        textValue: typeof pageData?.text === 'string' ? `"${pageData.text.substring(0, 200)}"` : JSON.stringify(pageData?.text).substring(0, 200),
        textLength: typeof pageData?.text === 'string' ? pageData.text.length : null
      });
    } else if (typeof pageResponse === 'object' && pageResponse !== null) {
      log(`[parseLLMResponse] Page ${pageNum}: Response is already an object, using directly`, {
        pageNum,
        objectKeys: Object.keys(pageResponse),
        hasText: 'text' in pageResponse,
        textType: typeof pageResponse.text,
        textValue: typeof pageResponse.text === 'string' ? `"${pageResponse.text.substring(0, 200)}"` : JSON.stringify(pageResponse.text).substring(0, 200),
        textLength: typeof pageResponse.text === 'string' ? pageResponse.text.length : null
      });
      pageData = pageResponse;
    } else {
      throw new Error('Invalid response type');
    }
    
    // Validate and extract text field
    // CRITICAL: Allow empty strings - they are valid strings, just empty content
    log(`[parseLLMResponse] Page ${pageNum}: Validating text field`, {
      pageNum,
      textExists: 'text' in pageData,
      textValue: pageData.text,
      textType: typeof pageData.text,
      textIsUndefined: pageData.text === undefined,
      textIsNull: pageData.text === null,
      textIsString: typeof pageData.text === 'string',
      textLength: typeof pageData.text === 'string' ? pageData.text.length : null,
      textPreview: typeof pageData.text === 'string' ? pageData.text.substring(0, 500) : JSON.stringify(pageData.text).substring(0, 200)
    });
    
    if (pageData.text === undefined || pageData.text === null || typeof pageData.text !== 'string') {
      logError(`[parseLLMResponse] Page ${pageNum}: Text field validation failed`, {
        pageNum,
        textExists: 'text' in pageData,
        textValue: pageData.text,
        textType: typeof pageData.text,
        textIsUndefined: pageData.text === undefined,
        textIsNull: pageData.text === null,
        textIsString: typeof pageData.text === 'string',
        fullPageData: JSON.stringify(pageData, null, 2).substring(0, 1000)
      });
      throw new Error('Missing or invalid "text" field in response');
    }
    
    // CRITICAL: Check if text field contains JSON string (should not happen, but LLM might return it)
    let extractedText = pageData.text;
    
    log(`[parseLLMResponse] Page ${pageNum}: Text field extracted`, {
      pageNum,
      extractedTextLength: extractedText.length,
      extractedTextPreview: extractedText.substring(0, 500),
      extractedTextFirstChars: extractedText.substring(0, 100),
      startsWithBrace: extractedText.trim().startsWith('{'),
      isEmpty: extractedText.trim().length === 0
    });
    
    // Check if text is a JSON string (should not happen, but LLM might return it)
    if (typeof extractedText === 'string' && extractedText.trim().startsWith('{')) {
      log(`[parseLLMResponse] Page ${pageNum}: Text field starts with '{', checking if it's nested JSON`, {
        pageNum,
        textPreview: extractedText.substring(0, 200)
      });
      try {
        const testParsed = JSON.parse(extractedText);
        // If parsing succeeds and contains "text" field, it's likely a JSON string
        if (testParsed.text && typeof testParsed.text === 'string') {
          logWarn(`Page ${pageNum}: Found JSON string in text field, extracting inner text`, { 
            pageNum,
            originalLength: extractedText.length,
            extractedLength: testParsed.text.length,
            hasMergeWithPrevious: !!testParsed.mergeWithPrevious,
            hasMetadata: !!testParsed.metadata
          });
          extractedText = testParsed.text;
          // Also update mergeWithPrevious and metadata if present
          if (testParsed.mergeWithPrevious && ['direct', 'newline', 'paragraph'].includes(testParsed.mergeWithPrevious)) {
            pageData.mergeWithPrevious = testParsed.mergeWithPrevious;
          }
          if (testParsed.metadata && typeof testParsed.metadata === 'object') {
            pageData.metadata = testParsed.metadata;
          }
        } else if (testParsed.mergeWithPrevious || testParsed.metadata) {
          // If it's the full JSON object, extract all fields
          logWarn(`Page ${pageNum}: Found full JSON object in text field, extracting all fields`, { 
            pageNum,
            hasText: !!testParsed.text,
            hasMergeWithPrevious: !!testParsed.mergeWithPrevious,
            hasMetadata: !!testParsed.metadata
          });
          if (testParsed.text && typeof testParsed.text === 'string') {
            extractedText = testParsed.text;
          }
          if (testParsed.mergeWithPrevious && ['direct', 'newline', 'paragraph'].includes(testParsed.mergeWithPrevious)) {
            pageData.mergeWithPrevious = testParsed.mergeWithPrevious;
          }
          if (testParsed.metadata && typeof testParsed.metadata === 'object') {
            pageData.metadata = testParsed.metadata;
          }
        }
      } catch (e) {
        // Not valid JSON, use as-is (might be valid markdown starting with {)
        log(`Page ${pageNum}: Text field starts with '{' but is not valid JSON, using as-is`, {
          pageNum,
          preview: extractedText.substring(0, 100)
        });
      }
    }
    
    // Validate mergeWithPrevious
    if (!pageData.mergeWithPrevious || !['direct', 'newline', 'paragraph'].includes(pageData.mergeWithPrevious)) {
      pageData.mergeWithPrevious = 'paragraph';
    }
    
    // Validate metadata
    if (!pageData.metadata || typeof pageData.metadata !== 'object') {
      pageData.metadata = { title: '', author: '', date: '' };
    }
    
    pageData.text = extractedText;
    
    log(`[parseLLMResponse] Page ${pageNum}: FINAL RESULT`, {
      pageNum,
      finalTextLength: pageData.text.length,
      finalTextPreview: pageData.text.substring(0, 500),
      finalTextFirstChars: pageData.text.substring(0, 100),
      finalTextLastChars: pageData.text.length > 100 ? pageData.text.substring(pageData.text.length - 100) : pageData.text,
      isEmpty: pageData.text.trim().length === 0,
      mergeWithPrevious: pageData.mergeWithPrevious,
      hasMetadata: !!pageData.metadata,
      metadata: pageData.metadata
    });
    
    return pageData;
  } catch (parseError) {
    logError(`Failed to parse JSON response from LLM for page ${pageNum}`, {
      error: parseError.message,
      responseType: typeof pageResponse,
      responsePreview: typeof pageResponse === 'string' ? pageResponse.substring(0, 500) : (typeof pageResponse === 'object' && pageResponse !== null ? JSON.stringify(pageResponse).substring(0, 500) : String(pageResponse).substring(0, 500)),
      pageNum
    });
    // Fallback: try to extract text from object, or use empty string
    let fallbackText = '';
    if (typeof pageResponse === 'string') {
      fallbackText = pageResponse;
    } else if (typeof pageResponse === 'object' && pageResponse !== null) {
      // Try to extract text from object
      if (pageResponse.text && typeof pageResponse.text === 'string') {
        fallbackText = pageResponse.text;
      } else {
        // Last resort: stringify the object (should not happen, but for safety)
        logWarn(`Page ${pageNum}: Fallback - pageResponse is object without text field, using empty string`, {
          pageNum,
          responseKeys: Object.keys(pageResponse || {})
        });
        fallbackText = '';
      }
    } else {
      fallbackText = String(pageResponse || '');
    }
    
    return {
      text: fallbackText,
      mergeWithPrevious: 'paragraph',
      metadata: { title: '', author: '', date: '' }
    };
  }
}

/**
 * Process PDF page - extract content using PDF.js
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processPdfPage(data, pdfUrl) {
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
    
    result = await extractPdfContent(pdfUrl);
    
    log(`✅ PDF content extracted: ${result.content?.length || 0} content items`, { 
      title: result.title
    });
  } catch (error) {
    logError('Failed to extract PDF content', error);
    const uiLang = await getUILanguageCached();
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide user-friendly error messages
    if (errorMsg.includes('password')) {
      throw new Error(tSync('errorPdfPasswordProtected', uiLang) || errorMsg);
    } else if (errorMsg.includes('too large')) {
      throw new Error(errorMsg); // Already user-friendly
    } else if (errorMsg.includes('No text')) {
      throw new Error(tSync('errorPdfNoTextLayer', uiLang) || errorMsg);
    } else {
      throw new Error(tSync('errorPdfExtractionFailed', uiLang)?.replace('{error}', errorMsg) || errorMsg);
    }
  }
  
  if (!result.content || result.content.length === 0) {
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorPdfNoContent', uiLang) || 'No content extracted from PDF');
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
  const startTime = Date.now();
  const { url, tabId, apiKey, model } = data;
  
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
    throw new Error(tSync('errorTtsNoApiKey', uiLang) || 'API key is required for AI processing');
  }
  
  // Remove URL fragment (#page=N) before loading PDF - fetch cannot handle fragments
  // Chrome PDF viewer uses #page=N for navigation, but we need clean URL for file loading
  const cleanPdfUrl = pdfUrl.split('#')[0];
  if (cleanPdfUrl !== pdfUrl) {
    log('Removed URL fragment from PDF URL', { original: pdfUrl, cleaned: cleanPdfUrl });
  }
  
  const isLocalFile = cleanPdfUrl.startsWith('file://');
  
  // CRITICAL: For local files, get PDF data FIRST (before dimensions)
  // This is required because offscreen document cannot load file:// URLs via fetch
  // For web URLs, we can get dimensions directly
  let pdfData = null;
  if (isLocalFile && tabId) {
    log('[ClipAIble PDF Processing] Local file detected - getting PDF data first (before dimensions)', { pdfUrl: cleanPdfUrl, tabId });
    
    // Use unified function to get PDF data with fallback strategies
    pdfData = await getPdfDataWithFallback(cleanPdfUrl, tabId);
    
    // CRITICAL: At this point, pdfData should always be from IndexedDB
    // Verify it's an ArrayBuffer and has valid PDF header using shared validation
    try {
      validatePdfData(pdfData, 'processPdfPageWithAI');
    } catch (validationError) {
      throw new Error(`PDF data validation failed: ${validationError.message}`);
    }
    
    const headerBytes = new Uint8Array(pdfData).slice(0, 4);
    const headerText = String.fromCharCode(...headerBytes);
    
    log('[ClipAIble PDF Processing] ✅ PDF data ready for processing', {
      size: pdfData.byteLength,
      sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
      header: headerText,
      source: 'indexeddb'
    });
  }
  
  // CRITICAL: Get PDF page dimensions via PDF.js API
  // For local files, use pdfData if available; for web URLs, fetch directly
  let pdfPageDimensions = null;
  try {
    log('[ClipAIble PDF Processing] Getting PDF page dimensions via PDF.js API', {
      pdfUrl: cleanPdfUrl,
      pageNum: 1,
      hasPdfData: !!pdfData,
      isLocalFile
    });
    
    pdfPageDimensions = await getPdfPageDimensions(cleanPdfUrl, 1, pdfData);
    
    criticalLog('[ClipAIble PDF Processing] ✅ PDF page dimensions retrieved via PDF.js API', 'PDF_PAGE_DIMENSIONS_RETRIEVED_VERY_EARLY', {
      width: pdfPageDimensions?.width,
      height: pdfPageDimensions?.height,
      aspectRatio: pdfPageDimensions ? (pdfPageDimensions.width / pdfPageDimensions.height).toFixed(4) : null,
      mediaBox: pdfPageDimensions?.mediaBox,
      cropBox: pdfPageDimensions?.cropBox,
      timestamp: Date.now()
    });
    
    log('[ClipAIble PDF Processing] PDF page dimensions retrieved', {
      width: pdfPageDimensions?.width,
      height: pdfPageDimensions?.height,
      aspectRatio: pdfPageDimensions ? (pdfPageDimensions.width / pdfPageDimensions.height).toFixed(4) : null
    });
  } catch (error) {
    logWarn('[ClipAIble PDF Processing] Failed to get PDF page dimensions via PDF.js API', {
      error: error.message,
      note: 'Will abort processing'
    });
  }
  
  // CRITICAL: Abort processing if dimensions are not available
  if (!pdfPageDimensions || !pdfPageDimensions.width || !pdfPageDimensions.height) {
    const errorMsg = 'PDF page dimensions not available - aborting processing';
    logError('[ClipAIble PDF Processing] ❌ ABORTING: PDF page dimensions not available', {
      pdfPageDimensions,
      hasWidth: !!(pdfPageDimensions && pdfPageDimensions.width),
      hasHeight: !!(pdfPageDimensions && pdfPageDimensions.height)
    });
    throw new Error(errorMsg);
  }
  
  // CRITICAL: Measure PDF layout in original user tab (BEFORE opening new tabs)
  // This measures sidebar width and PDF content coordinates in the tab where user opened PDF
  // We'll use these measurements for all new tabs to exclude sidebar automatically
  // CRITICAL: Processing will abort if measurement fails (required for correct clipping)
  let originalTabLayout = null;
  if (tabId) {
    try {
      log('[ClipAIble PDF Processing] Measuring PDF layout in original user tab (BEFORE opening new tabs)', {
        tabId,
        pdfUrl: cleanPdfUrl,
        note: 'This will measure sidebar width and PDF content coordinates to use for all new tabs. Processing will abort if this fails.'
      });
      
      // Use static import (already imported at top of file)
      originalTabLayout = await measurePdfLayoutInOriginalTab(tabId);
      
      if (originalTabLayout) {
        criticalLog('[ClipAIble PDF Processing] ✅ PDF layout measured in original tab', 'PDF_LAYOUT_MEASURED_ORIGINAL_TAB', {
          tabId,
          sidebarWidth: originalTabLayout.sidebarWidth,
          pdfContentX: originalTabLayout.pdfContentX,
          pdfContentY: originalTabLayout.pdfContentY,
          pdfContentWidth: originalTabLayout.pdfContentWidth,
          pdfContentHeight: originalTabLayout.pdfContentHeight,
          viewportWidth: originalTabLayout.viewportWidth,
          viewportHeight: originalTabLayout.viewportHeight,
          note: originalTabLayout.sidebarWidth === 0 
            ? 'Sidebar width is 0 (hidden or collapsed) - will collapse sidebar in new tabs' 
            : 'Will use these coordinates for all new tabs to exclude sidebar',
          timestamp: Date.now()
        });
        
        // NOTE: If sidebarWidth is 0, it means sidebar is hidden/collapsed or not found
        // We'll collapse it in new tabs anyway, so this is OK
        if (originalTabLayout.sidebarWidth === 0) {
          log('[ClipAIble PDF Processing] Sidebar is hidden/collapsed or not found in original tab - will collapse it in new tabs', {
            tabId,
            note: 'No need to exclude sidebar from screenshots - it will be collapsed automatically in new tabs'
          });
        }
      } else {
        const errorMsg = 'Failed to measure PDF layout in original tab - aborting processing';
        logError('[ClipAIble PDF Processing] ❌ ABORTING: PDF layout measurement failed', {
          tabId,
          originalTabLayout,
          note: 'Processing aborted - PDF layout measurement is required'
        });
        throw new Error(errorMsg);
      }
    } catch (error) {
      logError('[ClipAIble PDF Processing] ❌ ABORTING: Error measuring PDF layout in original tab', {
        tabId,
        error: error.message,
        errorStack: error.stack,
        note: 'Processing aborted - sidebar width measurement is required for correct clipping'
      });
      throw error; // Re-throw to abort processing
    }
  } else {
    const errorMsg = 'No tabId provided - cannot measure PDF layout in original tab';
    logError('[ClipAIble PDF Processing] ❌ ABORTING: No tabId for layout measurement', {
      tabId,
      note: 'Processing aborted - tabId is required to measure sidebar width'
    });
    throw new Error(errorMsg);
  }
  
  // Stage 1: Get PDF metadata (MINIMAL - just get page count, nothing else)
  // CRITICAL: Do this as fast as possible, no unnecessary operations
  let pdfMetadata;
  try {
    pdfMetadata = await getPdfMetadata(cleanPdfUrl);
  } catch (error) {
    logError('Failed to get PDF metadata', error);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorPdfExtractionFailed', uiLang)?.replace('{error}', error.message) || error.message);
  }
  
  const numPages = pdfMetadata.numPages;
  const metadata = pdfMetadata.metadata || {};
  
  if (numPages === 0) {
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorPdfNoContent', uiLang) || 'PDF has no pages');
  }
  
  log(`PDF has ${numPages} pages - starting parallel extraction`);
  
  // Stage 2: Process each page with AI (10-40%)
  // Maintain conversation history across pages for consistent heading hierarchy
  // LLM converts PDF pages to Markdown, we collect both markdown text and structured elements
  // CRITICAL: This works like a chat - system prompt + history + new image = response
  // Each page is sent as a new message with image, LLM sees all previous pages in history
  const allMarkdownParts = []; // Collect markdown from each page with page numbers
  const messageHistory = []; // Conversation history: [{role: 'user'|'assistant', content: string|array}]
  // History structure:
  // - user messages: {role: 'user', content: [{type: 'text', text: '...'}, {type: 'image_url', ...}]}
  // - assistant messages: {role: 'assistant', content: 'markdown text'}
  // Each page adds: userMessage (with image) + assistantMessage (markdown response)
  const processedPages = []; // Track successfully processed pages
  const failedPages = []; // Track failed pages
  const pageErrors = new Map(); // Track detailed error information for failed pages: Map<pageNum, {error, stack, timestamp}>
  
  log('[ClipAIble PDF Processing] === CHAT HISTORY INITIALIZED ===', {
    numPages,
    messageHistoryInitialLength: messageHistory.length,
    systemPromptLength: PDF_TO_MARKDOWN_SYSTEM_PROMPT.length
  });
  let documentTitle = data.title || metadata.title || 'Untitled PDF';
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
    
    const hasTitle = documentTitle && documentTitle !== 'Untitled PDF' && documentTitle !== data.title;
    const hasAuthor = documentAuthor && documentAuthor.trim() !== '';
    const hasDate = documentPublishDate && documentPublishDate.trim() !== '';
    
    // Continue searching if we're missing any metadata
    return !hasTitle || !hasAuthor || !hasDate;
  };
  
  log(`Starting AI processing of ${numPages} pages`, { numPages });

  // CRITICAL: For local files, pdfData was already obtained above (before dimensions)
  // For web URLs, pdfData is null and will be loaded by offscreen document via fetch
  if (isLocalFile && pdfData) {
    log('[ClipAIble PDF Processing] ✅ PDF data available for local file - using offscreen rendering', {
      size: pdfData.byteLength,
      sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2),
      method: 'offscreen_render'
    });
  }
  
  const pageImages = []; // Store all rendered page images
  
  // CRITICAL: Render ALL pages at once (loads PDF ONCE - much faster)
  // pdfPageDimensions was already retrieved at the very beginning of the function
  // Per Perplexity analysis: Loading PDF for each page is 10x slower
  log('[ClipAIble PDF Processing] Rendering all PDF pages at once (loads PDF once)', {
    numPages,
    pdfDataSize: pdfData ? pdfData.byteLength : null,
    hasPdfData: !!pdfData,
    method: 'renderAllPdfPages',
    hasPageDimensions: !!pdfPageDimensions,
    pageWidth: pdfPageDimensions?.width,
    pageHeight: pdfPageDimensions?.height
  });
  
  updateState({ progress: 10, status: `Rendering ${numPages} pages...` });
  
  try {
    const renderedPages = await renderAllPdfPages(cleanPdfUrl, numPages, 2.0, pdfData, pdfPageDimensions, originalTabLayout);
    
    // Convert rendered pages to pageImages array
    for (const renderedPage of renderedPages) {
      if (renderedPage.error) {
        logError(`[ClipAIble PDF Processing] Page ${renderedPage.pageNum} render failed`, {
          pageNum: renderedPage.pageNum,
          error: renderedPage.error
        });
        pageImages[renderedPage.pageNum - 1] = null;
        failedPages.push(renderedPage.pageNum);
      } else {
        // CRITICAL: Use imageData (full data URL) instead of base64 (without prefix)
        // imageData contains full data URL like "data:image/png;base64,..."
        // base64 contains only the base64 string without prefix
        const finalImageData = renderedPage.imageData || (renderedPage.base64 ? `data:image/png;base64,${renderedPage.base64}` : null);
        
        if (!finalImageData) {
          logError(`[ClipAIble PDF Processing] Page ${renderedPage.pageNum}: No imageData or base64 available`, {
            pageNum: renderedPage.pageNum,
            hasImageData: !!renderedPage.imageData,
            hasBase64: !!renderedPage.base64,
            renderedPageKeys: Object.keys(renderedPage)
          });
          pageImages[renderedPage.pageNum - 1] = null;
          failedPages.push(renderedPage.pageNum);
          continue;
        }
        
        // CRITICAL: Check if this slot is already occupied (should not happen, but protect against overwrites)
        const arrayIndex = renderedPage.pageNum - 1;
        if (pageImages[arrayIndex] !== undefined && pageImages[arrayIndex] !== null) {
          logWarn(`[ClipAIble PDF Processing] Page ${renderedPage.pageNum} slot already occupied, overwriting`, {
            pageNum: renderedPage.pageNum,
            existingSize: pageImages[arrayIndex].imageData ? pageImages[arrayIndex].imageData.length : 0,
            newSize: finalImageData.length
          });
        }
        
        pageImages[arrayIndex] = {
          imageData: finalImageData,
          width: renderedPage.width,
          height: renderedPage.height
        };
        
        log(`[ClipAIble PDF Processing] Page ${renderedPage.pageNum} rendered successfully`, {
          pageNum: renderedPage.pageNum,
          width: renderedPage.width,
          height: renderedPage.height,
          imageSize: finalImageData.length
        });
      }
    }
    
    log(`[ClipAIble PDF Processing] All pages rendered: ${pageImages.filter(img => img !== null).length}/${numPages} successful`);
    
  } catch (error) {
    logError('[ClipAIble PDF Processing] Failed to render all PDF pages', {
      error: error.message,
      numPages
    });
    // Fallback: try rendering pages one by one (old method)
    logWarn('[ClipAIble PDF Processing] Falling back to sequential page rendering');
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const renderedImage = await renderPdfPageImage(cleanPdfUrl, pageNum, 2.0, pdfData);
        
        // CRITICAL: Use full imageData (with prefix) instead of extracting base64
        // imageData already has full data URL like "data:image/png;base64,..."
        const finalImageData = renderedImage.imageData || (renderedImage.base64 ? `data:image/png;base64,${renderedImage.base64}` : null);
        
        if (!finalImageData) {
          pageImages[pageNum - 1] = null;
          failedPages.push(pageNum);
          continue;
        }
        
        pageImages[pageNum - 1] = {
          imageData: finalImageData, // Use full data URL, not just base64
          width: renderedImage.width,
          height: renderedImage.height
        };
      } catch (pageError) {
        logError(`[ClipAIble PDF Processing] Failed to render page ${pageNum} (fallback)`, {
          pageNum,
          error: pageError.message
        });
        pageImages[pageNum - 1] = null;
        failedPages.push(pageNum);
      }
    }
  }
  
  // Now process pages with LLM sequentially
  if (isLocalFile && tabId) {
    // Process pages sequentially: LLM → LLM → ...
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      await checkCancellation(`PDF AI processing page ${pageNum}`);
      
      const captureProgress = 10 + (pageNum / numPages) * 20; // 10-30%
      updateState({ progress: Math.round(captureProgress), status: `Processing page ${pageNum}/${numPages} with AI...` });
      
      // Check if we still need to search for metadata
      const shouldExtractMetadata = needsMetadata(pageNum);
      
      // Only log page start if verbose (reduces log volume for multi-page PDFs)
      if (CONFIG?.VERBOSE_LOGGING) {
        log(`[ClipAIble PDF Processing] Processing page ${pageNum}/${numPages}`, {
          pageNum,
          totalPages: numPages,
          shouldExtractMetadata
        });
      }
      
      const pageImage = pageImages[pageNum - 1];
      
      if (pageImage === null || pageImage === undefined) {
        logWarn(`Page ${pageNum}: No captured image available, skipping`, { pageNum });
        failedPages.push(pageNum); // Add to failedPages for consistency
        continue; // Skip LLM processing for this page
      }
      
      // IMMEDIATELY process this page with LLM (like old working version)
      // This gives Chrome time between captures and prevents blocking
      if (pageImage) {
        await checkCancellation(`PDF AI processing page ${pageNum}`);
        
        // Retry logic for AI page processing
        const MAX_AI_PAGE_RETRIES = 4;
        const AI_PAGE_RETRY_DELAYS = [2000, 5000, 10000, 20000]; // 2s, 5s, 10s, 20s
        let pageProcessed = false;
        let lastPageError = null;
        
        for (let retryAttempt = 0; retryAttempt <= MAX_AI_PAGE_RETRIES && !pageProcessed; retryAttempt++) {
          if (retryAttempt > 0) {
            logWarn(`[ClipAIble PDF Processing] Retrying AI processing for page`, {
              pageNum,
              retryAttempt,
              maxRetries: MAX_AI_PAGE_RETRIES,
              lastError: lastPageError?.message,
              delay: AI_PAGE_RETRY_DELAYS[retryAttempt - 1],
              timestamp: Date.now()
            });
            await new Promise(resolve => setTimeout(resolve, AI_PAGE_RETRY_DELAYS[retryAttempt - 1]));
            await checkCancellation(`PDF AI processing page ${pageNum} (retry ${retryAttempt})`);
          }
        
        // Update progress (30-40% for LLM processing)
        const pageProgress = 30 + (pageNum / numPages) * 10; // 30-40%
        updateState({ progress: Math.round(pageProgress), status: `Processing page ${pageNum}/${numPages} with AI...` });
        
        try {
          // CRITICAL: Verify imageData has prefix before using it
          let imageDataToUse = pageImage.imageData;
          if (!imageDataToUse) {
            logError(`Page ${pageNum}: imageData is null or undefined`, { pageNum, pageImageKeys: Object.keys(pageImage || {}) });
            failedPages.push(pageNum);
            continue;
          }
          
          // If imageData doesn't have prefix, add it (should not happen, but safety check)
          if (!imageDataToUse.startsWith('data:image/')) {
            logWarn(`Page ${pageNum}: imageData missing prefix, adding it`, {
              pageNum,
              imageDataLength: imageDataToUse.length,
              imageDataStart: imageDataToUse.substring(0, 50),
              note: 'This should not happen - imageData should have prefix from renderAllPdfPages'
            });
            imageDataToUse = `data:image/png;base64,${imageDataToUse}`;
          }
          
          // Send to LLM with image (same logic as main loop)
          const isFirstPage = pageNum === 1;
          const userPrompt = buildPdfPageUserPrompt(imageDataToUse, pageNum, numPages, isFirstPage, shouldExtractMetadata);
          
          // CRITICAL: Log image hash and URL to verify correct page is being sent
          const base64Image = imageDataToUse.includes(',') 
            ? imageDataToUse.split(',')[1] 
            : imageDataToUse;
          const imageHashStart = base64Image.substring(0, 100);
          const imageHashEnd = base64Image.substring(Math.max(0, base64Image.length - 100));
          
          log(`[ClipAIble PDF Processing] === CALLING LLM ===`, {
            function: 'callAIWithImageAndHistory',
            input: {
              pageNum,
              imageSize: imageDataToUse.length,
              originalImageSize: pageImage.imageData.length,
              imageDataPreview: imageDataToUse.substring(0, 50) + '...',
              imageHashStart: imageHashStart,
              imageHashEnd: imageHashEnd,
              width: pageImage.width,
              height: pageImage.height,
              hasPrefix: imageDataToUse.startsWith('data:image/'),
              historyMessages: messageHistory.length,
              historyDetails: messageHistory.map((msg, idx) => ({
                index: idx,
                role: msg.role,
                hasImage: Array.isArray(msg.content) && msg.content.some(c => c.type === 'image_url' || c.image_url || c.inline_data),
                contentLength: typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length
              })),
              shouldExtractMetadata,
              isFirstPage,
              model,
              promptLength: userPrompt.length,
              promptPreview: userPrompt.substring(0, 200) + '...',
              // CRITICAL: Log target URL to verify we're capturing the right page
              expectedPageUrl: `#page=${pageNum}`
            },
            timestamp: Date.now()
          });
          
          log(`Sending page ${pageNum} image to LLM with history`, {
            model,
            imageSize: imageDataToUse.length,
            originalImageSize: pageImage.imageData.length,
            width: pageImage.width,
            height: pageImage.height,
            historyMessages: messageHistory.length,
            shouldExtractMetadata,
            isFirstPage,
            hasPrefix: imageDataToUse.startsWith('data:image/')
          });
          
          const llmCallStartTime = Date.now();
          // Send image to selected LLM with conversation history
          // CRITICAL: Use jsonResponse = true to get JSON with text and mergeWithPrevious
          const { result: pageResponse, assistantMessage, userMessage } = await callWithRetry(
            () => callAIWithImageAndHistory(
              PDF_TO_MARKDOWN_SYSTEM_PROMPT,
              userPrompt,
              imageDataToUse, // Use corrected imageData with prefix
              messageHistory,
              apiKey,
              model,
              true // jsonResponse = true - expect JSON with text and mergeWithPrevious
            ),
            {
              maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
              delays: CONFIG.RETRY_DELAYS,
              retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
            }
          );
          
          // Parse JSON response using shared function
          const pageData = parseLLMResponse(pageResponse, pageNum);
          
          let pageMarkdown = pageData.text;
          const mergeInstruction = pageData.mergeWithPrevious;
          const pageMetadata = pageData.metadata || { title: '', author: '', date: '' };
          
          // pageMarkdown is already the text from pageData.text - use it as-is
          // No need to check if it's JSON - if it starts with '{', it's just text content (e.g., code examples)
          
          const llmCallDuration = Date.now() - llmCallStartTime;
          log(`[ClipAIble PDF Processing] === LLM RESPONSE RECEIVED ===`, {
            function: 'callAIWithImageAndHistory',
            input: { pageNum },
            output: {
              markdownLength: pageMarkdown?.length || 0,
              markdownPreview: pageMarkdown?.substring(0, 200) + '...' || 'null',
              hasAssistantMessage: !!assistantMessage,
              hasUserMessage: !!userMessage,
              assistantMessageLength: assistantMessage?.length || 0,
              mergeWithPrevious: mergeInstruction
            },
            duration: llmCallDuration,
            timestamp: Date.now()
          });
          
          // Add to conversation history - use pageMarkdown (text) instead of assistantMessage (JSON)
          const historyBefore = messageHistory.length;
          messageHistory.push(userMessage, { role: 'assistant', content: pageMarkdown });
          const historyAfter = messageHistory.length;
          
          log(`[ClipAIble PDF Processing] === HISTORY UPDATED ===`, {
            pageNum,
            historyBefore,
            historyAfter,
            addedMessages: 2,
            totalHistoryMessages: historyAfter,
            userMessageHasImage: Array.isArray(userMessage.content) && userMessage.content.some(c => c.type === 'image_url' || c.image_url),
            assistantMessageLength: pageMarkdown.length
          });
          
          // Process markdown (extract metadata, clean, etc.) - same logic as main loop
          let cleanMarkdown = String(pageMarkdown).trim();
          
          // Extract document information from page if present and we're still looking for it
          // Format: Now in JSON metadata field (same as main loop)
          let metadataFound = false;
          if (shouldExtractMetadata && pageMetadata) {
            const currentMetadata = { title: documentTitle, author: documentAuthor, date: documentPublishDate };
            const metadataUpdates = extractMetadataFromPage(pageMetadata, pageNum, currentMetadata, data);
            
            // Apply updates to document metadata
            if (metadataUpdates.title) {
              documentTitle = metadataUpdates.title;
            }
            if (metadataUpdates.author) {
              documentAuthor = metadataUpdates.author;
            }
            if (metadataUpdates.date) {
              documentPublishDate = metadataUpdates.date;
            }
            
            // Track consecutive pages with empty information
            if (metadataUpdates.allEmpty) {
              consecutiveEmptyMetadataPages++;
              log(`Page ${pageNum} returned empty document information, consecutive empty pages: ${consecutiveEmptyMetadataPages}`, {
                pageNum,
                consecutiveEmptyMetadataPages,
                maxEmpty: MAX_EMPTY_METADATA_PAGES
              });
            } else {
              consecutiveEmptyMetadataPages = 0;
            }
            
            log(`Document information extraction status after page ${pageNum}`, {
              pageNum,
              title: documentTitle,
              author: documentAuthor,
              date: documentPublishDate,
              foundAnyMetadata: metadataUpdates.foundAny,
              consecutiveEmptyMetadataPages,
              stillNeedsMetadata: needsMetadata(pageNum + 1)
            });
            metadataFound = true;
          }
          
          // Legacy: Extract metadata if needed (old format METADATA: - for backward compatibility)
          if (shouldExtractMetadata && !metadataFound && cleanMarkdown.startsWith('METADATA:')) {
            try {
              const metadataMatch = cleanMarkdown.match(/^METADATA:({[^}]+})\s*\n\s*\n/s);
              if (metadataMatch && metadataMatch[1]) {
                try {
                  const extractedMetadata = JSON.parse(metadataMatch[1]);
                  
                  // Use extractMetadataFromPage for legacy format too
                  const currentMetadata = { title: documentTitle, author: documentAuthor, date: documentPublishDate };
                  const metadataUpdates = extractMetadataFromPage(extractedMetadata, pageNum, currentMetadata, data);
                  
                  // Apply updates to document metadata
                  if (metadataUpdates.title) {
                    documentTitle = metadataUpdates.title;
                  }
                  if (metadataUpdates.author) {
                    documentAuthor = metadataUpdates.author;
                  }
                  if (metadataUpdates.date) {
                    documentPublishDate = metadataUpdates.date;
                  }
                  
                  // Track consecutive pages with empty information
                  if (metadataUpdates.allEmpty) {
                    consecutiveEmptyMetadataPages++;
                    log(`Page ${pageNum} returned empty document information, consecutive empty pages: ${consecutiveEmptyMetadataPages}`, {
                      pageNum,
                      consecutiveEmptyMetadataPages,
                      maxEmpty: MAX_EMPTY_METADATA_PAGES
                    });
                  } else {
                    consecutiveEmptyMetadataPages = 0;
                  }
                  
                  log(`Document information extraction status after page ${pageNum} (legacy format)`, {
                    pageNum,
                    title: documentTitle,
                    author: documentAuthor,
                    date: documentPublishDate,
                    foundAnyMetadata: metadataUpdates.foundAny,
                    consecutiveEmptyMetadataPages,
                    stillNeedsMetadata: needsMetadata(pageNum + 1)
                  });
                  metadataFound = true;
                } catch (parseError) {
                  logWarn(`Failed to parse document information JSON from page ${pageNum}`, { error: parseError.message, pageNum });
                  consecutiveEmptyMetadataPages++;
                }
              } else {
                // METADATA: prefix found but format is incorrect
                logWarn(`Page ${pageNum}: METADATA prefix found but format is incorrect`, { pageNum });
                consecutiveEmptyMetadataPages++;
              }
            } catch (e) {
              logWarn(`Failed to extract document information from page ${pageNum}`, { error: e.message, pageNum });
              consecutiveEmptyMetadataPages++;
            }
          }
          
          if (shouldExtractMetadata && !metadataFound) {
            // LLM was asked to provide document information but didn't return it
            consecutiveEmptyMetadataPages++;
          }
          
          // Clean markdown using shared function
          cleanMarkdown = cleanMarkdownText(cleanMarkdown);
          
          // cleanMarkdown is already the text from pageData.text - use it as-is
          // No need to check if it's JSON - if it starts with '{', it's just text content (e.g., code examples)
          
          // Collect markdown with merge instruction
          allMarkdownParts.push({
            pageNum: pageNum,
            markdown: cleanMarkdown.trim(),
            length: cleanMarkdown.trim().length,
            mergeWithPrevious: mergeInstruction // Store merge instruction for later use
          });
          processedPages.push(pageNum);
          
          // Mark page as processed successfully
          pageProcessed = true;
          
          log(`[ClipAIble PDF Processing] === PAGE PROCESSING COMPLETE ===`, {
            retryAttempt,
            retries: retryAttempt,
            pageNum,
            input: {
              imageSize: imageDataToUse.length,
              originalImageSize: pageImage.imageData.length,
              width: pageImage.width,
              height: pageImage.height
            },
            output: {
              markdownLength: cleanMarkdown.trim().length,
              markdownPreview: cleanMarkdown.substring(0, 200) + '...',
              extractedMetadata: isFirstPage ? { title: documentTitle, author: documentAuthor, date: documentPublishDate } : undefined
            },
            metadata: {
              title: documentTitle,
              author: documentAuthor,
              date: documentPublishDate
            },
            totalProcessed: processedPages.length,
            timestamp: Date.now()
          });
          
          log(`Page ${pageNum} processed successfully (capture+LLM)`, {
            markdownLength: cleanMarkdown.trim().length,
            totalProcessed: processedPages.length,
            extractedMetadata: isFirstPage ? { title: documentTitle, author: documentAuthor, date: documentPublishDate } : undefined
          });
          
        } catch (error) {
          // Store error for retry logic
          lastPageError = error;
          
          logError(`Failed to process page ${pageNum} with LLM`, {
            pageNum,
            retryAttempt,
            maxRetries: MAX_AI_PAGE_RETRIES,
            willRetry: retryAttempt < MAX_AI_PAGE_RETRIES,
            error: error.message,
            errorName: error.name,
            stack: error.stack
          });
          
          // If this was the last retry attempt, add to errors
          if (retryAttempt >= MAX_AI_PAGE_RETRIES) {
            const errorInfo = {
              pageNum,
              error: error.message,
              errorName: error.name,
              stack: error.stack,
              retries: retryAttempt,
              timestamp: Date.now()
            };
            pageErrors.set(pageNum, errorInfo);
            failedPages.push(pageNum);
          }
          // Otherwise, continue to next retry
        }
      } // End of retry loop
      } // End of if (pageImage)
    }
    
    // Mark that we've already processed all pages - skip main LLM processing loop
  } else {
    // For remote PDFs: Check if pages were already rendered successfully
    const alreadyRenderedCount = pageImages.filter(img => img !== null && img !== undefined).length;
    const allPagesRendered = alreadyRenderedCount === numPages;
    
    if (!allPagesRendered) {
      // For remote PDFs: Fetch and render in parallel ONLY if not all pages were rendered
      // Use unified function to get PDF data with fallback strategies
      if (!pdfData) {
        pdfData = await getPdfDataWithFallback(cleanPdfUrl, null);
      }
      
      // Render all pages in parallel using offscreen render
      log('[ClipAIble PDF Processing] Starting parallel rendering', {
        numPages,
        alreadyRenderedCount,
        missingPages: numPages - alreadyRenderedCount
      });
    
    const renderPromises = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      renderPromises.push(
        renderPdfPageImage(cleanPdfUrl, pageNum, 2.0, pdfData)
          .then(pageImage => {
            // CRITICAL: Use full imageData (with prefix) instead of extracting base64
            // imageData already has full data URL like "data:image/png;base64,..."
            const finalImageData = pageImage.imageData || (pageImage.base64 ? `data:image/png;base64,${pageImage.base64}` : null);
            
            if (!finalImageData) {
              pageImages[pageNum - 1] = null;
              return { pageNum, success: false, error: 'No imageData or base64 available' };
            }
            
            pageImages[pageNum - 1] = {
              imageData: finalImageData, // Use full data URL, not just base64
              width: pageImage.width,
              height: pageImage.height
            };
            
            return { pageNum, success: true };
          })
          .catch(error => {
            pageImages[pageNum - 1] = null;
            return { pageNum, success: false, error: error.message };
          })
      );
    }
    
      // Wait for all pages to render in parallel
      await Promise.all(renderPromises);
      
      log('[ClipAIble PDF Processing] Parallel rendering complete', {
        numPages,
        successfulPages: pageImages.filter(img => img !== null).length,
        failedPages: pageImages.filter(img => img === null).length
      });
    } else {
      log('[ClipAIble PDF Processing] Skipping parallel rendering - all pages already rendered', {
        numPages,
        alreadyRenderedCount
      });
    }
      
      // CRITICAL: All pages extracted in parallel - now ready for LLM processing
      const renderedCount = pageImages.filter(img => img !== null).length;
      log(`Parallel extraction complete: ${renderedCount}/${numPages} pages ready for LLM processing`);
      
      // Check if we already processed all pages in fallback (sequential capture+process mode)
      const alreadyProcessedAll = processedPages.length > 0 && processedPages.length + failedPages.length === numPages;
      
      if (alreadyProcessedAll) {
        log(`All pages already processed in sequential mode, skipping main LLM loop`, {
          processed: processedPages.length,
          failed: failedPages.length,
          total: numPages
        });
      } else {
        // Now process all captured pages with LLM (no more tab switching!)
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        await checkCancellation(`PDF AI processing page ${pageNum}`);

        // Check if we still need to search for metadata
        const shouldExtractMetadata = needsMetadata(pageNum);

        log(`Processing page ${pageNum}/${numPages} with AI (from captured image)`, {
          historyLength: messageHistory.length,
          processedCount: processedPages.length,
          failedCount: failedPages.length,
          shouldExtractMetadata,
          currentMetadata: { title: documentTitle, author: documentAuthor, date: documentPublishDate },
          hasCapturedImage: pageImages[pageNum - 1] !== null
        });

        // Get pre-captured page image (no tab switching needed!)
        const pageImage = pageImages[pageNum - 1];
        
        if (pageImage === null || pageImage === undefined) {
          failedPages.push(pageNum);
          logWarn(`Page ${pageNum}: No captured image available, skipping`, { pageNum });
          continue;
        }

        // Retry logic for AI page processing
        const MAX_AI_PAGE_RETRIES = 4;
        const AI_PAGE_RETRY_DELAYS = [2000, 5000, 10000, 20000]; // 2s, 5s, 10s, 20s
        let pageProcessed = false;
        let lastPageError = null;
        
        for (let retryAttempt = 0; retryAttempt <= MAX_AI_PAGE_RETRIES && !pageProcessed; retryAttempt++) {
          if (retryAttempt > 0) {
            logWarn(`[ClipAIble PDF Processing] Retrying AI processing for page`, {
              pageNum,
              retryAttempt,
              maxRetries: MAX_AI_PAGE_RETRIES,
              lastError: lastPageError?.message,
              delay: AI_PAGE_RETRY_DELAYS[retryAttempt - 1],
              timestamp: Date.now()
            });
            await new Promise(resolve => setTimeout(resolve, AI_PAGE_RETRY_DELAYS[retryAttempt - 1]));
            await checkCancellation(`PDF AI processing page ${pageNum} (retry ${retryAttempt})`);
          }

        // Update progress (30-40% for LLM processing)
        const pageProgress = 30 + (pageNum / numPages) * 10; // 30-40%
        updateState({ progress: Math.round(pageProgress), status: `Processing page ${pageNum}/${numPages} with AI...` });

        try {
          // CRITICAL: Verify imageData has prefix before using it
          let imageDataToUse = pageImage.imageData;
          if (!imageDataToUse) {
            logError(`Page ${pageNum}: imageData is null or undefined`, { pageNum, pageImageKeys: Object.keys(pageImage || {}) });
            failedPages.push(pageNum);
            continue;
          }
          
          // If imageData doesn't have prefix, add it (should not happen, but safety check)
          if (!imageDataToUse.startsWith('data:image/')) {
            logWarn(`Page ${pageNum}: imageData missing prefix, adding it`, {
              pageNum,
              imageDataLength: imageDataToUse.length,
              imageDataStart: imageDataToUse.substring(0, 50),
              note: 'This should not happen - imageData should have prefix from renderAllPdfPages'
            });
            imageDataToUse = `data:image/png;base64,${imageDataToUse}`;
          }
          
          log(`PDF page ${pageNum} using pre-captured image`, {
            pageNum,
            imageSize: imageDataToUse.length,
            width: pageImage.width,
            height: pageImage.height
          });
          
          // Send to LLM with image
          const isFirstPage = pageNum === 1;
          const userPrompt = buildPdfPageUserPrompt(imageDataToUse, pageNum, numPages, isFirstPage, shouldExtractMetadata);
          
          // CRITICAL: Log full prompts before sending to AI - FULL TEXT
          log(`=== PAGE ${pageNum}: FULL PROMPTS BEFORE SENDING TO AI ===`, {
            pageNum,
            model,
            systemPromptFull: PDF_TO_MARKDOWN_SYSTEM_PROMPT,
            systemPromptLength: PDF_TO_MARKDOWN_SYSTEM_PROMPT.length,
            userPromptFull: userPrompt,
            userPromptLength: userPrompt.length,
            imageSize: imageDataToUse.length,
            originalImageSize: pageImage.imageData.length,
            width: pageImage.width,
            height: pageImage.height,
            historyMessages: messageHistory.length,
            shouldExtractMetadata,
            isFirstPage,
            hasPrefix: imageDataToUse.startsWith('data:image/')
          });
          
          log(`Sending page ${pageNum} image to LLM with history`, {
            model,
            imageSize: imageDataToUse.length,
            originalImageSize: pageImage.imageData.length,
            width: pageImage.width,
            height: pageImage.height,
            historyMessages: messageHistory.length,
            shouldExtractMetadata,
            isFirstPage,
            hasPrefix: imageDataToUse.startsWith('data:image/')
          });
          
          // Send image to selected LLM with conversation history
          // This maintains context across pages for consistent heading hierarchy
          // LLM will see: system prompt → page 1 (image + prompt) → response → page 2 (image + prompt) → response → ...
          // LLM returns JSON with text and merge instruction
          const { result: pageResponse, assistantMessage, userMessage } = await callWithRetry(
            () => callAIWithImageAndHistory(
              PDF_TO_MARKDOWN_SYSTEM_PROMPT,
              userPrompt,
              imageDataToUse, // Use corrected imageData with prefix
              messageHistory,
              apiKey,
              model,
              true // jsonResponse = true - expect JSON with text and mergeWithPrevious
            ),
            {
              maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
              delays: CONFIG.RETRY_DELAYS,
              retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES
            }
          );
          
          // When jsonResponse=true, callAIWithImageAndHistory returns parsed JSON object, not AIResponse
          // The object can have structure { text: string, mergeWithPrevious: boolean, ... }
          /** @type {any} */ const pageResponseAny = pageResponse;
          
          // CRITICAL: Log raw response immediately after receiving it - FULL TEXT
          log(`=== PAGE ${pageNum}: RAW LLM RESPONSE (FULL) ===`, {
            pageNum,
            responseType: typeof pageResponseAny,
            isString: typeof pageResponseAny === 'string',
            isObject: typeof pageResponseAny === 'object' && pageResponseAny !== null,
            isNull: pageResponseAny === null,
            isUndefined: pageResponseAny === undefined,
            responseKeys: typeof pageResponseAny === 'object' && pageResponseAny !== null ? Object.keys(pageResponseAny) : null,
            hasText: typeof pageResponseAny === 'object' && pageResponseAny !== null ? 'text' in pageResponseAny : false,
            textExists: typeof pageResponseAny === 'object' && pageResponseAny !== null ? 'text' in pageResponseAny : false,
            // FULL TEXT - NO TRUNCATION
            responseFull: typeof pageResponseAny === 'string' 
              ? pageResponseAny
              : (typeof pageResponseAny === 'object' && pageResponseAny !== null 
                  ? JSON.stringify(pageResponseAny, null, 2)
                  : String(pageResponseAny)),
            textValueFull: typeof pageResponseAny === 'object' && pageResponseAny !== null && 'text' in pageResponseAny
              ? (typeof pageResponseAny.text === 'string' 
                  ? pageResponseAny.text
                  : JSON.stringify(pageResponseAny.text))
              : null,
            textType: typeof pageResponseAny === 'object' && pageResponseAny !== null && 'text' in pageResponseAny
              ? typeof pageResponseAny.text
              : null,
            textIsEmptyString: typeof pageResponseAny === 'object' && pageResponseAny !== null && 'text' in pageResponseAny && typeof pageResponseAny.text === 'string'
              ? pageResponseAny.text === ''
              : null,
            textLength: typeof pageResponseAny === 'object' && pageResponseAny !== null && 'text' in pageResponseAny && typeof pageResponseAny.text === 'string'
              ? pageResponseAny.text.length
              : null,
            textIsJson: typeof pageResponseAny === 'object' && pageResponseAny !== null && typeof pageResponseAny.text === 'string' 
              ? (pageResponseAny.text.trim().startsWith('{') && pageResponseAny.text.includes('"text"'))
              : false
          });
          
          // Parse JSON response using shared function
          // Log raw response for debugging before parsing
          log(`Page ${pageNum}: Parsing LLM response`, {
            pageNum,
            responseType: typeof pageResponseAny,
            isString: typeof pageResponseAny === 'string',
            isObject: typeof pageResponseAny === 'object' && pageResponseAny !== null,
            responsePreview: typeof pageResponseAny === 'string' 
              ? pageResponseAny.substring(0, 500) 
              : JSON.stringify(pageResponseAny).substring(0, 500)
          });
          
          const pageData = parseLLMResponse(pageResponseAny, pageNum);
          
          // CRITICAL: Log parsed result for debugging - FULL TEXT
          log(`=== PAGE ${pageNum}: PARSED LLM RESPONSE (FULL) ===`, {
            pageNum,
            hasText: !!pageData.text,
            textType: typeof pageData.text,
            textLength: pageData.text?.length,
            // FULL TEXT - NO TRUNCATION
            textFull: typeof pageData.text === 'string' ? pageData.text : JSON.stringify(pageData.text),
            textFirstChars: typeof pageData.text === 'string' ? pageData.text.substring(0, 200) : null,
            textLastChars: typeof pageData.text === 'string' && pageData.text.length > 200 ? pageData.text.substring(pageData.text.length - 200) : null,
            isEmpty: typeof pageData.text === 'string' ? pageData.text.trim().length === 0 : true,
            hasMergeWithPrevious: !!pageData.mergeWithPrevious,
            mergeWithPrevious: pageData.mergeWithPrevious,
            hasMetadata: !!pageData.metadata,
            metadataFull: pageData.metadata || null
          });
          
          let pageMarkdown = pageData.text;
          
          // CRITICAL: Log pageMarkdown immediately after assignment - FULL TEXT
          log(`=== PAGE ${pageNum}: PAGEMARKDOWN ASSIGNED (FULL) ===`, {
            pageNum,
            pageMarkdownType: typeof pageMarkdown,
            pageMarkdownLength: typeof pageMarkdown === 'string' ? pageMarkdown.length : null,
            // FULL TEXT - NO TRUNCATION
            pageMarkdownFull: typeof pageMarkdown === 'string' ? pageMarkdown : JSON.stringify(pageMarkdown),
            pageMarkdownFirstChars: typeof pageMarkdown === 'string' ? pageMarkdown.substring(0, 200) : null,
            pageMarkdownLastChars: typeof pageMarkdown === 'string' && pageMarkdown.length > 200 ? pageMarkdown.substring(pageMarkdown.length - 200) : null,
            isObject: typeof pageMarkdown === 'object' && pageMarkdown !== null,
            isString: typeof pageMarkdown === 'string'
          });
          const mergeInstruction = pageData.mergeWithPrevious;
          const pageMetadata = pageData.metadata || { title: '', author: '', date: '' };
          
          // pageMarkdown is already the text from pageData.text - use it as-is
          // No need to check if it's JSON - if it starts with '{', it's just text content (e.g., code examples)
          
          // Log the parsed response for debugging
          const responsePreview = String(pageMarkdown).substring(0, 500).replace(/\n/g, '\\n') + (pageMarkdown.length > 500 ? '...' : '');
          const responseFirstLines = String(pageMarkdown).split('\n').slice(0, 20).join('\\n');
          const fullResponse = String(pageMarkdown);
          const isUnclearOnly = fullResponse.trim() === '[unclear]' || fullResponse.trim() === '[illegible]';
          const isStillJson = fullResponse.trim().startsWith('{') && fullResponse.includes('"text"');
          
          log(`Parsed LLM response for page ${pageNum}`, { 
            pageNum,
            responsePreview,
            responseFirstLines,
            responseLength: pageMarkdown.length,
            isStillJson,
            mergeWithPrevious: mergeInstruction,
            hasMetadata: shouldExtractMetadata && (pageMetadata.title || pageMetadata.author || pageMetadata.date),
            metadata: pageMetadata,
            firstHeading: pageMarkdown.match(/^#+\s+(.+?)(?:\n|$)/m)?.[1],
            headings: [...pageMarkdown.matchAll(/^#+\s+(.+?)(?:\n|$)/gm)].map(m => ({ level: m[0].match(/^#+/)[0].length, text: m[1].trim() })),
            isUnclearOnly
          });
          
          // Note: isStillJson is only for logging/diagnostics - we don't modify pageMarkdown
          // If text starts with '{', it's just text content (e.g., code examples), not JSON to extract
          
          // CRITICAL LOG for pages that return only [unclear] - need to debug why
          if (isUnclearOnly) {
            criticalLog(`PDF PAGE ${pageNum} RETURNED ONLY [unclear] - DEBUGGING`, `PDF_PAGE_${pageNum}_UNCLEAR_ONLY`, {
              pageNum,
              totalPages: numPages,
              imageSize: imageDataToUse.length,
              originalImageSize: pageImage.imageData.length,
              imageWidth: pageImage.width,
              imageHeight: pageImage.height,
              imageDataStart: imageDataToUse.substring(0, 100),
              imageDataEnd: imageDataToUse.substring(imageDataToUse.length - 100),
              isPng: imageDataToUse.startsWith('data:image/png'),
              hasPrefix: imageDataToUse.startsWith('data:image/'),
              fullLLMResponsePreview: fullResponse.substring(0, 500) + (fullResponse.length > 500 ? '...' : ''),
              historyLength: messageHistory.length,
              model,
              shouldExtractMetadata,
              userPromptPreview: userPrompt.substring(0, 500)
            });
          }
          
          // Log response summary (truncated to avoid huge logs)
          criticalLog(`PDF PAGE ${pageNum} LLM RESPONSE SUMMARY`, `PDF_PAGE_${pageNum}_RESPONSE_SUMMARY`, {
            pageNum,
            totalPages: numPages,
            responseLength: fullResponse.length,
            responsePreview: fullResponse.substring(0, 500) + (fullResponse.length > 500 ? '...' : ''),
            imageSize: imageDataToUse.length,
            originalImageSize: pageImage.imageData.length,
            imageWidth: pageImage.width,
            imageHeight: pageImage.height,
            hasPrefix: imageDataToUse.startsWith('data:image/')
          });
          
          // Add user message (with image) and assistant response to history for next page
          // This way LLM sees the full conversation: previous pages with images + responses
          // IMPORTANT: Use pageMarkdown (extracted text) instead of assistantMessage (raw JSON)
          // This ensures LLM sees only the text content, not the JSON structure
          messageHistory.push(
            userMessage, // Full user message with image
            { role: 'assistant', content: pageMarkdown } // Assistant response - only text, not JSON
          );
          
          // Collect markdown text from this page
          // Result is parsed from JSON with text and merge instruction
          if (pageMarkdown && typeof pageMarkdown === 'string' && pageMarkdown.trim()) {
        let cleanMarkdown = pageMarkdown.trim();
        
        // Extract document information from page if present and we're still looking for it
        // Format: Now in JSON metadata field
        if (shouldExtractMetadata && pageMetadata) {
          const currentMetadata = { title: documentTitle, author: documentAuthor, date: documentPublishDate };
          const metadataUpdates = extractMetadataFromPage(pageMetadata, pageNum, currentMetadata, data);
          
          // Apply updates to document metadata
          if (metadataUpdates.title) {
            documentTitle = metadataUpdates.title;
          }
          if (metadataUpdates.author) {
            documentAuthor = metadataUpdates.author;
          }
          if (metadataUpdates.date) {
            documentPublishDate = metadataUpdates.date;
          }
          
          // Track consecutive pages with empty information
          if (metadataUpdates.allEmpty) {
            consecutiveEmptyMetadataPages++;
            log(`Page ${pageNum} returned empty document information, consecutive empty pages: ${consecutiveEmptyMetadataPages}`, {
              pageNum,
              consecutiveEmptyMetadataPages,
              maxEmpty: MAX_EMPTY_METADATA_PAGES
            });
          } else {
            consecutiveEmptyMetadataPages = 0;
          }
          
          log(`Document information extraction status after page ${pageNum}`, {
            pageNum,
            title: documentTitle,
            author: documentAuthor,
            date: documentPublishDate,
            foundAnyMetadata: metadataUpdates.foundAny,
            consecutiveEmptyMetadataPages,
            stillNeedsMetadata: needsMetadata(pageNum + 1)
          });
        }
        
        // Clean markdown using shared function
        cleanMarkdown = cleanMarkdownText(cleanMarkdown);
        
        // cleanMarkdown is already the text from pageData.text - use it as-is
        // No need to check if it's JSON - if it starts with '{', it's just text content (e.g., code examples)
        
        // Extract key information from markdown for debugging structure issues
        const headings = [...cleanMarkdown.matchAll(/^#+\s+(.+?)(?:\n|$)/gm)].map(m => ({
          level: m[0].match(/^#+/)[0].length,
          text: m[1].trim().substring(0, 150) // First 150 chars of heading
        }));
        const firstParagraph = cleanMarkdown.split('\n\n').find(p => {
          const trimmed = p.trim();
          return trimmed && 
                 !trimmed.startsWith('#') && 
                 !trimmed.startsWith('METADATA:') && 
                 !trimmed.startsWith('**') &&
                 !trimmed.startsWith('*') &&
                 trimmed.length > 50;
        });
        const firstParagraphPreview = firstParagraph ? firstParagraph.trim().substring(0, 300) : 'no paragraph found';
        
        allMarkdownParts.push({
          pageNum: pageNum,
          markdown: cleanMarkdown.trim(),
          length: cleanMarkdown.trim().length,
          mergeWithPrevious: mergeInstruction // Store merge instruction for later use
        });
        processedPages.push(pageNum);
        
        // Mark page as processed successfully
        pageProcessed = true;
        
        log(`Page ${pageNum} processed successfully`, {
          retryAttempt,
          retries: retryAttempt,
          markdownLength: cleanMarkdown.trim().length,
          totalProcessed: processedPages.length,
          headingsCount: headings.length,
          headings: headings,
          firstParagraphPreview: firstParagraphPreview,
          extractedMetadata: isFirstPage ? { title: documentTitle, author: documentAuthor, date: documentPublishDate } : undefined
        });
      } else {
        // Invalid result - treat as error and retry
        lastPageError = new Error(`AI returned invalid or empty result: ${typeof pageMarkdown}, length: ${pageMarkdown?.length}`);
        logWarn(`Page ${pageNum}: AI returned invalid or empty result`, { 
          retryAttempt,
          maxRetries: MAX_AI_PAGE_RETRIES,
          willRetry: retryAttempt < MAX_AI_PAGE_RETRIES,
          type: typeof pageMarkdown,
          length: pageMarkdown?.length,
          failedPages: failedPages.length
        });
        
        // If this was the last retry attempt, add to errors
        if (retryAttempt >= MAX_AI_PAGE_RETRIES) {
          failedPages.push(pageNum);
        }
        // Otherwise, continue to next retry
      }
      
    } catch (error) {
      // Store detailed error information for analysis
      lastPageError = error;
      
      logError(`Failed to process page ${pageNum} with AI`, {
        pageNum,
        retryAttempt,
        maxRetries: MAX_AI_PAGE_RETRIES,
        willRetry: retryAttempt < MAX_AI_PAGE_RETRIES,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        failedPages: failedPages.length
      });
      
      // If this was the last retry attempt, add to errors
      if (retryAttempt >= MAX_AI_PAGE_RETRIES) {
        const errorInfo = {
          pageNum,
          error: error.message,
          errorName: error.name,
          stack: error.stack,
          retries: retryAttempt,
          timestamp: Date.now()
        };
        pageErrors.set(pageNum, errorInfo);
        failedPages.push(pageNum);
      }
      // Otherwise, continue to next retry
    } // End of retry loop
    } // End of for pageNum loop
      } // End of else (alreadyProcessedAll check)
      } // End of if (alreadyProcessedAll)
  } // End of else (isLocalFile check)
  
  // Log processing summary with detailed error information
  const errorSummary = {
    total: failedPages.length,
    byType: {},
    details: []
  };
  
  // Aggregate errors by type for better diagnostics
  failedPages.forEach(pageNum => {
    const errorInfo = pageErrors.get(pageNum);
    if (errorInfo) {
      const errorType = errorInfo.error.split(':')[0] || 'Unknown';
      errorSummary.byType[errorType] = (errorSummary.byType[errorType] || 0) + 1;
      errorSummary.details.push({
        pageNum,
        error: errorInfo.error,
        errorName: errorInfo.errorName
      });
    }
  });
  
  log('PDF pages processing summary', {
    totalPages: numPages,
    processed: processedPages.length,
    failed: failedPages.length,
    processedPages: processedPages,
    failedPages: failedPages.length > 0 ? failedPages : undefined,
    errorSummary: failedPages.length > 0 ? errorSummary : undefined
  });
  
  if (processedPages.length === 0) {
    const uiLang = await getUILanguageCached();
    const errorDetails = errorSummary.details.length > 0 
      ? ` Errors: ${errorSummary.details.map(e => `Page ${e.pageNum}: ${e.error}`).join('; ')}`
      : '';
    throw new Error((tSync('errorPdfNoContent', uiLang) || 'No pages were successfully processed') + errorDetails);
  }
  
  if (failedPages.length > 0) {
    const successRate = ((processedPages.length / numPages) * 100).toFixed(1);
    logWarn(`Some pages failed to process`, {
      failedPages: failedPages,
      totalFailed: failedPages.length,
      totalPages: numPages,
      successRate: `${successRate}%`,
      errorSummary
    });
  }
  
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
    throw new Error(tSync('errorPdfNoContent', uiLang) || 'No content extracted from PDF');
  }
  
  // Extract title from first H1 heading (if exists) and remove it from markdown
  // CRITICAL: If title was extracted from metadata, we MUST remove the duplicate H1 from markdown
  // Check if title is from metadata (not default/fallback values)
  const isDefaultTitle = !documentTitle || 
                         documentTitle === 'Untitled PDF' || 
                         documentTitle === data.title ||
                         documentTitle.match(/\.pdf$/i) ||
                         documentTitle.match(/^\d+[-_]/);
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
        if (titleLower === h1Lower || 
            h1Lower.includes(titleLower) || 
            titleLower.includes(h1Lower) ||
            (h1Lower.length > titleLower.length * 0.8 && titleLower.length > h1Lower.length * 0.8)) { // At least 80% match both ways
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
              if (titleLower === h1Lower || 
                  h1Lower.includes(titleLower) || 
                  titleLower.includes(h1Lower) ||
                  (h1Lower.length > titleLower.length * 0.8 && titleLower.length > h1Lower.length * 0.8)) {
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
  
  // NOTE: PDF data is kept in IndexedDB for potential reuse
  // This allows faster processing if user processes the same PDF again
  // Old PDF data will be cleaned up automatically by clearOldPdfData() if needed
  // (can be called periodically or when storage limit is reached)
  // For immediate cleanup, use: await removePdfData(cleanPdfUrl);
  if (cleanPdfUrl && isLocalFile) {
    log('[ClipAIble PDF Processing] PDF data kept in IndexedDB for potential reuse', {
      pdfUrl: cleanPdfUrl,
      note: 'Use clearOldPdfData() for periodic cleanup if needed'
    });
  }
  
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
    if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
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
          const cells = cleanLine.split('|').map(c => c.trim());
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


