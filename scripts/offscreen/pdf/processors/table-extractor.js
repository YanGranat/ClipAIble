// @ts-check
// Table structure extractor - extracts rows and cells from table element

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { DEFAULT_METRICS, ELEMENT_DECISION, TABLE_DETECTION } from '../constants.js';
import { detectTableColumns, detectTableHeaders } from '../utils/table-helpers.js';

/**
 * Extract table structure from element
 * Converts lines into rows and cells
 * 
 * @param {{lines?: Array<any>, text?: string, [key: string]: any}} element - Element with lines
 * @param {{metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Context with metrics
 * @returns {Object|null} Table structure or null if invalid
 */
export function extractTableStructure(element, context = {}) {
  log(`[PDF v3] extractTableStructure: START - lineCount=${element?.lines?.length || 0}, text="${(element?.text || '').substring(0, 50)}"`);
  
  const lines = element.lines || [];
  if (lines.length === 0) {
    log(`[PDF v3] extractTableStructure: NO LINES - returning null`);
    return null;
  }
  
  const baseFontSize = context.metrics?.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  log(`[PDF v3] extractTableStructure: Parameters - baseFontSize=${baseFontSize}, lineCount=${lines.length}`);
  
  // Step 1: Detect column positions
  log(`[PDF v3] extractTableStructure: Step 1 - Detecting column positions`);
  const columns = detectTableColumns(lines, baseFontSize);
  log(`[PDF v3] extractTableStructure: Step 1 - Detected ${columns.length} columns`, {
    columns: columns.map((col, idx) => ({ idx, x: col.toFixed(2) }))
  });
  
  if (columns.length < ELEMENT_DECISION.TABLE_MIN_COLUMNS) {
    log(`[PDF v3] extractTableStructure: INSUFFICIENT COLUMNS - columns=${columns.length}, minRequired=${ELEMENT_DECISION.TABLE_MIN_COLUMNS} - returning null`);
    return null;
  }
  
  // Step 2: Group lines into rows
  log(`[PDF v3] extractTableStructure: Step 2 - Grouping lines into rows`);
  const rows = groupLinesIntoRows(lines, baseFontSize);
  log(`[PDF v3] extractTableStructure: Step 2 - Grouped into ${rows.length} rows`, {
    rows: rows.map((row, idx) => ({
      rowIdx: idx,
      lineCount: row.length,
      y: row[0]?.y?.toFixed(2) || '?',
      text: row.map(l => l.text || '').join(' ').substring(0, 30)
    }))
  });
  
  if (rows.length < ELEMENT_DECISION.TABLE_MIN_ROWS) {
    log(`[PDF v3] extractTableStructure: INSUFFICIENT ROWS - rows=${rows.length}, minRequired=${ELEMENT_DECISION.TABLE_MIN_ROWS} - returning null`);
    return null;
  }
  
  // Step 3: Split rows into cells
  log(`[PDF v3] extractTableStructure: Step 3 - Splitting rows into cells`);
  const tableRows = rows.map((row, rowIdx) => {
    const cells = splitRowIntoCells(row, columns, baseFontSize);
    log(`[PDF v3] extractTableStructure: Step 3 - Row ${rowIdx} split into ${cells.length} cells`, {
      cells: cells.map((cell, cellIdx) => ({ cellIdx, text: cell.substring(0, 30) }))
    });
    return cells;
  });
  
  // Step 4: Detect headers (first row, often bold or different formatting)
  log(`[PDF v3] extractTableStructure: Step 4 - Detecting headers`);
  const hasHeaders = detectTableHeaders(tableRows, rows);
  log(`[PDF v3] extractTableStructure: Step 4 - hasHeaders=${hasHeaders}`);
  
  log(`[PDF v3] extractTableStructure: SUCCESS - Extracted table structure`, {
    columnCount: columns.length,
    rowCount: tableRows.length,
    hasHeaders,
    firstRow: tableRows[0]?.map(cell => cell.substring(0, 20)) || []
  });
  
  return {
    rows: tableRows,
    hasHeaders,
    columnCount: columns.length,
    rowCount: tableRows.length,
    columns // Column X positions for reference
  };
}


/**
 * Group lines into rows based on Y-coordinates
 * 
 * @param {Array} lines - Array of line objects
 * @param {number} baseFontSize - Base font size
 * @returns {Array<Array>} Array of row arrays (each row contains lines)
 */
function groupLinesIntoRows(lines, baseFontSize) {
  const tolerance = baseFontSize * TABLE_DETECTION.ROW_TOLERANCE_MULTIPLIER;
  
  // Sort lines by Y
  const sorted = [...lines].sort((a, b) => (a.y || 0) - (b.y || 0));
  
  const rows = [];
  let currentRow = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    
    if (gap <= tolerance) {
      // Same row (multi-line cell)
      currentRow.push(sorted[i]);
    } else {
      // New row
      rows.push(currentRow);
      currentRow = [sorted[i]];
    }
  }
  
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Split row into cells based on column positions
 * 
 * @param {Array} rowLines - Lines in the row
 * @param {Array<number>} columns - Column X positions
 * @param {number} baseFontSize - Base font size
 * @returns {Array<string>} Array of cell text strings
 */
function splitRowIntoCells(rowLines, columns, baseFontSize) {
  const cells = [];
  
  // Combine all text from row lines
  const combinedText = rowLines.map(line => line.text || '').join(' ').trim();
  
  if (columns.length === 0) {
    return [combinedText]; // Single cell
  }
  
  const tolerance = baseFontSize * TABLE_DETECTION.CELL_TOLERANCE_MULTIPLIER;
  
  // Collect all text items from row with their X positions
  const allItems = [];
  for (const line of rowLines) {
    if (line.items && line.items.length > 0) {
      for (const item of line.items) {
        if (item.x !== undefined && item.x >= 0) {
          allItems.push({
            text: item.str || item.text || '',
            x: item.x,
            width: item.width || 0
          });
        }
      }
    } else if (line.x !== undefined && line.x >= 0) {
      allItems.push({
        text: line.text || '',
        x: line.x,
        width: line.width || 0
      });
    }
  }
  
  // Sort items by X position
  allItems.sort((a, b) => a.x - b.x);
  
  // For each column, find text that belongs to it
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const colX = columns[colIdx];
    const nextColX = colIdx < columns.length - 1 ? columns[colIdx + 1] : Infinity;
    
    // Calculate column boundaries with tolerance
    const leftBoundary = colX - tolerance;
    const rightBoundary = nextColX !== Infinity ? (nextColX - tolerance) : Infinity;
    
    // Find items that belong to this column
    // Item belongs to column if its start X is within column boundaries
    const cellItems = allItems.filter(item => {
      const itemStartX = item.x;
      const itemEndX = item.x + (item.width || 0);
      
      // Item belongs to column if:
      // 1. Item starts within column boundaries, OR
      // 2. Item overlaps significantly with column (more than 50% of item width)
      const startsInColumn = itemStartX >= leftBoundary && itemStartX < rightBoundary;
      const overlapsColumn = itemStartX < rightBoundary && itemEndX > leftBoundary;
      const overlapRatio = item.width > 0 
        ? (Math.min(itemEndX, rightBoundary !== Infinity ? rightBoundary : itemEndX) - Math.max(itemStartX, leftBoundary)) / item.width
        : 0;
      
      return startsInColumn || (overlapsColumn && overlapRatio > TABLE_DETECTION.CELL_OVERLAP_RATIO);
    });
    
    // Combine cell items into text
    const cellText = cellItems
      .map(item => item.text)
      .filter(text => text && text.trim().length > 0)
      .join(' ')
      .trim();
    
    cells.push(cellText || ''); // Empty cell if no text
  }
  
  // Ensure we have the correct number of cells
  while (cells.length < columns.length) {
    cells.push('');
  }
  
  return cells;
}


