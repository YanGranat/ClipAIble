// @ts-check
// Item transformer utility - transforms PDF text items to viewport coordinates
// Centralizes item transformation logic to avoid duplication

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn, logToServiceWorker, criticalLog } from '../../../../utils/logging.js';
import { transformCoordinates } from './coordinate-transform.js';
import { buildFontFormatMap, detectUnderlinedText } from './font-detection.js';
import { iterItemsToLines } from '../core/line-grouping.js';
import { detectPreliminaryColumns } from '../analyzers/preliminary-column-detector.js';
import { CLUSTERING, FONT_SIZE_THRESHOLDS, DEFAULT_METRICS, TEXT_FORMATTING } from '../constants.js';
import { extractFontNameMapping } from './font-name-extractor.js';
import { detectContextualFormatting } from './contextual-formatting.js';

/**
 * Transform text items from PDF coordinates to viewport coordinates
 * 
 * @param {Array} textItems - Raw text items from PDF.js
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {number} pageNum - Page number
 * @returns {Array} Transformed items with x, y, fontSize, pageNum
 */
export function transformTextItems(textItems, viewport, pageNum) {
  if (!textItems || !Array.isArray(textItems)) {
    return [];
  }

  return textItems
    .filter(item => item.str && item.str.trim().length > 0)
    .map((item, index) => {
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const pdfX = transform[4] || 0;
      const pdfY = transform[5] || 0;
      
      const [viewportX, viewportY] = transformCoordinates(pdfX, pdfY, viewport);
      
      const itemHeight = Math.abs(transform[3]) || Math.abs(item.height) || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
      const itemWidth = item.width || 0;
      const widthHeightRatio = itemHeight > 0 ? itemWidth / itemHeight : 0;
      
      // CRITICAL: item.fontName from PDF.js contains the INTERNAL font name (e.g., "g_d0_f1")
      // This is NOT the real font name (e.g., "Helvetica-Bold")
      // We need to map it using textContent.styles later
      return {
        ...item,
        x: viewportX,
        y: viewportY,
        fontSize: itemHeight,
        fontName: item.fontName || '', // This is INTERNAL name like "g_d0_f1"
        width: itemWidth,
        widthHeightRatio: widthHeightRatio,
        viewportHeight: viewport.height, // Store viewport height for underline detection
        pageNum,
        // CRITICAL: Store PDF native coordinates for comparison with graphics coordinates
        pdfX: pdfX,
        pdfY: pdfY,
        // Store transform for reference
        transform: transform,
        // Store any direct formatting info if PDF.js provides it (usually it doesn't)
        directFontWeight: item.fontWeight || null,
        directFontStyle: item.fontStyle || null
      };
    });
}

/**
 * Apply font formatting (bold/italic/underline) to transformed items
 * 
 * @param {Array} transformedItems - Transformed items
 * @param {{lines?: Array<{x: number, y: number, width: number, [key: string]: any}>, allLines?: Array<any>, [key: string]: any}|null} [graphicsData] - Optional graphics data for underline detection
 * @param {Map<string, string|Object>} fontNameMap - Optional map from internal font name to real font name (string) or FontInfo object
 * @param {Map<string, string>} fontToFormats - Optional map from font name to format
 * @param {number|string} pageNum - Page number (can be number or string)
 * @returns {Array} Items with isBold, isItalic, and isUnderlined properties
 */
export function applyFontFormatting(transformedItems, graphicsData = null, fontNameMap = null, fontToFormats = null, pageNum = 'unknown') {
  // Input validation
  if (!transformedItems || !Array.isArray(transformedItems) || transformedItems.length === 0) {
    return transformedItems || [];
  }
  
  if (fontNameMap !== null && !(fontNameMap instanceof Map)) {
    criticalLog('applyFontFormatting: fontNameMap is not a Map, ignoring', 'APPLY_FONT_FORMATTING_WARN', {
      pageNum,
      fontNameMapType: typeof fontNameMap
    });
    fontNameMap = null;
  }
  
  if (fontToFormats !== null && !(fontToFormats instanceof Map)) {
    criticalLog('applyFontFormatting: fontToFormats is not a Map, ignoring', 'APPLY_FONT_FORMATTING_WARN', {
      pageNum,
      fontToFormatsType: typeof fontToFormats
    });
    fontToFormats = null;
  }
  
  // Store original font names and real font names separately
  // We need to group by original (internal) font names, but use real names for regex matching
  // CRITICAL: Also extract fontWeight and fontStyle directly from PDF if available
  if (fontNameMap && fontNameMap.size > 0) {
    transformedItems.forEach(item => {
      if (item.fontName && fontNameMap.has(item.fontName)) {
        const internalFontName = item.fontName;
        const fontInfo = fontNameMap.get(internalFontName);
        
        // fontInfo is now an object with realFontName, fontWeight, fontStyle
        let realFontName;
        if (fontInfo !== null && fontInfo !== undefined) {
          if (typeof fontInfo === 'string') {
            realFontName = fontInfo;
          } else if (typeof fontInfo === 'object' && 'realFontName' in fontInfo) {
            realFontName = /** @type {{realFontName: string}} */ (fontInfo).realFontName;
          } else {
            realFontName = item.fontName;
          }
        } else {
          realFontName = item.fontName;
        }
        
        item.originalFontName = internalFontName; // Keep original for grouping
        item.realFontName = realFontName; // Store real name for regex matching
        
        // CRITICAL: Extract fontWeight and fontStyle directly from PDF if available
        if (fontInfo !== null && fontInfo !== undefined && typeof fontInfo === 'object') {
          // TypeScript type guard: fontInfo is confirmed to be a non-null object
          const fontInfoObj = /** @type {Record<string, any>} */ (fontInfo);
          if ('realFontName' in fontInfoObj) {
            // TypeScript type guard: fontInfoObj is confirmed to be an object with realFontName property
            const fontInfoWithProps = /** @type {{realFontName: string, fontWeight?: string, fontStyle?: string}} */ (fontInfoObj);
            if (fontInfoWithProps.fontWeight) {
              item.fontWeight = fontInfoWithProps.fontWeight;
            }
            if (fontInfoWithProps.fontStyle) {
              item.fontStyle = fontInfoWithProps.fontStyle;
            }
          }
        }
      } else {
        // No mapping found, use fontName as both original and real
        item.originalFontName = item.fontName;
        item.realFontName = item.fontName;
      }
    });
  } else {
    // No mapping available, use fontName as both
    transformedItems.forEach(item => {
      item.originalFontName = item.fontName;
      item.realFontName = item.fontName;
    });
  }
  
  // Build font format map if not provided
  // CRITICAL: Pass fontNameMap to buildFontFormatMap so it can use real font names
  if (!fontToFormats) {
    fontToFormats = buildFontFormatMap(transformedItems, fontNameMap);
  }
  
  // Font format mapping processed
  
  let formattedCount = 0;
  let boldCount = 0;
  let italicCount = 0;
  const formattedItems = [];
  
  transformedItems.forEach((item, idx) => {
    item.isBold = false;
    item.isItalic = false;
    item.isUnderlined = false;
    
    const lookupFontName = item.originalFontName || item.fontName;
    const realFontName = item.realFontName || lookupFontName;
    
    // RELIABLE METHOD 1: Check font name for "Bold" or "Italic"
    const isBoldByFontName = TEXT_FORMATTING.BOLD_FONT_PATTERN.test(realFontName) || 
                             TEXT_FORMATTING.BOLD_FONT_PATTERN.test(lookupFontName);
    const isItalicByFontName = TEXT_FORMATTING.ITALIC_FONT_PATTERN.test(realFontName) || 
                               TEXT_FORMATTING.ITALIC_FONT_PATTERN.test(lookupFontName);
    
    if (isBoldByFontName) {
      item.isBold = true;
      formattedCount++;
      boldCount++;
    }
    if (isItalicByFontName) {
      item.isItalic = true;
      formattedCount++;
      italicCount++;
    }
    
    // RELIABLE METHOD 2: Use direct fontWeight/fontStyle from PDF
    if (!item.isBold && item.fontWeight === 'bold') {
      item.isBold = true;
      formattedCount++;
      boldCount++;
    }
    if (!item.isItalic && (item.fontStyle === 'italic' || item.fontStyle === 'oblique')) {
      item.isItalic = true;
      formattedCount++;
      italicCount++;
    }
    
    // RELIABLE METHOD 3: Use fontToFormats (only for fonts explicitly marked in name)
    if (!item.isBold && !item.isItalic && fontToFormats && fontToFormats.has(lookupFontName)) {
      const format = fontToFormats.get(lookupFontName);
      if (format === TEXT_FORMATTING.FORMAT_BOLD || format === TEXT_FORMATTING.FORMAT_BOLD_ITALIC) {
        item.isBold = true;
        formattedCount++;
        boldCount++;
      }
      if (format === TEXT_FORMATTING.FORMAT_ITALIC || format === TEXT_FORMATTING.FORMAT_BOLD_ITALIC) {
        item.isItalic = true;
        formattedCount++;
        italicCount++;
      }
    }
    
  });
  
  // Detect underlined text if graphics data is available
  // CRITICAL: Check both lines (tableLines) and allLines (all horizontal lines including underlines)
  const hasLines = graphicsData && ((graphicsData.lines && graphicsData.lines.length > 0) || 
                                     (graphicsData.allLines && graphicsData.allLines.length > 0));
  if (hasLines) {
    detectUnderlinedText(transformedItems, graphicsData);
  }

  return transformedItems;
}

/**
 * Calculate adaptive tolerances for line grouping
 * 
 * @param {Array} transformedItems - Transformed items
 * @returns {Object} { xTolerance, yTolerance }
 */
export function calculateTolerances(transformedItems) {
  if (!transformedItems || transformedItems.length === 0) {
    return {
      xTolerance: CLUSTERING.DEFAULT_X_TOLERANCE,
      yTolerance: CLUSTERING.DEFAULT_Y_TOLERANCE
    };
  }

  const heights = transformedItems
    .map(item => item.fontSize)
    .filter(h => h > 0 && isFinite(h));
  
  heights.sort((a, b) => a - b);
  const medianHeight = heights.length > 0 
    ? heights[Math.floor(heights.length / 2)] 
    : FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;

  const xTolerance = Math.max(
    CLUSTERING.DEFAULT_X_TOLERANCE, 
    medianHeight * CLUSTERING.X_TOLERANCE_MULTIPLIER
  );
  const yTolerance = Math.max(
    CLUSTERING.DEFAULT_Y_TOLERANCE, 
    medianHeight * CLUSTERING.Y_TOLERANCE_MULTIPLIER
  );

  return { xTolerance, yTolerance };
}

/**
 * Process page text items: transform, apply formatting, group into lines
 * 
 * CRITICAL FLOW:
 * 1. Transform items and apply formatting
 * 2. Detect preliminary columns (quick analysis at items level)
 * 3. Group items into lines (using preliminary columns to improve separation)
 * 
 * @param {Array} textItems - Raw text items from PDF.js
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {number} pageNum - Page number
 * @param {{baseFontSize?: number, [key: string]: any}} [metrics] - PDF metrics (optional, for baseFontSize)
 * @param {{lines?: Array<{x: number, y: number, width: number, [key: string]: any}>, allLines?: Array<any>, [key: string]: any}|null} [graphicsData] - Optional graphics data for underline detection
 * @param {{items?: Array<any>, styles?: Record<string, {fontFamily?: string, fontWeight?: string, fontStyle?: string, [key: string]: any}>, [key: string]: any}|null} [textContent] - Optional textContent object for font name mapping (from page.getTextContent())
 * @returns {Array} Array of line objects
 */
export function processPageItemsToLines(textItems, viewport, pageNum, metrics = {}, graphicsData = null, textContent = null) {
  // Transform items
  const transformedItems = transformTextItems(textItems, viewport, pageNum);
  
  // Extract font name mapping from textContent if available
  let fontNameMap = null;
  if (textContent) {
    fontNameMap = extractFontNameMapping(textContent, pageNum);
  }
  
  // Build font format map BEFORE applying formatting (needed for detectContextualFormatting)
  // CRITICAL: Pass fontNameMap to buildFontFormatMap so it can use real font names
  const fontToFormats = buildFontFormatMap(transformedItems, fontNameMap);
  
  // Apply initial font formatting (global heuristics)
  applyFontFormatting(transformedItems, graphicsData, fontNameMap, fontToFormats, pageNum);
  
  // Calculate tolerances
  const { xTolerance, yTolerance } = calculateTolerances(transformedItems);
    criticalLog(`processPageItemsToLines: Calculated tolerances`, 'PROCESS_PAGE_ITEMS_TOLERANCES', {
      pageNum,
      xTolerance: xTolerance.toFixed(2),
      yTolerance: yTolerance.toFixed(2)
    });
  
  // CRITICAL: Detect preliminary columns at items level
  // This helps improve item-to-line grouping by preventing items from different columns
  // from being grouped into the same line
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const preliminaryColumns = detectPreliminaryColumns(transformedItems, viewport, { baseFontSize });
  
  // Group items into lines (pass preliminary columns to improve separation)
  const lines = iterItemsToLines(transformedItems, xTolerance, yTolerance, preliminaryColumns);
  
  // CRITICAL: Apply contextual formatting detection
  // This compares items within the same line to accurately detect formatting
  // even for single words
  // Pass fontToFormats to detectContextualFormatting so it can use already-computed results
  try {
    detectContextualFormatting(lines, fontNameMap, fontToFormats, pageNum);
  } catch (error) {
    criticalLog(`detectContextualFormatting failed for page ${pageNum}, continuing without contextual formatting`, 'CONTEXTUAL_FORMATTING_ERROR', {
      pageNum,
      error: error.message,
      stack: error.stack,
      linesCount: lines.length,
      fontNameMapSize: fontNameMap ? fontNameMap.size : 0,
      fontToFormatsSize: fontToFormats ? fontToFormats.size : 0
    });
    // Continue without contextual formatting - not critical
  }
  
  return lines;
}


