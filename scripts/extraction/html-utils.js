// @ts-check
// HTML utilities for extraction

import { log } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { stripHtml } from '../utils/html/html.js';

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
 * Extract plain text from a single sub-item (for items[].html / items[].text)
 */
function extractSubItemText(sub) {
  if (typeof sub === 'string') return sub.trim();
  if (sub && (sub.html != null || sub.text != null)) {
    const raw = sub.html ?? sub.text ?? '';
    if (typeof raw !== 'string') return '';
    if (!/<[^>]+>/.test(raw)) return raw.trim();
    return stripHtml(raw).trim();
  }
  return '';
}

/**
 * Extract plain text from content item for deduplication
 * Optimized to avoid expensive stripHtml when possible.
 * When item has items[] (selector-mode blocks), extract text from each .html/.text so
 * different sections get different keys instead of "[object Object]|...".
 */
function extractTextForDedup(item) {
  if (item.text) {
    // Fast path: if text doesn't contain HTML tags, use as-is
    if (!/<[^>]+>/.test(item.text)) {
      return item.text.trim();
    }
    // Slow path: strip HTML for items with tags
    return stripHtml(item.text).trim();
  }
  if (item.src) return item.src;
  if (Array.isArray(item.items)) {
    const parts = item.items.map(extractSubItemText).filter(Boolean);
    return parts.join('|');
  }
  return '';
}

/**
 * Remove items with identical types and normalized text, preserving first occurrence order.
 * @param {Array} content - Extracted content items
 * @param {{preserveQuoteOccurrences?: boolean}} [options] - Preserve independently owned DOM quotations
 * @returns {Array} Deduplicated content
 */
export function deduplicateContent(content, { preserveQuoteOccurrences = false } = {}) {
  log('deduplicateContent', { inputCount: content.length });
  
  const result = [];
  const seen = new Set();
  const duplicatesFound = [];

  for (const item of content) {
    const type = item.type || 'unknown';
    const sample = extractTextForDedup(item);
    
    // Skip empty items
    if (!sample) {
      continue;
    }

    if (preserveQuoteOccurrences && type === 'quote') {
      result.push(item);
      continue;
    }
    
    const key = `${type}:${sample.length}:${sample}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    } else {
      // Log duplicate for debugging (only first few to avoid log spam)
      if (duplicatesFound.length < 5) {
        duplicatesFound.push({
          type,
          textPreview: sample.substring(0, 100),
          textLength: sample.length
        });
      }
    }
  }

  const removed = content.length - result.length;
  log('deduplicateContent result', { 
    outputCount: result.length, 
    removed,
    duplicateRate: content.length > 0 ? `${Math.round((removed / content.length) * 100)}%` : '0%',
    duplicatesPreview: duplicatesFound
  });
  
  return result;
}

/**
 * Plain text from content item (for filtering).
 * @param {import('../types.js').ContentItem} item
 * @returns {string}
 */
function getItemPlainText(item) {
  if (!item) return '';
  if (item.text) {
    if (!/<[^>]+>/.test(item.text)) return item.text.trim();
    return stripHtml(item.text).trim();
  }
  return '';
}

/**
 * Remove orphan number-only headings while preserving article paragraphs.
 * @param {Array<import('../types.js').ContentItem>} content
 * @returns {Array<import('../types.js').ContentItem>}
 */
export function filterExtractionNoise(content) {
  if (!content || !content.length) return content;
  const result = [];
  let removedHeadings = 0;
  for (const item of content) {
    const type = item.type || 'unknown';
    const plain = getItemPlainText(item);
    if (type === 'heading' && plain && /^\d+$/.test(plain.replace(/\s+/g, ''))) {
      removedHeadings++;
      continue;
    }
    result.push(item);
  }
  if (removedHeadings > 0) {
    log('filterExtractionNoise', { inputCount: content.length, outputCount: result.length, removedHeadings });
  }
  return result;
}







