// @ts-check
// Heading classifier - improved scoring system with negative scores and adaptive thresholds
// FIXES v2 problems: validation, adaptive thresholds, negative scores, gap after analysis

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { 
  HEADING_DETECTION, 
  HEADING_SCORES, 
  HEADING_THRESHOLDS,
  HEADING_GAP_ANALYSIS,
  FONT_SIZE_THRESHOLDS,
  ELEMENT_DECISION,
  DEFAULT_METRICS
} from '../constants.js';
import { CAPITAL_START_PATTERN, LOWERCASE_START_PATTERN } from '../utils/regex-patterns.js';

/**
 * Validate and clamp font size values
 * FIXES v2 problem: no validation of input data
 * 
 * @param {number|undefined|null} fontSize - Font size to validate
 * @param {number} baseFontSize - Base font size for fallback
 * @returns {number} Validated font size
 */
function validateFontSize(fontSize, baseFontSize) {
  if (typeof fontSize !== 'number' || !isFinite(fontSize) || fontSize <= 0) {
    return baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  }
  // Clamp to reasonable range (0.1 to 1000)
  return Math.max(0.1, Math.min(1000, fontSize));
}

/**
 * Calculate font size ratio with validation
 * FIXES v2 problem: division by zero, NaN, Infinity
 * 
 * @param {number} fontSize - Element font size
 * @param {number} baseFontSize - Base font size
 * @returns {number} Font size ratio (clamped to 0.1-10.0)
 */
function calculateFontSizeRatio(fontSize, baseFontSize) {
  const validFontSize = validateFontSize(fontSize, baseFontSize);
  const validBaseSize = validateFontSize(baseFontSize, FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE);
  
  if (validBaseSize <= 0) {
    return 1.0;
  }
  
  const ratio = validFontSize / validBaseSize;
  // Clamp to reasonable range
  return Math.max(0.1, Math.min(10.0, ratio));
}

/**
 * Count words in text (handles Unicode spaces)
 * FIXES v2 problem: doesn't handle Unicode spaces
 * 
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  // Use Unicode whitespace pattern
  const words = text.trim().split(/\p{Z}+/u).filter(w => w.length > 0);
  return words.length;
}

/**
 * Check if text is a numbered heading (e.g., "1.", "2.1.", "2.1.1.")
 * Works for all languages (universal pattern)
 * 
 * @param {string} text - Text to check
 * @param {number} fontSizeRatio - Font size ratio
 * @returns {boolean} True if numbered heading
 */
function isNumberedHeading(text, fontSizeRatio) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  // Universal pattern: number(s) followed by dot or parenthesis
  const numberedPattern = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?[\.\)]\s+/;
  const match = numberedPattern.test(text.trim());
  
  // Also check font size - numbered headings are usually larger
  return match && fontSizeRatio >= HEADING_THRESHOLDS.MIN_FONT_SIZE_RATIO;
}

/**
 * Check if heading by font size
 * FIXES v2 problem: adaptive threshold, not hardcoded
 * 
 * @param {number} fontSizeRatio - Font size ratio
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {{fontSize?: number, text?: string, [key: string]: any}} element - Element to check
 * @returns {boolean} True if heading by size
 */
function isHeadingBySize(fontSizeRatio, metrics, element) {
  const textLength = (element.text || '').length;
  const isShortText = textLength < HEADING_THRESHOLDS.MAX_HEADING_LENGTH; // < 100
  const isVeryShortText = textLength < ELEMENT_DECISION.VERY_SHORT_TEXT;
  
  // IMPROVED: More aggressive detection for short texts
  // If text is very short (< 50) and font is at least 5% larger, it's likely a heading
  if (isVeryShortText && fontSizeRatio >= 1.05) {
    return true;
  }
  
  // If text is short (< 100) and font is at least 10% larger, it's likely a heading
  if (isShortText && fontSizeRatio >= 1.1) {
    return true;
  }
  
  // For longer texts, use adaptive threshold based on document variability
  const threshold = metrics.fontSizeVariability > 0.3 
    ? HEADING_THRESHOLDS.STRONG_FONT_SIZE_RATIO  // 1.35 for high variability
    : HEADING_THRESHOLDS.MIN_FONT_SIZE_RATIO;     // 1.3 for low variability
  
  // Must be significantly larger OR have additional indicators
  return fontSizeRatio >= threshold && (
    fontSizeRatio >= HEADING_THRESHOLDS.STRONG_FONT_SIZE_RATIO ||
    element.isBold ||
    element.isItalic ||
    isShortText
  );
}

/**
 * Check if heading by style (bold/italic)
 * 
 * @param {{isBold?: boolean, isItalic?: boolean, text?: string, fontSize?: number, gapAfter?: number, [key: string]: any}} element - Element to check
 * @returns {boolean} True if heading by style
 */
function isHeadingByStyle(element) {
  return element.isBold || element.isItalic;
}

/**
 * Check if heading by colon pattern
 * 
 * @param {string} text - Text to check
 * @param {number} textLength - Text length
 * @returns {boolean} True if heading by colon
 */
function isHeadingByColon(text, textLength) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return text.trim().endsWith(':') && 
         textLength < HEADING_DETECTION.MAX_LENGTH_WITH_COLON;
}

/**
 * Check if heading by gap after (NEW - fixes v2 problem)
 * Headings typically have large gaps after them
 * 
 * @param {{isBold?: boolean, isItalic?: boolean, text?: string, fontSize?: number, gapAfter?: number, [key: string]: any}} element - Element to check
 * @param {{baseFontSize?: number, fontSizeVariability?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} True if heading by gap after
 */
function isHeadingByGapAfter(element, metrics) {
  const gapAfter = element.gapAfter;
  
  // Must have gap information
  if (gapAfter === null || gapAfter === undefined) {
    return false;
  }
  
  // Check if gap is significant (relative to paragraph gap)
  const gapAnalysis = metrics.gapAnalysis;
  if (gapAnalysis && gapAnalysis.paragraphGapMin) {
    const significantGap = gapAnalysis.paragraphGapMin * HEADING_GAP_ANALYSIS.SIGNIFICANT_GAP_MULTIPLIER;
    return gapAfter >= significantGap;
  }
  
  // Fallback: absolute threshold
  return gapAfter >= HEADING_GAP_ANALYSIS.MIN_GAP_FOR_HEADING;
}

/**
 * Check if heading by visual isolation (NEW - fixes v2 problem)
 * Headings are visually isolated (large space above and below)
 * 
 * @param {{isBold?: boolean, isItalic?: boolean, text?: string, fontSize?: number, gapAfter?: number, [key: string]: any}} element - Element to check
 * @param {{metrics?: {baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}, [key: string]: any}} context - Element context
 * @returns {boolean} True if visually isolated
 */
function isHeadingByVisualIsolation(element, context) {
  // This will be implemented in future phase
  // For now, use gap after as proxy
  return isHeadingByGapAfter(element, context.metrics);
}

/**
 * Check if heading by short capital text
 * 
 * @param {string} text - Text to check
 * @param {number} fontSizeRatio - Font size ratio
 * @param {number} textLength - Text length
 * @returns {boolean} True if short capital heading
 */
function isHeadingByShortCapital(text, fontSizeRatio, textLength) {
  if (!text || typeof text !== 'string' || textLength === 0) {
    return false;
  }
  
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  
  // Must start with capital letter and be short
  return CAPITAL_START_PATTERN.test(trimmed) &&
         textLength < HEADING_DETECTION.MAX_LENGTH_CAPITAL &&
         fontSizeRatio >= HEADING_THRESHOLDS.MIN_FONT_SIZE_RATIO;
}

/**
 * Check if heading by position (first element or after heading)
 * 
 * @param {{metrics?: {baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}, [key: string]: any}} context - Element context
 * @returns {boolean} True if heading by position
 */
function isHeadingByPosition(context) {
  return context.isFirst || context.prevWasHeading;
}

/**
 * Check if multi-word capital heading
 * 
 * @param {string} text - Text to check
 * @param {number} fontSizeRatio - Font size ratio
 * @param {number} wordCount - Word count
 * @returns {boolean} True if multi-word capital heading
 */
function isMultiWordCapitalHeading(text, fontSizeRatio, wordCount) {
  if (!text || typeof text !== 'string' || wordCount < 2) {
    return false;
  }
  
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  
  // Must start with capital, have 2-6 words, and larger font
  return CAPITAL_START_PATTERN.test(trimmed) &&
         wordCount >= 2 &&
         wordCount <= 6 &&
         fontSizeRatio >= HEADING_THRESHOLDS.STRONG_FONT_SIZE_RATIO;
}

/**
 * Check if heading after list
 * 
 * @param {{metrics?: {baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}, [key: string]: any}} context - Element context
 * @returns {boolean} True if heading after list
 */
function isHeadingAfterList(context) {
  return context.prevWasList || false;
}

/**
 * Check if element is a list (for exclusion)
 * 
 * @param {{isBold?: boolean, isItalic?: boolean, text?: string, fontSize?: number, gapAfter?: number, [key: string]: any}} element - Element to check
 * @param {string} text - Element text
 * @returns {boolean} True if list
 */
function isList(element, text) {
  // Check if already classified as list
  if (element.type === 'list') {
    return true;
  }
  
  // Check for list patterns (universal, no language-specific)
  const listPattern = /^[\s]*([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;
  return listPattern.test(text || '');
}

/**
 * Calculate adaptive threshold based on document statistics
 * FIXES v2 problem: hardcoded thresholds (3, 5)
 * 
 * @param {{baseFontSize?: number, fontSizeVariability?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @param {{metrics?: {baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}, [key: string]: any}} context - Element context
 * @returns {number} Adaptive threshold
 */
function calculateAdaptiveThreshold(metrics, context) {
  const baseFontSize = metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const fontSizeVariability = metrics.fontSizeVariability || 0;
  
  // Base threshold depends on variability
  // High variability = clear hierarchy → lower threshold
  // Low variability = homogeneous → higher threshold
  let baseThreshold = fontSizeVariability > 0.3 
    ? HEADING_THRESHOLDS.HIGH_VARIABILITY_THRESHOLD
    : HEADING_THRESHOLDS.LOW_VARIABILITY_THRESHOLD;
  
  // Adjustment based on font size
  // Small fonts need higher threshold (more strict)
  // Large fonts can use lower threshold (more lenient)
  const sizeAdjustment = baseFontSize < 10 
    ? HEADING_THRESHOLDS.SMALL_FONT_ADJUSTMENT
    : baseFontSize > 16 
      ? HEADING_THRESHOLDS.LARGE_FONT_ADJUSTMENT 
      : 0;
  
  // Additional adjustment for homogeneous documents
  const structure = context.structure;
  const homogeneousAdjustment = (structure && structure.isHomogeneous && !structure.likelyHasHeadings)
    ? HEADING_THRESHOLDS.HOMOGENEOUS_BONUS
    : 0;
  
  return baseThreshold + sizeAdjustment + homogeneousAdjustment;
}

/**
 * Calculate heading score with positive and negative indicators
 * FIXES v2 problems: adds negative scores, adaptive thresholds, validation
 * 
 * @param {{text?: string, fontSize?: number, isBold?: boolean, isItalic?: boolean, gapAfter?: number, [key: string]: any}} element - Element to classify
 * @param {{baseFontSize?: number, fontSizeVariability?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @param {{metrics?: {baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}, [key: string]: any}} context - Element context
 * @returns {{isHeading: boolean, score: number, [key: string]: any}} Score result with isHeading flag
 */
function calculateHeadingScore(element, metrics, context) {
  // VALIDATION: Input data (fixes v2 problem)
  const fontSize = validateFontSize(element.fontSize, metrics.baseFontSize);
  const text = String(element.text || '').trim();
  const textLength = text.length;
  const wordCount = countWords(text);
  const fontSizeRatio = calculateFontSizeRatio(fontSize, metrics.baseFontSize);
  
  // ===== POSITIVE INDICATORS =====
  let headingScore = 0;
  
  // Very strong indicators - check first (highest priority)
  if (isNumberedHeading(text, fontSizeRatio)) {
    headingScore += HEADING_SCORES.NUMBERED_HEADING;
  }
  
  // NEW: Short text with large font is VERY STRONG indicator
  if (textLength < ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH && fontSizeRatio >= 1.2) {
    headingScore += HEADING_SCORES.SHORT_LARGE_FONT;
  }
  
  // NEW: List heading pattern - text ending with colon followed by list
  // This is a strong indicator of a subheading (usually H3)
  const isListHeading = element.isListHeading || element.followedByList || false;
  const endsWithColon = text.endsWith(':');
  const isShortWithColon = endsWithColon && textLength < ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH;
  
  if (isListHeading || (isShortWithColon && context.nextIsList)) {
    // Strong boost for list headings (subheadings that introduce lists)
    headingScore += HEADING_SCORES.SHORT_LARGE_FONT; // Same boost as short large font
    log(`[PDF v3] calculateHeadingScore: List heading detected - text="${text.substring(0, 50)}", isListHeading=${isListHeading}, followedByList=${element.followedByList}, nextIsList=${context.nextIsList}`);
  }
  
  // Strong indicators
  if (isHeadingBySize(fontSizeRatio, metrics, element)) {
    headingScore += HEADING_SCORES.HEADING_BY_SIZE;
  }
  if (isMultiWordCapitalHeading(text, fontSizeRatio, wordCount)) {
    headingScore += HEADING_SCORES.MULTI_WORD_CAPITAL;
  }
  if (isHeadingAfterList(context)) {
    headingScore += HEADING_SCORES.HEADING_AFTER_LIST;
  }
  
  // Moderate indicators
  if (isHeadingByStyle(element)) {
    headingScore += HEADING_SCORES.HEADING_BY_STYLE;
  }
  if (isHeadingByColon(text, textLength)) {
    headingScore += HEADING_SCORES.HEADING_BY_COLON;
  }
  if (isHeadingByGapAfter(element, metrics)) {
    headingScore += HEADING_SCORES.HEADING_BY_GAP_AFTER;
  }
  
  // Weak indicators
  if (isHeadingByShortCapital(text, fontSizeRatio, textLength)) {
    headingScore += HEADING_SCORES.HEADING_BY_SHORT_CAPITAL;
  }
  if (isHeadingByPosition(context)) {
    headingScore += HEADING_SCORES.HEADING_BY_POSITION;
  }
  
  // NEW: First element with short text is likely heading
  if (context.isFirst && textLength < ELEMENT_DECISION.SHORT_TEXT_MAX) {
    headingScore += HEADING_SCORES.FIRST_ELEMENT_SHORT;
  }
  
  // ===== NEGATIVE INDICATORS (NEW - fixes v2 problem) =====
  
  // Strong penalties
  if (textLength > HEADING_THRESHOLDS.DEFINITELY_NOT_HEADING_LENGTH) {
    headingScore += HEADING_SCORES.VERY_LONG_TEXT; // -3
  }
  if (wordCount > HEADING_THRESHOLDS.MAX_WORD_COUNT) {
    headingScore += HEADING_SCORES.MANY_WORDS; // -2
  }
  if (textLength > ELEMENT_DECISION.MEDIUM_TEXT && wordCount > 10) {
    headingScore += HEADING_SCORES.LONG_TEXT_MANY_WORDS; // -2
  }
  
  // Moderate penalties
  if (text.includes('.') && wordCount > 5 && !text.endsWith('.')) {
    headingScore += HEADING_SCORES.SENTENCE_IN_MIDDLE; // -1
  }
  if (textLength > ELEMENT_DECISION.SHORT_TEXT_MAX && !element.isBold && fontSizeRatio < 1.2) {
    headingScore += HEADING_SCORES.LONG_WITHOUT_FORMATTING; // -1
  }
  
  // ===== ADAPTIVE THRESHOLD (fixes v2 problem) =====
  const adaptiveThreshold = calculateAdaptiveThreshold(metrics, context);
  
  // Special cases: very strong indicators can override threshold
  const isNumbered = isNumberedHeading(text, fontSizeRatio);
  const isVeryLargeFont = fontSizeRatio >= HEADING_THRESHOLDS.VERY_LARGE_FONT_RATIO && 
                          wordCount <= HEADING_THRESHOLDS.MAX_WORD_COUNT_FOR_LARGE_FONT;
  
  // Decision: heading if score >= threshold OR very strong indicators
  const isHeading = (headingScore >= adaptiveThreshold || 
                     (isNumbered && headingScore >= 2) ||
                     (isVeryLargeFont && headingScore >= 1)) && 
                    !isList(element, text);
  
  return {
    score: headingScore,
    threshold: adaptiveThreshold,
    isHeading,
    details: {
      fontSizeRatio: fontSizeRatio.toFixed(2),
      textLength,
      wordCount,
      isNumbered,
      isVeryLargeFont
    }
  };
}

/**
 * Classify element as heading using improved scoring system
 * FIXES v2 problems: validation, adaptive thresholds, negative scores, gap after
 * 
 * @param {{text?: string, fontSize?: number, isBold?: boolean, isItalic?: boolean, gapAfter?: number, [key: string]: any}} element - Element to classify
 * @param {{baseFontSize?: number, fontSizeVariability?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @returns {{type: string, confidence: number, algorithm: string, details: {[key: string]: any}}} Classification result
 */
export function classifyHeading(element, metrics) {
  // VALIDATION: Input data (fixes v2 problem)
  if (!element || typeof element !== 'object') {
    log('[PDF v3] classifyHeading: Invalid element', { element });
    return {
      type: 'not-heading',
      confidence: 0,
      algorithm: 'error',
      details: { error: 'Invalid element' }
    };
  }
  
  if (!metrics || typeof metrics !== 'object') {
    log('[PDF v3] classifyHeading: Invalid metrics, using defaults', { metrics });
    metrics = { baseFontSize: DEFAULT_METRICS.BASE_FONT_SIZE };
  }
  
  // Build context for scoring
  const context = {
    isFirst: element.isFirst || false,
    prevWasHeading: element.prevWasHeading || false,
    prevWasList: element.prevWasList || false,
    nextIsList: element.nextIsList || false,
    structure: element.structure
  };
  
  // Calculate heading score
  const scoreResult = calculateHeadingScore(element, metrics, context);
  
  const isHeading = scoreResult.isHeading;
  
  // Calculate confidence from score (normalize to 0-1)
  // IMPROVED: Better normalization that prioritizes visual indicators
  const maxPossibleScore = 20; // Updated: Sum of all positive scores (increased)
  const minPossibleScore = -8; // Sum of all negative scores
  
  const fontSizeRatio = parseFloat(scoreResult.details.fontSizeRatio) || 1.0;
  const textLength = scoreResult.details.textLength || 0;
  const wordCount = scoreResult.details.wordCount || 0;
  
  // Base normalization
  let normalizedScore = (scoreResult.score - minPossibleScore) / (maxPossibleScore - minPossibleScore);
  
  // AGGRESSIVE BOOSTS for strong visual indicators:
  
  // 1. Short text with large font = VERY STRONG heading indicator
  if (textLength < ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH && fontSizeRatio >= 1.2) {
    normalizedScore = Math.min(1.0, normalizedScore * 2.0); // Double confidence
  }
  
  // 2. First element with short text and larger font = heading
  if (context.isFirst && textLength < ELEMENT_DECISION.SHORT_TEXT_MAX && fontSizeRatio >= 1.1) {
    normalizedScore = Math.min(1.0, normalizedScore * 1.8); // 80% boost
  }
  
  // 3. Font size significantly larger (>=1.3x) with short text
  if (fontSizeRatio >= 1.3 && textLength < ELEMENT_DECISION.SHORT_TEXT_MAX && scoreResult.score > 0) {
    normalizedScore = Math.min(1.0, normalizedScore * 1.6); // 60% boost
  }
  
  // 4. Bold/italic style with short text
  if ((element.isBold || element.isItalic) && textLength < ELEMENT_DECISION.SHORT_TEXT_MAX) {
    normalizedScore = Math.min(1.0, normalizedScore * 1.4); // 40% boost
  }
  
  // 5. Short text (< 50 chars) with any font size increase
  if (textLength < ELEMENT_DECISION.LIST_HEADING_SHORT_LENGTH && fontSizeRatio >= 1.1) {
    normalizedScore = Math.min(1.0, normalizedScore * 1.5); // 50% boost
  }
  
  // Ensure minimum confidence for elements that pass threshold
  if (isHeading && normalizedScore < 0.6) {
    normalizedScore = Math.max(normalizedScore, 0.6); // Minimum 0.6 if classified as heading
  }
  
  const confidence = Math.max(0, Math.min(1, normalizedScore));
  
  log(`[PDF v3] classifyHeading: ${isHeading ? 'HEADING' : 'NOT HEADING'}`, {
    text: (element.text || '').substring(0, 50),
    score: scoreResult.score,
    threshold: scoreResult.threshold,
    confidence: confidence.toFixed(2),
    details: scoreResult.details
  });
  
  return {
    type: isHeading ? 'heading' : 'not-heading',
    confidence: confidence,
    algorithm: 'improved-scoring-system',
    details: {
      score: scoreResult.score,
      threshold: scoreResult.threshold,
      ...scoreResult.details
    }
  };
}
