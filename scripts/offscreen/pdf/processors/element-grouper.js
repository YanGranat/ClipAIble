// @ts-check
// Element grouper - groups lines into elements (paragraphs, headings, lists)
// Strategy: First group lines into blocks by gaps, then classify grouped blocks

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { FONT_SIZE_THRESHOLDS, CROSS_PAGE_BREAK_MARKER, PAGE_BREAK_CONTEXT, CONTINUATION_THRESHOLDS, DEFAULT_METRICS } from '../constants.js';
import { shouldContinueBlock } from './continuation.js';
import { analyzeStructure } from '../analyzers/structure.js';
import { analyzeGaps, isParagraphBoundary } from '../analyzers/gap-analyzer.js';
import { analyzeTextBlocks, isTextBlockBoundary } from '../analyzers/text-block-analyzer.js';
import { classifyHeading } from '../classifiers/heading.js';
import { classifyParagraph } from '../classifiers/paragraph.js';
import { classifyList } from '../classifiers/list.js';
import { classifyTable } from '../classifiers/table.js';
import { decideElementType } from './element-decider.js';
import { splitListHeadings } from './list-splitter.js';
import { extractTableStructure } from './table-extractor.js';
import { validateArrayInput, countBy } from '../utils/array-helpers.js';
import { truncateText, formatElementForLog } from '../utils/text-helpers.js';

/**
 * Group lines into elements (paragraphs, headings, lists)
 * Strategy: First group lines into blocks by gaps, then classify grouped blocks
 * This prevents individual short lines from being misclassified as headings
 * 
 * @param {Array} lines - Array of line objects
 * @param {{paragraphGapThreshold?: number, gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, columnIndex?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Array} Array of paragraph/heading/list objects
 */
/**
 * Validate and prepare inputs for groupLinesIntoElements
 * @param {Array} lines - Lines to validate
 * @param {{paragraphGapThreshold?: number, gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, [key: string]: any}} metrics - Metrics to validate
 * @returns {Object|null} { lines, metrics } or null if invalid
 */
function validateAndPrepareInputs(lines, metrics) {
  const linesError = validateArrayInput(lines, 'lines');
  if (linesError) {
    logWarn(`[PDF v3] groupLinesIntoElements: ${linesError}`);
    return null;
  }
  
  if (lines.length === 0) {
    return null;
  }
  
  if (!metrics || typeof metrics !== 'object') {
    logWarn(`[PDF v3] groupLinesIntoElements: Invalid metrics, using defaults - metrics=${metrics ? typeof metrics : 'null'}`);
    metrics = { paragraphGapThreshold: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD };
  }
  
  return { lines, metrics };
}

/**
 * Sort lines by page number and Y-coordinate
 * @param {Array} lines - Lines to sort
 * @returns {Array} Sorted lines
 */
function sortLinesByPosition(lines) {
  return [...lines].sort((a, b) => {
    const pageA = a.pageNum || 0;
    const pageB = b.pageNum || 0;
    if (pageA !== pageB) {
      return pageA - pageB;
    }
    const yA = a.y || 0;
    const yB = b.y || 0;
    return yA - yB;
  });
}

/**
 * Prepare gap analysis from metrics or analyze locally
 * @param {Array} lines - Lines to analyze
 * @param {{paragraphGapThreshold?: number, gapAnalysis?: {normalGapMax?: number, paragraphGapMin?: number}, columnIndex?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Object} Gap analysis
 */
function prepareGapAnalysis(lines, metrics) {
  if (metrics && metrics.gapAnalysis) {
    const isColumnSpecific = metrics.columnIndex !== undefined;
    log(`[PDF v3] groupLinesIntoElements: Using gap analysis from metrics - ${isColumnSpecific ? 'column-specific' : 'global'}, normalGapMax=${metrics.gapAnalysis.normalGapMax.toFixed(2)}, paragraphGapMin=${metrics.gapAnalysis.paragraphGapMin.toFixed(2)}`);
    return metrics.gapAnalysis;
  } else {
    const gapAnalysis = analyzeGaps(lines);
    log(`[PDF v3] groupLinesIntoElements: Using local gap analysis (no gap analysis in metrics) - normalGapMax=${gapAnalysis.normalGapMax.toFixed(2)}, paragraphGapMin=${gapAnalysis.paragraphGapMin.toFixed(2)}`);
    return gapAnalysis;
  }
}

/**
 * Convert text blocks to grouped blocks format
 * @param {Array} blocks - Text blocks from analyzeTextBlocks
 * @returns {Array} Grouped blocks
 */
function convertTextBlocksToGroupedBlocks(blocks) {
  return blocks.map((textBlock) => {
    let blockLines = textBlock.lines || [];
    blockLines = [...blockLines].sort((a, b) => {
      const yA = a.y || 0;
      const yB = b.y || 0;
      return yA - yB;
    });
    
    const combinedText = blockLines.reduce((acc, l) => {
      const trimmed = (l.text || '').trim();
      if (trimmed) {
        if (acc) acc += ' ';
        acc += trimmed;
      }
      return acc;
    }, '');
    
    let minY = Infinity;
    let maxY = -Infinity;
    let fontSize = FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
    let pageNum = 1;
    
    const isListHeading = textBlock.isListHeading || false;
    const followedByList = textBlock.followedByList || false;
    
    for (const line of blockLines) {
      const lineY = line.y || 0;
      if (lineY < minY) minY = lineY;
      if (lineY > maxY) maxY = lineY;
      if (line.fontSize) fontSize = line.fontSize;
      if (line.pageNum) pageNum = line.pageNum;
    }
    
    if (minY === Infinity) minY = 0;
    if (maxY === -Infinity) maxY = 0;
    
    return {
      lines: blockLines,
      combinedText,
      minY,
      maxY,
      fontSize,
      pageNum,
      isListHeading,
      followedByList
    };
  });
}

/**
 * Create element from classified block
 * @param {{combinedText?: string, lines?: Array<any>, [key: string]: any}} block - Text block
 * @param {string} elementType - Determined element type
 * @param {{heading?: {type?: string, confidence?: number}, paragraph?: {type?: string, confidence?: number}, list?: {type?: string, confidence?: number}, table?: {type?: string, confidence?: number}, [key: string]: any}} classificationResults - Results from classifiers
 * @param {{[key: string]: any}} elementStyles - Pre-computed styles
 * @param {boolean} nextIsList - Whether next block is a list
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {{type: string, text?: string, [key: string]: any}} Created element
 */
function createElementFromBlock(block, elementType, classificationResults, elementStyles, nextIsList, metrics) {
  const { headingResult, listResult, tableResult } = classificationResults;
  const baseElement = {
    text: block.combinedText,
    pageNum: block.pageNum,
    gapAfter: block.gapAfter,
    minY: block.minY,
    maxY: block.maxY,
    lines: block.lines
  };
  
  if (elementType === 'heading') {
    const element = {
      ...baseElement,
      type: 'heading',
      level: undefined,
      fontSize: block.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
      isBold: elementStyles.isBold,
      isItalic: elementStyles.isItalic,
      isUnderlined: elementStyles.isUnderlined,
      isListHeading: block.isListHeading || false,
      followedByList: block.followedByList || nextIsList || false
    };
    if (element.isListHeading || element.followedByList) {
      log(`[PDF v3] groupLinesIntoElements: Created list heading - text="${truncateText(element.text, 50)}", level=${element.level || 'TBD'}, fontSize=${element.fontSize}`);
    }
    return element;
  } else if (elementType === 'list') {
    const listMetadata = listResult.listType ? {
      listType: listResult.listType,
      ordered: listResult.listType === 'ordered',
      listLevel: listResult.listLevel || 0,
      listMarker: listResult.listMarker || null,
      listPattern: listResult.listPattern || null
    } : {};
    
    let minX = null;
    if (block.lines && block.lines.length > 0) {
      minX = Math.min(...block.lines.map(line => line.x || 0));
    }
    
    const element = {
      ...baseElement,
      type: 'list',
      minX,
      ...listMetadata
    };
    log(`[PDF v3] groupLinesIntoElements: Created list element - text="${truncateText(element.text, 50)}", type=${element.type}, listType=${element.listType || 'unknown'}, listLevel=${element.listLevel || 0}, listMarker=${element.listMarker || 'none'}, minX=${minX || 'N/A'}`);
    return element;
  } else if (elementType === 'table') {
    log(`[PDF v3] groupLinesIntoElements: Creating table element - text="${truncateText(block.combinedText, 50)}", lineCount=${block.lines?.length || 0}`);
    
    // Extract table structure
    const tableStructure = extractTableStructure(block, { metrics });
    
    if (!tableStructure) {
      // Fallback to paragraph if table extraction failed
      logWarn(`[PDF v3] groupLinesIntoElements: Table extraction failed, falling back to paragraph - text="${truncateText(block.combinedText, 50)}"`);
      return {
        ...baseElement,
        type: 'paragraph'
      };
    }
    
    log(`[PDF v3] groupLinesIntoElements: Table structure extracted successfully - rows=${tableStructure.rowCount}, columns=${tableStructure.columnCount}, hasHeaders=${tableStructure.hasHeaders}`);
    
    const element = {
      ...baseElement,
      type: 'table',
      rows: tableStructure.rows || [],
      hasHeaders: tableStructure.hasHeaders || false,
      columnCount: tableStructure.columnCount || 0,
      rowCount: tableStructure.rowCount || 0,
      columns: tableStructure.columns || [] // Store column X positions
    };
    
    log(`[PDF v3] groupLinesIntoElements: Created table element - rows=${element.rowCount}, columns=${element.columnCount}, hasHeaders=${element.hasHeaders}, pageNum=${element.pageNum}, minY=${element.minY?.toFixed(2) || 'N/A'}, maxY=${element.maxY?.toFixed(2) || 'N/A'}`, {
      firstRow: element.rows?.[0]?.map(cell => cell.substring(0, 20)) || [],
      columnPositions: element.columns?.map((col, idx) => ({ idx, x: col.toFixed(2) })) || []
    });
    return element;
  } else {
    return {
      ...baseElement,
      type: 'paragraph'
    };
  }
}

export function groupLinesIntoElements(lines, metrics) {
  // Validate and prepare inputs
  const validated = validateAndPrepareInputs(lines, metrics);
  if (!validated) {
    return [];
  }
  ({ lines, metrics } = validated);
  
  // Sort lines by position
  const sortedLines = sortLinesByPosition(lines);
  const firstLines = sortedLines.slice(0, 5).reduce((acc, l, i) => {
    const y = l.y ? l.y.toFixed(2) : 'N/A';
    const text = truncateText(l.text || '', 30);
    if (acc) acc += ', ';
    return acc + `L${i}:Y${y}:"${text}"`;
  }, '');
  log(`[PDF v3] groupLinesIntoElements: Lines sorted - inputCount=${lines.length}, sortedCount=${sortedLines.length}, firstLines=[${firstLines}]`);
  
  // Prepare gap analysis
  const gapAnalysis = prepareGapAnalysis(sortedLines, metrics);
  
  // Analyze visual text blocks
  const visualStructure = metrics.visualStructure || null;
  const textBlockAnalysis = analyzeTextBlocks(sortedLines, gapAnalysis, visualStructure, metrics);
  
  // Convert text blocks to grouped blocks
  let groupedBlocks = [];
  if (textBlockAnalysis && textBlockAnalysis.blocks && textBlockAnalysis.blocks.length > 0) {
    log(`[PDF v3] groupLinesIntoElements: Using text blocks directly - totalBlocks=${textBlockAnalysis.blocks.length}`);
    
    const blocksToProcess = splitListHeadings(textBlockAnalysis.blocks);
    log(`[PDF v3] groupLinesIntoElements: After splitListHeadings - inputBlocks=${textBlockAnalysis.blocks.length}, outputBlocks=${blocksToProcess.length}`);
    
    groupedBlocks = convertTextBlocksToGroupedBlocks(blocksToProcess);
    log(`[PDF v3] groupLinesIntoElements: Converted ${textBlockAnalysis.blocks.length} text blocks to ${groupedBlocks.length} grouped blocks`);
    
    // Validation: Check block sizes and count
    for (let blockIdx = 0; blockIdx < groupedBlocks.length; blockIdx++) {
      const block = groupedBlocks[blockIdx];
      const blockLength = block.combinedText ? block.combinedText.length : 0;
      const lineCount = block.lines ? block.lines.length : 0;
      
      // Warn if block is very large (might be incorrectly merged)
      if (blockLength > 1000) {
        log(`[PDF v3] groupLinesIntoElements: WARNING - Block [${blockIdx}] is very large - length=${blockLength}, lineCount=${lineCount}, text="${block.combinedText.substring(0, 100)}..."`);
      }
      
      // Log block details for debugging
      log(`[PDF v3] groupLinesIntoElements: Block [${blockIdx}] - length=${blockLength}, lineCount=${lineCount}, minY=${block.minY.toFixed(2)}, maxY=${block.maxY.toFixed(2)}, gapAfter=${block.gapAfter !== null && block.gapAfter !== undefined ? block.gapAfter.toFixed(2) : 'N/A'}`);
    }
  } else {
    // Fallback: Group lines into potential paragraphs based on adaptive gap analysis
    groupedBlocks = [];
    let currentBlock = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;
    
    const nextLine = i < lines.length - 1 ? lines[i + 1] : null;
    
    // CRITICAL FIX: Always add current line to current block first
    // Then check if we should start a new block for the next line
    if (!currentBlock) {
      // First line - start new block
      currentBlock = {
        lines: [line],
        combinedText: text,
        minY: line.y || 0,
        maxY: line.y || 0,
        fontSize: line.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
        pageNum: line.pageNum || 1
      };
    } else {
      // Add current line to existing block
      currentBlock.lines.push(line);
      currentBlock.combinedText += ' ' + text;
      // Update minY and maxY to reflect all lines in block
      const lineY = line.y || 0;
      if (lineY < currentBlock.minY) {
        currentBlock.minY = lineY;
      }
      if (lineY > currentBlock.maxY) {
        currentBlock.maxY = lineY;
      }
    }
    
    // Now check if we should start a new block for the next line
    if (nextLine) {
      const yGap = nextLine.y - line.y;
      const isPageBreak = nextLine.pageNum && line.pageNum && nextLine.pageNum !== line.pageNum;
      
      // Prepare context for gap analysis
      const nextText = (nextLine.text || '').trim();
      const currentTextEnd = (currentBlock.combinedText || '').trim();
      
      // Collect additional context for advanced analysis
      const currentFontSize = currentBlock.fontSize || line.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
      const nextFontSize = nextLine.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
      
      // Calculate previous and next gaps for sequence analysis
      const prevLine = i > 0 ? lines[i - 1] : null;
      const prevGap = prevLine && prevLine.pageNum === line.pageNum && prevLine.y
        ? line.y - prevLine.y
        : null;
      const nextNextLine = i + 2 < lines.length ? lines[i + 2] : null;
      const nextGap = nextNextLine && nextNextLine.pageNum === nextLine.pageNum && nextNextLine.y
        ? nextNextLine.y - nextLine.y
        : null;
      
      const gapContext = {
        currentTextEnd,
        nextTextStart: nextText,
        currentEndsWithSentenceEnd: /[.!?]\s*$/.test(currentTextEnd),
        nextStartsWithCapital: /^\p{Lu}/u.test(nextText),
        nextStartsWithLowercase: /^\p{Ll}/u.test(nextText),
        currentEndsWithHyphen: /[-—–]\s*$/.test(currentTextEnd),
        currentEndsWithPunctuation: /[,;:—–-]\s*$/.test(currentTextEnd),
        // Additional context for advanced analysis
        currentFontSize,
        nextFontSize,
        fontSizeChange: Math.abs(currentFontSize - nextFontSize),
        currentTextLength: currentTextEnd.length,
        nextTextLength: nextText.length,
        currentIsShort: currentTextEnd.length < CONTINUATION_THRESHOLDS.SHORT_LINE_MAX_LENGTH,
        nextIsShort: nextText.length < CONTINUATION_THRESHOLDS.SHORT_LINE_MAX_LENGTH,
        prevGap,
        nextGap,
        isOutlier: prevGap !== null && nextGap !== null
          ? (yGap > prevGap * PAGE_BREAK_CONTEXT.OUTLIER_GAP_MULTIPLIER && yGap > nextGap * PAGE_BREAK_CONTEXT.OUTLIER_GAP_MULTIPLIER)
          : false
      };
      
      // Block context for better decision making
      const blockContext = {
        combinedText: currentBlock.combinedText,
        blockLength: currentBlock.combinedText.length,
        lineCount: currentBlock.lines.length,
        fontSize: currentBlock.fontSize,
        minY: currentBlock.minY,
        maxY: currentBlock.maxY
      };
      
      // Check if next line continues the current block
      let isContinuation = false;
      
      // Check if gap is a paragraph boundary using gap analysis
      const isVisualBlockBoundary = !isPageBreak && isTextBlockBoundary(
        yGap,
        gapAnalysis,
        textBlockAnalysis,
        { prevGap, nextGap }
      );
      
      if (isVisualBlockBoundary) {
        // Visual block boundary detected - this is a paragraph break
        isContinuation = false;
        log(`[PDF v3] groupLinesIntoElements: Visual block boundary (gap-based fallback) - gap=${yGap.toFixed(2)}, averageBlockGap=${textBlockAnalysis.averageBlockGap.toFixed(2)}, averageInBlockGap=${textBlockAnalysis.averageInBlockGap.toFixed(2)}, isVisualBlockBoundary=true`);
      } else if (isPageBreak && currentBlock) {
        // Use full continuation logic for page breaks
        isContinuation = shouldContinueBlock(currentBlock, nextLine, metrics, true);
      } else if (!isPageBreak) {
        // For same-page gaps, use adaptive gap analysis with semantic prioritization
        // Invert the result: isParagraphBoundary returns true for breaks
        isContinuation = !isParagraphBoundary(yGap, gapAnalysis, gapContext, blockContext);
      }
      
      // Start new block for next line if:
      // 1. Page break AND not a continuation (new paragraph across page)
      // 2. Same page AND gap is a paragraph boundary (adaptive analysis)
      if ((isPageBreak && !isContinuation) || (!isPageBreak && !isContinuation)) {
        // Log block details before saving
        const blockText = currentBlock.combinedText ? currentBlock.combinedText.substring(0, 80) : 'NO TEXT';
        const blockLines = currentBlock.lines.map(l => (l.text || '').substring(0, 30)).join(' | ');
        log(`[PDF v3] groupLinesIntoElements: Saving block - lineCount=${currentBlock.lines.length}, minY=${currentBlock.minY.toFixed(2)}, maxY=${currentBlock.maxY.toFixed(2)}, gapAfter=${yGap.toFixed(2)}, text="${blockText}", lines=[${blockLines}]`);
        // Save current block and prepare for new block
        groupedBlocks.push(currentBlock);
        currentBlock = null; // Will be created on next iteration
      }
    }
  }
  
  // Add last block
  if (currentBlock && currentBlock.lines.length > 0) {
    groupedBlocks.push(currentBlock);
  }
  
    log(`[PDF v3] groupLinesIntoElements: Grouped ${lines.length} lines into ${groupedBlocks.length} blocks`);
  }
  
  if (groupedBlocks.length === 0) {
    logWarn(`[PDF v3] groupLinesIntoElements: No blocks created from lines - linesCount=${lines.length}`);
    return [];
  }
  
  // Step 2: Pre-compute styles and create element objects for classification
  // This avoids repeated .some() calls and duplicate object creation
  const blockStyles = groupedBlocks.map(block => {
    let isBold = false;
    let isItalic = false;
    let isUnderlined = false;
    for (const line of block.lines) {
      if (line.isBold) isBold = true;
      if (line.isItalic) isItalic = true;
      if (line.isUnderlined) isUnderlined = true;
      if (isBold && isItalic && isUnderlined) break; // Early exit if all found
    }
    return { isBold, isItalic, isUnderlined };
  });
  
  // Create element objects for structure analysis and classification (reuse same objects)
  const elementObjects = [];
  for (let i = 0; i < groupedBlocks.length; i++) {
    const block = groupedBlocks[i];
    const nextBlock = i < groupedBlocks.length - 1 ? groupedBlocks[i + 1] : null;
    const styles = blockStyles[i];
    
    // Calculate gap after this block
    // IMPORTANT: Calculate gap even if nextBlock is on a different page
    // Large gaps across page breaks indicate paragraph boundaries
    let gapAfter = null;
    if (nextBlock) {
      // Check if nextBlock is on the same page
      const samePage = block.pageNum && nextBlock.pageNum && block.pageNum === nextBlock.pageNum;
      
      if (samePage && typeof nextBlock.minY === 'number' && typeof block.maxY === 'number') {
        // Same page: calculate actual gap
        gapAfter = nextBlock.minY - block.maxY;
      } else if (!samePage) {
        // Different page: use special marker value to indicate cross-page break
        // This will be interpreted in cross-page merging logic
        gapAfter = CROSS_PAGE_BREAK_MARKER;
      }
    }
    
    const elementObj = {
      text: block.combinedText,
      fontSize: block.fontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
      isBold: styles.isBold,
      isItalic: styles.isItalic,
      isUnderlined: styles.isUnderlined,
      pageNum: block.pageNum,
      isFirst: i === 0,
      gapAfter: gapAfter,
      // CRITICAL: Include lines for table classification
      lines: block.lines || []
    };
    
    elementObjects.push(elementObj);
  }
  
  // Step 3: Analyze document structure (using element objects)
  const structure = analyzeStructure(elementObjects, groupedBlocks);
  
  // Add structure to all element objects for classification
  elementObjects.forEach(el => {
    el.structure = structure;
  });
  
  // Step 4: Classify each grouped block with structure context
  const elements = [];
  let prevElementType = null; // Track previous element type for context
  
  for (let i = 0; i < groupedBlocks.length; i++) {
    try {
      const block = groupedBlocks[i];
      const nextBlock = i < groupedBlocks.length - 1 ? groupedBlocks[i + 1] : null;
      const elementForClassification = elementObjects[i]; // Reuse pre-created object
      
      // Add context for improved scoring system (prevWasHeading, prevWasList)
      elementForClassification.prevWasHeading = prevElementType === 'heading';
      elementForClassification.prevWasList = prevElementType === 'list';
      
      // Get gapAfter from element object (already calculated in Step 2)
      const gapAfter = elementForClassification.gapAfter;
      
      // Check if next block is a list (for context in heading classification)
      const nextIsList = nextBlock && nextBlock.combinedText 
        ? /[:\s]+([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/.test(nextBlock.combinedText)
        : false;
      
      // Add context about next element
      elementForClassification.nextIsList = nextIsList;
      
      // Classify the grouped block (not individual lines)
      const headingResult = classifyHeading(elementForClassification, metrics);
      const listResult = classifyList(elementForClassification);
      const paraResult = classifyParagraph(elementForClassification, metrics);
      log(`[PDF v3] groupLinesIntoElements: Block [${i}] - Classifying element - text="${truncateText(block.combinedText, 50)}", lineCount=${block.lines?.length || 0}`);
      
      const tableResult = classifyTable(elementForClassification, { metrics });
      log(`[PDF v3] groupLinesIntoElements: Block [${i}] - Table classification result - type=${tableResult.type}, confidence=${tableResult.confidence.toFixed(3)}`);
      
      // Determine element type using centralized decision logic
      const { elementType } = decideElementType(
        headingResult,
        paraResult,
        listResult,
        tableResult,
        block,
        structure,
        { i, gapAfter, nextBlock },
        metrics
      );
      
      log(`[PDF v3] groupLinesIntoElements: Block [${i}] - Decided element type=${elementType}`, {
        headingConf: headingResult.confidence.toFixed(3),
        paraConf: paraResult.confidence.toFixed(3),
        listConf: listResult.confidence.toFixed(3),
        tableConf: tableResult.confidence.toFixed(3)
      });
      
      // Log only unexpected or important classifications
      const isUnexpected = (elementType === 'heading' && headingResult.confidence < 0.5) ||
                          (elementType === 'list' && listResult.confidence < 0.7) ||
                          (elementType === 'table' && tableResult.confidence < 0.6) ||
                          (elementType === 'paragraph' && paraResult.confidence < 0.6);
      if (isUnexpected) {
        log(`[PDF v3] groupLinesIntoElements: Low confidence classification - type=${elementType}, heading=${headingResult.confidence.toFixed(2)}, para=${paraResult.confidence.toFixed(2)}, list=${listResult.confidence.toFixed(2)}, text="${truncateText(block.combinedText, 50)}"`);
      }
    
      // Create element using helper function
      const elementStyles = blockStyles[i];
      const element = createElementFromBlock(
        { ...block, gapAfter },
        elementType,
        { headingResult, listResult, tableResult },
        elementStyles,
        nextIsList,
        metrics
      );
      
      elements.push(element);
      
      // Update previous element type for next iteration
      prevElementType = elementType;
    } catch (error) {
      // If classification fails for a block, add it as a paragraph by default
      // This ensures we don't lose content due to classification errors
      const blockText = groupedBlocks[i]?.combinedText?.substring(0, 100) || 'N/A';
      logWarn(`[PDF v3] groupLinesIntoElements: Error classifying block ${i}, adding as paragraph - error=${error?.message || 'unknown'}, blockText="${blockText}"`);
      
      const block = groupedBlocks[i];
      const gapAfter = i < groupedBlocks.length - 1 
        ? (groupedBlocks[i + 1].minY - block.maxY) 
        : null;
      
      elements.push({
        type: 'paragraph',
        text: block.combinedText || '',
        pageNum: block.pageNum,
        gapAfter: gapAfter,
        minY: block.minY,
        maxY: block.maxY,
        lines: block.lines
      });
    }
  }
  
  // Log summary using utilities
  const elementTypeCounts = countBy(elements, el => el.type);
  log(`[PDF v3] groupLinesIntoElements: Final elements - totalElements=${elements.length}, types=${JSON.stringify(elementTypeCounts)}`);
  
  return elements;
}

