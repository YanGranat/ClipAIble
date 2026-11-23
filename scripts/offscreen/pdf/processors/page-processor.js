// @ts-check
// Page processing utility - extracts and processes content from a single PDF page

import { log, logWarn } from '../../../utils/logging.js';
import { CONFIG } from '../../../utils/config.js';
import { processPageItemsToLines } from '../utils/item-transformer.js';
import { groupLinesIntoElements } from './element-grouper.js';
import { processLinesByColumns } from '../analyzers/column-detector.js';
import { calculateLineRight } from '../analyzers/column-detection-helpers.js';
import { splitTableBlocksFromColumn1 } from './table-block-splitter.js';
import { mergeColumnElementsIntoTables } from './table-column-merger.js';
import { extractPageGraphics, detectTableRegionsFromGraphics } from '../utils/graphics-extractor.js';
import { DEFAULT_METRICS } from '../constants.js';
import { extractPaintedTables } from '../utils/grid-cells.js';

/** Order the elements within one reading region, then let the page concatenate its regions. */
function orderRegion(elements) {
  const firstBaseline = element => element.minY || element.lines?.[0]?.y || 0;
  return elements.sort((a, b) => (a.columnIndex ?? -1) - (b.columnIndex ?? -1) || firstBaseline(a) - firstBaseline(b));
}

/** Partition only where painted table bounds cover the reading width without shared baselines. */
function partitionAtPaintedTables(physical, baseFontSize) {
  if (!physical.tables.length || !physical.remainingLines.length) return null;
  const lines = physical.remainingLines;
  let left = Infinity, right = -Infinity;
  for (const line of lines) {
    left = Math.min(left, line.x);
    right = Math.max(right, calculateLineRight(line, baseFontSize));
  }
  const orderedTables = [...physical.tables].sort((a, b) => a.paintedBounds.top - b.paintedBounds.top);
  let previousBottom = -Infinity;
  let nextLine = 0;
  const regions = [];
  for (const table of orderedTables) {
    const bounds = table.paintedBounds;
    if (bounds.left > left + baseFontSize || bounds.right < right - baseFontSize || bounds.top <= previousBottom) return null;
    const firstLine = nextLine;
    while (nextLine < lines.length && lines[nextLine].y < bounds.top) nextLine++;
    if (nextLine < lines.length && lines[nextLine].y <= bounds.bottom) return null;
    regions.push({ lines: lines.slice(firstLine, nextLine), table });
    previousBottom = bounds.bottom;
  }
  regions.push({ lines: lines.slice(nextLine), table: null });
  return regions;
}

/** Group lines after reserving the original painted table positions. */
function classifyReadingRegion(lines, viewport, metrics, pageNum, proseRecovery) {
  let elements = processLinesByColumns(lines, viewport, metrics, groupLinesIntoElements, proseRecovery);
  if (!elements.some(element => element.recoveredProseRegion)) {
    try {
      elements = splitTableBlocksFromColumn1(elements, metrics);
    } catch (error) {
      logWarn(`[PDF v3] Failed to split table blocks from column 1 on page ${pageNum}`, error);
    }
    try {
      elements = mergeColumnElementsIntoTables(elements, metrics);
    } catch (error) {
      logWarn(`[PDF v3] Failed to merge column elements into tables on page ${pageNum}`, error);
    }
  }
  return elements;
}

/**
 * Process a single PDF page and extract elements
 * Supports multi-column layouts by detecting columns and processing each separately
 * @param {{getTextContent: function(): Promise<{items?: Array<any>}>, getViewport: function({scale: number}): any, getOperatorList: function(): Promise<any>, cleanup: function(): void, commonObjs?: Object}} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @param {{gapThreshold?: number, baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {(page: Object, pageNum: number) => Promise<Object|null>} [preserveImagePage] - Keep a visible page with no text layer
 * @returns {Promise<Array<any>>} Array of extracted elements
 * @throws {Error} If text extraction fails
 * @throws {Error} If page processing fails
 */

export async function processPage(page, pageNum, metrics, preserveImagePage) {
  try {
    const viewport = page.getViewport({ scale: 1.0 });
    
    let textContent;
    let textItems = [];
    
    try {
      textContent = await page.getTextContent();
      textItems = textContent.items || [];
    } catch (error) {
      logWarn(`[PDF v3] Failed to extract text from page ${pageNum}`, error);
      throw error;
    }
    
    log(`[PDF v3] processPage: Page ${pageNum} - extracted ${textItems.length} text items`);
    
    if (!textItems.some(item => typeof item.str === 'string' && item.str.trim())) {
      const image = await preserveImagePage?.(page, pageNum);
      return image ? [image] : [];
    }
  
  // Step 1.5: EXTRACT GRAPHICS (lines, rectangles) for table border detection and underline detection
  // This is optional but can improve table detection for PDFs with visible borders
  // Extract graphics BEFORE processing items to lines so we can use it for underline detection
  let graphicsData = null;
  
  try {
    graphicsData = await extractPageGraphics(page, pageNum, viewport);
  } catch (error) {
    logWarn(`[PDF v3] Failed to extract graphics from page ${pageNum}`, error);
    // Continue without graphics - not critical
    graphicsData = { lines: [], rectangles: [], allLines: [] };
  }
  
  // Store graphics data in metrics for later use (for table detection)
  if (graphicsData && metrics) {
    if (!metrics.graphicsData) {
      metrics.graphicsData = {};
    }
    const storedLines = (graphicsData?.lines && Array.isArray(graphicsData.lines)) ? graphicsData.lines : [];
    const storedRectangles = (graphicsData?.rectangles && Array.isArray(graphicsData.rectangles)) ? graphicsData.rectangles : [];
    
    // Detect table regions from graphics
    const baseFontSize = (metrics && metrics.baseFontSize) ? metrics.baseFontSize : DEFAULT_METRICS.BASE_FONT_SIZE;
    const tableRegions = detectTableRegionsFromGraphics(
      storedLines,
      storedRectangles,
      viewport,
      baseFontSize
    );
    
    metrics.graphicsData[pageNum] = {
      lines: storedLines,
      allLines: graphicsData.allLines || storedLines,
      rectangles: storedRectangles,
      tableRegions: tableRegions || [],
      extracted: true,
      hasLines: storedLines.length > 0
    };
    
    if (tableRegions.length > 0) {
      log(`[PDF v3] Page ${pageNum} detected ${tableRegions.length} potential table regions from graphics`, {
        regions: tableRegions.map(r => ({
          x: r.x.toFixed(2),
          y: r.y.toFixed(2),
          width: r.width.toFixed(2),
          height: r.height.toFixed(2),
          columns: r.columnCount,
          rows: r.rowCount
        }))
      });
    } else {
      log(`[PDF v3] Page ${pageNum} graphics stored - lines=${storedLines.length}, rectangles=${storedRectangles.length}, tableRegions=0`);
    }
  } else if (!metrics) {
    logWarn(`[PDF v3] Page ${pageNum}: metrics is null/undefined, cannot store graphics data`);
  }
  
  // CRITICAL PROCESSING FLOW:
  // Step 1: Transform items and group into lines
  // - Preliminary column detection at items level (quick analysis)
  // - Items from different columns are separated into different lines
  //   using X-coordinate sub-clustering and preliminary columns
  // - Apply font formatting including underline detection using graphics data
  log(`[PDF v3] processPage: Page ${pageNum} - calling processPageItemsToLines with ${textItems.length} items`);
  const lines = processPageItemsToLines(textItems, viewport, pageNum, metrics, graphicsData, textContent, page.commonObjs);
  log(`[PDF v3] processPage: Page ${pageNum} - got ${lines.length} lines from processPageItemsToLines`);
  
  if (lines.length === 0) {
    logWarn(`[PDF v3] Page ${pageNum} has no lines after processing`);
    return [];
  }
  
  log(`[PDF v3] Page ${pageNum} processed: ${lines.length} lines`);
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const physical = extractPaintedTables(lines, metrics.graphicsData?.[pageNum], baseFontSize);
  const regions = partitionAtPaintedTables(physical, baseFontSize);
  if (!regions) {
    const elements = classifyReadingRegion(physical.remainingLines, viewport, metrics, pageNum, physical.tables.length ? 'disabled' : 'fallback');
    return orderRegion(elements.concat(physical.tables));
  }

  return regions.flatMap(({ lines, table }) => {
    const elements = orderRegion(classifyReadingRegion(lines, viewport, metrics, pageNum, 'preferred'));
    return table ? elements.concat(table) : elements;
  });

  } catch (error) {
    logWarn(`[PDF v3] processPage failed for page ${pageNum}`, {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    // Also log to console for debugging (only in DEBUG mode)
    if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
      console.error(`[PDF v3] processPage ERROR for page ${pageNum}:`, error);
      console.error(`[PDF v3] processPage ERROR message:`, error.message);
      console.error(`[PDF v3] processPage ERROR stack:`, error.stack);
    }
    throw error;
  }
}

