// @ts-check
// Table column merger - combines elements from different columns into tables
// This handles cases where tables are split across columns

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { classifyTable } from '../classifiers/table.js';
import { extractTableStructure } from './table-extractor.js';
import { ELEMENT_DECISION, DEFAULT_METRICS, TABLE_DETECTION } from '../constants.js';
import { normalizeYCoordinate, getColumnIndexForElement, detectTableColumns, detectTableHeaders } from '../utils/table-helpers.js';
import { checkGraphicsInElementArea } from '../utils/graphics-extractor.js';
import { getGraphicsDataForPage } from '../utils/graphics-helpers.js';

/**
 * Combine elements from different columns into tables
 * Elements that are on the same Y-coordinate across multiple columns are likely table rows
 * 
 * @param {Array} elements - Array of elements from different columns
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Array} Processed elements with tables merged
 */
export function mergeColumnElementsIntoTables(elements, metrics = {}) {
  log(`[PDF v3] mergeColumnElementsIntoTables: START - totalElements=${elements?.length || 0}`);
  
  if (!elements || elements.length === 0) {
    log(`[PDF v3] mergeColumnElementsIntoTables: NO ELEMENTS - returning empty array`);
    return elements;
  }
  
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const yTolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
  log(`[PDF v3] mergeColumnElementsIntoTables: Parameters - baseFontSize=${baseFontSize}, yTolerance=${yTolerance.toFixed(2)}`);
  
  // Group elements by page
  const elementsByPage = {};
  for (const element of elements) {
    const pageNum = element.pageNum || 0;
    if (!elementsByPage[pageNum]) {
      elementsByPage[pageNum] = [];
    }
    elementsByPage[pageNum].push(element);
  }
  
  log(`[PDF v3] mergeColumnElementsIntoTables: Grouped by pages - pages=${Object.keys(elementsByPage).length}`, {
    pages: Object.keys(elementsByPage).map(p => ({ pageNum: p, elementCount: elementsByPage[p].length }))
  });
  
  const allTables = [];
  const processedElements = new Set();
  
  // Process each page separately
  for (const [pageNumStr, pageElements] of Object.entries(elementsByPage)) {
    const pageNum = parseInt(pageNumStr, 10);
    log(`[PDF v3] mergeColumnElementsIntoTables: Processing page ${pageNum} - elementCount=${pageElements.length}`);
    
    // Find all elements that have columnIndex (from multi-column layout) OR are table-fragments
    // CRITICAL: table-fragment elements don't have columnIndex but are from Column 0
    const columnElements = pageElements.filter(el => 
      el.columnIndex !== undefined || el.type === 'table-fragment'
    );
    
    // CRITICAL: Log all elements that are NOT in columnElements (might be missing from table detection)
    const nonColumnElements = pageElements.filter(el => 
      el.columnIndex === undefined && el.type !== 'table-fragment'
    );
    if (nonColumnElements.length > 0) {
      log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Found ${nonColumnElements.length} elements WITHOUT columnIndex (not in columnElements)`, {
        elements: nonColumnElements.map(el => ({
          type: el.type,
          text: (el.text || '').substring(0, 50),
          minY: el.minY?.toFixed(2) || '?',
          maxY: el.maxY?.toFixed(2) || '?',
          lineCount: el.lines?.length || 0,
          lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
        }))
      });
    }
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Found ${columnElements.length} elements with columnIndex/table-fragment`, {
      columnElements: columnElements.map(el => ({
        type: el.type,
        columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
          text: (el.text || '').substring(0, 30),
          minY: el.minY?.toFixed(2) || '?',
          maxY: el.maxY?.toFixed(2) || '?',
          lineCount: el.lines?.length || 0,
          lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
      }))
    });
    
    if (columnElements.length < 2) {
      log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - INSUFFICIENT COLUMN ELEMENTS (need at least 2) - skipping`);
      continue; // Need at least 2 elements from different columns
    }
    
    // Group elements by Y-coordinate (with tolerance based on baseFontSize)
    const rowsByY = {};
    const yToleranceAdjusted = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Grouping elements by Y-coordinate - yTolerance=${yToleranceAdjusted.toFixed(2)}`);
    
    for (const element of columnElements) {
      // CRITICAL: Skip headings - they are never part of tables
      if (element.type === 'heading') {
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Skipping heading element (already classified, not a table) - text="${(element.text || '').substring(0, 50)}"`);
        continue;
      }
      
      // For paragraph elements, check if they are likely real paragraphs (long text, many lines)
      // Short paragraph elements might be table cells, so we should still try to merge them
      // BUT: if graphics (table borders) are present, it's a strong indicator of a table
      let hasGraphicsInArea = false;
      const pageGraphicsData = getGraphicsDataForPage(metrics, element.pageNum);
      if (pageGraphicsData) {
        const graphicsCheck = checkGraphicsInElementArea([element], pageGraphicsData, null, baseFontSize);
        hasGraphicsInArea = graphicsCheck.hasGraphics;
        if (hasGraphicsInArea) {
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Graphics detected in element area - horizontalLines=${graphicsCheck.horizontalLines}, verticalLines=${graphicsCheck.verticalLines}, totalLines=${graphicsCheck.totalLines} - strong table indicator`);
        }
      }
      
      if (element.type === 'paragraph') {
        const textLength = (element.text || '').length;
        const lineCount = element.lines ? element.lines.length : 1;
        const avgLineLength = lineCount > 0 ? textLength / lineCount : textLength;
        
        // Skip only if it's clearly a paragraph (long text OR many lines with long average line length)
        // Short elements (few lines, short text) might be table cells
        // BUT: if graphics are present, don't skip - it's likely a table even if text is long
        const isLongText = textLength > TABLE_DETECTION.PARAGRAPH_TEXT_LENGTH_THRESHOLD;
        const hasManyLines = lineCount >= TABLE_DETECTION.PARAGRAPH_LINE_COUNT_THRESHOLD;
        const hasLongLines = avgLineLength > TABLE_DETECTION.PARAGRAPH_AVG_LINE_LENGTH_THRESHOLD;
        
        // Only skip if it's clearly a paragraph AND no graphics are present
        // Graphics are a strong indicator of a table, so we should process even long text
        if ((isLongText || (hasManyLines && hasLongLines)) && !hasGraphicsInArea) {
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Skipping paragraph element (likely real paragraph, not a table cell) - textLength=${textLength}, lineCount=${lineCount}, avgLineLength=${avgLineLength.toFixed(1)}, hasGraphics=${hasGraphicsInArea}`);
          continue;
        }
        // Otherwise, continue - it might be a table cell (especially if graphics are present)
        if (hasGraphicsInArea) {
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Element has graphics in area - processing as potential table even though classified as paragraph`);
        }
      }
      
      // CRITICAL: For elements with multiple lines (like Column 0 which contains table headers + cells),
      // we need to check ALL lines, not just minY
      // This allows us to match "Parameter" (Y=248.20) from Column 0 with "Value" (Y=248.20) from Column 2
      const elementYs = [];
      
      if (element.lines && element.lines.length > 0) {
        // Collect all Y-coordinates from lines
        for (const line of element.lines) {
          if (line.y !== undefined && line.y >= 0) {
            elementYs.push(line.y);
          }
        }
      }
      
      // Fallback to minY if no lines
      if (elementYs.length === 0 && element.minY !== undefined) {
        elementYs.push(element.minY);
      }
      
      if (elementYs.length === 0) {
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Element has no Y-coordinates - skipping`, {
          columnIndex: element.columnIndex,
          text: (element.text || '').substring(0, 30)
        });
        continue;
      }
      
      // For each Y-coordinate, try to add to existing row or create new one
      for (const y of elementYs) {
        // Normalize Y-coordinate FIRST to ensure consistent grouping
        const normalizedYKey = normalizeYCoordinate(y, yToleranceAdjusted);
        
        // Find existing row with normalized Y (direct key lookup is faster and more reliable)
        let foundRow = false;
        if (rowsByY[normalizedYKey]) {
          // Check if this element is already in this row (avoid duplicates)
          const alreadyInRow = rowsByY[normalizedYKey].some(el => el === element);
          if (!alreadyInRow) {
            rowsByY[normalizedYKey].push(element);
            const effectiveColumnIndex = element.columnIndex !== undefined ? element.columnIndex : (element.type === 'table-fragment' ? 0 : '?');
            log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Added element to existing row - rowY=${normalizedYKey}, elementY=${y.toFixed(2)}, columnIndex=${effectiveColumnIndex}, type=${element.type}, text="${(element.text || '').substring(0, 30)}"`);
          }
          foundRow = true;
        } else {
          // Also check for rows within tolerance (fallback for edge cases)
          // Use tolerance-based search with normalized values
          for (const [rowYKey, rowElements] of Object.entries(rowsByY)) {
            const rowY = parseFloat(rowYKey);
            const normalizedY = parseFloat(normalizedYKey);
            const diff = Math.abs(normalizedY - rowY);
            if (diff <= yToleranceAdjusted + 0.01) { // Add small epsilon for rounding
              // Check if this element is already in this row (avoid duplicates)
              const alreadyInRow = rowElements.some(el => el === element);
              if (!alreadyInRow) {
                rowElements.push(element);
                const effectiveColumnIndex = element.columnIndex !== undefined ? element.columnIndex : (element.type === 'table-fragment' ? 0 : '?');
                log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Added element to existing row (tolerance match) - rowY=${rowYKey}, normalizedY=${normalizedYKey}, elementY=${y.toFixed(2)}, columnIndex=${effectiveColumnIndex}, type=${element.type}, text="${(element.text || '').substring(0, 30)}"`);
                
              }
              foundRow = true;
              break;
            }
          }
        }
        
        if (!foundRow) {
          // Create new row with normalized Y (use string key)
          if (!rowsByY[normalizedYKey]) {
            rowsByY[normalizedYKey] = [];
          }
          // Check if element is already in this row
          if (!rowsByY[normalizedYKey].some(el => el === element)) {
            rowsByY[normalizedYKey].push(element);
            const effectiveColumnIndex = element.columnIndex !== undefined ? element.columnIndex : (element.type === 'table-fragment' ? 0 : '?');
            log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Created new row - rowY=${normalizedYKey} (normalized from ${y.toFixed(2)}), columnIndex=${effectiveColumnIndex}, type=${element.type}, text="${(element.text || '').substring(0, 30)}"`);
            
          }
        }
      }
    }
    
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Grouped into ${Object.keys(rowsByY).length} potential rows`);
    
    // Filter rows that have elements from multiple columns
    // CRITICAL: Also consider table-fragment elements (they don't have columnIndex but are from Column 0)
    const tableRows = [];
    for (const [yStr, rowElements] of Object.entries(rowsByY)) {
      // Count unique columns (including table-fragments as column 0)
      // Elements from Column 0 that are on the same Y-coordinate as elements from other columns are likely table cells
      const uniqueColumns = new Set();
      for (const el of rowElements) {
        const colIndex = getColumnIndexForElement(el);
        if (colIndex !== undefined) {
          uniqueColumns.add(colIndex);
        }
      }
      
      // If we have elements from Column 0 (non-fragment) AND elements from other columns,
      // ensure Column 0 is counted.
      if (uniqueColumns.size > 1) {
        // If we already have multiple columns, check if Column 0 elements should be included
        const hasColumn0Elements = rowElements.some(el => 
          (el.columnIndex === 0 || (!el.columnIndex && el.type !== 'heading')) && 
          el.type !== 'table-fragment'
        );
        const hasOtherColumns = rowElements.some(el => 
          el.columnIndex !== undefined && el.columnIndex !== 0
        );
        
        if (hasColumn0Elements && hasOtherColumns) {
          uniqueColumns.add(0);
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Row Y=${yStr} - Added Column 0 (non-fragment) because row has other columns - uniqueColumns=${uniqueColumns.size}`);
        }
      }
      
      log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Row Y=${yStr} - uniqueColumns=${uniqueColumns.size}, columns=[${Array.from(uniqueColumns).join(', ')}], elementCount=${rowElements.length}`, {
        elements: rowElements.map(el => ({
          type: el.type,
          columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
          text: (el.text || '').substring(0, 30),
          minY: el.minY?.toFixed(2) || '?',
          maxY: el.maxY?.toFixed(2) || '?',
          lineCount: el.lines?.length || 0,
          lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
        }))
      });
      
      // CRITICAL: Log all rows that will be skipped (insufficient columns)
      if (uniqueColumns.size < 2) {
        log(`[PDF v3] mergeColumnElementsIntoTables: SKIPPED ROW - rowY=${yStr}, uniqueColumns=${uniqueColumns.size}, elementCount=${rowElements.length}, reason=insufficient-columns`, {
          rowY: yStr,
          uniqueColumns: Array.from(uniqueColumns),
          elements: rowElements.map((el, elIdx) => ({
            elIdx,
            type: el.type,
            columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
            text: (el.text || '').substring(0, 50),
            minY: el.minY?.toFixed(2) || '?',
            maxY: el.maxY?.toFixed(2) || '?',
            lineCount: el.lines?.length || 0,
            lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
          }))
        });
      }
      
      const rowYFloat = parseFloat(yStr);
      
      if (uniqueColumns.size >= 2) {
        // Sort elements by column index
        rowElements.sort((a, b) => {
          const colA = getColumnIndexForElement(a) ?? -1;
          const colB = getColumnIndexForElement(b) ?? -1;
          return colA - colB;
        });
        
        tableRows.push({
          y: rowYFloat,
          elements: rowElements,
          columnCount: uniqueColumns.size
        });
        
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Added table row - y=${yStr}, columnCount=${uniqueColumns.size}, elements=${rowElements.map(el => `C${getColumnIndexForElement(el) ?? '?'}:"${(el.text || '').substring(0, 20)}"`).join(', ')}`);
      } else {
        // CRITICAL: Log all skipped rows with detailed information
        log(`[PDF v3] mergeColumnElementsIntoTables: SKIPPED ROW - rowY=${yStr}, uniqueColumns=${uniqueColumns.size}, elementCount=${rowElements.length}, need at least 2 columns`, {
          rowY: yStr,
          uniqueColumns: Array.from(uniqueColumns),
          elements: rowElements.map((el, elIdx) => ({
            elIdx,
            type: el.type,
            columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
            text: (el.text || '').substring(0, 50),
            minY: el.minY?.toFixed(2) || '?',
            maxY: el.maxY?.toFixed(2) || '?',
            lineCount: el.lines?.length || 0,
            lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
          })),
          // Check if this row has elements that should match with other columns
          potentialMatches: {
            // Find elements from other columns that are close to this Y
            nearbyElements: columnElements.filter(el => {
              const elY = el.minY || (el.lines?.[0]?.y) || 0;
              return Math.abs(elY - parseFloat(yStr)) < yToleranceAdjusted * 2;
            }).map(el => ({
              columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
              text: (el.text || '').substring(0, 30),
              minY: el.minY?.toFixed(2) || '?',
              lineYs: el.lines?.map(l => l.y?.toFixed(2) || '?').join(', ') || 'none'
            }))
          }
        });
      }
    }
    
    if (tableRows.length === 0) {
      log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - NO TABLE ROWS FOUND - skipping page`);
      continue;
    }
    
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Found ${tableRows.length} table rows`);
    
    // Sort rows by Y
    tableRows.sort((a, b) => a.y - b.y);
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Sorted ${tableRows.length} rows by Y`);
    
    // Group consecutive rows into tables
    // Rows should be close vertically and have same column count
    let currentTableRows = [];
    const rowGapTolerance = baseFontSize * TABLE_DETECTION.ROW_GAP_MULTIPLIER;
    log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Grouping rows into tables - rowGapTolerance=${rowGapTolerance.toFixed(2)}, minRows=${ELEMENT_DECISION.TABLE_MIN_ROWS}`);
    
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i];
      
      if (currentTableRows.length === 0) {
        currentTableRows.push(row);
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Started new table - row ${i}, y=${row.y.toFixed(2)}, columnCount=${row.columnCount}`);
      } else {
        const prevRow = currentTableRows[currentTableRows.length - 1];
        const gap = row.y - prevRow.y;
        
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Evaluating row ${i} - y=${row.y.toFixed(2)}, gap=${gap.toFixed(2)}, columnCount=${row.columnCount}, prevColumnCount=${prevRow.columnCount}`);
        
        // Check if this row should be added to current table
        if (gap <= rowGapTolerance && row.columnCount === prevRow.columnCount) {
          currentTableRows.push(row);
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Added row ${i} to current table - totalRows=${currentTableRows.length}`);
        } else {
          // Finish current table
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Row ${i} does NOT belong to current table - gap=${gap.toFixed(2)} (max=${rowGapTolerance.toFixed(2)}), columnCountMatch=${row.columnCount === prevRow.columnCount}`);
          
          // CRITICAL: Log why row was rejected
          if (gap > rowGapTolerance) {
            log(`[PDF v3] mergeColumnElementsIntoTables: REJECTED ROW - rowY=${row.y.toFixed(2)}, gap=${gap.toFixed(2)} > maxGap=${rowGapTolerance.toFixed(2)}, reason=gap-too-large`, {
              row: {
                y: row.y.toFixed(2),
                columnCount: row.columnCount,
                elements: row.elements.map(el => ({
                  columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
                  text: (el.text || '').substring(0, 30)
                }))
              },
              prevRow: {
                y: prevRow.y.toFixed(2),
                columnCount: prevRow.columnCount
              }
            });
          }
          if (row.columnCount !== prevRow.columnCount) {
            log(`[PDF v3] mergeColumnElementsIntoTables: REJECTED ROW - rowY=${row.y.toFixed(2)}, columnCount=${row.columnCount} != prevColumnCount=${prevRow.columnCount}, reason=column-count-mismatch`, {
              row: {
                y: row.y.toFixed(2),
                columnCount: row.columnCount,
                elements: row.elements.map(el => ({
                  columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
                  text: (el.text || '').substring(0, 30)
                }))
              },
              prevRow: {
                y: prevRow.y.toFixed(2),
                columnCount: prevRow.columnCount
              }
            });
          }
          if (currentTableRows.length >= ELEMENT_DECISION.TABLE_MIN_ROWS) {
            // CRITICAL: Verify this is actually a table, not just multi-column text
            const isValidTable = validateTableStructure(currentTableRows, metrics);
            if (isValidTable) {
              log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Calling createTableFromRows with ${currentTableRows.length} rows`);
              try {
                const table = createTableFromRows(currentTableRows, metrics, pageNum);
                if (table) {
                  allTables.push(table);
                  log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Created table from ${currentTableRows.length} rows`);
                  // Mark elements as processed
                  for (const tableRow of currentTableRows) {
                    if (tableRow && tableRow.elements && Array.isArray(tableRow.elements)) {
                      for (const el of tableRow.elements) {
                        if (el) {
                          processedElements.add(el);
                        }
                      }
                    }
                  }
                } else {
                  log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Failed to create table from ${currentTableRows.length} rows (createTableFromRows returned null)`);
                }
              } catch (error) {
                logWarn(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Error creating table from ${currentTableRows.length} rows`, error);
                log(`[PDF v3] mergeColumnElementsIntoTables: Error details - message=${error?.message || 'unknown'}, stack=${error?.stack?.substring(0, 200) || 'no stack'}`);
              }
            } else {
              log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - REJECTED table (not a valid table structure, likely multi-column text) - rowCount=${currentTableRows.length}`);
            }
          } else {
            log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Discarded table (only ${currentTableRows.length} rows, need ${ELEMENT_DECISION.TABLE_MIN_ROWS})`);
          }
          currentTableRows = [row];
          log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Started new table - row ${i}, y=${row.y.toFixed(2)}, columnCount=${row.columnCount}`);
        }
      }
    }
    
    // Finish last table
    if (currentTableRows.length >= ELEMENT_DECISION.TABLE_MIN_ROWS) {
      // CRITICAL: Verify this is actually a table, not just multi-column text
      const isValidTable = validateTableStructure(currentTableRows, metrics);
      if (isValidTable) {
        try {
          const table = createTableFromRows(currentTableRows, metrics, pageNum);
          if (table) {
            allTables.push(table);
            log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Created final table from ${currentTableRows.length} rows`);
            for (const tableRow of currentTableRows) {
              if (tableRow && tableRow.elements && Array.isArray(tableRow.elements)) {
                for (const el of tableRow.elements) {
                  if (el) {
                    processedElements.add(el);
                  }
                }
              }
            }
          } else {
            log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Failed to create final table from ${currentTableRows.length} rows (createTableFromRows returned null)`);
          }
        } catch (error) {
          logWarn(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - Error creating final table from ${currentTableRows.length} rows`, error);
        }
      } else {
        log(`[PDF v3] mergeColumnElementsIntoTables: Page ${pageNum} - REJECTED final table (not a valid table structure, likely multi-column text) - rowCount=${currentTableRows.length}`);
      }
            } else if (currentTableRows.length > 0) {
              // CRITICAL: Log discarded final tables with details
              log(`[PDF v3] mergeColumnElementsIntoTables: DISCARDED FINAL TABLE - Page ${pageNum}, rowCount=${currentTableRows.length}, need ${ELEMENT_DECISION.TABLE_MIN_ROWS}`, {
                rows: currentTableRows.map((r, idx) => ({
                  rowIdx: idx,
                  y: r.y.toFixed(2),
                  columnCount: r.columnCount,
                  elements: r.elements.map(el => ({
                    columnIndex: el.columnIndex !== undefined ? el.columnIndex : (el.type === 'table-fragment' ? 0 : '?'),
                    text: (el.text || '').substring(0, 30)
                  }))
                }))
              });
            }
  }
  
  // Replace processed elements with tables
  // CRITICAL: Convert table-fragment elements that weren't used in tables back to paragraphs
  const result = [];
  for (const element of elements) {
    if (!processedElements.has(element)) {
      // If element is table-fragment but wasn't processed, convert it back to paragraph
      if (element.type === 'table-fragment') {
        log(`[PDF v3] mergeColumnElementsIntoTables: Converting unused table-fragment back to paragraph - text="${(element.text || '').substring(0, 50)}..."`);
        const paragraphElement = {
          ...element,
          type: 'paragraph'
        };
        // Remove table-fragment specific properties
        delete paragraphElement.tableFragment;
        result.push(paragraphElement);
      } else {
        result.push(element);
      }
    }
  }
  
  // Add tables in correct position (sorted by page and Y)
  result.push(...allTables);
  result.sort((a, b) => {
    const pageA = a.pageNum || 0;
    const pageB = b.pageNum || 0;
    if (pageA !== pageB) return pageA - pageB;
    
    const yA = a.minY || 0;
    const yB = b.minY || 0;
    return yA - yB;
  });
  
  log(`[PDF v3] mergeColumnElementsIntoTables: COMPLETE - Created ${allTables.length} tables, processed ${processedElements.size} elements, resultElements=${result.length}`, {
    tables: allTables.map((table, idx) => ({
      idx,
      pageNum: table.pageNum,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      hasHeaders: table.hasHeaders,
      firstRow: table.rows?.[0]?.map(cell => cell.substring(0, 20)) || []
    }))
  });
  
  return result;
}

/**
 * Validate that rows form a real table, not just multi-column text
 * 
 * @param {Array} rows - Array of row objects with elements
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {boolean} True if valid table structure
 */
function validateTableStructure(rows, metrics) {
  if (rows.length < ELEMENT_DECISION.TABLE_MIN_ROWS) {
    return false;
  }
  
  // Get baseFontSize from metrics
  const baseFontSize = (metrics && metrics.baseFontSize) ? metrics.baseFontSize : DEFAULT_METRICS.BASE_FONT_SIZE;
  
  // Collect all lines from all rows to create a test element
  const allLines = [];
  for (const row of rows) {
    for (const el of row.elements) {
      if (el.lines && el.lines.length > 0) {
        // Filter lines that match this row's Y-coordinate
        const rowY = row.y;
        const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
        const yTolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
        
        const matchingLines = el.lines.filter(line => {
          if (line.y === undefined) return false;
          return Math.abs(line.y - rowY) <= yTolerance;
        });
        
        allLines.push(...matchingLines);
      }
    }
  }
  
  if (allLines.length < 2) {
    log(`[PDF v3] validateTableStructure: INVALID - too few lines (${allLines.length})`);
    return false;
  }
  
  // Create test element for classification
  const testElement = {
    lines: allLines,
    text: allLines.map(l => l.text || '').join(' ')
  };
  
  // Use classifyTable to verify this is actually a table
  const classification = classifyTable(testElement, { metrics });
  const isTable = classification.type === 'table' && classification.confidence >= ELEMENT_DECISION.TABLE_MIN_CONFIDENCE;
  
  // Additional checks: tables should have relatively short cell text
  // Multi-column text paragraphs have long lines
  // OPTIMIZATION: Calculate all statistics in a single pass
  let totalCellLength = 0;
  let totalCellCount = 0;
  let rowsWithLongCells = 0;
  const rowLengths = [];
  
  for (const row of rows) {
    if (!row || !row.elements || !Array.isArray(row.elements)) continue;
    
    let rowLength = 0;
    for (const el of row.elements) {
      const cellText = (el && el.text) ? el.text : '';
      const cellLength = cellText.length;
      rowLength += cellLength;
      totalCellLength += cellLength;
      totalCellCount++;
    }
    
    const rowAvgLength = row.elements.length > 0 ? rowLength / row.elements.length : 0;
    rowLengths.push(rowLength);
    
    if (rowAvgLength > TABLE_DETECTION.MAX_LONG_CELL_LENGTH) {
      rowsWithLongCells++;
    }
  }
  
  const avgCellLength = totalCellCount > 0 ? totalCellLength / totalCellCount : 0;
  const hasReasonableCellLength = avgCellLength < TABLE_DETECTION.MAX_AVG_CELL_LENGTH;
  
  const longCellRatio = rows.length > 0 ? rowsWithLongCells / rows.length : 0;
  const hasMostlyShortCells = longCellRatio < TABLE_DETECTION.MAX_LONG_CELL_RATIO;
  
  // Calculate row length variance
  const avgRowLength = rowLengths.length > 0 
    ? rowLengths.reduce((sum, len) => sum + len, 0) / rowLengths.length 
    : 0;
  const rowLengthVariance = rowLengths.length > 0
    ? rowLengths.reduce((sum, len) => sum + Math.pow(len - avgRowLength, 2), 0) / rowLengths.length
    : 0;
  const rowLengthStdDev = Math.sqrt(rowLengthVariance);
  const hasVariedRowLengths = avgRowLength > 0 ? rowLengthStdDev / avgRowLength > TABLE_DETECTION.MIN_ROW_LENGTH_VARIANCE : false;
  
  log(`[PDF v3] validateTableStructure: Classification - isTable=${isTable}, confidence=${classification.confidence.toFixed(3)}, avgCellLength=${avgCellLength.toFixed(1)}, hasReasonableCellLength=${hasReasonableCellLength}, longCellRatio=${longCellRatio.toFixed(3)}, hasMostlyShortCells=${hasMostlyShortCells}, hasVariedRowLengths=${hasVariedRowLengths}`);
  
  // Check for graphics elements (lines/borders) in the table area - strong indicator of a real table
  let hasGraphics = false;
  let graphicsDetails = null;
  if (metrics && metrics.graphicsData) {
    // Get graphics data for the page (assume page 1 if not specified)
    const pageNum = rows[0]?.elements?.[0]?.pageNum || 1;
    log(`[PDF v3] validateTableStructure: Checking graphics - pageNum=${pageNum}, graphicsDataKeys=${Object.keys(metrics.graphicsData).join(',')}, hasGraphicsData=${!!metrics.graphicsData[pageNum]}`);
    
    const pageGraphicsData = getGraphicsDataForPage(metrics, pageNum);
    
    if (pageGraphicsData) {
      // Collect all elements from all rows
      const allElements = [];
      for (const row of rows) {
        if (row && row.elements && Array.isArray(row.elements)) {
          allElements.push(...row.elements);
        }
      }
      
      if (allElements.length > 0) {
        log(`[PDF v3] validateTableStructure: Checking graphics for ${allElements.length} elements, graphicsData has ${pageGraphicsData.lines?.length || 0} lines`);
        
        try {
          const graphicsCheck = checkGraphicsInElementArea(allElements, pageGraphicsData, null, baseFontSize);
          hasGraphics = graphicsCheck.hasGraphics;
          graphicsDetails = graphicsCheck;
          
          log(`[PDF v3] validateTableStructure: Graphics check - hasGraphics=${hasGraphics}, horizontalLines=${graphicsCheck.horizontalLines}, verticalLines=${graphicsCheck.verticalLines}, totalLines=${graphicsCheck.totalLines}`);
        } catch (error) {
          logWarn(`[PDF v3] validateTableStructure: Error checking graphics`, error);
          log(`[PDF v3] validateTableStructure: Error details - message=${error?.message || 'unknown'}, stack=${error?.stack?.substring(0, 200) || 'no stack'}`);
          hasGraphics = false; // Default to false on error
        }
      } else {
        log(`[PDF v3] validateTableStructure: No elements to check graphics for`);
      }
    } else {
      log(`[PDF v3] validateTableStructure: No graphics data for page ${pageNum}`);
    }
  } else {
    log(`[PDF v3] validateTableStructure: No graphicsData in metrics`);
  }
  
  // If graphics are present, it's a strong indicator of a table - boost confidence
  // If no graphics, rely on other checks (some tables don't have visible borders)
  // CRITICAL: For tables without graphics, we should be more lenient if classification is strong
  // Many tables don't have visible borders but are still valid tables
  const baseResult = isTable && hasReasonableCellLength && hasMostlyShortCells;
  
  // If graphics are present, be more lenient with other checks
  if (hasGraphics) {
    log(`[PDF v3] validateTableStructure: Graphics detected - boosting table confidence`);
    // With graphics, we can be more lenient - only require classification and reasonable cell length
    const result = isTable && hasReasonableCellLength;
    log(`[PDF v3] validateTableStructure: RESULT (with graphics) - isValid=${result}, isTable=${isTable}, hasReasonableCellLength=${hasReasonableCellLength}`);
    return result;
  }
  
  // Without graphics, require classification, reasonable cell length, and mostly short cells
  // Row variance is not required - many valid tables have consistent row lengths
  // If classification confidence is high (>= 0.7), we can trust it even without graphics
  const highConfidence = classification.confidence >= 0.7;
  const result = highConfidence 
    ? (isTable && hasReasonableCellLength && hasMostlyShortCells)
    : baseResult;
  
  log(`[PDF v3] validateTableStructure: RESULT (no graphics) - isValid=${result}, isTable=${isTable}, confidence=${classification.confidence.toFixed(3)}, highConfidence=${highConfidence}, hasReasonableCellLength=${hasReasonableCellLength}, hasMostlyShortCells=${hasMostlyShortCells}, hasVariedRowLengths=${hasVariedRowLengths}`);
  return result;
}

/**
 * Create a table element from grouped rows
 * 
 * @param {Array} rows - Array of row objects with elements
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {number} pageNum - Page number
 * @returns {Object} Table element
 */
function createTableFromRows(rows, metrics, pageNum) {
  log(`[PDF v3] createTableFromRows: START - rows=${rows?.length || 0}, pageNum=${pageNum}`);
  if (!rows || rows.length === 0) {
    log(`[PDF v3] createTableFromRows: Invalid input - rows=${rows?.length || 0}`);
    return null;
  }
  
  // Extract table structure - ensure all rows have same number of columns
  const columnCounts = rows.map(row => (row && row.elements && Array.isArray(row.elements)) ? row.elements.length : 0);
  if (columnCounts.length === 0) {
    log(`[PDF v3] createTableFromRows: No rows provided`);
    return null;
  }
  const maxColumns = Math.max(...columnCounts);
  if (maxColumns === 0) {
    log(`[PDF v3] createTableFromRows: No columns found in rows`);
    return null;
  }
  
  const baseFontSize = (metrics && metrics.baseFontSize) ? metrics.baseFontSize : DEFAULT_METRICS.BASE_FONT_SIZE;
  const yTolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
  
  const tableRows = rows.map((row, rowIdx) => {
    if (!row || !row.elements || !Array.isArray(row.elements)) {
      log(`[PDF v3] createTableFromRows: Invalid row ${rowIdx} - missing elements`);
      return [];
    }
    
    const rowY = row.y || 0;
    log(`[PDF v3] createTableFromRows: Processing row ${rowIdx} - rowY=${rowY.toFixed(2)}, elementCount=${row.elements.length}`);
    
    const cells = row.elements.map((el, elIdx) => {
      if (!el) {
        log(`[PDF v3] createTableFromRows: Row ${rowIdx}, Cell ${elIdx} - null element, skipping`);
        return '';
      }
      // CRITICAL: Extract text only for lines that match this row's Y-coordinate
      // This is needed because elements from Column 0 may contain multiple table rows
      let cellText = '';
      
      if (el.lines && el.lines.length > 0) {
        // Filter lines that match this row's Y-coordinate
        const matchingLines = el.lines.filter(line => {
          if (line.y === undefined) return false;
          return Math.abs(line.y - rowY) <= yTolerance;
        });
        
        if (matchingLines.length > 0) {
          // Use only matching lines
          cellText = matchingLines.map(line => line.text || '').join(' ').trim();
          
          log(`[PDF v3] createTableFromRows: Row ${rowIdx}, Cell ${elIdx} - Found ${matchingLines.length} matching lines (out of ${el.lines.length} total), text="${cellText.substring(0, 30)}"`);
        } else {
          // Fallback: if no matching lines, use all lines (shouldn't happen, but safety)
          log(`[PDF v3] createTableFromRows: Row ${rowIdx}, Cell ${elIdx} - NO MATCHING LINES (rowY=${rowY.toFixed(2)}, element has ${el.lines.length} lines), using all lines`);
          cellText = el.lines.map(line => line.text || '').join(' ').trim();
          
        }
      } else if (el.text) {
        // Fallback to text if no lines available
        cellText = el.text.trim();
        log(`[PDF v3] createTableFromRows: Row ${rowIdx}, Cell ${elIdx} - Using element.text (no lines), text="${cellText.substring(0, 30)}"`);
      }
      
      return cellText || '';
    }).filter(cell => cell !== null && cell !== undefined);
    
    // Pad with empty cells if needed
    while (cells.length < maxColumns) {
      cells.push('');
    }
    
    log(`[PDF v3] createTableFromRows: Row ${rowIdx} - Extracted ${cells.length} cells: [${cells.map(c => `"${String(c).substring(0, 20)}"`).join(', ')}]`);
    return cells;
  }).filter(row => row && row.length > 0);
  
  if (tableRows.length === 0) {
    log(`[PDF v3] createTableFromRows: No valid rows extracted`);
    return null;
  }
  
  // Detect headers (first row, often bold or different formatting)
  // Convert rows to rowLines format for detectTableHeaders
  const rowLines = rows
    .filter(row => row && row.elements && Array.isArray(row.elements))
    .map(row => (row.elements || [])
      .filter(el => el != null)
      .flatMap(el => (el.lines && Array.isArray(el.lines)) ? el.lines : []));
  let hasHeaders = detectTableHeaders(tableRows, rowLines);
  
  // Additional check: if first row contains common header words, mark as header
  // This is already handled in detectTableHeaders from utils, but keep for backward compatibility
  if (tableRows.length > 0 && !hasHeaders) {
    const firstRow = tableRows[0];
    const firstRowText = firstRow.join(' ').toLowerCase();
    const containsHeaderWord = TABLE_DETECTION.HEADER_WORDS.some(word => 
      firstRowText.includes(word.toLowerCase())
    );
    if (containsHeaderWord) {
      log(`[PDF v3] createTableFromRows: First row contains header words, marking as header`);
      hasHeaders = true;
    }
  }
  
  // Determine columnIndex for table (use columnIndex from first element, or 0 if from Column 0)
  let tableColumnIndex = 0; // Default to 0 (main column)
  if (rows.length > 0 && rows[0] && rows[0].elements && Array.isArray(rows[0].elements) && rows[0].elements.length > 0) {
    const firstElement = rows[0].elements[0];
    if (firstElement && firstElement.columnIndex !== undefined) {
      tableColumnIndex = firstElement.columnIndex;
    } else if (firstElement && firstElement.type === 'table-fragment') {
      tableColumnIndex = 0; // Table fragments are from Column 0
    }
  }
  
  // Find min/max Y
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (const row of rows) {
    if (row && row.elements && Array.isArray(row.elements)) {
      for (const el of row.elements) {
        if (el && typeof el.minY === 'number' && el.minY < minY) minY = el.minY;
        if (el && typeof el.maxY === 'number' && el.maxY > maxY) maxY = el.maxY;
      }
    }
  }
  
  // Collect all lines for table structure extraction
  const allLines = [];
  for (const row of rows) {
    if (row && row.elements && Array.isArray(row.elements)) {
      for (const el of row.elements) {
        if (el && el.lines && Array.isArray(el.lines) && el.lines.length > 0) {
          allLines.push(...el.lines);
        }
      }
    }
  }
  
  // Try to extract column positions (baseFontSize already declared at function start)
  const columns = allLines.length > 0 ? detectTableColumns(allLines, baseFontSize) : [];
  
  const tableElement = {
    type: 'table',
    rows: tableRows,
    hasHeaders: hasHeaders || false,
    columnCount: maxColumns,
    rowCount: tableRows.length,
    pageNum: pageNum || 0,
    columnIndex: tableColumnIndex, // CRITICAL: Set columnIndex for proper sorting
    minY: minY !== Infinity && isFinite(minY) ? minY : 0,
    maxY: maxY !== -Infinity && isFinite(maxY) ? maxY : 0,
    text: tableRows.map(row => (Array.isArray(row) ? row.join(' ') : '')).join('\n'),
    lines: allLines
  };
  
  if (columns && columns.length > 0) {
    tableElement.columns = columns;
  }
  
  log(`[PDF v3] createTableFromRows: Created table - rows=${tableRows.length}, columns=${maxColumns}, hasHeaders=${hasHeaders}, pageNum=${pageNum}`);
  
  return tableElement;
}


