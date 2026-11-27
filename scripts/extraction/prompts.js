// @ts-check
import { renderPrompt } from '../settings/prompt-catalog.js';

/**
 * Build user prompt for selector extraction
 * @param {string} html - Trimmed HTML
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {string} User prompt
 */
export function buildSelectorUserPrompt(html, url, title) {
  return `URL: ${url}
Title: ${title}

HTML:
${html}`;
}

/**
 * Build system prompt for multi-chunk extraction
 * @param {number} chunkIndex - Current chunk index (0-based)
 * @param {number} totalChunks - Total number of chunks
 * @returns {string} System prompt
 */
export function buildChunkSystemPrompt(chunkIndex, totalChunks, options = {}) {
  const isFirst = chunkIndex === 0;
  const isLast = chunkIndex === totalChunks - 1;
  
  return renderPrompt('extractChunk', options, {
    pagePart: chunkIndex + 1, totalParts: totalChunks,
    positionNotes: [isFirst ? 'This is the BEGINNING of the article - extract title and publication date.' : '',
      isLast ? 'This is the END of the article - extract remaining content, skip comments section.' : '',
      !isFirst && !isLast ? 'This is a MIDDLE section of the article.' : ''].filter(Boolean).join("\n"),
    metadataFields: [isFirst ? '"title": "Exact article title WITHOUT author name (if title contains author like \'Article by John\', return only \'Article\')",' : '',
      isFirst ? '"author": "Author name only, without byline prefixes. Extract it from the title when present there. If absent, return an empty string, not a placeholder.",' : '',
      isFirst ? '"publishDate": "Date in ISO format ONLY (YYYY-MM-DD, YYYY-MM, or YYYY) - MUST convert any format to ISO, or empty string if not found",' : ''].filter(Boolean).join("\n  "),
    subtitleField: [isFirst ? '{"type": "subtitle", "text": "Subtitle/standfirst text below title (if present)", "html": "<p class=\\"standfirst\\">Subtitle text</p>"},' : ''].filter(Boolean).join("\n"),
    metadataNotes: [isFirst ? 'CRITICAL - SUBTITLE EXTRACTION (first chunk only):\n- Look for introductory text (standfirst/deck/subtitle) that appears AFTER the title but BEFORE the main article content\n- This is usually a short paragraph (50-300 characters) that summarizes or introduces the article\n- Common patterns: paragraph immediately after h1, text in elements with classes like "standfirst", "subtitle", "deck", "lede", "intro"\n- If you find such text, add it as {"type": "subtitle", "text": "...", "html": "<p class=\\"standfirst\\">...</p>"} RIGHT AFTER the title heading\n- If no subtitle/standfirst exists, do NOT add a subtitle item' : '',
      isFirst ? 'For title and author (CRITICAL): If title contains author name (e.g., "Article by John"), return CLEAN title without author in "title" field and author name ONLY (without prefix) in "author" field. Common prefixes: "by", "written by", and equivalents in the article language. Examples: "How to Code by John Smith" → title="How to Code", author="John Smith". NEVER return title with author included!' : '',
      isFirst ? 'For publishDate (CRITICAL): ALWAYS return date in ISO format ONLY (YYYY-MM-DD for full date, YYYY-MM for year+month, YYYY for year only). Examples: "2016-05-03", "2025-11", "2025". Convert ANY date format to ISO before returning. Remove ALL prefixes like "First published", "Published on", "Posted", "Updated". Examples: "First published May 3, 2016" → "2016-05-03", "31st Jul 2007" → "2007-07-31", "December 2025" → "2025-12", "2025" → "2025". VALIDATION: Before returning, verify format matches YYYY-MM-DD, YYYY-MM, or YYYY (4 digits). If no date found, return empty string "".' : ''].filter(Boolean).join("\n")
  });
}

/**
 * Build user prompt for chunk extraction
 * @param {string} html - Chunk HTML
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {number} chunkIndex - Current chunk index
 * @param {number} totalChunks - Total chunks
 * @returns {string} User prompt
 */
export function buildChunkUserPrompt(html, url, title, chunkIndex, totalChunks) {
  return `Extract article content from this HTML chunk. Copy ALL text exactly as written.

Base URL: ${url}
Page title: ${title}
Chunk: ${chunkIndex + 1} of ${totalChunks}

HTML:
${html}`;
}

/**
 * Build user prompt for PDF page processing with image
 * @param {string} imageData - Base64 image data URL (not used in prompt, but kept for compatibility)
 * @param {number} pageNum - Page number (1-based)
 * @param {number} totalPages - Total number of pages
 * @param {boolean} isFirstPage - Whether this is the first page
 * @param {boolean} shouldExtractMetadata - Whether to extract metadata from this page
 * @returns {string} User prompt
 */
export function buildPdfPageUserPrompt(imageData, pageNum, totalPages, isFirstPage = false, shouldExtractMetadata = true, options = {}) {
  const mergeInstruction = isFirstPage 
    ? 'This is the FIRST page, so mergeWithPrevious should be "paragraph" (it will be ignored for the first page).'
    : renderPrompt('pdfContinuation', options);

  if (shouldExtractMetadata) {
    return renderPrompt('pdfPageMetadata', options, { pageNumber: pageNum, totalPages, joinInstructions: mergeInstruction, pagePosition: isFirstPage ? 'This is the FIRST page of the document. ' : 'This is page ' + pageNum + ' of the document. ' });
  } else {
    // Page where we don't need to extract metadata
    return renderPrompt('pdfPageBody', options, { pageNumber: pageNum, totalPages, joinInstructions: mergeInstruction });
  }
}
