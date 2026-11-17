// @ts-check
// PDF loader - handles PDF file loading and parsing

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../utils/logging.js';
import { fetchPdfFile } from '../utils/pdf-fetcher.js';
import { parsePdfDocument, releasePdfDocument } from '../utils/pdf-parser.js';
import { extractPdfMetadata } from '../utils/metadata-extractor.js';
import { createPdfError } from '../../../utils/pdf-errors.js';

/**
 * Load and parse PDF document
 * 
 * @param {string} url - PDF file URL (or identifier if pdfData is provided)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data as ArrayBuffer (for local files)
 * @returns {Promise<Object>} { pdf, numPages, metadata }
 */
export async function loadPdfDocument(url, pdfData = null, requestOptions = {}) {
  log('[PDF v3] Loading PDF document', { url, hasPdfData: !!pdfData });
  
  // Fetch PDF file (or use provided data)
  const arrayBuffer = await fetchPdfFile(url, pdfData, requestOptions);
  
  // Parse PDF document
  const pdf = await parsePdfDocument(arrayBuffer, requestOptions);
  const { signal } = requestOptions;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    rejectAbort(signal.reason);
    void releasePdfDocument(pdf);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) throw signal.reason;
    const numPages = pdf.numPages || 0;
  
    if (numPages === 0) {
      throw createPdfError('PDF has no pages.', 'errorPdfInvalid');
    }
  
    // Extract metadata
    const metadata = await Promise.race([extractPdfMetadata(pdf, { signal }), aborted]);
  
    // Extract outline (bookmarks) if available
    let outline = null;
    try {
      outline = await Promise.race([pdf.getOutline(), aborted]);
      if (outline && outline.length > 0) {
        log('[PDF v3] PDF outline extracted', { outlineItems: outline.length });
      }
    } catch (error) {
      logWarn('[PDF v3] Failed to extract PDF outline', error);
      // Continue without outline
    }
    if (signal?.aborted) throw signal.reason;
  
    log('[PDF v3] PDF document loaded', { numPages, metadata, hasOutline: !!outline });
  
    return {
      pdf,
      numPages,
      metadata,
      outline
    };
  } catch (error) {
    await releasePdfDocument(pdf);
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Release a request-owned PDF document and its worker. */
export async function destroyPdfDocument(pdf) {
  await releasePdfDocument(pdf);
}


