// @ts-check
// Element type decision logic - centralized decision making
// Decides final element type based on classification results and context

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { ELEMENT_DECISION, CONFIDENCE, GAP_ANALYSIS, DEFAULT_METRICS } from '../constants.js';

/**
 * Decide element type based on classification results and context
 * Centralized decision logic to avoid duplication
 * 
 * @param {{type?: string, confidence?: number, [key: string]: any}} headingResult - Heading classification result
 * @param {{type?: string, confidence?: number, [key: string]: any}} paraResult - Paragraph classification result
 * @param {{type?: string, confidence?: number, [key: string]: any}} listResult - List classification result
 * @param {{type?: string, confidence?: number, [key: string]: any}} tableResult - Table classification result
 * @param {{combinedText?: string, [key: string]: any}} block - Block being classified
 * @param {{isHomogeneous?: boolean, likelyHasHeadings?: boolean, [key: string]: any}} structure - Document structure analysis
 * @param {{i?: number, gapAfter?: number, nextBlock?: {combinedText?: string, [key: string]: any}, [key: string]: any}} context - Additional context
 * @param {{paragraphGapThreshold?: number, gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @returns {{elementType: string, confidence: number}} Decision result
 */
export function decideElementType(headingResult, paraResult, listResult, tableResult, block, structure, context, metrics) {
  try {
    // Validate inputs
    if (!block || !block.combinedText || typeof block.combinedText !== 'string') {
      logWarn('[PDF v3] decideElementType: Invalid block', { block });
      return { elementType: 'paragraph', confidence: 0.5 };
    }
    
    if (!headingResult || !paraResult || !listResult) {
      logWarn('[PDF v3] decideElementType: Missing classification results', { headingResult, paraResult, listResult });
      return { elementType: 'paragraph', confidence: 0.5 };
    }
  
  const { i, gapAfter, nextBlock } = context;
  const textLength = block.combinedText.length;
  const isLongText = textLength > ELEMENT_DECISION.LONG_TEXT_MIN;
  const isVeryLongText = textLength > ELEMENT_DECISION.VERY_LONG_TEXT_MIN;
  
  // Default to paragraph
  let elementType = 'paragraph';
  let maxConfidence = paraResult.confidence || 0.5;
  
  // Very long text is always a paragraph
  if (isVeryLongText) {
    return { elementType: 'paragraph', confidence: Math.max(paraResult.confidence, CONFIDENCE.HIGH) };
  }
  
  // Check table BEFORE paragraph (tables can look like paragraphs)
  log(`[PDF v3] decideElementType: Evaluating table classification - tableResult=${tableResult?.type || 'none'}, tableConfidence=${tableResult?.confidence?.toFixed(3) || 'N/A'}, tableMinConfidence=${ELEMENT_DECISION.TABLE_MIN_CONFIDENCE}, paraConfidence=${paraResult?.confidence?.toFixed(3) || 'N/A'}`);
  
  if (tableResult && tableResult.type === 'table' && tableResult.confidence > ELEMENT_DECISION.TABLE_MIN_CONFIDENCE) {
    // Table takes priority if confidence is high
    if (tableResult.confidence > paraResult.confidence || tableResult.confidence > 0.7) {
      log(`[PDF v3] decideElementType: CHOSE TABLE - tableConfidence=${tableResult.confidence.toFixed(3)}, paraConfidence=${paraResult.confidence.toFixed(3)}, text="${block.combinedText.substring(0, 50)}"`);
      return { elementType: 'table', confidence: tableResult.confidence };
    } else {
      log(`[PDF v3] decideElementType: Table confidence too low - tableConfidence=${tableResult.confidence.toFixed(3)}, paraConfidence=${paraResult.confidence.toFixed(3)}, threshold=0.7`);
    }
  } else {
    if (tableResult) {
      log(`[PDF v3] decideElementType: Table classification failed - type=${tableResult.type}, confidence=${tableResult.confidence.toFixed(3)}, minRequired=${ELEMENT_DECISION.TABLE_MIN_CONFIDENCE}`);
    } else {
      log(`[PDF v3] decideElementType: No table result available`);
    }
  }
  
  // Special rules for homogeneous documents (all same font size/style)
  if (structure && structure.isHomogeneous && !structure.likelyHasHeadings) {
    // In homogeneous documents without variation, be very conservative about headings
    // Only classify as heading if:
    // 1. It's the first element
    // 2. It's short
    // 3. There's a significant gap after it
    // 4. The next element is much longer
    if (i === 0 && 
        textLength < ELEMENT_DECISION.IMPLICIT_HEADING_MAX_LENGTH && 
        gapAfter && gapAfter > (metrics.paragraphGapThreshold || DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD) * GAP_ANALYSIS.PARAGRAPH_GAP_MIN_MULTIPLIER &&
        nextBlock && nextBlock.combinedText.length > ELEMENT_DECISION.LONG_TEXT_MIN) {
      // This might be an implicit heading (same size but structurally a heading)
      if (headingResult.confidence > paraResult.confidence && 
          headingResult.confidence > ELEMENT_DECISION.IMPLICIT_HEADING_MIN_CONFIDENCE) {
        return { elementType: 'heading', confidence: headingResult.confidence };
      }
    }
    // For homogeneous docs, prefer paragraph unless heading confidence is much higher
    if (headingResult.type === 'heading' && 
        headingResult.confidence > CONFIDENCE.HIGH && 
        headingResult.confidence > paraResult.confidence + ELEMENT_DECISION.HEADING_VS_PARAGRAPH_LARGE_DIFF) {
      return { elementType: 'heading', confidence: headingResult.confidence };
    }
    // Default to paragraph for homogeneous docs
    return { elementType: 'paragraph', confidence: paraResult.confidence };
  }
  
  // Normal classification: compare confidences
  // Check list first - CRITICAL: If block contains "Heading: • Item" pattern, it should be split, not classified as list
  // But if it wasn't split and has list markers, prefer list over paragraph
  if (listResult.type === 'list' && 
      listResult.confidence > ELEMENT_DECISION.LIST_MIN_CONFIDENCE) {
    // If text contains "Heading: • Item" pattern, this should have been split
    // But if it wasn't, still prefer list if confidence is reasonable
    const hasHeadingListPattern = /:\s+([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/.test(block.combinedText);
    if (hasHeadingListPattern) {
      // This should have been split - log warning but still prefer list
      log(`[PDF v3] decideElementType: WARNING - Block contains heading+list pattern but wasn't split - text="${block.combinedText.substring(0, 60)}"`);
    }
    
    // CRITICAL: Prefer list if confidence is good (>= 0.7) or if it's significantly higher than paragraph
    // List confidence of 0.9 should always win over paragraph confidence of 0.75
    if (listResult.confidence >= 0.7 || 
        (listResult.confidence > maxConfidence && listResult.confidence >= paraResult.confidence - 0.05)) {
      elementType = 'list';
      maxConfidence = listResult.confidence;
      log(`[PDF v3] decideElementType: Chose LIST - listConf=${listResult.confidence.toFixed(3)}, paraConf=${paraResult.confidence.toFixed(3)}, maxConf=${maxConfidence.toFixed(3)}`);
      // Return early - list takes priority
      return { elementType, confidence: maxConfidence };
    }
  }
  
  // Check for list heading pattern - text that introduces a list
  // This should be recognized as heading even if heading confidence is low
  // UNIVERSAL: List headings can end with colon OR be short text followed by list
  const isListHeading = block.isListHeading || block.followedByList || false;
  const endsWithColon = block.combinedText.trim().endsWith(':');
  const isShortWithColon = endsWithColon && textLength < ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH;
  const isShortWithoutColon = !endsWithColon && textLength < ELEMENT_DECISION.LIST_HEADING_SHORT_LENGTH && isListHeading;
  
  if (isListHeading && (isShortWithColon || isShortWithoutColon)) {
    // This is a list heading - boost heading confidence significantly
    // UNIVERSAL: List headings should be recognized as headings based on pattern, not hardcoded level
    const boostedHeadingConf = Math.max(
      headingResult.confidence || CONFIDENCE.LOW, 
      ELEMENT_DECISION.LIST_HEADING_BOOSTED_CONFIDENCE
    );
    log(`[PDF v3] decideElementType: List heading detected - text="${block.combinedText.substring(0, 50)}", originalHeadingConf=${headingResult.confidence?.toFixed(3) || 'N/A'}, boostedHeadingConf=${boostedHeadingConf.toFixed(3)}, endsWithColon=${endsWithColon}`);
    // Temporarily boost heading result for comparison
    headingResult = {
      ...headingResult,
      type: 'heading',
      confidence: boostedHeadingConf
    };
    // UNIVERSAL: Force heading type for list headings if confidence is sufficient
    // This ensures pattern-based detection works for any document structure
    if (headingResult.confidence >= ELEMENT_DECISION.LIST_HEADING_MIN_CONFIDENCE) {
      log(`[PDF v3] decideElementType: Forcing HEADING for list heading - text="${block.combinedText.substring(0, 50)}", boostedConf=${boostedHeadingConf.toFixed(3)}`);
      return { elementType: 'heading', confidence: boostedHeadingConf };
    }
  }
  
  // For heading vs paragraph, compare confidences
  // IMPROVED: More aggressive heading selection for short texts with visual indicators
  if (headingResult.type === 'heading') {
    const notLongText = !isLongText;
    const isShortText = textLength < ELEMENT_DECISION.SHORT_TEXT_MAX; // < 150 chars
    const isVeryShortText = textLength < ELEMENT_DECISION.VERY_SHORT_TEXT;
    const headingVsParaDiff = headingResult.confidence - paraResult.confidence;
    
    // Get font size info from block
    const fontSizeRatio = block.fontSize && metrics.baseFontSize 
      ? block.fontSize / metrics.baseFontSize 
      : 1.0;
    const hasLargeFont = fontSizeRatio >= 1.1;
    const hasVeryLargeFont = fontSizeRatio >= 1.3;
    
    // IMPROVED: More aggressive rules for heading selection
    // 1. Very short text (< 50) with any font increase = heading
    const veryShortRule = isVeryShortText && fontSizeRatio >= 1.05;
    
    // 2. Short text (< 150) with larger font (>= 1.1x) and heading classified = heading
    const shortLargeFontRule = isShortText && hasLargeFont && headingResult.confidence > 0.3;
    
    // 3. Any text with very large font (>= 1.3x) and short (< 150) = heading
    const veryLargeFontRule = hasVeryLargeFont && isShortText && headingResult.confidence > 0.2;
    
    // 4. Heading confidence higher than paragraph (even slightly)
    const confidenceRule = headingResult.confidence > paraResult.confidence;
    
    // 5. Small difference but heading has reasonable confidence
    const smallDiffRule = Math.abs(headingVsParaDiff) < 0.15 && headingResult.confidence > 0.4;
    
    const shouldPreferHeading = notLongText && (
      veryShortRule || 
      shortLargeFontRule || 
      veryLargeFontRule || 
      confidenceRule || 
      smallDiffRule
    );
    
    log(`[PDF v3] decideElementType: Evaluating heading - headingConf=${headingResult.confidence.toFixed(3)}, paraConf=${paraResult.confidence.toFixed(3)}, textLength=${textLength}, fontSizeRatio=${fontSizeRatio.toFixed(2)}`);
    log(`[PDF v3] decideElementType: Rules - veryShort=${veryShortRule}, shortLargeFont=${shortLargeFontRule}, veryLargeFont=${veryLargeFontRule}, confidence=${confidenceRule}, smallDiff=${smallDiffRule}, shouldPrefer=${shouldPreferHeading}`);
    
    if (shouldPreferHeading) {
      elementType = 'heading';
      // Boost confidence to ensure it's higher than paragraph
      maxConfidence = Math.max(headingResult.confidence, paraResult.confidence + 0.15);
      log(`[PDF v3] decideElementType: Chose HEADING - headingConf=${headingResult.confidence.toFixed(3)}, paraConf=${paraResult.confidence.toFixed(3)}, boostedConf=${maxConfidence.toFixed(3)}`);
    } else if (paraResult.type === 'paragraph' && paraResult.confidence > CONFIDENCE.MINIMUM && elementType !== 'list') {
      elementType = 'paragraph';
      maxConfidence = paraResult.confidence;
      logWarn(`[PDF v3] decideElementType: Chose PARAGRAPH - headingConf=${headingResult.confidence.toFixed(3)}, paraConf=${paraResult.confidence.toFixed(3)}, diff=${headingVsParaDiff.toFixed(3)}`);
    }
  } else if (paraResult.type === 'paragraph' && paraResult.confidence > CONFIDENCE.MINIMUM && elementType !== 'list') {
    elementType = 'paragraph';
    maxConfidence = paraResult.confidence;
  } else if (isLongText) {
    // Long text is always a paragraph, regardless of classification
    elementType = 'paragraph';
    maxConfidence = Math.max(paraResult.confidence, CONFIDENCE.HIGH);
    if (headingResult.type === 'heading') {
      logWarn('[PDF v3] decideElementType: Chose PARAGRAPH (text too long)', {
        headingConfidence: headingResult.confidence,
        textLength,
        isLongText,
        text: block.combinedText.substring(0, 50)
      });
    }
  }
  
  // Final safety check: long text cannot be heading
  if (isLongText && elementType === 'heading') {
    elementType = 'paragraph';
    maxConfidence = CONFIDENCE.HIGH;
  }
  
  return { elementType, confidence: maxConfidence };
  } catch (error) {
    logWarn('[PDF v3] decideElementType: Error during classification', { error: error?.message, block: block?.combinedText?.substring(0, 50) });
    return { elementType: 'paragraph', confidence: 0.5 };
  }
}

