// @ts-check
// Main orchestrator for automatic extraction
// Coordinates all extraction modules and provides the main entry point

import { createDebugInfo, pushDebugLog, logExtractionStart, logHtmlState } from './debug.js';
import { waitForContentLoad } from './spa.js';
import { detectGoogleTranslateState, checkFirstParagraph } from './translate.js';
import { extractMetadata } from './metadata.js';
import { findMainContent } from './discover.js';
import { extractFeaturedImage } from './images.js';
import { normalizeImageUrl } from './dom-utils.js';
import { extractStandfirst } from './standfirst.js';
import { collectCandidateElements, filterCandidateElements, sortElementsInDomOrder, parseElements, createImageItem } from './parse.js';
import { resolveContentSelection, isSelectedContentExcluded, readSelectedText, selectorValues } from './selectors.js';
import { isExcluded } from './filters.js';
import { normalizeHeadingForDedup } from './text-utils.js';
import { tryExtractTwitterX, extractWhenMainContentMissing, extractLastResortContainerSearch, extractUltimateFallbackAllParagraphs, extractEmergencyFallback } from './fallbacks.js';
import { CONSTANTS, getInlinedConstantsCode } from './constants.js';

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
    const metadata = extractMetadata(doc, baseUrl);
    const selection = selectors ? resolveContentSelection(doc, selectors) : null;
    if (selectors) {
      if (!selection.matched) return { ...metadata, content: [], selectorMatched: false, debugInfo };
      metadata.title = readSelectedText(doc, selectors.title) || metadata.title;
    }
    const language = (doc.documentElement.lang || '').trim().toLowerCase().split(/[-_]/)[0];
    const detectedLanguage = /^[a-z]{2,3}$/.test(language) ? (language === 'ua' ? 'uk' : language) : undefined;
    const mainTitleText = normalizeHeadingForDedup(metadata.title);
    
    pushDebugLog(debugInfo, 'METADATA_EXTRACTED', metadata);
    
    // Initialize extraction state
    /** @type {ExtractionState} */
    const state = {
      processedImages: new Set(),
      addedHeadings: new Set(),
      mainTitleText,
      standfirstElement: null,
      standfirstText: null,
      content: [],
      selectionExclusions: selectors ? selectorValues(selectors.exclude) : [],
      debugInfo
    };
    
    // Try Twitter/X extraction first
    const twitterContent = selectors ? null : tryExtractTwitterX(win, doc, state, constants, baseUrl);
    if (twitterContent && twitterContent.length > 0) {
      return {
        title: metadata.title,
        author: metadata.author,
        publishDate: metadata.publishDate,
        content: twitterContent,
        debugInfo
      };
    }
    
    // Find main content container
    const mainContent = selection?.roots[0] || findMainContent(win, doc, (el) => isExcluded(win, el, constants));
    
    pushDebugLog(debugInfo, 'MAIN_CONTENT_FOUND', {
      found: !!mainContent,
      tagName: mainContent?.tagName,
      className: mainContent?.className,
      textLength: mainContent?.textContent?.length || 0
    });
    
    // Extract featured image
    const selectedHero = selectors?.heroImage ? selectorValues(selectors.heroImage)
      .flatMap(selector => Array.from(doc.querySelectorAll(selector)))
      .find(node => node.tagName === 'IMG' && !isSelectedContentExcluded(node, selection.exclusions)) : null;
    const featuredImage = selection
      ? (selectedHero ? createImageItem(win, selectedHero, state, constants, baseUrl) : null)
      : extractFeaturedImage(doc, baseUrl, mainContent, CONSTANTS.LOGO_PATTERNS || []);
    
    // Extract standfirst
    const selectedSubtitle = selectors?.subtitle ? selectorValues(selectors.subtitle).map(selector => doc.querySelector(selector)).find(Boolean) : null;
    const standfirstResult = selection
      ? { text: selectedSubtitle?.textContent?.trim() || null, element: selectedSubtitle }
      : extractStandfirst(mainContent);
    state.standfirstElement = standfirstResult.element;
    state.standfirstText = standfirstResult.text;
    
    // Initialize content array
    /** @type {import('./types.js').ContentItem[]} */
    let content = [];
    
    // Add featured image if found
    if (featuredImage) {
      const normalizedFeaturedSrc = normalizeImageUrl(featuredImage.src);

      // Prevent memory leaks: limit processed images set size
      if (state.processedImages.size < 1000) {
        state.processedImages.add(normalizedFeaturedSrc);
      }
      
      content.push({
        type: 'image',
        src: featuredImage.src,
        alt: featuredImage.alt,
        caption: featuredImage.caption,
        isFeatured: true
      });
    }
    
    // Add standfirst if found
    if (state.standfirstText) {
      content.push({
        type: 'subtitle',
        text: state.standfirstText,
        format: 'text',
        isStandfirst: true
      });
    }
    
    // Main extraction path
    if (mainContent) {
      // Collect candidate elements
      const allElements = selection
        ? selection.elements.filter(element => !isSelectedContentExcluded(element, selection.exclusions))
        : collectCandidateElements(mainContent, win);
      
      if (debugInfo) {
        debugInfo.foundElements = allElements.length;
      }
      
      // Filter elements
      const filteredElements = filterCandidateElements(win, allElements, constants, debugInfo);
      
      if (debugInfo) {
        debugInfo.filteredElements = filteredElements.length;
      }
      
      // Sort in DOM order
      const sortedElements = sortElementsInDomOrder(filteredElements);
      
      // Parse elements into content items
      const parsedContent = parseElements(win, sortedElements, state, constants, baseUrl);
      content.push(...parsedContent);
    } else {
      // Fallback when main content not found
      pushDebugLog(debugInfo, 'MAIN_CONTENT_MISSING_FALLBACK', {});
      
      const fallbackContent = extractWhenMainContentMissing(win, doc, state, constants, baseUrl);
      if (fallbackContent) {
        content.push(...fallbackContent);
      }
    }
    
    // If content is still empty, try additional fallbacks
    if (!selection && (content.length === 0 || (content.length === 1 && content[0].type === 'image'))) {
      pushDebugLog(debugInfo, 'LAST_RESORT_FALLBACK', {});
      
      // Last resort: search for best container
      const lastResortContent = extractLastResortContainerSearch(win, doc, state, constants, baseUrl);
      if (lastResortContent) {
        content.push(...lastResortContent);
      }
    }
    
    // Ultimate fallback: all paragraphs
    if (!selection && (content.length === 0 || (content.length === 1 && content[0].type === 'image'))) {
      pushDebugLog(debugInfo, 'ULTIMATE_FALLBACK', {});
      
      const ultimateContent = extractUltimateFallbackAllParagraphs(win, doc, state, constants);
      if (ultimateContent) {
        content.push(...ultimateContent);
      }
    }
    
    // Emergency fallback
    if (!selection && content.length === 0) {
      pushDebugLog(debugInfo, 'EMERGENCY_FALLBACK', {});
      
      const emergencyContent = extractEmergencyFallback(win, doc, state, constants, mainContent);
      if (emergencyContent) {
        content.push(...emergencyContent);
      }
    }
    
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
      author: metadata.author,
      publishDate: metadata.publishDate,
      detectedLanguage,
      ...(selection ? { selectorMatched: true } : {}),
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

// Re-export utilities for external use
export { getInlinedConstantsCode } from './constants.js';
export { CONSTANTS } from './constants.js';
