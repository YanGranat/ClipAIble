// @ts-check
// PDF metadata extraction utility

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { shouldIgnoreMetadataTitle } from './title-extractor.js';
import { parsePdfDate } from './date-parser.js';
import { isAnonymousAuthor, cleanAuthor } from '../../../utils/author-validator.js';

/**
 * Extract metadata from PDF document
 * @param {{getMetadata: function(): Promise<{info?: {Title?: string, Author?: string, CreationDate?: string, ModDate?: string}}>}} pdf - PDF.js document object
 * @returns {Promise<{title: string, author: string, publishDate: string}>} Extracted metadata
 * @throws {Error} If metadata extraction timeout (10s)
 * @throws {Error} If PDF metadata retrieval fails
 */
export async function extractPdfMetadata(pdf) {
  let title = '';
  let author = '';
  let publishDate = '';
  
  try {
    // CRITICAL: Add timeout for metadata extraction (can hang on corrupted PDFs)
    const METADATA_TIMEOUT_MS = 10000; // 10 seconds
    const metadataPromise = pdf.getMetadata();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`PDF metadata extraction timeout after ${METADATA_TIMEOUT_MS / 1000} seconds`));
      }, METADATA_TIMEOUT_MS);
    });
    
    const metadata = await Promise.race([metadataPromise, timeoutPromise]);
    if (metadata && metadata.info) {
      if (metadata.info.Title) {
        const metadataTitle = metadata.info.Title.trim();
        if (!shouldIgnoreMetadataTitle(metadataTitle)) {
          title = metadataTitle;
          log('[PDF v3] Title found in metadata', { title });
        } else {
          log('[PDF v3] Metadata title ignored (empty or generic)', { metadataTitle });
          title = '';
        }
      }
      
      if (metadata.info.Author) {
        const rawAuthor = metadata.info.Author.trim();
        // CRITICAL: Filter out anonymous/invalid authors at extraction stage
        author = cleanAuthor(rawAuthor);
        if (!author && rawAuthor) {
          log('[PDF v3] Metadata author ignored (anonymous/invalid)', { rawAuthor });
        }
      }
      
      if (metadata.info.CreationDate) {
        publishDate = parsePdfDate(metadata.info.CreationDate);
      } else if (metadata.info.ModDate) {
        publishDate = parsePdfDate(metadata.info.ModDate);
      }
    }
    
    log('[PDF v3] Metadata extracted', { title, author, publishDate });
  } catch (error) {
    logWarn('[PDF v3] Failed to extract PDF metadata', error);
  }
  
  return { title, author, publishDate };
}

