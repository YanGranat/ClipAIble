// @ts-check
// Cross-page processor - handles merging elements across pages
// Uses unified continuation detection logic with type-specific handling
// Supports: paragraphs, headings, lists

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { countBy } from '../utils/array-helpers.js';
import { shouldContinueBlock } from './continuation.js';
import { 
  CONTINUATION_THRESHOLDS, 
  FONT_SIZE_THRESHOLDS,
  CROSS_PAGE_BREAK_MARKER,
  PAGE_BREAK_CONTEXT
} from '../constants.js';
import {
  SENTENCE_END_PATTERN,
  CAPITAL_START_PATTERN,
  LIST_ITEM_PATTERNS
} from '../utils/regex-patterns.js';
import { analyzePageBreakContext } from '../utils/page-break-context.js';

/**
 * Check if two paragraphs should be merged across pages
 * Uses unified continuation detection logic
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, gapAfter?: number, [key: string]: any}} prevPara - Previous paragraph
 * @param {{text?: string, pageNum?: number, columnIndex?: number, [key: string]: any}} currentPara - Current paragraph
 * @param {{gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics (for continuation detection)
 * @returns {boolean} Should merge
 */
export function shouldMergeParagraphs(prevPara, currentPara, metrics = {}) {
  if (!prevPara || !currentPara) return false;
  
  const prevText = prevPara.text || '';
  const currentText = currentPara.text || '';
  
  if (!prevText || !currentText) return false;
  
  // CRITICAL: Never merge paragraphs from different columns
  // Paragraphs from different columns are separate content streams
  if (prevPara.columnIndex !== undefined && currentPara.columnIndex !== undefined) {
    if (prevPara.columnIndex !== currentPara.columnIndex) {
      log(`[PDF v3] shouldMergeParagraphs: Paragraphs from different columns - NOT merging - prevColumnIndex=${prevPara.columnIndex}, currentColumnIndex=${currentPara.columnIndex}`);
      return false;
    }
  }
  
  // Check if on different pages
  const differentPages = prevPara.pageNum && currentPara.pageNum && prevPara.pageNum !== currentPara.pageNum;
  
  // Only merge if on different pages (cross-page merging)
  // Paragraphs on the same page should remain separate
  if (!differentPages) {
    return false;
  }
  
  // CRITICAL: Check gap information if available
  // Gap information is the PRIMARY visual indicator for paragraph boundaries
  // If there was a large gap before the next paragraph, it's a paragraph boundary
  const gapAnalysis = metrics.gapAnalysis;
  
  // Check if gapAfter is a cross-page break marker
  const isCrossPageBreak = prevPara.gapAfter === CROSS_PAGE_BREAK_MARKER;
  
  // Log gap information for debugging
  if (prevPara.gapAfter !== null && prevPara.gapAfter !== undefined && !isCrossPageBreak) {
    log(`[PDF v3] shouldMergeParagraphs: Gap information available - gapAfter=${prevPara.gapAfter}, hasGapAnalysis=${!!gapAnalysis}, paragraphGapMin=${gapAnalysis?.paragraphGapMin || 'N/A'}, normalGapMax=${gapAnalysis?.normalGapMax || 'N/A'}`);
  } else if (isCrossPageBreak) {
    log(`[PDF v3] shouldMergeParagraphs: Cross-page break detected (gapAfter marker) - prevPageNum=${prevPara.pageNum}, currentPageNum=${currentPara.pageNum}`);
  } else {
    log(`[PDF v3] shouldMergeParagraphs: No gap information available - prevParaKeys=[${Object.keys(prevPara).join(',')}], gapAfter=${prevPara.gapAfter}`);
  }
  
  // For cross-page breaks, we can't use gap size directly
  // Instead, we rely on page break context and continuation detection
  // But if gapAfter is a real gap value (not cross-page marker), use it
  if (gapAnalysis && prevPara.gapAfter !== null && prevPara.gapAfter !== undefined && !isCrossPageBreak) {
    const { paragraphGapMin, normalGapMax } = gapAnalysis;
    
    // If gap is very large (likely across page break with visual gap), it's definitely a boundary
    // Use a threshold: if gap is > multiplier x paragraphGapMin, it's a strong boundary
    const veryLargeGapThreshold = paragraphGapMin * PAGE_BREAK_CONTEXT.PARAGRAPH_GAP_MULTIPLIER;
    if (paragraphGapMin && prevPara.gapAfter > veryLargeGapThreshold) {
      const prevTextEnd = prevText.substring(Math.max(0, prevText.length - PAGE_BREAK_CONTEXT.NEXT_PAGE_START_LENGTH));
      const currentTextStart = currentText.substring(0, PAGE_BREAK_CONTEXT.NEXT_PAGE_START_LENGTH);
      log(`[PDF v3] shouldMergeParagraphs: Very large gap detected - NOT merging (strong paragraph boundary) - gapAfter=${prevPara.gapAfter}, paragraphGapMin=${paragraphGapMin}, threshold=${veryLargeGapThreshold}, prevTextEnd="${prevTextEnd}", currentTextStart="${currentTextStart}"`);
      return false; // Very large gap = strong paragraph boundary
    }
    
    // If gap is large (>= paragraphGapMin), it's a paragraph boundary
    if (paragraphGapMin && prevPara.gapAfter >= paragraphGapMin) {
      const prevTextEnd2 = prevText.substring(Math.max(0, prevText.length - PAGE_BREAK_CONTEXT.NEXT_PAGE_START_LENGTH));
      const currentTextStart2 = currentText.substring(0, PAGE_BREAK_CONTEXT.NEXT_PAGE_START_LENGTH);
      log(`[PDF v3] shouldMergeParagraphs: Large gap detected - NOT merging (paragraph boundary) - gapAfter=${prevPara.gapAfter}, paragraphGapMin=${paragraphGapMin}, prevTextEnd="${prevTextEnd2}", currentTextStart="${currentTextStart2}"`);
      return false; // Large gap = paragraph boundary, don't merge
    }
    
    // If gap is in ambiguous zone but closer to paragraph boundary, be cautious
    if (paragraphGapMin && normalGapMax && 
        prevPara.gapAfter > normalGapMax && 
        prevPara.gapAfter < paragraphGapMin) {
      const gapRatio = (prevPara.gapAfter - normalGapMax) / (paragraphGapMin - normalGapMax);
      if (gapRatio > PAGE_BREAK_CONTEXT.GAP_RATIO_THRESHOLD) {
        // Gap is closer to paragraph boundary - don't merge
        log(`[PDF v3] shouldMergeParagraphs: Gap in ambiguous zone but closer to boundary - NOT merging - gapAfter=${prevPara.gapAfter}, gapRatio=${gapRatio.toFixed(3)}, normalGapMax=${normalGapMax}, paragraphGapMin=${paragraphGapMin}, threshold=${PAGE_BREAK_CONTEXT.GAP_RATIO_THRESHOLD}`);
        return false;
      }
    }
  }
  
  // Analyze page break context: what ends previous page and what starts next page
  // This is a critical visual/structural indicator for continuation detection
  const pageBreakContext = analyzePageBreakContext(prevText, currentText);
  
  log(`[PDF v3] shouldMergeParagraphs: Page break context analyzed - prevEndsWithIncomplete=${pageBreakContext.prevEndsWithIncomplete}, prevEndsWithSentenceEnd=${pageBreakContext.prevEndsWithSentenceEnd}, prevEndsWithComma=${pageBreakContext.prevEndsWithComma}, prevEndsWithDash=${pageBreakContext.prevEndsWithDash}, nextStartsWithLowercase=${pageBreakContext.nextStartsWithLowercase}, nextStartsWithCapital=${pageBreakContext.nextStartsWithCapital}, prevPageEnd="${pageBreakContext.prevPageEnd}", nextPageStart="${pageBreakContext.nextPageStart}"`);
  
  // Use unified continuation detection
  // Convert paragraphs to block/line format for continuation check
  const currentBlock = {
    combinedText: prevText,
    fontSize: prevPara.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
    pageBreakContext: pageBreakContext // Pass page break context
  };
  
  const nextLine = {
    text: currentText,
    fontSize: currentPara.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
    pageNum: currentPara.pageNum,
    pageBreakContext: pageBreakContext // Pass page break context
  };
  
  return shouldContinueBlock(currentBlock, nextLine, metrics, true);
}

/**
 * Split a paragraph block if it contains multiple paragraphs
 * Checks if block starts with continuation but contains sentence end followed by capital letter
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, gapAfter?: number, lines?: Array<any>, [key: string]: any}} para - Paragraph element
 * @returns {Array<Object>} Array of split paragraphs (or single paragraph if no split needed)
 */
function splitMergedParagraph(para) {
  if (!para || !para.text || typeof para.text !== 'string') {
    log(`[PDF v3] splitMergedParagraph: Invalid para - no split, para=${para ? 'exists' : 'null'}`);
    return [para];
  }
  
  const text = para.text.trim();
  if (!text) {
    log(`[PDF v3] splitMergedParagraph: Empty text - no split`);
    return [para];
  }
  
  log(`[PDF v3] splitMergedParagraph: Analyzing paragraph - page=${para.pageNum}, column=${para.columnIndex}, textLength=${text.length}, text="${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"`);
  
  // Check if text starts with lowercase (continuation) but contains sentence end
  const startsWithLowercase = /^\p{Ll}/u.test(text);
  if (!startsWithLowercase) {
    // Not a continuation, no need to split
    log(`[PDF v3] splitMergedParagraph: Does not start with lowercase - no split`);
    return [para];
  }
  
  log(`[PDF v3] splitMergedParagraph: Starts with lowercase - searching for sentence boundaries`);
  
  // Find sentence boundaries: look for sentence end (. ! ?) followed by space and capital letter
  // Pattern: sentence end, optional spaces, capital letter
  const sentenceBoundaryPattern = /([.!?])\s+(\p{Lu})/gu;
  let match;
  let lastIndex = 0;
  let splitIndex = -1;
  
  while ((match = sentenceBoundaryPattern.exec(text)) !== null) {
    const boundaryIndex = match.index;
    const afterBoundary = text.substring(boundaryIndex + match[0].length);
    
    log(`[PDF v3] splitMergedParagraph: Found potential boundary at index=${boundaryIndex}, afterBoundary="${afterBoundary.substring(0, 50)}", afterBoundaryLength=${afterBoundary.length}`);
    
    // Check if the text after boundary starts with capital and is substantial (not just one word)
    // This helps avoid splitting on abbreviations or numbers
    if (afterBoundary.length > PAGE_BREAK_CONTEXT.SPLIT_BOUNDARY_MIN_LENGTH && CAPITAL_START_PATTERN.test(afterBoundary)) {
      // Found a likely paragraph boundary
      splitIndex = boundaryIndex + match[1].length + 1; // Position after sentence end and space
      log(`[PDF v3] splitMergedParagraph: Valid boundary found - splitIndex=${splitIndex}, boundaryChar="${match[1]}"`);
      break;
    } else {
      log(`[PDF v3] splitMergedParagraph: Boundary rejected - afterBoundaryLength=${afterBoundary.length}, minLength=${PAGE_BREAK_CONTEXT.SPLIT_BOUNDARY_MIN_LENGTH}, startsWithCapital=${CAPITAL_START_PATTERN.test(afterBoundary)}`);
    }
  }
  
  if (splitIndex > 0 && splitIndex < text.length) {
    // Split the paragraph
    const continuationPart = {
      ...para,
      text: text.substring(0, splitIndex).trim()
    };
    
    const newParagraphPart = {
      ...para,
      text: text.substring(splitIndex).trim()
    };
    
    const contPartFullText = continuationPart.text ? continuationPart.text.substring(0, 200) : 'NO TEXT';
    const newParaPartFullText = newParagraphPart.text ? newParagraphPart.text.substring(0, 200) : 'NO TEXT';
    log(`[PDF v3] splitMergedParagraph: SPLIT paragraph - splitIndex=${splitIndex}, continuationPart="${contPartFullText}"(${continuationPart.text.length}), newParagraphPart="${newParaPartFullText}"(${newParagraphPart.text.length})`);
    
    return [continuationPart, newParagraphPart];
  }
  
  // No split needed
  log(`[PDF v3] splitMergedParagraph: No valid boundary found - no split, returning original`);
  return [para];
}

/**
 * Check if two elements of the same type should be merged across pages
 * Handles paragraphs, headings, and lists with type-specific logic
 * 
 * @param {{type?: string, pageNum?: number, columnIndex?: number, text?: string, [key: string]: any}} prevElement - Previous element
 * @param {{type?: string, pageNum?: number, columnIndex?: number, text?: string, [key: string]: any}} currentElement - Current element
 * @param {{baseFontSize?: number, gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} Should merge
 */
function shouldMergeElements(prevElement, currentElement, metrics = {}) {
  if (!prevElement || !currentElement) return false;
  
  // Only merge elements of the same type
  if (prevElement.type !== currentElement.type) {
    return false;
  }
  
  // CRITICAL: Never merge elements from different columns
  // Elements from different columns are separate content streams
  // and should never be merged, even if they appear on different pages
  if (prevElement.columnIndex !== undefined && currentElement.columnIndex !== undefined) {
    if (prevElement.columnIndex !== currentElement.columnIndex) {
      log(`[PDF v3] shouldMergeElements: Elements from different columns - NOT merging - prevColumnIndex=${prevElement.columnIndex}, currentColumnIndex=${currentElement.columnIndex}, prevType=${prevElement.type}, currentType=${currentElement.type}`);
      return false;
    }
  }
  
  // Check if on different pages
  const differentPages = prevElement.pageNum && currentElement.pageNum && prevElement.pageNum !== currentElement.pageNum;
  if (!differentPages) {
    return false; // Only merge across pages
  }
  
  const prevText = (prevElement.text || '').trim();
  const currentText = (currentElement.text || '').trim();
  
  if (!prevText || !currentText) return false;
  
  // Type-specific merging logic
  if (prevElement.type === 'paragraph') {
    return shouldMergeParagraphs(prevElement, currentElement, metrics);
  } else if (prevElement.type === 'heading') {
    return shouldMergeHeading(prevElement, currentElement, metrics);
  } else if (prevElement.type === 'list') {
    return shouldMergeList(prevElement, currentElement, metrics);
  }
  
  return false;
}

/**
 * Check if two headings should be merged across pages (split heading)
 * 
 * @param {{text?: string, fontSize?: number, pageNum?: number, columnIndex?: number, [key: string]: any}} prevHeading - Previous heading
 * @param {{text?: string, fontSize?: number, pageNum?: number, columnIndex?: number, [key: string]: any}} currentHeading - Current heading
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} Should merge
 */
/**
 * Check if two headings should be merged (simplified version)
 * FIXES v2 problem: too complex logic, simplified to 3 key checks
 * 
 * @param {{text?: string, fontSize?: number, pageNum?: number, columnIndex?: number, [key: string]: any}} prevHeading - Previous heading
 * @param {{text?: string, fontSize?: number, pageNum?: number, columnIndex?: number, [key: string]: any}} currentHeading - Current heading
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} Should merge
 */
function shouldMergeHeading(prevHeading, currentHeading, metrics = {}) {
  // VALIDATION: Input data (fixes v2 problem)
  if (!prevHeading || !currentHeading) return false;
  
  const prevText = String(prevHeading.text || '').trim();
  const currentText = String(currentHeading.text || '').trim();
  
  if (!prevText || !currentText) return false;
  
  // Check 1: Font size similarity (geometric proximity)
  const prevFontSize = validateFontSize(prevHeading.fontSize, metrics.baseFontSize);
  const currentFontSize = validateFontSize(currentHeading.fontSize, metrics.baseFontSize);
  const baseFontSize = metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const fontSizeSimilar = Math.abs(prevFontSize - currentFontSize) <= baseFontSize * FONT_SIZE_THRESHOLDS.SIMILARITY_TOLERANCE;
  
  if (!fontSizeSimilar) {
    return false; // Different font sizes = different headings
  }
  
  // Check 2: Semantic signs (colon, lowercase continuation)
  const pageBreakContext = analyzePageBreakContext(prevText, currentText);
  const prevEndsWithColon = prevText.endsWith(':');
  const nextStartsWithLowercase = pageBreakContext.nextStartsWithLowercase;
  const semanticMatch = prevEndsWithColon || nextStartsWithLowercase;
  
  if (!semanticMatch) {
    return false; // No semantic signs of continuation
  }
  
  // Check 3: Geometric proximity (Y gap - simplified, no complex calculations)
  // For cross-page breaks, we can't use Y gap directly
  // But we can check if both are short (typical for headings)
  const prevIsShort = prevText.length < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH;
  const currentIsShort = currentText.length < CONTINUATION_THRESHOLDS.SHORT_BLOCK_MAX_LENGTH;
  
  if (!prevIsShort || !currentIsShort) {
    return false; // Long text = likely not split heading
  }
  
  // All 3 checks passed
  log(`[PDF v3] shouldMergeHeading: Detected split heading across pages - prevText="${prevText.substring(0, 40)}", currentText="${currentText.substring(0, 40)}", prevFontSize=${prevFontSize}, currentFontSize=${currentFontSize}, fontSizeSimilar=${fontSizeSimilar}, semanticMatch=${semanticMatch}`);
  
  return true;
}

/**
 * Validate font size (helper function)
 * 
 * @param {number|undefined|null} fontSize - Font size to validate
 * @param {number} baseFontSize - Base font size for fallback
 * @returns {number} Validated font size
 */
function validateFontSize(fontSize, baseFontSize) {
  if (typeof fontSize !== 'number' || !isFinite(fontSize) || fontSize <= 0) {
    return baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  }
  return Math.max(0.1, Math.min(1000, fontSize));
}

/**
 * Check if two list items should be merged across pages (split list item)
 * Enhanced to handle grouped lists and list item continuations
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, gapAfter?: number, fontSize?: number, [key: string]: any}} prevList - Previous list item or list element
 * @param {{text?: string, pageNum?: number, columnIndex?: number, fontSize?: number, [key: string]: any}} currentList - Current list item or list element
 * @param {{baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} Should merge
 */
function shouldMergeList(prevList, currentList, metrics = {}) {
  // CRITICAL: Never merge lists from different columns
  if (prevList.columnIndex !== undefined && currentList.columnIndex !== undefined) {
    if (prevList.columnIndex !== currentList.columnIndex) {
      return false;
    }
  }
  
  // If both are grouped lists (have items array), check if they should be merged
  if (prevList.items && Array.isArray(prevList.items) && 
      currentList.items && Array.isArray(currentList.items)) {
    // Both are grouped lists - check if same type and level
    const prevListType = prevList.listType || (prevList.ordered !== undefined ? (prevList.ordered ? 'ordered' : 'unordered') : null);
    const currentListType = currentList.listType || (currentList.ordered !== undefined ? (currentList.ordered ? 'ordered' : 'unordered') : null);
    const prevListLevel = prevList.listLevel || 0;
    const currentListLevel = currentList.listLevel || 0;
    
    // Same type and level - merge lists
    if (prevListType && currentListType && prevListType === currentListType && prevListLevel === currentListLevel) {
      log(`[PDF v3] shouldMergeList: Detected grouped lists to merge - listType=${prevListType}, listLevel=${prevListLevel}, prevItems=${prevList.items.length}, currentItems=${currentList.items.length}`);
      return true;
    }
    
    return false;
  }
  
  // Handle individual list items (before grouping)
  const prevText = (prevList.text || '').trim();
  const currentText = (currentList.text || '').trim();
  
  if (!prevText || !currentText) return false;
  
  // Analyze page break context
  const pageBreakContext = analyzePageBreakContext(prevText, currentText);
  
  // Check if both look like list items
  const prevLooksLikeListItem = LIST_ITEM_PATTERNS.test(prevText);
  const currentLooksLikeListItem = LIST_ITEM_PATTERNS.test(currentText);
  
  // If both are list items, check if they're the same type
  if (prevLooksLikeListItem && currentLooksLikeListItem) {
    // Check if same list type (ordered vs unordered)
    const prevIsOrdered = /^\s*\d+[\.\)]\s+/.test(prevText);
    const currentIsOrdered = /^\s*\d+[\.\)]\s+/.test(currentText);
    
    // If different types, don't merge (separate lists)
    if (prevIsOrdered !== currentIsOrdered) {
      return false;
    }
    
    // Same type - check if they should be separate items or continuation
    // If previous ends with sentence and current starts with new marker, separate items
    if (pageBreakContext.prevEndsWithSentenceEnd && currentLooksLikeListItem) {
      return false; // Separate list items
    }
    
    // If gap is large, they're separate items
    const gapAnalysis = metrics.gapAnalysis;
    if (gapAnalysis && prevList.gapAfter !== null && prevList.gapAfter !== undefined) {
      const { paragraphGapMin } = gapAnalysis;
      if (paragraphGapMin && prevList.gapAfter >= paragraphGapMin) {
        return false; // Large gap = separate items
      }
    }
    
    // Otherwise, they might be continuation of same list (but separate items)
    // Don't merge - they'll be grouped later by list-grouper
    return false;
  }
  
  // If previous is list item and current starts with lowercase, it might be continuation
  const prevFontSize = prevList.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const currentFontSize = currentList.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const baseFontSize = metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  const fontSizeSimilar = Math.abs(prevFontSize - currentFontSize) <= baseFontSize * FONT_SIZE_THRESHOLDS.SIMILARITY_TOLERANCE;
  
  // List item continuation: previous is list item, current starts with lowercase, similar font size
  if (prevLooksLikeListItem && 
      pageBreakContext.nextStartsWithLowercase && 
      fontSizeSimilar && 
      !pageBreakContext.prevEndsWithSentenceEnd) {
    log(`[PDF v3] shouldMergeList: Detected list item continuation across pages - prevText="${pageBreakContext.prevPageEnd}", currentText="${pageBreakContext.nextPageStart}", prevFontSize=${prevFontSize}, currentFontSize=${currentFontSize}, fontSizeSimilar=${fontSizeSimilar}`);
    return true;
  }
  
  return false;
}

/**
 * Merge two paragraph elements
 * Handles splitting if current block contains multiple paragraphs
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, lines?: Array<any>, [key: string]: any}} prev - Previous paragraph
 * @param {{text?: string, pageNum?: number, columnIndex?: number, lines?: Array<any>, [key: string]: any}} current - Current paragraph
 * @returns {Object|null} Merged paragraph or null if should not merge
 */
function mergeParagraphElements(prev, current) {
  // Before merging, check if current block contains multiple paragraphs
  // If it starts with continuation but contains new paragraph, split it first
  const splitCurrent = splitMergedParagraph(current);
  
  if (splitCurrent.length > 1) {
    // Current block was split - merge only the continuation part
    const continuationPart = splitCurrent[0];
    // Preserve lines from both elements when merging
    const mergedLines = [];
    if (prev.lines && Array.isArray(prev.lines)) {
      mergedLines.push(...prev.lines);
    }
    if (continuationPart.lines && Array.isArray(continuationPart.lines)) {
      mergedLines.push(...continuationPart.lines);
    }
    const mergedPara = {
      ...prev,
      text: (prev.text || '') + ' ' + (continuationPart.text || ''),
      lines: mergedLines.length > 0 ? mergedLines : prev.lines
    };
    
    const prevFullText = prev.text ? prev.text.substring(0, 200) : 'NO TEXT';
    const contPartFullText = continuationPart.text ? continuationPart.text.substring(0, 200) : 'NO TEXT';
    const mergedFullText = mergedPara.text ? mergedPara.text.substring(0, 300) : 'NO TEXT';
    log(`[PDF v3] mergeCrossPageParagraphs: MERGED paragraphs (with split) - prevPage=${prev.pageNum}, currentPage=${current.pageNum}, prevColumn=${prev.columnIndex}, currentColumn=${current.columnIndex}, prevText="${prevFullText}", continuationPart="${contPartFullText}", mergedText="${mergedFullText}", mergedLength=${mergedPara.text ? mergedPara.text.length : 0}, remainingParts=${splitCurrent.slice(1).length}`);
    
    return {
      merged: mergedPara,
      remaining: splitCurrent.slice(1)
    };
  } else {
    // No split needed, merge normally
    // Preserve lines from both elements when merging
    const mergedLines = [];
    if (prev.lines && Array.isArray(prev.lines)) {
      mergedLines.push(...prev.lines);
    }
    if (current.lines && Array.isArray(current.lines)) {
      mergedLines.push(...current.lines);
    }
    const mergedPara = {
      ...prev,
      text: (prev.text || '') + ' ' + (current.text || ''),
      lines: mergedLines.length > 0 ? mergedLines : prev.lines
    };
    
    // Log full merge details
    const prevFullText = prev.text ? prev.text.substring(0, 200) : 'NO TEXT';
    const currentFullText = current.text ? current.text.substring(0, 200) : 'NO TEXT';
    const mergedFullText = mergedPara.text ? mergedPara.text.substring(0, 300) : 'NO TEXT';
    log(`[PDF v3] mergeCrossPageParagraphs: MERGED paragraphs - prevPage=${prev.pageNum}, currentPage=${current.pageNum}, prevColumn=${prev.columnIndex}, currentColumn=${current.columnIndex}, prevText="${prevFullText}", currentText="${currentFullText}", mergedText="${mergedFullText}", mergedLength=${mergedPara.text ? mergedPara.text.length : 0}`);
    
    return { merged: mergedPara, remaining: [] };
  }
}

/**
 * Merge two heading elements
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, [key: string]: any}} prev - Previous heading
 * @param {{text?: string, pageNum?: number, columnIndex?: number, [key: string]: any}} current - Current heading
 * @returns {Object} Merged heading
 */
function mergeHeadingElements(prev, current) {
  // Preserve lines from both elements when merging
  const mergedLines = [];
  if (prev.lines && Array.isArray(prev.lines)) {
    mergedLines.push(...prev.lines);
  }
  if (current.lines && Array.isArray(current.lines)) {
    mergedLines.push(...current.lines);
  }
  const mergedHeading = {
    ...prev,
    text: (prev.text || '') + ' ' + (current.text || ''),
    lines: mergedLines.length > 0 ? mergedLines : prev.lines
  };
  
  const prevFullText = prev.text ? prev.text.substring(0, 150) : 'NO TEXT';
  const currentFullText = current.text ? current.text.substring(0, 150) : 'NO TEXT';
  const mergedFullText = mergedHeading.text ? mergedHeading.text.substring(0, 250) : 'NO TEXT';
  log(`[PDF v3] mergeCrossPageParagraphs: MERGED headings - prevPage=${prev.pageNum}, currentPage=${current.pageNum}, prevColumn=${prev.columnIndex}, currentColumn=${current.columnIndex}, prevText="${prevFullText}", currentText="${currentFullText}", mergedText="${mergedFullText}", mergedLength=${mergedHeading.text ? mergedHeading.text.length : 0}`);
  
  return mergedHeading;
}

/**
 * Merge two list elements
 * Handles both individual list items and grouped lists
 * 
 * @param {{text?: string, pageNum?: number, columnIndex?: number, items?: Array<any>, minY?: number, maxY?: number, [key: string]: any}} prev - Previous list item or list element
 * @param {{text?: string, pageNum?: number, columnIndex?: number, items?: Array<any>, minY?: number, maxY?: number, [key: string]: any}} current - Current list item or list element
 * @returns {Object} Merged list element
 */
function mergeListElements(prev, current) {
  // If both are grouped lists (have items array), merge items
  if (prev.items && Array.isArray(prev.items) && 
      current.items && Array.isArray(current.items)) {
    const mergedList = {
      ...prev,
      items: [...prev.items, ...current.items],
      text: (prev.text || '') + '\n' + (current.text || '')
    };
    
    // Update metadata
    if (current.pageNum && (!mergedList.pageNum || current.pageNum > mergedList.pageNum)) {
      mergedList.pageNum = current.pageNum;
    }
    if (current.maxY && (!mergedList.maxY || current.maxY > mergedList.maxY)) {
      mergedList.maxY = current.maxY;
    }
    if (current.minY && (!mergedList.minY || current.minY < mergedList.minY)) {
      mergedList.minY = current.minY;
    }
    
    log(`[PDF v3] mergeCrossPageParagraphs: MERGED grouped lists - prevPage=${prev.pageNum}, currentPage=${current.pageNum}, prevItems=${prev.items.length}, currentItems=${current.items.length}, mergedItems=${mergedList.items.length}`);
    
    return mergedList;
  }
  
  // Handle individual list items (continuation of single item)
  // Preserve lines from both elements when merging
  const mergedLines = [];
  if (prev.lines && Array.isArray(prev.lines)) {
    mergedLines.push(...prev.lines);
  }
  if (current.lines && Array.isArray(current.lines)) {
    mergedLines.push(...current.lines);
  }
  const mergedList = {
    ...prev,
    text: (prev.text || '') + ' ' + (current.text || ''),
    lines: mergedLines.length > 0 ? mergedLines : prev.lines
  };
  
  const prevFullText = prev.text ? prev.text.substring(0, 150) : 'NO TEXT';
  const currentFullText = current.text ? current.text.substring(0, 150) : 'NO TEXT';
  const mergedFullText = mergedList.text ? mergedList.text.substring(0, 250) : 'NO TEXT';
  log(`[PDF v3] mergeCrossPageParagraphs: MERGED list items (continuation) - prevPage=${prev.pageNum}, currentPage=${current.pageNum}, prevColumn=${prev.columnIndex}, currentColumn=${current.columnIndex}, prevText="${prevFullText}", currentText="${currentFullText}", mergedText="${mergedFullText}", mergedLength=${mergedList.text ? mergedList.text.length : 0}`);
  
  return mergedList;
}

/**
 * Merge elements across pages (paragraphs, headings, lists)
 * Creates new objects instead of mutating existing ones
 * 
 * @param {Array} allElements - All elements
 * @param {{baseFontSize?: number, gapAnalysis?: {paragraphGapMin?: number}, [key: string]: any}} metrics - PDF metrics (for continuation detection)
 * @returns {Array} Merged elements (new array, no mutations)
 */
export function mergeCrossPageParagraphs(allElements, metrics = {}) {
  // Validate inputs
  if (!allElements || !Array.isArray(allElements)) {
    log('[PDF v3] mergeCrossPageParagraphs: Invalid allElements input, returning empty array');
    return [];
  }
  
  if (!metrics || typeof metrics !== 'object') {
    log('[PDF v3] mergeCrossPageParagraphs: Invalid metrics, using empty object');
    metrics = {};
  }
  
  // Log summary using utility
  const elementTypeCounts = countBy(allElements, el => el.type);
  log(`[PDF v3] mergeCrossPageParagraphs: Starting merge - totalElements=${allElements.length}, types=${JSON.stringify(elementTypeCounts)}`);
  
  const merged = [];
  let i = 0;
  
  while (i < allElements.length) {
    const current = allElements[i];
    
    // Check if we should merge with previous element (any type)
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      
      // Use universal merging logic for all element types
      const shouldMerge = shouldMergeElements(prev, current, metrics);
      
      if (shouldMerge) {
        // Type-specific merging logic
        if (prev.type === 'paragraph' && current.type === 'paragraph') {
          const mergeResult = mergeParagraphElements(prev, current);
          if (mergeResult) {
            merged[merged.length - 1] = mergeResult.merged;
            // Add remaining parts as separate paragraphs
            merged.push(...mergeResult.remaining);
            i++;
            continue;
          }
        } else if (prev.type === 'heading' && current.type === 'heading') {
          merged[merged.length - 1] = mergeHeadingElements(prev, current);
          i++;
          continue;
        } else if (prev.type === 'list' && current.type === 'list') {
          merged[merged.length - 1] = mergeListElements(prev, current);
          i++;
          continue;
        }
      }
    }
    merged.push({ ...current });
    i++;
  }
  
  // Log summary with merge statistics using utility
  const mergedCount = allElements.length - merged.length;
  const outputTypeCounts = countBy(merged, el => el.type);
  log(`[PDF v3] mergeCrossPageParagraphs: Merge complete - inputCount=${allElements.length}, outputCount=${merged.length}, merged=${mergedCount}, outputTypes=${JSON.stringify(outputTypeCounts)}`);
  
  return merged;
}

