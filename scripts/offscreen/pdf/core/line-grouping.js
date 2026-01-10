// @ts-check
// Line grouping - groups text items into lines using pdfplumber algorithm

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { clusterObjects } from './clustering.js';
import { calculateClusterStatistics, splitClusterByXGaps, createLineFromSubCluster } from './line-grouping-helpers.js';

/**
 * Group items into lines using pdfplumber algorithm
 * Ported from pdfplumber/utils/text.py:iter_chars_to_lines()
 * 
 * Algorithm:
 * 1. Group items by Y-coordinate using cluster_objects()
 * 2. For each Y-cluster:
 *    - Sort items by X coordinate
 *    - If preliminary columns detected, use them to improve separation
 *    - Split into sub-clusters if large X gaps detected (multi-column)
 *    - Collate items into line text using collate_line()
 *    - Calculate line metadata
 * 3. Sort lines by Y (top to bottom)
 * 
 * @param {Array} items - Array of text items with x, y, str, width properties
 * @param {number} xTolerance - X tolerance for spacing (default: 3)
 * @param {number} yTolerance - Y tolerance for line grouping (default: 3)
 * @param {Array} preliminaryColumns - Optional preliminary column boundaries from items-level analysis
 * @returns {Array} Array of line objects with text, y, items properties
 */
export function iterItemsToLines(items, xTolerance = 3, yTolerance = 3, preliminaryColumns = []) {
  if (items.length === 0) {
    log('[PDF v3] iterItemsToLines: No items to process');
    return [];
  }
  
  log(`[PDF v3] iterItemsToLines: Starting line grouping`, {
    totalItems: items.length,
    xTolerance,
    yTolerance,
    hasPreliminaryColumns: preliminaryColumns.length > 0
  });
  
  // CRITICAL: If preliminary columns detected, log them
  if (preliminaryColumns.length > 0) {
    log(`[PDF v3] iterItemsToLines: Using ${preliminaryColumns.length} preliminary columns to improve item separation`);
    for (let i = 0; i < preliminaryColumns.length; i++) {
      const col = preliminaryColumns[i];
      log(`[PDF v3] iterItemsToLines: Preliminary column ${i + 1} - x=${col.x.toFixed(2)}, maxX=${col.maxX.toFixed(2)}, width=${col.width.toFixed(2)}`);
    }
  }
  
  // Group items by Y-coordinate using cluster_objects
  const yClusters = clusterObjects(items, item => item.y, yTolerance, 'Y-coordinate line grouping');
  
  log(`[PDF v3] iterItemsToLines: Y-clusters created - totalClusters=${yClusters.length}`);
  
  const lines = [];
  
  let totalSubClusters = 0;
  for (let clusterIdx = 0; clusterIdx < yClusters.length; clusterIdx++) {
    const yCluster = yClusters[clusterIdx];
    
    // Sort items within cluster by X coordinate
    const xSorted = [...yCluster].sort((a, b) => a.x - b.x);
    
    // Calculate cluster statistics
    const stats = calculateClusterStatistics(xSorted, preliminaryColumns);
    
    // Split cluster into sub-clusters based on X-gaps
    const xSubClusters = splitClusterByXGaps(xSorted, stats, preliminaryColumns, clusterIdx);
    
    // Always use sub-clusters if they were created (even if only one)
    // This ensures consistent processing
    const clustersToProcess = xSubClusters.length > 0 ? xSubClusters : [xSorted];
    totalSubClusters += clustersToProcess.length;
    
    // Process each sub-cluster as a separate line
    for (let subIdx = 0; subIdx < clustersToProcess.length; subIdx++) {
      const subCluster = clustersToProcess[subIdx];
      
      // Create line from sub-cluster
      const lineObj = createLineFromSubCluster(subCluster, xTolerance, lines.length);
      if (lineObj) {
        lines.push(lineObj);
      }
    }
  }
  
  // Sort lines by Y (top to bottom)
  lines.sort((a, b) => a.y - b.y);
  
  // Log summary instead of all lines
  log(`[PDF v3] iterItemsToLines: Complete - totalLines=${lines.length}, yClusters=${yClusters.length}, subClusters=${totalSubClusters}, firstLines=[${lines.slice(0, 3).map(l => `"${(l.text || '').substring(0, 40)}"`).join(', ')}]`);
  
  return lines;
}

