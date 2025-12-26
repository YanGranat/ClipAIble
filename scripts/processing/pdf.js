// @ts-check
// PDF page processing module for ClipAIble extension
// Handles processing of PDF pages - extracts content using PDF.js

// @typedef {import('../types.js').ProcessingData} ProcessingData

import { log, logError } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { checkCancellation, updateProgress, getUILanguageCached } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractPdfContent } from '../extraction/pdf.js';

/**
 * Process PDF page - extract content using PDF.js
 * @param {ProcessingData} data - Processing data
 * @param {string} pdfUrl - Original PDF URL
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processPdfPage(data, pdfUrl) {
  const { url, tabId } = data;
  
  log('Processing PDF page', { pdfUrl, url, tabId });
  
  // Check if processing was cancelled before PDF processing
  await checkCancellation('PDF processing');
  
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
    
    log('PDF content extracted', { 
      title: result.title, 
      contentItems: result.content?.length || 0 
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

