// @ts-check
// Gap analysis collector - collects all lines from all pages for global gap analysis

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { processPageItemsToLines } from '../utils/item-transformer.js';

/**
 * Collect all lines from all pages for global gap analysis
 * 
 * @param {{getPage: function(number): Promise<{getTextContent: function(): Promise<{items?: Array<any>}>, getViewport: function({scale: number}): any, cleanup: function(): void}>}} pdf - PDF.js document object
 * @param {number} numPages - Total number of pages
 * @returns {Promise<Array>} Array of all lines from all pages
 */
export async function collectAllLinesForGapAnalysis(pdf, numPages) {
  log('[PDF v3] === FIRST PASS: Collecting all lines for global analysis ===');
  
  const allLines = [];
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    
    try {
      const textContent = await page.getTextContent();
      const textItems = textContent.items || [];
      
      // Process items: transform, apply formatting, group into lines
      // For gap analysis, we don't need graphics data, but we need empty metrics object
      const emptyMetrics = {};
      const pageLines = processPageItemsToLines(textItems, viewport, pageNum, emptyMetrics, null, textContent);
      allLines.push(...pageLines);
    } catch (error) {
      logWarn(`[PDF v3] Failed to extract lines from page ${pageNum} for global analysis`, error);
    }
    
    // Cleanup page
    try {
      page.cleanup();
    } catch (cleanupError) {
      // Continue anyway
    }
  }
  
  log('[PDF v3] All lines collected for gap analysis', { totalLines: allLines.length });
  
  return allLines;
}




