// @ts-check
// Helper functions for column detection
// Extracted from detectColumnsByXClustering to improve readability

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { DEFAULT_METRICS } from '../constants.js';
import { calculateStatistics } from '../utils/statistics.js';
import { calculateAverage } from '../utils/array-helpers.js';

/**
 * Analyze vertical structure of X-clusters
 * Identifies large vertical gaps that might indicate column breaks
 * 
 * @param {Array} xClusters - X-coordinate clusters
 * @param {Array} lines - All lines
 * @param {number} xTolerance - X tolerance for matching lines to clusters
 * @returns {Array} Cluster data with vertical gap analysis
 */
export function analyzeVerticalStructure(xClusters, lines, xTolerance) {
  log(`[PDF v3] analyzeVerticalStructure: === ANALYZING VERTICAL STRUCTURE ===`);
  
  const clusterLines = xClusters.map((cluster, clusterIdx) => {
    const clusterX = cluster[0].x;
    const linesInCluster = lines.filter(line => {
      const lineX = line.x || 0;
      return Math.abs(lineX - clusterX) <= xTolerance;
    });
    
    linesInCluster.sort((a, b) => (a.y || 0) - (b.y || 0));
    
    return {
      clusterIdx,
      clusterX,
      lines: linesInCluster,
      lineCount: linesInCluster.length
    };
  });
  
  // Analyze vertical gaps within each cluster
  for (const clusterData of clusterLines) {
    if (clusterData.lines.length < 2) continue;
    
    const verticalGaps = [];
    for (let i = 0; i < clusterData.lines.length - 1; i++) {
      const current = clusterData.lines[i];
      const next = clusterData.lines[i + 1];
      const gap = (next.y || 0) - (current.y || 0);
      verticalGaps.push({
        gap,
        lineIndex: i,
        currentY: current.y || 0,
        nextY: next.y || 0
      });
    }
    
    const gapValues = verticalGaps.map(g => g.gap);
    const avgVerticalGap = calculateAverage(gapValues);
    const largeGapThreshold = avgVerticalGap * 3;
    const largeGaps = verticalGaps.filter(g => g.gap >= largeGapThreshold);
    
    log(`[PDF v3] analyzeVerticalStructure: X-cluster [${clusterData.clusterIdx}] - totalLines=${clusterData.lines.length}, avgVerticalGap=${avgVerticalGap.toFixed(2)}, largeGaps=${largeGaps.length}`);
    
    if (largeGaps.length > 0) {
      for (const largeGap of largeGaps) {
        log(`[PDF v3] analyzeVerticalStructure: Large vertical gap at Y=${largeGap.currentY.toFixed(2)}, gap=${largeGap.gap.toFixed(2)}`);
      }
    }
  }
  
  return clusterLines;
}

/**
 * Analyze horizontal gaps between X-clusters
 * 
 * @param {Array} xClusters - X-coordinate clusters
 * @param {Array} clusterLines - Cluster data with lines
 * @param {number} baseFontSize - Base font size
 * @returns {Object} Gap analysis results
 */
export function analyzeHorizontalGaps(xClusters, clusterLines, baseFontSize) {
  const sortedClusters = [...xClusters].sort((a, b) => a[0].x - b[0].x);
  const clusterGaps = [];
  
  for (let i = 0; i < sortedClusters.length - 1; i++) {
    const currentCluster = sortedClusters[i];
    const nextCluster = sortedClusters[i + 1];
    const currentMaxX = Math.max(...currentCluster.map(c => c.x));
    const nextMinX = Math.min(...nextCluster.map(c => c.x));
    const gap = nextMinX - currentMaxX;
    
    const currentClusterLines = clusterLines.find(c => c.clusterX === currentCluster[0].x)?.lines || [];
    const nextClusterLines = clusterLines.find(c => c.clusterX === nextCluster[0].x)?.lines || [];
    
    let verticalOverlap = 0;
    if (currentClusterLines.length > 0 && nextClusterLines.length > 0) {
      const currentMinY = Math.min(...currentClusterLines.map(l => l.y || 0));
      const currentMaxY = Math.max(...currentClusterLines.map(l => l.y || 0));
      const nextMinY = Math.min(...nextClusterLines.map(l => l.y || 0));
      const nextMaxY = Math.max(...nextClusterLines.map(l => l.y || 0));
      
      const overlapStart = Math.max(currentMinY, nextMinY);
      const overlapEnd = Math.min(currentMaxY, nextMaxY);
      verticalOverlap = Math.max(0, overlapEnd - overlapStart);
    }
    
    clusterGaps.push({
      gap,
      clusterIndex1: i,
      clusterIndex2: i + 1,
      currentMaxX,
      nextMinX,
      verticalOverlap,
      hasVerticalOverlap: verticalOverlap > baseFontSize * 1.5
    });
  }
  
  log(`[PDF v3] analyzeHorizontalGaps: Analyzing ${clusterGaps.length} cluster pairs`);
  
  // Find significant gaps using statistical approach
  const gapValues = clusterGaps.map(g => g.gap).filter(g => g > 0);
  const gapStats = calculateStatistics(gapValues);
  const { median: medianGap, percentile75, percentile90, avg: avgGap } = gapStats;
  
  const statisticalThreshold = Math.max(
    percentile90 * 0.8,
    percentile75 * 1.3,
    medianGap * 2.5,
    avgGap * 2.0
  );
  const traditionalThreshold = baseFontSize * 2.5;
  const minGapForColumnSeparation = Math.max(statisticalThreshold, traditionalThreshold);
  
  log(`[PDF v3] analyzeHorizontalGaps: Threshold=${minGapForColumnSeparation.toFixed(2)}, median=${medianGap.toFixed(2)}, p75=${percentile75.toFixed(2)}, p90=${percentile90.toFixed(2)}`);
  
  const significantGaps = clusterGaps.filter(g => {
    const isLargeEnough = g.gap >= minGapForColumnSeparation;
    const isStatisticalOutlier = g.gap >= percentile90 * 0.8 && g.gap > avgGap * 2.5;
    const hasNoVerticalOverlap = !g.hasVerticalOverlap;
    const isAboveAverage = g.gap > avgGap * 2.0;
    const isAboveMedian = g.gap > medianGap * 2.0;
    
    return (isLargeEnough && hasNoVerticalOverlap) || isStatisticalOutlier || (isAboveAverage && isAboveMedian);
  });
  
  log(`[PDF v3] analyzeHorizontalGaps: Found ${significantGaps.length} significant gaps`);
  
  return {
    clusterGaps,
    significantGaps,
    minGapForColumnSeparation,
    gapStats
  };
}

/**
 * Calculate line right position (rightmost X coordinate)
 * 
 * @param {{x?: number, y?: number, width?: number, [key: string]: any}} line - Line object
 * @param {number} baseFontSize - Base font size for estimation
 * @returns {number} Rightmost X coordinate
 */
export function calculateLineRight(line, baseFontSize) {
  let lineRight = line.x || 0;
  
  if (line.items && Array.isArray(line.items)) {
    for (const item of line.items) {
      const itemRight = (item.x || 0) + (item.width || 0);
      if (itemRight > lineRight) {
        lineRight = itemRight;
      }
    }
  } else {
    const estimatedWidth = (line.text || '').length * (baseFontSize * 0.6);
    lineRight = (line.x || 0) + estimatedWidth;
  }
  
  return lineRight;
}

/**
 * Recalculate column boundaries using conservative percentile approach
 * 
 * @param {Array} columnCandidates - Column candidates
 * @param {number} baseFontSize - Base font size
 */
export function recalculateColumnBoundaries(columnCandidates, baseFontSize) {
  for (const column of columnCandidates) {
    if (column.lines.length === 0) continue;
    
    const columnXCoords = column.lines.map(l => l.x || 0);
    const minX = Math.min(...columnXCoords);
    
    const lineRightPositions = column.lines.map(line => calculateLineRight(line, baseFontSize));
    lineRightPositions.sort((a, b) => a - b);
    const percentile90Index = Math.floor(lineRightPositions.length * 0.9);
    const maxX = lineRightPositions[percentile90Index] || lineRightPositions[lineRightPositions.length - 1];
    
    const margin = baseFontSize * 0.5;
    const adjustedMaxX = maxX + margin;
    const newWidth = adjustedMaxX - minX;
    
    column.x = minX;
    column.maxX = adjustedMaxX;
    column.width = newWidth;
    
    log(`[PDF v3] recalculateColumnBoundaries: Column - x=${minX.toFixed(2)}, maxX=${adjustedMaxX.toFixed(2)}, width=${newWidth.toFixed(2)}, lineCount=${column.lines.length}`);
  }
}

/**
 * Calculate vertical proximity score for a line relative to column lines
 * 
 * @param {{x?: number, y?: number, width?: number, [key: string]: any}} line - Line to score
 * @param {Array} columnLines - Lines already in column
 * @param {number} baseFontSize - Base font size
 * @returns {number} Vertical proximity score (0-1)
 */
export function calculateVerticalProximityScore(line, columnLines, baseFontSize) {
  if (columnLines.length === 0) return 0.5;
  
  const lineY = line.y || 0;
  let minVerticalDistance = Infinity;
  
  for (const colLine of columnLines) {
    const colLineY = colLine.y || 0;
    const verticalDistance = Math.abs(lineY - colLineY);
    if (verticalDistance < minVerticalDistance) {
      minVerticalDistance = verticalDistance;
    }
  }
  
  if (minVerticalDistance <= baseFontSize * 3) {
    return 1.0;
  } else if (minVerticalDistance <= baseFontSize * 10) {
    return 0.7;
  } else {
    return 0.3;
  }
}

/**
 * Create column candidates from X-clusters
 * 
 * @param {Array} xClusters - X-coordinate clusters
 * @param {Array} lines - All lines
 * @param {number} xTolerance - X tolerance
 * @param {number} baseFontSize - Base font size
 * @param {number} minLinesPerColumn - Minimum lines per column
 * @returns {Array} Column candidates
 */
export function createColumnCandidates(xClusters, lines, xTolerance, baseFontSize, minLinesPerColumn) {
  const columnCandidates = [];
  
  for (let clusterIdx = 0; clusterIdx < xClusters.length; clusterIdx++) {
    const cluster = xClusters[clusterIdx];
    const clusterX = cluster[0].x;
    
    log(`[PDF v3] createColumnCandidates: Processing X-cluster [${clusterIdx}] - clusterX=${clusterX.toFixed(2)}`);
    
    const candidateLines = lines.filter(line => {
      const lineX = line.x || 0;
      return Math.abs(lineX - clusterX) <= xTolerance;
    });
    
    candidateLines.sort((a, b) => (a.y || 0) - (b.y || 0));
    
    const verticalGaps = [];
    for (let i = 0; i < candidateLines.length - 1; i++) {
      const gap = (candidateLines[i + 1].y || 0) - (candidateLines[i].y || 0);
      verticalGaps.push(gap);
    }
    const avgVerticalGap = calculateAverage(verticalGaps);
    const maxVerticalGap = verticalGaps.length > 0 ? Math.max(...verticalGaps) : 0;
    
    if (maxVerticalGap > avgVerticalGap * 5 && avgVerticalGap > 0) {
      log(`[PDF v3] createColumnCandidates: WARNING - Very large vertical gap (${maxVerticalGap.toFixed(2)} vs avg ${avgVerticalGap.toFixed(2)})`);
    }
    
    if (candidateLines.length >= minLinesPerColumn) {
      const columnXCoords = candidateLines.map(l => l.x || 0);
      const minX = Math.min(...columnXCoords);
      
      const lineRightPositions = candidateLines.map(line => calculateLineRight(line, baseFontSize));
      lineRightPositions.sort((a, b) => a - b);
      const percentile90Index = Math.floor(lineRightPositions.length * 0.9);
      const maxX = lineRightPositions[percentile90Index] || lineRightPositions[lineRightPositions.length - 1];
      
      const margin = baseFontSize * 0.5;
      const adjustedMaxX = maxX + margin;
      const width = adjustedMaxX - minX;
      
      columnCandidates.push({
        x: minX,
        width: width,
        maxX: adjustedMaxX,
        centerX: clusterX,
        lines: [],
        lineCount: 0
      });
      
      log(`[PDF v3] createColumnCandidates: Created column candidate - x=${minX.toFixed(2)}, width=${width.toFixed(2)}, lineCount=${candidateLines.length}`);
    }
  }
  
  log(`[PDF v3] createColumnCandidates: Created ${columnCandidates.length} column candidates`);
  return columnCandidates;
}

/**
 * Assign lines to columns based on overlap and vertical proximity
 * 
 * @param {Array} lines - All lines
 * @param {Array} columnCandidates - Column candidates
 * @param {Array} clusterLines - Cluster data with lines
 * @param {number} xTolerance - X tolerance
 * @param {number} baseFontSize - Base font size
 * @returns {Map} Map of line to column assignment
 */
export function assignLinesToColumns(lines, columnCandidates, clusterLines, xTolerance, baseFontSize) {
  const lineToColumn = new Map();
  
  for (const line of lines) {
    const lineX = line.x || 0;
    const lineY = line.y || 0;
    const lineRight = calculateLineRight(line, baseFontSize);
    const lineWidth = lineRight - lineX;
    
    let bestColumn = null;
    let bestScore = -1;
    
    for (const column of columnCandidates) {
      const columnMaxX = column.maxX || (column.x + column.width);
      const overlapStart = Math.max(lineX, column.x);
      const overlapEnd = Math.min(lineRight, columnMaxX);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      
      const overlapRatio = lineWidth > 0 ? overlap / lineWidth : 0;
      const columnWidth = columnMaxX - column.x;
      const columnOverlapRatio = columnWidth > 0 ? overlap / columnWidth : 0;
      
      // Get column lines for vertical proximity calculation
      const assignedLines = Array.from(lineToColumn.entries())
        .filter(([l, col]) => col === column)
        .map(([l]) => l);
      
      let columnLines = assignedLines;
      if (columnLines.length === 0) {
        const clusterData = clusterLines.find(c => Math.abs(c.clusterX - column.centerX) < xTolerance);
        if (clusterData) {
          columnLines = clusterData.lines;
        }
      }
      
      const verticalProximityScore = calculateVerticalProximityScore(line, columnLines, baseFontSize);
      
      const horizontalScore = overlapRatio * 0.7 + columnOverlapRatio * 0.3;
      const combinedScore = horizontalScore * 0.7 + verticalProximityScore * 0.3;
      
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestColumn = column;
      }
    }
    
    if (bestColumn && bestScore >= 0.40) {
      lineToColumn.set(line, bestColumn);
    }
  }
  
  return lineToColumn;
}

