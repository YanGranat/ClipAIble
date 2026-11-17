// @ts-check
// PDF content extraction module for ClipAIble extension
// Uses the offscreen document to extract structured PDF text and metadata.

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').ExtractionResult} ExtractionResult

import { log, logError } from '../utils/logging.js';
import { localizePdfError } from '../utils/pdf-errors.js';
import { extractPdfViaOffscreen } from '../api/pdf-offscreen.js';

/**
 * Extract content from PDF file
 * Uses offscreen document to avoid service worker limitations
 * @param {string} url - PDF file URL
 * @returns {Promise<import('../types.js').ExtractionResult>} Extracted content result
 */
export async function extractPdfContent(url, pdfData = null, cancellationOptions) {
  log('=== PDF EXTRACTION START ===', { url });
  
  try {
    // Use offscreen document for PDF extraction
    // Service worker cannot use import() or Function() due to CSP and HTML spec restrictions
    const result = await extractPdfViaOffscreen(url, pdfData, cancellationOptions);
    
    log('=== PDF EXTRACTION END ===', {
      title: result.title,
      contentItems: result.content?.length || 0
    });
    
    return result;
  } catch (error) {
    logError('PDF extraction failed', error);
    
    throw await localizePdfError(error);
  }
}
