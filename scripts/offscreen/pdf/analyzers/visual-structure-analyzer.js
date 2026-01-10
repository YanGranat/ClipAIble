// @ts-check
// Visual structure analyzer - analyzes visual structure of the page
// Finds empty vertical strips (gaps) between columns
// Distinguishes column gaps from paragraph gaps within columns

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { DEFAULT_METRICS } from '../constants.js';
import { calculateAverage } from '../utils/array-helpers.js';

/**
 * Analyze visual structure of the page to find empty vertical strips
 * These strips indicate column boundaries
 * 
 * Algorithm:
 * 1. Divide page into vertical strips (buckets) by X-coordinate
 * 2. For each strip, count how many lines pass through it
 * 3. Strips with very few lines are likely empty space between columns
 * 4. Find boundaries between dense strips (columns) and sparse strips (gaps)
 * 
 * @param {Array} lines - Array of line objects with x, y, items properties
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, gapThreshold?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Object} Visual structure analysis results
 */
export function analyzeVisualStructure(lines, viewport, metrics = {}) {
  if (!lines || lines.length === 0 || !viewport) {
    return {
      verticalStrips: [],
      columnGaps: [],
      columnBoundaries: []
    };
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const viewportWidth = viewport.width || 800;
  const viewportHeight = viewport.height || 600;
  
  log(`[PDF v3] analyzeVisualStructure: Starting visual structure analysis - totalLines=${lines.length}, viewportWidth=${viewportWidth.toFixed(2)}, viewportHeight=${viewportHeight.toFixed(2)}, baseFontSize=${baseFontSize.toFixed(2)}`);
  
  // Step 1: Divide page into vertical strips (buckets)
  // Use smaller bucket size for more precise analysis
  const bucketWidth = Math.max(10, baseFontSize * 0.5); // Bucket width = 0.5x font size (minimum 10px)
  const numBuckets = Math.ceil(viewportWidth / bucketWidth);
  
  log(`[PDF v3] analyzeVisualStructure: Dividing page into ${numBuckets} vertical strips - bucketWidth=${bucketWidth.toFixed(2)}px (0.5x font size, min 10px)`);
  
  // Step 2: For each bucket, analyze line coverage
  // Track: line count, total line width, Y-coverage (how much of page height has text)
  const buckets = Array(numBuckets).fill(null).map((_, i) => ({
    xStart: i * bucketWidth,
    xEnd: (i + 1) * bucketWidth,
    lineCount: 0,
    totalLineWidth: 0,
    yCoverage: new Set(), // Track Y positions where text exists
    lines: []
  }));
  
  // Analyze each line
  for (const line of lines) {
    const lineX = line.x || 0;
    const lineY = line.y || 0;
    
    // Calculate line width
    let lineWidth = 0;
    if (line.items && Array.isArray(line.items)) {
      let lineRight = lineX;
      for (const item of line.items) {
        const itemRight = (item.x || 0) + (item.width || 0);
        if (itemRight > lineRight) {
          lineRight = itemRight;
        }
      }
      lineWidth = lineRight - lineX;
    } else {
      // Estimate from text length
      const estimatedWidth = (line.text || '').length * (baseFontSize * 0.6);
      lineWidth = estimatedWidth;
    }
    
    const lineRight = lineX + lineWidth;
    
    // Find which buckets this line covers
    const startBucket = Math.floor(lineX / bucketWidth);
    const endBucket = Math.ceil(lineRight / bucketWidth);
    
    for (let bucketIdx = startBucket; bucketIdx < endBucket && bucketIdx < numBuckets; bucketIdx++) {
      const bucket = buckets[bucketIdx];
      
      // Calculate overlap between line and bucket
      const overlapStart = Math.max(lineX, bucket.xStart);
      const overlapEnd = Math.min(lineRight, bucket.xEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      
      if (overlap > 0) {
        bucket.lineCount++;
        bucket.totalLineWidth += overlap;
        bucket.yCoverage.add(Math.floor(lineY / 5)); // Quantize Y to 5px buckets for efficiency
        bucket.lines.push(line);
      }
    }
  }
  
  // Step 3: Analyze bucket density to find column boundaries
  // CRITICAL: This is the core logic - we're looking for EMPTY SPACES on the page
  // Empty spaces between text areas = column gaps
  // Text areas = columns
  
  // First, calculate overall statistics to understand the page
  const totalLines = lines.length;
  const avgLinesPerBucket = totalLines / numBuckets;
  const maxLinesInBucket = Math.max(...buckets.map(b => b.lineCount));
  
  log(`[PDF v3] analyzeVisualStructure: Page statistics - totalLines=${totalLines}, numBuckets=${numBuckets}, bucketWidth=${bucketWidth.toFixed(2)}px, avgLinesPerBucket=${avgLinesPerBucket.toFixed(2)}, maxLinesInBucket=${maxLinesInBucket}`);
  
  // Calculate density metrics for each bucket
  const bucketMetrics = buckets.map((bucket, idx) => {
    const coverageRatio = bucket.yCoverage.size / (viewportHeight / 5); // How much of page height is covered
    const avgLineWidth = bucket.lineCount > 0 ? bucket.totalLineWidth / bucket.lineCount : 0;
    const density = bucket.lineCount / bucketWidth; // Lines per pixel width
    
    // CRITICAL: Determine if bucket is "dense" (has text) or "sparse" (empty)
    // Use MORE AGGRESSIVE thresholds to better identify empty spaces
    // A bucket is dense if:
    // 1. It has significantly more lines than average (at least 1.5x average, lowered from 2x)
    // 2. OR it has text covering a significant portion of page height (at least 8%, lowered from 10%)
    // 3. OR it has any lines AND covers at least 3% of page height (lowered from 5%)
    // 4. OR it has above-average density (lines per pixel)
    const isAboveAverage = bucket.lineCount >= avgLinesPerBucket * 1.5;  // Lowered from 2x
    const hasGoodCoverage = coverageRatio >= 0.08;  // Lowered from 0.1
    const hasSomeCoverage = bucket.lineCount > 0 && coverageRatio >= 0.03;  // Lowered from 0.05
    const hasAboveAverageDensity = density > 0 && density >= (maxLinesInBucket / bucketWidth) * 0.3;  // At least 30% of max density
    
    const isDense = isAboveAverage || hasGoodCoverage || hasSomeCoverage || hasAboveAverageDensity;
    
    return {
      bucketIdx: idx,
      xStart: bucket.xStart,
      xEnd: bucket.xEnd,
      xCenter: (bucket.xStart + bucket.xEnd) / 2,
      lineCount: bucket.lineCount,
      coverageRatio,
      avgLineWidth,
      density,
      isDense,
      // Additional metrics for better analysis
      isEmpty: bucket.lineCount === 0,
      isEmptyOrSparse: bucket.lineCount === 0 || (bucket.lineCount < avgLinesPerBucket * 0.7 && coverageRatio < 0.03)  // More aggressive: 0.7x instead of 0.5x, 0.03 instead of 0.05
    };
  });
  
  // Log density analysis
  const denseBuckets = bucketMetrics.filter(b => b.isDense).length;
  const emptyBuckets = bucketMetrics.filter(b => b.isEmpty).length;
  const sparseBuckets = bucketMetrics.filter(b => !b.isDense && !b.isEmpty).length;
  log(`[PDF v3] analyzeVisualStructure: Bucket analysis - dense=${denseBuckets}, empty=${emptyBuckets}, sparse=${sparseBuckets}, total=${numBuckets}`);
  
  // Step 4: Find EMPTY SPACES on the page (column gaps)
  // CRITICAL: This is exactly what you suggested - find all empty space and see if there are columns
  // Algorithm:
  // 1. Find all continuous EMPTY or SPARSE regions (gaps)
  // 2. Check if these gaps are significant (wide enough to be column separators)
  // 3. If gap is between two dense regions (columns), it's a column gap
  
  const columnGaps = [];
  const columnBoundaries = [];
  
  log(`[PDF v3] analyzeVisualStructure: === SEARCHING FOR EMPTY SPACES (COLUMN GAPS) ===`);
  
  // Find continuous empty/sparse regions (potential column gaps)
  let emptyRegionStart = null;
  let emptyRegionEnd = null;
  let emptyRegionBuckets = [];
  
  for (let i = 0; i < bucketMetrics.length; i++) {
    const bucket = bucketMetrics[i];
    
    // Check if this bucket is empty or sparse (no text or very little text)
    if (bucket.isEmptyOrSparse) {
      // Empty/sparse region - potential gap
      if (emptyRegionStart === null) {
        emptyRegionStart = bucket.xStart;
        emptyRegionBuckets = [bucket];
      } else {
        emptyRegionBuckets.push(bucket);
      }
      emptyRegionEnd = bucket.xEnd;
    } else {
      // Dense region (has text) - check if we just finished an empty region
      if (emptyRegionStart !== null && emptyRegionEnd !== null) {
        const gapWidth = emptyRegionEnd - emptyRegionStart;
        const gapBucketCount = emptyRegionBuckets.length;
        
        // Check if gap is significant
        // CRITICAL: Use MORE AGGRESSIVE thresholds to catch smaller gaps
        // Minimum gap = 1.2x font size OR 2x bucket width (whichever is larger, lowered from 1.5x and 3x)
        const minGapWidth = Math.max(baseFontSize * 1.2, bucketWidth * 2);
        
        // Also check if gap is between two dense regions (columns)
        const leftBucketIdx = Math.max(0, i - gapBucketCount - 1);
        const rightBucketIdx = i;
        const leftIsDense = leftBucketIdx >= 0 && bucketMetrics[leftBucketIdx].isDense;
        const rightIsDense = rightBucketIdx < bucketMetrics.length && bucketMetrics[rightBucketIdx].isDense;
        const isBetweenColumns = leftIsDense && rightIsDense;
        
        log(`[PDF v3] analyzeVisualStructure: Found empty region - xStart=${emptyRegionStart.toFixed(2)}, xEnd=${emptyRegionEnd.toFixed(2)}, width=${gapWidth.toFixed(2)}px, bucketCount=${gapBucketCount}, bucketWidth=${bucketWidth.toFixed(2)}px, minGapWidth=${minGapWidth.toFixed(2)}px (max of ${(baseFontSize * 1.5).toFixed(2)}px or ${(bucketWidth * 3).toFixed(2)}px), isBetweenColumns=${isBetweenColumns}, leftIsDense=${leftIsDense}, rightIsDense=${rightIsDense}`);
        
        if (gapWidth >= minGapWidth) {
          // Significant gap found
          // Find density values at boundaries
          const leftDensity = leftBucketIdx >= 0 ? bucketMetrics[leftBucketIdx].density : 0;
          const rightDensity = rightBucketIdx < bucketMetrics.length ? bucketMetrics[rightBucketIdx].density : 0;
          
          // Calculate average density in the gap (should be very low)
          const avgGapDensity = calculateAverage(emptyRegionBuckets.map(b => b.density));
          
          log(`[PDF v3] analyzeVisualStructure: Empty region is significant - width=${gapWidth.toFixed(2)}px >= ${minGapWidth.toFixed(2)}px, avgGapDensity=${avgGapDensity.toFixed(4)}, leftDensity=${leftDensity.toFixed(4)}, rightDensity=${rightDensity.toFixed(4)}, bucketWidth=${bucketWidth.toFixed(2)}px`);
          
          // If gap is between columns OR gap is very wide, it's likely a column gap
          // CRITICAL: Lowered threshold from 3x to 2.5x font size for more aggressive detection
          if (isBetweenColumns || gapWidth >= baseFontSize * 2.5) {
            columnGaps.push({
              xStart: emptyRegionStart,
              xEnd: emptyRegionEnd,
              width: gapWidth,
              leftDensity: leftDensity,
              rightDensity: rightDensity,
              avgGapDensity: avgGapDensity,
              bucketCount: gapBucketCount,
              isBetweenColumns: isBetweenColumns
            });
            
            // Column boundary is at the center of the gap
            const boundary = (emptyRegionStart + emptyRegionEnd) / 2;
            columnBoundaries.push(boundary);
            
            log(`[PDF v3] analyzeVisualStructure: ✓ COLUMN GAP FOUND - xStart=${emptyRegionStart.toFixed(2)}px, xEnd=${emptyRegionEnd.toFixed(2)}px, width=${gapWidth.toFixed(2)}px (${gapBucketCount} buckets × ${bucketWidth.toFixed(2)}px), boundary=${boundary.toFixed(2)}px, isBetweenColumns=${isBetweenColumns}`);
          } else {
            log(`[PDF v3] analyzeVisualStructure: Empty region rejected - not between columns and not wide enough (width=${gapWidth.toFixed(2)}px < ${(baseFontSize * 3).toFixed(2)}px, bucketWidth=${bucketWidth.toFixed(2)}px)`);
          }
        } else {
          log(`[PDF v3] analyzeVisualStructure: Empty region too small - width=${gapWidth.toFixed(2)}px < ${minGapWidth.toFixed(2)}px (bucketWidth=${bucketWidth.toFixed(2)}px)`);
        }
        
        // Reset for next empty region
        emptyRegionStart = null;
        emptyRegionEnd = null;
        emptyRegionBuckets = [];
      }
    }
  }
  
  // Check for trailing empty region (gap at end of page)
  if (emptyRegionStart !== null && emptyRegionEnd !== null) {
    const gapWidth = emptyRegionEnd - emptyRegionStart;
    const minGapWidth = Math.max(baseFontSize * 1.2, bucketWidth * 2);  // Lowered thresholds
    const leftBucketIdx = Math.max(0, bucketMetrics.length - emptyRegionBuckets.length - 1);
    const leftIsDense = leftBucketIdx >= 0 && bucketMetrics[leftBucketIdx].isDense;
    
    if (gapWidth >= minGapWidth && leftIsDense) {
      const leftDensity = leftBucketIdx >= 0 ? bucketMetrics[leftBucketIdx].density : 0;
      const avgGapDensity = calculateAverage(emptyRegionBuckets.map(b => b.density));
      
      columnGaps.push({
        xStart: emptyRegionStart,
        xEnd: emptyRegionEnd,
        width: gapWidth,
        leftDensity: leftDensity,
        rightDensity: 0,
        avgGapDensity: avgGapDensity,
        bucketCount: emptyRegionBuckets.length,
        isBetweenColumns: false
      });
      
      columnBoundaries.push((emptyRegionStart + emptyRegionEnd) / 2);
      
      log(`[PDF v3] analyzeVisualStructure: ✓ TRAILING COLUMN GAP FOUND - xStart=${emptyRegionStart.toFixed(2)}px, xEnd=${emptyRegionEnd.toFixed(2)}px, width=${gapWidth.toFixed(2)}px (${emptyRegionBuckets.length} buckets × ${bucketWidth.toFixed(2)}px)`);
    }
  }
  
  log(`[PDF v3] analyzeVisualStructure: === EMPTY SPACE SEARCH COMPLETE ===`);
  log(`[PDF v3] analyzeVisualStructure: Found ${columnGaps.length} column gaps from ${bucketMetrics.length} buckets analyzed`);
  
  // Step 5: Sort and deduplicate boundaries
  columnBoundaries.sort((a, b) => a - b);
  const uniqueBoundaries = [];
  for (let i = 0; i < columnBoundaries.length; i++) {
    if (i === 0 || columnBoundaries[i] - uniqueBoundaries[uniqueBoundaries.length - 1] >= baseFontSize) {
      uniqueBoundaries.push(columnBoundaries[i]);
    }
  }
  
  log(`[PDF v3] analyzeVisualStructure: Visual structure analysis complete - found ${columnGaps.length} column gaps, ${uniqueBoundaries.length} column boundaries`);
  
  // Log detailed bucket density map for debugging
  // This shows exactly where text is (█) and where it's empty ( )
  const densityMap = bucketMetrics.map(b => {
    if (b.isEmpty) return ' '; // Completely empty
    if (b.isDense) return '█'; // Dense text (column)
    return '░'; // Sparse (some text but not dense)
  }).join('');
  
  log(`[PDF v3] analyzeVisualStructure: Density map visualization (█=column with text, ░=sparse, =empty space):`);
  log(`[PDF v3] analyzeVisualStructure: ${densityMap.substring(0, 150)}${densityMap.length > 150 ? '...' : ''}`);
  
  // Also log column gaps visually
  if (columnGaps.length > 0) {
    const gapsVisual = columnGaps.map((gap, idx) => {
      const startBucket = Math.floor(gap.xStart / bucketWidth);
      const endBucket = Math.ceil(gap.xEnd / bucketWidth);
      return `Gap[${idx}]: buckets[${startBucket}-${endBucket}], width=${gap.width.toFixed(1)}px (${gap.bucketCount} buckets × ${bucketWidth.toFixed(2)}px), betweenColumns=${gap.isBetweenColumns}`;
    }).join(' | ');
    log(`[PDF v3] analyzeVisualStructure: Column gaps details (bucketWidth=${bucketWidth.toFixed(2)}px): ${gapsVisual}`);
  } else {
    log(`[PDF v3] analyzeVisualStructure: No column gaps found - single column layout or algorithm needs tuning (bucketWidth=${bucketWidth.toFixed(2)}px)`);
  }
  
  return {
    verticalStrips: bucketMetrics,
    columnGaps,
    columnBoundaries: uniqueBoundaries,
    bucketWidth,
    viewportWidth,
    viewportHeight
  };
}

/**
 * Check if a gap between lines is a column gap (between columns) or paragraph gap (within column)
 * Uses visual structure analysis to distinguish
 * 
 * @param {number} gapX - X-coordinate of the gap (center)
 * @param {{columnGaps?: Array<any>, [key: string]: any}} visualStructure - Results from analyzeVisualStructure
 * @param {number} baseFontSize - Base font size
 * @returns {boolean} True if gap is between columns, false if within column
 */
export function isColumnGap(gapX, visualStructure, baseFontSize) {
  if (!visualStructure || !visualStructure.columnGaps || visualStructure.columnGaps.length === 0) {
    return false;
  }
  
  // Check if gapX is within any column gap
  for (const columnGap of visualStructure.columnGaps) {
    if (gapX >= columnGap.xStart && gapX <= columnGap.xEnd) {
      return true;
    }
  }
  
  // Check if gapX is near any column boundary
  for (const boundary of visualStructure.columnBoundaries) {
    const distance = Math.abs(gapX - boundary);
    if (distance <= baseFontSize * 2) {
      return true;
    }
  }
  
  return false;
}

