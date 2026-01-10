// @ts-check
// Font detection utility - determines bold/italic from font metrics
// SIMPLIFIED: Only determines base font, formatting is determined by comparing widthHeightRatio in context

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn, criticalLog } from '../../../../utils/logging.js';
import { TEXT_FORMATTING } from '../constants.js';

/**
 * Build font format mapping from items
 * Uses reliable methods: font name patterns, direct fontWeight/fontStyle, and careful widthHeightRatio heuristics
 * 
 * @param {Array} items - Text items with widthHeightRatio property
 * @param {Map<string, string|Object>} [fontNameMap] - Optional map from internal font name to real font name or FontInfo object
 * @returns {Map<string, string>} Map from fontName to format
 */
export function buildFontFormatMap(items, fontNameMap = null) {
  // Input validation
  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Map();
  }
  
  try {
  const fontToFormats = new Map();
  
    // Group items by originalFontName (internal font name) to preserve distinction
  const fontGroups = new Map();
  items.forEach(item => {
      const fontName = item.originalFontName || item.fontName || '';
    if (!fontName) return;
    
    if (!fontGroups.has(fontName)) {
      fontGroups.set(fontName, []);
    }
    fontGroups.get(fontName).push(item);
  });
  
    if (fontGroups.size === 0) {
    return fontToFormats;
  }
  
    // Calculate average widthHeightRatio for each font group
    const groupAvgRatios = new Map();
    fontGroups.forEach((groupItems, fontName) => {
      const validRatios = groupItems
        .map(item => item.widthHeightRatio)
        .filter(ratio => ratio && ratio > 0 && isFinite(ratio));
      if (validRatios.length > 0) {
        const avgRatio = validRatios.reduce((sum, r) => sum + r, 0) / validRatios.length;
        groupAvgRatios.set(fontName, avgRatio);
      }
    });
    
    // Calculate median and min ratios for comparison
    const avgRatiosArray = Array.from(groupAvgRatios.values()).sort((a, b) => a - b);
    const medianRatio = avgRatiosArray.length > 0 
      ? avgRatiosArray[Math.floor(avgRatiosArray.length / 2)] 
      : 0;
    const minRatio = avgRatiosArray.length > 0 ? avgRatiosArray[0] : 0;
    
    // Calculate total items count for percentage checks
    const totalItems = items.length;
    
  fontGroups.forEach((groupItems, fontName) => {
      // Get real font name from fontNameMap if available
      let realFontName = fontName;
      let directFontWeight = null;
      let directFontStyle = null;
      
      if (fontNameMap && fontNameMap.has(fontName)) {
        const fontInfo = fontNameMap.get(fontName);
        if (fontInfo !== null && fontInfo !== undefined) {
          if (typeof fontInfo === 'string') {
            realFontName = fontInfo;
          } else if (typeof fontInfo === 'object' && 'realFontName' in fontInfo) {
            const fontInfoObj = /** @type {{realFontName: string, fontWeight?: string, fontStyle?: string}} */ (fontInfo);
            realFontName = fontInfoObj.realFontName || fontName;
            directFontWeight = fontInfoObj.fontWeight || null;
            directFontStyle = fontInfoObj.fontStyle || null;
          }
        }
      }
      
      const groupSize = groupItems.length;
      const groupPercentage = (groupSize / totalItems) * 100;
      const avgRatio = groupAvgRatios.get(fontName) || 0;
      
      // Font analysis logging removed - was useful for debugging but too verbose
      
      // RELIABLE METHOD 1: Check font name for "Bold" or "Italic"
      const isBoldByRegex = TEXT_FORMATTING.BOLD_FONT_PATTERN.test(realFontName);
      const isItalicByRegex = TEXT_FORMATTING.ITALIC_FONT_PATTERN.test(realFontName);
      
      // RELIABLE METHOD 2: Use direct fontWeight/fontStyle from PDF
      const isBoldByDirect = directFontWeight === 'bold';
      const isItalicByDirect = directFontStyle === 'italic' || directFontStyle === 'oblique';
      
      // RELIABLE METHOD 3: Careful widthHeightRatio heuristics (only if not base font)
      // CRITICAL: If font is used for >50% of items, it's the base font - don't mark as bold/italic
      const isBaseFont = groupPercentage > TEXT_FORMATTING.BASE_FONT_PERCENTAGE;
      
      let isBoldByRatio = false;
      let isItalicByRatio = false;
      
      if (!isBaseFont && avgRatio > 0 && medianRatio > 0 && minRatio > 0) {
        // Only use ratio heuristics if font is NOT the base font
        // Bold: significantly wider than median (1.2x) or minimum (1.5x)
        const medianThreshold = medianRatio * TEXT_FORMATTING.MEDIAN_COMPARISON_MULTIPLIER;
        const minThreshold = minRatio * TEXT_FORMATTING.MIN_COMPARISON_MULTIPLIER;
        const absoluteThreshold = TEXT_FORMATTING.ABSOLUTE_BOLD_THRESHOLD;
        
        // Bold if ratio is significantly higher than median/min, but not if it's the base font
        isBoldByRatio = (avgRatio > medianThreshold || avgRatio > minThreshold || avgRatio > absoluteThreshold) && !isBaseFont;
        
        // Heuristic 4: Check individual items for very high ratios
        // If only a small percentage of items in this group have high ratios,
        // those specific items are bold, not the whole group
        // This helps detect bold words within paragraphs
        let hasHighRatioItems = false;
        let highRatioCount = 0;
    groupItems.forEach(item => {
          const ratio = item.widthHeightRatio || 0;
          // If item has ratio > 25, it's likely bold
          if (ratio > TEXT_FORMATTING.HIGH_RATIO_THRESHOLD) {
            hasHighRatioItems = true;
            highRatioCount++;
          }
        });
        
        // If less than 50% of items in this group have high ratios,
        // those specific items are bold, not the whole group
        const highRatioPercentage = (highRatioCount / groupSize) * 100;
        const isBoldByHighRatioItems = hasHighRatioItems && highRatioPercentage < TEXT_FORMATTING.HIGH_RATIO_PERCENTAGE && !isBaseFont;
        
        // Combine ratio heuristics
        isBoldByRatio = isBoldByRatio || isBoldByHighRatioItems;
        
        // Italic detection from ratio is less reliable, so we don't use it here
        // Italic is determined only from font name and direct fontStyle
      }
      
      // Combine all methods
      const isBold = isBoldByRegex || isBoldByDirect || isBoldByRatio;
      const isItalic = isItalicByRegex || isItalicByDirect;
    
    if (isBold && isItalic) {
        fontToFormats.set(fontName, TEXT_FORMATTING.FORMAT_BOLD_ITALIC);
        log(`[PDF v3] buildFontFormatMap: Font "${fontName}" (real="${realFontName}") - marked as BOLD+ITALIC (regex=${isBoldByRegex}, direct=${isBoldByDirect}, ratio=${isBoldByRatio}, baseFont=${isBaseFont})`);
        // Format decision logging removed - was useful for debugging but too verbose
    } else if (isBold) {
        fontToFormats.set(fontName, TEXT_FORMATTING.FORMAT_BOLD);
        log(`[PDF v3] buildFontFormatMap: Font "${fontName}" (real="${realFontName}") - marked as BOLD (regex=${isBoldByRegex}, direct=${isBoldByDirect}, ratio=${isBoldByRatio}, baseFont=${isBaseFont}, avgRatio=${avgRatio.toFixed(2)}, median=${medianRatio.toFixed(2)})`);
        // Format decision logging removed - was useful for debugging but too verbose
    } else if (isItalic) {
        fontToFormats.set(fontName, TEXT_FORMATTING.FORMAT_ITALIC);
        log(`[PDF v3] buildFontFormatMap: Font "${fontName}" (real="${realFontName}") - marked as ITALIC (regex=${isItalicByRegex}, direct=${isItalicByDirect})`);
        // Format decision logging removed - was useful for debugging but too verbose
      } else {
        // Format decision logging removed - was useful for debugging but too verbose
      }
    });
    
    // Font format map built
  
  return fontToFormats;
  } catch (error) {
    logWarn('[PDF v3] buildFontFormatMap: Error building font format map', error);
    return new Map();
  }
}

/**
 * Detect underlined text by checking if horizontal lines overlap with text items
 * 
 * @param {Array<{x: number, y: number, width: number, height?: number, [key: string]: any}>} textItems - Text items with x, y, width properties
 * @param {{lines?: Array<{x: number, y: number, width: number, height?: number, [key: string]: any}>, allLines?: Array<{x1?: number, x2?: number, y1?: number, y2?: number, [key: string]: any}>}} graphicsData - Graphics data with lines and allLines properties
 * @returns {void} Modifies items in place, setting isUnderlined property
 */
export function detectUnderlinedText(textItems, graphicsData) {
  // Input validation
  if (!textItems || !Array.isArray(textItems) || textItems.length === 0) {
    return;
  }
  
  if (!graphicsData) {
    return;
  }
  
  // Get all horizontal lines (both tableLines and allLines)
  // CRITICAL: Don't filter by absolute length at this stage - long underlines are possible
  // Instead, we'll check coverage ratio and relative length during matching
  // This allows long underlines (e.g., whole sentences) while filtering table borders
  const horizontalLines = [];
  if (graphicsData.allLines && Array.isArray(graphicsData.allLines)) {
    // Include all lines - filtering will happen during matching based on coverage
    // Only filter extremely long lines (>500px) that are definitely table borders
    const MAX_UNDERLINE_LENGTH_ABSOLUTE = 500; // Very long lines (>500px) are table borders
    graphicsData.allLines.forEach(line => {
      if (line.x1 !== undefined && line.x2 !== undefined && line.y1 !== undefined && line.y2 !== undefined) {
        const lineLength = Math.abs(line.x2 - line.x1);
        // Only filter extremely long lines - allow up to 500px for long underlines
        if (lineLength < MAX_UNDERLINE_LENGTH_ABSOLUTE) {
          horizontalLines.push(line);
        }
      }
    });
  }
  // Also check lines (table lines) but filter extremely long ones
  if (graphicsData.lines && Array.isArray(graphicsData.lines)) {
    const MAX_UNDERLINE_LENGTH_ABSOLUTE = 500; // Same threshold as above
    graphicsData.lines.forEach(line => {
      if (line.x1 !== undefined && line.x2 !== undefined && line.y1 !== undefined && line.y2 !== undefined) {
        const lineLength = Math.abs(line.x2 - line.x1);
        // Only filter extremely long lines
        if (lineLength < MAX_UNDERLINE_LENGTH_ABSOLUTE) {
          // Check if not already added from allLines
          const alreadyAdded = horizontalLines.some(existing => 
            Math.abs(existing.x1 - line.x1) < 1 && 
            Math.abs(existing.y1 - line.y1) < 1 &&
            Math.abs(existing.x2 - line.x2) < 1 &&
            Math.abs(existing.y2 - line.y2) < 1
          );
          if (!alreadyAdded) {
            horizontalLines.push(line);
          }
        }
      }
    });
  }
  
  if (horizontalLines.length === 0) {
    return;
  }
  
  // Log start (reduced verbosity)
  log(`[PDF v3] detectUnderlinedText: Starting - ${textItems.length} items, ${horizontalLines.length} horizontal lines`);
  
  let underlinedCount = 0;
  // Process each text item
  for (let itemIdx = 0; itemIdx < textItems.length; itemIdx++) {
    const item = textItems[itemIdx];
    if (!item || typeof item.x !== 'number' || typeof item.width !== 'number') {
      continue;
    }
    
    // Use viewport coordinates (item.x, item.y are already in viewport coordinates)
    const checkX = item.x;
    const checkY = item.y;
    const checkWidth = item.width;
    
    // CRITICAL: Skip items with zero or negative width to avoid division by zero
    if (checkWidth <= 0) {
      continue;
    }
    
    const matchingLines = horizontalLines.filter((line, lineIdx) => {
      // CRITICAL: Validate line coordinates before use
      if (line.x1 === undefined || line.x2 === undefined || 
          line.y1 === undefined || line.y2 === undefined ||
          typeof line.x1 !== 'number' || typeof line.x2 !== 'number' ||
          typeof line.y1 !== 'number' || typeof line.y2 !== 'number') {
        return false;
      }
      
      // Try viewport coordinates first (current approach)
      const lineY = (line.y1 + line.y2) / 2;
      const lineXStart = Math.min(line.x1, line.x2);
      const lineXEnd = Math.max(line.x1, line.x2);
      
      // Check Y overlap: line should be close to item's baseline (below text)
      // Use item's fontSize to calculate proper tolerance
      const itemFontSize = item.fontSize || 12;
      const itemHeight = itemFontSize;
      
      // CRITICAL: Use flexible range for underline detection (like old working version)
      // Underlines should be within 0.2x font size above to 0.3x font size below text
      // This prevents false matches with lines that belong to other text items
      // CRITICAL: Add small tolerance (0.5px) to account for rounding errors
      const TOLERANCE = 0.5;
      const reasonableUnderlineYMin = Math.max(0, checkY - itemHeight * TEXT_FORMATTING.VIEWPORT_Y_MIN_FACTOR - TOLERANCE); // Allow 20% above text + tolerance
      const reasonableUnderlineYMax = checkY + itemHeight * TEXT_FORMATTING.VIEWPORT_Y_MAX_FACTOR + TOLERANCE; // 30% below text + tolerance
      // CRITICAL: Line can be slightly above text (within reasonable range) or below text
      // This handles cases where coordinates are slightly offset
      const isBelowText = lineY > checkY && lineY <= reasonableUnderlineYMax;
      const isSlightlyAboveText = lineY < checkY && lineY >= reasonableUnderlineYMin;
      const isInUnderlineRange = lineY >= reasonableUnderlineYMin && lineY <= reasonableUnderlineYMax;
      
      // CRITICAL: Also check distance from expected underline position (for stricter matching)
      // Text baseline is typically at ~80% of font height from top
      // Underline should be at ~90-100% of font height from top
      const textBaselineY = checkY + itemHeight * TEXT_FORMATTING.VIEWPORT_BASELINE_FACTOR;
      const expectedUnderlineY = textBaselineY + Math.max(1, itemHeight * TEXT_FORMATTING.VIEWPORT_UNDERLINE_OFFSET);
      const yDistance = Math.abs(lineY - expectedUnderlineY);
      
      // Use strict tolerance: max 5px or 20% of font size
      const strictMaxDistance = Math.max(
        TEXT_FORMATTING.VIEWPORT_STRICT_MAX_DISTANCE,
        itemHeight * TEXT_FORMATTING.VIEWPORT_STRICT_DISTANCE_FACTOR
      );
      const isVeryCloseToBaseline = yDistance <= strictMaxDistance;
      
      // Fallback: Also check that line is not too far from text in absolute terms
      // This is a secondary check for coordinate system mismatches
      const absoluteMaxDistance = Math.max(
        TEXT_FORMATTING.VIEWPORT_ABSOLUTE_MAX_DISTANCE,
        itemHeight * TEXT_FORMATTING.VIEWPORT_ABSOLUTE_DISTANCE_FACTOR
      );
      const isNotTooFar = yDistance <= absoluteMaxDistance;
      
      // CRITICAL: Prefer strict check, but allow fallback for coordinate system differences
      // If strict check fails but absolute check passes, it might be a coordinate system issue
      // Also allow if line is within reasonable range (even if not very close to expected position)
      // This handles cases where underline is close to text but expected position calculation is off
      const isReasonablyClose = isVeryCloseToBaseline || (isNotTooFar && yDistance <= itemHeight * 0.5);
      
      // CRITICAL: If line is within reasonable range (isInUnderlineRange), it's likely an underline
      // Even if distance from expected position is large, if it's within the text's Y range, accept it
      // This handles coordinate system mismatches where expected position calculation doesn't match actual position
      const isWithinTextRange = isInUnderlineRange && isNotTooFar;
      
      // CRITICAL: Match logic from checkpoint 10 - but allow lines slightly above text
      // Primary check: line below text OR slightly above text, within range, and reasonably close
      // Fallback: if line is within text range (even if not very close to expected position), accept it
      // This handles coordinate system offsets where underline might be rendered slightly above text
      const primaryCheck = (isBelowText || isSlightlyAboveText) && isInUnderlineRange && isReasonablyClose && isNotTooFar;
      const fallbackCheck = isWithinTextRange && yDistance <= itemHeight * 1.5; // Allow up to 1.5x font size distance if within text range
      const yOverlaps = primaryCheck || fallbackCheck;
      
      // Detailed coordinate logging removed - was useful for debugging but too verbose
      
      // Check X overlap: line should overlap with item's X range
      const overlapsX = !(lineXEnd < checkX || lineXStart > checkX + checkWidth);
      
      const lineWidth = lineXEnd - lineXStart;
      // CRITICAL: Safe division - checkWidth is already validated to be > 0
      const coverageRatio = overlapsX && checkWidth > 0 ? Math.min(lineWidth, checkWidth) / checkWidth : 0;
      const minCoverage = TEXT_FORMATTING.VIEWPORT_MIN_COVERAGE;
      
      // CRITICAL: Filter out very long lines that span multiple items (likely table borders, not underlines)
      // Underlines should be roughly the same width as the text or slightly longer
      // Use multiplier to allow slight overhang (underlines can extend slightly beyond text)
      // CRITICAL: checkWidth is already validated to be > 0 at line 262
      const MAX_UNDERLINE_WIDTH_MULTIPLIER = 1.5; // Underline can be up to 1.5x text width
      const isLineTooLong = lineWidth > checkWidth * MAX_UNDERLINE_WIDTH_MULTIPLIER;
      
      // CRITICAL: Filter out lines that cover too much of the text (>80%)
      // Real underlines typically cover only part of the text (single words or phrases)
      // Lines that cover almost the entire text (>80%) are likely table borders or other graphics
      const MAX_UNDERLINE_COVERAGE = TEXT_FORMATTING.VIEWPORT_MAX_COVERAGE; // Maximum 80% coverage for underlines
      const isCoverageTooHigh = coverageRatio > MAX_UNDERLINE_COVERAGE;
      
      // Also check: if line is much longer than text and covers multiple items, it's likely a table border
      // This prevents false positives when table borders intersect with text
      
      // Detailed X-overlap logging removed - was useful for debugging coverageRatio issue
      
      // CRITICAL: For lines in the right part of the page, require that the line is actually
      // in the right part of the item, not just intersecting with it
      // This prevents false positives when a short line in the right part intersects with wide items
      // CRITICAL: checkWidth is already validated to be > 0 at line 262
      const lineCenterX = (lineXStart + lineXEnd) / 2;
      const itemCenterX = checkX + checkWidth / 2;
      const lineIsInRightPart = lineCenterX > itemCenterX * TEXT_FORMATTING.VIEWPORT_RIGHT_PART_FACTOR;
      const itemIsWide = checkWidth > TEXT_FORMATTING.VIEWPORT_WIDE_ITEM_THRESHOLD;
      
      // If line is in right part and item is wide, require that line is actually in right part of item
      // Line must be in the last 25% of the item's width (rightmost quarter)
      // This prevents false positives for items that start at left but extend to right
      // CRITICAL: checkWidth is already validated to be > 0 at line 262
      const itemRightQuarterStart = checkX + checkWidth * TEXT_FORMATTING.VIEWPORT_RIGHT_QUARTER_FACTOR;
      const linePositionCheck = !(lineIsInRightPart && itemIsWide) || (lineXStart >= itemRightQuarterStart);
      
      // CRITICAL: Check if line is extremely long (>500px) - these are definitely table borders
      // But allow lines up to 500px for long underlines (e.g., whole sentences)
      const MAX_UNDERLINE_LENGTH_ABSOLUTE = 500; // Absolute maximum length for underlines
      const isLineTooLongAbsolute = lineWidth > MAX_UNDERLINE_LENGTH_ABSOLUTE;
      
      // CRITICAL: The key check is coverage ratio - if line covers >80% of text, it's a table border
      // This allows long underlines that cover only part of the text (e.g., 30-50%)
      // while filtering table borders that cover almost all text (90%+)
      
      // Final check: all conditions must be met (isLineTooLong and isCoverageTooHigh already checked above)
      const viewportMatch = yOverlaps && overlapsX && coverageRatio >= minCoverage && coverageRatio <= MAX_UNDERLINE_COVERAGE && linePositionCheck && !isLineTooLong && !isLineTooLongAbsolute && !isCoverageTooHigh;
      
      // CRITICAL: Fallback to PDF native coordinates if viewport match fails (like checkpoint 10)
      // This handles cases where coordinates are in different systems
      let pdfNativeMatch = false;
      if (!viewportMatch && item.pdfX !== undefined && item.pdfY !== undefined) {
        // Try PDF native coordinates (raw, CTM-transformed, or text matrix)
        const itemPdfX = item.pdfX;
        const itemPdfY = item.pdfY;
        const itemPdfWidth = item.width; // Width is same in both systems (already validated to be > 0 at line 262)
        const itemPdfHeight = item.fontSize || 12;
        
        // Try raw PDF coordinates first
        if (line.pdfX1 !== undefined && line.pdfY1 !== undefined && line.pdfX2 !== undefined && line.pdfY2 !== undefined) {
          const linePdfY = (line.pdfY1 + line.pdfY2) / 2;
          const linePdfXStart = Math.min(line.pdfX1, line.pdfX2);
          const linePdfXEnd = Math.max(line.pdfX1, line.pdfX2);
          
          // Check X overlap in PDF native system
          const checkPdfXEnd = itemPdfX + itemPdfWidth;
          const pdfOverlapsX = !(linePdfXEnd < itemPdfX || linePdfXStart > checkPdfXEnd);
          
          // In PDF native system, Y increases upward, so underline should be slightly below text baseline
          // Expected underline Y: itemPdfY - (fontSize * 0.15)
          const expectedUnderlinePdfY = itemPdfY - itemPdfHeight * 0.15;
          const pdfYDistance = Math.abs(linePdfY - expectedUnderlinePdfY);
          
          // Strict tolerance: 5px or 20% of font size (whichever is larger)
          const strictPdfYTolerance = Math.max(itemPdfHeight * 0.2, 5);
          
          pdfNativeMatch = pdfYDistance < strictPdfYTolerance && pdfOverlapsX;
          
          // PDF native check - no logging (reduced verbosity)
        }
      }
      
      // Match if either viewport or PDF native coordinates match (like checkpoint 10)
      const isMatch = viewportMatch || pdfNativeMatch;
      
      // Log only when match is found (reduced logging)
      // Detailed check logging removed - was useful for debugging coverageRatio issue
      
      return isMatch;
    });
    
    if (matchingLines.length > 0) {
      // CRITICAL: Calculate which part of text is underlined based on line X coordinates (like checkpoint 10)
      // For each matching line, determine what portion of the text item it covers
      if (!item.underlinedRanges) {
        item.underlinedRanges = [];
      }
      
      let hasFullCoverage = false;
      const itemTextFull = item.str || '';
      
      for (let lineIdxInMatch = 0; lineIdxInMatch < matchingLines.length; lineIdxInMatch++) {
        const line = matchingLines[lineIdxInMatch];
        
        // CRITICAL: Use viewport coordinates for range calculation (same as matching)
        const lineXStart = Math.min(line.x1, line.x2);
        const lineXEnd = Math.max(line.x1, line.x2);
        const itemXStart = checkX;
        const itemXEnd = checkX + checkWidth;
        
        // Check if line actually overlaps with item by X coordinate
        const overlapsX = !(lineXEnd < itemXStart || lineXStart > itemXEnd);
        
        if (!overlapsX) {
          continue;
        }
        
        // CRITICAL: Calculate overlap once to avoid duplication
        const overlapStart = Math.max(itemXStart, lineXStart);
        const overlapEnd = Math.min(itemXEnd, lineXEnd);
        const overlapWidth = overlapEnd - overlapStart;
        
        // CRITICAL: Safe division - checkWidth is already validated to be > 0 at line 262
        const coverageRatioForRange = overlapWidth / checkWidth;
        
        // CRITICAL: Check if line covers entire item (or almost entire - >95% coverage)
        // Use flexible check to account for coordinate rounding errors
        // If line covers >95% of item, consider it full coverage (likely a table border or full underline)
        const FULL_COVERAGE_THRESHOLD = 0.95; // 95% coverage = full coverage
        const coversFullItem = (lineXStart <= itemXStart && lineXEnd >= itemXEnd) || 
                              (coverageRatioForRange >= FULL_COVERAGE_THRESHOLD);
        
        if (coversFullItem) {
          // Line covers entire item (or >95%) - this is likely a table border, not an underline
          // CRITICAL: Skip lines that cover almost the entire item - they're not underlines
          // Real underlines cover only part of the text (single words or phrases)
          // Lines covering >95% are table borders or other graphics
          if (coverageRatioForRange >= FULL_COVERAGE_THRESHOLD) {
            // Skip this line - it's a table border, not an underline
            continue;
          }
          // Line covers entire item exactly - mark entire item as underlined
          hasFullCoverage = true;
          break;
        } else {
          // Line covers only part of item - calculate text indices
          // CRITICAL: First check if coverage is too high (>95%) - skip if so (table border)
          
          // CRITICAL: If line covers >95% of item, it's a table border, not an underline
          // Real underlines cover only part of the text (single words or phrases)
          if (coverageRatioForRange >= FULL_COVERAGE_THRESHOLD) {
            // Skip this line - it's a table border, not an underline
            continue;
          }
          
          // Calculate relative positions within item (0.0 to 1.0)
          // CRITICAL: Safe division - checkWidth is already validated to be > 0 at line 262
          const startRatio = (overlapStart - itemXStart) / checkWidth;
          const endRatio = (overlapEnd - itemXStart) / checkWidth;
          
          // Convert to character indices
          const textLength = itemTextFull.length;
          let startIndex = Math.floor(startRatio * textLength);
          let endIndex = Math.ceil(endRatio * textLength);
          
          // CRITICAL: Clamp indices to valid range [0, textLength]
          startIndex = Math.max(0, Math.min(startIndex, textLength));
          endIndex = Math.max(0, Math.min(endIndex, textLength));
          
          // CRITICAL: Trim whitespace and punctuation from the end of the range
          // This prevents including trailing spaces, hyphens, or punctuation that aren't part of the underlined word
          if (endIndex > startIndex) {
            const rangeText = itemTextFull.substring(startIndex, endIndex);
            // Trim whitespace and common punctuation from the end
            const trimmedEnd = rangeText.replace(/[\s\-–—,.;:!?]+$/, '').length;
            if (trimmedEnd < rangeText.length) {
              endIndex = startIndex + trimmedEnd;
            }
          }
          
          // Only add if range is valid and non-empty
          if (startIndex < endIndex && startIndex >= 0 && endIndex <= textLength) {
            item.underlinedRanges.push({
              startIndex: startIndex,
              endIndex: endIndex
            });
          }
        }
      }
      
      if (hasFullCoverage) {
        // Line covers entire item - use simple flag
        item.isUnderlined = true;
        underlinedCount++;
        // Logging removed - was useful for debugging but too verbose
      } else if (item.underlinedRanges.length > 0) {
        // Partial coverage - use ranges
        // Merge overlapping ranges
        item.underlinedRanges.sort((a, b) => a.startIndex - b.startIndex);
        const mergedRanges = [];
        for (const range of item.underlinedRanges) {
          if (mergedRanges.length === 0) {
            mergedRanges.push({ ...range });
          } else {
            const lastRange = mergedRanges[mergedRanges.length - 1];
            if (range.startIndex <= lastRange.endIndex) {
              // Overlapping or adjacent - merge
              lastRange.endIndex = Math.max(lastRange.endIndex, range.endIndex);
            } else {
              // Non-overlapping - add new range
              mergedRanges.push({ ...range });
            }
          }
        }
        item.underlinedRanges = mergedRanges;
        
        // Don't set item.isUnderlined = true - use ranges instead
        underlinedCount++;
        // Logging removed - was useful for debugging but too verbose
      } else {
        // No valid ranges - mark as not underlined
        item.isUnderlined = false;
      }
    } else {
      item.isUnderlined = false;
    }
  }
  
  // Log summary only (reduced verbosity)
  if (underlinedCount > 0) {
    log(`[PDF v3] detectUnderlinedText: Marked ${underlinedCount}/${textItems.length} items as underlined`);
  }
}
