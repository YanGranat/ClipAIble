// @ts-check
// Helper functions for line grouping

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { calculateGapStatistics } from '../utils/statistics.js';
import { findColumnForItem } from '../utils/column-helpers.js';
import { collateLine } from './text-collation.js';

/**
 * Calculate statistics for a Y-cluster to determine column gap threshold
 * 
 * @param {Array} xSorted - Items sorted by X coordinate
 * @param {Array} preliminaryColumns - Optional preliminary column boundaries
 * @returns {Object} Statistics including threshold, font sizes, and item widths
 */
export function calculateClusterStatistics(xSorted, preliminaryColumns = []) {
  const xCoords = xSorted.map(item => item.x || 0);
  const gapStats = calculateGapStatistics(xCoords);
  const { gaps: xGaps, avg: avgGap, median: medianGap, percentile75, percentile90, max: maxGap } = gapStats;
  
  // Calculate average font size and item width
  let avgFontSize = 0;
  let avgItemWidth = 0;
  let maxItemWidth = 0;
  for (const item of xSorted) {
    const fontSize = item.fontSize || 12;
    const itemWidth = item.width || 0;
    avgFontSize += fontSize;
    avgItemWidth += itemWidth;
    if (itemWidth > maxItemWidth) maxItemWidth = itemWidth;
  }
  avgFontSize = xSorted.length > 0 ? avgFontSize / xSorted.length : 12;
  avgItemWidth = xSorted.length > 0 ? avgItemWidth / xSorted.length : 0;
  
  // Calculate statistical threshold
  const statisticalThreshold = Math.max(
    percentile90 * 0.7,  // 70% of 90th percentile
    percentile75 * 1.1,  // 1.1x 75th percentile
    medianGap * 1.8,  // 1.8x median gap
    avgGap * 1.6,  // 1.6x average gap
    avgFontSize * 1.0,  // 1.0x font size
    avgItemWidth * 1.3  // 1.3x avg item width
  );
  
  // Calculate adaptive threshold
  let columnGapThreshold = Math.max(30, Math.min(
    statisticalThreshold,
    Math.max(
      avgFontSize * 1.0,
      Math.max(avgItemWidth * 1.3, maxItemWidth * 0.9)
    )
  ));
  
  // If preliminary columns detected, use more aggressive threshold
  let usePreliminaryColumns = false;
  if (preliminaryColumns.length > 0) {
    usePreliminaryColumns = true;
    columnGapThreshold = Math.min(columnGapThreshold, Math.max(
      avgFontSize * 0.6,  // Very aggressive - 0.6x font size
      percentile75 * 0.7,  // 70% of 75th percentile
      avgGap * 1.0,  // 1.0x average gap
      10  // Minimum 10px gap
    ));
  }
  
  return {
    gapStats,
    avgGap,
    medianGap,
    percentile75,
    percentile90,
    maxGap,
    avgFontSize,
    avgItemWidth,
    maxItemWidth,
    columnGapThreshold,
    usePreliminaryColumns,
    statisticalThreshold
  };
}

/**
 * Split a Y-cluster into sub-clusters based on X-gaps
 * 
 * @param {Array<{x: number, [key: string]: any}>} xSorted - Items sorted by X coordinate
 * @param {{threshold: number, avgFontSize: number, avgItemWidth: number, [key: string]: any}} stats - Statistics from calculateClusterStatistics
 * @param {Array<{start: number, end: number}>} [preliminaryColumns] - Optional preliminary column boundaries
 * @param {number} clusterIdx - Cluster index for logging
 * @returns {Array<Array<any>>} Array of sub-clusters
 */
export function splitClusterByXGaps(xSorted, stats, preliminaryColumns = [], clusterIdx = 0) {
  const { avgGap, medianGap, percentile75, percentile90, avgItemWidth, avgFontSize, columnGapThreshold, usePreliminaryColumns } = stats;
  
  if (usePreliminaryColumns) {
    log(`[PDF v3] iterItemsToLines: Cluster [${clusterIdx}] - Using preliminary columns, lowered threshold to ${columnGapThreshold.toFixed(2)}`);
  }
  
  log(`[PDF v3] iterItemsToLines: Cluster [${clusterIdx}] - Gap statistics: avgGap=${avgGap.toFixed(2)}, medianGap=${medianGap.toFixed(2)}, p75=${percentile75.toFixed(2)}, p90=${percentile90.toFixed(2)}, columnGapThreshold=${columnGapThreshold.toFixed(2)}`);
  
  const xSubClusters = [];
  let currentSubCluster = [xSorted[0]];
  
  for (let i = 1; i < xSorted.length; i++) {
    const prevItem = xSorted[i - 1];
    const currentItem = xSorted[i];
    const prevItemEndX = (prevItem.x || 0) + (prevItem.width || 0);
    const currentItemStartX = currentItem.x || 0;
    const xGap = currentItemStartX - prevItemEndX;
    
    // Check if items belong to different preliminary columns
    let isDifferentPreliminaryColumn = false;
    if (usePreliminaryColumns) {
      const prevCol = findColumnForItem(prevItem, preliminaryColumns, 0.3);
      const currentCol = findColumnForItem(currentItem, preliminaryColumns, 0.3);
      
      if (prevCol && currentCol && prevCol !== currentCol) {
        isDifferentPreliminaryColumn = true;
        const prevColIdx = preliminaryColumns.indexOf(prevCol);
        const currentColIdx = preliminaryColumns.indexOf(currentCol);
        log(`[PDF v3] iterItemsToLines: Cluster [${clusterIdx}] - Items belong to different preliminary columns (prevColumn=${prevColIdx}, currentColumn=${currentColIdx})`);
      }
    }
    
    // Check if gap is significant
    const isLargeGap = xGap > columnGapThreshold;
    const isStatisticalOutlier = xGap > percentile90 * 0.7;
    const isVeryLargeGap = xGap > avgGap * 2.0 && xGap > medianGap * 2.5;
    const isSignificantGap = avgItemWidth > 0 && xGap > avgItemWidth * 1.3;
    const isRelativeGap = avgItemWidth > 0 && xGap > avgItemWidth * 1.0 && xGap > avgFontSize * 1.0;
    const isAboveAverage = xGap > avgGap * 1.3;
    const isAboveMedian = xGap > medianGap * 1.8;
    const isPdfplumberStyleGap = xGap > Math.max(3, avgFontSize * 0.25);
    
    // Split if gap is significant
    if (isDifferentPreliminaryColumn || isLargeGap || isStatisticalOutlier || isVeryLargeGap || isSignificantGap || isRelativeGap || isAboveAverage || isAboveMedian || isPdfplumberStyleGap) {
      if (currentSubCluster.length > 0) {
        xSubClusters.push(currentSubCluster);
        const reason = isDifferentPreliminaryColumn ? 'different preliminary columns' : 
                      (isStatisticalOutlier ? 'statistical outlier' :
                      (isVeryLargeGap ? 'very large gap' :
                      (isLargeGap ? 'large gap' : 
                      (isSignificantGap ? 'significant gap' :
                      (isRelativeGap ? 'relative gap' :
                      (isAboveAverage ? 'above average' :
                      (isAboveMedian ? 'above median' :
                      (isPdfplumberStyleGap ? 'pdfplumber-style gap' : 'unknown'))))))));
        log(`[PDF v3] iterItemsToLines: Cluster [${clusterIdx}] - Split into sub-cluster (X gap=${xGap.toFixed(2)}, threshold=${columnGapThreshold.toFixed(2)}, reason=${reason}), subClusterSize=${currentSubCluster.length}`);
      }
      currentSubCluster = [currentItem];
    } else {
      currentSubCluster.push(currentItem);
    }
  }
  
  // Add last sub-cluster
  if (currentSubCluster.length > 0) {
    xSubClusters.push(currentSubCluster);
  }
  
  if (xSubClusters.length > 1) {
    log(`[PDF v3] iterItemsToLines: Cluster [${clusterIdx}] - Split into ${xSubClusters.length} sub-clusters due to large X gaps (multi-column layout)`);
  }
  
  return xSubClusters;
}

/**
 * Create a line object from a sub-cluster of items
 * 
 * @param {Array} subCluster - Sub-cluster of items
 * @param {number} xTolerance - X tolerance for spacing
 * @param {number} lineIndex - Line index for logging
 * @returns {Object|null} Line object or null if empty
 */
export function createLineFromSubCluster(subCluster, xTolerance, lineIndex = 0) {
  // Collate items into line text
  const lineText = collateLine(subCluster, xTolerance);
  
  if (!lineText.trim()) {
    return null;
  }
  
  // Calculate line metadata
  let topY = Infinity;
  let bottomY = -Infinity;
  let leftmostX = Infinity;
  let hasBold = false;
  let hasItalic = false;
  let hasUnderlined = false;
  let maxFontSize = 0;
  
  for (const item of subCluster) {
    const itemY = item.y || 0;
    const itemHeight = item.height || item.fontSize || 0;
    
    if (itemY < topY) topY = itemY;
    if (itemY + itemHeight > bottomY) bottomY = itemY + itemHeight;
    if ((item.x || 0) < leftmostX) leftmostX = item.x || 0;
    if (item.isBold) hasBold = true;
    if (item.isItalic) hasItalic = true;
    if (item.isUnderlined) hasUnderlined = true;
    if ((item.fontSize || 0) > maxFontSize) maxFontSize = item.fontSize || 0;
  }
  
  // Fallback if no valid values
  if (topY === Infinity) topY = 0;
  if (bottomY === -Infinity) bottomY = topY;
  if (leftmostX === Infinity) leftmostX = 0;
  
  const lineObj = {
    text: lineText.trim(),
    y: topY,
    x: leftmostX,
    fontSize: maxFontSize,
    fontName: subCluster[0].fontName || '',
    isBold: hasBold,
    isItalic: hasItalic,
    isUnderlined: hasUnderlined,
    items: subCluster,
    hasEOL: subCluster[subCluster.length - 1].hasEOL !== undefined ? 
            subCluster[subCluster.length - 1].hasEOL : false,
    endsWithColon: lineText.trim().endsWith(':'),
    length: lineText.trim().length,
    pageNum: subCluster[0].pageNum || 1
  };
  
  log(`[PDF v3] iterItemsToLines: Created line [${lineIndex}] - y=${topY.toFixed(2)}, x=${leftmostX.toFixed(2)}, fontSize=${maxFontSize.toFixed(2)}, text="${lineText.trim().substring(0, 80)}", itemCount=${subCluster.length}`);
  
  return lineObj;
}


