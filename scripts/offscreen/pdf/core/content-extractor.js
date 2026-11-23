// @ts-check
// Content extractor - extracts content from all pages

import { log, logWarn } from '../../../utils/logging.js';
import { processPage } from '../processors/page-processor.js';
import { CROSS_PAGE_BREAK_MARKER } from '../constants.js';
import { createPdfError } from '../../../utils/pdf-errors.js';
import { isRunningMargin } from '../analyzers/running-margins.js';

/**
 * Extract content from all pages
 * 
 * @param {{getPage: (pageNumber: number) => Promise<Parameters<typeof processPage>[0]>}} pdf - PDF.js document object
 * @param {number} numPages - Total number of pages
 * @param {{gapThreshold?: number, [key: string]: any}} metrics - PDF metrics with gap analysis
 * @returns {Promise<{elements: Array<any>, hasTextContent: boolean}>} Extracted content
 * @throws {Error} If PDF has no text layer (scanned PDF)
 * @throws {Error} If page extraction fails
 */
export async function extractContentFromPages(pdf, numPages, metrics, requestOptions = {}) {
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
  const failedPages = [];
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    log(`[PDF v3] Processing page ${pageNum}/${numPages}`);
    await requestOptions.checkCancelled?.();
    let page;
    
    try {
      page = await pdf.getPage(pageNum);
      const pageElements = await processPage(page, pageNum, metrics, requestOptions.preserveImagePage);
      log(`[PDF v3] Page ${pageNum} processed - extracted ${pageElements?.length || 0} elements`);
      
      if (pageElements && pageElements.length > 0) {
        if (pageElements.some(element => element.type !== 'image')) hasTextContent = true;
        allElements.push(...pageElements.filter(element => !isRunningMargin(element, metrics.runningMargins || [])));
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
      failedPages.push(pageNum);
    }
    
    // Cleanup page
    try {
      page?.cleanup();
    } catch (cleanupError) {
      logWarn(`[PDF v3] Failed to cleanup page ${pageNum}`, cleanupError);
      // Continue anyway
    }
    await requestOptions.checkCancelled?.();
    requestOptions.onProgress?.(pageNum, numPages);
  }

  if (failedPages.length) {
    throw createPdfError(`PDF extraction is incomplete. Failed pages: ${failedPages.join(', ')}.`, 'errorPdfIncomplete', { pages: failedPages.join(', ') });
  }
  
  // COMMENTED: log(`[PDF v3] Extraction complete - hasTextContent=${hasTextContent}, allElements.length=${allElements.length}`);
  
  // COMMENTED: Pause after extraction complete to ensure all logs are written
  // COMMENTED: await new Promise(resolve => setTimeout(resolve, 1000));
  
  log(`[PDF v3] Extraction complete - hasTextContent=${hasTextContent}, allElements.length=${allElements.length}, numPages=${numPages}`);
  
  // Only throw error if we truly have no content (no elements AND no text was found)
  // If we have elements, even if hasTextContent is false, we should continue
  if (allElements.length === 0) {
    logWarn(`[PDF v3] No elements extracted from ${numPages} pages - PDF may be scanned or have no text layer`);
    throw createPdfError('This PDF has no text layer (scanned PDF). OCR is not supported.', 'errorPdfNoTextLayer');
  }
  
  log(`[PDF v3] Content extracted from all pages - totalElements=${allElements.length}`);
  
  // Mark cross-page breaks: set gapAfter marker for last element on each page (except last page)
  // This helps cross-page merging logic identify page boundaries
  for (let i = 0; i < allElements.length; i++) {
    const currentElement = allElements[i];
    const nextElement = i < allElements.length - 1 ? allElements[i + 1] : null;
    
    // If current element is on a different page than next element, mark it as cross-page break
    if (!currentElement.pageNum || !nextElement?.pageNum) continue;
    const differentPage = currentElement.pageNum !== nextElement.pageNum;
    const sameProseFlow = currentElement.recoveredProseRegion !== 'spanning' && nextElement.recoveredProseRegion !== 'spanning';
    const columnBreak = currentElement.columnIndex !== nextElement.columnIndex && sameProseFlow;
    if (differentPage || columnBreak) {
      // This is the last element on its page, next element is on a different page
      // Set gapAfter marker to indicate cross-page break
      currentElement.gapAfter = CROSS_PAGE_BREAK_MARKER;
    }
  }
  
  log(`[PDF v3] Content extracted from all pages - totalElements=${allElements.length}`);
  
  return {
    elements: allElements,
    hasTextContent
  };
}


