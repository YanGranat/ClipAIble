// @ts-check
// Fallback extraction strategies
// Handles Twitter/X articles and various fallback scenarios

import { compareDomOrder, toAbsoluteUrl, normalizeImageUrl, cloneWithoutLinkAnnouncements } from './dom-utils.js';
import { createHeadingItem, omitInitialArticleTitle } from './parse.js';
import { isExcluded, isWidget, isNavigationParagraph } from './filters.js';
import { extractBestImageUrl, isTrackingPixel, isDecorativeImage } from './images.js';
import { getOriginalTextIfTranslated } from './translate.js';
import { pushDebugLog } from './debug.js';

/**
 * @typedef {import('./types.js').ContentItem} ContentItem
 * @typedef {import('./types.js').ExtractionResult} ExtractionResult
 * @typedef {import('./types.js').ExtractionState} ExtractionState
 */

/**
 * Check if page is Twitter/X article
 * @param {string} baseUrl - Base URL
 * @param {Document} doc - Document object
 * @returns {boolean} - True if Twitter/X article page
 */
export function isTwitterXPage(baseUrl, doc) {
  const isTwitterUrl = baseUrl.includes('x.com/') || baseUrl.includes('twitter.com/');
  if (!isTwitterUrl) return false;
  
  const hasTwitterArticle = !!doc.querySelector('article[data-testid="tweet"]');
  const hasTwitterReadView = !!doc.querySelector('div[data-testid="twitterArticleReadView"]');
  
  return hasTwitterArticle || hasTwitterReadView;
}

/**
 * Find Twitter container element
 * @param {Document} doc - Document object
 * @param {Element|null} mainContent - Main content element
 * @returns {{container: Element|null, source: string}} - Container and source
 */
export function findTwitterContainer(doc, mainContent) {
  // Try specific read view first
  let container = doc.querySelector('div[data-testid="twitterArticleReadView"]');
  if (container) return { container, source: 'twitterArticleReadView' };
  
  // Try article
  const article = doc.querySelector('article[data-testid="tweet"]');
  if (article) {
    container = article.querySelector('div[data-testid="tweetText"]');
    if (container) return { container, source: 'tweetText' };
    return { container: article, source: 'tweet' };
  }
  
  // Use mainContent
  if (mainContent) {
    return { container: mainContent, source: 'mainContent' };
  }
  
  return { container: null, source: 'none' };
}

/**
 * Extract Twitter/X article content
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {ExtractionState} state - Extraction state
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem[]|null} - Content items or null if failed
 */
export function tryExtractTwitterX(win, doc, state, constants, baseUrl) {
  if (!isTwitterXPage(baseUrl, doc)) return null;
  
  const { container, source } = findTwitterContainer(doc, null);
  if (!container) return null;
  
  pushDebugLog(state.debugInfo, 'TWITTER_X_CONTAINER', { source });
  
  const content = [];
  const addedImageUrls = new Set();
  const headingElements = new Set();
  
  // Collect Draft.js blocks
  const allBlocks = container.querySelectorAll('div[data-offset-key]');
  
  // Use Map to handle duplicates
  const uniqueBlocks = new Map();
  for (const block of allBlocks) {
    const text = (block.textContent || '').trim();
    if (!text) continue;
    
    // Heading identity preserves repeated headings at distinct source positions.
    const key = block.querySelector('h1, h2, h3') || text;
    if (!uniqueBlocks.has(key) || block.children.length > (uniqueBlocks.get(key)?.children.length || 0)) {
      uniqueBlocks.set(key, block);
    }
  }
  
  const contentBlocks = Array.from(uniqueBlocks.values());
  
  // Filter out premium/analytics
  const validBlocks = contentBlocks.filter(block => {
    const text = (block.textContent || '').toLowerCase();
    if (text.includes('premium') || text.includes('/analytics') || text.includes('/i/premium')) {
      return false;
    }
    // Skip view counts
    if (/^\d+\s*(k|m|тыс|млн)?$/i.test(text)) {
      return false;
    }
    return true;
  });
  
  // Collect headings and images separately
  const headings = container.querySelectorAll('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three');
  const images = container.querySelectorAll('img');
  
  // Combine and sort by DOM order
  const allElements = [...Array.from(headings), ...Array.from(images), ...validBlocks];
  allElements.sort(compareDomOrder);
  
  // Process elements
  for (const element of allElements) {
    const tagName = element.tagName.toLowerCase();
    
    // Heading
    if (tagName.match(/^h[1-3]$/)) {
      if (headingElements.has(element)) continue;
      headingElements.add(element);
      content.push(createHeadingItem(element));
    }
    // Image
    else if (tagName === 'img') {
      // Skip if inside figure
      if (element.closest('figure')) continue;
      
      const img = /** @type {HTMLImageElement} */ (element);
      const src = extractBestImageUrl(img);
      if (!src) continue;
      
      if (isTrackingPixel(win, img)) continue;
      if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || [])) continue;
      
      const absoluteSrc = toAbsoluteUrl(src, baseUrl);
      const normalizedSrc = normalizeImageUrl(absoluteSrc);
      
      if (addedImageUrls.has(normalizedSrc)) continue;
      addedImageUrls.add(normalizedSrc);
      
      // Skip generic alt
      let alt = img.alt || '';
      if (alt.toLowerCase().includes('image')) alt = '';
      
      content.push({ type: 'image', src: absoluteSrc, alt, caption: '' });
    }
    // Draft.js block (paragraph)
    else if (element.hasAttribute('data-offset-key')) {
      const cleanedElement = cloneWithoutLinkAnnouncements(element);
      const text = (cleanedElement.textContent || '').trim();
      if (!text) continue;
      
      // Check for heading inside
      const innerHeading = element.querySelector('h1, h2, h3');
      if (innerHeading) {
        if (!headingElements.has(innerHeading)) {
          headingElements.add(innerHeading);
          content.push(createHeadingItem(innerHeading));
        }
        continue;
      }
      
      // Check for image inside
      const innerImg = element.querySelector('img');
      if (innerImg) continue; // Will be handled by image processing
      
      // Regular paragraph
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || cleanedElement.innerHTML;
      
      content.push({ type: 'paragraph', text: finalText, html: finalText });
    }
  }
  
  pushDebugLog(state.debugInfo, 'TWITTER_X_EXTRACTED', { itemCount: content.length });
  
  const result = omitInitialArticleTitle(content, state);
  return result.length > 0 ? result : null;
}

/**
 * Extract content when main content is missing
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem[]|null} - Content or null
 */
export function extractWhenMainContentMissing(win, doc, state, constants, baseUrl) {
  const fallbackArticle = doc.querySelector('article');
  const fallbackMain = doc.querySelector('main');
  const fallbackRoleMain = doc.querySelector('[role="main"]');
  
  const fallbackContent = fallbackArticle || fallbackMain || fallbackRoleMain;
  if (!fallbackContent) return null;
  
  const fallbackElements = fallbackContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, img, figure');
  const elements = Array.from(fallbackElements).slice(0, 100); // Limit for safety
  
  const content = [];
  
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName.match(/^h[1-6]$/)) {
      content.push(createHeadingItem(element));
    }
    else if (tagName === 'p') {
      const cleanedElement = cloneWithoutLinkAnnouncements(element);
      const text = (cleanedElement.textContent || '').trim();
      if (text.length < 10) continue;
      
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || cleanedElement.innerHTML;
      
      content.push({ type: 'paragraph', text: finalText, html: finalText });
    }
    else if (tagName === 'img' || tagName === 'figure') {
      const img = tagName === 'figure' 
        ? element.querySelector('img') 
        : element;
      
      if (!img) continue;
      
      const src = extractBestImageUrl(/** @type {HTMLImageElement} */ (img));
      if (!src) continue;
      
      if (isTrackingPixel(win, /** @type {HTMLImageElement} */ (img))) continue;
      if (isDecorativeImage(win, /** @type {HTMLImageElement} */ (img), constants.LOGO_PATTERNS || [])) continue;
      
      const absoluteSrc = toAbsoluteUrl(src, baseUrl);
      const normalizedSrc = normalizeImageUrl(absoluteSrc);

      if (state.processedImages.has(normalizedSrc)) continue;

      // Prevent memory leaks: limit processed images set size
      if (state.processedImages.size < 1000) {
        state.processedImages.add(normalizedSrc);
      }
      
      content.push({
        type: 'image',
        src: absoluteSrc,
        alt: (/** @type {HTMLImageElement} */ (img)).alt || '',
        caption: ''
      });
    }
  }
  
  const result = omitInitialArticleTitle(content, state);
  return result.length > 0 ? result : null;
}

/**
 * Last resort: search for best container
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @param {string} baseUrl - Base URL
 * @returns {ContentItem[]|null} - Content or null
 */
export function extractLastResortContainerSearch(win, doc, state, constants, baseUrl) {
  const allContainers = doc.querySelectorAll('div, section, article, main');
  
  let bestContainer = null;
  let maxParagraphs = 0;
  let bestTextLength = 0;
  
  for (const container of allContainers) {
    if (isExcluded(win, container, constants)) continue;
    if (isWidget(win, container)) continue;
    
    const paragraphs = container.querySelectorAll('p');
    const paragraphCount = paragraphs.length;
    const textLength = (container.textContent || '').length;
    
    if (paragraphCount > maxParagraphs || (paragraphCount === maxParagraphs && textLength > bestTextLength)) {
      maxParagraphs = paragraphCount;
      bestTextLength = textLength;
      bestContainer = container;
    }
  }
  
  if (!bestContainer || maxParagraphs < 3) return null;
  
  const content = [];
  const elements = bestContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    const cleanedElement = cloneWithoutLinkAnnouncements(element);
    const text = (cleanedElement.textContent || '').trim();
    
    if (tagName === 'p') {
      if (text.length < 10) continue;
      if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
        continue;
      }
      
      const originalText = getOriginalTextIfTranslated(element);
      const finalText = originalText || cleanedElement.innerHTML;
      
      content.push({ type: 'paragraph', text: finalText, html: finalText });
    }
    else if (tagName.match(/^h[1-6]$/)) {
      content.push(createHeadingItem(element));
    }
  }
  
  const result = omitInitialArticleTitle(content, state);
  return result.length > 0 ? result : null;
}

/**
 * Ultimate fallback: all paragraphs
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @returns {ContentItem[]|null} - Content or null
 */
export function extractUltimateFallbackAllParagraphs(win, doc, state, constants) {
  const content = [];
  const sourceElements = new Map();
  
  // Get all headings (limit 50)
  const allHeadings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let headingCount = 0;
  
  for (const heading of allHeadings) {
    if (headingCount >= 50) break;
    
    // Skip if in widget
    if (isWidget(win, heading)) continue;
    
    const item = createHeadingItem(heading);
    content.push(item);
    sourceElements.set(item, heading);
    headingCount++;
  }
  
  // Get all paragraphs (limit 500)
  const allParagraphs = doc.querySelectorAll('p');
  let paragraphCount = 0;
  
  for (const p of allParagraphs) {
    if (paragraphCount >= 500) break;
    
    if (isExcluded(win, p, constants)) continue;
    if (isWidget(win, p)) continue;
    
    const cleanedElement = cloneWithoutLinkAnnouncements(p);
    const text = (cleanedElement.textContent || '').trim();
    if (text.length < 10) continue;
    
    if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
      continue;
    }
    
    const originalText = getOriginalTextIfTranslated(p);
    const finalText = originalText || cleanedElement.innerHTML;
    
    const item = { type: 'paragraph', text: finalText, html: finalText };
    content.push(item);
    sourceElements.set(item, p);
    paragraphCount++;
  }
  
  content.sort((a, b) => compareDomOrder(sourceElements.get(a), sourceElements.get(b)));
  const result = omitInitialArticleTitle(content, state);
  return result.length > 0 ? result : null;
}

/**
 * Emergency fallback when content is still empty
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @param {Element|null} mainContent - Main content element
 * @returns {ContentItem[]|null} - Content or null
 */
export function extractEmergencyFallback(win, doc, state, constants, mainContent) {
  const content = [];
  
  // Strategy 1: Relaxed extraction from mainContent
  if (mainContent) {
    const elements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    for (const element of Array.from(elements).slice(0, 100)) {
      const tagName = element.tagName.toLowerCase();
      const cleanedElement = cloneWithoutLinkAnnouncements(element);
      const text = (cleanedElement.textContent || '').trim();
      
      if (text.length < 10) continue;
      if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
        continue;
      }
      
      if (tagName === 'p') {
        const originalText = getOriginalTextIfTranslated(element);
        content.push({ type: 'paragraph', text: originalText || text, html: originalText || cleanedElement.innerHTML });
      } else if (tagName.match(/^h[1-6]$/)) {
        content.push(createHeadingItem(element));
      }
    }
    
    if (content.length > 0) {
      const result = omitInitialArticleTitle(content, state);
      if (result.length > 0) return result;
      content.length = 0;
    }
  }
  
  // Strategy 2: article/main/role containers
  const containers = doc.querySelectorAll('article, main, [role="main"]');
  for (const container of containers) {
    const elements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    for (const element of Array.from(elements).slice(0, 100)) {
      const tagName = element.tagName.toLowerCase();
      const cleanedElement = cloneWithoutLinkAnnouncements(element);
      const text = (cleanedElement.textContent || '').trim();
      
      if (text.length < 10) continue;
      
      if (tagName === 'p') {
        const originalText = getOriginalTextIfTranslated(element);
        content.push({ type: 'paragraph', text: originalText || text, html: originalText || cleanedElement.innerHTML });
      } else if (tagName.match(/^h[1-6]$/)) {
        content.push(createHeadingItem(element));
      }
    }
    
    if (content.length > 0) {
      const result = omitInitialArticleTitle(content, state);
      if (result.length > 0) return result;
      content.length = 0;
    }
  }
  
  return null;
}
