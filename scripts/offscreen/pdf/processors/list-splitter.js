// @ts-check
// List splitter - splits blocks that contain list heading + list items
// Detects patterns like "Main principles: • Item 1 • Item 2" and splits them

import { log } from '../utils/logging.js';
import { LIST_ITEM_START_PATTERN, LIST_ITEM_PATTERNS } from '../utils/regex-patterns.js';
import { ELEMENT_DECISION } from '../constants.js';
import { truncateText } from '../utils/text-helpers.js';
import { validateArrayInput } from '../utils/array-helpers.js';

/**
 * Split list lines into separate blocks - one per list item
 * This is a reusable helper to avoid code duplication
 * 
 * @param {Array} listLines - Lines that contain list items
 * @param {{combinedText?: string, lines?: Array<any>, minY?: number, maxY?: number, [key: string]: any}} baseBlock - Base block to use as template
 * @returns {Array} Array of blocks, one for each list item
 */
function splitListLinesIntoBlocks(listLines, baseBlock) {
  if (!listLines || listLines.length === 0) {
    return [];
  }
  
  const listItemBlocks = [];
  
  for (const line of listLines) {
    const lineText = (line.text || '').trim();
    
    if (LIST_ITEM_START_PATTERN.test(lineText)) {
      // This is a list item - create separate block
      const listItemBlock = {
        ...baseBlock,
        combinedText: lineText,
        lines: [line],
        minY: line.y,
        maxY: line.y
      };
      listItemBlocks.push(listItemBlock);
    } else if (listItemBlocks.length > 0) {
      // Continuation of previous list item - append to last block
      const lastBlock = listItemBlocks[listItemBlocks.length - 1];
      lastBlock.combinedText += ' ' + lineText;
      lastBlock.lines.push(line);
      lastBlock.maxY = line.y;
    }
  }
  
  return listItemBlocks;
}

/**
 * Check if text contains list items (not just starts with them)
 * 
 * @param {string} text - Text to check
 * @returns {boolean} True if contains list items
 */
function containsListItems(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  // Check if text contains list markers anywhere (not just at start)
  // Pattern: text, then list marker (bullet or number)
  // Examples: "Main principles: • Item" or "Heading: 1. Item"
  const listMarkerPattern = /[:\s]+([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;
  return listMarkerPattern.test(text);
}

/**
 * Find position where list items start in text
 * 
 * @param {string} text - Text to analyze
 * @returns {number} Position where list starts, or -1 if not found
 */
function findListStartPosition(text) {
  if (!text || typeof text !== 'string') {
    return -1;
  }
  
  // CRITICAL: Look for pattern: colon followed by space, then list marker
  // Match: "Heading: • Item" or "Heading: 1. Item"
  // Pattern must match: ":" + whitespace + list marker + whitespace
  const listStartPattern = /:\s+([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;
  let match = listStartPattern.exec(text);
  
  if (match) {
    const markerStartPos = match.index + match[0].indexOf(match[1]);
    return markerStartPos;
  }
  
  // Fallback 1: space followed by list marker, but only if colon exists before
  const listStartPattern2 = /\s+([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;
  match = listStartPattern2.exec(text);
  
  if (match) {
    const beforeMatch = text.substring(0, match.index);
    if (beforeMatch.includes(':')) {
      return match.index;
    }
  }
  
  // Fallback 2: space followed by list marker, even without colon, if text before is short (likely heading)
  match = listStartPattern2.exec(text);
  if (match) {
    const beforeMatch = text.substring(0, match.index).trim();
    if (beforeMatch.length > 0 && beforeMatch.length <= ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH && 
        !beforeMatch.match(/[.!?]\s*$/)) {
      return match.index;
    }
  }
  
  return -1;
}

/**
 * Detect multi-line pattern: first line ends with colon, second line starts with list marker
 * @param {{combinedText?: string, text?: string, [key: string]: any}} block - Block to check
 * @returns {Object|null} { headingLines, listLines, headingEndY } or null if pattern not found
 */
function detectMultiLinePattern(block) {
  if (!block.lines || block.lines.length < 2) {
    return null;
  }
  
  const firstLine = (block.lines[0]?.text || '').trim();
  const secondLine = (block.lines[1]?.text || '').trim();
  const firstEndsWithColon = firstLine.endsWith(':');
  const firstLineIsShort = firstLine.length < ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH;
  const secondStartsWithMarker = LIST_ITEM_START_PATTERN.test(secondLine);
  
  if ((firstEndsWithColon || firstLineIsShort) && secondStartsWithMarker) {
    return {
      headingLines: [block.lines[0]],
      listLines: block.lines.slice(1),
      headingEndY: block.lines[0].y
    };
  }
  
  return null;
}

/**
 * Detect single-line pattern: one line contains both heading and list
 * @param {{combinedText?: string, text?: string, [key: string]: any}} block - Block to check
 * @returns {Object|null} { headingText, listText, listStartPos } or null if pattern not found
 */
function detectSingleLinePattern(block) {
  if (!block.combinedText) {
    return null;
  }
  
  const text = block.combinedText;
  const hasListItems = containsListItems(text);
  
  if (!hasListItems) {
    return null;
  }
  
  const listStartPos = findListStartPosition(text);
  if (listStartPos < 0) {
    return null;
  }
  
  const headingText = text.substring(0, listStartPos).trim();
  const listText = text.substring(listStartPos).trim();
  
  return { headingText, listText, listStartPos };
}

/**
 * Split lines based on list start position
 * @param {{combinedText?: string, text?: string, lines?: Array<any>, [key: string]: any}} block - Block to split
 * @param {number} listStartPos - Position where list starts in combined text
 * @returns {Object} { headingLines, listLines, headingEndY }
 */
function splitLinesByPosition(block, listStartPos) {
  const headingLines = [];
  const listLines = [];
  let headingEndY = block.minY || 0;
  
  if (!block.lines || block.lines.length === 0) {
    return { headingLines, listLines, headingEndY };
  }
  
  let accumulatedText = '';
  let splitLineIndex = -1;
  
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i];
    const lineText = (line.text || '').trim();
    
    accumulatedText += (accumulatedText ? ' ' : '') + lineText;
    
    if (accumulatedText.length >= listStartPos && splitLineIndex < 0) {
      splitLineIndex = i;
      const lineHasMarker = LIST_ITEM_START_PATTERN.test(lineText);
      
      if (lineHasMarker) {
        headingLines.push(...block.lines.slice(0, i));
        listLines.push(...block.lines.slice(i));
        headingEndY = i > 0 ? block.lines[i - 1].y : line.y;
        break;
      } else {
        const lineListStart = findListStartPosition(lineText);
        if (lineListStart > 0) {
          const lineHeadingText = lineText.substring(0, lineListStart).trim();
          const lineListText = lineText.substring(lineListStart).trim();
          
          if (lineHeadingText) {
            headingLines.push({ ...line, text: lineHeadingText });
          }
          if (lineListText) {
            listLines.push({ ...line, text: lineListText });
          }
          if (i + 1 < block.lines.length) {
            listLines.push(...block.lines.slice(i + 1));
          }
          headingEndY = line.y;
          break;
        }
      }
    }
  }
  
  // Fallback: find first line with list marker
  if (splitLineIndex < 0) {
    for (let i = 0; i < block.lines.length; i++) {
      const line = block.lines[i];
      const lineText = (line.text || '').trim();
      
      if (LIST_ITEM_START_PATTERN.test(lineText)) {
        headingLines.push(...block.lines.slice(0, i));
        listLines.push(...block.lines.slice(i));
        headingEndY = i > 0 ? block.lines[i - 1].y : line.y;
        break;
      }
    }
  }
  
  return { headingLines, listLines, headingEndY };
}

/**
 * Create heading block from lines
 * @param {{combinedText?: string, lines?: Array<any>, minY?: number, maxY?: number, [key: string]: any}} baseBlock - Base block to use as template
 * @param {Array} headingLines - Lines for heading
 * @param {string} headingText - Heading text
 * @param {number} headingEndY - Y coordinate of heading end
 * @returns {Object} Heading block
 */
function createHeadingBlock(baseBlock, headingLines, headingText, headingEndY) {
  return {
    ...baseBlock,
    combinedText: headingText,
    lines: headingLines,
    maxY: headingEndY,
    minY: headingLines.length > 0 ? headingLines[0].y : baseBlock.minY,
    isListHeading: true,
    followedByList: true
  };
}

/**
 * Split block into heading and list parts
 * 
 * @param {{combinedText?: string, text?: string, lines?: Array<any>, [key: string]: any}} block - Block to split
 * @returns {Array} Array of blocks: [headingBlock, listBlock] or [originalBlock] if no split needed
 */
function splitHeadingFromList(block) {
  if (!block || !block.combinedText) {
    return [block];
  }
  
  const text = block.combinedText;
  
  // Check if block contains list items
  const hasListItems = containsListItems(text);
  
  if (!hasListItems) {
    // Also check if any line starts with list marker (multi-line case)
    if (block.lines && block.lines.length > 1) {
      const firstLine = (block.lines[0]?.text || '').trim();
      const secondLine = (block.lines[1]?.text || '').trim();
      const firstEndsWithColon = firstLine.endsWith(':');
      const secondStartsWithMarker = LIST_ITEM_START_PATTERN.test(secondLine);
      
      if (firstEndsWithColon && secondStartsWithMarker) {
        // Split at line boundary
        const headingBlock = {
          ...block,
          combinedText: firstLine,
          lines: [block.lines[0]],
          maxY: block.lines[0].y,
          isListHeading: true,
          followedByList: true
        };
        const listLines = block.lines.slice(1);
        
        // CRITICAL: Split list into separate blocks - one per list item
        // Use reusable helper function to avoid code duplication
        const listItemBlocks = splitListLinesIntoBlocks(listLines, block);
        
        log(`[PDF v3] splitHeadingFromList: Split multi-line - heading="${firstLine.substring(0, 40)}", listItems=${listItemBlocks.length}`);
        return [headingBlock, ...listItemBlocks];
      }
    }
    return [block];
  }
  
  // Find where list starts
  const listStartPos = findListStartPosition(text);
  
  if (listStartPos < 0) {
    return [block];
  }
  
  // Split text
  const headingText = text.substring(0, listStartPos).trim();
  const listText = text.substring(listStartPos).trim();
  
  if (!headingText || !listText) {
    return [block]; // Can't split properly
  }
  
  // Check if heading ends with colon (typical pattern)
  const headingEndsWithColon = headingText.endsWith(':');
  if (!headingEndsWithColon) {
    // If no colon, might be false positive - be more careful
    // Only split if we're very confident
    const hasClearListMarker = /^[•\-\*\+▪▫◦‣⁃]|\d+[\.\)]/.test(listText);
    if (!hasClearListMarker) {
      return [block];
    }
  }
  
  // Split lines into heading and list parts
  const headingLines = [];
  const listLines = [];
  let currentY = block.minY || 0;
  let headingEndY = currentY;
  
  if (block.lines && block.lines.length > 0) {
    // Find which line contains the split point
    let accumulatedText = '';
    let splitLineIndex = -1;
    
    for (let i = 0; i < block.lines.length; i++) {
      const line = block.lines[i];
      const lineText = (line.text || '').trim();
      
      accumulatedText += (accumulatedText ? ' ' : '') + lineText;
      
      // Check if we've reached the split point
      if (accumulatedText.length >= listStartPos && splitLineIndex < 0) {
        splitLineIndex = i;
        
        // Check if this line contains the list marker
        const lineHasMarker = LIST_ITEM_START_PATTERN.test(lineText);
        if (lineHasMarker) {
          // This line is the first list item
          // Previous lines are heading
          headingLines.push(...block.lines.slice(0, i));
          listLines.push(...block.lines.slice(i));
          headingEndY = i > 0 ? block.lines[i - 1].y : line.y;
          break;
        } else {
          // Split within this line
          // Check if line contains both heading and list parts
          const lineListStart = findListStartPosition(lineText);
          if (lineListStart > 0) {
            // Split this line
            const lineHeadingText = lineText.substring(0, lineListStart).trim();
            const lineListText = lineText.substring(lineListStart).trim();
            
            if (lineHeadingText) {
              headingLines.push({
                ...line,
                text: lineHeadingText
              });
            }
            
            if (lineListText) {
              listLines.push({
                ...line,
                text: lineListText
              });
            }
            
            // Add remaining lines to list
            if (i + 1 < block.lines.length) {
              listLines.push(...block.lines.slice(i + 1));
            }
            
            headingEndY = line.y;
            break;
          }
        }
      }
    }
    
    // If we didn't find a clear split, try to split based on first list marker
    if (splitLineIndex < 0) {
      for (let i = 0; i < block.lines.length; i++) {
        const line = block.lines[i];
        const lineText = (line.text || '').trim();
        
        if (LIST_ITEM_START_PATTERN.test(lineText)) {
          // This is the first list item
          headingLines.push(...block.lines.slice(0, i));
          listLines.push(...block.lines.slice(i));
          headingEndY = i > 0 ? block.lines[i - 1].y : line.y;
          break;
        }
      }
    }
  }
  
  // If we couldn't split lines, create blocks from text
  if (headingLines.length === 0 && listLines.length === 0) {
    // Create heading block
    const headingBlock = {
      ...block,
      combinedText: headingText,
      lines: block.lines ? block.lines.slice(0, 1) : [],
      maxY: headingEndY
    };
    
    const listBlock = {
      ...block,
      combinedText: listText,
      lines: block.lines ? block.lines.slice(1) : [],
      minY: block.lines && block.lines.length > 1 ? block.lines[1].y : headingEndY
    };
    return [headingBlock, listBlock];
  }
  
  const headingBlock = createHeadingBlock(block, headingLines, headingText, headingEndY);
  const listItemBlocks = splitListLinesIntoBlocks(listLines, block);
  
  if (listItemBlocks.length === 0) {
    const listBlock = {
      ...block,
      combinedText: listText,
      lines: listLines,
      minY: listLines.length > 0 ? listLines[0].y : headingEndY,
      maxY: listLines.length > 0 ? listLines[listLines.length - 1].y : headingEndY
    };
    return [headingBlock, listBlock];
  }
  
  return [headingBlock, ...listItemBlocks];
}

/**
 * Split blocks that contain list headings + list items
 * 
 * @param {Array} blocks - Blocks to process
 * @returns {Array} Blocks with split heading/list blocks
 */
export function splitListHeadings(blocks) {
  const blocksError = validateArrayInput(blocks, 'blocks');
  if (blocksError) {
    return blocks || [];
  }
  
  const processed = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    
    // CRITICAL: Check if first line ends with colon and second line starts with list marker
    // OR if first line is short and second line starts with list marker (heading without colon)
    // This handles the case where heading and list are on separate lines
    if (block.lines && block.lines.length > 1) {
      const firstLine = (block.lines[0]?.text || '').trim();
      const secondLine = (block.lines[1]?.text || '').trim();
      const firstEndsWithColon = firstLine.endsWith(':');
      const secondStartsWithMarker = LIST_ITEM_START_PATTERN.test(secondLine);
      const firstIsShort = firstLine.length <= ELEMENT_DECISION.LIST_HEADING_MAX_LENGTH;
      const firstLooksLikeHeading = firstIsShort && !firstLine.match(/[.!?]\s*$/);
      
      if (secondStartsWithMarker && (firstEndsWithColon || firstLooksLikeHeading)) {
        // Split at line boundary
        const headingBlock = {
          ...block,
          combinedText: firstLine,
          lines: [block.lines[0]],
          maxY: block.lines[0].y,
          minY: block.lines[0].y,
          isListHeading: true,
          followedByList: true
        };
        
        const listLines = block.lines.slice(1);
        
        // CRITICAL: Split list into separate blocks - one per list item
        // Use reusable helper function to avoid code duplication
        const listItemBlocks = splitListLinesIntoBlocks(listLines, block);
        
        log(`[PDF v3] splitListHeadings: Split block - heading="${firstLine.substring(0, 40)}", listItems=${listItemBlocks.length}`);
        processed.push(headingBlock, ...listItemBlocks);
        continue;
      }
    }
    
    // Try regular split (for single-line blocks or blocks where heading and list are in same line)
    const split = splitHeadingFromList(block);
    processed.push(...split);
  }
  
  log(`[PDF v3] splitListHeadings: Split complete - inputBlocks=${blocks.length}, outputBlocks=${processed.length}`);
  
  return processed;
}

