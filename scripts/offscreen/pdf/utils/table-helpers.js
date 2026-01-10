// @ts-check
// Table helper utilities - shared functions for table detection and extraction

import { clusterObjects } from '../core/clustering.js';
import { TABLE_DETECTION } from '../constants.js';

/**
 * Normalize Y-coordinate for consistent grouping
 * Uses tolerance-based rounding to ensure elements on the same visual row are grouped together
 * 
 * @param {number} y - Y-coordinate
 * @param {number} yTolerance - Tolerance for grouping (usually baseFontSize * 0.3)
 * @returns {string} Normalized Y-key (string to avoid floating-point precision issues)
 */
export function normalizeYCoordinate(y, yTolerance) {
  const toleranceStep = Math.round(y / yTolerance);
  const normalizedYValue = toleranceStep * yTolerance;
  return normalizedYValue.toFixed(2);
}

/**
 * Get effective column index for element
 * Handles table-fragment elements and elements without columnIndex
 * 
 * @param {{type?: string, columnIndex?: number, [key: string]: any}} element - Element object
 * @returns {number|undefined} Column index or undefined
 */
export function getColumnIndexForElement(element) {
  if (element.type === 'table-fragment') {
    return 0; // Table fragments are from Column 0
  }
  if (element.columnIndex !== undefined) {
    return element.columnIndex;
  }
  // Elements without columnIndex but not headings/paragraphs might be from Column 0
  if (element.columnIndex === 0 || (!element.columnIndex && element.type !== 'heading' && element.type !== 'paragraph')) {
    return 0;
  }
  return undefined;
}

/**
 * Detect column positions from lines
 * Clusters X-coordinates to find column boundaries
 * 
 * @param {Array} lines - Array of line objects
 * @param {number} baseFontSize - Base font size
 * @returns {Array<number>} Array of column X positions (sorted)
 */
export function detectTableColumns(lines, baseFontSize) {
  const tolerance = baseFontSize * TABLE_DETECTION.COLUMN_TOLERANCE_MULTIPLIER;
  const xPositions = [];
  const xPositionWeights = new Map(); // Track how many times each position appears
  
  for (const line of lines) {
    if (line.items && line.items.length > 0) {
      for (const item of line.items) {
        if (item.x !== undefined && item.x >= 0) {
          xPositions.push(item.x);
          xPositionWeights.set(item.x, (xPositionWeights.get(item.x) || 0) + 1);
        }
      }
    } else if (line.x !== undefined && line.x >= 0) {
      xPositions.push(line.x);
      xPositionWeights.set(line.x, (xPositionWeights.get(line.x) || 0) + 1);
    }
  }
  
  if (xPositions.length === 0) {
    return [];
  }
  
  // Use weighted clustering: positions that appear more often are more likely to be columns
  const uniquePositions = Array.from(new Set(xPositions)).sort((a, b) => a - b);
  
  // Cluster X-positions to find columns
  const clusters = clusterObjects(
    uniquePositions.map((x, idx) => ({ x, idx, weight: xPositionWeights.get(x) || 1 })),
    obj => obj.x,
    tolerance,
    'table-column-detection'
  );
  
  // Filter clusters: only keep clusters that appear in multiple lines (likely columns)
  const minOccurrences = Math.max(2, Math.floor(lines.length * TABLE_DETECTION.COLUMN_MIN_OCCURRENCE_RATIO));
  const significantClusters = clusters.filter(cluster => {
    const totalWeight = cluster.reduce((sum, c) => sum + (c.weight || 1), 0);
    return totalWeight >= minOccurrences;
  });
  
  // Calculate cluster centers (column positions) using median
  const columnPositions = significantClusters.map(cluster => {
    const values = cluster.map(c => c.x);
    return calculateMedian(values);
  });
  
  return columnPositions.sort((a, b) => a - b);
}

/**
 * Detect if table has headers
 * Uses multiple heuristics: bold ratio, empty cell ratio, header words
 * 
 * @param {Array<Array<string>>} tableRows - Table rows (array of cell arrays)
 * @param {Array<Array>} rowLines - Original row line arrays (for checking bold)
 * @returns {boolean} True if table has headers
 */
export function detectTableHeaders(tableRows, rowLines) {
  if (tableRows.length === 0) return false;
  
  const firstRow = tableRows[0];
  
  // Check if first row is mostly bold (common for headers)
  if (rowLines[0] && rowLines[0].length > 0) {
    const firstRowLines = rowLines[0];
    const boldLines = firstRowLines.filter(line => line.isBold).length;
    const boldRatio = boldLines / firstRowLines.length;
    
    if (boldRatio > TABLE_DETECTION.HEADER_BOLD_RATIO) {
      return true; // More than threshold of first row is bold
    }
  }
  
  // Check if first row contains header words (heuristic)
  const firstRowText = firstRow.join(' ').toLowerCase();
  const containsHeaderWord = TABLE_DETECTION.HEADER_WORDS.some(word => 
    firstRowText.includes(word.toLowerCase())
  );
  if (containsHeaderWord) {
    return true;
  }
  
  // Simple heuristic: if first row has fewer empty cells, might be header
  const firstRowEmptyCells = firstRow.filter(cell => !cell.trim()).length;
  const avgEmptyCells = tableRows.slice(1).reduce((sum, row) => 
    sum + row.filter(cell => !cell.trim()).length, 0
  ) / Math.max(tableRows.length - 1, 1);
  
  return firstRowEmptyCells < avgEmptyCells * TABLE_DETECTION.HEADER_EMPTY_CELL_RATIO;
}

/**
 * Calculate median of values
 * 
 * @param {Array<number>} values - Array of values
 * @returns {number} Median value
 */
function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

