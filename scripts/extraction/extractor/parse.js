// @ts-check
// Main DOM parser for extraction
// Converts DOM elements to content items

import { compareDomOrder, toAbsoluteUrl, normalizeImageUrl, cloneReadingContent, getDocumentFragmentTarget, readArticleMetadataText, safeGetComputedStyle, isSourceExcluded, INTERFACE_REGIONS } from './dom-utils.js';
import { cleanHeadingText, stripObjMarkers, normalizeHeadingForDedup, isRealHeading } from './text-utils.js';
import { isIcon, isExcluded, isNavigationParagraph, shouldSkipStronglyExcluded, isSubscriptionFormContent } from './filters.js';
import { extractBestImageUrl, isCollapsedImageLayer, isTrackingPixel, isDecorativeImage, getImageCaption, getEmbeddedMediaItems } from './images.js';
import { getOriginalTextIfTranslated } from './translate.js';
import { pushDebugLog, incrementContentType } from './debug.js';
import { serializeReadingHtml, processMathElements, encodeOriginalText } from './inline-content.js';
import { CANDIDATE_SELECTOR } from './constants.js';
import { isReadingOwned, isLayoutTable, isFlowContainer, isReferencedReadingAside } from './reading-context.js';
import { collectAnnotationTargets, emittedReadingIds, reuseAnnotationCitations } from './annotations.js';
import { projectAtomicMedia } from './atomic-media.js';

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
 * @returns {Element[]} - Array of candidate elements
 */
export function collectCandidateElements(mainContent) {
  return [mainContent, ...Array.from(mainContent.querySelectorAll(CANDIDATE_SELECTOR))]
    .filter(element => element.matches(CANDIDATE_SELECTOR));
}

/**
 * Filter candidate elements
 * @param {Window} win - Window object
 * @param {Element[]} allElements - All candidate elements
 * @param {Object} constants - Constants for filtering
 * @param {DebugInfo|null} debugInfo - Debug info
 * @returns {Element[]} - Filtered elements
 */
export function filterCandidateElements(win, allElements, constants, debugInfo, readingRoots = [], tocRoots = []) {
  let excludedImageCount = 0;
  let excludedByType = {};
  
  const filteredElements = allElements.filter(el => {
    const tagName = el.tagName.toLowerCase();
    const isImageOrFigure = tagName === 'img' || tagName === 'figure';
    
    if (isExcluded(win, el, constants, readingRoots, tocRoots)) {
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

/** Preserve the source links when the browser cannot read a layered figure's pixels. */
function originalFigureContent(element, baseUrl, layers, caption) {
  const document = element.ownerDocument;
  const paragraph = document.createElement('p');
  const original = new URL(baseUrl);
  if (element.id) original.hash = element.id;
  const link = document.createElement('a');
  link.href = original.href;
  link.textContent = 'View the original layered figure';
  paragraph.append('This figure could not be reproduced in the export. ', link, ' · ');
  layers.forEach((source, index) => {
    const layer = document.createElement('a');
    layer.href = source;
    layer.textContent = `Layer ${index + 1}`;
    if (index > 0) paragraph.append(', ');
    paragraph.append(layer);
  });
  return paragraph.innerHTML + (caption ? '<br>' + caption : '');
}

/** Keep authored destinations that cannot be represented by raster pixels. */
function graphicReferences(owner, state, constants, win, baseUrl) {
  const references = [];
  for (const source of Array.from(owner.querySelectorAll('a'))) {
    if (source.closest('figcaption,button,nav,footer') || isSourceExcluded(source, state.selectionExclusions) ||
        isExcluded(win, source, constants, state.referenceRoots, state.tocRoots)) continue;
    const href = source.getAttribute('href') || source.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href) continue;
    let url;
    try { url = new URL(href, baseUrl); } catch (_) { continue; }
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) continue;
    const label = readArticleMetadataText(source) || Array.from(source.querySelectorAll('img')).map(image => image.alt).filter(Boolean).join(' ') || 'Source';
    const link = owner.ownerDocument.createElement('a');
    link.setAttribute('href', href.startsWith('#') ? href : url.href);
    link.textContent = label;
    const html = link.outerHTML;
    references.push({ type: 'paragraph', text: html, html,
      ...(source.id && source.id !== owner.id ? { id: source.id } : {}) });
  }
  return references;
}

/** Clone figure text without its controls or hidden presentation content. */
export function cloneFigureText(element) {
  const clone = /** @type {Element} */ (cloneReadingContent(element));
  for (const media of Array.from(clone.querySelectorAll('img,iframe,svg,canvas,video,audio,nav,footer'))) media.remove();
  return clone;
}

/** Distinguish figure body text from an image's caption and presentation controls. */
export function hasFigureBodyText(element) {
  const clone = cloneFigureText(element);
  for (const caption of Array.from(clone.querySelectorAll('figcaption'))) caption.remove();
  return !!clone.textContent?.trim();
}

/**
 * Partition selected containers around their selected blocks, preserving inline markup.
 * @param {Element[]} elements - Selected elements in DOM order
 * @param {{has(element: Element): boolean}} graphics - Atomic graphic owners
 * @returns {Array<{element: Element, container?: Element, owned?: Element[]}>} Ordered parse entries
 */
export function partitionCandidateElements(elements, graphics = new Map(), readingBoundaries = []) {
  const selected = new Set(elements);
  const visited = new Set();
  const entries = [];
  const blockSelector = CANDIDATE_SELECTOR.split(',').filter(tag => tag !== 'code').concat(INTERFACE_REGIONS).join(',');
  function append(element) {
    if (visited.has(element)) return;
    visited.add(element);
    if (graphics.has(element)) {
      entries.push({ element });
      for (const child of Array.from(element.querySelectorAll('*'))) visited.add(child);
      return;
    }
    const blockDescendants = Array.from(element.querySelectorAll(blockSelector)).filter(child =>
      !child.matches('svg,canvas') || graphics.has(child));
    const descendants = [...new Set([...blockDescendants,
      ...readingBoundaries.filter(child => child !== element && element.contains(child))])].sort(compareDomOrder);
    const originalText = element.getAttribute('data-original-text');
    const inlineMedia = element.tagName === 'P' && descendants.some(child => child.matches('img,iframe,video,audio,svg,canvas'));
    const inlineBoundary = descendants.some(child => readingBoundaries.includes(child));
    const richFigure = element.tagName === 'FIGURE' && hasFigureBodyText(element);
    if ((!isFlowContainer(element) && !inlineMedia && !inlineBoundary && !richFigure) || descendants.length === 0 || originalText?.trim()) {
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
export function parseElements(win, elements, state, constants, baseUrl, annotationPass = false) {
  /** @type {ContentItem[]} */
  const content = [];
  let processedCount = 0;
  let skippedCount = 0;
  const consumed = new Set();
  state.captionOwners ||= new WeakSet();
  for (const [owner, graphic] of state.readingGraphics || []) {
    const caption = Array.from(owner.querySelectorAll('figcaption')).find(node => node.closest('figure') === owner);
    if (caption) graphic.caption = serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots);
  }
  for (const element of elements) {
    if (element.tagName !== 'IMG') continue;
    const image = /** @type {HTMLImageElement} */ (element);
    if (!image.closest('figure') && extractBestImageUrl(image) &&
        !isTrackingPixel(win, image) && !isDecorativeImage(win, image, constants.LOGO_PATTERNS || [])) {
      getImageCaption(image, state.captionOwners, state.selectionExclusions);
    }
  }
  
  const readingBoundaries = (state.selectionExclusions || []).filter(rule => typeof rule !== 'string');
  if (state.standfirstElement) readingBoundaries.push(state.standfirstElement);
  const graphicOwners = state.originalImageLayers?.size
    ? new Set([...state.readingGraphics?.keys() || [], ...state.originalImageLayers.keys()])
    : state.readingGraphics;
  const sourceTitle = state.originalImageLayers?.size && state.mainTitleText
    ? elements.find(element => element.tagName === 'H1' &&
      normalizeHeadingForDedup(readArticleMetadataText(element)) === state.mainTitleText)
    : null;
  for (const { element, container, owned } of partitionCandidateElements(elements, graphicOwners, readingBoundaries)) {
    if (consumed.has(element) || (container && consumed.has(container))) continue;
    if (state.captionOwners.has(container || element)) continue;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'h1' && element === state.titleElement && content.every(item =>
      item.type === 'subtitle' || item.type === 'separator' || item.isStandfirst || item.isFeatured ||
      (item.type === 'paragraph' && /^<a\b[^>]*>[^<]{1,80}<\/a>$/i.test(item.html?.trim() || '')))) continue;
    
    // Strong exclusion check (ad/sponsor patterns)
    if (shouldSkipStronglyExcluded(container || element)) {
      skippedCount++;
      continue;
    }

    if (element === state.standfirstElement) {
      const html = serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots);
      if (html) content.push({ type: 'subtitle', text: html, html, isStandfirst: true,
        ...(element.id ? { id: element.id } : {}) });
      for (const child of Array.from(element.querySelectorAll('*'))) consumed.add(child);
      continue;
    }

    const graphic = state.readingGraphics?.get(element);
    const originalLayers = state.originalImageLayers?.get(element);
    if (graphic || originalLayers) {
      const caption = Array.from(element.querySelectorAll('figcaption')).find(node => node.closest('figure') === element);
      const captionHtml = caption ? serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots) : '';
      if (graphic) {
        content.push({ ...graphic, ...(element.id ? { id: element.id } : {}),
          ...(caption ? { caption: captionHtml } : {}),
          ...(state.featuredMediaRoots?.some(root => root === element || root.contains(element)) ? { isFeatured: true } : {}) });
      } else {
        const html = originalFigureContent(element, baseUrl, originalLayers, captionHtml);
        const leadsTitle = sourceTitle && !element.contains(sourceTitle) && compareDomOrder(element, sourceTitle) < 0;
        content.push({ type: 'paragraph', text: html, html, ...(element.id ? { id: element.id } : {}),
          ...(leadsTitle ? { isFeatured: true } : {}) });
      }
      content.push(...graphicReferences(element, state, constants, win, baseUrl));
      for (const child of Array.from(element.querySelectorAll('*'))) consumed.add(child);
      incrementContentType(state.debugInfo, graphic ? 'image' : 'paragraph');
      processedCount++;
      continue;
    }

    if (container) {
        for (const translated of Array.from(element.querySelectorAll('[data-original-text]'))) {
          const original = translated.getAttribute('data-original-text');
          if (original?.trim()) translated.textContent = original.trim();
        }
        const figure = container.closest('figure');
        const fragment = figure && !container.closest('figcaption') ? cloneFigureText(element) : element;
        const html = serializeReadingHtml(fragment, state.selectionExclusions, state.referenceRoots);
        if (!html) continue;
        content.push({ type: 'paragraph', text: container.tagName === 'DT' ? `<strong>${html}</strong>` : html,
          html: container.tagName === 'DT' ? `<strong>${html}</strong>` : html,
          ...(container.id && !content.some(item => item.id === container.id) ? { id: container.id } : {}) });
        for (const child of owned || []) consumed.add(child);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      continue;
    }
    const previousCount = content.length;
    const atomic = ['blockquote', 'ul', 'ol'].includes(tagName) || (tagName === 'table' && !isLayoutTable(element))
      ? projectAtomicMedia(element, elements, state, source => {
        const item = createImageItem(win, source, state, constants, baseUrl);
        if (item) item.caption = getImageCaption(/** @type {HTMLImageElement} */ (source), state.captionOwners, state.selectionExclusions);
        return item;
      }) : null;
    const unit = atomic?.clone || element;
    
    // Handle by tag type
    if (tagName === 'hr') {
      content.push({ type: 'separator' });
      processedCount++;
    } else if (['iframe', 'video', 'audio'].includes(tagName)) {
      for (const item of getEmbeddedMediaItems(element)) {
        if (item.type === 'image') {
          const key = normalizeImageUrl(item.src);
          const figure = element.closest('figure');
          if (figure && Array.from(figure.querySelectorAll('img')).some(image =>
            normalizeImageUrl(toAbsoluteUrl(extractBestImageUrl(image), baseUrl)) === key)) continue;
          if (state.processedImages.size < 1000) state.processedImages.add(key);
        }
        content.push(element.id && item.type !== 'image' ? { ...item, id: element.id } : item);
        incrementContentType(state.debugInfo, item.type);
        processedCount++;
      }
    } else if (tagName.match(/^h[1-6]$/)) {
      // Check if element is actually a real heading (not just styled text)
      const isReal = isReadingOwned(element, state.referenceRoots) || isRealHeading(element, win);
      
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
        const isLeadingCaption = tagName === 'figcaption' && element.closest('figure') && state.titleElement &&
            compareDomOrder(element, state.titleElement) < 0;
        content.push(isLeadingCaption ? { ...item, isFeatured: true } : item);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      } else {
        skippedCount++;
      }
    } else if (tagName === 'figure') {
      if (hasFigureBodyText(element)) {
        const originalText = element.getAttribute('data-original-text')?.trim();
        const html = originalText ? encodeOriginalText(element, originalText) :
          serializeReadingHtml(cloneFigureText(element), state.selectionExclusions, state.referenceRoots);
        if (html) {
          content.push({ type: 'paragraph', text: html, html });
          incrementContentType(state.debugInfo, 'paragraph');
          processedCount++;
        }
        if (originalText) {
          for (const child of Array.from(element.querySelectorAll('*'))) {
            if (!child.matches('img,iframe,video,audio')) consumed.add(child);
          }
        }
        continue;
      }
      const mixedContent = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6,p,table,pre,code,blockquote,ul,ol,hr,iframe,video,audio'))
        .some(child => !child.closest('figcaption'));
      if (mixedContent) continue;
      const images = [];
      for (const image of Array.from(element.querySelectorAll('img')).filter(image =>
        image.closest('figure') === element && elements.includes(image))) {
        const item = createImageItem(win, image, state, constants, baseUrl);
        if (item) { images.push(item); consumed.add(image); }
      }
      if (images.length) {
        const source = Array.from(element.querySelectorAll('img')).find(image => image.closest('figure') === element && elements.includes(image));
        images[images.length - 1].caption = getImageCaption(source, state.captionOwners, state.selectionExclusions);
        for (const caption of Array.from(element.querySelectorAll('figcaption')).filter(caption => caption.closest('figure') === element)) {
          consumed.add(caption);
          for (const child of Array.from(caption.querySelectorAll('*'))) consumed.add(child);
        }
        content.push(...images);
        for (const _image of images) incrementContentType(state.debugInfo, 'image');
        processedCount += images.length;
      } else skippedCount++;
      continue;
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
      const item = handleBlockquote(unit, state.selectionExclusions, state.referenceRoots);
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
      const item = handleList(unit, state.selectionExclusions, state.referenceRoots, state.tocRoots);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'list');
        processedCount++;
      }
    } else if (tagName === 'table') {
      if (isLayoutTable(element)) continue;
      const caption = Array.from(element.children).find(child => child.tagName === 'CAPTION');
      const captionHtml = caption && serializeReadingHtml(caption, state.selectionExclusions, state.referenceRoots);
      if (captionHtml) content.push({ type: 'paragraph', text: captionHtml, html: captionHtml,
        ...(caption.id ? { id: caption.id } : {}) });
      const sourceCells = new Map(Array.from(atomic?.copies || [], ([source, copy]) => [copy, source]));
      const item = handleTable(unit, state.selectionExclusions, state.referenceRoots, sourceCells);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'table');
        processedCount++;
      }
    } else if (isFlowContainer(element)) {
      const item = handleDiv(element, state, constants);
      if (item) {
        content.push(item);
        incrementContentType(state.debugInfo, 'paragraph');
        processedCount++;
      } else {
        skippedCount++;
      }
    }
    for (const { source, item } of atomic?.media || []) {
      content.push(item);
      if (item.isGraphic) content.push(...graphicReferences(source, state, constants, win, baseUrl));
    }
    if (content.length > previousCount && !['iframe', 'video', 'audio'].includes(tagName)) {
      const originalMedia = ['p', 'div'].includes(tagName) && element.getAttribute('data-original-text')?.trim();
      for (const child of Array.from(element.querySelectorAll('*'))) {
        if (!originalMedia || !child.matches('img,iframe,video,audio')) consumed.add(child);
      }
    }
  }
  
  if (state.debugInfo) {
    state.debugInfo.processedCount = processedCount;
    state.debugInfo.skippedCount = skippedCount;
  }
  
  if (!annotationPass && elements.length) {
    const document = elements[0].ownerDocument;
    const dependencies = collectAnnotationTargets(elements, emittedReadingIds(content, document), state.selectionExclusions,
      reference => !isExcluded(win, reference, constants, state.referenceRoots, state.tocRoots));
    const projected = dependencies.map(({ target, clone, label, citation }) => {
      const roots = [...(state.referenceRoots || []), clone];
      const candidates = [clone, ...Array.from(clone.querySelectorAll(CANDIDATE_SELECTOR))];
      const selected = filterCandidateElements(win, candidates, constants, null, roots);
      const items = parseElements(win, selected, { ...state, referenceRoots: roots, standfirstElement: null,
        standfirstText: null, mainTitleText: '' }, constants, baseUrl, true);
      return { target, label, items, citation };
    });
    if (projected.length) reuseAnnotationCitations(content, projected, document);
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
    item.type !== 'separator' && !item.isStandfirst && !item.isFeatured);
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
    text: cleanHeadingText(cloneReadingContent(element).textContent || ''),
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
  
  const rawText = readArticleMetadataText(element);
  const cleanedText = cleanHeadingText(rawText);
  
  // Skip if matches standfirst text
  const readingOwned = isReadingOwned(element, state.referenceRoots);
  
  // Skip empty or too short
  if (!cleanedText || (!readingOwned && cleanedText.length < 3)) return null;
  
  // Skip subscription/promotional headings
  const lowerText = cleanedText.toLowerCase();
  if (!readingOwned && (lowerText.includes('subscribe') || lowerText.includes('sign up') ||
      lowerText.includes('newsletter') || lowerText.includes('promotional') ||
      lowerText.includes('create an account') || lowerText.includes('member-only') ||
      lowerText.includes('sign in') || lowerText.includes('already have an account'))) {
    return null;
  }

  // Skip Atavist-related content
  if (!readingOwned && (lowerText.includes('similar post') || lowerText.includes('highlights from our') ||
      lowerText.includes('atavist magazine collection'))) {
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
  const aside = element.closest('aside[id],[role~="complementary"][id]');
  const sectionId = aside?.querySelector('h2,h3,h4,h5,h6') === element &&
    isReferencedReadingAside(aside, state.referenceRoots, state.tocRoots) ? aside.id : undefined;
  return {
    type: 'heading',
    level,
    text: cleanedText,
    format: 'text',
    id: element.id || sectionId
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
  
  // A selected table emits its cells as a unit. A selection inside a cell can
  // instead own prose without owning the enclosing table.
  const table = element.closest('table');
  if (table && !isLayoutTable(table) && isReadingOwned(table, state.referenceRoots)) return null;
  
  // Skip if standfirst element
  if (state.standfirstElement && element === state.standfirstElement) return null;
  
  const text = (element.textContent || '').trim();
  
  const readingOwned = isReadingOwned(element, state.referenceRoots) || !!element.closest('figure');
  
  // Skip very short paragraphs
  if (!text || (!readingOwned && text.length < 5)) return null;
  
  // Skip metadata paragraphs
  const lowerText = text.toLowerCase();
  if (!readingOwned && /^\d+\s+words?$/i.test(text)) return null;
  if (!readingOwned && /^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;
  
  // Skip navigation paragraphs
  if (!readingOwned && isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }
  
  // Skip newsletter/subscription content
  if (!readingOwned && lowerText.includes('newsletter') && lowerText.includes('subscribe')) {
    return null;
  }
  
  // Skip paywall/subscription prompts (universal detection)
  if (!readingOwned && (lowerText.includes('create an account to read') ||
      lowerText.includes('member-only story') ||
      lowerText.includes('sign up to read') ||
      lowerText.includes('subscribe to read') ||
      lowerText.includes('to read the full story') ||
      (lowerText.includes('sign up') && lowerText.includes('read')) ||
      (lowerText.includes('subscribe') && lowerText.includes('read')))) {
    return null;
  }
  
  // Skip donation content
  if (!readingOwned && lowerText.includes('donate') && (lowerText.includes('support') || lowerText.includes('mission'))) {
    return null;
  }

  // Skip Atavist subscription popup
  if (!readingOwned && lowerText.includes("like what you're reading") && lowerText.includes("subscribe to the atavist magazine")) {
    return null;
  }

  // Skip Atavist credits button
  if (!readingOwned && lowerText.includes("the atavist magazine") && lowerText.includes("credits")) {
    return null;
  }

  // Get original text if translated
  const originalText = getOriginalTextIfTranslated(element);
  const finalText = originalText ? encodeOriginalText(element, originalText) : serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots);
  
  return {
    type: 'paragraph',
    text: finalText,
    html: finalText,
    ...(element.id ? { id: element.id } : {})
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
  const item = createImageItem(win, element, state, constants, baseUrl);
  if (item && !element.closest('figure')) item.caption = getImageCaption(/** @type {HTMLImageElement} */ (element), state.captionOwners, state.selectionExclusions);
  return item;
}

export function createImageItem(win, element, state, constants, baseUrl) {
  const img = /** @type {HTMLImageElement} */ (element);
  const src = extractBestImageUrl(img);
  if (!src || isCollapsedImageLayer(img)) return null;
  
  // Skip tracking pixels and decorative images
  if (isTrackingPixel(win, img)) return null;
  if (isDecorativeImage(win, img, constants.LOGO_PATTERNS || [])) return null;
  
  const absoluteSrc = toAbsoluteUrl(src, baseUrl);
  const normalizedSrc = normalizeImageUrl(absoluteSrc);

  // Resource identity is used for loading and featured-image selection, not reading occurrences.
  if (state.processedImages.size < 1000) {
    state.processedImages.add(normalizedSrc);
  }

  return {
    type: 'image',
    src: absoluteSrc,
    alt: img.getAttribute('aria-label') || img.alt || img.title || '',
    caption: '',
    ...(element.id ? { id: element.id } : {}),
    ...(state.featuredMediaRoots?.some(root => root === element || root.contains(element)) ? { isFeatured: true } : {})
  };
}

/**
 * Handle blockquote element
 * @param {Element} element - Blockquote element
 * @returns {ContentItem|null} - Content item or null
 */
export function handleBlockquote(element, excludedSelectors = [], referenceRoots = null) {
  const text = serializeReadingHtml(element, excludedSelectors, referenceRoots);
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
export function handleList(element, excludedSelectors = [], referenceRoots = null, tocRoots = []) {
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  // Skip if inside table (nested lists in table cells should be part of table)
  if (element.closest('table')) return null;
  
  // Navigation lists and utility sidebars are outside the reading order.
  const sidebar = element.closest('.sidebar');
  if (element.closest('.navbox, .authority-control, .side-box, .sister-box, .sistersitebox, .infobox, .hatnote, .mw-panel-toc, .vector-toc, #toc') ||
      (sidebar && !isReferencedReadingAside(sidebar, referenceRoots || [], tocRoots))) {
    return null;
  }

  const children = Array.from(element.querySelectorAll('li')).filter(li => li.closest('ul, ol') === element);
  const generatedCounterMatches = element.tagName === 'OL' && !element.hasAttribute('reversed') &&
    (!element.hasAttribute('start') || element.getAttribute('start')?.trim() === '1') &&
    children.every(li => !li.hasAttribute('value'));
  const items = children
    .map((li, index) => {
      // Clone and process math elements
      const clone = /** @type {Element} */ (cloneReadingContent(li));
      const leading = Array.from(li.childNodes).find(node => node.nodeType !== 8 && (node.nodeType !== 3 || node.textContent?.trim()));
      if (generatedCounterMatches && leading?.nodeType === 1 && /** @type {Element} */ (leading).tagName === 'SUP' &&
          leading.textContent?.trim() === String(index + 1) && li.id) {
        const label = leading.textContent.trim();
        const reciprocal = Array.from(li.querySelectorAll('a[role="doc-backlink"][href]')).some(backlink => {
          const target = getDocumentFragmentTarget(backlink);
          if (!target || li.contains(target)) return false;
          const references = target.matches('a[href]') ? [target] : Array.from(target.querySelectorAll('a[href]'));
          return references.some(reference => reference.textContent?.trim() === label && getDocumentFragmentTarget(reference) === li);
        });
        if (reciprocal) {
          const copy = Array.from(clone.childNodes).find(node => node.nodeType !== 8 && (node.nodeType !== 3 || node.textContent?.trim()));
          if (copy?.nodeType === 1 && /** @type {Element} */ (copy).tagName === 'SUP' && copy.textContent?.trim() === label) copy.remove();
        }
      }
      processMathElements(clone);
      return { html: serializeReadingHtml(clone, excludedSelectors, referenceRoots), ...(li.id ? { id: li.id } : {}) };
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
export function handleTable(element, excludedSelectors = [], referenceRoots = null, sourceCells = new Map()) {
  // Skip if inside blockquote (handled separately)
  if (element.closest('blockquote')) return null;
  
  const className = String(element.className || '').toLowerCase();
  // Skip navbox and authority-control tables
  if (className.includes('navbox') || className.includes('authority-control')) {
    return null;
  }

  const table = /** @type {HTMLTableElement} */ (element);
  const win = element.ownerDocument.defaultView;
  const styles = new Map();
  const style = node => {
    if (!styles.has(node)) styles.set(node, win ? safeGetComputedStyle(win, sourceCells.get(node) || node) : null);
    return styles.get(node);
  };
  const noLayout = (node, includeCollapsed = true) => {
    for (let current = node; current; current = current.parentElement) {
      const value = style(current);
      if (value?.display === 'none' || (includeCollapsed && ['TR', 'THEAD', 'TBODY', 'TFOOT'].includes(current.tagName) && value?.visibility === 'collapse')) return true;
    }
    return false;
  };
  const hiddenContent = node => ['hidden', 'collapse'].includes(style(node)?.visibility);
  if (noLayout(element)) return null;
  const ownedRows = Array.from(table.rows).filter(row => !noLayout(row, false));
  const cells = ownedRows.map(row => noLayout(row) ? [] : Array.from(row.cells).filter(cell => !noLayout(cell)));
  const color = node => (style(node)?.color || '').match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)?.slice(1).map(Number);
  const defaultColor = color(table);
  const muted = cell => {
    const rgb = color(cell);
    return cell.tagName === 'TD' && defaultColor && rgb && Math.max(...rgb) - Math.min(...rgb) <= 30 &&
      Math.abs(rgb[0] - defaultColor[0]) >= 30 && rgb[0] > 45 && rgb[0] < 210;
  };
  const grid = ownedRows.map(() => []);
  const physicalRows = ownedRows.map(() => []);
  const remainingRows = [];
  let groupEnd = ownedRows.length;
  for (let index = ownedRows.length - 1; index >= 0; index--) {
    if (ownedRows[index + 1]?.parentElement !== ownedRows[index].parentElement) groupEnd = index + 1;
    remainingRows[index] = groupEnd - index;
  }
  for (const [rowIndex, row] of ownedRows.entries()) {
    let column = 0;
    for (const cell of cells[rowIndex]) {
      const width = cell.colSpan;
      const remaining = remainingRows[rowIndex];
      const height = Math.min(cell.rowSpan || remaining, remaining);
      let free = 0;
      while (free < width) {
        if (grid[rowIndex][column + free]) { column += free + 1; free = 0; }
        else free++;
      }
      const visible = !hiddenContent(cell);
      const html = visible ? serializeReadingHtml(cell, excludedSelectors, referenceRoots) : '';
      const sourceCell = sourceCells.get(cell) || cell;
      const id = visible && sourceCell.id && sourceCell.ownerDocument.getElementById(sourceCell.id) === sourceCell ? sourceCell.id : '';
      const headers = sourceCell.getAttribute('headers');
      const scope = cell.tagName === 'TH' ? cell.scope : '';
      physicalRows[rowIndex].push({ column, rowSpan: height, colSpan: width, header: cell.tagName === 'TH',
        ...(muted(cell) ? { muted: true } : {}),
        ...(['row', 'col', 'rowgroup', 'colgroup'].includes(scope) ? { scope } : {}),
        ...(id ? { id } : {}),
        ...(headers !== null ? { headerIds: headers.split(/[\t\n\f\r ]+/).filter(Boolean) } : {}) });
      let repeated = html;
      if (width * height > 1 && html) {
        const template = element.ownerDocument.createElement('template');
        template.innerHTML = html;
        for (const target of Array.from(template.content.querySelectorAll('[id], [name]'))) {
          target.removeAttribute('id'); target.removeAttribute('name');
        }
        repeated = template.innerHTML;
      }
      for (let down = 0; down < height; down++) {
        for (let across = 0; across < width; across++) {
          grid[rowIndex + down][column + across] = { html: down || across ? repeated : html, visible };
        }
      }
      column += width;
    }
  }
  const columns = grid.reduce((width, row) => Math.max(width, row.length), 0);
  if (!columns) return null;
  const visibleRows = ownedRows.map((row, index) => ({ row, index })).filter(({ row, index }) =>
    !noLayout(row) && (grid[index].some(cell => cell.visible) || (!row.cells.length && !hiddenContent(row))));
  if (!visibleRows.length) return null;
  const firstCells = cells[visibleRows[0].index];
  const hasHeaders = firstCells.length > 0 && firstCells.every(cell => cell.tagName === 'TH');
  const rows = visibleRows.map(({ index }) => Array.from({ length: columns }, (_, column) => grid[index][column]?.html || ''));
  /** @type {import('../../types.js').TableLayoutRow[]} */
  const layoutRows = visibleRows.map(({ row, index }, visibleIndex) => ({
    group: row.parentElement?.tagName === 'THEAD' ? 'head' : row.parentElement?.tagName === 'TFOOT' ? 'foot' : 'body',
    ...(visibleIndex === 0 || visibleRows[visibleIndex - 1].row.parentElement !== row.parentElement ? { groupStart: true } : {}),
    cells: physicalRows[index].map(cell => ({ ...cell,
      rowSpan: visibleRows.filter(entry => entry.index >= index && entry.index < index + cell.rowSpan).length }))
  }));
  const headingIds = new Set(layoutRows.flatMap(row => row.cells.filter(cell => cell.header && cell.id).map(cell => cell.id)));
  for (const row of layoutRows) for (const cell of row.cells) {
    if (cell.headerIds) cell.headerIds = [...new Set(cell.headerIds.filter(id => headingIds.has(id) && id !== cell.id))];
  }
  const columnGroups = [];
  let unassignedColumns = columns;
  const groups = /** @type {HTMLTableColElement[]} */ (Array.from(table.children).filter(child => child.tagName === 'COLGROUP'));
  for (const group of groups) {
    if (!unassignedColumns) break;
    const cols = /** @type {HTMLTableColElement[]} */ (Array.from(group.children).filter(child => child.tagName === 'COL'));
    const span = cols.length ? cols.reduce((count, col) => count + col.span, 0) : group.span;
    const assigned = Math.min(span, unassignedColumns);
    columnGroups.push(assigned);
    unassignedColumns -= assigned;
  }
  const sourceTable = sourceCells.get(table) || table;
  const id = sourceTable.id && sourceTable.ownerDocument.getElementById(sourceTable.id) === sourceTable ? sourceTable.id : '';
  return { type: 'table', cellFormat: 'html', hasHeaders, layoutRows,
    ...(id ? { id } : {}),
    ...(columnGroups.length ? { columnGroups } : {}),
    ...(hasHeaders ? { headers: rows[0] } : {}), rows: hasHeaders ? rows.slice(1) : rows };
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
  
  const table = element.closest('table');
  if (table && !isLayoutTable(table) && isReadingOwned(table, state.referenceRoots)) return null;

  const figure = element.closest('figure');
  if (figure && !element.closest('figcaption') && hasFigureBodyText(figure)) {
    const clone = cloneFigureText(element);
    if (!clone.textContent?.trim()) return null;
    const original = getOriginalTextIfTranslated(element);
    const html = original ? encodeOriginalText(element, original) : serializeReadingHtml(clone, state.selectionExclusions, state.referenceRoots);
    return html ? { type: 'paragraph', text: html, html } : null;
  }
  
  const text = (element.textContent || '').trim();

  if (element === state.standfirstElement) return null;
  const readingOwned = isReadingOwned(element, state.referenceRoots);

  // Skip very short text
  if (!text || (!readingOwned && text.length < 10)) return null;

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
  if (element.querySelector('input, select, textarea') || (!readingOwned && element.querySelector('button, a[role="button"]'))) {
    return null;
  }

  // Skip navigation paragraphs
  if (!readingOwned && isNavigationParagraph(text, constants.NAV_PATTERNS_STARTS_WITH || [], constants.PAYWALL_PATTERNS || [])) {
    return null;
  }

  // Check if this div contains meaningful prose text
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  if (!readingOwned && sentences.length < 1) return null;

  // Skip if text looks like metadata (dates, bylines, etc.)
  if (!readingOwned && lowerText.startsWith('by ') && text.length < 150) return null;
  if (!readingOwned && lowerText.startsWith('edited by') && text.length < 150) return null;
  if (!readingOwned && /^\d+\s+words?$/i.test(text)) return null;
  if (!readingOwned && /^\d+\s+min(utes?)?\s+read$/i.test(text)) return null;

  // Skip newsletter content
  if (!readingOwned && lowerText.includes('newsletter') && lowerText.includes('subscribe')) {
    return null;
  }
  
  // Skip paywall/subscription prompts (universal detection)
  if (!readingOwned && (lowerText.includes('create an account to read') ||
      lowerText.includes('member-only story') ||
      lowerText.includes('sign up to read') ||
      lowerText.includes('subscribe to read') ||
      lowerText.includes('to read the full story') ||
      (lowerText.includes('sign up') && lowerText.includes('read')) ||
      (lowerText.includes('subscribe') && lowerText.includes('read')))) {
    return null;
  }

  // Skip donation content
  if (!readingOwned && lowerText.includes('donate') && (lowerText.includes('support') || lowerText.includes('mission'))) {
    return null;
  }

  // Skip advertisement blocks
  if (!readingOwned && (lowerText.includes('advertisement') || lowerText.includes('advertising') ||
      lowerText.includes('scroll to continue') || lowerText.includes('continue reading'))) {
    return null;
  }

  // Skip byline/credit information
  if (!readingOwned && (lowerText.includes('reporting by') || lowerText.includes('reported by')) &&
      (lowerText.includes('editing by') || lowerText.includes('edited by'))) {
    return null;
  }

  // Skip image captions and metadata
  if (!readingOwned && (lowerText.includes('item ') && lowerText.includes(' of ') && /\d+ of \d+/.test(text) ||
      lowerText.includes('reuters/') || lowerText.includes('associated press') ||
      lowerText.includes('photo by') || lowerText.includes('caption:'))) {
    return null;
  }

  // Get original text if translated
  const originalText = getOriginalTextIfTranslated(element);
  let finalText = originalText ? encodeOriginalText(element, originalText) : serializeReadingHtml(element, state.selectionExclusions, state.referenceRoots);
  if (element.tagName === 'DT') finalText = `<strong>${finalText}</strong>`;

  return {
    type: 'paragraph',
    text: finalText,
    html: finalText,
    ...(element.id ? { id: element.id } : {})
  };
}
