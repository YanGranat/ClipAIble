// @ts-check
// PDF content extraction module for ClipAIble extension
// Uses offscreen document with PDF.js to extract text, images, outline, and links from PDF files

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').ExtractionResult} ExtractionResult

import { log, logError, logWarn } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { extractPdfViaOffscreen } from '../api/pdf-offscreen.js';

/**
 * Extract content from PDF file
 * Uses offscreen document to avoid service worker limitations
 * @param {string} url - PDF file URL
 * @returns {Promise<import('../types.js').ExtractionResult>} Extracted content result
 */
export async function extractPdfContent(url) {
  log('=== PDF EXTRACTION START ===', { url });
  
  try {
    // Use offscreen document for PDF extraction
    // Service worker cannot use import() or Function() due to CSP and HTML spec restrictions
    const result = await extractPdfViaOffscreen(url);
    
    log('=== PDF EXTRACTION END ===', {
      title: result.title,
      contentItems: result.content?.length || 0
    });
    
    return result;
  } catch (error) {
    logError('PDF extraction failed', error);
    
    // Check for specific error types
    if (error.message && error.message.includes('password')) {
      const uiLang = await getUILanguageCached();
      throw new Error(
        tSync('errorPdfPasswordProtected', uiLang) ||
        'This PDF is password-protected. Please unlock it first.'
      );
    }
    
    if (error.message && error.message.includes('too large')) {
      throw error; // Already has user-friendly message
    }
    
    // Check for scanned PDF (no text layer)
    if (error.message && error.message.includes('No text')) {
      const uiLang = await getUILanguageCached();
      throw new Error(
        tSync('errorPdfNoTextLayer', uiLang) ||
        'This PDF has no text layer (scanned PDF). OCR is not supported yet.'
      );
    }
    
    throw error;
  }
}
