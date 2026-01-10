// @ts-check
// List grouper - groups consecutive list items into single list elements
// Handles different list types (ordered/unordered), nesting levels, and cross-page merging

import { log } from '../utils/logging.js';
import { LIST_ITEM_START_PATTERN, LIST_ITEM_PATTERNS } from '../utils/regex-patterns.js';
import { validateArrayInput } from '../utils/array-helpers.js';

/**
 * Calculate nesting level based on X-coordinate (indentation)
 * 
 * @param {{minX?: number, lines?: Array<{x?: number, [key: string]: any}>, listLevel?: number, [key: string]: any}} element - List element with minX or lines
 * @param {{previousElements?: Array<{minX?: number, listLevel?: number, [key: string]: any}>, baseFontSize?: number, [key: string]: any}} context - Context with other elements for comparison
 * @returns {number} Nesting level (0 = top level, 1 = nested, etc.)
 */
function calculateNestingLevel(element, context = {}) {
  // If level is already set, use it
  if (element.listLevel !== undefined && element.listLevel !== null) {
    return element.listLevel;
  }
  
  // Try to determine level from X-coordinate (indentation)
  const elementX = element.minX || (element.lines && element.lines.length > 0 ? element.lines[0].x : null);
  
  if (elementX === null || elementX === undefined) {
    return 0; // Default to level 0
  }
  
  // Compare with previous elements to determine relative indentation
  const previousElements = context.previousElements || [];
  if (previousElements.length === 0) {
    return 0; // First element = level 0
  }
  
  // Find base X-coordinate (most common X for top-level elements)
  const xCoordinates = previousElements
    .filter(el => el.minX !== undefined && el.minX !== null)
    .map(el => el.minX);
  
  if (xCoordinates.length === 0) {
    return 0;
  }
  
  // Calculate base X (median of previous top-level elements only)
  // Filter to only top-level elements (listLevel === 0 or undefined)
  const topLevelXCoordinates = previousElements
    .filter(el => (el.listLevel === undefined || el.listLevel === null || el.listLevel === 0) && 
                   el.minX !== undefined && el.minX !== null)
    .map(el => el.minX);
  
  // If we have top-level elements, use their median
  // Otherwise, use all elements
  const baseXCoordinates = topLevelXCoordinates.length > 0 ? topLevelXCoordinates : xCoordinates;
  const sortedX = [...baseXCoordinates].sort((a, b) => a - b);
  const medianX = sortedX[Math.floor(sortedX.length / 2)];
  
  // Calculate indentation threshold (15% of base font size or 10px, whichever is larger)
  // Reduced from 20px to 10px to better detect nested lists
  const baseFontSize = context.baseFontSize || 12;
  const indentThreshold = Math.max(baseFontSize * 0.15, 10);
  
  // Determine level based on indentation
  const indentDiff = elementX - medianX;
  if (indentDiff < -indentThreshold) {
    // Less indented = higher level (but shouldn't happen)
    return 0;
  } else if (indentDiff < indentThreshold) {
    // Similar indentation = same level
    return 0;
  } else {
    // More indented = nested level
    // Calculate level: each indentThreshold increment = +1 level
    const level = Math.floor(indentDiff / indentThreshold);
    return Math.min(level, 5); // Cap at level 5
  }
}

/**
 * Check if two list elements should be grouped together
 * Enhanced to handle nested lists properly
 * 
 * @param {{type?: string, columnIndex?: number, listLevel?: number, [key: string]: any}} list1 - First list element
 * @param {{type?: string, columnIndex?: number, listLevel?: number, [key: string]: any}} list2 - Second list element
 * @param {{baseFontSize?: number, [key: string]: any}} context - Context for nesting level calculation
 * @returns {boolean} True if should group
 */
function shouldGroupLists(list1, list2, context = {}) {
  // CRITICAL: Never group lists from different columns
  if (list1.columnIndex !== undefined && list2.columnIndex !== undefined) {
    if (list1.columnIndex !== list2.columnIndex) {
      return false;
    }
  }
  
  // Both must be lists
  if (list1.type !== 'list' || list2.type !== 'list') {
    return false;
  }
  
  // Calculate nesting levels if not set
  const list1Level = list1.listLevel !== undefined ? list1.listLevel : calculateNestingLevel(list1, context);
  const list2Level = list2.listLevel !== undefined ? list2.listLevel : calculateNestingLevel(list2, { ...context, previousElements: [...(context.previousElements || []), list1] });
  
  // CRITICAL: Determine if lists are ordered or unordered by checking both listType/ordered flag AND text patterns
  // This ensures we group numbered lists together even if listType values differ slightly
  const list1Text = (list1.text || '').trim();
  const list2Text = (list2.text || '').trim();
  
  // Check text patterns first (most reliable)
  const list1IsOrdered = /^\s*\d+[\.\)]\s+/.test(list1Text);
  const list2IsOrdered = /^\s*\d+[\.\)]\s+/.test(list2Text);
  const list1IsBullet = LIST_ITEM_START_PATTERN.test(list1Text);
  const list2IsBullet = LIST_ITEM_START_PATTERN.test(list2Text);
  
  // Determine ordered/unordered status from both flags and patterns
  const list1Ordered = list1.ordered !== undefined ? list1.ordered : 
                       (list1.listType === 'ordered' || list1.listType === 'numbered' || list1IsOrdered);
  const list2Ordered = list2.ordered !== undefined ? list2.ordered : 
                       (list2.listType === 'ordered' || list2.listType === 'numbered' || list2IsOrdered);
  
  // Both must be same type (both ordered OR both unordered)
  if (list1Ordered !== list2Ordered) {
    // Different types - don't group
    return false;
  }
  
  // Same type - group only if same level
  if (list1Level === list2Level) {
    // Same type and level - group them
    return true;
  } else {
    // Different levels - don't group (nested lists)
    return false;
  }
  
  return false;
}

/**
 * Extract list item text (remove marker)
 * 
 * @param {string} text - Text with marker
 * @param {string} pattern - List pattern type
 * @returns {string} Text without marker
 */
function extractListItemText(text, pattern) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const trimmed = text.trim();
  
  // Remove marker based on pattern
  if (pattern === 'numbered' || pattern === 'letter' || pattern === 'roman') {
    // Remove numbered/letter/roman marker: "1. ", "a) ", "i) ", etc.
    const match = /^[\s]*[\d\w]+[\.\)]\s+/.exec(trimmed);
    if (match) {
      return trimmed.substring(match[0].length).trim();
    }
  } else if (pattern === 'bullet') {
    // Remove bullet marker: "• ", "- ", etc.
    const match = /^[\s]*[•\-\*\+▪▫◦‣⁃]\s+/.exec(trimmed);
    if (match) {
      return trimmed.substring(match[0].length).trim();
    }
  }
  
  // Fallback: try to remove any list marker
  const match = LIST_ITEM_START_PATTERN.exec(trimmed);
  if (match) {
    return trimmed.substring(match[0].length).trim();
  }
  
  return trimmed;
}

/**
 * Group consecutive list items into single list elements
 * Handles nested lists by grouping only items of the same level
 * 
 * @param {Array} elements - Document elements
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Array} Processed elements with grouped lists
 */
/**
 * Check if element is ordered list
 * @param {{type?: string, text?: string, ordered?: boolean, listType?: string, [key: string]: any}} element - List element
 * @returns {boolean} True if ordered
 */
function isOrderedList(element) {
  if (element.ordered !== undefined) return element.ordered;
  if (element.listType === 'ordered' || element.listType === 'numbered' || element.listType === 'roman') {
    return true;
  }
  const text = (element.text || '').trim();
  return /^\s*\d+[\.\)]\s+/.test(text);
}

/**
 * Check if element is nested within current list based on X-coordinate
 * @param {{type?: string, text?: string, [key: string]: any}} element - Element to check
 * @param {{type?: string, items?: Array<any>, [key: string]: any}} currentList - Current list
 * @param {number} baseFontSize - Base font size for threshold calculation
 * @returns {Object} { isNested, levelDiff }
 */
function checkNesting(element, currentList, baseFontSize) {
  const isNested = element.minX !== undefined && currentList?.minX !== undefined && 
                   element.minX > currentList.minX;
  
  if (!isNested) {
    return { isNested: false, levelDiff: 0 };
  }
  
  const indentThreshold = Math.max(baseFontSize * 0.15, 10);
  const xDiff = element.minX - (currentList?.minX || 0);
  const levelDiff = xDiff > indentThreshold ? Math.floor(xDiff / indentThreshold) : 0;
  
  return { isNested, levelDiff };
}

/**
 * Determine if element should be merged with current list
 * @param {{type?: string, text?: string, [key: string]: any}} element - Element to check
 * @param {{type?: string, items?: Array<any>, [key: string]: any}} currentList - Current list
 * @param {{previousElements?: Array<any>, baseFontSize?: number, [key: string]: any}} context - Context with previousElements and baseFontSize
 * @returns {boolean} Should merge
 */
function shouldMergeWithCurrentList(element, currentList, context) {
  if (!currentList) return false;
  
  const { baseFontSize } = context;
  const currentListOrdered = isOrderedList(currentList);
  const elementOrdered = isOrderedList(element);
  
  // Check nesting
  const { isNested, levelDiff } = checkNesting(element, currentList, baseFontSize);
  
  // Check if should merge
  return (
    shouldGroupLists(currentList, element, context) ||
    (isNested && levelDiff > 0) ||
    (currentListOrdered && elementOrdered && 
     (element.listLevel || 0) === (currentList.listLevel || 0))
  );
}

/**
 * Add item to current list
 * @param {{items?: Array<any>, [key: string]: any}} currentList - Current list
 * @param {{type?: string, text?: string, [key: string]: any}} element - Element to add
 * @param {string} itemText - Extracted item text
 * @param {number} actualLevel - Calculated nesting level
 */
function addItemToList(currentList, element, itemText, actualLevel) {
  if (!currentList.items) {
    currentList.items = [];
  }
  
  currentList.items.push({
    text: itemText || element.text || '',
    pageNum: element.pageNum,
    columnIndex: element.columnIndex,
    minY: element.minY,
    maxY: element.maxY,
    minX: element.minX,
    listLevel: actualLevel,
    parentIsOrdered: currentList.ordered || currentList.listType === 'ordered',
    isOrdered: element.ordered !== undefined ? element.ordered : 
               (element.listType === 'ordered' || element.listType === 'numbered' || element.listType === 'roman')
  });
  
  // Update list metadata
  currentList.text = (currentList.text || '') + '\n' + (element.text || '');
  if (element.pageNum && (!currentList.pageNum || element.pageNum > currentList.pageNum)) {
    currentList.pageNum = element.pageNum;
  }
  if (element.maxY && (!currentList.maxY || element.maxY > currentList.maxY)) {
    currentList.maxY = element.maxY;
  }
  if (element.minY && (!currentList.minY || element.minY < currentList.minY)) {
    currentList.minY = element.minY;
  }
}

/**
 * Create new list element from single element
 * @param {{type?: string, text?: string, ordered?: boolean, listType?: string, [key: string]: any}} element - List element
 * @param {string} itemText - Extracted item text
 * @returns {Object} New list element
 */
function createNewList(element, itemText) {
  return {
    ...element,
    listLevel: element.listLevel || 0,
    ordered: element.ordered !== undefined ? element.ordered : (element.listType === 'ordered'),
    items: [{
      text: itemText || element.text || '',
      pageNum: element.pageNum,
      columnIndex: element.columnIndex,
      minY: element.minY,
      maxY: element.maxY,
      minX: element.minX,
      listLevel: element.listLevel || 0,
      isOrdered: element.ordered || element.listType === 'ordered'
    }]
  };
}

export function groupConsecutiveListItems(elements, metrics = {}) {
  // Validate input using utility
  const elementsError = validateArrayInput(elements, 'elements');
  if (elementsError) {
    log(`[PDF v3] groupConsecutiveListItems: ${elementsError}`);
    return [];
  }
  
  if (elements.length === 0) {
    return [];
  }
  
  log(`[PDF v3] groupConsecutiveListItems: Starting - inputCount=${elements.length}`);
  
  const processed = [];
  let currentList = null;
  const baseFontSize = metrics.baseFontSize || 12;
  
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    
    if (element.type === 'list') {
      // Build context for nesting level calculation
      const context = {
        previousElements: processed.filter(el => el.type === 'list'),
        baseFontSize
      };
      
      // Calculate nesting level if not set
      if (element.listLevel === undefined || element.listLevel === null) {
        element.listLevel = calculateNestingLevel(element, context);
      }
      
      // CRITICAL: Check if element should be merged with current list
      // This includes:
      // 1. Same type and level (handled by shouldGroupLists)
      // 2. Nested list (element is nested within current list based on minX)
      // 3. Ordered list continuation (if current list is ordered and element is ordered with same level,
      //    continue the list even if there were nested unordered lists between them)
      const list1Text = (currentList?.text || '').trim();
      const list2Text = (element.text || '').trim();
      const list1IsOrdered = /^\s*\d+[\.\)]\s+/.test(list1Text);
      const list2IsOrdered = /^\s*\d+[\.\)]\s+/.test(list2Text);
      const currentListOrdered = currentList?.ordered !== undefined ? currentList.ordered : 
                                 (currentList?.listType === 'ordered' || currentList?.listType === 'numbered' || list1IsOrdered);
      const elementOrdered = element.ordered !== undefined ? element.ordered : 
                             (element.listType === 'ordered' || element.listType === 'numbered' || list2IsOrdered);
      
      // CRITICAL: Check if element is nested within current list (based on minX)
      // This handles nested lists (e.g., bullet lists nested in ordered lists)
      const isNested = element.minX !== undefined && currentList?.minX !== undefined && 
                       element.minX > currentList.minX;
      
      // Calculate nesting level difference based on X-coordinate
      // Use baseFontSize from function parameter (already defined above)
      const indentThreshold = Math.max(baseFontSize * 0.15, 10);
      const xDiff = isNested ? (element.minX - (currentList?.minX || 0)) : 0;
      const levelDiff = xDiff > indentThreshold ? Math.floor(xDiff / indentThreshold) : 0;
      
      const shouldMerge = currentList && (
        shouldGroupLists(currentList, element, context) ||
        // CRITICAL: If element is nested within current list (based on minX), add it as nested item
        // This handles nested unordered lists within ordered lists
        (isNested && levelDiff > 0) ||
        // CRITICAL: If both are ordered lists with same level, continue the list
        // This handles the case where nested unordered lists appear between ordered list items
        (currentListOrdered && elementOrdered && 
         (element.listLevel || 0) === (currentList.listLevel || 0))
      );
      
      if (shouldMerge) {
        // Merge with current list
        // Extract item text from element
        const itemText = extractListItemText(
          element.text || '',
          element.listPattern || 'bullet'
        );
        
        // Add item to list
        if (!currentList.items) {
          currentList.items = [];
        }
        
        // Determine actual nesting level for this item
        // If element is nested (minX > currentList.minX), calculate level based on X-difference
        // Otherwise use element's listLevel or currentList's listLevel
        let actualLevel;
        if (isNested && levelDiff > 0) {
          // Nested item: level is parent level + levelDiff
          actualLevel = (currentList.listLevel || 0) + levelDiff;
        } else {
          // Same level or not nested: use element's listLevel or currentList's listLevel
          actualLevel = element.listLevel !== undefined ? element.listLevel : (currentList.listLevel || 0);
        }
        
        currentList.items.push({
          text: itemText || element.text || '',
          pageNum: element.pageNum,
          columnIndex: element.columnIndex,
          minY: element.minY,
          maxY: element.maxY,
          minX: element.minX,
          listLevel: actualLevel,
          // CRITICAL: Preserve parent list type for nested items
          parentIsOrdered: currentList.ordered || currentList.listType === 'ordered',
          // CRITICAL: Preserve element's own list type (ordered/unordered) for markdown generation
          isOrdered: element.ordered !== undefined ? element.ordered : (element.listType === 'ordered' || element.listType === 'numbered' || element.listType === 'roman')
        });
        
        // Update list metadata
        currentList.text = (currentList.text || '') + '\n' + (element.text || '');
        if (element.pageNum && (!currentList.pageNum || element.pageNum > currentList.pageNum)) {
          currentList.pageNum = element.pageNum;
        }
        if (element.maxY && (!currentList.maxY || element.maxY > currentList.maxY)) {
          currentList.maxY = element.maxY;
        }
        if (element.minY && (!currentList.minY || element.minY < currentList.minY)) {
          currentList.minY = element.minY;
        }
        
        // Merged - no log needed (too verbose)
      } else {
        // CRITICAL: Before creating a new list, check if element should be added as nested item
        // This handles nested lists (e.g., bullet lists nested in ordered lists)
        if (currentList && isNested && levelDiff > 0) {
          // Element is nested within current list - add it as nested item
          const itemText = extractListItemText(
            element.text || '',
            element.listPattern || 'bullet'
          );
          
          if (!currentList.items) {
            currentList.items = [];
          }
          
          const nestedLevel = (currentList.listLevel || 0) + levelDiff;
          
          currentList.items.push({
            text: itemText || element.text || '',
            pageNum: element.pageNum,
            columnIndex: element.columnIndex,
            minY: element.minY,
            maxY: element.maxY,
            minX: element.minX,
            listLevel: nestedLevel,
            parentIsOrdered: currentList.ordered || currentList.listType === 'ordered',
            // CRITICAL: Preserve element's own list type (ordered/unordered) for markdown generation
            isOrdered: element.ordered !== undefined ? element.ordered : (element.listType === 'ordered' || element.listType === 'numbered' || element.listType === 'roman')
          });
          
          // Update list metadata
          currentList.text = (currentList.text || '') + '\n' + (element.text || '');
          if (element.pageNum && (!currentList.pageNum || element.pageNum > currentList.pageNum)) {
            currentList.pageNum = element.pageNum;
          }
          if (element.maxY && (!currentList.maxY || element.maxY > currentList.maxY)) {
            currentList.maxY = element.maxY;
          }
          if (element.minY && (!currentList.minY || element.minY < currentList.minY)) {
            currentList.minY = element.minY;
          }
          
          // Added nested item - no log needed (too verbose)
          continue; // Skip creating new list
        }
        
        // Check if we should continue a previous ordered list
        // This handles the case where nested unordered lists appear between ordered list items
        const elementIsOrdered = elementOrdered;
        const elementLevel = element.listLevel || 0;
        
        // Look for the last ordered list in processed that matches this element's level
        let previousOrderedList = null;
        if (elementIsOrdered) {
          // Check currentList first
          if (currentList && currentListOrdered && (currentList.listLevel || 0) === elementLevel) {
            previousOrderedList = currentList;
          } else {
            // Check processed lists (reverse order)
            for (let j = processed.length - 1; j >= 0; j--) {
              const prevEl = processed[j];
              if (prevEl.type === 'list') {
                const prevText = (prevEl.text || '').trim();
                const prevIsOrdered = /^\s*\d+[\.\)]\s+/.test(prevText);
                const prevOrdered = prevEl.ordered !== undefined ? prevEl.ordered : 
                                   (prevEl.listType === 'ordered' || prevEl.listType === 'numbered' || prevIsOrdered);
                const prevLevel = prevEl.listLevel || 0;
                
                if (prevOrdered && prevLevel === elementLevel) {
                  previousOrderedList = prevEl;
                  break;
                } else if (prevEl.type !== 'list') {
                  // Stop searching if we hit a non-list element
                  break;
                }
              } else {
                // Stop searching if we hit a non-list element
                break;
              }
            }
          }
        }
        
        if (previousOrderedList && elementIsOrdered) {
          // Continue the previous ordered list
          const itemText = extractListItemText(
            element.text || '',
            element.listPattern || 'bullet'
          );
          
          if (!previousOrderedList.items) {
            previousOrderedList.items = [];
          }
          
          previousOrderedList.items.push({
            text: itemText || element.text || '',
            pageNum: element.pageNum,
            columnIndex: element.columnIndex,
            minY: element.minY,
            maxY: element.maxY,
            minX: element.minX,
            listLevel: elementLevel
          });
          
          // Update list metadata
          previousOrderedList.text = (previousOrderedList.text || '') + '\n' + (element.text || '');
          if (element.pageNum && (!previousOrderedList.pageNum || element.pageNum > previousOrderedList.pageNum)) {
            previousOrderedList.pageNum = element.pageNum;
          }
          if (element.maxY && (!previousOrderedList.maxY || element.maxY > previousOrderedList.maxY)) {
            previousOrderedList.maxY = element.maxY;
          }
          if (element.minY && (!previousOrderedList.minY || element.minY < previousOrderedList.minY)) {
            previousOrderedList.minY = element.minY;
          }
          
          // If previousOrderedList was in processed, we need to update it
          // If it was currentList, we keep it as currentList
          if (previousOrderedList !== currentList) {
            // It was in processed, so we need to remove it and set it as currentList
            const index = processed.indexOf(previousOrderedList);
            if (index !== -1) {
              processed.splice(index, 1);
            }
            currentList = previousOrderedList;
          }
          
          log(`[PDF v3] groupConsecutiveListItems: Continued previous ordered list - listType=${previousOrderedList.listType || 'unknown'}, itemCount=${previousOrderedList.items.length}, itemText="${itemText.substring(0, 50)}"`);
        } else {
          // Save previous list and start new one
          if (currentList) {
            processed.push(currentList);
          }
          
          // Start new list
          const itemText = extractListItemText(
            element.text || '',
            element.listPattern || 'bullet'
          );
          
          currentList = {
            ...element,
            listLevel: element.listLevel || 0, // Ensure level is set
            // CRITICAL: Preserve ordered flag for markdown generation
            ordered: element.ordered !== undefined ? element.ordered : (element.listType === 'ordered'),
            items: [{
              text: itemText || element.text || '',
              pageNum: element.pageNum,
              columnIndex: element.columnIndex,
              minY: element.minY,
              maxY: element.maxY,
              minX: element.minX,
              listLevel: element.listLevel || 0
            }]
          };
          
          // Started new list - no log needed (too verbose)
        }
      }
    } else {
      // Not a list - save current list if exists and add element
      if (currentList) {
        processed.push(currentList);
        currentList = null;
      }
      processed.push(element);
    }
  }
  
  // Add last list if exists
  if (currentList) {
    processed.push(currentList);
  }
  
  log(`[PDF v3] groupConsecutiveListItems: Complete - inputCount=${elements.length}, outputCount=${processed.length}, listsGrouped=${elements.filter(e => e.type === 'list').length - processed.filter(e => e.type === 'list').length}`);
  
  return processed;
}

