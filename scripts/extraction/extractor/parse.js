// @ts-check
// Main DOM parser for extraction
// Converts DOM elements to content items

import { compareDomOrder, toAbsoluteUrl, normalizeImageUrl, cloneWithoutLinkAnnouncements } from './dom-utils.js';
import { cleanHeadingText, stripObjMarkers, normalizeHeadingForDedup, isNumericHeading, isRealHeading, cleanLatexFormula } from './text-utils.js';
import { isFootnoteLink, isIcon, isExcluded, isNavigationParagraph, shouldSkipStronglyExcluded } from './filters.js';
import { extractBestImageUrl, isTrackingPixel, isDecorativeImage, getImageCaption } from './images.js';
import { getOriginalTextIfTranslated } from './translate.js';
import { isStandfirstText } from './standfirst.js';
import { pushDebugLog, incrementContentType } from './debug.js';
import { findSplitArticleBody, isOutsideArticleBody } from './discover.js';
import { CANDIDATE_SELECTOR } from './constants.js';

/**
 * Candidate element selector
 */

/**
 * @typedef {import('./types.js').ContentItem} ContentItem
 * @typedef {import('./types.js').ExtractionState} ExtractionState
 * @typedef {import('./types.js').DebugInfo} DebugInfo
 */

/**
 * Collect candidate elements from main content
 * @param {Element} mainContent - Main content container
 * @param {Window} win - Window object for hostname detection
 * @returns {Element[]} - Array of candidate elements
 */
export function collectCandidateElements(mainContent, win) {
  // Special handling for different site structures
  const hostname = win?.location?.hostname || '';
  
  // Debug log for extraction method selection


  if (hostname.includes('habr.com')) {
    // Habr has complex structure: article > ... > .article-formatted-body contains actual content
    // The rest of article contains metadata, author info, tags etc.
    const articleBody = mainContent.querySelector('.article-formatted-body');
    if (articleBody) {
      return Array.from(articleBody.querySelectorAll(CANDIDATE_SELECTOR));
    }
    // Fallback to article-body if article-formatted-body not found
    const articleBodyFallback = mainContent.querySelector('.article-body');
    if (articleBodyFallback) {
      return Array.from(articleBodyFallback.querySelectorAll(CANDIDATE_SELECTOR));
    }
  }

  // Nature/Springer journals use .c-article-body for main content
  // Structure: article > .c-article-body > .c-article-section__content (multiple)
  if (hostname.includes('nature.com') || hostname.includes('springer.com') || 
      hostname.includes('biomedcentral.com') || hostname.includes('springernature.com')) {
    const cArticleBody = mainContent.querySelector('.c-article-body');

    if (cArticleBody) {
      const text = cArticleBody.textContent?.trim() || '';
      const paragraphs = cArticleBody.querySelectorAll('p').length;
      if (text.length > 1000 && paragraphs > 5) {
        const elements = Array.from(cArticleBody.querySelectorAll(CANDIDATE_SELECTOR));

        return elements;
      }
    }
    // Fallback: look for article sections directly
    const articleSections = mainContent.querySelectorAll('.c-article-section__content');
    if (articleSections.length > 0) {
      const allElements = [];
      for (const section of articleSections) {
        allElements.push(...Array.from(section.querySelectorAll(CANDIDATE_SELECTOR)));
      }
      if (allElements.length > 10) {
        return allElements;
      }
    }
  }

  const splitBody = findSplitArticleBody(mainContent, win);
  if (splitBody) {
    const { owner, roots } = splitBody;
    const selected = new Set();
    const first = roots[0];
    const last = roots[roots.length - 1];
    const ownerSelector = 'article, [itemprop~="articleBody"], .post, .article, .entry';
    const belongsToOwner = element => {
      const closest = element.closest(ownerSelector);
      return (closest === owner || (!closest && owner === mainContent)) && !isOutsideArticleBody(element, owner);
    };
    for (const root of roots) {
      if (root.matches(CANDIDATE_SELECTOR) && belongsToOwner(root)) selected.add(root);
      for (const element of Array.from(root.querySelectorAll(CANDIDATE_SELECTOR))) {
        if (belongsToOwner(element)) selected.add(element);
      }
    }
    for (const figure of Array.from(owner.querySelectorAll('figure'))) {
      if (!belongsToOwner(figure)) continue;
      const afterFirst = first.contains(figure) || (first.compareDocumentPosition(figure) & 4) !== 0;
      const beforeLast = last.contains(figure) || (figure.compareDocumentPosition(last) & 4) !== 0;
      if (afterFirst && beforeLast) {
        selected.add(figure);
        for (const element of Array.from(figure.querySelectorAll(CANDIDATE_SELECTOR))) {
          if (belongsToOwner(element)) selected.add(element);
        }
      }
    }
    return Array.from(selected).sort(compareDomOrder);
  }

  // For WordPress sites (like fs.blog), prioritize .entry-content over entire article
  // This avoids header/sidebar/footer content that might be inside article
  const entryContent = mainContent.querySelector('.entry-content');
  if (entryContent) {
    return Array.from(entryContent.querySelectorAll(CANDIDATE_SELECTOR));
  }

  // For other sites, try to find main content container
  // Prefer containers that contain h1 matching page title
  const pageTitle = win.document.title.split(/[|–—]/)[0].trim();
  const pageTitleWords = pageTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
  
  const contentSelectors = [
    '.post-content',
    '.post__content', // Quanta Magazine
    '.post', // Slate Star Codex
    '.content',
    '.main-content',
    '.article-content', // Nautilus
    '.main-body' // Nautilus (if contains h1)
  ];

  for (const selector of contentSelectors) {
    const contentElement = mainContent.querySelector(selector);
    if (contentElement) {
      // Check if container has h1 matching page title
      const h1 = contentElement.querySelector('h1');
      if (h1) {
        const h1Text = h1.textContent?.trim() || '';
        const matchesTitle = pageTitleWords.length > 0 && 
          pageTitleWords.some(word => 
            h1Text.toLowerCase().includes(word.toLowerCase())
          );
        
        // If matches title, use this container
        if (matchesTitle) {
          return Array.from(contentElement.querySelectorAll(CANDIDATE_SELECTOR));
        }
      }
      
      // If no h1 match but container has substantial content, still use it
      // (for cases where h1 is in parent container)
      const text = contentElement.textContent?.trim() || '';
      const paragraphs = contentElement.querySelectorAll('p').length;
      if (text.length > 5000 && paragraphs > 10) {
        return Array.from(contentElement.querySelectorAll(CANDIDATE_SELECTOR));
      }
    }
  }

  // Check for article element (common semantic container for main content)
  // If multiple articles exist, find the one that contains the page title
  const allArticles = Array.from(mainContent.querySelectorAll('article'));
  if (allArticles.length > 0) {
    // Get page title for matching
    const pageTitle = win.document.title.split(/[|–—]/)[0].trim();
    const pageTitleWords = pageTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    
    // Find article that contains the main heading matching page title
    let mainArticle = null;
    
    for (const article of allArticles) {
      const text = article.textContent?.trim() || '';
      
      // Skip obvious non-content articles
      if (/sponsored|advertisement|^\s*#SPONSORED/i.test(text)) continue;
      if (/related\s+(stories|articles|posts)/i.test(text)) continue;
      
      // Check if article contains h1 that matches page title
      const h1 = article.querySelector('h1');
      if (h1) {
        const h1Text = h1.textContent?.trim() || '';
        // Check if h1 contains significant words from page title
        const matchesTitle = pageTitleWords.length > 0 && 
          pageTitleWords.some(word => 
            h1Text.toLowerCase().includes(word.toLowerCase())
          );
        
        if (matchesTitle || h1Text.length > 20) {
          mainArticle = article;
          break;
        }
      }
      
      // Fallback: if no h1 match, check if article has substantial content
      // and is not in sidebar/aside
      // Require much more content if no h1 match (to avoid related stories)
      if (!mainArticle && text.length > 10000) {
        const parent = article.parentElement;
        const isInSidebar = parent && (
          parent.tagName.toLowerCase() === 'aside' ||
          /\bsidebar\b/i.test(parent.className || '') ||
          /\bsidebar\b/i.test(parent.id || '')
        );
        
        if (!isInSidebar) {
          mainArticle = article;
        }
      }
    }
    
    if (mainArticle) {
      return Array.from(mainArticle.querySelectorAll(CANDIDATE_SELECTOR));
    }
    
    // If no good article found, fall back to first non-ad article
    // But require substantial content or h1 to avoid related stories
    const firstNonAdArticle = allArticles.find(article => {
      const text = article.textContent?.trim() || '';
      const hasH1 = !!article.querySelector('h1');
      // Require either h1 or very substantial content (>10000 chars)
      return (hasH1 || text.length > 10000) &&
             text.length > 1000 && 
             !/sponsored|advertisement|^\s*#SPONSORED/i.test(text) &&
             !/related\s+(stories|articles|posts)/i.test(text);
    });
    
    if (firstNonAdArticle) {
      return Array.from(firstNonAdArticle.querySelectorAll(CANDIDATE_SELECTOR));
    }
  }

  // Fallback: if no suitable article found, look for div with substantial content
  // This handles sites like Hackernoon where main content is in div, not article
  const allDivs = Array.from(mainContent.querySelectorAll('div'));
  const contentDivs = allDivs.filter(div => {
    const text = div.textContent?.trim() || '';
    const paragraphs = div.querySelectorAll('p').length;
    // Must have substantial text and multiple paragraphs to be main content
    return text.length > 5000 && paragraphs > 10;
  });
  
  if (contentDivs.length > 0) {
    // Get page title for matching
    const pageTitle = win.document.title.split(/[|–—]/)[0].trim();
    const pageTitleWords = pageTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    
    // Find div that contains h1 matching page title
    for (const div of contentDivs) {
      const h1 = div.querySelector('h1');
      if (h1) {
        const h1Text = h1.textContent?.trim() || '';
        const matchesTitle = pageTitleWords.length > 0 && 
          pageTitleWords.some(word => 
            h1Text.toLowerCase().includes(word.toLowerCase())
          );
        
        if (matchesTitle) {
          return Array.from(div.querySelectorAll(CANDIDATE_SELECTOR));
        }
      }
    }
    
    // Fallback to largest content div (by text length)
    const largestDiv = contentDivs.reduce((best, current) => {
      const currentText = current.textContent?.trim().length || 0;
      const bestText = best.textContent?.trim().length || 0;
      return currentText > bestText ? current : best;
    });
    
    return Array.from(largestDiv.querySelectorAll(CANDIDATE_SELECTOR));
  }

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
      if (isImageOrFigure) {
        excludedImageCount++;
        // Debug log for excluded images/figures

      }
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
 * Partition selected containers around their selected blocks, preserving inline markup.
 * @param {Element[]} elements - Selected elements in DOM order
 * @returns {Array<{element: Element, container?: Element, owned?: Element[]}>} Ordered parse entries
 */
export function partitionCandidateElements(elements) {
  const selected = new Set(elements);
  const visited = new Set();
  const entries = [];
  const blockSelector = CANDIDATE_SELECTOR.split(',').filter(tag => tag !== 'code').concat(['aside', 'nav', 'footer']).join(',');
  function append(element) {
    if (visited.has(element)) return;
    visited.add(element);
    const descendants = Array.from(element.querySelectorAll(blockSelector));
    const originalText = element.getAttribute('data-original-text');
    const inlineImages = element.tagName === 'P' && descendants.some(child => child.tagName === 'IMG');
    if ((element.tagName !== 'DIV' && !inlineImages) || descendants.length === 0 || originalText?.trim()) {
      entries.push({ element });
      for (const child of Array.from(element.querySelectorAll('*'))) {
        if (selected.has(child)) append(child);
      }
      return;
    }
    const boundaries = new Set(descendants);
    const children = descendants.filter(child => {
      for (let parent = child.parentElement; parent && parent !== element; parent = parent.parentElement) {
        if (boundaries.has(parent)) return false;
      }
      return true;
    });
    const range = element.ownerDocument.createRange();
    range.setStart(element, 0);
    function appendFragment() {
      const fragment = range.cloneContents();
      if (!(fragment.textContent || '').trim() && !fragment.querySelector('img,math')) return;
      const wrapper = element.cloneNode(false);
      wrapper.appendChild(fragment);
      const owned = Array.from(element.querySelectorAll('code')).filter(child => range.intersectsNode(child));
      entries.push({ element: /** @type {Element} */ (wrapper), container: element, owned });
    }
    for (const child of children) {
      range.setEndBefore(child);
      appendFragment();
      if (selected.has(child)) append(child);
      else for (const nested of Array.from(child.querySelectorAll('*'))) {
        if (selected.has(nested)) append(nested);
      }
      range.setStartAfter(child);
    }
    range.setEnd(element, element.childNodes.length);
    appendFragment();
  }
  for (const element of elements) append(element);
  return entries;
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
  const consumed = new Set();
  const containerEligibility = new Map();
  
  for (const { element, container, owned } of partitionCandidateElements(elements)) {
    if (consumed.has(element) || (container && consumed.has(container))) continue;
    const tagName = element.tagName.toLowerCase();
    
    // Strong exclusion check (ad/sponsor patterns)
    if (shouldSkipStronglyExcluded(container || element)) {
      skippedCount++;
      continue;
    }

    if (container) {
      if (!containerEligibility.has(container)) {
        const previewState = { ...state, addedParagraphs: new Set(state.addedParagraphs || []) };
        containerEligibility.set(container, !!(container.tagName === 'P'
          ? handleParagraph(win, container, previewState, constants)
          : handleDiv(container, previewState, constants)));
      }
      if (containerEligibility.get(container)) {
        for (const translated of Array.from(element.querySelectorAll('[data-original-text]'))) {
          const original = translated.getAttribute('data-original-text');
          if (original?.trim()) translated.textContent = original.trim();
        }
        const html = sanitizeParagraphHtml(element, state.selectionExclusions);
        content.push({ type: 'paragraph', text: html, html });
        for (const child of owned || []) consumed.add(child);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      }
      continue;
    }
    const previousCount = content.length;
    
    // Handle by tag type
    if (tagName === 'hr') {
      content.push({ type: 'separator' });
      processedCount++;
    } else if (tagName.match(/^h[1-6]$/)) {
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
    } else if (tagName === 'p' || tagName === 'figcaption') {
      const item = handleParagraph(win, element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === 'figure') {
      const mixedContent = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6,p,table,pre,code,blockquote,ul,ol,hr'))
        .some(child => !child.closest('figcaption'));
      if (mixedContent) continue;
      const images = [];
      for (const image of Array.from(element.querySelectorAll('img'))) {
        const item = createImageItem(win, image, state, constants, baseUrl);
        if (item) images.push(item);
      }
      if (images.length) {
        images[images.length - 1].caption = getImageCaption(element.querySelector('img'));
        content.push(...images);
        for (const _image of images) incrementContentType(state.debugInfo, 'image');
        processedCount += images.length;
      } else skippedCount++;
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
      const item = handleBlockquote(element, state.selectionExclusions);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'quote');
        processedCount++;
      }
    } else if (tagName === 'pre' || tagName === 'code') {
      // Skip code inside pre (pre will be processed and contains the code)
      if (tagName === 'code' && element.closest('pre')) {
        skippedCount++;
        continue;
      }
      const item = handleCode(element);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'code');
        processedCount++;
      }
    } else if (tagName === 'ul' || tagName === 'ol') {
      const item = handleList(element, state.selectionExclusions);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'list');
        processedCount++;
      }
    } else if (tagName === 'table') {
      const item = handleTable(element, state.selectionExclusions);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'table');
        processedCount++;
      }
    } else if (tagName === 'div') {
      const item = handleDiv(element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      } else {
        skippedCount++;
      }
    }
    if (content.length > previousCount) {
      for (const child of Array.from(element.querySelectorAll('*'))) consumed.add(child);
    }
  }
  
  if (state.debugInfo) {
    state.debugInfo.processedCount = processedCount;
    state.debugInfo.skippedCount = skippedCount;
  }
  
  return omitInitialArticleTitle(content, state);
}

/**
 * Omit the article's initial H1 while retaining headings at later source positions.
 * @param {ContentItem[]} content - Content in DOM order
 * @param {ExtractionState} state - Extraction state
 * @returns {ContentItem[]} Content without the initial duplicate title
 */
export function omitInitialArticleTitle(content, state) {
  const firstBodyIndex = content.findIndex(item => item.type !== 'subtitle' &&
    item.type !== 'separator' && !item.isStandfirst && !(item.type === 'image' && item.isFeatured));
  const firstBody = content[firstBodyIndex];
  if (firstBody?.type === 'heading' && firstBody.level === 1 && state.mainTitleText &&
      normalizeHeadingForDedup(firstBody.text) === state.mainTitleText) {
    return content.filter((_item, index) => index !== firstBodyIndex);
  }
  return content;
}

/**
 * Create a plain heading without collapsing distinct source elements by text.
 * @param {Element} element - Heading source element
 * @returns {ContentItem} Plain heading with its original fragment target
 */
export function createHeadingItem(element) {
  return {
    type: 'heading',
    level: parseInt(element.tagName.charAt(1)),
    text: cleanHeadingText(cloneWithoutLinkAnnouncements(element).textContent || ''),
    format: 'text',
    id: element.id || undefined
  };
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
  
  const rawText = cloneWithoutLinkAnnouncements(element).textContent || '';
  const cleanedText = cleanHeadingText(rawText);
  
  // Skip if matches standfirst text
  if (isStandfirstText(cleanedText, state.standfirstText)) return null;
  
  // Skip numeric headings
  if (isNumericHeading(cleanedText)) return null;
  
  // Skip empty or too short
  if (cleanedText.length < 3) return null;
  
  // Skip subscription/promotional headings
  const lowerText = cleanedText.toLowerCase();
  if (lowerText.includes('subscribe') || lowerText.includes('sign up') ||
      lowerText.includes('newsletter') || lowerText.includes('promotional') ||
      lowerText.includes('create an account') || lowerText.includes('member-only') ||
      lowerText.includes('sign in') || lowerText.includes('already have an account')) {
    return null;
  }

  // Skip Atavist-related content
  if (lowerText.includes('similar post') || lowerText.includes('highlights from our') ||
      lowerText.includes('atavist magazine collection')) {
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
  
  const level = parseInt(element.tagName.charAt(1));
  return {
    type: 'heading',
    level,
    text: cleanedText,
    format: 'text',
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
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  // Skip if inside table (table content is handled as a unit)
  if (element.closest('table')) return null;
  
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
  
  // Skip paywall/subscription prompts (universal detection)
  if (lowerText.includes('create an account to read') ||
      lowerText.includes('member-only story') ||
      lowerText.includes('sign up to read') ||
      lowerText.includes('subscribe to read') ||
      lowerText.includes('to read the full story') ||
      (lowerText.includes('sign up') && lowerText.includes('read')) ||
      (lowerText.includes('subscribe') && lowerText.includes('read'))) {
    return null;
  }
  
  // Skip donation content
  if (lowerText.includes('donate') && (lowerText.includes('support') || lowerText.includes('mission'))) {
    return null;
  }

  // Skip Atavist subscription popup
  if (lowerText.includes("like what you're reading") && lowerText.includes("subscribe to the atavist magazine")) {
    return null;
  }

  // Skip Atavist credits button
  if (lowerText.includes("the atavist magazine") && lowerText.includes("credits")) {
    return null;
  }

  // Get original text if translated
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText ? encodeOriginalText(element, originalText) : sanitizeParagraphHtml(element, state.selectionExclusions);
  
  return {
    type: 'paragraph',
    text: finalText,
    html: finalText
  };
}

/**
 * Process math elements - convert to clean LaTeX notation
 * @param {Element} container - Container element
 */
export function processMathElements(container) {
  // Find all math-related elements
  const mathElements = container.querySelectorAll('.mwe-math-element, .mathjax, .latex, .katex, math');

  for (const mathEl of Array.from(mathElements)) {
    // Try to get LaTeX from various sources
    let latex = '';
    
    // 1. Try img alt attribute (Wikipedia uses this)
    const img = mathEl.querySelector('img');
    if (img && img.alt) {
      latex = img.alt;
    }
    
    // 2. Try math alttext attribute
    const mathTag = mathEl.querySelector('math') || (mathEl.tagName.toLowerCase() === 'math' ? mathEl : null);
    if (!latex && mathTag) {
      latex = mathTag.getAttribute('alttext') || '';
    }
    
    // 3. Try annotation element
    if (!latex) {
      const annotation = mathEl.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        latex = annotation.textContent || '';
      }
    }
    
    if (latex) {
      // Clean and wrap in markdown math delimiters
      const cleanedLatex = cleanLatexFormula(latex);
      const textNode = document.createTextNode(` $${cleanedLatex}$ `);
      mathEl.replaceWith(textNode);
    } else {
      mathEl.replaceWith(document.createTextNode(mathEl.textContent || ''));
    }
  }
}

export function encodeOriginalText(element, text) {
  const node = element.ownerDocument.createElement('span');
  node.textContent = text;
  return node.innerHTML;
}

/**
 * Sanitize paragraph HTML (remove event handlers, clean up)
 * @param {Element} p - Paragraph element
 * @returns {string} - Sanitized HTML
 */
export function sanitizeParagraphHtml(p, excludedSelectors = []) {
  // Clone to avoid modifying original
  const clone = /** @type {Element} */ (cloneWithoutLinkAnnouncements(p));
  for (const selector of excludedSelectors || []) {
    for (const element of Array.from(clone.querySelectorAll(selector))) {
      if (!element.matches('blockquote.twitter-tweet')) element.remove();
    }
  }
  
  // Process math elements first - convert to LaTeX
  processMathElements(clone);
  
  // Remove event handlers
  const allElements = clone.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.tagName === 'SPAN') {
      const style = /** @type {HTMLElement} */ (el).style;
      const bold = style?.fontWeight === 'bold' || Number(style?.fontWeight) >= 600;
      const italic = style?.fontStyle === 'italic';
      if (bold || italic) {
        const wrapper = clone.ownerDocument.createElement(bold ? 'strong' : 'em');
        wrapper.append(...el.childNodes);
        el.replaceWith(wrapper);
        if (bold && italic) {
          const emphasis = clone.ownerDocument.createElement('em');
          emphasis.append(...wrapper.childNodes);
          wrapper.append(emphasis);
        }
      }
    }
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
    
    // Remove style and script elements that might have slipped through
    if (el.tagName.toLowerCase() === 'style' || el.tagName.toLowerCase() === 'script') {
      el.remove();
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && !href.startsWith('#')) {
        try {
          const absolute = new URL(href, p.ownerDocument.baseURI);
          if (['http:', 'https:', 'mailto:'].includes(absolute.protocol)) el.setAttribute('href', absolute.href);
          else el.removeAttribute('href');
        } catch (_) { el.removeAttribute('href'); }
      }
    }
  }
  
  // Clean empty elements
  const emptyElements = clone.querySelectorAll('span:empty, div:empty');
  for (const empty of Array.from(emptyElements)) {
    empty.remove();
  }
  
  return (/** @type {HTMLElement} */ (clone)).innerHTML.trim();
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
  const item = createImageItem(win, element, state, constants, baseUrl);
  if (item && !element.closest('figure')) item.caption = getImageCaption(element);
  return item;
}

export function createImageItem(win, element, state, constants, baseUrl) {
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

  // Prevent memory leaks: limit processed images set size
  if (state.processedImages.size < 1000) {
    state.processedImages.add(normalizedSrc);
  }

  return {
    type: 'image',
    src: absoluteSrc,
    alt: img.alt || '',
    caption: ''
  };
}

/**
 * Handle blockquote element
 * @param {Element} element - Blockquote element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleBlockquote(element, excludedSelectors = []) {
  const text = sanitizeParagraphHtml(element, excludedSelectors);
  if (!text) return null;
  
  return {
    type: 'quote',
    text,
    html: text
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
    for (const br of Array.from(brs)) {
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
    text,
    format: 'text'
  };
}

/**
 * Handle list element
 * @param {Element} element - List element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleList(element, excludedSelectors = []) {
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  // Skip if inside table (nested lists in table cells should be part of table)
  if (element.closest('table')) return null;
  
  // Check if list is inside navbox, authority-control, sidebar, or sister-box (Wikipedia)
  if (element.closest('.navbox, .authority-control, .side-box, .sister-box, .sistersitebox, .sidebar, .infobox, .hatnote, .mw-panel-toc, .vector-toc, #toc')) {
    return null;
  }

  const items = Array.from(element.querySelectorAll('li'))
    .filter(li => li.closest('ul, ol') === element)
    .map(li => {
      // Clone and process math elements
      const clone = /** @type {Element} */ (cloneWithoutLinkAnnouncements(li));
      processMathElements(clone);
      return { html: sanitizeParagraphHtml(clone, excludedSelectors) };
    })
    .filter(item => item.html.length > 0);

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
export function handleTable(element, excludedSelectors = []) {
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  const className = String(element.className || '').toLowerCase();
  // Skip navbox and authority-control tables
  if (className.includes('navbox') || className.includes('authority-control')) {
    return null;
  }

  const ownedRows = Array.from(element.querySelectorAll('tr')).filter(row => row.closest('table') === element);
  const cells = ownedRows.map(row => Array.from(row.children).filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH'));
  if (!cells.some(row => row.length)) return null;
  const hasHeaders = cells[0]?.length > 0 && cells[0].every(cell => cell.tagName === 'TH');
  const rows = cells.map(row => row.map(cell => sanitizeParagraphHtml(cell, excludedSelectors)));
  return { type: 'table', cellFormat: 'html', hasHeaders, ...(hasHeaders ? { headers: rows[0] } : {}), rows: hasHeaders ? rows.slice(1) : rows };
}

/**
 * Handle div element
 * @param {Element} element - Div element
 * @param {ExtractionState} state - State
 * @param {Object} constants - Constants
 * @returns {ContentItem|null} - Content item or null
 */
export function handleDiv(element, state, constants) {
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  // Skip if inside table (table content is handled as a unit)
  if (element.closest('table')) return null;
  
  const text = (element.textContent || '').trim();

  // Skip if matches standfirst text
  if (isStandfirstText(text, state.standfirstText)) return null;

  // Skip very short text
  if (text.length < 10) return null;

  // Skip elements that are clearly not content (buttons, navigation, etc.)
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();

  // Skip navigation, buttons, icons, etc.
  if (/(?:^|[\s_-])(?:nav|button|icon|menu|sidebar|widget|modal|popup|tooltip)(?:$|[\s_-])/.test(`${className} ${id}`)) {
    return null;
  }

  // Skip video player elements (JW Player, etc.)
  if (className.includes('jw-') || className.includes('video-player') ||
      className.includes('player') || className.includes('shortcuts') ||
      id.includes('video') || id.includes('player')) {
    return null;
  }

  // Skip elements with video/audio control text patterns
  const lowerText = text.toLowerCase();
  if (/^(?:volume|shortcut|caption|fullscreen|mute|unmute|play|pause)$/i.test(text) ||
      /^\d+\s+of\s+\d+\s+(?:minute|second|hour)s?$/i.test(text)) {
    return null;
  }

  // Skip if contains interactive elements
  if (element.querySelector('button, a[role="button"], input, select, textarea')) {
    return null;
  }

  // Skip navigation paragraphs
  if (isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }

  // Check if this div contains meaningful prose text
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  if (sentences.length < 1) return null;

  // Skip if text looks like metadata (dates, bylines, etc.)
  if (lowerText.startsWith('by ') && text.length < 150) return null;
  if (lowerText.startsWith('edited by') && text.length < 150) return null;
  if (/^\d+\s+words?$/i.test(text)) return null;
  if (/^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;

  // Skip newsletter content
  if (lowerText.includes('newsletter') && lowerText.includes('subscribe')) {
    return null;
  }
  
  // Skip paywall/subscription prompts (universal detection)
  if (lowerText.includes('create an account to read') ||
      lowerText.includes('member-only story') ||
      lowerText.includes('sign up to read') ||
      lowerText.includes('subscribe to read') ||
      lowerText.includes('to read the full story') ||
      (lowerText.includes('sign up') && lowerText.includes('read')) ||
      (lowerText.includes('subscribe') && lowerText.includes('read'))) {
    return null;
  }

  // Skip donation content
  if (lowerText.includes('donate') && (lowerText.includes('support') || lowerText.includes('mission'))) {
    return null;
  }

  // Skip advertisement blocks
  if (lowerText.includes('advertisement') || lowerText.includes('advertising') ||
      lowerText.includes('scroll to continue') || lowerText.includes('continue reading')) {
    return null;
  }

  // Skip byline/credit information
  if ((lowerText.includes('reporting by') || lowerText.includes('reported by')) &&
      (lowerText.includes('editing by') || lowerText.includes('edited by'))) {
    return null;
  }

  // Skip image captions and metadata
  if (lowerText.includes('item ') && lowerText.includes(' of ') && /\d+ of \d+/.test(text) ||
      lowerText.includes('reuters/') || lowerText.includes('associated press') ||
      lowerText.includes('photo by') || lowerText.includes('caption:')) {
    return null;
  }

  // Check for duplicates (normalize text for comparison)
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (state.addedParagraphs && state.addedParagraphs.has(normalizedText)) {
    return null;
  }

  // Get original text if translated
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText ? encodeOriginalText(element, originalText) : sanitizeParagraphHtml(element, state.selectionExclusions);

  // Add to seen paragraphs
  if (!state.addedParagraphs) state.addedParagraphs = new Set();
  state.addedParagraphs.add(normalizedText);

  return {
    type: 'paragraph',
    text: finalText,
    html: finalText
  };
}
