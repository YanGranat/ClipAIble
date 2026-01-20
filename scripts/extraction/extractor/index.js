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
import { collectCandidateElements, filterCandidateElements, sortElementsInDomOrder, parseElements, deduplicateHeadings } from './parse.js';
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
export async function runExtraction(baseUrl, enableDebugInfo = false) {
  // Get window and document
  const win = window;
  const doc = document;
  
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
      await waitForContentLoad(doc);
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
      debugInfo
    };
    
    // Add main title to seen headings
    if (mainTitleText) {
      state.addedHeadings.add(mainTitleText);
    }
    
    // Try Twitter/X extraction first
    const twitterContent = tryExtractTwitterX(win, doc, state, constants, baseUrl);
    if (twitterContent && twitterContent.length > 0) {
      return {
        title: metadata.title,
        author: metadata.author,
        publishDate: metadata.publishDate,
        content: deduplicateHeadings(twitterContent),
        debugInfo
      };
    }
    
    // Find main content container
    const mainContent = findMainContent(win, doc, (el) => isExcluded(win, el, constants));
    
    pushDebugLog(debugInfo, 'MAIN_CONTENT_FOUND', {
      found: !!mainContent,
      tagName: mainContent?.tagName,
      className: mainContent?.className,
      textLength: mainContent?.textContent?.length || 0
    });
    
    // Extract featured image
    const featuredImage = extractFeaturedImage(doc, baseUrl, mainContent, CONSTANTS.LOGO_PATTERNS || []);
    
    // Extract standfirst
    const standfirstResult = extractStandfirst(mainContent);
    state.standfirstElement = standfirstResult.element;
    state.standfirstText = standfirstResult.text;
    
    // Initialize content array
    let content = [];
    
    // Add featured image if found
    if (featuredImage) {
      const normalizedFeaturedSrc = normalizeImageUrl(featuredImage.src);
      state.processedImages.add(normalizedFeaturedSrc);
      
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
        isStandfirst: true
      });
    }
    
    // Main extraction path
    if (mainContent) {
      // Collect candidate elements
      const allElements = collectCandidateElements(mainContent, win);
      
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
    if (content.length === 0 || (content.length === 1 && content[0].type === 'image')) {
      pushDebugLog(debugInfo, 'LAST_RESORT_FALLBACK', {});
      
      // Last resort: search for best container
      const lastResortContent = extractLastResortContainerSearch(win, doc, state, constants, baseUrl);
      if (lastResortContent) {
        content.push(...lastResortContent);
      }
    }
    
    // Ultimate fallback: all paragraphs
    if (content.length === 0 || (content.length === 1 && content[0].type === 'image')) {
      pushDebugLog(debugInfo, 'ULTIMATE_FALLBACK', {});
      
      const ultimateContent = extractUltimateFallbackAllParagraphs(win, doc, state, constants);
      if (ultimateContent) {
        content.push(...ultimateContent);
      }
    }
    
    // Emergency fallback
    if (content.length === 0) {
      pushDebugLog(debugInfo, 'EMERGENCY_FALLBACK', {});
      
      const emergencyContent = extractEmergencyFallback(win, doc, state, constants, mainContent);
      if (emergencyContent) {
        content.push(...emergencyContent);
      }
    }
    
    // Deduplicate headings
    content = deduplicateHeadings(content);
    
    // Final content types count
    if (debugInfo) {
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
