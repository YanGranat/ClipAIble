// @ts-check
// Metrics collector - collects sample items for metrics analysis

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { LIMITS, DEFAULT_METRICS } from '../constants.js';
import { transformCoordinates } from '../utils/coordinate-transform.js';

/**
 * Collect sample items from first pages for metrics analysis
 * 
 * @param {{getPage: function(number): Promise<{getTextContent: function(): Promise<{items?: Array<any>}>, getViewport: function({scale: number}): any, cleanup: function(): void}>}} pdf - PDF.js document object
 * @param {number} numPages - Total number of pages
 * @returns {Promise<Array<{str: string, fontSize: number, x: number, y: number, fontName: string}>>} Array of sample items
 * @throws {Error} If page extraction fails
 */
export async function collectSampleItems(pdf, numPages) {
  log('[PDF v3] Collecting sample items for metrics analysis');
  
  const sampleItems = [];
  const analysisPages = Math.min(LIMITS.MAX_PAGES_FOR_ANALYSIS, numPages);
  
  for (let pageNum = 1; pageNum <= analysisPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    
    try {
      const textContent = await page.getTextContent();
      const items = textContent.items || [];
      
      for (const item of items) {
        if (item.str && item.str.trim()) {
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const pdfX = transform[4] || 0;
          const pdfY = transform[5] || 0;
          const [viewportX, viewportY] = transformCoordinates(pdfX, pdfY, viewport);
          
          const itemHeight = Math.abs(transform[3]) || Math.abs(item.height) || DEFAULT_METRICS.BASE_FONT_SIZE;
          
          sampleItems.push({
            str: item.str,
            fontSize: itemHeight,
            x: viewportX,
            y: viewportY,
            fontName: item.fontName || ''
          });
        }
      }
    } catch (error) {
      logWarn(`[PDF v3] Failed to extract text from page ${pageNum} for analysis`, error);
    }
    
    try {
      page.cleanup();
    } catch (cleanupError) {
      // Continue anyway
    }
  }
  
  log('[PDF v3] Sample items collected', { count: sampleItems.length, pages: analysisPages });
  
  return sampleItems;
}


