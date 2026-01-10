// @ts-check
// Table classifier - determines if element is a table
// Uses multiple algorithms: Grid Pattern Detection, Column Alignment, Row Structure

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { clusterObjects } from '../core/clustering.js';
import { ELEMENT_DECISION, DEFAULT_METRICS, CLUSTERING, TABLE_DETECTION } from '../constants.js';

/**
 * Detect table using grid pattern analysis
 * Looks for regular alignment patterns in X and Y coordinates
 * 
 * @param {{lines?: Array<any>, [key: string]: any}} element - Element to analyze
 * @param {{metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Context with metrics
 * @returns {Object} Detection result
 */
function detectGridPattern(element, context = {}) {
  const lines = element.lines || [];
  log(`[PDF v3] detectGridPattern: START - lineCount=${lines.length}`);
  
  if (lines.length < 4) {
    log(`[PDF v3] detectGridPattern: TOO FEW LINES - lineCount=${lines.length}, minRequired=4`);
    return { 
      confidence: 0, 
      algorithm: 'grid-pattern', 
      details: { reason: 'too-few-lines', lineCount: lines.length } 
    };
  }
  
  const baseFontSize = context.metrics?.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const tolerance = baseFontSize * TABLE_DETECTION.COLUMN_TOLERANCE_MULTIPLIER;
  log(`[PDF v3] detectGridPattern: Parameters - baseFontSize=${baseFontSize}, tolerance=${tolerance.toFixed(2)}`);
  
  // Step 1: Collect X-coordinates (column positions)
  const xCoordinates = [];
  for (const line of lines) {
    if (line.items && line.items.length > 0) {
      // Use item X-coordinates for more precision
      for (const item of line.items) {
        if (item.x !== undefined && item.x >= 0) {
          xCoordinates.push(item.x);
        }
      }
    } else if (line.x !== undefined && line.x >= 0) {
      xCoordinates.push(line.x);
    }
  }
  
  log(`[PDF v3] detectGridPattern: Step 1 - Collected ${xCoordinates.length} X-coordinates`);
  
  if (xCoordinates.length === 0) {
    log(`[PDF v3] detectGridPattern: NO X-COORDINATES`);
    return { 
      confidence: 0, 
      algorithm: 'grid-pattern', 
      details: { reason: 'no-x-coordinates' } 
    };
  }
  
  // Step 2: Cluster X-coordinates to find columns
  const xClusters = clusterObjects(
    xCoordinates.map((x, idx) => ({ x, idx })),
    obj => obj.x,
    tolerance,
    'table-column-clustering'
  );
  
  log(`[PDF v3] detectGridPattern: Step 2 - Found ${xClusters.length} X-clusters (columns)`, {
    clusters: xClusters.map((cluster, idx) => ({
      clusterIdx: idx,
      size: cluster.length,
      center: calculateClusterCenter(cluster.map(c => c.x)).toFixed(2),
      min: Math.min(...cluster.map(c => c.x)).toFixed(2),
      max: Math.max(...cluster.map(c => c.x)).toFixed(2)
    }))
  });
  
  // Step 3: Cluster Y-coordinates to find rows (optimized: single pass)
  const yCoordinates = [];
  for (const line of lines) {
    if (line.y !== undefined && line.y >= 0) {
      yCoordinates.push(line.y);
    }
  }
  log(`[PDF v3] detectGridPattern: Step 3 - Collected ${yCoordinates.length} Y-coordinates`);
  
  if (yCoordinates.length === 0) {
    log(`[PDF v3] detectGridPattern: NO Y-COORDINATES`);
    return { 
      confidence: 0, 
      algorithm: 'grid-pattern', 
      details: { reason: 'no-y-coordinates' } 
    };
  }
  
  const yClusters = clusterObjects(
    yCoordinates.map((y, idx) => ({ y, idx })),
    obj => obj.y,
    tolerance,
    'table-row-clustering'
  );
  
  log(`[PDF v3] detectGridPattern: Step 3 - Found ${yClusters.length} Y-clusters (rows)`, {
    clusters: yClusters.map((cluster, idx) => ({
      clusterIdx: idx,
      size: cluster.length,
      center: calculateClusterCenter(cluster.map(c => c.y)).toFixed(2),
      min: Math.min(...cluster.map(c => c.y)).toFixed(2),
      max: Math.max(...cluster.map(c => c.y)).toFixed(2)
    }))
  });
  
  // Step 4: Validate grid structure
  if (xClusters.length < ELEMENT_DECISION.TABLE_MIN_COLUMNS || 
      yClusters.length < ELEMENT_DECISION.TABLE_MIN_ROWS) {
    log(`[PDF v3] detectGridPattern: INSUFFICIENT CLUSTERS - xClusters=${xClusters.length}, yClusters=${yClusters.length}, minRequired={columns:${ELEMENT_DECISION.TABLE_MIN_COLUMNS}, rows:${ELEMENT_DECISION.TABLE_MIN_ROWS}}`);
    return { 
      confidence: 0, 
      algorithm: 'grid-pattern',
      details: { 
        xClusters: xClusters.length, 
        yClusters: yClusters.length, 
        reason: 'insufficient-clusters',
        minRequired: { columns: ELEMENT_DECISION.TABLE_MIN_COLUMNS, rows: ELEMENT_DECISION.TABLE_MIN_ROWS }
      }
    };
  }
  
  // Step 5: Calculate confidence based on grid regularity
  const confidence = calculateGridConfidence(xClusters, yClusters, lines, tolerance);
  
  log(`[PDF v3] detectGridPattern: Step 5 - Calculated confidence=${confidence.toFixed(3)}`, {
    columnCount: xClusters.length,
    rowCount: yClusters.length
  });
  
  return {
    confidence,
    algorithm: 'grid-pattern',
    details: {
      columnCount: xClusters.length,
      rowCount: yClusters.length,
      xClusters: xClusters.map(cluster => {
        const values = cluster.map(c => c.x);
        return {
          center: calculateClusterCenter(values),
          size: cluster.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }),
      yClusters: yClusters.map(cluster => {
        const values = cluster.map(c => c.y);
        return {
          center: calculateClusterCenter(values),
          size: cluster.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      })
    }
  };
}

/**
 * Analyze column alignment
 * Looks for aligned text starts across multiple lines
 * 
 * @param {{lines?: Array<any>, [key: string]: any}} element - Element to analyze
 * @param {{metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Context with metrics
 * @returns {Object} Detection result
 */
function analyzeColumnAlignment(element, context = {}) {
  const lines = element.lines || [];
  if (lines.length < 3) {
    return { confidence: 0, algorithm: 'column-alignment', details: { reason: 'too-few-lines' } };
  }
  
  const baseFontSize = context.metrics?.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const tolerance = baseFontSize * TABLE_DETECTION.ROW_TOLERANCE_MULTIPLIER;
  
  // Extract all X-coordinates where text starts
  const startPositions = [];
  for (const line of lines) {
    if (line.items && line.items.length > 0) {
      const firstItem = line.items[0];
      if (firstItem.x !== undefined && firstItem.x >= 0) {
        startPositions.push(firstItem.x);
      }
    } else if (line.x !== undefined && line.x >= 0) {
      startPositions.push(line.x);
    }
  }
  
  if (startPositions.length < 3) {
    return { confidence: 0, algorithm: 'column-alignment', details: { reason: 'insufficient-positions' } };
  }
  
  // Cluster start positions to find columns
  const columnClusters = clusterObjects(
    startPositions.map((x, idx) => ({ x, idx })),
    obj => obj.x,
    tolerance,
    'column-alignment-clustering'
  );
  
  if (columnClusters.length < ELEMENT_DECISION.TABLE_MIN_COLUMNS) {
    return { 
      confidence: 0, 
      algorithm: 'column-alignment',
      details: { 
        reason: 'insufficient-columns',
        columnCount: columnClusters.length
      }
    };
  }
  
  // Calculate alignment score
  let alignedCount = 0;
  const columnPositions = columnClusters.map(cluster => {
    const values = cluster.map(c => c.x);
    return calculateClusterCenter(values);
  });
  
  for (const pos of startPositions) {
    const isAligned = columnPositions.some(colPos => Math.abs(pos - colPos) <= tolerance);
    if (isAligned) alignedCount++;
  }
  
  const alignmentScore = alignedCount / startPositions.length;
  const columnScore = Math.min(columnClusters.length / TABLE_DETECTION.COLUMN_SCORE_MAX_COLUMNS, 1);
  
  const confidence = alignmentScore * TABLE_DETECTION.ALIGNMENT_SCORE_WEIGHT + 
                     columnScore * TABLE_DETECTION.COLUMN_SCORE_WEIGHT;
  
  return {
    confidence: Math.min(confidence, 0.9),
    algorithm: 'column-alignment',
    details: { 
      columnPositions,
      alignmentScore: alignmentScore.toFixed(3),
      columnScore: columnScore.toFixed(3),
      alignedCount,
      totalPositions: startPositions.length
    }
  };
}

/**
 * Detect row structure
 * Analyzes gaps between lines to identify table rows
 * 
 * @param {{lines?: Array<any>, [key: string]: any}} element - Element to analyze
 * @param {{metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Context with metrics
 * @returns {Object} Detection result
 */
function detectRowStructure(element, context = {}) {
  const lines = element.lines || [];
  if (lines.length < 2) {
    return { confidence: 0, algorithm: 'row-structure', details: { reason: 'too-few-lines' } };
  }
  
  const baseFontSize = context.metrics?.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const paragraphGapThreshold = context.metrics?.paragraphGapThreshold || 
    DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD;
  
  // Sort lines by Y
  const sortedLines = [...lines].sort((a, b) => (a.y || 0) - (b.y || 0));
  
  // Calculate gaps between consecutive lines
  const gaps = [];
  for (let i = 1; i < sortedLines.length; i++) {
    const gap = sortedLines[i].y - sortedLines[i - 1].y;
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  
  if (gaps.length === 0) {
    return { confidence: 0, algorithm: 'row-structure', details: { reason: 'no-gaps' } };
  }
  
  // Table rows should have smaller gaps than paragraphs
  const smallGapThreshold = paragraphGapThreshold * TABLE_DETECTION.ROW_STRUCTURE_SMALL_GAP_RATIO;
  const smallGaps = gaps.filter(gap => gap < smallGapThreshold);
  const smallGapRatio = smallGaps.length / gaps.length;
  
  // Check for regularity (gaps should be similar)
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  const gapStdDev = Math.sqrt(gapVariance);
  const regularity = avgGap > 0 ? 1 - Math.min(gapStdDev / avgGap, 1) : 0;
  
  // CRITICAL: Check average line length - tables have shorter lines than paragraphs
  // Multi-column text paragraphs have long lines (often >100 chars), tables have short cells
  const avgLineLength = lines.reduce((sum, line) => {
    const text = line.text || '';
    return sum + text.length;
  }, 0) / lines.length;
  
  // If average line length is very long, it's likely multi-column text, not a table
  const hasShortLines = avgLineLength < TABLE_DETECTION.MAX_AVG_LINE_LENGTH;
  // More aggressive penalty for long lines
  const lineLengthScore = hasShortLines 
    ? 1.0 
    : Math.max(0, 1 - (avgLineLength - TABLE_DETECTION.MAX_AVG_LINE_LENGTH) / TABLE_DETECTION.LINE_LENGTH_PENALTY_DIVISOR);
  
  // Combine gap analysis with line length check
  // Reduce confidence if lines are too long (likely multi-column text)
  const baseConfidence = smallGapRatio * TABLE_DETECTION.ROW_STRUCTURE_SMALL_GAP_WEIGHT + 
                         regularity * TABLE_DETECTION.ROW_STRUCTURE_REGULARITY_WEIGHT;
  const confidence = baseConfidence * lineLengthScore;
  
  log(`[PDF v3] detectRowStructure: Line length check - avgLineLength=${avgLineLength.toFixed(1)}, hasShortLines=${hasShortLines}, lineLengthScore=${lineLengthScore.toFixed(3)}, baseConfidence=${baseConfidence.toFixed(3)}, finalConfidence=${confidence.toFixed(3)}`);
  
  return {
    confidence: Math.min(confidence, TABLE_DETECTION.ROW_STRUCTURE_CONFIDENCE_CAP),
    algorithm: 'row-structure',
    details: { 
      smallGapRatio: smallGapRatio.toFixed(3),
      regularity: regularity.toFixed(3),
      avgGap: avgGap.toFixed(2),
      avgLineLength: avgLineLength.toFixed(1),
      hasShortLines,
      lineLengthScore: lineLengthScore.toFixed(3),
      smallGaps: smallGaps.length,
      totalGaps: gaps.length
    }
  };
}

/**
 * Calculate confidence based on grid regularity
 * 
 * @param {Array} xClusters - X-coordinate clusters
 * @param {Array} yClusters - Y-coordinate clusters
 * @param {Array} lines - All lines
 * @param {number} tolerance - Coordinate tolerance
 * @returns {number} Confidence score (0-1)
 */
function calculateGridConfidence(xClusters, yClusters, lines, tolerance) {
  // Check how many lines align with detected columns
  let alignedLines = 0;
  
  // Calculate column positions
  const columnPositions = xClusters.map(cluster => {
    const values = cluster.map(c => c.x);
    return calculateClusterCenter(values);
  });
  
  // Calculate minimum distance between columns for tolerance
  const columnDistances = [];
  for (let i = 1; i < columnPositions.length; i++) {
    columnDistances.push(columnPositions[i] - columnPositions[i - 1]);
  }
  const minColumnDistance = columnDistances.length > 0 ? Math.min(...columnDistances) : tolerance * 2;
  const columnTolerance = Math.min(minColumnDistance * 0.2, tolerance);
  
  for (const line of lines) {
    const lineX = line.items?.[0]?.x || line.x;
    if (lineX === undefined) continue;
    
    // Check if line starts near any column
    const isAligned = columnPositions.some(colX => Math.abs(lineX - colX) <= columnTolerance);
    if (isAligned) alignedLines++;
  }
  
  const alignmentRatio = alignedLines / lines.length;
  
  // Base confidence on alignment ratio and grid size
  const sizeScore = Math.min(xClusters.length / TABLE_DETECTION.GRID_MAX_COLUMNS, 1) * 
                    Math.min(yClusters.length / TABLE_DETECTION.GRID_MAX_ROWS, 1);
  const confidence = alignmentRatio * TABLE_DETECTION.GRID_ALIGNMENT_WEIGHT + 
                      sizeScore * TABLE_DETECTION.GRID_SIZE_WEIGHT;
  
  return Math.min(confidence, TABLE_DETECTION.GRID_CONFIDENCE_CAP);
}

/**
 * Calculate cluster center (median for robustness)
 * 
 * @param {Array<number>} values - Cluster values
 * @returns {number} Cluster center
 */
function calculateClusterCenter(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Classify element as table using multiple algorithms
 * 
 * @param {{lines?: Array<any>, [key: string]: any}} element - Element to classify
 * @param {{metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Element context with metrics
 * @returns {Object} Classification result
 */
export function classifyTable(element, context = {}) {
  log(`[PDF v3] classifyTable: START - text="${(element?.text || '').substring(0, 50)}", lineCount=${element?.lines?.length || 0}`);
  
  // Validate input
  if (!element || !element.lines || element.lines.length < 2) {
    log(`[PDF v3] classifyTable: VALIDATION FAILED - invalid input`, {
      hasElement: !!element,
      hasLines: !!(element?.lines),
      lineCount: element?.lines?.length || 0
    });
    return {
      type: 'not-table',
      confidence: 0,
      algorithm: 'validation',
      details: { reason: 'invalid-input', hasLines: !!(element?.lines) }
    };
  }
  
  log(`[PDF v3] classifyTable: Running detection algorithms - lineCount=${element.lines.length}`);
  
  // Run all detection algorithms
  const results = [
    detectGridPattern(element, context),
    analyzeColumnAlignment(element, context),
    detectRowStructure(element, context)
  ];
  
  log(`[PDF v3] classifyTable: Algorithm results`, {
    gridPattern: { confidence: results[0].confidence.toFixed(3), details: results[0].details },
    columnAlignment: { confidence: results[1].confidence.toFixed(3), details: results[1].details },
    rowStructure: { confidence: results[2].confidence.toFixed(3), details: results[2].details }
  });
  
  // Weighted voting
  const weights = {
    'grid-pattern': 0.5,
    'column-alignment': 0.3,
    'row-structure': 0.2
  };
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const result of results) {
    if (result.confidence > 0) {
      const weight = weights[result.algorithm] || 0.33;
      const contribution = result.confidence * weight;
      weightedSum += contribution;
      totalWeight += weight;
      log(`[PDF v3] classifyTable: Weighted vote - algorithm=${result.algorithm}, confidence=${result.confidence.toFixed(3)}, weight=${weight.toFixed(2)}, contribution=${contribution.toFixed(3)}`);
    }
  }
  
  const finalConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const isTable = finalConfidence > ELEMENT_DECISION.TABLE_MIN_CONFIDENCE;
  
  log(`[PDF v3] classifyTable: ${isTable ? 'TABLE' : 'NOT TABLE'} - finalConfidence=${finalConfidence.toFixed(3)}, threshold=${ELEMENT_DECISION.TABLE_MIN_CONFIDENCE}`, {
    text: (element.text || '').substring(0, 50),
    lineCount: element.lines?.length || 0,
    weightedSum: weightedSum.toFixed(3),
    totalWeight: totalWeight.toFixed(3),
    results: results.map(r => ({
      algorithm: r.algorithm,
      confidence: r.confidence.toFixed(3)
    }))
  });
  
  return {
    type: isTable ? 'table' : 'not-table',
    confidence: finalConfidence,
    algorithm: 'consensus',
    details: {
      results,
      weightedConfidence: finalConfidence.toFixed(3)
    }
  };
}
