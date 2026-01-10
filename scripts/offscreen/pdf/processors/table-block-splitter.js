// @ts-check
// Table block splitter - splits large blocks from Column 1 that contain table elements
// This is needed because Column 1 can contain both regular text (headings, paragraphs)
// and table elements (cells from multi-column tables)

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { DEFAULT_METRICS, ELEMENT_DECISION, TABLE_DETECTION } from '../constants.js';
import { normalizeYCoordinate } from '../utils/table-helpers.js';
import { checkGraphicsInElementArea } from '../utils/graphics-extractor.js';
import { getGraphicsDataForPage, analyzeGapPattern } from '../utils/graphics-helpers.js';

/**
 * Split large blocks from Column 1 that contain table elements
 * 
 * Strategy:
 * 1. Find all elements from other columns (Column 2, 3, 4, etc.)
 * 2. For each large block in Column 1, check if it contains lines on Y-coordinates
 *    where elements from other columns exist
 * 3. If yes, split the block at those Y-coordinates
 * 
 * @param {Array} elements - Array of elements from all columns
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Array} Elements with large blocks from Column 1 split
 */
export function splitTableBlocksFromColumn1(elements, metrics = {}) {
  log(`[PDF v3] splitTableBlocksFromColumn1: START - totalElements=${elements?.length || 0}`);
  
  if (!elements || elements.length === 0) {
    log(`[PDF v3] splitTableBlocksFromColumn1: NO ELEMENTS - returning as-is`);
    return elements;
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const yTolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
  log(`[PDF v3] splitTableBlocksFromColumn1: Parameters - baseFontSize=${baseFontSize}, yTolerance=${yTolerance.toFixed(2)}`);
  
  // Find all elements from other columns (not Column 0)
  const otherColumnElements = elements.filter(el => 
    el.columnIndex !== undefined && el.columnIndex !== 0
  );
  
  log(`[PDF v3] splitTableBlocksFromColumn1: Found ${otherColumnElements.length} elements from other columns (not Column 0)`, {
    otherColumnElements: otherColumnElements.map(el => ({
      columnIndex: el.columnIndex,
      type: el.type,
      text: (el.text || '').substring(0, 30),
      minY: el.minY?.toFixed(2) || '?',
      maxY: el.maxY?.toFixed(2) || '?',
      lineCount: el.lines?.length || 0,
      lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
    }))
  });
  
  if (otherColumnElements.length === 0) {
    log(`[PDF v3] splitTableBlocksFromColumn1: NO OTHER COLUMNS - returning as-is`);
    return elements; // No other columns, no tables to split
  }
  
  // Collect Y-coordinates where elements from other columns exist
  // CRITICAL: Use the same normalization algorithm as mergeColumnElementsIntoTables
  const tableYCoordinates = new Set();
  for (const el of otherColumnElements) {
    if (el.lines && el.lines.length > 0) {
      for (const line of el.lines) {
        if (line.y !== undefined) {
          // Use the same normalization as mergeColumnElementsIntoTables
          const normalizedYKey = normalizeYCoordinate(line.y, yTolerance);
          tableYCoordinates.add(parseFloat(normalizedYKey));
        }
      }
    } else if (el.minY !== undefined) {
      // Use the same normalization as mergeColumnElementsIntoTables
      const normalizedYKey = normalizeYCoordinate(el.minY, yTolerance);
      tableYCoordinates.add(parseFloat(normalizedYKey));
    }
  }
  
  log(`[PDF v3] splitTableBlocksFromColumn1: Collected ${tableYCoordinates.size} unique table Y-coordinates`);
  
  if (tableYCoordinates.size === 0) {
    log(`[PDF v3] splitTableBlocksFromColumn1: NO TABLE Y-COORDINATES - returning as-is`);
    return elements; // No table Y-coordinates found
  }
  
  log(`[PDF v3] splitTableBlocksFromColumn1: Found ${tableYCoordinates.size} table Y-coordinates from ${otherColumnElements.length} other column elements`);
  
  // Find large blocks from Column 1 that might contain table elements
  const result = [];
  let splitCount = 0;
  
  for (const element of elements) {
    // CRITICAL: Lower threshold for block size - tables can be in smaller blocks
    // Also check if block contains lines that match table Y-coordinates
    if (element.columnIndex === 0 && 
        element.lines && 
        element.lines.length > 0 &&
        element.text) {
      
      // Check if block contains any lines on table Y-coordinates (even if block is small)
      let hasTableLines = false;
      for (const line of element.lines) {
        if (line.y !== undefined) {
          const roundedY = Math.round(line.y / yTolerance) * yTolerance;
          if (tableYCoordinates.has(roundedY)) {
            hasTableLines = true;
            break;
          }
        }
      }
      
      // CRITICAL: Skip headings - they are never part of tables
      if (element.type === 'heading') {
        log(`[PDF v3] splitTableBlocksFromColumn1: Element already classified as heading - skipping table-fragment creation`);
        result.push(element);
        continue;
      }
      
      // For paragraph elements, check if they are likely real paragraphs (long text, many lines)
      // Short paragraph elements might be table cells, so we should still try to process them
      // BUT: if graphics (table borders) are present, it's a strong indicator of a table
      let hasGraphicsInArea = false;
      const pageGraphicsData = getGraphicsDataForPage(metrics, element.pageNum);
      if (pageGraphicsData) {
        const graphicsCheck = checkGraphicsInElementArea([element], pageGraphicsData, null, baseFontSize);
        hasGraphicsInArea = graphicsCheck.hasGraphics;
        if (hasGraphicsInArea) {
          log(`[PDF v3] splitTableBlocksFromColumn1: Graphics detected in element area - horizontalLines=${graphicsCheck.horizontalLines}, verticalLines=${graphicsCheck.verticalLines}, totalLines=${graphicsCheck.totalLines} - strong table indicator`);
        }
      }
      
      if (element.type === 'paragraph') {
        const textLength = (element.text || '').length;
        const lineCount = element.lines ? element.lines.length : 1;
        const avgLineLength = lineCount > 0 ? textLength / lineCount : textLength;
        
        // Skip only if it's clearly a paragraph (long text OR many lines with long average line length)
        // Short elements (few lines, short text) might be table cells
        // BUT: if graphics are present, don't skip - it's likely a table even if text is long
        const isLongText = textLength > TABLE_DETECTION.PARAGRAPH_TEXT_LENGTH_THRESHOLD;
        const hasManyLines = lineCount >= TABLE_DETECTION.PARAGRAPH_LINE_COUNT_THRESHOLD;
        const hasLongLines = avgLineLength > TABLE_DETECTION.PARAGRAPH_AVG_LINE_LENGTH_THRESHOLD;
        
        // Only skip if it's clearly a paragraph AND no graphics are present
        // Graphics are a strong indicator of a table, so we should process even long text
        if ((isLongText || (hasManyLines && hasLongLines)) && !hasGraphicsInArea) {
          log(`[PDF v3] splitTableBlocksFromColumn1: Element is likely a real paragraph (not a table cell) - textLength=${textLength}, lineCount=${lineCount}, avgLineLength=${avgLineLength.toFixed(1)}, hasGraphics=${hasGraphicsInArea} - skipping table-fragment creation`);
          result.push(element);
          continue;
        }
        // Otherwise, continue - it might be a table cell (especially if graphics are present)
        if (hasGraphicsInArea) {
          log(`[PDF v3] splitTableBlocksFromColumn1: Element has graphics in area - processing as potential table even though classified as paragraph`);
        }
      }
      
      // Check gap pattern between lines - paragraphs have regular, small gaps
      // Tables have irregular gaps or larger gaps between rows
      const gapAnalysis = analyzeGapPattern(element.lines, baseFontSize);
      const hasRegularGapPattern = gapAnalysis.hasRegularGapPattern;
      
      if (element.lines.length >= 3) {
        log(`[PDF v3] splitTableBlocksFromColumn1: Gap pattern analysis - avgGap=${gapAnalysis.avgGap.toFixed(2)}, gapCV=${gapAnalysis.gapCV.toFixed(3)}, isSmallRegularGaps=${gapAnalysis.isSmallRegularGaps}, hasRegularGapPattern=${hasRegularGapPattern}`);
      }
      
      // If element has regular gap pattern (like a paragraph), don't create table-fragment
      const isLikelyParagraph = hasRegularGapPattern;
      
      // Process if block is large OR contains table lines, BUT skip if it's likely a paragraph
      if ((element.text.length > TABLE_DETECTION.BLOCK_MIN_LENGTH || hasTableLines) && !isLikelyParagraph) {
        // Check if this block contains lines on table Y-coordinates
        const tableLines = [];
        const nonTableLines = [];
        
        for (const line of element.lines) {
          if (line.y !== undefined) {
            // Use the same normalization as mergeColumnElementsIntoTables
            const normalizedYKey = parseFloat(normalizeYCoordinate(line.y, yTolerance));
            const isTableLine = tableYCoordinates.has(normalizedYKey);
            
            if (isTableLine) {
              tableLines.push(line);
            } else {
              nonTableLines.push(line);
            }
          } else {
            nonTableLines.push(line);
          }
        }
        
        // If block contains both table and non-table lines, split it
        if (tableLines.length > 0 && nonTableLines.length > 0) {
          log(`[PDF v3] splitTableBlocksFromColumn1: Splitting block - totalLines=${element.lines.length}, tableLines=${tableLines.length}, nonTableLines=${nonTableLines.length}, text="${element.text.substring(0, 50)}..."`, {
            tableLineYs: tableLines.map(l => l.y?.toFixed(2) || '?').slice(0, 10),
            nonTableLineYs: nonTableLines.map(l => l.y?.toFixed(2) || '?').slice(0, 10),
            allLineYs: element.lines.map(l => l.y?.toFixed(2) || '?').slice(0, 10),
            tableYCoordinates: Array.from(tableYCoordinates).sort((a, b) => a - b).map(y => y.toFixed(2)).slice(0, 10)
          });
          
          // Verify that all table lines were included
          const missingTableLines = element.lines.filter(line => {
            if (line.y === undefined) return false;
            const normalizedYKey = parseFloat(normalizeYCoordinate(line.y, yTolerance));
            const isTableLine = tableYCoordinates.has(normalizedYKey);
            const wasIncluded = tableLines.some(tl => tl === line);
            return isTableLine && !wasIncluded;
          });
          
          if (missingTableLines.length > 0) {
            log(`[PDF v3] splitTableBlocksFromColumn1: WARNING - Found ${missingTableLines.length} missing table lines, adding them`);
            tableLines.push(...missingTableLines);
          }
          
          // Create non-table block (headings/paragraphs)
          const nonTableBlock = createBlockFromLines(nonTableLines, element, metrics);
          if (nonTableBlock) {
            result.push(nonTableBlock);
          }
          
          // Create table block (table cells) - mark as table-fragment for later processing
          const tableBlock = createBlockFromLines(tableLines, element, metrics);
          if (tableBlock) {
            // Mark as table-fragment so mergeColumnElementsIntoTables can pick it up
            tableBlock.type = 'table-fragment';
            log(`[PDF v3] splitTableBlocksFromColumn1: Created table-fragment - lineCount=${tableBlock.lines.length}, text="${tableBlock.text.substring(0, 50)}...", lineYs=${tableBlock.lines.map(l => l.y?.toFixed(2) || '?').join(', ')}`);
            
            result.push(tableBlock);
          } else {
            log(`[PDF v3] splitTableBlocksFromColumn1: ERROR - createBlockFromLines returned null for tableLines - tableLines.length=${tableLines.length}`);
          }
          
          splitCount++;
        } else if (tableLines.length > 0 && nonTableLines.length === 0) {
          // Block contains ONLY table lines - check gap pattern to determine if it's a paragraph
          const tableGapAnalysis = analyzeGapPattern(tableLines, baseFontSize);
          const hasRegularGapPattern = tableGapAnalysis.hasRegularGapPattern;
          
          if (hasRegularGapPattern) {
            log(`[PDF v3] splitTableBlocksFromColumn1: Block has table Y-coordinates but regular gap pattern (paragraph-like) - keeping as paragraph`);
            result.push(element);
            continue;
          }
          
          // Block contains ONLY table lines - mark as table-fragment
          log(`[PDF v3] splitTableBlocksFromColumn1: Block contains only table lines - marking as table-fragment - totalLines=${element.lines.length}, tableLines=${tableLines.length}, text="${element.text.substring(0, 50)}..."`, {
            tableLineYs: tableLines.map(l => l.y?.toFixed(2) || '?').slice(0, 10),
            allLineYs: element.lines.map(l => l.y?.toFixed(2) || '?').slice(0, 10)
          });
          
          // CRITICAL: Verify that all lines were included
          if (tableLines.length !== element.lines.length) {
            log(`[PDF v3] splitTableBlocksFromColumn1: WARNING - Not all lines included in table-fragment - tableLines=${tableLines.length}, totalLines=${element.lines.length}`);
            // Include all lines to be safe
            tableLines.push(...element.lines.filter(line => !tableLines.includes(line)));
          }
          
          const tableBlock = createBlockFromLines(tableLines, element, metrics);
          if (tableBlock) {
            tableBlock.type = 'table-fragment';
            log(`[PDF v3] splitTableBlocksFromColumn1: Created table-fragment (only table lines) - lineCount=${tableBlock.lines.length}, text="${tableBlock.text.substring(0, 50)}...", lineYs=${tableBlock.lines.map(l => l.y?.toFixed(2) || '?').join(', ')}`);
            result.push(tableBlock);
          }
          splitCount++;
        } else {
          // No split needed, keep element as is
          result.push(element);
        }
      } else if (isLikelyParagraph) {
        // Block has regular gap pattern (paragraph-like), keep as is even if it has table Y-coordinates
        log(`[PDF v3] splitTableBlocksFromColumn1: Block has regular gap pattern (paragraph-like) - keeping as paragraph`);
        result.push(element);
      } else {
        // Block is too small and doesn't contain table lines, keep as is
        result.push(element);
      }
    } else {
      // Not Column 1 or no lines, keep as is
      result.push(element);
    }
  }
  
  if (splitCount > 0) {
    log(`[PDF v3] splitTableBlocksFromColumn1: Split ${splitCount} blocks from Column 1`);
  }
  
  return result;
}

/**
 * Create a block element from lines
 * 
 * @param {Array} lines - Array of line objects
 * @param {{type?: string, lines?: Array<any>, [key: string]: any}} originalElement - Original element to copy properties from
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Object|null} Block element or null if invalid
 */
function createBlockFromLines(lines, originalElement, metrics) {
  if (!lines || lines.length === 0) {
    return null;
  }
  
  // Sort lines by Y
  const sortedLines = [...lines].sort((a, b) => (a.y || 0) - (b.y || 0));
  
  // Calculate combined text
  const combinedText = sortedLines.map(line => line.text || '').join(' ').trim();
  
  if (!combinedText) {
    return null;
  }
  
  // Calculate minY, maxY, and fontSize in a single pass (optimization)
  let minY = Infinity;
  let maxY = -Infinity;
  let fontSizeSum = 0;
  let fontSizeCount = 0;
  
  for (const line of sortedLines) {
    if (line.y !== undefined) {
      if (line.y < minY) minY = line.y;
      if (line.y > maxY) maxY = line.y;
    }
    if (line.fontSize !== undefined) {
      fontSizeSum += line.fontSize;
      fontSizeCount++;
    }
  }
  
  const finalMinY = minY !== Infinity ? minY : (originalElement.minY || 0);
  const finalMaxY = maxY !== -Infinity ? maxY : (originalElement.maxY || 0);
  const fontSize = fontSizeCount > 0 
    ? fontSizeSum / fontSizeCount
    : (originalElement.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE);
  
  const block = {
    type: originalElement.type || 'paragraph',
    text: combinedText,
    pageNum: originalElement.pageNum || 0,
    minY: finalMinY,
    maxY: finalMaxY,
    fontSize,
    lines: sortedLines,
    columnIndex: originalElement.columnIndex,
    columnX: originalElement.columnX,
    // Preserve other properties
    gapAfter: originalElement.gapAfter,
    isBold: originalElement.isBold,
    isItalic: originalElement.isItalic
  };
  
  return block;
}

