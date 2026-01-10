// @ts-check
// Preliminary column detector - quick column detection at items level
// Used to improve item-to-line grouping by preventing items from different columns
// from being grouped into the same line

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { clusterObjects } from '../core/clustering.js';
import { CLUSTERING, DEFAULT_METRICS } from '../constants.js';
import { calculateGapStatistics } from '../utils/statistics.js';

/**
 * Quick preliminary column detection at items level
 * This is a fast analysis to identify approximate column boundaries
 * before grouping items into lines
 * 
 * Algorithm:
 * 1. Cluster X-coordinates of items (leftmost position)
 * 2. Identify significant gaps between clusters
 * 3. Return approximate column boundaries
 * 
 * @param {Array} items - Array of text items with x, y, width properties
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Array} Array of approximate column boundaries { x, maxX } or empty array
 */
export function detectPreliminaryColumns(items, viewport, metrics = {}) {
  if (!items || items.length === 0) {
    return [];
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  
  log(`[PDF v3] detectPreliminaryColumns: Starting preliminary column detection - totalItems=${items.length}, baseFontSize=${baseFontSize}`);
  
  // Step 1: Collect X-coordinates (leftmost position of each item)
  const xCoordinates = items.map(item => item.x || 0).filter(x => x >= 0 && isFinite(x));
  
  if (xCoordinates.length === 0) {
    log('[PDF v3] detectPreliminaryColumns: No valid X-coordinates found');
    return [];
  }
  
  // Step 2: CRITICAL - Statistical analysis of X-coordinate distribution
  // This helps identify natural column boundaries even if clustering fails
  const gapStats = calculateGapStatistics(xCoordinates);
  const { gaps: xGaps, avg: avgGap, median: medianGap, percentile75, percentile90, max: maxGap } = gapStats;
  
  log(`[PDF v3] detectPreliminaryColumns: X-coordinate gap statistics - totalGaps=${xGaps.length}, avgGap=${avgGap.toFixed(2)}, medianGap=${medianGap.toFixed(2)}, p75=${percentile75.toFixed(2)}, p90=${percentile90.toFixed(2)}, maxGap=${maxGap.toFixed(2)}`);
  
  // Step 3: CRITICAL - Use DIRECT DISTRIBUTION ANALYSIS instead of clustering
  // Clustering can fail if tolerance is too large (all items in one cluster)
  // Instead, analyze the distribution directly to find natural column boundaries
  
  // Find natural "modes" in X-coordinate distribution
  // A mode is a range where many items cluster together
  // Gaps between modes indicate column boundaries
  
  log(`[PDF v3] detectPreliminaryColumns: === DIRECT DISTRIBUTION ANALYSIS ===`);
  
  // Use a small bin size to identify modes (clusters of X-coordinates)
  // Bin size should be small enough to separate columns but large enough to group items in same column
  const binSize = Math.max(5, baseFontSize * 0.3); // 0.3x font size, minimum 5px
  const minX = Math.min(...xCoordinates);
  const maxX = Math.max(...xCoordinates);
  const numBins = Math.ceil((maxX - minX) / binSize);
  
  log(`[PDF v3] detectPreliminaryColumns: Distribution analysis - binSize=${binSize.toFixed(2)}, numBins=${numBins}, xRange=[${minX.toFixed(2)}, ${maxX.toFixed(2)}]`);
  
  // Count items in each bin
  const bins = Array(numBins).fill(0);
  for (const x of xCoordinates) {
    const binIdx = Math.floor((x - minX) / binSize);
    if (binIdx >= 0 && binIdx < numBins) {
      bins[binIdx]++;
    }
  }
  
  // Find dense bins (modes) - bins with significantly more items than average
  const avgItemsPerBin = xCoordinates.length / numBins;
  const denseThreshold = Math.max(3, avgItemsPerBin * 0.5); // At least 50% of average or 3 items
  const denseBins = [];
  
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] >= denseThreshold) {
      const binX = minX + (i + 0.5) * binSize;
      denseBins.push({
        binIdx: i,
        x: binX,
        count: bins[i],
        xStart: minX + i * binSize,
        xEnd: minX + (i + 1) * binSize
      });
    }
  }
  
  log(`[PDF v3] detectPreliminaryColumns: Found ${denseBins.length} dense bins (modes) out of ${numBins} total bins, denseThreshold=${denseThreshold.toFixed(2)}, avgItemsPerBin=${avgItemsPerBin.toFixed(2)}`);
  
  // Group adjacent dense bins into clusters (modes)
  const modes = [];
  let currentMode = null;
  
  for (const bin of denseBins) {
    if (currentMode === null) {
      currentMode = {
        bins: [bin],
        xStart: bin.xStart,
        xEnd: bin.xEnd,
        totalCount: bin.count
      };
    } else {
      // Check if bin is adjacent to current mode (within 2 bins)
      const gap = bin.xStart - currentMode.xEnd;
      if (gap <= binSize * 2) {
        // Adjacent - extend current mode
        currentMode.bins.push(bin);
        currentMode.xEnd = bin.xEnd;
        currentMode.totalCount += bin.count;
      } else {
        // Gap found - save current mode and start new one
        modes.push(currentMode);
        currentMode = {
          bins: [bin],
          xStart: bin.xStart,
          xEnd: bin.xEnd,
          totalCount: bin.count
        };
      }
    }
  }
  if (currentMode !== null) {
    modes.push(currentMode);
  }
  
  log(`[PDF v3] detectPreliminaryColumns: Grouped into ${modes.length} modes (column candidates)`);
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    log(`[PDF v3] detectPreliminaryColumns: Mode ${i + 1} - xRange=[${mode.xStart.toFixed(2)}, ${mode.xEnd.toFixed(2)}], width=${(mode.xEnd - mode.xStart).toFixed(2)}, itemCount=${mode.totalCount}, binCount=${mode.bins.length}`);
  }
  
  // Convert modes to clusters for compatibility with existing gap analysis code
  const xClusters = modes.map((mode, idx) => {
    // Find all items that fall within this mode's X-range
    const itemsInMode = xCoordinates
      .map((x, itemIdx) => ({ x, itemIndex: itemIdx }))
      .filter(obj => obj.x >= mode.xStart && obj.x <= mode.xEnd);
    return itemsInMode;
  }).filter(cluster => cluster.length > 0);
  
  log(`[PDF v3] detectPreliminaryColumns: Converted ${modes.length} modes to ${xClusters.length} X-clusters`);
  
  // CRITICAL: Even if we have only 1 cluster, we should still analyze gaps
  // A single cluster might contain items from multiple columns if tolerance is too large
  // We'll analyze gaps between items within clusters to find column boundaries
  
  // Step 5: CRITICAL - Analyze gaps between clusters AND within clusters
  // Even if we have only 1 cluster, we should analyze gaps between items
  // to find column boundaries within the cluster
  const sortedClusters = [...xClusters].sort((a, b) => a[0].x - b[0].x);
  const clusterGaps = [];
  
  // Analyze gaps between clusters
  for (let i = 0; i < sortedClusters.length - 1; i++) {
    const currentCluster = sortedClusters[i];
    const nextCluster = sortedClusters[i + 1];
    
    // Find items in these clusters to calculate boundaries
    const currentClusterItems = currentCluster.map(c => items[c.itemIndex]).filter(Boolean);
    const nextClusterItems = nextCluster.map(c => items[c.itemIndex]).filter(Boolean);
    
    if (currentClusterItems.length === 0 || nextClusterItems.length === 0) continue;
    
    // Calculate maxX for current cluster and minX for next cluster
    let currentMaxX = 0;
    for (const item of currentClusterItems) {
      const itemRight = (item.x || 0) + (item.width || 0);
      if (itemRight > currentMaxX) currentMaxX = itemRight;
    }
    
    const nextMinX = Math.min(...nextClusterItems.map(item => item.x || 0));
    const gap = nextMinX - currentMaxX;
    
    clusterGaps.push({
      gap,
      clusterIndex1: i,
      clusterIndex2: i + 1,
      currentMaxX,
      nextMinX,
      currentClusterX: currentCluster[0].x,
      nextClusterX: nextCluster[0].x,
      isBetweenClusters: true
    });
  }
  
  // CRITICAL: Also analyze gaps WITHIN clusters (if cluster is too large, it might contain multiple columns)
  for (let i = 0; i < sortedClusters.length; i++) {
    const cluster = sortedClusters[i];
    if (cluster.length < 2) continue; // Need at least 2 items to have gaps
    
    const clusterItems = cluster.map(c => items[c.itemIndex]).filter(Boolean);
    if (clusterItems.length < 2) continue;
    
    // Sort items by X-coordinate
    clusterItems.sort((a, b) => (a.x || 0) - (b.x || 0));
    
    // Analyze gaps between items in this cluster
    for (let j = 0; j < clusterItems.length - 1; j++) {
      const currentItem = clusterItems[j];
      const nextItem = clusterItems[j + 1];
      const currentItemRight = (currentItem.x || 0) + (currentItem.width || 0);
      const nextItemLeft = nextItem.x || 0;
      const gap = nextItemLeft - currentItemRight;
      
      if (gap > 0) {
        clusterGaps.push({
          gap,
          clusterIndex1: i,
          clusterIndex2: i,
          currentMaxX: currentItemRight,
          nextMinX: nextItemLeft,
          currentClusterX: currentItem.x || 0,
          nextClusterX: nextItem.x || 0,
          isBetweenClusters: false,
          isWithinCluster: true
        });
      }
    }
  }
  
  log(`[PDF v3] detectPreliminaryColumns: Analyzed ${clusterGaps.length} gaps total (${clusterGaps.filter(g => g.isBetweenClusters).length} between clusters, ${clusterGaps.filter(g => g.isWithinCluster).length} within clusters)`);
  
  // Step 6: Find significant gaps using STATISTICAL approach
  // Based on pdfplumber analysis: they use simple clustering, we use statistical analysis
  // CRITICAL: Use MORE AGGRESSIVE thresholds to catch column gaps
  // Column gaps are typically much larger than gaps within columns
  // IMPROVED: Based on pdfplumber's DEFAULT_X_TOLERANCE=3, we should be more sensitive
  const gapThreshold = Math.max(
    percentile90 * 0.7,  // 70% of 90th percentile (more aggressive - was 0.8)
    percentile75 * 1.3,  // 1.3x 75th percentile (more aggressive - was 1.5)
    medianGap * 2.0,  // 2x median gap (more aggressive - was 2.5)
    avgGap * 1.8,  // 1.8x average gap (more aggressive - was 2.0)
    baseFontSize * 1.2  // 1.2x font size (more aggressive - was 1.5, pdfplumber uses 3px default)
  );
  
  // Also consider: if maxGap is significantly larger than average, it's likely a column gap
  // IMPROVED: More aggressive detection based on pdfplumber's approach
  const isMaxGapSignificant = maxGap > avgGap * 2.5 && maxGap > baseFontSize * 1.2;
  
  log(`[PDF v3] detectPreliminaryColumns: Gap threshold analysis - percentile90=${percentile90.toFixed(2)}, percentile75*2=${(percentile75 * 2).toFixed(2)}, median*3=${(medianGap * 3).toFixed(2)}, baseFontSize*2=${(baseFontSize * 2).toFixed(2)}, finalThreshold=${gapThreshold.toFixed(2)}, isMaxGapSignificant=${isMaxGapSignificant}, maxGap=${maxGap.toFixed(2)}`);
  
  const significantGaps = clusterGaps.filter(g => g.gap >= gapThreshold);
  
  // CRITICAL: If maxGap is very significant, include it even if it doesn't meet threshold
  // This handles cases where there's one very large gap (clear column separation)
  // IMPROVED: More aggressive - based on pdfplumber's simple approach, we should catch obvious gaps
  if (isMaxGapSignificant && maxGap > gapThreshold * 0.5) {
    const maxGapInfo = clusterGaps.find(g => g.gap === maxGap);
    if (maxGapInfo && !significantGaps.includes(maxGapInfo)) {
      significantGaps.push(maxGapInfo);
      log(`[PDF v3] detectPreliminaryColumns: Added maxGap to significant gaps (very significant gap found: ${maxGap.toFixed(2)} >= ${(gapThreshold * 0.6).toFixed(2)})`);
    }
  }
  
  // CRITICAL: Also check for gaps between modes (from direct distribution analysis)
  // These gaps are more reliable than cluster gaps because they're based on actual distribution
  if (modes.length >= 2) {
    log(`[PDF v3] detectPreliminaryColumns: === ANALYZING GAPS BETWEEN MODES ===`);
    for (let i = 0; i < modes.length - 1; i++) {
      const currentMode = modes[i];
      const nextMode = modes[i + 1];
      const gapBetweenModes = nextMode.xStart - currentMode.xEnd;
      
      log(`[PDF v3] detectPreliminaryColumns: Gap between mode ${i + 1} and ${i + 2} - gap=${gapBetweenModes.toFixed(2)}, currentModeEnd=${currentMode.xEnd.toFixed(2)}, nextModeStart=${nextMode.xStart.toFixed(2)}`);
      
      // If gap is significant, add it to significantGaps
      if (gapBetweenModes >= gapThreshold) {
        // Find or create gap info
        const existingGap = clusterGaps.find(g => 
          Math.abs(g.currentMaxX - currentMode.xEnd) < binSize &&
          Math.abs(g.nextMinX - nextMode.xStart) < binSize
        );
        
        if (existingGap) {
          if (!significantGaps.includes(existingGap)) {
            significantGaps.push(existingGap);
            log(`[PDF v3] detectPreliminaryColumns: Added mode gap to significant gaps (existing gap found)`);
          }
        } else {
          // Create new gap info
          const modeGapInfo = {
            gap: gapBetweenModes,
            clusterIndex1: i,
            clusterIndex2: i + 1,
            currentMaxX: currentMode.xEnd,
            nextMinX: nextMode.xStart,
            currentClusterX: currentMode.xStart,
            nextClusterX: nextMode.xStart,
            isBetweenClusters: true,
            isFromModeAnalysis: true
          };
          clusterGaps.push(modeGapInfo);
          significantGaps.push(modeGapInfo);
          log(`[PDF v3] detectPreliminaryColumns: Created new mode gap info - gap=${gapBetweenModes.toFixed(2)}, threshold=${gapThreshold.toFixed(2)}`);
        }
      }
    }
  }
  
  log(`[PDF v3] detectPreliminaryColumns: === SIGNIFICANT GAP ANALYSIS ===`);
  log(`[PDF v3] detectPreliminaryColumns: Found ${significantGaps.length} significant gaps (>= ${gapThreshold.toFixed(2)}) out of ${clusterGaps.length} total gaps`);
  
  // Log all significant gaps
  for (let i = 0; i < significantGaps.length; i++) {
    const gap = significantGaps[i];
    const isFromModeAnalysis = 'isFromModeAnalysis' in gap ? gap.isFromModeAnalysis : false;
    log(`[PDF v3] detectPreliminaryColumns: Significant gap ${i + 1} - gap=${gap.gap.toFixed(2)}, currentMaxX=${gap.currentMaxX.toFixed(2)}, nextMinX=${gap.nextMinX.toFixed(2)}, isBetweenClusters=${gap.isBetweenClusters}, isWithinCluster=${gap.isWithinCluster || false}, isFromModeAnalysis=${isFromModeAnalysis}`);
  }
  
  if (significantGaps.length === 0) {
    log(`[PDF v3] detectPreliminaryColumns: No significant gaps found - trying fallback: using maxGap if very large`);
    log(`[PDF v3] detectPreliminaryColumns: Fallback check - maxGap=${maxGap.toFixed(2)}, avgGap=${avgGap.toFixed(2)}, baseFontSize=${baseFontSize.toFixed(2)}, isMaxGapSignificant=${isMaxGapSignificant}, threshold=${gapThreshold.toFixed(2)}`);
    
    // Fallback: if maxGap is very large (>= 3x avgGap and >= 1.5x baseFontSize), use it
    if (isMaxGapSignificant) {
      const maxGapInfo = clusterGaps.find(g => g.gap === maxGap);
      if (maxGapInfo) {
        significantGaps.push(maxGapInfo);
        log(`[PDF v3] detectPreliminaryColumns: Fallback: Using maxGap as significant gap (maxGap=${maxGap.toFixed(2)}, avgGap=${avgGap.toFixed(2)}, baseFontSize=${baseFontSize.toFixed(2)})`);
      } else {
        log(`[PDF v3] detectPreliminaryColumns: WARNING - maxGap is significant but gap info not found in clusterGaps`);
      }
    }
    
    if (significantGaps.length === 0) {
      log(`[PDF v3] detectPreliminaryColumns: === NO COLUMNS DETECTED ===`);
      log(`[PDF v3] detectPreliminaryColumns: No significant gaps found even with fallback - likely single column layout`);
      log(`[PDF v3] detectPreliminaryColumns: Statistics - totalGaps=${xGaps.length}, avgGap=${avgGap.toFixed(2)}, medianGap=${medianGap.toFixed(2)}, p75=${percentile75.toFixed(2)}, p90=${percentile90.toFixed(2)}, maxGap=${maxGap.toFixed(2)}, gapThreshold=${gapThreshold.toFixed(2)}`);
      log(`[PDF v3] detectPreliminaryColumns: Modes found - ${modes.length} modes, X-clusters=${xClusters.length}`);
      return [];
    }
  }
  
  // Step 6: Create preliminary column boundaries
  // Use cluster centers and gaps to define approximate boundaries
  const preliminaryColumns = [];
  
  // First column starts at leftmost cluster
  let columnStartX = sortedClusters[0][0].x;
  
  for (let i = 0; i < significantGaps.length; i++) {
    const gap = significantGaps[i];
    const columnEndX = (gap.currentMaxX + gap.nextMinX) / 2; // Midpoint of gap
    
    preliminaryColumns.push({
      x: columnStartX,
      maxX: columnEndX,
      width: columnEndX - columnStartX,
      clusterIndex: i
    });
    
    columnStartX = columnEndX;
  }
  
  // Last column ends at rightmost cluster
  const lastCluster = sortedClusters[sortedClusters.length - 1];
  const lastClusterItems = lastCluster.map(c => items[c.itemIndex]).filter(Boolean);
  let lastMaxX = 0;
  for (const item of lastClusterItems) {
    const itemRight = (item.x || 0) + (item.width || 0);
    if (itemRight > lastMaxX) lastMaxX = itemRight;
  }
  
  preliminaryColumns.push({
    x: columnStartX,
    maxX: lastMaxX,
    width: lastMaxX - columnStartX,
    clusterIndex: significantGaps.length
  });
  
  log(`[PDF v3] detectPreliminaryColumns: === PRELIMINARY COLUMNS CREATED ===`);
  log(`[PDF v3] detectPreliminaryColumns: Created ${preliminaryColumns.length} preliminary columns from ${significantGaps.length} significant gaps`);
  
  // Validate columns
  if (preliminaryColumns.length === 0) {
    log(`[PDF v3] detectPreliminaryColumns: WARNING - No preliminary columns created despite ${significantGaps.length} significant gaps found`);
    return [];
  }
  
  // Log each column with detailed info
  for (let i = 0; i < preliminaryColumns.length; i++) {
    const col = preliminaryColumns[i];
    const itemsInColumn = items.filter(item => {
      const itemX = item.x || 0;
      const itemRight = itemX + (item.width || 0);
      return itemX >= col.x && itemRight <= col.maxX;
    }).length;
    
    log(`[PDF v3] detectPreliminaryColumns: Preliminary column ${i + 1}/${preliminaryColumns.length} - x=${col.x.toFixed(2)}, maxX=${col.maxX.toFixed(2)}, width=${col.width.toFixed(2)}, estimatedItems=${itemsInColumn}, clusterIndex=${col.clusterIndex}`);
  }
  
  // Validate column boundaries (no overlap, reasonable gaps)
  if (preliminaryColumns.length > 1) {
    log(`[PDF v3] detectPreliminaryColumns: === VALIDATING COLUMN BOUNDARIES ===`);
    for (let i = 0; i < preliminaryColumns.length - 1; i++) {
      const col1 = preliminaryColumns[i];
      const col2 = preliminaryColumns[i + 1];
      const gap = col2.x - col1.maxX;
      log(`[PDF v3] detectPreliminaryColumns: Gap between column ${i + 1} and ${i + 2} - gap=${gap.toFixed(2)}, col1MaxX=${col1.maxX.toFixed(2)}, col2X=${col2.x.toFixed(2)}`);
      
      if (gap < 0) {
        log(`[PDF v3] detectPreliminaryColumns: WARNING - Columns ${i + 1} and ${i + 2} overlap! (gap=${gap.toFixed(2)})`);
      } else if (gap < baseFontSize * 1.0) {
        log(`[PDF v3] detectPreliminaryColumns: WARNING - Gap between columns ${i + 1} and ${i + 2} is very small (${gap.toFixed(2)} < ${(baseFontSize * 1.0).toFixed(2)}) - might be same column`);
      }
    }
  }
  
  return preliminaryColumns;
}

/**
 * Check if an item belongs to a preliminary column
 * 
 * @param {{x?: number, width?: number, [key: string]: any}} item - Text item with x, width properties
 * @param {{x?: number, maxX?: number, [key: string]: any}} column - Preliminary column with x, maxX properties
 * @returns {boolean} True if item overlaps with column
 */
export function itemBelongsToColumn(item, column) {
  const itemX = item.x || 0;
  const itemRight = itemX + (item.width || 0);
  
  // Item belongs to column if it overlaps significantly
  const overlapStart = Math.max(itemX, column.x);
  const overlapEnd = Math.min(itemRight, column.maxX);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const itemWidth = itemRight - itemX;
  
  // At least 50% of item should be in column
  return itemWidth > 0 && (overlap / itemWidth) >= 0.5;
}

