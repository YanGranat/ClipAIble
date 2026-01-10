// @ts-check
// Helper functions for text block analysis

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { DEFAULT_METRICS } from '../constants.js';
import { isColumnGap } from './visual-structure-analyzer.js';

/**
 * Check if a gap indicates a block boundary (large empty space)
 * 
 * @param {number} effectiveGap - Effective gap size (gap or 0.1 if gap = 0)
 * @param {{normalGapMax?: number, paragraphGapMin?: number, mean?: number, baseFontSize?: number, [key: string]: any}} gapAnalysis - Results from analyzeGaps
 * @param {{lines?: Array<any>, gapCount?: number, totalGap?: number, [key: string]: any}} currentBlock - Current block being built
 * @param {{fontSize?: number, text?: string, [key: string]: any}} current - Current line
 * @param {{fontSize?: number, text?: string, [key: string]: any}|null} [next] - Next line (optional, for fontSize comparison)
 * @returns {boolean} True if gap is a block boundary
 */
export function checkBlockBoundary(effectiveGap, gapAnalysis, currentBlock, current, next = null, metrics = {}) {
  const { normalGapMax, paragraphGapMin, mean } = gapAnalysis;
  const avgFontSize = current.fontSize || 12;
  const baseFontSize = metrics.baseFontSize || gapAnalysis.baseFontSize || 12;
  
  // Check multiple conditions for block boundary
  const check1 = effectiveGap >= paragraphGapMin;
  const check2 = effectiveGap >= normalGapMax * 1.5; // 1.5x instead of 2.0x
  const check3 = effectiveGap >= mean * 2.0; // 2.0x instead of 2.5x
  // Additional check: if gap is significantly larger than average gap within current block
  const avgBlockGap = currentBlock.gapCount > 0 ? currentBlock.totalGap / currentBlock.gapCount : 0;
  const check4 = avgBlockGap > 0 && effectiveGap >= avgBlockGap * 3.0; // Gap is 3x larger than average in-block gap
  // Check for empty line: gap significantly larger than font size (likely empty line)
  const check5 = effectiveGap >= avgFontSize * 8.0; // Gap is 8x font size = likely empty line
  
  // NEW: Check for fontSize change (indicates different element type)
  let check6 = false;
  if (next && next.fontSize && current.fontSize) {
    const fontSizeChange = Math.abs(next.fontSize - current.fontSize);
    const fontSizeChangeRatio = fontSizeChange / current.fontSize;
    // If fontSize changes by >20%, it's likely a different element (heading vs paragraph)
    if (fontSizeChangeRatio > 0.2) {
      check6 = true;
    }
  }
  
  // NEW: Check if current block is short (likely heading) and next has different fontSize
  let check7 = false;
  if (next && next.fontSize && currentBlock.lines.length > 0) {
    const blockText = currentBlock.lines.map(l => l.text || '').join(' ').trim();
    const blockLength = blockText.length;
    const isShortBlock = blockLength > 0 && blockLength < 150; // Short text threshold
    const nextFontSize = next.fontSize || avgFontSize;
    const currentFontSize = current.fontSize || avgFontSize;
    const fontSizeChange = Math.abs(nextFontSize - currentFontSize);
    const fontSizeChangeRatio = fontSizeChange / currentFontSize;
    
    // If current block is short and fontSize changes significantly, it's likely a heading followed by paragraph
    if (isShortBlock && fontSizeChangeRatio > 0.15) {
      check7 = true;
    }
  }
  
  // NEW: Check if next line is short (likely heading) and gap is larger than average
  // This handles cases like: long paragraph -> gap -> short heading
  let check8 = false;
  if (next && next.text) {
    const nextText = (next.text || '').trim();
    const nextTextLength = nextText.length;
    const isNextShort = nextTextLength > 0 && nextTextLength < 150; // Short text threshold
    const nextStartsWithCapital = /^\p{Lu}/u.test(nextText); // Starts with capital letter
    
    // If next is short (likely heading) and gap is larger than average, it's a boundary
    // This handles: "organic molecules." (long) -> gap=28.57 -> "Experimental Results" (short heading)
    if (isNextShort && nextStartsWithCapital && effectiveGap >= mean * 1.5) {
      check8 = true;
    }
  }
  
  // NEW: Check if current line is a short heading followed by paragraph/table
  // This handles: "Abiogenesis Theory" (short) -> gap -> "Origin of life..." (paragraph)
  let check9 = false;
  if (current && current.text && next && next.text) {
    const currentText = (current.text || '').trim();
    const currentTextLength = currentText.length;
    const nextText = (next.text || '').trim();
    const nextTextLength = nextText.length;
    
    // Current is short (likely heading) - check multiple conditions
    const isCurrentShort = currentTextLength > 0 && currentTextLength < 100;
    const currentStartsWithCapital = /^\p{Lu}/u.test(currentText);
    const nextStartsWithCapital = /^\p{Lu}/u.test(nextText);
    
    // Check if current has larger font size (heading indicator)
    const currentFontSize = current.fontSize || avgFontSize;
    const nextFontSize = next.fontSize || avgFontSize;
    const currentFontSizeRatio = currentFontSize / baseFontSize;
    const hasLargerFont = currentFontSizeRatio >= 1.1; // At least 10% larger than base
    
    // Condition 1: Short heading with larger font, followed by any text with reasonable gap
    // This handles: "Abiogenesis Theory" (short, fontSize=14) -> gap -> "Origin..." (paragraph)
    if (isCurrentShort && currentStartsWithCapital && hasLargerFont && nextStartsWithCapital && effectiveGap >= mean * 1.2) {
      check9 = true;
    }
    
    // Condition 2: Short heading (even without larger font), followed by long paragraph
    // This handles: "Early Earth Conditions" (short) -> gap -> "Parameter" (table row, but treated as paragraph initially)
    const isNextLong = nextTextLength > 200;
    if (isCurrentShort && currentStartsWithCapital && isNextLong && nextStartsWithCapital && effectiveGap >= mean * 0.8) {
      check9 = true;
    }
    
    // Condition 3: Very short text (likely heading) with reasonable gap, even if next is not long yet
    // This handles: "Experimental Results" (23 chars) -> gap -> "Compound" (table row)
    const isVeryShort = currentTextLength > 0 && currentTextLength < 50;
    if (isVeryShort && currentStartsWithCapital && nextStartsWithCapital && effectiveGap >= mean * 1.0) {
      check9 = true;
    }
  }
  
  // NEW: Check if current line is a short bold text without period at end, followed by paragraph
  // This handles: "Mars Features" (short, bold, no period) -> gap -> "Mars attracts..." (paragraph)
  // Also handles: "Supernovae" (short, bold/italic, no period) -> gap -> "Supernovae are..." (paragraph)
  let check10 = false;
  if (current && current.text && next && next.text) {
    const currentText = (current.text || '').trim();
    const currentTextLength = currentText.length;
    const nextText = (next.text || '').trim();
    
    // Check if current line is bold (from line items or line itself)
    const isCurrentBold = current.isBold || (current.items && current.items.some(item => item.isBold));
    
    // Check if current line doesn't end with period (likely heading, not sentence)
    const currentEndsWithPeriod = /[.!?]\s*$/.test(currentText);
    
    // Check if current line is relatively short (likely heading, not paragraph)
    const isCurrentShort = currentTextLength > 0 && currentTextLength < 100;
    
    // Check if current line has free space at the end (doesn't fill the line)
    // Estimate: if line width is available, check if text width is less than line width
    // For now, use heuristic: short text without period is likely not filling the line
    const hasFreeSpace = isCurrentShort && !currentEndsWithPeriod;
    
    // Check if next line starts a paragraph (starts with capital, likely longer text)
    const nextStartsWithCapital = /^\p{Lu}/u.test(nextText);
    const nextTextLength = nextText.length;
    const isNextParagraph = nextStartsWithCapital && nextTextLength > 50;
    
    // If current is short bold text without period, has free space, and next is paragraph,
    // then this is likely a heading that should be separated from the paragraph
    // Use a more lenient gap threshold since there might not be a large visual gap
    if (isCurrentBold && isCurrentShort && !currentEndsWithPeriod && hasFreeSpace && isNextParagraph && effectiveGap >= mean * 0.5) {
      check10 = true;
      log(`[PDF v3] analyzeTextBlocks: check10=true - Short bold heading detected: text="${currentText.substring(0, 40)}", length=${currentTextLength}, isBold=${isCurrentBold}, endsWithPeriod=${currentEndsWithPeriod}, gap=${effectiveGap.toFixed(2)}, mean=${mean.toFixed(2)}`);
    }
  }
  
  // NEW: Check if current line is a short text (even if not bold) without period, with free space, followed by paragraph
  // This handles: "Supernovae" (short, NOT bold, no period, free space) -> gap -> "Supernovae are..." (paragraph)
  // ALSO: "Biomarkers in exoplanet atmospheres" (longer, but still a heading) -> gap -> paragraph
  // CRITICAL: Even if text is not recognized as bold, if it has characteristics of a heading
  // (short, no period, free space, followed by paragraph), it should be separated
  let check11 = false;
  if (current && current.text && next && next.text) {
    const currentText = (current.text || '').trim();
    const currentTextLength = currentText.length;
    const nextText = (next.text || '').trim();
    
    // Check if current line doesn't end with period (likely heading, not sentence)
    const currentEndsWithPeriod = /[.!?]\s*$/.test(currentText);
    
    // Check if current line is relatively short (likely heading, not paragraph)
    // Use stricter threshold for non-bold text: very short (< 50 chars) or moderately short (< 100 chars)
    // BUT: Also allow longer text (up to 50 chars) if it's a single line and has free space
    const isCurrentVeryShort = currentTextLength > 0 && currentTextLength < 50;
    const isCurrentShort = currentTextLength > 0 && currentTextLength < 100;
    const isCurrentModerate = currentTextLength > 0 && currentTextLength < 50; // For headings like "Biomarkers in exoplanet atmospheres"
    
    // Check if current line has free space at the end (doesn't fill the line)
    // Use items to calculate actual text width vs estimated line width
    // CRITICAL: For headings like "Biomarkers in exoplanet atmospheres" (34 chars), 
    // we need to be more lenient - if text is short/moderate and doesn't end with period, it likely has free space
    let hasFreeSpace = false;
    if (current.items && current.items.length > 0) {
      // Calculate actual text width from items
      const lastItem = current.items[current.items.length - 1];
      const firstItem = current.items[0];
      if (lastItem && firstItem && typeof lastItem.x === 'number' && typeof lastItem.width === 'number') {
        const textEndX = lastItem.x + lastItem.width;
        // Estimate line width: use last item's x + width, or assume typical line width (500-600px for A4)
        // If text ends before 70% of typical line width (350px), it has free space
        const estimatedLineWidth = 500; // Typical line width for A4 PDF
        const textWidthRatio = textEndX / estimatedLineWidth;
        // If text uses less than 30% of line width, it definitely has free space
        // If text uses less than 50% and is short, it likely has free space
        // ALSO: For moderate-length text (30-50 chars) without period, assume it has free space
        hasFreeSpace = textWidthRatio < 0.3 || (textWidthRatio < 0.5 && isCurrentShort) || (isCurrentModerate && !currentEndsWithPeriod);
      } else {
        // Fallback: use heuristic for short/moderate text without period
        hasFreeSpace = (isCurrentShort || isCurrentModerate) && !currentEndsWithPeriod;
      }
    } else {
      // Fallback: use heuristic for short/moderate text without period
      hasFreeSpace = (isCurrentShort || isCurrentModerate) && !currentEndsWithPeriod;
    }
    
    // Check if next line starts a paragraph (starts with capital, likely longer text)
    const nextStartsWithCapital = /^\p{Lu}/u.test(nextText);
    const nextTextLength = nextText.length;
    const isNextParagraph = nextStartsWithCapital && nextTextLength > 50;
    
    // Check if current line starts with capital (typical for headings)
    const currentStartsWithCapital = /^\p{Lu}/u.test(currentText);
    
    // If current is short text (even if not bold) without period, has free space, starts with capital,
    // and next is paragraph, then this is likely a heading that should be separated
    // Use a more lenient gap threshold since there might not be a large visual gap
    // For very short text (< 50 chars), use even more lenient threshold
    // ALSO: For moderate-length text (30-50 chars) that looks like a heading, use lenient threshold
    const gapThreshold = isCurrentVeryShort ? mean * 0.3 : (isCurrentModerate ? mean * 0.4 : mean * 0.5);
    // Allow both short (< 100) and moderate (< 50) text if it has heading characteristics
    const isHeadingCandidate = (isCurrentShort || isCurrentModerate) && !currentEndsWithPeriod && hasFreeSpace && currentStartsWithCapital && isNextParagraph;
    if (isHeadingCandidate && effectiveGap >= gapThreshold) {
      check11 = true;
      log(`[PDF v3] analyzeTextBlocks: check11=true - Short heading (non-bold) detected: text="${currentText.substring(0, 40)}", length=${currentTextLength}, endsWithPeriod=${currentEndsWithPeriod}, hasFreeSpace=${hasFreeSpace}, gap=${effectiveGap.toFixed(2)}, mean=${mean.toFixed(2)}, threshold=${gapThreshold.toFixed(2)}`);
    }
  }
  
  const isBlockBoundary = check1 || check2 || check3 || check4 || check5 || check6 || check7 || check8 || check9 || check10 || check11;
  
  log(`[PDF v3] analyzeTextBlocks: Gap analysis - gap=${effectiveGap.toFixed(2)}, check1=${check1}(${effectiveGap.toFixed(2)}>=${paragraphGapMin.toFixed(2)}), check2=${check2}(${effectiveGap.toFixed(2)}>=${(normalGapMax * 1.5).toFixed(2)}), check3=${check3}(${effectiveGap.toFixed(2)}>=${(mean * 2.0).toFixed(2)}), check4=${check4}(avgBlockGap=${avgBlockGap.toFixed(2)}, ${effectiveGap.toFixed(2)}>=${(avgBlockGap * 3.0).toFixed(2)}), check5=${check5}(fontSize=${avgFontSize.toFixed(2)}, ${effectiveGap.toFixed(2)}>=${(avgFontSize * 8.0).toFixed(2)}), check6=${check6}(fontSizeChange), check7=${check7}(shortBlock+fontSizeChange), check8=${check8}(nextShort+largeGap), check9=${check9}(shortHeading+longParagraph), check10=${check10}(shortBoldHeading+paragraph), check11=${check11}(shortHeadingNonBold+paragraph), isBlockBoundary=${isBlockBoundary}`);
  
  return isBlockBoundary;
}

/**
 * Process gap between two lines and update current block
 * 
 * @param {{text?: string, y?: number, pageNum?: number, x?: number, [key: string]: any}} current - Current line
 * @param {{text?: string, y?: number, pageNum?: number, x?: number, [key: string]: any}} next - Next line
 * @param {number} gap - Gap size between lines
 * @param {{lines?: Array<any>, startY?: number, endY?: number, totalGap?: number, gapCount?: number, [key: string]: any}} currentBlock - Current block being built
 * @param {{normalGapMax?: number, paragraphGapMin?: number, mean?: number, baseFontSize?: number, [key: string]: any}} gapAnalysis - Results from analyzeGaps
 * @param {{columnGaps?: Array<any>, [key: string]: any}|null} visualStructure - Results from analyzeVisualStructure (optional)
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @param {number} lineIndex - Line index for logging
 * @returns {Object|null} New block if boundary detected, null otherwise
 */
export function processGapBetweenLines(current, next, gap, currentBlock, gapAnalysis, visualStructure, metrics, lineIndex) {
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const currentText = (current.text || '').substring(0, 50);
  const nextText = (next.text || '').substring(0, 50);
  
  // Only analyze gaps on the same page
  if (current.pageNum && next.pageNum && current.pageNum !== next.pageNum) {
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Different pages - currentPage=${current.pageNum}, nextPage=${next.pageNum}, skipping gap analysis`);
    return null;
  }
  
  // Handle all valid gaps (including gap = 0 for lines with same Y)
  if (!isFinite(gap) || gap < 0) {
    if (!isFinite(gap)) {
      log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] INVALID gap - currentY=${current.y}, nextY=${next.y}, gap=${gap}, currentText="${currentText}", nextText="${nextText}", skipping`);
    } else {
      log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] NEGATIVE gap (lines not sorted?) - currentY=${current.y}, nextY=${next.y}, gap=${gap}, currentText="${currentText}", nextText="${nextText}", treating as continuation`);
      if (!currentBlock.lines.includes(current)) {
        currentBlock.lines.push(current);
        log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Added line after negative gap - blockSize=${currentBlock.lines.length}`);
      }
      currentBlock.totalGap += 0.1; // Treat as very small gap
      currentBlock.gapCount++;
    }
    return null;
  }
  
  // Add current line to block (if not already added)
  if (currentBlock.lines.length === 0) {
    currentBlock.startY = current.y || 0;
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Starting NEW block - blockIndex=${currentBlock.lines.length}, startY=${current.y.toFixed(2)}, firstLine="${currentText}"`);
  }
  // Only add if not already in block (prevent duplicates)
  const wasInBlock = currentBlock.lines.includes(current);
  if (!wasInBlock) {
    currentBlock.lines.push(current);
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Added line to block - blockIndex=${currentBlock.lines.length}, lineIndex=${lineIndex}, y=${current.y.toFixed(2)}, blockSize=${currentBlock.lines.length}, text="${currentText}"`);
  } else {
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Line already in block - skipping duplicate, y=${current.y.toFixed(2)}, text="${currentText}"`);
  }
  currentBlock.endY = next.y || current.y || 0;
  
  // For gap = 0 (same Y), treat as very small gap (same line continuation)
  const effectiveGap = gap === 0 ? 0.1 : gap;
  
  // CRITICAL: First check if this gap is between columns (not a paragraph gap)
  // If visual structure is available, check if gap is at column boundary
  // Use X-coordinate of next line to check if gap is at column boundary
  const nextLineX = next.x || 0;
  const isColumnBoundaryGap = visualStructure && isColumnGap(nextLineX, visualStructure, baseFontSize);
  
  if (isColumnBoundaryGap) {
    // This is a gap between columns, NOT a paragraph gap - don't create block boundary
    // But since we're processing lines within a single column, this shouldn't happen
    // Log warning and continue as normal paragraph gap
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] WARNING - Gap detected at column boundary (nextLineX=${nextLineX.toFixed(2)}) but processing within column - treating as paragraph gap`);
  }
  
  // Check if gap indicates block boundary (pass next line for fontSize comparison)
  const isBlockBoundary = checkBlockBoundary(effectiveGap, gapAnalysis, currentBlock, current, next, metrics);
  
  if (isBlockBoundary) {
    // This is a boundary - finish current block (without adding next line)
    // The next line will be added to the new block on the next iteration
    if (currentBlock.lines.length > 0) {
      // Calculate average gap within block
      if (currentBlock.gapCount > 0) {
        currentBlock.averageGap = currentBlock.totalGap / currentBlock.gapCount;
      } else {
        currentBlock.averageGap = 0;
      }
      
      // Log ALL lines in block before pushing
      const blockLinesLog = currentBlock.lines.map((l, idx) => {
        const y = l.y ? l.y.toFixed(2) : 'N/A';
        const text = (l.text || '').substring(0, 40);
        return `[${idx}]Y${y}:"${text}"`;
      }).join(' | ');
      log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] FINISHING block - blockIndex=${currentBlock.lines.length}, lineCount=${currentBlock.lines.length}, startY=${currentBlock.startY.toFixed(2)}, endY=${currentBlock.endY.toFixed(2)}, avgGap=${currentBlock.averageGap.toFixed(2)}, boundaryGap=${effectiveGap.toFixed(2)}, ALL_LINES=[${blockLinesLog}]`);
      
      // Create new block for next iteration
      const newBlock = {
        lines: [],
        startY: next.y || 0,
        endY: next.y || 0,
        totalGap: 0,
        gapCount: 0,
        boundaryGap: effectiveGap // Store the gap that caused the boundary
      };
      
      log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Created NEW block for next iteration - nextLineY=${next.y.toFixed(2)}, nextLineText="${nextText}"`);
      
      return newBlock;
    }
  } else {
    // Small gap - text continues in same block
    currentBlock.totalGap += effectiveGap;
    currentBlock.gapCount++;
    log(`[PDF v3] analyzeTextBlocks: [${lineIndex}] Continuation - gap=${effectiveGap.toFixed(2)}, totalGap=${currentBlock.totalGap.toFixed(2)}, gapCount=${currentBlock.gapCount}`);
  }
  
  return null;
}

/**
 * Finalize a block by calculating average gap and preparing for output
 * 
 * @param {{lines?: Array<any>, combinedText?: string, [key: string]: any}} currentBlock - Current block to finalize
 * @param {{text?: string, y?: number, [key: string]: any}} lastLine - Last line to add to block
 * @param {number} blockIndex - Block index for logging
 */
export function finalizeBlock(currentBlock, lastLine, blockIndex) {
  const lastLineText = (lastLine.text || '').substring(0, 50);
  if (!currentBlock.lines.includes(lastLine)) {
    currentBlock.lines.push(lastLine);
    currentBlock.endY = lastLine.y || 0;
    log(`[PDF v3] analyzeTextBlocks: Added LAST line to block - blockIndex=${blockIndex}, y=${lastLine.y.toFixed(2)}, text="${lastLineText}"`);
  } else {
    log(`[PDF v3] analyzeTextBlocks: Last line already in block - skipping, y=${lastLine.y.toFixed(2)}, text="${lastLineText}"`);
  }
  
  if (currentBlock.gapCount > 0) {
    currentBlock.averageGap = currentBlock.totalGap / currentBlock.gapCount;
  } else {
    currentBlock.averageGap = 0;
  }
  
  // Log ALL lines in last block
  const lastBlockLinesLog = currentBlock.lines.map((l, idx) => {
    const y = l.y ? l.y.toFixed(2) : 'N/A';
    const text = (l.text || '').substring(0, 40);
    return `[${idx}]Y${y}:"${text}"`;
  }).join(' | ');
  log(`[PDF v3] analyzeTextBlocks: FINISHING LAST block - blockIndex=${blockIndex}, lineCount=${currentBlock.lines.length}, startY=${currentBlock.startY.toFixed(2)}, endY=${currentBlock.endY.toFixed(2)}, avgGap=${currentBlock.averageGap.toFixed(2)}, ALL_LINES=[${lastBlockLinesLog}]`);
}

