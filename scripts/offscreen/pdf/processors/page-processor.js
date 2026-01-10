// @ts-check
// Page processing utility - extracts and processes content from a single PDF page

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../utils/logging.js';
// @ts-ignore - Module resolution issue, but file exists at runtime
import { CONFIG } from '../../../utils/config.js';
import { processPageItemsToLines } from '../utils/item-transformer.js';
import { groupLinesIntoElements } from './element-grouper.js';
import { processLinesByColumns } from '../analyzers/column-detector.js';
import { splitTableBlocksFromColumn1 } from './table-block-splitter.js';
import { mergeColumnElementsIntoTables } from './table-column-merger.js';
import { extractPageGraphics, detectTableRegionsFromGraphics } from '../utils/graphics-extractor.js';
import { DEFAULT_METRICS } from '../constants.js';

/**
 * Process a single PDF page and extract elements
 * Supports multi-column layouts by detecting columns and processing each separately
 * @param {{getTextContent: function(): Promise<{items?: Array<any>}>, getViewport: function({scale: number}): any, getOperatorList: function(): Promise<any>, cleanup: function(): void}} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @param {{gapThreshold?: number, baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Promise<Array<any>>} Array of extracted elements
 * @throws {Error} If text extraction fails
 * @throws {Error} If page processing fails
 */

export async function processPage(page, pageNum, metrics) {
  try {
    const viewport = page.getViewport({ scale: 1.0 });
    
    let textContent;
    let textItems = [];
    
    try {
      textContent = await page.getTextContent();
      textItems = textContent.items || [];
    } catch (error) {
      logWarn(`[PDF v3] Failed to extract text from page ${pageNum}`, error);
      return [];
    }
    
    log(`[PDF v3] processPage: Page ${pageNum} - extracted ${textItems.length} text items`);
    
    if (textItems.length === 0) {
      logWarn(`[PDF v3] Page ${pageNum} has no text content`);
      return [];
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
  const lines = processPageItemsToLines(textItems, viewport, pageNum, metrics, graphicsData, textContent);
  log(`[PDF v3] processPage: Page ${pageNum} - got ${lines.length} lines from processPageItemsToLines`);
  
  if (lines.length === 0) {
    logWarn(`[PDF v3] Page ${pageNum} has no lines after processing`);
    return [];
  }
  
  log(`[PDF v3] Page ${pageNum} processed: ${lines.length} lines`);
  
  // Step 2: DETERMINE TOP-LEVEL TEXT REGIONS (COLUMNS)
  // This is the key insight: we need to identify column boundaries FIRST,
  // before grouping lines into paragraphs within each column
  // 
  // Algorithm:
  // - Analyze visual structure (empty vertical strips) to find column gaps
  // - Cluster X-coordinates of line starts to identify column positions
  // - Assign lines to columns based on overlap and vertical proximity
  //
  // Step 3: GROUP LINES INTO ELEMENTS (PARAGRAPHS/HEADINGS) WITHIN EACH COLUMN
  // Only after columns are identified, we group lines into elements
  // This ensures that paragraph boundaries are detected correctly within each column,
  // not across columns
  let pageElements;
  try {
    log(`[PDF v3] Page ${pageNum} - Calling processLinesByColumns with ${lines.length} lines`);
    pageElements = processLinesByColumns(lines, viewport, metrics, groupLinesIntoElements);
    log(`[PDF v3] Page ${pageNum} - processLinesByColumns returned ${pageElements?.length || 0} elements`);
  } catch (error) {
    logWarn(`[PDF v3] processLinesByColumns failed for page ${pageNum}`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      linesCount: lines.length
    });
    // Only log to console in DEBUG mode
    if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
      console.error(`[PDF v3] processLinesByColumns ERROR:`, error);
    }
    throw error; // Re-throw to be caught by outer try-catch
  }
  
  // Step 3.5: SPLIT LARGE BLOCKS FROM COLUMN 1 THAT CONTAIN TABLE ELEMENTS
  // Column 1 can contain both regular text (headings, paragraphs) and table elements
  // We need to split these blocks before merging into tables
  try {
    pageElements = splitTableBlocksFromColumn1(pageElements, metrics);
  } catch (error) {
    logWarn(`[PDF v3] Failed to split table blocks from column 1 on page ${pageNum}`, error);
    // Continue with original elements
  }
  
  // Step 4: MERGE ELEMENTS FROM DIFFERENT COLUMNS INTO TABLES
  // Elements from different columns that are on the same Y-coordinate are likely table rows
  try {
    pageElements = mergeColumnElementsIntoTables(pageElements, metrics);
  } catch (error) {
    logWarn(`[PDF v3] Failed to merge column elements into tables on page ${pageNum}`, error);
    // Continue with elements as-is (without table merging)
  }
  
    // Ensure pageElements is always an array
    if (!Array.isArray(pageElements)) {
      logWarn(`[PDF v3] Page ${pageNum}: processLinesByColumns returned non-array, converting to array`, {
        type: typeof pageElements,
        value: pageElements
      });
      pageElements = pageElements ? [pageElements] : [];
    }
    
    log(`[PDF v3] Page ${pageNum} elements extracted: ${pageElements.length} elements`);
    
    if (pageElements.length === 0 && lines.length > 0) {
      logWarn(`[PDF v3] Page ${pageNum}: Lines were processed but no elements were created`, {
        linesCount: lines.length,
        metrics: metrics ? { hasGapAnalysis: !!metrics.gapAnalysis } : null
      });
    }
    
    return pageElements;
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
    return [];
  }
}

