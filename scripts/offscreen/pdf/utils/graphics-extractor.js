// @ts-check
// Graphics extractor - extracts lines and rectangles from PDF operator list
// This can be used to detect table borders and improve table detection

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../utils/logging.js';
import { DEFAULT_METRICS, TABLE_DETECTION } from '../constants.js';
import { loadPdfJs } from './pdf-loader.js';
import { multiplyCTM, transformPoint, isTableLine } from './graphics-helpers.js';
import { transformCoordinates } from './coordinate-transform.js';


/**
 * Extract graphics (lines, rectangles) from PDF page operator list
 * 
 * @param {{getOperatorList: function(): Promise<any>, [key: string]: any}} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @returns {Promise<Object>} { lines, rectangles }
 */
export async function extractPageGraphics(page, pageNum, viewport) {
  const { OPS } = await loadPdfJs();
  const lines = [];
  const rectangles = [];
  const stateStack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  let lineWidth = 1;
  let segments = [];
  let pathRectangles = [];
  let currentPoint = null;
  let subpathStart = null;

  function clearPath() {
    segments = [];
    pathRectangles = [];
    currentPoint = null;
    subpathStart = null;
  }

  function closeSubpath() {
    if (currentPoint && subpathStart) {
      if (currentPoint[0] !== subpathStart[0] || currentPoint[1] !== subpathStart[1]) {
        segments.push([currentPoint, subpathStart]);
      }
      currentPoint = subpathStart;
    }
  }

  function constructPath(operators, coordinates) {
    const pathCoordinates = Array.from(coordinates);
    let offset = 0;
    for (const operator of operators) {
      if (operator === OPS.closePath) {
        closeSubpath();
        continue;
      }
      const count = operator === OPS.rectangle || operator === OPS.curveTo2 || operator === OPS.curveTo3
        ? 4 : operator === OPS.curveTo ? 6 : 2;
      const values = pathCoordinates.slice(offset, offset + count);
      if (values.length !== count || !values.every(Number.isFinite)) {
        throw new Error('Invalid PDF path coordinates');
      }
      offset += count;
      if (operator === OPS.rectangle) {
        const [x, y, width, height] = values;
        const corners = [
          transformPoint(x, y, ctm), transformPoint(x + width, y, ctm),
          transformPoint(x + width, y + height, ctm), transformPoint(x, y + height, ctm)
        ];
        for (let index = 0; index < 4; index++) segments.push([corners[index], corners[(index + 1) % 4]]);
        pathRectangles.push(corners);
        currentPoint = corners[0];
        subpathStart = corners[0];
      } else if (operator === OPS.moveTo) {
        currentPoint = transformPoint(values[0], values[1], ctm);
        subpathStart = currentPoint;
      } else if (operator === OPS.lineTo) {
        const point = transformPoint(values[0], values[1], ctm);
        if (currentPoint) segments.push([currentPoint, point]);
        currentPoint = point;
      } else if ([OPS.curveTo, OPS.curveTo2, OPS.curveTo3].includes(operator)) {
        // Curves are not straight borders; their endpoint starts the next segment.
        currentPoint = transformPoint(values[count - 2], values[count - 1], ctm);
      } else {
        throw new Error('Unsupported PDF path operator');
      }
    }
  }

  function addLine(start, end) {
    const [x1, y1] = transformCoordinates(start[0], start[1], viewport);
    const [x2, y2] = transformCoordinates(end[0], end[1], viewport);
    if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) return;
    if (Math.abs(x1 - x2) >= 2 && Math.abs(y1 - y2) >= 2) return;
    lines.push({
      x1, y1, x2, y2, pageNum,
      pdfX1: start[0], pdfY1: start[1], pdfX2: end[0], pdfY2: end[1],
      lineWidth: lineWidth * (viewport.scale || 1)
    });
  }

  function paintPath(stroke, fill, close = false) {
    if (close) closeSubpath();
    if (stroke) for (const [start, end] of segments) addLine(start, end);
    for (const corners of pathRectangles) {
      const points = corners.map(point => transformCoordinates(point[0], point[1], viewport));
      const xs = points.map(point => point[0]);
      const ys = points.map(point => point[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;
      const thickness = Math.max(TABLE_DETECTION.LINE_THICKNESS_THRESHOLD,
        DEFAULT_METRICS.BASE_FONT_SIZE * TABLE_DETECTION.LINE_THICKNESS_MULTIPLIER);
      const length = Math.max(TABLE_DETECTION.LINE_LENGTH_THRESHOLD,
        DEFAULT_METRICS.BASE_FONT_SIZE * TABLE_DETECTION.LINE_LENGTH_MULTIPLIER);
      if (fill && !stroke && ((height < thickness && width > length) || (width < thickness && height > length))) {
        lines.push({ x1: x, y1: y, x2: x + width, y2: y + height, pageNum, lineWidth });
      } else {
        rectangles.push({ x, y, width, height, pageNum });
      }
    }
    clearPath();
  }

  function restoreState() {
    const saved = stateStack.pop();
    if (saved) {
      ctm = saved.ctm;
      lineWidth = saved.lineWidth;
    }
  }

  try {
    const operatorList = await page.getOperatorList();
    if (!operatorList?.fnArray) return { lines: [], rectangles: [], allLines: [] };
    for (let index = 0; index < operatorList.fnArray.length; index++) {
      const operator = operatorList.fnArray[index];
      const args = operatorList.argsArray?.[index] || [];
      try {
        if (operator === OPS.save) {
          stateStack.push({ ctm: [...ctm], lineWidth });
        } else if (operator === OPS.restore || operator === OPS.paintFormXObjectEnd) {
          restoreState();
        } else if (operator === OPS.transform) {
          ctm = multiplyCTM(ctm, args);
        } else if (operator === OPS.paintFormXObjectBegin) {
          stateStack.push({ ctm: [...ctm], lineWidth });
          if (args[0]) ctm = multiplyCTM(ctm, args[0]);
          // PDF.js constructs the Form bounding-box clip and ends that path.
          if (args[1]) clearPath();
        } else if (operator === OPS.setLineWidth) {
          lineWidth = args[0];
        } else if (operator === OPS.setGState) {
          for (const [key, value] of args[0] || []) if (key === 'LW') lineWidth = value;
        } else if (operator === OPS.constructPath) {
          constructPath(args[0], args[1]);
        } else if ([OPS.moveTo, OPS.lineTo, OPS.rectangle, OPS.curveTo, OPS.curveTo2, OPS.curveTo3, OPS.closePath].includes(operator)) {
          constructPath([operator], args);
        } else if (operator === OPS.stroke || operator === OPS.closeStroke) {
          paintPath(true, false, operator === OPS.closeStroke);
        } else if ([OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(operator)) {
          paintPath(true, true, operator === OPS.closeFillStroke || operator === OPS.closeEOFillStroke);
        } else if (operator === OPS.fill || operator === OPS.eoFill) {
          paintPath(false, true);
        } else if (operator === OPS.endPath) {
          clearPath();
        }
      } catch (error) {
        clearPath();
        logWarn('[PDF] Invalid graphics operator', { pageNum, index, message: error.message });
      }
    }
    return {
      lines: lines.filter(line => isTableLine(line, DEFAULT_METRICS.BASE_FONT_SIZE).isTableLine),
      rectangles,
      allLines: lines
    };
  } catch (error) {
    logWarn('[PDF] Failed to extract page graphics', { pageNum, message: error.message });
    return { lines: [], rectangles: [], allLines: [] };
  }
}

/**
 * Detect table regions from extracted graphics
 * Groups lines and rectangles that form table-like structures
 * 
 * @param {Array} lines - Array of line objects
 * @param {Array} rectangles - Array of rectangle objects
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {number} baseFontSize - Base font size for tolerance
 * @returns {Array} Array of potential table regions
 */
export function detectTableRegionsFromGraphics(lines, rectangles, viewport, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  const tableRegions = [];
  const tolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
  
  // Group horizontal and vertical lines using helper function
  const horizontalLines = lines.filter(line => isTableLine(line, baseFontSize).isHorizontal);
  const verticalLines = lines.filter(line => isTableLine(line, baseFontSize).isVertical);
  
  // Find intersections of horizontal and vertical lines (potential table cells)
  const intersections = [];
  for (const hLine of horizontalLines) {
    const hY = (hLine.y1 + hLine.y2) / 2;
    const hX1 = Math.min(hLine.x1, hLine.x2);
    const hX2 = Math.max(hLine.x1, hLine.x2);
    
    for (const vLine of verticalLines) {
      const vX = (vLine.x1 + vLine.x2) / 2;
      const vY1 = Math.min(vLine.y1, vLine.y2);
      const vY2 = Math.max(vLine.y1, vLine.y2);
      
      // Check if lines intersect
      if (vX >= hX1 - tolerance && vX <= hX2 + tolerance &&
          hY >= vY1 - tolerance && hY <= vY2 + tolerance) {
        intersections.push({
          x: vX,
          y: hY,
          horizontalLine: hLine,
          verticalLine: vLine
        });
      }
    }
  }
  
  // Group intersections into table regions
  // Simple approach: find bounding box of all intersections
  if (intersections.length > 0) {
    const xs = intersections.map(i => i.x).sort((a, b) => a - b);
    const ys = intersections.map(i => i.y).sort((a, b) => a - b);
    
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    const minY = ys[0];
    const maxY = ys[ys.length - 1];
    
    // Estimate column and row counts
    // CRITICAL: Safe division - avoid division by zero if tolerance is 0
    const safeTolerance = tolerance > 0 ? tolerance : 1;
    const uniqueXs = [...new Set(xs.map(x => Math.round(x / safeTolerance) * safeTolerance))];
    const uniqueYs = [...new Set(ys.map(y => Math.round(y / safeTolerance) * safeTolerance))];
    
    if (uniqueXs.length >= 2 && uniqueYs.length >= 2) {
      tableRegions.push({
        x: minX,
        y: minY,
        // CRITICAL: Ensure width and height are non-negative
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY),
        columnCount: uniqueXs.length - 1,
        rowCount: uniqueYs.length - 1,
        horizontalLines: uniqueYs.length - 1,
        verticalLines: uniqueXs.length - 1,
        intersections: intersections.length
      });
    }
  }
  
  log(`[PDF v3] detectTableRegionsFromGraphics: Detected ${tableRegions.length} potential table regions from graphics`, {
    horizontalLines: horizontalLines.length,
    verticalLines: verticalLines.length,
    intersections: intersections.length,
    tableRegions: tableRegions.length
  });
  
  return tableRegions;
}

// Track if Y-coordinates have been logged to avoid spam
let _checkGraphicsYCoordsLogged = false;

/**
 * Check if there are graphics elements (lines/rectangles) in the area of elements
 * This is a strong indicator that elements form a table
 * 
 * @param {Array} elements - Array of elements to check
 * @param {{lines?: Array<{x: number, y: number, width: number, height?: number, [key: string]: any}>, rectangles?: Array<any>, [key: string]: any}} graphicsData - Graphics data from extractPageGraphics
 * @param {number} tolerance - Tolerance for matching (default: 10px)
 * @returns {Object} Result with hasGraphics flag and details
 */
export function checkGraphicsInElementArea(elements, graphicsData, tolerance = null, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  // CRITICAL: Log all Y-coordinates of graphics lines on first call to diagnose second table issue
  if (graphicsData && graphicsData.lines && graphicsData.lines.length > 0 && !_checkGraphicsYCoordsLogged) {
    _checkGraphicsYCoordsLogged = true; // Mark as logged to avoid spam
    const allLines = graphicsData.allLines || graphicsData.lines || [];
    const yCoords = allLines.map(l => {
      const y1 = l.y1 || 0;
      const y2 = l.y2 || 0;
      return (y1 + y2) / 2;
    }).filter(y => y > 0).sort((a, b) => a - b);
    
    if (yCoords.length > 0) {
      const minY = yCoords[0];
      const maxY = yCoords[yCoords.length - 1];
      log(`[PDF v3] checkGraphicsInElementArea: ALL GRAPHICS LINES Y-range: [${minY.toFixed(2)}, ${maxY.toFixed(2)}], totalLines=${allLines.length}`);
      
      const allYCoordsStr = yCoords.slice(0, 50).map(y => y.toFixed(2)).join(', '); // Limit to first 50 to avoid huge log
      log(`[PDF v3] checkGraphicsInElementArea: All graphics Y-coordinates (first 50): [${allYCoordsStr}]`);
      
      const secondTableLines = yCoords.filter(y => y >= 550 && y <= 630);
      if (secondTableLines.length > 0) {
        log(`[PDF v3] checkGraphicsInElementArea: SECOND TABLE LINES FOUND in graphics - count=${secondTableLines.length}, Y-coords: [${secondTableLines.map(y => y.toFixed(2)).join(', ')}]`);
      } else {
        logWarn(`[PDF v3] checkGraphicsInElementArea: WARNING - No graphics lines found in second table Y-range [550, 630]`);
      }
    }
  }
  log(`[PDF v3] checkGraphicsInElementArea ENTRY - elements=${elements?.length || 0}, graphicsData=${!!graphicsData}, lines=${graphicsData?.lines?.length || 0}`);
  
  if (!graphicsData || !graphicsData.lines || graphicsData.lines.length === 0) {
    log(`[PDF v3] checkGraphicsInElementArea: No graphics data or lines - graphicsData=${!!graphicsData}, linesCount=${graphicsData?.lines?.length || 0}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  if (!elements || elements.length === 0) {
    log(`[PDF v3] checkGraphicsInElementArea: No elements provided - elementsCount=${elements?.length || 0}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  // Use adaptive tolerance if not provided
  const effectiveTolerance = tolerance !== null 
    ? tolerance 
    : Math.max(TABLE_DETECTION.GRAPHICS_TOLERANCE_DEFAULT, baseFontSize * TABLE_DETECTION.GRAPHICS_TOLERANCE_MULTIPLIER);
  
  log(`[PDF v3] checkGraphicsInElementArea: START - elementsCount=${elements.length}, graphicsLinesCount=${graphicsData.lines.length}, tolerance=${effectiveTolerance.toFixed(2)}`);
  
  // Calculate bounding box of all elements
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (const element of elements) {
    if (element.lines && element.lines.length > 0) {
      for (const line of element.lines) {
        if (line.x !== undefined) {
          minX = Math.min(minX, line.x);
          maxX = Math.max(maxX, line.x);
        }
        if (line.y !== undefined) {
          minY = Math.min(minY, line.y);
          maxY = Math.max(maxY, line.y);
        }
      }
    } else if (element.minX !== undefined && element.maxX !== undefined && 
               element.minY !== undefined && element.maxY !== undefined) {
      minX = Math.min(minX, element.minX);
      maxX = Math.max(maxX, element.maxX);
      minY = Math.min(minY, element.minY);
      maxY = Math.max(maxY, element.maxY);
    }
  }
  
  if (minX === Infinity || minY === Infinity) {
    log(`[PDF v3] checkGraphicsInElementArea: Invalid bounding box - minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  // Expand bounding box by tolerance
  const areaMinX = minX - effectiveTolerance;
  const areaMaxX = maxX + effectiveTolerance;
  const areaMinY = minY - effectiveTolerance;
  const areaMaxY = maxY + effectiveTolerance;
  
  log(`[PDF v3] checkGraphicsInElementArea: Element area bounds - minX=${minX.toFixed(2)}, maxX=${maxX.toFixed(2)}, minY=${minY.toFixed(2)}, maxY=${maxY.toFixed(2)}`);
  log(`[PDF v3] checkGraphicsInElementArea: Expanded bounds (tolerance=${effectiveTolerance.toFixed(2)}) - areaMinX=${areaMinX.toFixed(2)}, areaMaxX=${areaMaxX.toFixed(2)}, areaMinY=${areaMinY.toFixed(2)}, areaMaxY=${areaMaxY.toFixed(2)}`);
  
  // Find graphics lines that intersect with or are near the element area
  const horizontalLines = [];
  const verticalLines = [];
  const rejectedLines = [];
  
  for (let i = 0; i < graphicsData.lines.length; i++) {
    const line = graphicsData.lines[i];
    const lineX1 = Math.min(line.x1, line.x2);
    const lineX2 = Math.max(line.x1, line.x2);
    const lineY1 = Math.min(line.y1, line.y2);
    const lineY2 = Math.max(line.y1, line.y2);
    
    const lineWidth = lineX2 - lineX1;
    const lineHeight = lineY2 - lineY1;
    
    // Check if line is a table line using helper function
    const lineCheck = isTableLine(line, baseFontSize);
    
    if (lineCheck.isHorizontal) {
      const lineY = (lineY1 + lineY2) / 2;
      // Check if horizontal line overlaps with element area
      const yInRange = lineY >= areaMinY && lineY <= areaMaxY;
      const xOverlaps = lineX1 <= areaMaxX && lineX2 >= areaMinX;
      
      if (yInRange && xOverlaps) {
        horizontalLines.push({ line, index: i, lineY, lineX1, lineX2 });
        log(`[PDF v3] checkGraphicsInElementArea: Found horizontal line [${i}] - Y=${lineY.toFixed(2)}, X=[${lineX1.toFixed(2)}, ${lineX2.toFixed(2)}], width=${lineWidth.toFixed(2)}`);
      } else {
        rejectedLines.push({ 
          line, 
          index: i, 
          type: 'horizontal', 
          reason: !yInRange ? `Y=${lineY.toFixed(2)} not in [${areaMinY.toFixed(2)}, ${areaMaxY.toFixed(2)}]` : `X=[${lineX1.toFixed(2)}, ${lineX2.toFixed(2)}] doesn't overlap [${areaMinX.toFixed(2)}, ${areaMaxX.toFixed(2)}]`
        });
      }
    }
    // Check if line is vertical
    else if (lineCheck.isVertical) {
      const lineX = (lineX1 + lineX2) / 2;
      // Check if vertical line overlaps with element area
      const xInRange = lineX >= areaMinX && lineX <= areaMaxX;
      const yOverlaps = lineY1 <= areaMaxY && lineY2 >= areaMinY;
      
      if (xInRange && yOverlaps) {
        verticalLines.push({ line, index: i, lineX, lineY1, lineY2 });
        log(`[PDF v3] checkGraphicsInElementArea: Found vertical line [${i}] - X=${lineX.toFixed(2)}, Y=[${lineY1.toFixed(2)}, ${lineY2.toFixed(2)}], height=${lineHeight.toFixed(2)}`);
      } else {
        rejectedLines.push({ 
          line, 
          index: i, 
          type: 'vertical', 
          reason: !xInRange ? `X=${lineX.toFixed(2)} not in [${areaMinX.toFixed(2)}, ${areaMaxX.toFixed(2)}]` : `Y=[${lineY1.toFixed(2)}, ${lineY2.toFixed(2)}] doesn't overlap [${areaMinY.toFixed(2)}, ${areaMaxY.toFixed(2)}]`
        });
      }
    } else {
      rejectedLines.push({ 
        line, 
        index: i, 
        type: 'other', 
        reason: `width=${lineWidth.toFixed(2)}, height=${lineHeight.toFixed(2)} - not a table line`
      });
    }
  }
  
  const totalLines = horizontalLines.length + verticalLines.length;
  const hasGraphics = totalLines >= TABLE_DETECTION.MIN_GRAPHICS_LINES_FOR_TABLE;
  
  log(`[PDF v3] checkGraphicsInElementArea: RESULT - hasGraphics=${hasGraphics}, horizontalLines=${horizontalLines.length}, verticalLines=${verticalLines.length}, totalLines=${totalLines}, rejectedLines=${rejectedLines.length}`);
  
  // Always log rejected lines details if there are any and we found no graphics
  // This helps debug why graphics aren't detected
  if (rejectedLines.length > 0 && totalLines === 0) {
    const sampleRejected = rejectedLines.slice(0, 10);
    log(`[PDF v3] checkGraphicsInElementArea: Rejected lines details (showing first 10 of ${rejectedLines.length}):`, {
      rejected: sampleRejected.map(r => ({
        index: r.index,
        type: r.type,
        reason: r.reason,
        coords: `(${r.line.x1.toFixed(1)},${r.line.y1.toFixed(1)})-(${r.line.x2.toFixed(1)},${r.line.y2.toFixed(1)})`,
        lineY: r.type === 'horizontal' ? ((r.line.y1 + r.line.y2) / 2).toFixed(2) : 'N/A',
        lineX: r.type === 'vertical' ? ((r.line.x1 + r.line.x2) / 2).toFixed(2) : 'N/A'
      }))
    });
  } else if (rejectedLines.length > 0 && rejectedLines.length <= 20) {
    log(`[PDF v3] checkGraphicsInElementArea: Rejected lines details:`, {
      rejected: rejectedLines.map(r => ({
        index: r.index,
        type: r.type,
        reason: r.reason,
        coords: `(${r.line.x1.toFixed(1)},${r.line.y1.toFixed(1)})-(${r.line.x2.toFixed(1)},${r.line.y2.toFixed(1)})`
      }))
    });
  }
  
  return {
    hasGraphics,
    horizontalLines: horizontalLines.length,
    verticalLines: verticalLines.length,
    totalLines,
    details: {
      areaBounds: { minX, maxX, minY, maxY },
      expandedBounds: { areaMinX, areaMaxX, areaMinY, areaMaxY },
      tolerance: effectiveTolerance,
      matchedHorizontalLines: horizontalLines.map(h => ({
        index: h.index,
        y: h.lineY.toFixed(2),
        xRange: [h.lineX1.toFixed(2), h.lineX2.toFixed(2)]
      })),
      matchedVerticalLines: verticalLines.map(v => ({
        index: v.index,
        x: v.lineX.toFixed(2),
        yRange: [v.lineY1.toFixed(2), v.lineY2.toFixed(2)]
      }))
    }
  };
}

