// @ts-check
// Structure analyzer - analyzes document structure

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { ELEMENT_DECISION } from '../constants.js';

/**
 * Analyze document structure
 * 
 * @param {Array} elements - All elements in document
 * @param {Array} groupedBlocks - Original grouped blocks with spacing info
 * @returns {Object} Structure information
 */
export function analyzeStructure(elements, groupedBlocks = []) {
  if (!elements || elements.length === 0) {
    return {
      isHomogeneous: true,
      hasFontVariation: false,
      hasStyleVariation: false,
      firstElementContext: null,
      likelyHasHeadings: false
    };
  }
  
  // Analyze font size variation
  const fontSizes = elements
    .map(el => el.fontSize || 0)
    .filter(s => s > 0);
  
  const uniqueFontSizes = new Set(fontSizes.map(s => Math.round(s * 2) / 2));
  const hasFontVariation = uniqueFontSizes.size > 1;
  
  // Analyze style variation (bold, italic)
  const hasBold = elements.some(el => el.isBold);
  const hasItalic = elements.some(el => el.isItalic);
  const hasStyleVariation = hasBold || hasItalic;
  
  // Check if document is homogeneous (same font size, same style)
  const isHomogeneous = !hasFontVariation && !hasStyleVariation;
  
  // Analyze first element context
  let firstElementContext = null;
  if (elements.length > 0) {
    const firstElement = elements[0];
    const secondElement = elements.length > 1 ? elements[1] : null;
    
    // Check gap after first element (if we have block info with Y coordinates)
    let gapAfterFirst = null;
    if (groupedBlocks.length > 1) {
      const firstBlock = groupedBlocks[0];
      const secondBlock = groupedBlocks[1];
      if (firstBlock && secondBlock && 
          typeof firstBlock.maxY === 'number' && 
          typeof secondBlock.minY === 'number') {
        // Calculate gap between first and second block using Y coordinates
        gapAfterFirst = secondBlock.minY - firstBlock.maxY;
      }
    }
    
    firstElementContext = {
      text: firstElement.text || '',
      textLength: (firstElement.text || '').length,
      fontSize: firstElement.fontSize || 0,
      isBold: firstElement.isBold || false,
      isItalic: firstElement.isItalic || false,
      type: firstElement.type || 'unknown',
      hasNextElement: !!secondElement,
      nextElementLength: secondElement ? (secondElement.text || '').length : 0,
      gapAfterFirst
    };
  }
  
  // Determine if document likely has headings
  // Headings are likely if:
  // 1. There's font/style variation, OR
  // 2. First element is short and followed by longer text with gap
  let likelyHasHeadings = false;
  if (hasFontVariation || hasStyleVariation) {
    likelyHasHeadings = true;
  } else if (firstElementContext) {
    // Even without font variation, if first element is short
    // and followed by much longer text, it might be a heading
    const firstIsShort = firstElementContext.textLength < ELEMENT_DECISION.SHORT_TEXT_MAX;
    const nextIsLong = firstElementContext.hasNextElement && 
                      firstElementContext.nextElementLength > ELEMENT_DECISION.MEDIUM_TEXT;
    
    if (firstIsShort && nextIsLong) {
      likelyHasHeadings = true;
    }
  }
  
  const structure = {
    isHomogeneous,
    hasFontVariation,
    hasStyleVariation,
    firstElementContext,
    likelyHasHeadings,
    totalElements: elements.length,
    uniqueFontSizes: Array.from(uniqueFontSizes).sort((a, b) => a - b)
  };
  
  log('[PDF v3] analyzeStructure: Structure analyzed', structure);
  
  return structure;
}

