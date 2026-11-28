// @ts-check
// Main orchestrator for automatic extraction
// Coordinates all extraction modules and provides the main entry point

import { createDebugInfo, pushDebugLog, logExtractionStart, logHtmlState } from './debug.js';
import { waitForContentLoad } from './spa.js';
import { detectGoogleTranslateState, checkFirstParagraph } from './translate.js';
import { extractMetadata, findArticleTitleElement } from './metadata.js';
import { findMainContent } from './discover.js';
import { createDeferredFigureImageRecovery, discoverReadingMedia, extractMetadataImage, hasSourceReadingMedia } from './images.js';
import { isSourceExcluded, readArticleMetadataText, readSourceFragmentIds } from './dom-utils.js';
import { extractStandfirst } from './standfirst.js';
import { collectCandidateElements, collectExplicitFlowRoots, filterCandidateElements, sortElementsInDomOrder, parseElements } from './parse.js';
import { captureReadingGraphics } from './graphics.js';
import { resolveContentSelection, isSelectedContentExcluded, findSelectedTextElement, selectorValues } from './selectors.js';
import { findPublisherFormRegions, isExcluded } from './filters.js';
import { normalizeHeadingForDedup } from './text-utils.js';
import { findSocialReadingRoot, findFallbackReadingRoots } from './fallbacks.js';
import { findRecommendationRegions, isEditorialOwner, isSemanticReadingScope } from './reading-context.js';
import { CONSTANTS } from './constants.js';
import { CONFIG } from '../../utils/config.js';

/**
 * @typedef {import('./types.js').ExtractionResult} ExtractionResult
 * @typedef {import('./types.js').ExtractionState} ExtractionState
 * @typedef {import('./types.js').ContentItem} ContentItem
 */

/**
 * Run automatic content extraction
 * This is the main entry point that orchestrates all extraction modules
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @param {boolean} enableDebugInfo - Whether to collect debug information
 * @returns {Promise<ExtractionResult>} - Extraction result
 */
export async function runExtraction(baseUrl, enableDebugInfo = false, selectors = null) {
  const extractionDeadline = Date.now() + CONFIG.EXTRACTION_AUTOMATIC_TIMEOUT;
  // Get window and document
  const win = window;
  const doc = document;
  const requestedUrl = new URL(baseUrl || win.location.href);
  const currentUrl = new URL(win.location.href);
  requestedUrl.hash = currentUrl.hash = '';
  if (requestedUrl.href !== currentUrl.href) throw new Error('The page changed before extraction started.');
  
  // Initialize debug info
  const debugInfo = enableDebugInfo ? createDebugInfo(win, doc, baseUrl) : null;
  
  // Log extraction start
  if (enableDebugInfo) {
    logExtractionStart(baseUrl, enableDebugInfo);
    logHtmlState(doc);
  }
  
  try {
    // Wait for SPA content to load
    try {
      if (!selectors) await waitForContentLoad(doc);
    } catch (e) {
      // Continue even if waiting fails
      pushDebugLog(debugInfo, 'WAIT_FOR_CONTENT_SKIPPED', { error: String(e) });
    }
    
    // Detect Google Translate state
    const googleTranslateState = detectGoogleTranslateState(doc);
    const firstParagraphCheck = checkFirstParagraph(doc);
    
    if (debugInfo) {
      debugInfo.googleTranslateState = googleTranslateState;
      debugInfo.firstParagraphCheck = firstParagraphCheck;
      pushDebugLog(debugInfo, 'GOOGLE_TRANSLATE_STATE', googleTranslateState);
    }
    
    // Build constants object for modules
    const constants = {
      EXCLUDED_CLASSES: CONSTANTS.EXCLUDED_CLASSES,
      PAYWALL_CLASSES: CONSTANTS.PAYWALL_CLASSES,
      NAV_PATTERNS_CONTAINS: CONSTANTS.NAVIGATION_PATTERNS_CONTAINS,
      NAV_PATTERNS_STARTS_WITH: CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH,
      COURSE_AD_PATTERNS: CONSTANTS.COURSE_AD_PATTERNS,
      PAYWALL_PATTERNS: CONSTANTS.PAYWALL_PATTERNS,
      LOGO_PATTERNS: CONSTANTS.LOGO_PATTERNS
    };
    
    // Extract metadata (title, author, date)
    let titleElement = findArticleTitleElement(doc);
    let selectedTitleElement = null;
    const metadata = extractMetadata(doc, baseUrl, titleElement);
    const selection = selectors ? resolveContentSelection(doc, selectors) : null;
    if (selection?.selectors) selectors = selection.selectors;
    const editorialScopes = selection?.containers.filter(isEditorialOwner) || [];
    const editorialScope = editorialScopes.length === 1 ? editorialScopes[0] : null;
    let selectorRecovered = false;
    if (selectors) {
      if (!selection.matched && !editorialScope) return { ...metadata, content: [], selectorMatched: false, debugInfo };
      const selectedTitle = findSelectedTextElement(doc, selectors.title, selection.exclusions);
      selectorRecovered = !selection.matched && !!selectedTitle && editorialScope?.contains(selectedTitle) === true;
      if (!selection.matched && !selectorRecovered) return { ...metadata, content: [], selectorMatched: false, debugInfo };
      if (selectedTitle) {
        metadata.title = readArticleMetadataText(selectedTitle, selection.exclusions);
        const heading = selectedTitle.closest('h1,h2,h3,h4,h5,h6');
        const headingTitle = heading ? readArticleMetadataText(heading, selection.exclusions) : '';
        titleElement = heading && normalizeHeadingForDedup(headingTitle) === normalizeHeadingForDedup(metadata.title)
          ? heading : selectedTitle;
        selectedTitleElement = titleElement;
      }
    }
    const language = (doc.documentElement.lang || '').trim().toLowerCase().split(/[-_]/)[0];
    const detectedLanguage = /^[a-z]{2,3}$/.test(language) ? (language === 'ua' ? 'uk' : language) : undefined;
    const mainTitleText = normalizeHeadingForDedup(metadata.title);
    
    pushDebugLog(debugInfo, 'METADATA_EXTRACTED', metadata);
    
    const socialRoot = selectors ? null : findSocialReadingRoot(baseUrl, doc);
    const primaryRoot = (selectorRecovered ? editorialScope : selection?.roots[0]) || socialRoot || findMainContent(win, doc, (el) =>
      isExcluded(win, el, constants, isSemanticReadingScope(el) ? [el] : []));
    const recoverDeferredFigureImages = createDeferredFigureImageRecovery(win, extractionDeadline);

    // Discovery changes roots, while every source occurrence uses the same parser.
    const extractReadingRoots = async bodyRoots => {
      const mainContent = bodyRoots[0];
      const bodyTitle = readLeadingDeclaredTitle(mainContent, titleElement, mainTitleText, selection?.exclusions);
      const selectedHeroes = selectorValues(selectors?.heroImage)
        .flatMap(selector => Array.from(doc.querySelectorAll(selector)));
      const media = discoverReadingMedia(bodyRoots, selectedHeroes);
      const selectedSubtitle = selectorValues(selectors?.subtitle)
        .flatMap(selector => Array.from(doc.querySelectorAll(selector)))
        .find(element => !isSelectedContentExcluded(element, selection.exclusions));
      const standfirst = selection
        ? { element: selectedSubtitle || null, text: selectedSubtitle ? readArticleMetadataText(selectedSubtitle) : null }
        : extractStandfirst(mainContent, titleElement);
      const readingRoots = [...new Set([...bodyRoots, ...media.roots, ...(standfirst.element ? [standfirst.element] : [])])];
      const recommendationRegions = bodyRoots.flatMap(findRecommendationRegions);
      const publisherIgnores = bodyRoots.flatMap(root => Array.from(root.querySelectorAll('.instapaper_body .instapaper_ignore')));
      const interfaceRegions = bodyRoots.flatMap(findPublisherFormRegions).concat(recommendationRegions, publisherIgnores);
      const explicitFlowRoots = selection ? collectExplicitFlowRoots(bodyRoots) : undefined;
      /** @type {ExtractionState} */
      const state = {
        processedImages: new Set(),
        addedHeadings: new Set(),
        mainTitleText,
        titleElement,
        selectedTitleElement: bodyTitle || selectedTitleElement,
        standfirstElement: standfirst.element,
        standfirstText: standfirst.text,
        content: [],
        selectionExclusions: [...(selection?.exclusions || []), ...interfaceRegions],
        explicitFlowRoots,
        referenceRoots: readingRoots,
        tocRoots: selection?.tocRoots,
        featuredMediaRoots: media.featuredRoots,
        selectedIllustrations: media.selectedIllustrations,
        extractionDeadline,
        debugInfo
      };
      const allElements = [...new Set([...readingRoots.flatMap(root => collectCandidateElements(root)),
        ...(explicitFlowRoots || []), ...(standfirst.element ? [standfirst.element] : [])])]
        .filter(element => (!selection || !isSelectedContentExcluded(element, selection.exclusions)) &&
          !isSourceExcluded(element, interfaceRegions));
      const filteredElements = filterCandidateElements(win, allElements, constants, debugInfo, readingRoots, state.tocRoots, media.selectedIllustrations);
      const sortedElements = sortElementsInDomOrder(filteredElements);
      if (debugInfo) {
        debugInfo.foundElements = allElements.length;
        debugInfo.filteredElements = filteredElements.length;
      }
      pushDebugLog(debugInfo, 'READING_ROOTS_FOUND', {
        bodyRoots: bodyRoots.length, mediaRoots: media.roots.length, candidates: sortedElements.length
      });
      state.readingGraphics = await captureReadingGraphics(win, sortedElements, state, constants);
      for (const [figure, image] of await recoverDeferredFigureImages(sortedElements)) state.readingGraphics.set(figure, image);
      const content = parseElements(win, sortedElements, state, constants, baseUrl);
      const hasReadingContent = content.some(item => !['heading', 'separator'].includes(item.type));
      if (hasReadingContent && !selection && !content.some(item => item.type === 'image') && !hasSourceReadingMedia(readingRoots, constants.LOGO_PATTERNS)) {
        const image = extractMetadataImage(doc, baseUrl, constants.LOGO_PATTERNS);
        if (image) content.unshift({ type: 'image', ...image, isFeatured: true });
      }
      return { content, hasReadingContent, bodyTitle };
    };

    let attempt = primaryRoot ? await extractReadingRoots(selection?.matched ? selection.roots : [primaryRoot]) : null;
    if (selectorRecovered && !attempt?.content.some(hasArticleBodyContent)) attempt = null;
    if (selection?.roots.length && selection.roots.every(root =>
      !isSelectedContentExcluded(root, selection.exclusions) && isMediaOnlySelectionRoot(root))) {
      if (editorialScope && !selection.roots.includes(editorialScope)) {
        const wider = await extractReadingRoots(editorialScopes);
        if (wider.content.some(hasArticleBodyContent)) {
          attempt = wider;
          selectorRecovered = true;
        }
      }
    }
    if (!selection && !attempt?.hasReadingContent && !isEditorialOwner(primaryRoot)) {
      for (const root of findFallbackReadingRoots(win, doc, constants, primaryRoot ? [primaryRoot] : [])) {
        pushDebugLog(debugInfo, 'FALLBACK_READING_ROOT', { tagName: root.tagName, className: root.className });
        const alternative = await extractReadingRoots([root]);
        if (alternative.hasReadingContent) { attempt = alternative; break; }
        if (!attempt?.content.length) attempt = alternative;
      }
    }
    const content = attempt?.hasReadingContent ? attempt.content : [];
    const titleFragmentIds = content.length && metadata.title ? [...new Set(
      [titleElement, attempt?.bodyTitle].flatMap(element => readTitleFragmentIds(element, mainTitleText, selection?.exclusions))
    )] : [];

    // Final content types count
    if (debugInfo) {
      /** @type {Record<string, number>} */
      const contentTypes = {};
      for (const item of content) {
        contentTypes[item.type] = (contentTypes[item.type] || 0) + 1;
      }
      debugInfo.contentTypes = contentTypes;
    }
    
    pushDebugLog(debugInfo, 'EXTRACTION_COMPLETE', { itemCount: content.length });
    
    return {
      title: metadata.title,
      ...(titleFragmentIds.length ? { titleFragmentIds } : {}),
      author: metadata.author,
      publishDate: metadata.publishDate,
      detectedLanguage,
      ...(selection ? { selectorMatched: content.length > 0 } : {}),
      ...(selectorRecovered && content.length ? { selectorRecovered: true } : {}),
      content,
      debugInfo
    };
    
  } catch (error) {
    // Return error result
    const err = error instanceof Error ? error : new Error(String(error));
    
    pushDebugLog(debugInfo, 'EXTRACTION_ERROR', { 
      message: err.message, 
      stack: err.stack 
    });
    
    return {
      title: doc.title || '',
      author: '',
      publishDate: '',
      content: [],
      debugInfo,
      error: err.message,
      errorStack: err.stack
    };
  }
}

/** A title, standfirst or cover alone does not establish that the body was selected. */
function hasArticleBodyContent(item) {
  return !item.isFeatured && !item.isStandfirst && !['heading', 'separator', 'subtitle', 'image'].includes(item.type);
}

/** A cover wrapper may contain its own caption and credit. */
function isMediaOnlySelectionRoot(root) {
  const media = 'figure,figcaption,picture,img,video,audio,iframe,svg,canvas';
  if (root.matches(media)) return true;
  if (!root.querySelector(media)) return false;
  const copy = root.cloneNode(true);
  if (!(copy instanceof root.ownerDocument.defaultView.Element)) return false;
  for (const child of copy.querySelectorAll(media)) child.remove();
  return !copy.textContent?.trim();
}

/** Keep only source-owned targets still present in the readable title. */
function readLeadingDeclaredTitle(root, outerTitle, titleText, exclusions) {
  if (!root || !outerTitle || !titleText || root.contains(outerTitle)) return null;
  for (let owner = root; owner?.matches('article,main,section,div,header'); owner = owner.firstElementChild) {
    const heading = owner.firstElementChild;
    if (!heading) break;
    for (let node = owner.firstChild; node && node !== heading; node = node.nextSibling) {
      if (node.nodeType === 3 && node.textContent?.trim()) return null;
    }
    if (!heading.matches('h1,h2,h3,h4,h5,h6')) continue;
    return heading.matches('[itemprop~="headline"],[data-type="document-title"]') &&
      normalizeHeadingForDedup(readArticleMetadataText(heading, exclusions)) === titleText ? heading : null;
  }
  return null;
}

function readTitleFragmentIds(element, titleText, exclusions) {
  if (!element || isSourceExcluded(element, exclusions)) return [];
  const heading = element.closest('h1');
  if (heading && heading !== element && normalizeHeadingForDedup(readArticleMetadataText(heading)) === titleText) element = heading;
  return readSourceFragmentIds(element, exclusions);
}

// Re-export utilities for external use
export { CONSTANTS } from './constants.js';
