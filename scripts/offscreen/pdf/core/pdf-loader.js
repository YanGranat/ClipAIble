// @ts-check
// PDF loader - handles PDF file loading and parsing

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { fetchPdfFile } from '../utils/pdf-fetcher.js';
import { parsePdfDocument } from '../utils/pdf-parser.js';
import { extractPdfMetadata } from '../utils/metadata-extractor.js';

/**
 * Load and parse PDF document
 * 
 * @param {string} url - PDF file URL (or identifier if pdfData is provided)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data as ArrayBuffer (for local files)
 * @returns {Promise<Object>} { pdf, numPages, metadata }
 */
export async function loadPdfDocument(url, pdfData = null) {
  log('[PDF v3] Loading PDF document', { url, hasPdfData: !!pdfData });
  
  // Fetch PDF file (or use provided data)
  const arrayBuffer = await fetchPdfFile(url, pdfData);
  
  // Parse PDF document
  const pdf = await parsePdfDocument(arrayBuffer);
  const numPages = pdf.numPages || 0;
  
  if (numPages === 0) {
    throw new Error('PDF has no pages.');
  }
  
  // Extract metadata
  const metadata = await extractPdfMetadata(pdf);
  
  // Extract outline (bookmarks) if available
  let outline = null;
  try {
    outline = await pdf.getOutline();
    if (outline && outline.length > 0) {
      log('[PDF v3] PDF outline extracted', { outlineItems: outline.length });
    }
  } catch (error) {
    logWarn('[PDF v3] Failed to extract PDF outline', error);
    // Continue without outline
  }
  
  log('[PDF v3] PDF document loaded', { numPages, metadata, hasOutline: !!outline });
  
  return {
    pdf,
    numPages,
    metadata,
    outline
  };
}


