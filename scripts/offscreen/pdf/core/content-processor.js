// @ts-check
// Content processor - processes extracted content (merging, post-processing, title extraction)

import { log } from '../utils/logging.js';
import { mergeCrossPageParagraphs } from '../processors/cross-page.js';
import { postProcessElements } from '../processors/post-processing.js';
import { groupConsecutiveListItems } from '../processors/list-grouper.js';
import { groupConsecutiveTables } from '../processors/table-grouper.js';
import { extractTitle as extractTitleUtil } from '../utils/title-extractor.js';
import {
  analyzeFontSizeHierarchy,
  validateHeadingHierarchy,
  determineHeadingLevel
} from '../analyzers/heading-hierarchy.js';
import { calculateAverage, countBy } from '../utils/array-helpers.js';

/**
 * Process extracted content: merge cross-page paragraphs, determine heading levels, post-process, extract title
 * 
 * @param {Array} elements - Extracted elements
 * @param {{baseFontSize?: number, avgParagraphLength?: number, [key: string]: any}} metrics - PDF metrics
 * @param {{title?: string, author?: string, publishDate?: string, [key: string]: any}} metadata - PDF metadata
 * @param {string} url - PDF file URL
 * @param {{title?: string, items?: Array<any>, [key: string]: any}|null} [outline] - PDF outline (optional)
 * @returns {Object} { title, elements }
 */
export function processContent(elements, metrics, metadata, url, outline = null) {
  log('[PDF v3] Processing extracted content');
  
  // Calculate average paragraph length for adaptive thresholds
  // Optimized: combine filter and map into single reduce
  const { paragraphElements, paragraphLengths } = elements.reduce((acc, el) => {
    if (el.type === 'paragraph') {
      acc.paragraphElements.push(el);
      acc.paragraphLengths.push(el.text?.length || 0);
    }
    return acc;
  }, { paragraphElements: [], paragraphLengths: [] });
  
  const avgParagraphLength = paragraphLengths.length > 0 
    ? Math.round(calculateAverage(paragraphLengths))
    : 200; // Default conservative estimate
  
  // Add to metrics for use in continuation detection
  const enhancedMetrics = {
    ...metrics,
    avgParagraphLength
  };
  
  log(`[PDF v3] Calculated average paragraph length - avgParagraphLength=${avgParagraphLength.toFixed(2)}, paragraphCount=${paragraphElements.length}`);
  
  // Merge cross-page paragraphs
  const mergedElements = mergeCrossPageParagraphs(elements, enhancedMetrics);
  
  // Group consecutive list items into single list elements
  const groupedListElements = groupConsecutiveListItems(mergedElements, enhancedMetrics);
  
  // Group consecutive table elements into single table elements
  const groupedTableElements = groupConsecutiveTables(groupedListElements, enhancedMetrics);
  
  // Log summary using utility
  const elementTypeCounts = countBy(groupedTableElements, el => el.type);
  log(`[PDF v3] After mergeCrossPageParagraphs, groupConsecutiveListItems, and groupConsecutiveTables - totalElements=${groupedTableElements.length}, types=${JSON.stringify(elementTypeCounts)}`);
  
  // Determine heading levels (NEW - Phase 2)
  const headings = groupedTableElements.filter(el => el.type === 'heading');
  const listHeadingsCount = headings.filter(h => h.isListHeading || h.followedByList).length;
  log(`[PDF v3] Headings found after merge - headingCount=${headings.length}, listHeadings=${listHeadingsCount}`);
  
  if (headings.length > 0) {
    log(`[PDF v3] Determining heading levels - headingCount=${headings.length}, hasOutline=${!!outline}`);
    
    // Analyze font size hierarchy
    const hierarchy = analyzeFontSizeHierarchy(headings, metrics);
    
    // UNIVERSAL PRINCIPLE: First determine levels based on visual hierarchy (clustering)
    // Then refine based on relative positioning
    // This ensures levels are determined by how headings relate to each other, not by type
    
    // Step 1: Determine initial levels using clustering and other methods
    // Pass empty array initially (no previous levels to reference)
    const initialHeadingsWithLevels = headings.map((heading, index) => {
      const level = determineHeadingLevel(heading, hierarchy, outline, []);
      return {
        ...heading,
        level,
        // Preserve list heading markers (used only for classification, not level determination)
        isListHeading: heading.isListHeading || false,
        followedByList: heading.followedByList || false
      };
    });
    
    // Step 2: Refine levels based on relative positioning
    // Now we can use previously determined levels for relative positioning
    const headingsWithLevels = initialHeadingsWithLevels.map((heading, index) => {
      // Use already determined levels from previous headings for relative positioning
      const previousHeadings = initialHeadingsWithLevels.slice(0, index);
      const level = determineHeadingLevel(heading, hierarchy, outline, previousHeadings);
      return {
        ...heading,
        level
      };
    });
    
    // Validate hierarchy (ensure H1 > H2 > H3 order)
    const validatedHeadings = validateHeadingHierarchy(headingsWithLevels);
    
    // Update elements with determined levels
    const headingMap = new Map();
    validatedHeadings.forEach(h => {
      headingMap.set(h.text, h.level);
    });
    
    groupedTableElements.forEach(el => {
      if (el.type === 'heading' && headingMap.has(el.text)) {
        el.level = headingMap.get(el.text);
      }
    });
    
    const h1Count = validatedHeadings.filter(h => h.level === 1).length;
    const h2Count = validatedHeadings.filter(h => h.level === 2).length;
    const h3Count = validatedHeadings.filter(h => h.level === 3).length;
    const h4Count = validatedHeadings.filter(h => h.level === 4).length;
    const h5Count = validatedHeadings.filter(h => h.level === 5).length;
    const h6Count = validatedHeadings.filter(h => h.level === 6).length;
    log(`[PDF v3] Heading levels determined - h1=${h1Count}, h2=${h2Count}, h3=${h3Count}, h4=${h4Count}, h5=${h5Count}, h6=${h6Count}`);
  }
  
  // Post-process
  const finalElements = postProcessElements(groupedTableElements);
  
  const finalElementTypes = finalElements.map(el => el.type).join(',');
  const finalElementsList = finalElements.map(el => {
    const text = (el.text || '').substring(0, 50);
    return `${el.type}:"${text}"${el.text && el.text.trim() ? 'T' : 'E'}`;
  }).join(' | ');
  const headingsAfterPostProcess = finalElements.filter(el => el.type === 'heading');
  const finalElementTypeCounts = countBy(finalElements, el => el.type);
  log(`[PDF v3] After postProcess - totalElements=${finalElements.length}, types=${JSON.stringify(finalElementTypeCounts)}, headings=${headingsAfterPostProcess.length}`);
  
  // Extract title using centralized utility
  const beforeExtractElementsList = finalElements.map((el, idx) => {
    const text = el.text ? el.text.substring(0, 100) : 'NO TEXT';
    return `[${idx}]${el.type}:"${text}"(${el.text ? el.text.length : 0})${el.level ? `L${el.level}` : ''}${el.fontSize ? `F${el.fontSize}` : ''}`;
  }).join(' | ');
  const beforeExtractHeadingsList = finalElements.reduce((acc, el) => {
    if (el.type === 'heading') {
      const text = el.text ? el.text.substring(0, 100) : 'NO TEXT';
      const formatted = `"${text}"${el.level ? `L${el.level}` : ''}${el.fontSize ? `F${el.fontSize}` : ''}`;
      if (acc) acc += ' | ';
      acc += formatted;
    }
    return acc;
  }, '');
  log(`[PDF v3] Before extractTitle - elementsCount=${finalElements.length}, elements=[${beforeExtractElementsList}], headings=[${beforeExtractHeadingsList}]`);
  
  const { title: extractedTitle, elements: titleAdjustedElements } = extractTitleUtil({
    metadataTitle: metadata.title,
    elements: finalElements,
    url
  });
  
  const title = extractedTitle || 'Untitled PDF';
  const finalElementsWithTitle = titleAdjustedElements;
  
  // Log summary using utility
  const finalTypeCounts = countBy(finalElementsWithTitle, el => el.type);
  log(`[PDF v3] After extractTitle - title="${title}", elementsCount=${finalElementsWithTitle.length}, types=${JSON.stringify(finalTypeCounts)}`);
  
  const headingsCount = finalElementsWithTitle.filter(el => el.type === 'heading').length;
  log(`[PDF v3] Content processing complete - title="${title}", contentItems=${finalElementsWithTitle.length}, headingsCount=${headingsCount}`);
  
  return {
    title,
    elements: finalElementsWithTitle || finalElements
  };
}


