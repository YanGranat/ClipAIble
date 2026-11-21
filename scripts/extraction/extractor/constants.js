// @ts-check
// Unified constants for extraction
// Imports from existing constants files and provides flat structure for inlining

import { CONTENT_THRESHOLDS, IMAGE_THRESHOLDS, SCORING_THRESHOLDS, CONTENT_SELECTORS, STANDFIRST_SELECTORS, AUTHOR_SELECTORS, DATE_SELECTORS, FEATURED_IMAGE_SELECTORS } from '../constants/content-thresholds.js';
import { NAVIGATION_PATTERNS, PAYWALL_PATTERNS, RELATED_ARTICLES_PATTERNS, COURSE_AD_PATTERNS, EXCLUDED_CLASSES, PAYWALL_CLASSES, LOGO_PATTERNS, TRACKING_PATTERNS, PLACEHOLDER_PATTERNS } from '../patterns/exclusion-patterns.js';

export const CANDIDATE_SELECTOR = 'article,section,main,aside,body,h1,h2,h3,h4,h5,h6,p,img,svg,canvas,iframe,video,audio,figure,figcaption,blockquote,pre,code,ul,ol,dl,dt,dd,table,td,th,div,hr';

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
