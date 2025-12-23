// @ts-check
// Builder function to inline all modules into extractAutomaticallyInlined
// This generates a single string of code that can be embedded in the function

import * as utils from './utils.js';
import * as contentFinder from './content-finder.js';
import * as elementFilter from './element-filter.js';
import * as imageProcessor from './image-processor.js';
import * as metadataExtractor from './metadata-extractor.js';
import * as contentCleaner from './content-cleaner.js';
import { getInlinedConstants } from '../utils/inline-constants.js';

/**
 * Convert function to string and remove export keyword
 * @param {Function} fn - Function to convert
 * @returns {string} Function code string
 */
function functionToString(fn) {
  const fnStr = fn.toString();
  // Replace export function with function
  // Keep Module suffix for module functions
  return fnStr.replace(/^export\s+function\s+/, 'function ');
}

/**
 * Generate inlined code string for all helper functions
 * This will be embedded directly in extractAutomaticallyInlined
 * Functions are ordered by dependencies
 * @returns {string} JavaScript code string with all helper functions
 */
export function buildInlinedModules() {
  // Order matters: dependencies first
  // 1. Utils (no dependencies)
  const utilsCode = Object.entries(utils)
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
  
  // 2. Image processor (depends on utils for isPlaceholderUrl)
  const imageProcessorCode = Object.entries(imageProcessor)
    .map(([name, fn]) => {
      let code = functionToString(fn);
      // Fix dependencies - replace function calls with direct calls
      // isPlaceholderUrl is used in getBestSrcsetUrl and extractBestImageUrl
      // We'll need to handle this in the final assembly
      return code;
    })
    .join('\n\n');
  
  // 3. Content finder (depends on utils and element-filter)
  const contentFinderCode = Object.entries(contentFinder)
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
  
  // 4. Element filter (depends on utils)
  const elementFilterCode = Object.entries(elementFilter)
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
  
  // 5. Metadata extractor (no dependencies on other modules)
  const metadataExtractorCode = Object.entries(metadataExtractor)
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
  
  // 6. Content cleaner (depends on utils)
  const contentCleanerCode = Object.entries(contentCleaner)
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
  
  return `
// ============================================
// INLINED HELPER FUNCTIONS FROM MODULES
// ============================================

// Utils module
${utilsCode}

// Image processor module
${imageProcessorCode}

// Content finder module
${contentFinderCode}

// Element filter module
${elementFilterCode}

// Metadata extractor module
${metadataExtractorCode}

// Content cleaner module
${contentCleanerCode}
`;
}

/**
 * Generate complete inlined function code
 * This includes constants, patterns, and all helper functions
 * @returns {string} Complete function code
 */
export function buildCompleteInlinedFunction() {
  const constants = getInlinedConstants();
  const modulesCode = buildInlinedModules();
  
  // Generate constants code
  const constantsCode = `const CONSTANTS = ${JSON.stringify(constants, null, 2)};`;
  
  // Extract individual constants for easier access
  const constantsExtraction = `
// Extract constants for easier access
const {
  MIN_CONTENT_LENGTH,
  SUBSTANTIAL_CONTENT_LENGTH,
  MIN_PARAGRAPH_LENGTH,
  MIN_HEADING_LENGTH,
  MIN_STANDFIRST_LENGTH,
  MAX_STANDFIRST_LENGTH,
  SHORT_PARAGRAPH_THRESHOLD,
  VERY_SHORT_PARAGRAPH,
  MAX_AUTHOR_METADATA_LENGTH,
  MAX_WORD_COUNT_METADATA_LENGTH,
  FEATURED_IMAGE_MIN_WIDTH,
  FEATURED_IMAGE_MIN_HEIGHT,
  AUTHOR_PHOTO_MAX_SIZE,
  AUTHOR_PHOTO_SMALL_SIZE,
  TRACKING_PIXEL_MAX_SIZE,
  SMALL_ICON_MAX_SIZE,
  VERY_SMALL_IMAGE_SIZE,
  MIN_CONTENT_SCORE,
  GOOD_ENOUGH_SCORE,
  HIGH_LINK_DENSITY,
  MEDIUM_LINK_DENSITY,
  LOW_LINK_DENSITY,
  HIGH_COMMA_COUNT,
  MEDIUM_COMMA_COUNT,
  MIN_SENTENCE_COUNT
} = CONSTANTS;

// Extract patterns
const NAV_PATTERNS_CONTAINS = CONSTANTS.NAVIGATION_PATTERNS_CONTAINS;
const NAV_PATTERNS_STARTS_WITH = CONSTANTS.NAVIGATION_PATTERNS_STARTS_WITH;
const PAYWALL_PATTERNS = CONSTANTS.PAYWALL_PATTERNS;
const RELATED_PATTERNS = CONSTANTS.RELATED_ARTICLES_PATTERNS;
const COURSE_AD_PATTERNS = CONSTANTS.COURSE_AD_PATTERNS;
const EXCLUDED_CLASSES = CONSTANTS.EXCLUDED_CLASSES;
const PAYWALL_CLASSES = CONSTANTS.PAYWALL_CLASSES;
const LOGO_PATTERNS = CONSTANTS.LOGO_PATTERNS;
const TRACKING_PATTERNS = CONSTANTS.TRACKING_PATTERNS;
const PLACEHOLDER_PATTERNS = CONSTANTS.PLACEHOLDER_PATTERNS;

// Extract selectors
const CONTENT_SELECTORS = CONSTANTS.CONTENT_SELECTORS;
const STANDFIRST_SELECTORS = CONSTANTS.STANDFIRST_SELECTORS;
const AUTHOR_SELECTORS = CONSTANTS.AUTHOR_SELECTORS;
const DATE_SELECTORS = CONSTANTS.DATE_SELECTORS;
const FEATURED_IMAGE_SELECTORS = CONSTANTS.FEATURED_IMAGE_SELECTORS;
`;
  
  return `
${constantsCode}

${constantsExtraction}

${modulesCode}
`;
}

/**
 * Generate wrapper code that creates helper objects for dependency injection
 * This allows modules to use each other's functions
 * @returns {string} Wrapper code
 */
export function buildHelperObjects() {
  return `
// Create helper objects for dependency injection
const helpers = {
  isFootnoteLink,
  isIcon,
  toAbsoluteUrl,
  normalizeImageUrl
};

const constantsForModules = {
  EXCLUDED_CLASSES,
  PAYWALL_CLASSES,
  NAV_PATTERNS_CONTAINS,
  COURSE_AD_PATTERNS,
  LOGO_PATTERNS
};

// Wrap module functions to inject dependencies
// Note: Functions with Module suffix are from modules, wrapper functions use original names
const isExcludedWithDeps = (element) => isExcludedModule(element, constantsForModules, helpers);
const isNavigationParagraphWithDeps = (text) => isNavigationParagraphModule(text, NAV_PATTERNS_STARTS_WITH, PAYWALL_PATTERNS);
const isDecorativeImageWithDeps = (img) => isDecorativeImageModule(img, constantsForModules);
const extractBestImageUrlWithDeps = (imgElement) => extractBestImageUrlModule(imgElement, isPlaceholderUrlModule, getBestSrcsetUrlModule);
const getBestSrcsetUrlWithDeps = (srcset) => getBestSrcsetUrlModule(srcset, isPlaceholderUrlModule);
const calculateContentScoreWithDeps = (element) => calculateContentScoreModule(element, isLikelyContentContainerModule);
const findMainContentWithDeps = () => findMainContentModule(isExcludedWithDeps, isLikelyContentContainerModule, calculateContentScoreWithDeps);
const parseDateToISOWithDeps = (dateStr) => parseDateToISOModule(dateStr, getMonthNumberModule);
const cleanHtmlContentWithDeps = (element) => cleanHtmlContentModule(element, isFootnoteLink, isIcon);
`;
}
