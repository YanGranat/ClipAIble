// HTML utilities for extraction

import { log } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';

/**
 * Trim HTML for AI analysis - removes noise while preserving structure
 * @param {string} html - Original HTML
 * @param {number} maxLength - Maximum character length
 * @returns {string} Trimmed HTML
 */
export function trimHtmlForAnalysis(html, maxLength = CONFIG.MAX_HTML_FOR_ANALYSIS) {
  log('trimHtmlForAnalysis', { inputLength: html.length, maxLength });
  
  let trimmed = html;
  
  // Remove script content
  const scriptsRemoved = trimmed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<script></script>');
  log('Scripts removed', { before: trimmed.length, after: scriptsRemoved.length });
  trimmed = scriptsRemoved;
  
  // Remove style content
  trimmed = trimmed.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '<style></style>');
  
  // Remove comments
  trimmed = trimmed.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove SVG content
  trimmed = trimmed.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '<svg></svg>');
  
  // Trim long text content but keep structure visible
  trimmed = trimmed.replace(/>([^<]{300,})</g, (match, text) => {
    return '>' + text.substring(0, 100) + '... [content trimmed] ...' + text.substring(text.length - 50) + '<';
  });
  
  // If still too long, try to preserve structure by keeping opening tags of articles/sections
  if (trimmed.length > maxLength) {
    // Extract all article/section opening tags to show AI the full structure
    const structureTags = [];
    const structureRegex = /<(article|section|main|div)[^>]*(?:id|class)="[^"]*(?:chapter|section|part|content)[^"]*"[^>]*>/gi;
    let match;
    while ((match = structureRegex.exec(trimmed)) !== null) {
      structureTags.push(match[0]);
    }
    
    // Add structure summary at the end if we found multiple structural elements
    let structureSummary = '';
    if (structureTags.length > 2) {
      structureSummary = `\n\n<!-- PAGE STRUCTURE SUMMARY: Found ${structureTags.length} structural elements. Examples: ${structureTags.slice(0, 5).join(', ')}${structureTags.length > 5 ? '...' : ''} -->`;
      log('Structure summary added', { totalElements: structureTags.length });
    }
    
    trimmed = trimmed.substring(0, maxLength - structureSummary.length) + structureSummary + '\n... [truncated for analysis]';
  }
  
  log('trimHtmlForAnalysis result', { outputLength: trimmed.length });
  return trimmed;
}

/**
 * Split HTML into chunks for processing
 * @param {string} html - HTML to split
 * @param {number} chunkSize - Maximum chunk size
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>} Array of HTML chunks
 */
export function splitHtmlIntoChunks(html, chunkSize = CONFIG.CHUNK_SIZE, overlap = CONFIG.CHUNK_OVERLAP) {
  log('splitHtmlIntoChunks', { htmlLength: html.length, chunkSize, overlap });
  
  if (html.length <= chunkSize) {
    log('No splitting needed');
    return [html];
  }

  const chunks = [];
  let position = 0;

  while (position < html.length) {
    let end = position + chunkSize;
    
    if (end >= html.length) {
      chunks.push(html.substring(position));
      break;
    }

    // Try to break at tag boundary
    let breakPoint = html.lastIndexOf('>', end);
    if (breakPoint > position + chunkSize - 5000) {
      end = breakPoint + 1;
    } else {
      const tagBreaks = ['</p>', '</div>', '</section>', '</article>'];
      for (const tag of tagBreaks) {
        const tagPos = html.lastIndexOf(tag, end);
        if (tagPos > position + chunkSize - 10000) {
          end = tagPos + tag.length;
          break;
        }
      }
    }

    chunks.push(html.substring(position, end));
    position = end - overlap;
  }

  log('Chunks created', { count: chunks.length, sizes: chunks.map(c => c.length) });
  return chunks;
}

/**
 * Remove duplicates from extracted content
 * @param {Array} content - Content array
 * @returns {Array} Deduplicated content
 */
export function deduplicateContent(content) {
  log('deduplicateContent', { inputCount: content.length });
  
  const result = [];
  const seen = new Set();

  for (const item of content) {
    let key = item.type + ':';
    if (item.text) key += item.text.substring(0, 100).trim();
    else if (item.src) key += item.src;
    else if (item.items) key += item.items.join('|').substring(0, 100);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  log('deduplicateContent result', { outputCount: result.length, removed: content.length - result.length });
  return result;
}







