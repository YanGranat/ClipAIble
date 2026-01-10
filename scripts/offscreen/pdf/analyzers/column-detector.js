// @ts-check
// Column detector - detects columns in multi-column documents
// Based on X-coordinate clustering analysis

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { clusterObjects } from '../core/clustering.js';
import { CLUSTERING, DEFAULT_METRICS } from '../constants.js';
import { analyzeGaps } from './gap-analyzer.js';
import { analyzeVisualStructure, isColumnGap } from './visual-structure-analyzer.js';
import { calculateStatistics } from '../utils/statistics.js';
import { calculateAverage } from '../utils/array-helpers.js';
import {
  analyzeVerticalStructure,
  analyzeHorizontalGaps,
  createColumnCandidates,
  recalculateColumnBoundaries,
  assignLinesToColumns,
  calculateLineRight
} from './column-detection-helpers.js';

/**
 * Calculate X tolerance for column detection
 * Based on baseFontSize and adaptive multiplier
 * 
 * @param {Array} lines - Array of line objects
 * @param {number} baseFontSize - Base font size from metrics
 * @returns {number} X tolerance for clustering
 */
function calculateXTolerance(lines, baseFontSize) {
  if (!lines || lines.length === 0) {
    return CLUSTERING.DEFAULT_X_TOLERANCE;
  }
  
  // Use adaptive tolerance: baseFontSize * multiplier
  // For columns, we need larger tolerance than for line grouping
  // Columns are typically separated by significant gaps
  const adaptiveTolerance = baseFontSize * 2; // 2x baseFontSize for column detection
  
  // Ensure minimum tolerance
  const minTolerance = Math.max(CLUSTERING.DEFAULT_X_TOLERANCE, adaptiveTolerance);
  
  return minTolerance;
}

/**
 * Detect columns using X-coordinate clustering (LOGIC 1)
 * Based on clustering X-coordinates of line starts
 * 
 * Algorithm:
 * 1. Collect all X-coordinates from lines
 * 2. Cluster X-coordinates using adaptive tolerance
 * 3. Filter clusters by minimum lines per column (>= 5% of all lines)
 * 4. Calculate column boundaries (minX, maxX) from clustered lines
 * 5. Sort columns left to right
 * 
 * @param {Array} lines - Array of line objects with x, y properties
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Object} { columns: Array, method: 'x-clustering', details: Object }
 */
function detectColumnsByXClustering(lines, viewport, metrics = {}) {
  if (!lines || lines.length === 0) {
    log('[PDF v3] detectColumns: No lines to analyze');
    return [];
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const minLinesPerColumn = Math.max(3, Math.floor(lines.length * 0.05)); // At least 5% of lines or 3
  
  log(`[PDF v3] detectColumnsByXClustering: === LOGIC 1: X-COORDINATE CLUSTERING ===`);
  log(`[PDF v3] detectColumnsByXClustering: Starting - totalLines=${lines.length}, baseFontSize=${baseFontSize}, minLinesPerColumn=${minLinesPerColumn}`);
  
  // Step 1: Collect X-coordinates (use leftmost X of each line)
  const xCoordinates = lines.reduce((acc, line) => {
    const x = line.x || 0;
    if (x >= 0 && isFinite(x)) {
      acc.push(x);
    }
    return acc;
  }, []);
  
  if (xCoordinates.length === 0) {
    log('[PDF v3] detectColumns: No valid X-coordinates found');
    return [];
  }
  
  // Step 2: Calculate adaptive X tolerance
  const xTolerance = calculateXTolerance(lines, baseFontSize);
  
  // Step 3: Cluster X-coordinates
  const xClusters = clusterObjects(
    xCoordinates.map((x, idx) => ({ x, lineIndex: idx })),
    obj => obj.x,
    xTolerance,
    'X-coordinate column clustering'
  );
  
  log(`[PDF v3] detectColumnsByXClustering: X-coordinate clustering complete - totalClusters=${xClusters.length}, xTolerance=${xTolerance.toFixed(2)}`);
  
  // Log each cluster
  for (let i = 0; i < xClusters.length; i++) {
    const cluster = xClusters[i];
    const clusterX = cluster[0].x;
    const clusterSize = cluster.length;
    log(`[PDF v3] detectColumnsByXClustering: X-cluster [${i}] - x=${clusterX.toFixed(2)}, size=${clusterSize}, xRange=[${Math.min(...cluster.map(c => c.x)).toFixed(2)}, ${Math.max(...cluster.map(c => c.x)).toFixed(2)}]`);
  }
  
  // Step 3.5: Analyze vertical structure
  const clusterLines = analyzeVerticalStructure(xClusters, lines, xTolerance);
  
  // Step 3.6: Analyze horizontal gaps between X-clusters
  const { significantGaps } = analyzeHorizontalGaps(xClusters, clusterLines, baseFontSize);
  
  // Step 4: Create column candidates from X-clusters
  const columnCandidates = createColumnCandidates(xClusters, lines, xTolerance, baseFontSize, minLinesPerColumn);
  
  // Step 4.5: Assign lines to columns using overlap-based approach
  if (columnCandidates.length > 1) {
    // Assign lines to columns
    const lineToColumn = assignLinesToColumns(lines, columnCandidates, clusterLines, xTolerance, baseFontSize);
    
    // Clear all column lines first
    for (const column of columnCandidates) {
      column.lines = [];
    }
    
    // Assign lines based on overlap analysis
    const assignedLines = new Set();
    for (const line of lines) {
      if (assignedLines.has(line)) continue;
      
      const assignedColumn = lineToColumn.get(line);
      if (assignedColumn) {
        assignedColumn.lines.push(line);
        assignedLines.add(line);
      } else {
        // Fallback: assign to closest column if within reasonable distance
        const lineX = line.x || 0;
        let closestColumn = null;
        let minDistance = Infinity;
        
        for (const column of columnCandidates) {
          const distance = Math.abs(lineX - column.x);
          const maxDistance = column.width * 2;
          if (distance < minDistance && distance <= maxDistance) {
            minDistance = distance;
            closestColumn = column;
          }
        }
        
        if (closestColumn) {
          closestColumn.lines.push(line);
          assignedLines.add(line);
        }
      }
    }
    
    // Recalculate boundaries after assignment
    recalculateColumnBoundaries(columnCandidates, baseFontSize);
    
    // Verify no duplicates and sort lines
    const allAssignedLines = new Set();
    let duplicateCount = 0;
    for (const column of columnCandidates) {
      for (const line of column.lines) {
        if (allAssignedLines.has(line)) {
          duplicateCount++;
        } else {
          allAssignedLines.add(line);
        }
      }
      column.lines.sort((a, b) => a.y - b.y);
      column.lineCount = column.lines.length;
    }
    
    if (duplicateCount > 0) {
      log(`[PDF v3] detectColumnsByXClustering: WARNING - Found ${duplicateCount} duplicate lines`);
    }
    
    // Remove columns with too few lines
    const validColumns = columnCandidates.filter(col => col.lineCount >= minLinesPerColumn);
    if (validColumns.length !== columnCandidates.length) {
      log(`[PDF v3] detectColumnsByXClustering: Removed ${columnCandidates.length - validColumns.length} columns with too few lines`);
    }
    columnCandidates.length = 0;
    columnCandidates.push(...validColumns);
  }
  
  // Step 5: Sort columns left to right
  columnCandidates.sort((a, b) => a.x - b.x);
  
  log(`[PDF v3] detectColumnsByXClustering: === LOGIC 1 RESULT ===`);
  log(`[PDF v3] detectColumnsByXClustering: Found ${columnCandidates.length} columns`);
  for (let i = 0; i < columnCandidates.length; i++) {
    const col = columnCandidates[i];
    log(`[PDF v3] detectColumnsByXClustering: Column ${i + 1} - x=${col.x.toFixed(2)}, width=${col.width.toFixed(2)}, maxX=${col.maxX ? col.maxX.toFixed(2) : 'N/A'}, lineCount=${col.lineCount}`);
  }
  
  return {
    columns: columnCandidates,
    method: 'x-clustering',
    details: {
      xClusters: xClusters.length,
      xTolerance,
      significantGaps: significantGaps.length
    }
  };
}

/**
 * Detect columns using visual structure analysis (LOGIC 2)
 * Based on finding empty vertical strips (gaps) between columns
 * 
 * Algorithm:
 * 1. Analyze visual structure to find empty vertical strips
 * 2. Use column boundaries from visual structure
 * 3. Assign lines to columns based on overlap with boundaries
 * 4. Validate columns by checking line distribution
 * 
 * @param {Array} lines - Array of line objects with x, y properties
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Object} { columns: Array, method: 'visual-structure', details: Object }
 */
function detectColumnsByVisualStructure(lines, viewport, metrics = {}) {
  if (!lines || lines.length === 0) {
    log('[PDF v3] detectColumnsByVisualStructure: No lines to analyze');
    return { columns: [], method: 'visual-structure', details: {} };
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const minLinesPerColumn = Math.max(3, Math.floor(lines.length * 0.05));
  
  log(`[PDF v3] detectColumnsByVisualStructure: === LOGIC 2: VISUAL STRUCTURE ANALYSIS ===`);
  log(`[PDF v3] detectColumnsByVisualStructure: Starting - totalLines=${lines.length}, baseFontSize=${baseFontSize}, minLinesPerColumn=${minLinesPerColumn}`);
  
  // Step 1: Analyze visual structure to find empty vertical strips
  const visualStructure = analyzeVisualStructure(lines, viewport, metrics);
  
  log(`[PDF v3] detectColumnsByVisualStructure: Visual structure analysis complete - found ${visualStructure.columnGaps.length} column gaps, ${visualStructure.columnBoundaries.length} column boundaries`);
  
  if (visualStructure.columnGaps.length === 0 && visualStructure.columnBoundaries.length === 0) {
    log(`[PDF v3] detectColumnsByVisualStructure: No column gaps or boundaries found - single column layout`);
    return { columns: [], method: 'visual-structure', details: { reason: 'no-gaps-found' } };
  }
  
  // Step 2: Use column boundaries to define columns
  const columnCandidates = [];
  const viewportWidth = viewport.width || 1000;
  const boundaries = [0, ...visualStructure.columnBoundaries, viewportWidth];
  
  log(`[PDF v3] detectColumnsByVisualStructure: Using ${boundaries.length - 1} column boundaries to create columns`);
  
  for (let i = 0; i < boundaries.length - 1; i++) {
    const columnX = boundaries[i];
    const columnMaxX = boundaries[i + 1];
    const columnWidth = columnMaxX - columnX;
    
    log(`[PDF v3] detectColumnsByVisualStructure: Processing column boundary ${i} - x=${columnX.toFixed(2)}, maxX=${columnMaxX.toFixed(2)}, width=${columnWidth.toFixed(2)}`);
    
    // Find lines that are within this column
    const candidateLines = lines.filter(line => {
      const lineX = line.x || 0;
      // Calculate line right edge
      let lineRight = lineX;
      if (line.items && Array.isArray(line.items)) {
        for (const item of line.items) {
          const itemRight = (item.x || 0) + (item.width || 0);
          if (itemRight > lineRight) {
            lineRight = itemRight;
          }
        }
      } else {
        const estimatedWidth = (line.text || '').length * (baseFontSize * 0.6);
        lineRight = lineX + estimatedWidth;
      }
      
      // Line is in column if it overlaps significantly with column boundaries
      const overlapStart = Math.max(lineX, columnX);
      const overlapEnd = Math.min(lineRight, columnMaxX);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const lineWidth = lineRight - lineX;
      const overlapRatio = lineWidth > 0 ? overlap / lineWidth : 0;
      
      return overlapRatio >= 0.5; // At least 50% of line is in column
    });
    
    log(`[PDF v3] detectColumnsByVisualStructure: Column boundary ${i} - found ${candidateLines.length} candidate lines (minRequired=${minLinesPerColumn})`);
    
    if (candidateLines.length >= minLinesPerColumn) {
      // Refine boundaries based on actual line positions
      const columnXCoords = candidateLines.map(l => l.x || 0);
      const minX = Math.min(...columnXCoords);
      
      let maxX = minX;
      for (const line of candidateLines) {
        if (line.items && Array.isArray(line.items)) {
          for (const item of line.items) {
            const itemRight = (item.x || 0) + (item.width || 0);
            if (itemRight > maxX) {
              maxX = itemRight;
            }
          }
        } else {
          const estimatedWidth = (line.text || '').length * (baseFontSize * 0.6);
          const lineRight = (line.x || 0) + estimatedWidth;
          if (lineRight > maxX) {
            maxX = lineRight;
          }
        }
      }
      
      const width = maxX - minX;
      
      log(`[PDF v3] detectColumnsByVisualStructure: Column boundary ${i} - creating column candidate - x=${minX.toFixed(2)}, width=${width.toFixed(2)}, maxX=${maxX.toFixed(2)}, lineCount=${candidateLines.length}`);
      
      columnCandidates.push({
        x: minX,
        width: width,
        maxX: maxX,
        centerX: (minX + maxX) / 2,
        lines: candidateLines, // Assign lines directly
        lineCount: candidateLines.length
      });
    } else {
      log(`[PDF v3] detectColumnsByVisualStructure: Column boundary ${i} - REJECTED (too few lines: ${candidateLines.length} < ${minLinesPerColumn})`);
    }
  }
  
  // Step 3: Sort columns left to right
  columnCandidates.sort((a, b) => a.x - b.x);
  
  log(`[PDF v3] detectColumnsByVisualStructure: === LOGIC 2 RESULT ===`);
  log(`[PDF v3] detectColumnsByVisualStructure: Found ${columnCandidates.length} columns`);
  for (let i = 0; i < columnCandidates.length; i++) {
    const col = columnCandidates[i];
    log(`[PDF v3] detectColumnsByVisualStructure: Column ${i + 1} - x=${col.x.toFixed(2)}, width=${col.width.toFixed(2)}, maxX=${col.maxX ? col.maxX.toFixed(2) : 'N/A'}, lineCount=${col.lineCount}`);
  }
  
  return {
    columns: columnCandidates,
    method: 'visual-structure',
    details: {
      columnGaps: visualStructure.columnGaps.length,
      columnBoundaries: visualStructure.columnBoundaries.length
    }
  };
}

/**
 * Main function: Detect columns using both methods and combine results
 * 
 * @param {Array} lines - Array of line objects with x, y properties
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Array} Array of column objects { x, width, lines }
 */
export function detectColumns(lines, viewport, metrics = {}) {
  if (!lines || lines.length === 0) {
    log('[PDF v3] detectColumns: No lines to analyze');
    return [];
  }
  
  log(`[PDF v3] detectColumns: === STARTING COLUMN DETECTION (BOTH METHODS) ===`);
  
  // Run both methods independently
  const result1 = detectColumnsByXClustering(lines, viewport, metrics);
  const result2 = detectColumnsByVisualStructure(lines, viewport, metrics);
  
  log(`[PDF v3] detectColumns: === COMPARING RESULTS ===`);
  log(`[PDF v3] detectColumns: Method 1 (X-clustering) found ${result1.columns.length} columns`);
  log(`[PDF v3] detectColumns: Method 2 (Visual structure) found ${result2.columns.length} columns`);
  
  // Choose best result or combine
  let finalColumns = [];
  let chosenMethod = 'none';
  
  if (result1.columns.length === 0 && result2.columns.length === 0) {
    log(`[PDF v3] detectColumns: Both methods found no columns - single column layout`);
    return [];
  } else if (result1.columns.length === 0) {
    log(`[PDF v3] detectColumns: Using Method 2 (Visual structure) - Method 1 found no columns`);
    finalColumns = result2.columns;
    chosenMethod = result2.method;
  } else if (result2.columns.length === 0) {
    log(`[PDF v3] detectColumns: Using Method 1 (X-clustering) - Method 2 found no columns`);
    finalColumns = result1.columns;
    chosenMethod = result1.method;
  } else if (result1.columns.length === result2.columns.length) {
    // Both found same number of columns - prefer visual structure (more accurate)
    log(`[PDF v3] detectColumns: Both methods found ${result1.columns.length} columns - using Method 2 (Visual structure) as primary`);
    finalColumns = result2.columns;
    chosenMethod = result2.method;
    
    // Log comparison
    for (let i = 0; i < result1.columns.length; i++) {
      const col1 = result1.columns[i];
      const col2 = result2.columns[i];
      const xDiff = Math.abs(col1.x - col2.x);
      const widthDiff = Math.abs(col1.width - col2.width);
      log(`[PDF v3] detectColumns: Column ${i + 1} comparison - Method1: x=${col1.x.toFixed(2)}, width=${col1.width.toFixed(2)} | Method2: x=${col2.x.toFixed(2)}, width=${col2.width.toFixed(2)} | xDiff=${xDiff.toFixed(2)}, widthDiff=${widthDiff.toFixed(2)}`);
    }
  } else {
    // Different number of columns - use the one with more columns (likely more accurate)
    if (result2.columns.length > result1.columns.length) {
      log(`[PDF v3] detectColumns: Using Method 2 (Visual structure) - found more columns (${result2.columns.length} vs ${result1.columns.length})`);
      finalColumns = result2.columns;
      chosenMethod = result2.method;
    } else {
      log(`[PDF v3] detectColumns: Using Method 1 (X-clustering) - found more columns (${result1.columns.length} vs ${result2.columns.length})`);
      finalColumns = result1.columns;
      chosenMethod = result1.method;
    }
  }
  
  log(`[PDF v3] detectColumns: === FINAL RESULT ===`);
  log(`[PDF v3] detectColumns: Chosen method: ${chosenMethod}, columns found: ${finalColumns.length}`);
  
  // Log final columns
  for (let i = 0; i < finalColumns.length; i++) {
    const col = finalColumns[i];
    log(`[PDF v3] detectColumns: Final column ${i + 1} - x=${col.x.toFixed(2)}, width=${col.width.toFixed(2)}, maxX=${col.maxX ? col.maxX.toFixed(2) : 'N/A'}, lineCount=${col.lineCount || col.lines?.length || 0}`);
  }
  
  // Step 5.5: Validate columns by checking for empty space between them
  // CRITICAL: If columns overlap (negative gap), fix boundaries to prevent overlap
  // Also check if gap is too small - might indicate incorrectly detected columns
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  
  if (finalColumns.length > 1) {
    const validatedColumns = [];
    const minGapBetweenColumns = baseFontSize * 1.5; // Minimum gap to consider columns separate (more aggressive - was 2x, pdfplumber uses 3px default)
    
    for (let i = 0; i < finalColumns.length; i++) {
      const column = finalColumns[i];
      const prevColumn = i > 0 ? finalColumns[i - 1] : null;
      
      if (prevColumn) {
        const prevMaxX = prevColumn.maxX || (prevColumn.x + prevColumn.width);
        const currentMinX = column.x;
        const gapBetweenColumns = currentMinX - prevMaxX;
        
        log(`[PDF v3] detectColumns: Checking gap between columns ${i - 1} and ${i} - prevMaxX=${prevMaxX.toFixed(2)}, currentMinX=${currentMinX.toFixed(2)}, gap=${gapBetweenColumns.toFixed(2)}, minGapRequired=${minGapBetweenColumns.toFixed(2)}`);
        
        if (gapBetweenColumns < 0) {
          // CRITICAL: Columns overlap! Fix by adjusting boundaries
          // Set prevMaxX to midpoint between columns, and currentMinX to same point
          const midpoint = (prevMaxX + currentMinX) / 2;
          prevColumn.maxX = midpoint;
          prevColumn.width = midpoint - prevColumn.x;
          column.x = midpoint;
          column.width = (column.maxX || (column.x + column.width)) - midpoint;
          column.maxX = column.x + column.width;
          
          log(`[PDF v3] detectColumns: CRITICAL FIX - Columns ${i - 1} and ${i} overlap (gap=${gapBetweenColumns.toFixed(2)})! Adjusted boundaries - prevMaxX=${midpoint.toFixed(2)}, currentMinX=${midpoint.toFixed(2)}`);
          validatedColumns.push(column);
        } else if (gapBetweenColumns >= minGapBetweenColumns) {
          // Significant gap found - columns are separate
          log(`[PDF v3] detectColumns: Gap between columns ${i - 1} and ${i} is significant (${gapBetweenColumns.toFixed(2)} >= ${minGapBetweenColumns.toFixed(2)}) - columns are separate`);
          validatedColumns.push(column);
        } else {
          // Gap is too small - might be same column or incorrectly detected
          // But still add column (might be valid for narrow columns)
          log(`[PDF v3] detectColumns: WARNING - Gap between columns ${i - 1} and ${i} is small (${gapBetweenColumns.toFixed(2)} < ${minGapBetweenColumns.toFixed(2)}) - might be same column, but keeping both`);
          validatedColumns.push(column);
        }
      } else {
        // First column - always add
        validatedColumns.push(column);
      }
    }
    
    // Update finalColumns with validated columns
    finalColumns = validatedColumns;
    
    log(`[PDF v3] detectColumns: Column validation complete - originalCount=${finalColumns.length}, validatedCount=${validatedColumns.length}`);
  }
  
  log(`[PDF v3] detectColumns: Column detection complete - columnsDetected=${finalColumns.length}`);
  
  // Log each column separately for better visibility
  for (let idx = 0; idx < finalColumns.length; idx++) {
    const col = finalColumns[idx];
    const lineCount = col.lineCount || (col.lines ? col.lines.length : 0);
    log(`[PDF v3] detectColumns: Final column ${idx + 1} - index=${idx}, x=${col.x.toFixed(2)}, width=${col.width.toFixed(2)}, maxX=${col.maxX ? col.maxX.toFixed(2) : 'N/A'}, lineCount=${lineCount}`);
    if (col.lines && col.lines.length > 0) {
      const firstLine = col.lines[0];
      const lastLine = col.lines[col.lines.length - 1];
      log(`[PDF v3] detectColumns: Final column ${idx + 1} first line: text="${firstLine.text.substring(0, 80)}", x=${firstLine.x.toFixed(2)}, y=${firstLine.y.toFixed(2)}`);
      log(`[PDF v3] detectColumns: Final column ${idx + 1} last line: text="${lastLine.text.substring(0, 80)}", x=${lastLine.x.toFixed(2)}, y=${lastLine.y.toFixed(2)}`);
    }
  }
  
  // If only one column detected, return empty array (single-column layout)
  if (finalColumns.length <= 1) {
    log('[PDF v3] detectColumns: Single-column layout detected, no column separation needed');
    return [];
  }
  
  return finalColumns;
}

/**
 * Process lines by columns: if columns detected, process each column separately
 * Otherwise, process all lines together
 * 
 * CRITICAL: This function implements the correct processing hierarchy:
 * 1. FIRST: Determine top-level text regions (columns/blocks)
 *    - Analyze visual structure to find empty vertical strips (column gaps)
 *    - Cluster X-coordinates to identify column positions
 *    - Assign lines to columns based on overlap and vertical structure
 * 
 * 2. THEN: Group lines into elements (paragraphs/headings) WITHIN each column
 *    - This ensures paragraph boundaries are detected correctly within columns
 *    - Not across columns (which would mix text from different columns)
 * 
 * @param {Array} lines - Array of line objects
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {import('../../../types.js').ProcessLinesFunction} processFunction - Function to process lines (e.g., groupLinesIntoElements)
 * @returns {Array} Processed elements from all columns
 */
export function processLinesByColumns(lines, viewport, metrics, processFunction) {
  if (!lines || lines.length === 0) {
    return [];
  }
  
  // STEP 1: DETERMINE TOP-LEVEL TEXT REGIONS (COLUMNS)
  // This is the FIRST and most important step - identify where columns are
  // before trying to group lines into paragraphs
  
  // Step 1.1: Analyze visual structure to find empty vertical strips (column gaps)
  // This identifies where text is dense (columns) and where it's empty (gaps)
  let visualStructure;
  try {
    visualStructure = analyzeVisualStructure(lines, viewport, metrics);
  } catch (error) {
    logWarn(`[PDF v3] processLinesByColumns: analyzeVisualStructure failed`, {
      error: error.message,
      stack: error.stack,
      linesCount: lines.length
    });
    visualStructure = null;
  }
  
  // Add visual structure to metrics for use in element grouping
  const metricsWithVisualStructure = { ...metrics, visualStructure };
  
  // Step 1.2: Detect columns using both methods (X-clustering + visual structure)
  // This assigns each line to a specific column based on:
  // - Horizontal overlap (line X-coordinates within column boundaries)
  // - Vertical proximity (lines close in Y are likely same column)
  let columns;
  try {
    columns = detectColumns(lines, viewport, metricsWithVisualStructure);
    // Ensure we have an array
    if (!Array.isArray(columns)) {
      logWarn(`[PDF v3] processLinesByColumns: detectColumns returned non-array`, {
        type: typeof columns,
        value: columns
      });
      columns = [];
    }
  } catch (error) {
    logWarn(`[PDF v3] processLinesByColumns: detectColumns failed`, {
      error: error.message,
      stack: error.stack,
      linesCount: lines.length
    });
    columns = [];
  }
  
  // If no columns detected, process all lines together as single column
  if (columns.length === 0) {
    log(`[PDF v3] processLinesByColumns: Single-column layout detected - processing all ${lines.length} lines together`);
    try {
      const result = processFunction(lines, metrics);
      // Ensure we have an array
      if (!Array.isArray(result)) {
        logWarn(`[PDF v3] processLinesByColumns: processFunction returned non-array for single column, converting to array`, {
          type: typeof result,
          value: result
        });
        return result ? [result] : [];
      }
      return result;
    } catch (error) {
      logWarn(`[PDF v3] processLinesByColumns: processFunction failed for single column`, {
        error: error.message,
        stack: error.stack,
        linesCount: lines.length
      });
      return [];
    }
  }
  
  log(`[PDF v3] processLinesByColumns: === STEP 2: GROUPING LINES INTO ELEMENTS WITHIN COLUMNS ===`);
  log(`[PDF v3] processLinesByColumns: Multi-column layout detected - columnCount=${columns.length}, totalLines=${lines.length}`);
  log(`[PDF v3] processLinesByColumns: Processing each column separately to correctly identify paragraph boundaries`);
  
  // STEP 2: GROUP LINES INTO ELEMENTS (PARAGRAPHS/HEADINGS) WITHIN EACH COLUMN
  // CRITICAL: Process each column separately
  // - Perform gap analysis separately for each column
  // - Global gap analysis mixes gaps from different columns, making it impossible to detect
  //   paragraph boundaries within columns
  // - This ensures that paragraph breaks are detected correctly within each column,
  //   not across columns (which would mix text from different columns)
  const allElements = [];
  
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const column = columns[colIdx];
    
    // Detailed logging for column analysis
    log(`[PDF v3] processLinesByColumns: Processing column ${colIdx + 1}/${columns.length}`);
    log(`[PDF v3] Column ${colIdx + 1} details: columnIndex=${colIdx}, columnX=${column.x.toFixed(2)}, columnWidth=${column.width.toFixed(2)}, maxX=${column.maxX ? column.maxX.toFixed(2) : 'N/A'}, lineCount=${column.lines.length}`);
    if (column.lines.length > 0) {
      const firstLine = column.lines[0];
      const lastLine = column.lines[column.lines.length - 1];
      log(`[PDF v3] Column ${colIdx + 1} first line: text="${firstLine.text.substring(0, 80)}", x=${firstLine.x.toFixed(2)}, y=${firstLine.y.toFixed(2)}`);
      log(`[PDF v3] Column ${colIdx + 1} last line: text="${lastLine.text.substring(0, 80)}", x=${lastLine.x.toFixed(2)}, y=${lastLine.y.toFixed(2)}`);
      const xCoords = column.lines.slice(0, 10).map(l => l.x.toFixed(2)).join(', ');
      log(`[PDF v3] Column ${colIdx + 1} X-coordinates (first 10): [${xCoords}]`);
    }
    
    // Create column-specific metrics with local gap analysis
    // CRITICAL: Gaps within a column are different from gaps between columns.
    // - Gaps BETWEEN columns: large horizontal empty space (already identified in Step 1)
    // - Gaps WITHIN a column: vertical empty space between paragraphs (what we're analyzing now)
    // 
    // Global gap analysis mixes gaps from different columns, making it impossible
    // to detect paragraph boundaries within columns. We must analyze gaps separately
    // for each column to correctly identify paragraph breaks.
    const columnMetrics = { ...metrics };
    columnMetrics.columnIndex = colIdx; // Mark as column-specific for logging
    // Pass visual structure to help distinguish column gaps from paragraph gaps
    columnMetrics.visualStructure = metrics.visualStructure || null;
    if (column.lines.length >= 2) {
      // Perform gap analysis for this column only
      // This analyzes vertical gaps between lines WITHIN this column
      // to identify paragraph boundaries (large gaps) vs line continuations (small gaps)
      const columnGapAnalysis = analyzeGaps(column.lines);
      columnMetrics.gapAnalysis = columnGapAnalysis;
      log(`[PDF v3] processLinesByColumns: Column ${colIdx + 1} gap analysis (WITHIN column) - documentType=${columnGapAnalysis.documentType}, normalGapMax=${columnGapAnalysis.normalGapMax.toFixed(2)}, paragraphGapMin=${columnGapAnalysis.paragraphGapMin.toFixed(2)}, mean=${columnGapAnalysis.mean.toFixed(2)}, lineCount=${column.lines.length}`);
    }
    
    // Process column lines with column-specific metrics
    // This groups lines into elements (paragraphs/headings) within this column
    // Paragraph boundaries are detected based on gaps WITHIN this column only
    let columnElements;
    try {
      columnElements = processFunction(column.lines, columnMetrics);
      // Ensure we have an array
      if (!Array.isArray(columnElements)) {
        logWarn(`[PDF v3] processLinesByColumns: processFunction returned non-array for column ${colIdx + 1}, converting to array`, {
          type: typeof columnElements,
          value: columnElements
        });
        columnElements = columnElements ? [columnElements] : [];
      }
    } catch (error) {
      logWarn(`[PDF v3] processLinesByColumns: processFunction failed for column ${colIdx + 1}`, {
        error: error.message,
        stack: error.stack,
        linesCount: column.lines.length
      });
      columnElements = [];
    }
    
    // Add column index to elements for tracking
    for (const element of columnElements) {
      element.columnIndex = colIdx;
      element.columnX = column.x;
      // Log element info for debugging
      const elementText = element.text ? element.text.substring(0, 80) : 'NO TEXT';
      const minYStr = element.minY ? element.minY.toFixed(2) : 'N/A';
      const maxYStr = element.maxY ? element.maxY.toFixed(2) : 'N/A';
      log(`[PDF v3] Column ${colIdx + 1} element [${columnElements.length}]: type=${element.type}, text="${elementText}", textLength=${element.text ? element.text.length : 0}, columnIndex=${colIdx}, minY=${minYStr}, maxY=${maxYStr}`);
    }
    
    // Sort elements within column by Y-coordinate (top to bottom)
    // Elements should have minY from block, but fallback to first line's Y if not available
    columnElements.sort((a, b) => {
      // Prefer minY (top of element), fallback to first line's Y, then 0
      const aY = (typeof a.minY === 'number' && a.minY !== 0) 
        ? a.minY 
        : (a.lines && a.lines.length > 0 ? a.lines[0].y : 0) || 0;
      const bY = (typeof b.minY === 'number' && b.minY !== 0)
        ? b.minY
        : (b.lines && b.lines.length > 0 ? b.lines[0].y : 0) || 0;
      return aY - bY;
    });
    
    allElements.push(...columnElements);
  }
  
  // For multi-column layout, maintain column order (left to right)
  // Elements are already sorted within each column by Y-coordinate
  // Columns are processed in left-to-right order, so no cross-column sorting needed
  
    // Detailed final summary
    log(`[PDF v3] processLinesByColumns: Multi-column processing complete - totalElements=${allElements.length}, columnsProcessed=${columns.length}`);
    
    // Validation: Check elements per column (optimized: single pass)
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const { elementCount, totalLength } = allElements.reduce((acc, el) => {
        if (el.columnIndex === colIdx) {
          acc.elementCount++;
          acc.totalLength += el.text ? el.text.length : 0;
        }
        return acc;
      }, { elementCount: 0, totalLength: 0 });
      const avgLength = elementCount > 0 ? totalLength / elementCount : 0;
      
      log(`[PDF v3] processLinesByColumns: Column ${colIdx + 1} validation - elementCount=${elementCount}, totalLength=${totalLength}, avgLength=${avgLength.toFixed(0)}`);
      
      // Warn if column has very few elements (might indicate incorrect merging)
      if (elementCount === 1 && totalLength > 500) {
        log(`[PDF v3] processLinesByColumns: WARNING - Column ${colIdx + 1} has only 1 element but is very large (${totalLength} chars) - might be incorrectly merged`);
      }
      
      // Warn if any element is very large
      const columnElements = allElements.filter(el => el.columnIndex === colIdx);
      for (const el of columnElements) {
        if (el.text && el.text.length > 1000) {
          log(`[PDF v3] processLinesByColumns: WARNING - Column ${colIdx + 1} element is very large - length=${el.text.length}, type=${el.type}, text="${el.text.substring(0, 100)}..."`);
        }
      }
    }
  
  // Log elements grouped by column
  const elementsByColumn = allElements.reduce((acc, el, idx) => {
    const colIdx = el.columnIndex !== undefined ? el.columnIndex : 'unknown';
    if (!acc[colIdx]) acc[colIdx] = [];
    acc[colIdx].push({
      index: idx,
      type: el.type,
      text: el.text ? el.text.substring(0, 50) : 'NO TEXT',
      textLength: el.text ? el.text.length : 0,
      columnIndex: el.columnIndex
    });
    return acc;
  }, {});
  
  for (const [colIdx, elements] of Object.entries(elementsByColumn)) {
    const elementsList = elements.map(el => `[${el.index}]${el.type}:"${el.text}"(${el.textLength})`).join(', ');
    log(`[PDF v3] Column ${colIdx} final elements (${elements.length}): ${elementsList}`);
  }
  
  return allElements;
}

