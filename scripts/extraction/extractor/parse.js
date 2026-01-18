// @ts-check
// Main DOM parser for extraction
// Converts DOM elements to content items

import { compareDomOrder, toAbsoluteUrl, normalizeImageUrl } from './dom-utils.js';
import { cleanHeadingText, stripObjMarkers, normalizeHeadingForDedup, isNumericHeading, isRealHeading } from './text-utils.js';
import { isFootnoteLink, isIcon, isExcluded, isNavigationParagraph, shouldSkipStronglyExcluded } from './filters.js';
import { extractBestImageUrl, isTrackingPixel, isDecorativeImage, getImageCaption } from './images.js';
import { getOriginalTextIfTranslated } from './translate.js';
import { isStandfirstText } from './standfirst.js';
import { pushDebugLog, incrementContentType } from './debug.js';

/**
 * Candidate element selector
 */
const CANDIDATE_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, img, figure, blockquote, pre, code, ul, ol, table';

/**
 * @typedef {import('./types.js').ContentItem} ContentItem
 * @typedef {import('./types.js').ExtractionState} ExtractionState
 * @typedef {import('./types.js').DebugInfo} DebugInfo
 */

/**
 * Collect candidate elements from main content
 * @param {Element} mainContent - Main content container
 * @returns {Element[]} - Array of candidate elements
 */
export function collectCandidateElements(mainContent) {
  return Array.from(mainContent.querySelectorAll(CANDIDATE_SELECTOR));
}

/**
 * Filter candidate elements
 * @param {Window} win - Window object
 * @param {Element[]} allElements - All candidate elements
 * @param {Object} constants - Constants for filtering
 * @param {DebugInfo|null} debugInfo - Debug info
 * @returns {Element[]} - Filtered elements
 */
export function filterCandidateElements(win, allElements, constants, debugInfo) {
  let excludedImageCount = 0;
  let excludedByType = {};
  
  const filteredElements = allElements.filter(el => {
    const tagName = el.tagName.toLowerCase();
    const isImageOrFigure = tagName === 'img' || tagName === 'figure';
    
    if (isExcluded(win, el, constants)) {
      if (isImageOrFigure) excludedImageCount++;
      else excludedByType[tagName] = (excludedByType[tagName] || 0) + 1;
      return false;
    }
    
    return true;
  });
  
  if (debugInfo) {
    debugInfo.excludedImageCount = excludedImageCount;
  }
  
  return filteredElements;
}

/**
 * Sort elements in DOM order
 * @param {Element[]} elements - Elements to sort
 * @returns {Element[]} - Sorted elements
 */
export function sortElementsInDomOrder(elements) {
  return [...elements].sort(compareDomOrder);
}

/**
 * Parse elements into content items
 * @param {Window} win - Window object
 * @param {Element[]} elements - Elements to parse
 * @param {ExtractionState} state - Extraction state
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem[]} - Content items
 */
export function parseElements(win, elements, state, constants, baseUrl) {
  const content = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    
    // Strong exclusion check (ad/sponsor patterns)
    if (shouldSkipStronglyExcluded(element)) {
      skippedCount++;
      continue;
    }
    
    // Handle by tag type
    if (tagName.match(/^h[1-6]$/)) {
      const textPreview = (element.textContent || '').trim().substring(0, 50);
      
      // Check if element is actually a real heading (not just styled text)
      const isReal = isRealHeading(element, win);
      
      if (!isReal) {
        skippedCount++;
        continue;
      }
      
      const item = handleHeading(element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'heading');
        processedCount++;
      } else {
        // Log why heading was rejected by handleHeading
        skippedCount++;
      }
    } else if (tagName === 'p') {
      const item = handleParagraph(win, element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === 'figure') {
      const item = handleFigure(win, element, state, constants, baseUrl);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'image');
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === 'img') {
      const item = handleImg(win, element, state, constants, baseUrl);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'image');
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === 'blockquote') {
      const item = handleBlockquote(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'quote');
        processedCount++;
      }
    } else if (tagName === 'pre' || tagName === 'code') {
      const item = handleCode(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'code');
        processedCount++;
      }
    } else if (tagName === 'ul' || tagName === 'ol') {
      const item = handleList(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'list');
        processedCount++;
      }
    } else if (tagName === 'table') {
      const item = handleTable(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'table');
        processedCount++;
      }
    }
  }
  
  if (state.debugInfo) {
    state.debugInfo.processedCount = processedCount;
    state.debugInfo.skippedCount = skippedCount;
  }
  
  return content;
}

/**
 * Handle heading element
 * @param {Element} element - Heading element
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @returns {ContentItem|null} - Content item or null
 */
export function handleHeading(element, state, constants) {
  // Skip if standfirst element
  if (state.standfirstElement && element === state.standfirstElement) return null;
  
  const rawText = element.textContent || '';
  const cleanedText = cleanHeadingText(rawText);
  
  // Skip if matches standfirst text
  if (isStandfirstText(cleanedText, state.standfirstText)) return null;
  
  // Skip numeric headings
  if (isNumericHeading(cleanedText)) return null;
  
  // Skip empty or too short
  if (cleanedText.length < 3) return null;
  
  // Skip if matches main title
  const normalizedHeading = normalizeHeadingForDedup(cleanedText);
  if (normalizedHeading === state.mainTitleText) return null;
  
  // Skip duplicates
  if (state.addedHeadings.has(normalizedHeading)) return null;
  
  // Skip subscription/promotional headings
  const lowerText = cleanedText.toLowerCase();
  if (lowerText.includes('subscribe') || lowerText.includes('sign up') || 
      lowerText.includes('newsletter') || lowerText.includes('promotional')) {
    return null;
  }
  
  // Skip related articles section
  const parent = element.parentElement;
  if (parent) {
    const parentClass = String(parent.className || '').toLowerCase();
    const parentId = (parent.id || '').toLowerCase();
    if (parentClass.includes('related') || parentId.includes('related')) {
      return null;
    }
  }
  
  // Add to seen headings
  state.addedHeadings.add(normalizedHeading);
  
  const level = parseInt(element.tagName.charAt(1));
  return {
    type: 'heading',
    level,
    text: cleanedText,
    id: element.id || undefined
  };
}

/**
 * Handle paragraph element
 * @param {Window} win - Window object
 * @param {Element} element - Paragraph element
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @returns {ContentItem|null} - Content item or null
 */
export function handleParagraph(win, element, state, constants) {
  // Skip if standfirst element
  if (state.standfirstElement && element === state.standfirstElement) return null;
  
  const text = (element.textContent || '').trim();
  
  // Skip if matches standfirst text
  if (isStandfirstText(text, state.standfirstText)) return null;
  
  // Skip very short paragraphs
  if (text.length < 5) return null;
  
  // Skip metadata paragraphs
  const lowerText = text.toLowerCase();
  if (lowerText.startsWith('by ') && text.length < 100) return null;
  if (lowerText.startsWith('edited by') && text.length < 100) return null;
  if (/^\d+\s+words?$/i.test(text)) return null;
  if (/^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;
  
  // Skip navigation paragraphs
  if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }
  
  // Skip newsletter/subscription content
  if (lowerText.includes('newsletter') && lowerText.includes('subscribe')) {
    return null;
  }
  
  // Skip donation content
  if (lowerText.includes('donate') && (lowerText.includes('support') || lowerText.includes('mission'))) {
    return null;
  }
  
  // Get original text if translated
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText || sanitizeParagraphHtml(element);
  
  return {
    type: 'paragraph',
    text: finalText,
    html: finalText
  };
}

/**
 * Sanitize paragraph HTML (remove event handlers, clean up)
 * @param {Element} p - Paragraph element
 * @returns {string} - Sanitized HTML
 */
export function sanitizeParagraphHtml(p) {
  // Clone to avoid modifying original
  const clone = p.cloneNode(true);
  
  // Remove event handlers
  const allElements = clone.querySelectorAll('*');
  for (const el of allElements) {
    // Remove on* attributes
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
    
    // Remove footnotes and icons
    if (isFootnoteLink(el) || isIcon(el)) {
      el.remove();
    }
  }
  
  // Clean empty elements
  const emptyElements = clone.querySelectorAll('span:empty, div:empty');
  for (const empty of emptyElements) {
    empty.remove();
  }
  
  return (/** @type {HTMLElement} */ (clone)).innerHTML.trim();
}

/**
 * Handle figure element
 * @param {Window} win - Window object
 * @param {Element} element - Figure element
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem|null} - Content item or null
 */
export function handleFigure(win, element, state, constants, baseUrl) {
  const img = element.querySelector('img');
  if (!img) return null;
  
  const src = extractBestImageUrl(/** @type {HTMLImageElement} */ (img));
  if (!src) return null;
  
  // Skip tracking pixels and decorative images
  if (isTrackingPixel(win, /** @type {HTMLImageElement} */ (img))) return null;
  if (isDecorativeImage(win, /** @type {HTMLImageElement} */ (img), constants.LOGO_PATTERNS || [])) return null;
  
  const absoluteSrc = toAbsoluteUrl(src, baseUrl);
  const normalizedSrc = normalizeImageUrl(absoluteSrc);
  
  // Skip duplicates
  if (state.processedImages.has(normalizedSrc)) return null;
  state.processedImages.add(normalizedSrc);
  
  // Get caption
  const figcaption = element.querySelector('figcaption');
  let caption = figcaption ? (figcaption.textContent || '').trim() : '';
  if (!caption) {
    caption = getImageCaption(/** @type {HTMLImageElement} */ (img));
  }
  
  return {
    type: 'image',
    src: absoluteSrc,
    alt: img.alt || '',
    caption
  };
}

/**
 * Handle img element
 * @param {Window} win - Window object
 * @param {Element} element - Image element
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem|null} - Content item or null
 */
export function handleImg(win, element, state, constants, baseUrl) {
  // Skip if inside figure (handled separately)
  if (element.closest('figure')) return null;
  
  const img = /** @type {HTMLImageElement} */ (element);
  const src = extractBestImageUrl(img);
  if (!src) return null;
  
  // Skip tracking pixels and decorative images
  if (isTrackingPixel(win, img)) return null;
  if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || [])) return null;
  
  const absoluteSrc = toAbsoluteUrl(src, baseUrl);
  const normalizedSrc = normalizeImageUrl(absoluteSrc);
  
  // Skip duplicates
  if (state.processedImages.has(normalizedSrc)) return null;
  state.processedImages.add(normalizedSrc);
  
  return {
    type: 'image',
    src: absoluteSrc,
    alt: img.alt || '',
    caption: getImageCaption(img)
  };
}

/**
 * Handle blockquote element
 * @param {Element} element - Blockquote element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleBlockquote(element) {
  const text = (element.innerHTML || '').trim();
  if (!text) return null;
  
  return {
    type: 'quote',
    text
  };
}

/**
 * Handle code element
 * @param {Element} element - Code element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleCode(element) {
  let text = '';
  
  if (element.tagName === 'PRE') {
    // Replace <br> with newlines
    const clone = element.cloneNode(true);
    const brs = (/** @type {HTMLElement} */ (clone)).querySelectorAll('br');
    for (const br of brs) {
      br.replaceWith('\n');
    }
    text = (/** @type {HTMLElement} */ (clone)).textContent || '';
  } else {
    text = (element.textContent || '').trim();
  }
  
  if (!text) return null;
  
  // Try to detect language from class
  const className = element.className || '';
  const languageMatch = className.match(/language-(\w+)/);
  const language = languageMatch ? languageMatch[1] : '';
  
  return {
    type: 'code',
    language,
    text
  };
}

/**
 * Handle list element
 * @param {Element} element - List element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleList(element) {
  const items = Array.from(element.querySelectorAll('li'))
    .map(li => (li.textContent || '').trim())
    .filter(text => text.length > 0);
  
  if (items.length === 0) return null;
  
  return {
    type: 'list',
    ordered: element.tagName === 'OL',
    items
  };
}

/**
 * Handle table element
 * @param {Element} element - Table element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleTable(element) {
  const tableText = (element.textContent || '').trim();
  if (tableText.length < 50) return null;
  
  // Clone and clean
  const clone = element.cloneNode(true);
  const allElements = (/** @type {HTMLElement} */ (clone)).querySelectorAll('*');
  for (const el of allElements) {
    el.removeAttribute('style');
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  }
  
  return {
    type: 'paragraph',
    text: (/** @type {HTMLElement} */ (clone)).outerHTML,
    html: (/** @type {HTMLElement} */ (clone)).outerHTML
  };
}

/**
 * Deduplicate headings in content array
 * @param {ContentItem[]} content - Content items
 * @returns {ContentItem[]} - Deduplicated content
 */
export function deduplicateHeadings(content) {
  const seenHeadings = new Set();
  
  return content.filter(item => {
    if (item.type !== 'heading') return true;
    
    const normalized = normalizeHeadingForDedup(item.text || '');
    if (seenHeadings.has(normalized)) return false;
    
    seenHeadings.add(normalized);
    return true;
  });
}
