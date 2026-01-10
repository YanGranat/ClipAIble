// @ts-check
// Content extractor - extracts content from all pages

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { processPage } from '../processors/page-processor.js';
import { CROSS_PAGE_BREAK_MARKER } from '../constants.js';

/**
 * Extract content from all pages
 * 
 * @param {{getPage: function(number): Promise<{getTextContent: function(): Promise<any>, cleanup: function(): void}>}} pdf - PDF.js document object
 * @param {number} numPages - Total number of pages
 * @param {{gapThreshold?: number, [key: string]: any}} metrics - PDF metrics with gap analysis
 * @returns {Promise<{elements: Array<any>, hasTextContent: boolean}>} Extracted content
 * @throws {Error} If PDF has no text layer (scanned PDF)
 * @throws {Error} If page extraction fails
 */
export async function extractContentFromPages(pdf, numPages, metrics) {
  // COMMENTED: console.log(secondPassMsg);
  // COMMENTED: log('=== SECOND_PASS_START === ' + secondPassMsg);
  
  // COMMENTED: Force immediate log flush by adding a small delay
  // COMMENTED: await new Promise(resolve => setTimeout(resolve, 10));
  
  // COMMENTED: Log again to ensure visibility
  // COMMENTED: const confirmedMsg = `[PDF v3] SECOND PASS CONFIRMED - CODE VERSION 2025-12-29-v3`;
  // COMMENTED: console.error('=== SECOND_PASS_CONFIRMED ===', confirmedMsg);
  // COMMENTED: console.warn('=== SECOND_PASS_CONFIRMED ===', confirmedMsg);
  // COMMENTED: console.log(confirmedMsg);
  // COMMENTED: log(confirmedMsg);
  
  const allElements = [];
  let hasTextContent = false;
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    log(`[PDF v3] Processing page ${pageNum}/${numPages}`);
    const page = await pdf.getPage(pageNum);
    /** @type {any} */
    const pageAny = page;
    
    try {
      const pageElements = await processPage(pageAny, pageNum, metrics);
      log(`[PDF v3] Page ${pageNum} processed - extracted ${pageElements?.length || 0} elements`);
      
      if (pageElements && pageElements.length > 0) {
        hasTextContent = true;
        allElements.push(...pageElements);
        log(`[PDF v3] Page ${pageNum} - added ${pageElements.length} elements, totalElements=${allElements.length}`);
      } else {
        logWarn(`[PDF v3] Page ${pageNum} - no elements extracted`);
      }
    } catch (error) {
      logWarn(`[PDF v3] Failed to extract content from page ${pageNum}`, {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      // Continue processing other pages even if one fails
    }
    
    // Cleanup page
    try {
      page.cleanup();
    } catch (cleanupError) {
      logWarn(`[PDF v3] Failed to cleanup page ${pageNum}`, cleanupError);
      // Continue anyway
    }
  }
  
  // COMMENTED: log(`[PDF v3] Extraction complete - hasTextContent=${hasTextContent}, allElements.length=${allElements.length}`);
  
  // COMMENTED: Pause after extraction complete to ensure all logs are written
  // COMMENTED: await new Promise(resolve => setTimeout(resolve, 1000));
  
  log(`[PDF v3] Extraction complete - hasTextContent=${hasTextContent}, allElements.length=${allElements.length}, numPages=${numPages}`);
  
  // Only throw error if we truly have no content (no elements AND no text was found)
  // If we have elements, even if hasTextContent is false, we should continue
  if (allElements.length === 0) {
    logWarn(`[PDF v3] No elements extracted from ${numPages} pages - PDF may be scanned or have no text layer`);
    throw new Error('This PDF has no text layer (scanned PDF). OCR is not supported.');
  }
  
  log(`[PDF v3] Content extracted from all pages - totalElements=${allElements.length}`);
  
  // Log elements before sorting
  const beforeSort = allElements.map((el, idx) => {
    const colIdx = el.columnIndex !== undefined ? el.columnIndex : '?';
    const minY = (typeof el.minY === 'number' && el.minY !== 0) ? el.minY.toFixed(2) : (el.lines && el.lines.length > 0 ? el.lines[0].y.toFixed(2) : '0');
    return `[${idx}]P${el.pageNum || '?'}C${colIdx}Y${minY}:${el.type.substring(0, 1)}`;
  }).join(' | ');
  log(`[PDF v3] Elements before sorting - totalElements=${allElements.length}, order=[${beforeSort}]`);
  
  // CRITICAL: Sort elements to maintain correct reading order for multi-column layouts
  // Sort by: pageNum (ascending), then columnIndex (ascending), then Y-coordinate (ascending)
  // This ensures that elements from column 0 come before elements from column 1 on the same page
  allElements.sort((a, b) => {
    // First, sort by page number
    const pageA = a.pageNum || 0;
    const pageB = b.pageNum || 0;
    if (pageA !== pageB) {
      return pageA - pageB;
    }
    
    // Then, sort by column index (if available)
    // Elements without columnIndex (single-column) should come first (columnIndex = -1 for sorting)
    const colA = a.columnIndex !== undefined ? a.columnIndex : -1;
    const colB = b.columnIndex !== undefined ? b.columnIndex : -1;
    if (colA !== colB) {
      return colA - colB;
    }
    
    // Finally, sort by Y-coordinate within the same column
    const yA = (typeof a.minY === 'number' && a.minY !== 0) 
      ? a.minY 
      : (a.lines && a.lines.length > 0 ? a.lines[0].y : 0) || 0;
    const yB = (typeof b.minY === 'number' && b.minY !== 0)
      ? b.minY
      : (b.lines && b.lines.length > 0 ? b.lines[0].y : 0) || 0;
    return yA - yB;
  });
  
  // Log elements after sorting
  const afterSort = allElements.map((el, idx) => {
    const colIdx = el.columnIndex !== undefined ? el.columnIndex : '?';
    const minY = (typeof el.minY === 'number' && el.minY !== 0) ? el.minY.toFixed(2) : (el.lines && el.lines.length > 0 ? el.lines[0].y.toFixed(2) : '0');
    const text = el.text ? el.text.substring(0, 30) : 'NO TEXT';
    return `[${idx}]P${el.pageNum || '?'}C${colIdx}Y${minY}:${el.type.substring(0, 1)}:"${text}"`;
  }).join(' | ');
  log(`[PDF v3] Elements after sorting - totalElements=${allElements.length}, sortedBy=[pageNum, columnIndex, minY], order=[${afterSort}]`);
  
  // Mark cross-page breaks: set gapAfter marker for last element on each page (except last page)
  // This helps cross-page merging logic identify page boundaries
  for (let i = 0; i < allElements.length; i++) {
    const currentElement = allElements[i];
    const nextElement = i < allElements.length - 1 ? allElements[i + 1] : null;
    
    // If current element is on a different page than next element, mark it as cross-page break
    if (nextElement && 
        currentElement.pageNum && 
        nextElement.pageNum && 
        currentElement.pageNum !== nextElement.pageNum) {
      // This is the last element on its page, next element is on a different page
      // Set gapAfter marker to indicate cross-page break
      if (currentElement.gapAfter === null || currentElement.gapAfter === undefined) {
        currentElement.gapAfter = CROSS_PAGE_BREAK_MARKER;
        log(`[PDF v3] Marked cross-page break - pageNum=${currentElement.pageNum}, nextPageNum=${nextElement.pageNum}, elementType=${currentElement.type}`);
      }
    }
  }
  
  log(`[PDF v3] Content extracted from all pages - totalElements=${allElements.length}`);
  
  return {
    elements: allElements,
    hasTextContent
  };
}


