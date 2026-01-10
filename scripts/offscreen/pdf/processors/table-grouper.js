// @ts-check
// Table grouper - groups consecutive table elements into single table
// Handles tables split across pages or columns

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { ELEMENT_DECISION } from '../constants.js';

/**
 * Group consecutive table elements into single table
 * Handles tables split across pages or columns
 * 
 * @param {Array} elements - Array of elements
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Array} Processed elements with grouped tables
 */
export function groupConsecutiveTables(elements, metrics = {}) {
  log(`[PDF v3] groupConsecutiveTables: START - totalElements=${elements?.length || 0}`);
  
  if (!elements || elements.length === 0) {
    log(`[PDF v3] groupConsecutiveTables: NO ELEMENTS - returning empty array`);
    return [];
  }
  
  const tableElements = elements.filter(el => el.type === 'table');
  log(`[PDF v3] groupConsecutiveTables: Found ${tableElements.length} table elements`, {
    tables: tableElements.map((table, idx) => ({
      idx,
      pageNum: table.pageNum,
      rowCount: table.rowCount,
      columnCount: table.columnCount
    }))
  });
  
  const processed = [];
  let currentTable = null;
  
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    
    if (element.type === 'table') {
      log(`[PDF v3] groupConsecutiveTables: Processing table element ${i} - pageNum=${element.pageNum}, rowCount=${element.rowCount}, columnCount=${element.columnCount}`);
      
      if (currentTable && shouldMergeTables(currentTable, element, metrics)) {
        // Merge with current table
        log(`[PDF v3] groupConsecutiveTables: MERGING table ${i} with current table`, {
          currentTable: { pageNum: currentTable.pageNum, rowCount: currentTable.rowCount },
          newTable: { pageNum: element.pageNum, rowCount: element.rowCount }
        });
        
        currentTable.rows.push(...(element.rows || []));
        // Update metadata
        currentTable.rowCount = (currentTable.rowCount || 0) + (element.rowCount || 0);
        if (element.pageNum && (!currentTable.pageNum || element.pageNum > currentTable.pageNum)) {
          currentTable.pageNum = element.pageNum;
        }
        // Update text (combined text from all rows)
        if (element.text) {
          currentTable.text = (currentTable.text || '') + ' ' + element.text;
        }
        log(`[PDF v3] groupConsecutiveTables: Merged table - totalRows=${currentTable.rowCount}, pageNum=${currentTable.pageNum}`);
      } else {
        // Save previous table and start new one
        if (currentTable) {
          log(`[PDF v3] groupConsecutiveTables: Saving previous table - rowCount=${currentTable.rowCount}, pageNum=${currentTable.pageNum}`);
          processed.push(currentTable);
        }
        currentTable = { ...element };
        log(`[PDF v3] groupConsecutiveTables: Started new table - rowCount=${currentTable.rowCount}, pageNum=${currentTable.pageNum}`);
      }
    } else {
      // Not a table - save current table if exists
      if (currentTable) {
        log(`[PDF v3] groupConsecutiveTables: Non-table element ${i} (type=${element.type}) - saving current table`);
        processed.push(currentTable);
        currentTable = null;
      }
      processed.push(element);
    }
  }
  
  // Add last table if exists
  if (currentTable) {
    log(`[PDF v3] groupConsecutiveTables: Saving final table - rowCount=${currentTable.rowCount}, pageNum=${currentTable.pageNum}`);
    processed.push(currentTable);
  }
  
  log(`[PDF v3] groupConsecutiveTables: COMPLETE - processedElements=${processed.length}, originalElements=${elements.length}`);
  
  return processed;
}

/**
 * Check if two tables should be merged
 * 
 * @param {{pageNum?: number, y?: number, [key: string]: any}} table1 - First table element
 * @param {{pageNum?: number, y?: number, [key: string]: any}} table2 - Second table element
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} True if tables should be merged
 */
function shouldMergeTables(table1, table2, metrics) {
  // Check if on different pages (cross-page table)
  const differentPages = table1.pageNum && table2.pageNum && table1.pageNum !== table2.pageNum;
  
  // Check if column count matches
  const colCount1 = table1.columnCount || (table1.rows?.[0]?.length || 0);
  const colCount2 = table2.columnCount || (table2.rows?.[0]?.length || 0);
  const sameColumnCount = colCount1 > 0 && colCount2 > 0 && colCount1 === colCount2;
  
  // Merge if different pages and same column count (likely continuation)
  if (differentPages && sameColumnCount) {
    return true;
  }
  
  // Also merge if on same page but consecutive (might be split by mistake)
  const samePage = table1.pageNum && table2.pageNum && table1.pageNum === table2.pageNum;
  if (samePage && sameColumnCount) {
    // Check if tables are close vertically (within reasonable gap)
    const gap = table2.minY - table1.maxY;
    const maxGap = (metrics.baseFontSize || 12) * 3; // 3x font size max gap
    if (gap > 0 && gap < maxGap) {
      return true;
    }
  }
  
  return false;
}

