// @ts-check
// HTML utilities for extraction

import { log } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { renderContentText, stripHtml } from '../utils/html/html.js';
import { decodeEntities, escapeText, tokenizeHtml } from '../utils/html/tokenizer.js';
import { collectRenderedFragmentIds } from '../generation/source-fragments.js';

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

/** @param {unknown} value @returns {unknown} */
function canonicalChunkValue(value) {
  if (Array.isArray(value)) return value.map(canonicalChunkValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalChunkValue(value[key])]));
  }
  return value;
}

function normalizedWitness(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function imageWitness(src, sourceUrl) {
  try { return '\0image:' + JSON.stringify(new URL(src, sourceUrl || undefined).href) + '\0'; }
  catch { return '\0image:' + JSON.stringify(src) + '\0'; }
}

function itemWitness(item, sourceUrl) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'image') return typeof item.src === 'string' ? imageWitness(item.src, sourceUrl) : null;
  const plain = value => typeof value === 'string' ? value : '';
  const inline = value => typeof value === 'string' ? stripHtml(value) : '';
  const text = value => value?.format === 'text' || value?.type === 'code' ? plain(value.text) : inline(value?.html ?? value?.text);
  const value = Array.isArray(item.items) ? item.items.map(sub => typeof sub === 'string' ? inline(sub) : text(sub)).join(' ') : text(item);
  return value ? value.replace(/\0/g, '\0\0') : null;
}

function htmlWitness(html, images, sourceUrl) {
  const marked = tokenizeHtml(html).map(token => {
    if (token.type === 'text') return token.raw.replace(/\0/g, '\0\0');
    if (token.type === 'tag' && !token.closing && token.name === 'img') {
      for (const name of ['src', 'data-src', 'data-original', 'data-lazy-src']) {
        const attr = token.attrs.find(attr => attr.name === name);
        const marker = attr && imageWitness(decodeEntities(attr.value), sourceUrl);
        if (marker && images.has(marker)) return ' ' + escapeText(marker) + ' ';
      }
    }
    return token.raw;
  }).join('');
  return normalizedWitness(stripHtml(marked));
}

function occursOnce(haystack, needle) {
  const first = haystack.indexOf(needle);
  return first >= 0 && haystack.indexOf(needle, first + 1) < 0;
}

function longestChunkOverlap(previous, current) {
  const prefix = new Array(current.length).fill(0);
  for (let index = 1; index < current.length; index++) {
    let matched = prefix[index - 1];
    while (matched > 0 && current[index] !== current[matched]) matched = prefix[matched - 1];
    if (current[index] === current[matched]) matched++;
    prefix[index] = matched;
  }
  let matched = 0;
  for (const key of previous) {
    while (matched > 0 && (matched === current.length || key !== current[matched])) matched = prefix[matched - 1];
    if (key === current[matched]) matched++;
  }
  return matched;
}

/**
 * Merge only a repeated suffix/prefix witnessed in the adjacent HTML overlap.
 * Independent occurrences elsewhere, ambiguous source repetitions and changed
 * rich content remain intact. Inputs are never mutated.
 * @param {Array<Array<import('../types.js').ContentItem>>} chunkContents
 * @param {Array<string>} sourceChunks
 * @param {{overlap?: number, sourceUrl?: string}} [options]
 * @returns {Array<import('../types.js').ContentItem>}
 */
export function mergeChunkContent(chunkContents, sourceChunks, { overlap = CONFIG.CHUNK_OVERLAP, sourceUrl = '' } = {}) {
  const result = [];
  const keys = chunkContents.map(content => content.map(item => JSON.stringify(canonicalChunkValue(item))));
  for (let index = 0; index < chunkContents.length; index++) {
    const current = chunkContents[index];
    let repeated = 0;
    const previousHtml = sourceChunks[index - 1] ?? '';
    const currentHtml = sourceChunks[index] ?? '';
    const sharedLength = Math.min(overlap, previousHtml.length, currentHtml.length);
    if (index > 0 && sharedLength > 0 && previousHtml.endsWith(currentHtml.slice(0, sharedLength))) {
      const count = longestChunkOverlap(keys[index - 1], keys[index]);
      if (count > 0) {
        const candidate = current.slice(0, count);
        const parts = candidate.map(item => itemWitness(item, sourceUrl));
        if (parts.every(part => part !== null)) {
          const needle = normalizedWitness(parts.join(' '));
          const images = new Set(candidate.filter(item => item.type === 'image').map(item => imageWitness(item.src, sourceUrl)));
          if (needle && occursOnce(htmlWitness(currentHtml.slice(0, sharedLength), images, sourceUrl), needle) &&
              occursOnce(htmlWitness(previousHtml, images, sourceUrl), needle) &&
              occursOnce(htmlWitness(currentHtml, images, sourceUrl), needle)) repeated = count;
        }
        // An ambiguous longest match must not fall back to a shorter coincidence.
      }
    }
    result.push(...current.slice(repeated));
  }
  return result;
}

function sourceMainHeadings(html) {
  const nonReading = new Set(['head', 'script', 'style', 'template', 'noscript', 'textarea', 'svg', 'math']);
  const literal = new Set(['pre', 'code', 'kbd', 'samp', 'xmp', 'plaintext']);
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  const headings = [];
  const seenIds = new Set(), seenNames = new Set();
  let active = null;
  for (const token of tokenizeHtml(html)) {
    const parent = stack.at(-1);
    if (token.type === 'text') {
      if (active && !parent?.suppressed) active.parts.push(token.raw);
      continue;
    }
    if (token.type !== 'tag') continue;
    if (token.closing) {
      let index = stack.length - 1;
      while (index >= 0 && stack[index].name !== token.name) index--;
      if (index < 0) continue;
      const frames = stack.slice(index);
      if (active && frames.some(frame => frame.heading === active)) {
        if (token.name === 'h1' && stack[index].heading === active && !active.invalid) {
          headings.push({ text: normalizedWitness(stripHtml(active.parts.join(''))), fragments: active.fragments });
        }
        active = null;
      } else if (active && !parent?.suppressed) active.parts.push(token.raw);
      stack.length = index;
      continue;
    }
    const attrs = new Map();
    for (const attr of token.attrs) if (!attrs.has(attr.name)) attrs.set(attr.name, decodeEntities(attr.value));
    const style = String(attrs.get('style') ?? '');
    const hidden = attrs.has('hidden') || attrs.get('aria-hidden')?.toLowerCase() === 'true' ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!\s*important)?\s*(?:;|$)/i.test(style);
    const suppressed = parent?.suppressed || nonReading.has(token.name) || hidden;
    const isLiteral = parent?.literal || literal.has(token.name);
    const inert = parent?.inert || ['script', 'style', 'template', 'noscript', 'textarea'].includes(token.name);
    if (token.name === 'plaintext' && !parent?.suppressed) break;
    if (active && /^h[1-6]$/.test(token.name)) active.invalid = true;
    let heading = null;
    if (token.name === 'h1' && !suppressed && !isLiteral) {
      if (active) active.invalid = true;
      else { heading = { parts: [], fragments: [], invalid: false }; active = heading; }
    } else if (active && !suppressed) active.parts.push(token.raw);
    const id = attrs.get('id'), name = token.name === 'a' && attrs.get('name');
    if (!inert) {
      if (active && !suppressed && !isLiteral) {
        if (id && !seenIds.has(id)) active.fragments.push({ id, named: false });
        if (name && !seenNames.has(name)) active.fragments.push({ id: name, named: true });
      }
      if (id) seenIds.add(id);
      if (name) seenNames.add(name);
    }
    if (!voidTags.has(token.name)) stack.push({ name: token.name, suppressed, literal: isLiteral, inert, heading });
  }
  return headings.map(({ text, fragments }) => ({ text, ids: [...new Set(fragments.filter(target => !target.named || !seenIds.has(target.id)).map(target => target.id))] }));
}

/**
 * Remove one witnessed article header already represented by title metadata.
 * Ambiguous source/response headings and later independent headings are kept.
 * @param {Array<import('../types.js').ContentItem>} content
 * @param {string} title
 * @param {string} sourceHtml
 * @returns {{content: Array<import('../types.js').ContentItem>, titleFragmentIds?: string[]}}
 */
export function prepareExtractedMainTitle(content, title, sourceHtml) {
  const target = normalizedWitness(String(title ?? ''));
  const source = target ? sourceMainHeadings(sourceHtml).filter(heading => heading.text === target) : [];
  if (source.length !== 1) return { content };
  const matches = content.map((item, index) => {
    if (item.type !== 'heading' || item.level !== 1) return -1;
    const value = item.format === 'text' ? item.text ?? '' : stripHtml(item.html ?? item.text ?? '');
    return normalizedWitness(value) === target ? index : -1;
  }).filter(index => index >= 0);
  if (matches.length > 1) return { content };
  const titleFragmentIds = source[0].ids;
  if (titleFragmentIds.length) {
    return { content: matches.length ? content.filter((_, index) => index !== matches[0]) : content, titleFragmentIds };
  }
  // Keep an existing emitted owner when the source has no title targets to move.
  const heading = content[matches[0]];
  if (!heading || heading.id || collectRenderedFragmentIds(renderContentText(heading)).size) return { content };
  return { content: content.filter((_, index) => index !== matches[0]) };
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







