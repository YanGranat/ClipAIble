// @ts-check
// Text continuation detection - determines if text blocks should be merged
// Universal language-agnostic heuristics

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { 
  CONTINUATION_SCORES, 
  FONT_SIZE_THRESHOLDS, 
  CONTINUATION_THRESHOLDS,
  CONTINUATION_MULTIPLIERS,
  PAGE_BREAK_CONTEXT
} from '../constants.js';
import {
  LIST_ITEM_PATTERNS,
  PUNCTUATION_END_PATTERN,
  SENTENCE_END_PATTERN,
  LOWERCASE_START_PATTERN,
  CAPITAL_START_PATTERN
} from '../utils/regex-patterns.js';

/**
 * Check if two blocks should be merged (continuation detection)
 * Uses scoring system with positive and negative indicators
 * 
 * @param {{combinedText?: string, fontSize?: number, [key: string]: any}} currentBlock - Current block being processed
 * @param {{text?: string, fontSize?: number, [key: string]: any}} nextLine - Next line to check
 * @param {{baseFontSize?: number, medianFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {boolean} isPageBreak - Whether there's a page break between blocks
 * @returns {boolean} Should merge blocks
 */
export function shouldContinueBlock(currentBlock, nextLine, metrics, isPageBreak = false) {
  if (!currentBlock || !nextLine) {
    return false;
  }
  
  const currentTextEnd = (currentBlock.combinedText || '').trim();
  const nextText = (nextLine.text || '').trim();
  
  if (!currentTextEnd || !nextText) {
    return false;
  }
  
  // Get font sizes and metrics
  const currentFontSize = currentBlock.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const nextFontSize = nextLine.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const baseFontSize = metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const medianFontSize = metrics.medianFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  
  // Check for special cases first (split heading, split list item, list continuation)
  if (isPageBreak) {
    const specialCase = checkSpecialCases({
      currentBlock,
      nextLine,
      currentTextEnd,
      nextText,
      currentFontSize,
      nextFontSize,
      baseFontSize
    });
    
    if (specialCase !== null) {
      return specialCase;
    }
  }
  
  // VISUAL-FIRST continuation scoring system
  // Priority: Visual (40%) > Font size (25%) > Structural (15%) > Semantic (3%)
  let continuationScore = 0;
  
  // Pre-compute font size differences (VISUAL - highest priority)
  const fontSizeDiff = Math.abs(nextFontSize - baseFontSize);
  const fontSizeDiffMedian = Math.abs(nextFontSize - medianFontSize);
  const fontSizeTolerance = baseFontSize * FONT_SIZE_THRESHOLDS.SIMILARITY_TOLERANCE;
  const fontSizeDiffBetweenBlocks = Math.abs(currentFontSize - nextFontSize);
  const fontSizeSimilarityTolerance = Math.max(currentFontSize, nextFontSize) * FONT_SIZE_THRESHOLDS.SIMILARITY_TOLERANCE;
  
  // VISUAL INDICATORS (40% weight) - PRIMARY
  const currentBlockLength = currentBlock.combinedText.length;
  const nextBlockLength = nextText.length;
  const currentIsLong = currentBlockLength > CONTINUATION_THRESHOLDS.LONG_BLOCK_MIN_LENGTH;
  const nextIsLong = nextBlockLength > CONTINUATION_THRESHOLDS.LONG_BLOCK_MIN_LENGTH;
  const bothAreLong = currentIsLong && nextIsLong;
  
  // Font size matching (25% weight from document)
  // Only strong indicator if both blocks are body text (not headings)
  if (fontSizeDiff <= fontSizeTolerance || fontSizeDiffMedian <= fontSizeTolerance) {
    continuationScore += CONTINUATION_SCORES.FONT_SIZE_MATCH; // Positive, but not enough alone
  }
  
  // Font size similarity between blocks (VISUAL)
  // Only apply for long blocks - short blocks with same font size might be headings
  if (fontSizeDiffBetweenBlocks <= fontSizeSimilarityTolerance && bothAreLong) {
    continuationScore += CONTINUATION_SCORES.FONT_SIZE_SIMILAR; // Both are long + similar font = likely same paragraph
  }
  
  // Block length (VISUAL - long blocks are likely paragraphs)
  if (currentIsLong) {
    continuationScore += CONTINUATION_SCORES.LONG_BLOCK; // Long block = likely paragraph
  }
  
  // Block length similarity (VISUAL - similar lengths = likely same type)
  // Only apply for long blocks - short blocks might be headings/lists
  if (bothAreLong) {
    const lengthDiff = Math.abs(currentBlockLength - nextBlockLength);
    const avgLength = (currentBlockLength + nextBlockLength) / 2;
    if (avgLength > 0 && lengthDiff / avgLength < 0.5) {
      continuationScore += CONTINUATION_SCORES.BLOCK_LENGTH_SIMILAR;
    }
  }
  
  // NEGATIVE VISUAL INDICATORS
  const fontSizeDiffLarge = fontSizeDiff > baseFontSize * FONT_SIZE_THRESHOLDS.DIFFERENCE_LARGE_MULTIPLIER;
  const fontSizeDiffMedianLarge = fontSizeDiffMedian > medianFontSize * FONT_SIZE_THRESHOLDS.DIFFERENCE_LARGE_MULTIPLIER;
  
  if (fontSizeDiffLarge || fontSizeDiffMedianLarge) {
    continuationScore += CONTINUATION_SCORES.FONT_SIZE_DIFF_LARGE; // Strong negative
  } else if (fontSizeDiff > fontSizeTolerance * 2) {
    continuationScore += CONTINUATION_SCORES.FONT_SIZE_DIFF_MEDIUM; // Moderate negative
  }
  
  // SEMANTIC INDICATORS - Check FIRST to detect clear paragraph boundaries
  // Use semantic analysis to detect clear paragraph boundaries BEFORE applying structural indicators
  const nextStartsWithLowercase = LOWERCASE_START_PATTERN.test(nextText);
  const nextStartsWithCapital = CAPITAL_START_PATTERN.test(nextText);
  const currentEndsWithSentenceEnd = SENTENCE_END_PATTERN.test(currentTextEnd);
  
  // CRITICAL: Strong semantic indicator of new paragraph
  // BUT: For very long blocks, be more cautious - long paragraphs can have multiple sentences
  // Note: currentBlockLength and nextBlockLength are already declared above
  const avgParagraphLength = metrics.avgParagraphLength || 200;
  const currentIsVeryLong = currentBlockLength > avgParagraphLength * CONTINUATION_MULTIPLIERS.VERY_LONG_BLOCK_MULTIPLIER;
  const gapAnalysis = metrics.gapAnalysis;
  const isHomogeneousDoc = gapAnalysis && (gapAnalysis.documentType === 'homogeneous' || gapAnalysis.homogeneityLevel >= 0.8);
  
  let hasStrongSemanticBoundary = false;
  if (currentEndsWithSentenceEnd && nextStartsWithCapital) {
    const nextIsSubstantial = nextBlockLength > avgParagraphLength * PAGE_BREAK_CONTEXT.SUBSTANTIAL_TEXT_RATIO;
    
    // For very long blocks OR homogeneous documents, be more cautious
    // Long paragraphs often have multiple sentences, so sentence end + capital is less definitive
    if (nextIsSubstantial && !currentIsVeryLong && !isHomogeneousDoc) {
      // This is a clear paragraph boundary - apply very strong penalty
      // But only if current block is NOT very long and document is NOT homogeneous
      const penalty = CONTINUATION_SCORES.SENTENCE_END_CAPITAL * CONTINUATION_MULTIPLIERS.STRONG_SEMANTIC_BOUNDARY;
      continuationScore += penalty;
      hasStrongSemanticBoundary = true;
      log('[PDF v3] shouldContinueBlock: Strong semantic boundary detected (sentence end + capital + substantial)', {
        currentEndsWithSentenceEnd,
        nextStartsWithCapital,
        nextIsSubstantial,
        nextLength: nextBlockLength,
        avgParagraphLength,
        currentLength: currentBlockLength,
        currentIsVeryLong,
        isHomogeneousDoc,
        penalty
      });
    } else if (nextIsSubstantial && (currentIsVeryLong || isHomogeneousDoc)) {
      // For very long blocks or homogeneous docs, apply reduced penalty
      // Long paragraphs can have multiple sentences, so be less strict
      continuationScore += CONTINUATION_SCORES.SENTENCE_END_CAPITAL; // Single penalty, not triple
      log('[PDF v3] shouldContinueBlock: Semantic boundary but reduced penalty (long block or homogeneous doc)', {
        currentEndsWithSentenceEnd,
        nextStartsWithCapital,
        nextIsSubstantial,
        nextLength: nextBlockLength,
        currentLength: currentBlockLength,
        currentIsVeryLong,
        isHomogeneousDoc,
        penalty: CONTINUATION_SCORES.SENTENCE_END_CAPITAL
      });
    }
  }
  
  // STRUCTURAL INDICATORS (15% weight) - SECONDARY
  // Page break context analysis (what ends previous page, what starts next page)
  const pageBreakContext = currentBlock.pageBreakContext || nextLine.pageBreakContext;
  if (isPageBreak && pageBreakContext) {
    // Strong continuation indicators from page break context
    if (pageBreakContext.prevEndsWithIncomplete) {
      // Previous page ends with comma/semicolon/colon/dash = incomplete sentence = continuation
      continuationScore += CONTINUATION_SCORES.PUNCTUATION_END * CONTINUATION_MULTIPLIERS.INCOMPLETE_SENTENCE;
      log('[PDF v3] shouldContinueBlock: Previous page ends with incomplete sentence - strong continuation indicator', {
        prevEndsWithComma: pageBreakContext.prevEndsWithComma,
        prevEndsWithDash: pageBreakContext.prevEndsWithDash,
        prevPageEnd: pageBreakContext.prevPageEnd
      });
    }
    
    if (pageBreakContext.prevEndsWithComma && pageBreakContext.nextStartsWithLowercase) {
      // Previous page ends with comma AND next starts with lowercase = very strong continuation
      continuationScore += CONTINUATION_SCORES.PUNCTUATION_END; // Additional positive
    }
    
    if (pageBreakContext.prevEndsWithDash) {
      // Previous page ends with dash = continuation (word split or continuation)
      continuationScore += CONTINUATION_SCORES.PUNCTUATION_END * CONTINUATION_MULTIPLIERS.DASH_CONTINUATION;
    }
    
    // Don't apply PAGE_BREAK bonus if there's a strong semantic boundary - it would override the semantic signal
    if (!hasStrongSemanticBoundary) {
      continuationScore += CONTINUATION_SCORES.PAGE_BREAK;
    }
  } else if (isPageBreak && !hasStrongSemanticBoundary) {
    // Fallback: apply PAGE_BREAK bonus if no page break context available
    continuationScore += CONTINUATION_SCORES.PAGE_BREAK;
  }
  
  const currentEndsWithPunctuation = PUNCTUATION_END_PATTERN.test(currentTextEnd);
  if (currentEndsWithPunctuation) {
    continuationScore += CONTINUATION_SCORES.PUNCTUATION_END;
  }
  
  // Calculate visual-only score (excluding structural indicators like PAGE_BREAK)
  // This helps determine if visual indicators are strong enough to trust
  const avgLength = (currentBlockLength + nextBlockLength) / 2;
  const lengthSimilarityRatio = avgLength > 0 ? Math.abs(currentBlockLength - nextBlockLength) / avgLength : 1;
  const isBlockLengthSimilar = bothAreLong && lengthSimilarityRatio < CONTINUATION_MULTIPLIERS.BLOCK_LENGTH_SIMILARITY_THRESHOLD;
  const fontSizeToleranceDouble = fontSizeTolerance * CONTINUATION_MULTIPLIERS.FONT_SIZE_TOLERANCE_MULTIPLIER;
  
  const visualOnlyScore = 
    (fontSizeDiff <= fontSizeTolerance || fontSizeDiffMedian <= fontSizeTolerance ? CONTINUATION_SCORES.FONT_SIZE_MATCH : 0) +
    (fontSizeDiffBetweenBlocks <= fontSizeSimilarityTolerance && bothAreLong ? CONTINUATION_SCORES.FONT_SIZE_SIMILAR : 0) +
    (currentIsLong ? CONTINUATION_SCORES.LONG_BLOCK : 0) +
    (isBlockLengthSimilar ? CONTINUATION_SCORES.BLOCK_LENGTH_SIMILAR : 0) +
    (fontSizeDiffLarge || fontSizeDiffMedianLarge ? CONTINUATION_SCORES.FONT_SIZE_DIFF_LARGE : 0) +
    (fontSizeDiff > fontSizeToleranceDouble && !fontSizeDiffLarge && !fontSizeDiffMedianLarge ? CONTINUATION_SCORES.FONT_SIZE_DIFF_MEDIUM : 0) +
    (currentBlockLength < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH ? CONTINUATION_SCORES.SHORT_BLOCK : 0);
  
  // Visual indicators are weak if score is low AND not strongly negative
  // If strongly negative (e.g., FONT_SIZE_DIFF_LARGE = -4), visual indicators are strong (indicating NO merge)
  const visualIndicatorsWeak = visualOnlyScore < 2 && visualOnlyScore > -2;
  
  // Additional semantic positive indicators (only if visual indicators are weak and no strong boundary detected)
  // Don't apply if we already detected a strong semantic boundary above
  
  // Additional semantic positive indicators (only if visual indicators are weak and no strong boundary detected)
  // Don't apply if we already detected a strong semantic boundary above
  if (visualIndicatorsWeak && !hasStrongSemanticBoundary) {
    if (nextStartsWithLowercase) {
      continuationScore += CONTINUATION_SCORES.LOWERCASE_START;
    }
    
    if (!currentEndsWithSentenceEnd) {
      continuationScore += CONTINUATION_SCORES.NO_SENTENCE_END;
    }
    
    if (nextBlockLength < CONTINUATION_THRESHOLDS.SHORT_LINE_MAX_LENGTH && nextStartsWithLowercase) {
      continuationScore += CONTINUATION_SCORES.SHORT_CONTINUATION;
    }
    
    if (nextBlockLength < CONTINUATION_THRESHOLDS.VERY_SHORT_LINE_MAX_LENGTH && nextStartsWithCapital) {
      continuationScore += CONTINUATION_SCORES.SHORT_CAPITAL;
    }
  }
  
  if (currentBlockLength < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH) {
    continuationScore += CONTINUATION_SCORES.SHORT_BLOCK;
  }
  
  const shouldMerge = continuationScore >= CONTINUATION_SCORES.THRESHOLD;
  
  // Debug logging for page breaks to understand why merging fails
  if (isPageBreak) {
    log('[PDF v3] shouldContinueBlock: Page break continuation check', {
      shouldMerge,
      score: continuationScore,
      threshold: CONTINUATION_SCORES.THRESHOLD,
      currentTextEnd: currentTextEnd.substring(Math.max(0, currentTextEnd.length - 50)),
      nextTextStart: nextText.substring(0, 50),
      currentLength: currentBlock.combinedText.length,
      nextLength: nextText.length,
      currentEndsWithSentenceEnd,
      nextStartsWithCapital,
      nextStartsWithLowercase,
      isLongBlock: currentBlock.combinedText.length > CONTINUATION_THRESHOLDS.LONG_BLOCK_MIN_LENGTH * CONTINUATION_MULTIPLIERS.VERY_LONG_BLOCK_MULTIPLIER,
      fontSizeMatch: fontSizeDiff <= fontSizeTolerance || fontSizeDiffMedian <= fontSizeTolerance
    });
  }
  
  return shouldMerge;
}

/**
 * Check for special cases: split heading, split list item, list continuation
 * These are checked first as they have higher priority
 * 
 * @param {{currentBlock: {combinedText?: string, fontSize?: number, [key: string]: any}, nextLine: {text?: string, fontSize?: number, [key: string]: any}, currentTextEnd: string, nextText: string, currentFontSize: number, nextFontSize: number, baseFontSize: number}} params - Parameters object
 * @returns {boolean|null} true if should merge, false if should not, null if not a special case
 */
function checkSpecialCases({ currentBlock, nextLine, currentTextEnd, nextText, currentFontSize, nextFontSize, baseFontSize }) {
  // Case 1: Split heading
  const currentIsShort = currentBlock.combinedText.length < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH;
  const nextIsShort = nextText.length < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH;
  const currentIsLargerFont = currentFontSize > baseFontSize * FONT_SIZE_THRESHOLDS.LARGER_THAN_BASE_MULTIPLIER;
  const nextIsLargerFont = nextFontSize > baseFontSize * FONT_SIZE_THRESHOLDS.LARGER_THAN_BASE_MULTIPLIER;
  const fontSizeSimilar = Math.abs(currentFontSize - nextFontSize) <= baseFontSize * FONT_SIZE_THRESHOLDS.SIMILARITY_TOLERANCE;
  const currentStartsWithCapital = CAPITAL_START_PATTERN.test(currentTextEnd);
  const nextStartsWithLowercase = LOWERCASE_START_PATTERN.test(nextText);
  const currentEndsWithSentenceEnd = SENTENCE_END_PATTERN.test(currentTextEnd);
  
  if (currentIsShort && nextIsShort && 
      currentIsLargerFont && nextIsLargerFont && fontSizeSimilar &&
      currentStartsWithCapital && nextStartsWithLowercase && !currentEndsWithSentenceEnd) {
    log('[PDF v3] shouldContinueBlock: Detected split heading across page break');
    return true;
  }
  
  // Case 2: Split list item
  const currentLooksLikeListItem = LIST_ITEM_PATTERNS.test(currentTextEnd);
  const nextLooksLikeListItem = LIST_ITEM_PATTERNS.test(nextText);
  
  if (currentLooksLikeListItem && nextLooksLikeListItem &&
      fontSizeSimilar && !currentEndsWithSentenceEnd && nextStartsWithLowercase) {
    log('[PDF v3] shouldContinueBlock: Detected split list item across page break');
    return true;
  }
  
  // Case 3: List continuation
  if (currentLooksLikeListItem && nextStartsWithLowercase &&
      fontSizeSimilar && !currentEndsWithSentenceEnd) {
    log('[PDF v3] shouldContinueBlock: Detected list continuation across page break');
    return true;
  }
  
  return null; // Not a special case
}

