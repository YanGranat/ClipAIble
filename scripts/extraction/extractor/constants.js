// @ts-check
// Unified constants for extraction
// Imports from existing constants files and provides flat structure for inlining

import { CONTENT_THRESHOLDS, IMAGE_THRESHOLDS, SCORING_THRESHOLDS, CONTENT_SELECTORS, STANDFIRST_SELECTORS, AUTHOR_SELECTORS, DATE_SELECTORS, FEATURED_IMAGE_SELECTORS } from '../constants/content-thresholds.js';
import { NAVIGATION_PATTERNS, PAYWALL_PATTERNS, RELATED_ARTICLES_PATTERNS, COURSE_AD_PATTERNS, EXCLUDED_CLASSES, PAYWALL_CLASSES, LOGO_PATTERNS, TRACKING_PATTERNS, PLACEHOLDER_PATTERNS } from '../patterns/exclusion-patterns.js';

/**
 * Flatten paywall patterns from language-keyed object to array
 * @param {Record<string, string[]>} patterns - Patterns by language
 * @returns {string[]} - Flat array of all patterns
 */
function flattenPatterns(patterns) {
  return Object.values(patterns).flat();
}

/**
 * All constants needed for extraction
 * This object is used for inlining into the monolithic function
 */
export const CONSTANTS = {
  // Content thresholds
  ...CONTENT_THRESHOLDS,
  
  // Image thresholds
  ...IMAGE_THRESHOLDS,
  
  // Scoring thresholds
  ...SCORING_THRESHOLDS,
  
  // Navigation patterns (flattened for direct access)
  NAVIGATION_PATTERNS_CONTAINS: NAVIGATION_PATTERNS.contains,
  NAVIGATION_PATTERNS_STARTS_WITH: NAVIGATION_PATTERNS.startsWith,
  
  // Paywall patterns (flattened)
  PAYWALL_PATTERNS: flattenPatterns(PAYWALL_PATTERNS),
  
  // Related articles patterns (flattened)
  RELATED_ARTICLES_PATTERNS: flattenPatterns(RELATED_ARTICLES_PATTERNS),
  
  // Course ad patterns
  COURSE_AD_PATTERNS,
  
  // Excluded classes
  EXCLUDED_CLASSES,
  
  // Paywall classes
  PAYWALL_CLASSES,
  
  // Logo patterns
  LOGO_PATTERNS,
  
  // Tracking patterns
  TRACKING_PATTERNS,
  
  // Placeholder patterns
  PLACEHOLDER_PATTERNS,
  
  // Selectors
  CONTENT_SELECTORS,
  STANDFIRST_SELECTORS,
  AUTHOR_SELECTORS,
  DATE_SELECTORS,
  FEATURED_IMAGE_SELECTORS
};

// Re-export individual constants for direct imports
export {
  CONTENT_THRESHOLDS,
  IMAGE_THRESHOLDS,
  SCORING_THRESHOLDS,
  NAVIGATION_PATTERNS,
  PAYWALL_PATTERNS,
  RELATED_ARTICLES_PATTERNS,
  COURSE_AD_PATTERNS,
  EXCLUDED_CLASSES,
  PAYWALL_CLASSES,
  LOGO_PATTERNS,
  TRACKING_PATTERNS,
  PLACEHOLDER_PATTERNS,
  CONTENT_SELECTORS,
  STANDFIRST_SELECTORS,
  AUTHOR_SELECTORS,
  DATE_SELECTORS,
  FEATURED_IMAGE_SELECTORS
};

/**
 * Generate inlined constants code string for build process
 * @returns {string} - JavaScript code string defining all constants
 */
export function getInlinedConstantsCode() {
  const navContains = NAVIGATION_PATTERNS.contains.map(r => r.toString()).join(',\n      ');
  const navStartsWith = NAVIGATION_PATTERNS.startsWith.map(r => r.toString()).join(',\n      ');
  const paywallFlat = flattenPatterns(PAYWALL_PATTERNS);
  const relatedFlat = flattenPatterns(RELATED_ARTICLES_PATTERNS);
  
  return `
    // ============================================
    // INLINED CONSTANTS AND PATTERNS
    // (Generated from scripts/extraction/extractor/constants.js)
    // ============================================
    
    // Content thresholds
    const MIN_CONTENT_LENGTH = ${CONTENT_THRESHOLDS.MIN_CONTENT_LENGTH};
    const SUBSTANTIAL_CONTENT_LENGTH = ${CONTENT_THRESHOLDS.SUBSTANTIAL_CONTENT_LENGTH};
    const MIN_PARAGRAPH_LENGTH = ${CONTENT_THRESHOLDS.MIN_PARAGRAPH_LENGTH};
    const MIN_HEADING_LENGTH = ${CONTENT_THRESHOLDS.MIN_HEADING_LENGTH};
    const MIN_STANDFIRST_LENGTH = ${CONTENT_THRESHOLDS.MIN_STANDFIRST_LENGTH};
    const MAX_STANDFIRST_LENGTH = ${CONTENT_THRESHOLDS.MAX_STANDFIRST_LENGTH};
    const SHORT_PARAGRAPH_THRESHOLD = ${CONTENT_THRESHOLDS.SHORT_PARAGRAPH_THRESHOLD};
    const VERY_SHORT_PARAGRAPH = ${CONTENT_THRESHOLDS.VERY_SHORT_PARAGRAPH};
    const MAX_AUTHOR_METADATA_LENGTH = ${CONTENT_THRESHOLDS.MAX_AUTHOR_METADATA_LENGTH};
    const MAX_WORD_COUNT_METADATA_LENGTH = ${CONTENT_THRESHOLDS.MAX_WORD_COUNT_METADATA_LENGTH};
    
    // Image thresholds
    const FEATURED_IMAGE_MIN_WIDTH = ${IMAGE_THRESHOLDS.FEATURED_IMAGE_MIN_WIDTH};
    const FEATURED_IMAGE_MIN_HEIGHT = ${IMAGE_THRESHOLDS.FEATURED_IMAGE_MIN_HEIGHT};
    const AUTHOR_PHOTO_MAX_SIZE = ${IMAGE_THRESHOLDS.AUTHOR_PHOTO_MAX_SIZE};
    const AUTHOR_PHOTO_SMALL_SIZE = ${IMAGE_THRESHOLDS.AUTHOR_PHOTO_SMALL_SIZE};
    const TRACKING_PIXEL_MAX_SIZE = ${IMAGE_THRESHOLDS.TRACKING_PIXEL_MAX_SIZE};
    
    // Scoring thresholds
    const MIN_CONTENT_SCORE = ${SCORING_THRESHOLDS.MIN_CONTENT_SCORE};
    const GOOD_ENOUGH_SCORE = ${SCORING_THRESHOLDS.GOOD_ENOUGH_SCORE};
    
    // Navigation patterns (contains)
    const NAV_PATTERNS_CONTAINS = [
      ${navContains}
    ];
    
    // Navigation patterns (starts with)
    const NAV_PATTERNS_STARTS_WITH = [
      ${navStartsWith}
    ];
    
    // Paywall patterns (flattened)
    const PAYWALL_PATTERNS = ${JSON.stringify(paywallFlat, null, 6).replace(/\n/g, '\n    ')};
    
    // Related articles patterns (flattened)
    const RELATED_PATTERNS = ${JSON.stringify(relatedFlat, null, 6).replace(/\n/g, '\n    ')};
    
    // Course ad patterns
    const COURSE_AD_PATTERNS = ${JSON.stringify(COURSE_AD_PATTERNS, null, 6).replace(/\n/g, '\n    ')};
    
    // Excluded classes
    const EXCLUDED_CLASSES = ${JSON.stringify(EXCLUDED_CLASSES, null, 6).replace(/\n/g, '\n    ')};
    
    // Paywall classes
    const PAYWALL_CLASSES = ${JSON.stringify(PAYWALL_CLASSES, null, 6).replace(/\n/g, '\n    ')};
    
    // Logo patterns
    const LOGO_PATTERNS = ${JSON.stringify(LOGO_PATTERNS, null, 6).replace(/\n/g, '\n    ')};
    
    // Standfirst selectors (used by standfirst.js)
    const STANDFIRST_SELECTORS = [
      '.standfirst', '.subtitle', '.deck', '.lede', '.intro', '.article__subhead',
      '[class*="standfirst"]', '[class*="subtitle"]', '[class*="deck"]',
      '[class*="intro"]', '[class*="summary"]', '[class*="subhead"]'
    ];
    
    // Candidate element selector (used by parse.js)
    const CANDIDATE_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, img, figure, blockquote, pre, code, ul, ol, table';
    
    // CONSTANTS object (used by runExtraction)
    const CONSTANTS = {
      EXCLUDED_CLASSES,
      PAYWALL_CLASSES,
      NAVIGATION_PATTERNS_CONTAINS: NAV_PATTERNS_CONTAINS,
      NAV_PATTERNS_STARTS_WITH,
      COURSE_AD_PATTERNS,
      PAYWALL_PATTERNS,
      LOGO_PATTERNS
    };
    
    // ============================================
    // END OF INLINED CONSTANTS
    // ============================================
`;
}
