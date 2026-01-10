// @ts-check
// List classifier - determines if element is a list item
// Enhanced with list type detection (ordered/unordered), nesting level, and marker extraction

import { log } from '../utils/logging.js';
import { LIST_ITEM_START_PATTERN, LIST_ITEM_PATTERNS } from '../utils/regex-patterns.js';

// Patterns for detecting list types
const ORDERED_LIST_PATTERN = /^[\s]*(\d+)[\.\)]\s+/u;
const UNORDERED_BULLET_PATTERN = /^[\s]*([•\-\*\+▪▫◦‣⁃])\s+/u;
const LETTER_LIST_PATTERN = /^[\s]*([a-zA-Z])[\.\)]\s+/u; // a), b), A), B), etc.
const ROMAN_NUMERAL_PATTERN = /^[\s]*(i{1,3}|iv|vi{0,3}|xi{0,2}|I{1,3}|IV|VI{0,3}|XI{0,2})[\.\)]\s+/u; // i), ii), iii), etc.

/**
 * Extract list marker and determine list type
 * 
 * @param {string} text - Text to analyze
 * @returns {Object} { marker, type, level, ordered }
 */
function extractListInfo(text) {
  if (!text || typeof text !== 'string') {
    return { marker: null, type: null, level: 0, ordered: false };
  }
  
  const trimmed = text.trim();
  
  // Check for numbered list (1., 2., etc.)
  let match = ORDERED_LIST_PATTERN.exec(trimmed);
  if (match) {
    return {
      marker: match[1],
      type: 'numbered',
      level: 0,
      ordered: true,
      pattern: 'numbered'
    };
  }
  
  // Check for letter list (a), b), A), B), etc.)
  match = LETTER_LIST_PATTERN.exec(trimmed);
  if (match) {
    const letter = match[1];
    const isUpperCase = /^[A-Z]$/.test(letter);
    return {
      marker: letter,
      type: 'letter',
      level: isUpperCase ? 0 : 1, // Uppercase = level 0, lowercase = level 1
      ordered: true,
      pattern: 'letter'
    };
  }
  
  // Check for roman numeral list (i), ii), iii), etc.)
  match = ROMAN_NUMERAL_PATTERN.exec(trimmed);
  if (match) {
    const numeral = match[1];
    const isUpperCase = /^[IVX]+$/.test(numeral);
    return {
      marker: numeral,
      type: 'roman',
      level: isUpperCase ? 0 : 1, // Uppercase = level 0, lowercase = level 1
      ordered: true,
      pattern: 'roman'
    };
  }
  
  // Check for bullet list
  match = UNORDERED_BULLET_PATTERN.exec(trimmed);
  if (match) {
    const bullet = match[1];
    // Different bullets might indicate different nesting levels
    // Common bullets: • (level 0), - (level 1), * (level 1), + (level 1)
    let level = 0;
    if (bullet === '•' || bullet === '●') {
      level = 0;
    } else if (bullet === '-' || bullet === '—' || bullet === '–') {
      level = 1;
    } else if (bullet === '*' || bullet === '+') {
      level = 1;
    } else {
      level = 0;
    }
    
    return {
      marker: bullet,
      type: 'bullet',
      level,
      ordered: false,
      pattern: 'bullet'
    };
  }
  
  // Check for indentation-based list (no marker, but indented)
  // This is detected by X-coordinate analysis, not text pattern
  // For now, return null - will be handled by other algorithms
  
  return { marker: null, type: null, level: 0, ordered: false };
}

/**
 * Check if text contains list items (anywhere in text, not just at start)
 * CRITICAL: Also checks if element has multiple lines that all start with list markers
 * 
 * @param {string} text - Text to check
 * @param {{lines?: Array<any>, text?: string, [key: string]: any}} element - Element object (may contain lines array)
 * @returns {Object} { hasListItems, listInfo, firstMarkerPosition }
 */
function findListItemsInText(text, element = {}) {
  if (!text || typeof text !== 'string') {
    return { hasListItems: false, listInfo: null, firstMarkerPosition: -1 };
  }
  
  // CRITICAL: Check if element has multiple lines that all start with list markers
  // This handles the case: "Heading:" + "• Item 1" + "• Item 2" + "• Item 3"
  if (element.lines && Array.isArray(element.lines) && element.lines.length > 1) {
    // Check if at least 2 lines start with list markers
    let listMarkerCount = 0;
    let firstListLineIndex = -1;
    let listMarker = null;
    
    for (let i = 0; i < element.lines.length; i++) {
      const lineText = (element.lines[i]?.text || '').trim();
      if (LIST_ITEM_START_PATTERN.test(lineText)) {
        if (firstListLineIndex < 0) {
          firstListLineIndex = i;
          const lineListInfo = extractListInfo(lineText);
          listMarker = lineListInfo.marker;
        }
        listMarkerCount++;
      }
    }
    
    // If 2+ lines start with list markers, it's definitely a list
    if (listMarkerCount >= 2 && listMarker !== null) {
      const listInfo = extractListInfo(element.lines[firstListLineIndex].text);
      log(`[PDF v3] findListItemsInText: Multi-line list detected - listMarkerCount=${listMarkerCount}, firstListLineIndex=${firstListLineIndex}, marker="${listMarker}"`);
      return {
        hasListItems: true,
        listInfo,
        firstMarkerPosition: firstListLineIndex === 0 ? 0 : -1 // -1 means marker is not at text start
      };
    }
  }
  
  // First check if starts with list marker (most common case)
  const listInfo = extractListInfo(text);
  if (listInfo.marker !== null) {
    return {
      hasListItems: true,
      listInfo,
      firstMarkerPosition: 0
    };
  }
  
  // Check if contains list markers anywhere in text
  // Pattern: space or colon, then list marker
  // Examples: "Heading: • Item" or "Text 1. Item"
  const listMarkerPattern = /([:\s]+)([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;
  const match = listMarkerPattern.exec(text);
  
  if (match) {
    const markerText = match[2];
    const markerPosition = match.index + match[1].length;
    
    // Extract list info from the marker
    const textFromMarker = text.substring(markerPosition);
    const markerListInfo = extractListInfo(textFromMarker);
    
    if (markerListInfo.marker !== null) {
      return {
        hasListItems: true,
        listInfo: markerListInfo,
        firstMarkerPosition: markerPosition
      };
    }
  }
  
  return { hasListItems: false, listInfo: null, firstMarkerPosition: -1 };
}

/**
 * Algorithm 1: Numbered pattern
 * Lists often start with numbers: "1. ", "2. ", etc.
 * Also checks if text contains numbered list items anywhere
 * 
 * @param {{text?: string, lines?: Array<any>, [key: string]: any}} element - Element to classify
 * @returns {Object} Classification result
 */
function classifyByNumberedPattern(element) {
  const text = element.text || '';
  const { hasListItems, listInfo, firstMarkerPosition } = findListItemsInText(text, element);
  
  const isList = hasListItems && listInfo && listInfo.ordered && 
                 (listInfo.type === 'numbered' || listInfo.type === 'letter' || listInfo.type === 'roman');
  
  // Higher confidence if starts with marker, lower if marker is in middle
  // CRITICAL: If multiple lines have markers, boost confidence significantly
  const hasMultipleListLines = element.lines && element.lines.length > 1 && 
                                element.lines.filter(l => LIST_ITEM_START_PATTERN.test((l.text || '').trim())).length >= 2;
  
  const confidence = isList 
    ? (hasMultipleListLines ? 0.95 : (firstMarkerPosition === 0 ? 0.9 : 0.75))
    : 0.2;
  
  return {
    type: isList ? 'list' : 'not-list',
    confidence,
    algorithm: 'numbered-pattern',
    details: { 
      startsWithNumber: firstMarkerPosition === 0 && isList,
      containsNumber: hasListItems && isList,
      listInfo: isList ? listInfo : null,
      markerPosition: firstMarkerPosition,
      hasMultipleListLines
    }
  };
}

/**
 * Algorithm 2: Bulleted pattern
 * Lists often start with bullets: "• ", "● ", "- ", etc.
 * Also checks if text contains bulleted list items anywhere
 * 
 * @param {{text?: string, lines?: Array<any>, [key: string]: any}} element - Element to classify
 * @returns {Object} Classification result
 */
function classifyByBulletedPattern(element) {
  const text = element.text || '';
  const { hasListItems, listInfo, firstMarkerPosition } = findListItemsInText(text, element);
  
  const isList = hasListItems && listInfo && !listInfo.ordered && listInfo.type === 'bullet';
  
  // CRITICAL: If multiple lines have bullet markers, boost confidence significantly
  // This handles: "Heading:" + "• Item 1" + "• Item 2" + "• Item 3"
  const hasMultipleListLines = element.lines && element.lines.length > 1 && 
                                element.lines.filter(l => LIST_ITEM_START_PATTERN.test((l.text || '').trim())).length >= 2;
  
  // Higher confidence if starts with marker, lower if marker is in middle
  // But if multiple lines have markers, it's DEFINITELY a list
  const confidence = isList 
    ? (hasMultipleListLines ? 0.95 : (firstMarkerPosition === 0 ? 0.9 : 0.75))
    : 0.2;
  
  log(`[PDF v3] classifyByBulletedPattern: isList=${isList}, hasMultipleListLines=${hasMultipleListLines}, confidence=${confidence.toFixed(2)}, firstMarkerPosition=${firstMarkerPosition}`);
  
  return {
    type: isList ? 'list' : 'not-list',
    confidence,
    algorithm: 'bulleted-pattern',
    details: { 
      startsWithBullet: firstMarkerPosition === 0 && isList,
      containsBullet: hasListItems && isList,
      listInfo: isList ? listInfo : null,
      markerPosition: firstMarkerPosition,
      hasMultipleListLines
    }
  };
}

/**
 * Algorithm 3: Indentation-based detection
 * Lists might be indented relative to normal paragraphs
 * 
 * @param {{text?: string, lines?: Array<any>, [key: string]: any}} element - Element to classify
 * @param {{previousElements?: Array<any>, metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} context - Context
 * @returns {Object} Classification result
 */
function classifyByIndentation(element, context = {}) {
  // This requires X-coordinate analysis
  // For now, return low confidence
  // Will be enhanced with actual indentation analysis
  return {
    type: 'not-list',
    confidence: 0.1,
    algorithm: 'indentation',
    details: { note: 'Not yet implemented' }
  };
}

/**
 * Classify element as list using multiple algorithms
 * Enhanced to extract list type, level, and marker
 * 
 * @param {{text?: string, lines?: Array<any>, [key: string]: any}} element - Element to classify
 * @param {{previousElements?: Array<any>, metrics?: {baseFontSize?: number, [key: string]: any}, [key: string]: any}} [context={}] - Optional context
 * @returns {{type: string, confidence: number, algorithm: string, details: {[key: string]: any}}} Classification result with list metadata
 */
export function classifyList(element, context = {}) {
  // Validate inputs
  if (!element || typeof element !== 'object') {
    log('[PDF v3] classifyList: Invalid element', { element });
    return {
      type: 'not-list',
      confidence: 0,
      algorithm: 'error',
      details: { error: 'Invalid element' }
    };
  }
  
  const text = element.text || '';
  const listInfo = extractListInfo(text);
  
  const results = [
    classifyByNumberedPattern(element),
    classifyByBulletedPattern(element),
    classifyByIndentation(element, context)
  ];
  
  // If any algorithm says it's a list with high confidence, it's a list
  const maxConfidence = Math.max(...results.map(r => r.type === 'list' ? r.confidence : 0));
  const isList = maxConfidence > 0.5;
  
  // Build enhanced result with list metadata
  const result = {
    type: isList ? 'list' : 'not-list',
    confidence: maxConfidence,
    algorithm: 'consensus',
    details: { 
      results, 
      maxConfidence,
      listInfo: isList ? listInfo : null
    }
  };
  
  // Add list metadata to result if it's a list
  if (isList && listInfo.marker !== null) {
    result.listType = listInfo.ordered ? 'ordered' : 'unordered';
    result.listLevel = listInfo.level || 0;
    result.listMarker = listInfo.marker;
    result.listPattern = listInfo.pattern;
  }
  
  log(`[PDF v3] classifyList: ${isList ? 'LIST' : 'NOT LIST'}`, {
    text: text.substring(0, 50),
    maxConfidence: maxConfidence.toFixed(2),
    listType: isList ? result.listType : null,
    listLevel: isList ? result.listLevel : null,
    listMarker: isList ? result.listMarker : null,
    results: results.map(r => ({
      algorithm: r.algorithm,
      confidence: r.confidence.toFixed(2),
      type: r.type
    }))
  });
  
  return result;
}
