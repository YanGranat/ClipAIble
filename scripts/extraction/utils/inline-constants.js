// Utility to inline constants and patterns into extraction function
// Since extractAutomaticallyInlined runs in page context via executeScript,
// it cannot use imports - constants must be inlined

import * as patterns from '../patterns/exclusion-patterns.js';
import * as constants from '../constants/content-thresholds.js';

/**
 * Generate inlined constants object for use in extractAutomaticallyInlined
 * This object will be embedded directly in the function
 */
export function getInlinedConstants() {
  return {
    // Content thresholds
    MIN_CONTENT_LENGTH: constants.CONTENT_THRESHOLDS.MIN_CONTENT_LENGTH,
    SUBSTANTIAL_CONTENT_LENGTH: constants.CONTENT_THRESHOLDS.SUBSTANTIAL_CONTENT_LENGTH,
    MIN_PARAGRAPH_LENGTH: constants.CONTENT_THRESHOLDS.MIN_PARAGRAPH_LENGTH,
    MIN_HEADING_LENGTH: constants.CONTENT_THRESHOLDS.MIN_HEADING_LENGTH,
    MIN_STANDFIRST_LENGTH: constants.CONTENT_THRESHOLDS.MIN_STANDFIRST_LENGTH,
    MAX_STANDFIRST_LENGTH: constants.CONTENT_THRESHOLDS.MAX_STANDFIRST_LENGTH,
    SHORT_PARAGRAPH_THRESHOLD: constants.CONTENT_THRESHOLDS.SHORT_PARAGRAPH_THRESHOLD,
    VERY_SHORT_PARAGRAPH: constants.CONTENT_THRESHOLDS.VERY_SHORT_PARAGRAPH,
    MAX_AUTHOR_METADATA_LENGTH: constants.CONTENT_THRESHOLDS.MAX_AUTHOR_METADATA_LENGTH,
    MAX_WORD_COUNT_METADATA_LENGTH: constants.CONTENT_THRESHOLDS.MAX_WORD_COUNT_METADATA_LENGTH,
    
    // Image thresholds
    FEATURED_IMAGE_MIN_WIDTH: constants.IMAGE_THRESHOLDS.FEATURED_IMAGE_MIN_WIDTH,
    FEATURED_IMAGE_MIN_HEIGHT: constants.IMAGE_THRESHOLDS.FEATURED_IMAGE_MIN_HEIGHT,
    AUTHOR_PHOTO_MAX_SIZE: constants.IMAGE_THRESHOLDS.AUTHOR_PHOTO_MAX_SIZE,
    AUTHOR_PHOTO_SMALL_SIZE: constants.IMAGE_THRESHOLDS.AUTHOR_PHOTO_SMALL_SIZE,
    TRACKING_PIXEL_MAX_SIZE: constants.IMAGE_THRESHOLDS.TRACKING_PIXEL_MAX_SIZE,
    SMALL_ICON_MAX_SIZE: constants.IMAGE_THRESHOLDS.SMALL_ICON_MAX_SIZE,
    VERY_SMALL_IMAGE_SIZE: constants.IMAGE_THRESHOLDS.VERY_SMALL_IMAGE_SIZE,
    
    // Scoring thresholds
    MIN_CONTENT_SCORE: constants.SCORING_THRESHOLDS.MIN_CONTENT_SCORE,
    GOOD_ENOUGH_SCORE: constants.SCORING_THRESHOLDS.GOOD_ENOUGH_SCORE,
    HIGH_LINK_DENSITY: constants.SCORING_THRESHOLDS.HIGH_LINK_DENSITY,
    MEDIUM_LINK_DENSITY: constants.SCORING_THRESHOLDS.MEDIUM_LINK_DENSITY,
    LOW_LINK_DENSITY: constants.SCORING_THRESHOLDS.LOW_LINK_DENSITY,
    HIGH_COMMA_COUNT: constants.SCORING_THRESHOLDS.HIGH_COMMA_COUNT,
    MEDIUM_COMMA_COUNT: constants.SCORING_THRESHOLDS.MEDIUM_COMMA_COUNT,
    MIN_SENTENCE_COUNT: constants.SCORING_THRESHOLDS.MIN_SENTENCE_COUNT,
    
    // Patterns - convert to arrays for easier inlining
    NAVIGATION_PATTERNS_STARTS_WITH: patterns.NAVIGATION_PATTERNS.startsWith,
    NAVIGATION_PATTERNS_CONTAINS: patterns.NAVIGATION_PATTERNS.contains,
    
    // Paywall patterns - flatten all languages
    PAYWALL_PATTERNS: [
      ...patterns.PAYWALL_PATTERNS.english,
      ...patterns.PAYWALL_PATTERNS.russian,
      ...patterns.PAYWALL_PATTERNS.ukrainian,
      ...patterns.PAYWALL_PATTERNS.german,
      ...patterns.PAYWALL_PATTERNS.french,
      ...patterns.PAYWALL_PATTERNS.spanish,
      ...patterns.PAYWALL_PATTERNS.italian,
      ...patterns.PAYWALL_PATTERNS.portuguese,
      ...patterns.PAYWALL_PATTERNS.chinese,
      ...patterns.PAYWALL_PATTERNS.japanese,
      ...patterns.PAYWALL_PATTERNS.korean
    ],
    
    // Related articles patterns - flatten all languages
    RELATED_ARTICLES_PATTERNS: [
      ...patterns.RELATED_ARTICLES_PATTERNS.english,
      ...patterns.RELATED_ARTICLES_PATTERNS.russian,
      ...patterns.RELATED_ARTICLES_PATTERNS.ukrainian,
      ...patterns.RELATED_ARTICLES_PATTERNS.german,
      ...patterns.RELATED_ARTICLES_PATTERNS.french,
      ...patterns.RELATED_ARTICLES_PATTERNS.spanish,
      ...patterns.RELATED_ARTICLES_PATTERNS.italian,
      ...patterns.RELATED_ARTICLES_PATTERNS.portuguese,
      ...patterns.RELATED_ARTICLES_PATTERNS.chinese,
      ...patterns.RELATED_ARTICLES_PATTERNS.japanese,
      ...patterns.RELATED_ARTICLES_PATTERNS.korean
    ],
    
    COURSE_AD_PATTERNS: patterns.COURSE_AD_PATTERNS,
    NEWSLETTER_PATTERNS: patterns.NEWSLETTER_PATTERNS,
    EXCLUDED_CLASSES: patterns.EXCLUDED_CLASSES,
    PAYWALL_CLASSES: patterns.PAYWALL_CLASSES,
    LOGO_PATTERNS: patterns.LOGO_PATTERNS,
    TRACKING_PATTERNS: patterns.TRACKING_PATTERNS,
    PLACEHOLDER_PATTERNS: patterns.PLACEHOLDER_PATTERNS,
    
    // Selectors
    CONTENT_SELECTORS: constants.CONTENT_SELECTORS,
    STANDFIRST_SELECTORS: constants.STANDFIRST_SELECTORS,
    AUTHOR_SELECTORS: constants.AUTHOR_SELECTORS,
    DATE_SELECTORS: constants.DATE_SELECTORS,
    FEATURED_IMAGE_SELECTORS: constants.FEATURED_IMAGE_SELECTORS
  };
}

/**
 * Generate JavaScript code string for inlined constants
 * This can be embedded directly in extractAutomaticallyInlined
 */
export function generateInlinedConstantsCode() {
  const constants = getInlinedConstants();
  
  // Convert to JavaScript object literal string
  const code = `const CONSTANTS = ${JSON.stringify(constants, null, 2)};`;
  
  return code;
}

