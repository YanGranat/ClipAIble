// @ts-check
// Graphics helper utilities - shared functions for graphics processing

import { DEFAULT_METRICS, TABLE_DETECTION } from '../constants.js';

/**
 * Multiply two transformation matrices
 * CTM_new = CTM_current × CTM_new
 * 
 * @param {Array<number>} currentCTM - Current transformation matrix [a, b, c, d, e, f]
 * @param {Array<number>} newCTM - New transformation matrix [a, b, c, d, e, f]
 * @returns {Array<number>} Resulting transformation matrix
 */
export function multiplyCTM(currentCTM, newCTM) {
  if (!currentCTM || currentCTM.length !== 6 || !newCTM || newCTM.length !== 6) {
    return newCTM || currentCTM || [1, 0, 0, 1, 0, 0];
  }
  
  const [a1, b1, c1, d1, e1, f1] = currentCTM;
  const [a2, b2, c2, d2, e2, f2] = newCTM;
  
  // Matrix multiplication: [a1, b1, c1, d1, e1, f1] × [a2, b2, c2, d2, e2, f2]
  return [
    a1 * a2 + c1 * b2,      // a_new
    b1 * a2 + d1 * b2,      // b_new
    a1 * c2 + c1 * d2,      // c_new
    b1 * c2 + d1 * d2,      // d_new
    a1 * e2 + c1 * f2 + e1, // e_new
    b1 * e2 + d1 * f2 + f1  // f_new
  ];
}

/**
 * Transform a point using CTM
 * [x', y'] = [x, y, 1] × CTM
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array<number>} ctm - Transformation matrix [a, b, c, d, e, f]
 * @returns {Array<number>} Transformed coordinates [x', y']
 */
export function transformPoint(x, y, ctm) {
  if (!ctm || ctm.length !== 6) {
    return [x, y];
  }
  
  const [a, b, c, d, e, f] = ctm;
  return [
    a * x + c * y + e,
    b * x + d * y + f
  ];
}

/**
 * Calculate inverse of a transformation matrix
 * For matrix [a, b, c, d, e, f], inverse is calculated as:
 * det = a*d - b*c
 * inv = [d/det, -b/det, -c/det, a/det, (c*f - d*e)/det, (b*e - a*f)/det]
 * 
 * @param {Array<number>} ctm - Transformation matrix [a, b, c, d, e, f]
 * @returns {Array<number>|null} Inverse matrix or null if matrix is singular
 */
export function invertMatrix(ctm) {
  if (!ctm || ctm.length !== 6) {
    return null;
  }
  
  const [a, b, c, d, e, f] = ctm;
  const det = a * d - b * c;
  
  // Check if matrix is singular (determinant is zero)
  if (Math.abs(det) < 1e-10) {
    return null;
  }
  
  // Calculate inverse matrix
  return [
    d / det,           // a'
    -b / det,          // b'
    -c / det,          // c'
    a / det,           // d'
    (c * f - d * e) / det,  // e'
    (b * e - a * f) / det   // f'
  ];
}

/**
 * Transform all corners of a rectangle using CTM
 * Returns bounding box of transformed corners
 * 
 * @param {number} x - Rectangle X coordinate
 * @param {number} y - Rectangle Y coordinate
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {Array<number>} ctm - Transformation matrix
 * @returns {Object} Bounding box { minX, minY, maxX, maxY, width, height }
 */
export function transformRectangle(x, y, width, height, ctm) {
  // Transform all 4 corners
  const corners = [
    transformPoint(x, y, ctm),                    // bottom-left
    transformPoint(x + width, y, ctm),            // bottom-right
    transformPoint(x + width, y + height, ctm),  // top-right
    transformPoint(x, y + height, ctm)            // top-left
  ];
  
  // Calculate bounding box
  const xs = corners.map(c => c[0]);
  const ys = corners.map(c => c[1]);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Check if a line is a table line (horizontal or vertical)
 * Uses adaptive thresholds based on baseFontSize
 * 
 * @param {{x1?: number, y1?: number, x2?: number, y2?: number, x?: number, y?: number, width?: number, height?: number, [key: string]: any}} line - Line object with x1, y1, x2, y2
 * @param {number} baseFontSize - Base font size for adaptive thresholds
 * @returns {Object} { isHorizontal, isVertical, isTableLine }
 */
export function isTableLine(line, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  if (!line || line.x1 === undefined || line.y1 === undefined || 
      line.x2 === undefined || line.y2 === undefined) {
    return { isHorizontal: false, isVertical: false, isTableLine: false };
  }
  
  const width = Math.abs(line.x2 - line.x1);
  const height = Math.abs(line.y2 - line.y1);
  
  // Adaptive thresholds based on font size
  const thicknessThreshold = Math.max(TABLE_DETECTION.LINE_THICKNESS_THRESHOLD, baseFontSize * TABLE_DETECTION.LINE_THICKNESS_MULTIPLIER);
  const lengthThreshold = Math.max(TABLE_DETECTION.LINE_LENGTH_THRESHOLD, baseFontSize * TABLE_DETECTION.LINE_LENGTH_MULTIPLIER);
  
  // Horizontal line (small height, large width)
  const isHorizontal = height < thicknessThreshold && width > lengthThreshold;
  // Vertical line (small width, large height)
  const isVertical = width < thicknessThreshold && height > lengthThreshold;
  
  return {
    isHorizontal,
    isVertical,
    isTableLine: isHorizontal || isVertical
  };
}

/**
 * Analyze gap pattern in lines to determine if it's paragraph-like
 * Paragraphs have regular, small gaps; tables have irregular gaps
 * 
 * @param {Array} lines - Array of line objects with y property
 * @param {number} baseFontSize - Base font size
 * @returns {Object} Gap pattern analysis { hasRegularGapPattern, avgGap, gapCV, isSmallRegularGaps }
 */
export function analyzeGapPattern(lines, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  if (!lines || lines.length < 3) {
    return {
      hasRegularGapPattern: false,
      avgGap: 0,
      gapCV: 1,
      isSmallRegularGaps: false
    };
  }
  
  // Sort lines by Y
  const sortedLines = [...lines].sort((a, b) => (a.y || 0) - (b.y || 0));
  
  // Calculate gaps
  const gaps = [];
  for (let i = 1; i < sortedLines.length; i++) {
    const gap = (sortedLines[i].y || 0) - (sortedLines[i - 1].y || 0);
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  
  if (gaps.length < 2) {
    return {
      hasRegularGapPattern: false,
      avgGap: gaps.length > 0 ? gaps[0] : 0,
      gapCV: 1,
      isSmallRegularGaps: false
    };
  }
  
  // Calculate statistics
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  const gapStdDev = Math.sqrt(gapVariance);
  const gapCV = avgGap > 0 ? gapStdDev / avgGap : 1; // Coefficient of variation
  
  // Paragraphs have regular gaps (low CV) and small gaps (< 2x font size)
  const isSmallRegularGaps = gapCV < TABLE_DETECTION.GAP_CV_THRESHOLD && 
                              avgGap < baseFontSize * TABLE_DETECTION.GAP_SIZE_MULTIPLIER;
  
  return {
    hasRegularGapPattern: isSmallRegularGaps,
    avgGap,
    gapCV,
    isSmallRegularGaps
  };
}

/**
 * Get graphics data for a specific page
 * Safe accessor with null checks
 * 
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {number} pageNum - Page number
 * @returns {Object|null} Graphics data or null
 */
export function getGraphicsDataForPage(metrics, pageNum) {
  if (!metrics || !metrics.graphicsData || typeof pageNum !== 'number') {
    return null;
  }
  return metrics.graphicsData[pageNum] || null;
}

