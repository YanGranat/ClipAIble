// @ts-check
// Subheading classifier - determines heading level
// TODO: Implement multiple algorithms for subheading detection

import { DEFAULT_METRICS } from '../constants.js';

/**
 * Classify element as subheading and determine level
 * 
 * @param {{fontSize?: number, [key: string]: any}} element - Element to classify
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @param {{[key: string]: any}} context - Element context
 * @returns {Object} Classification result with level
 */
export function classifySubheading(element, metrics, context) {
  // TODO: Implement multiple algorithms:
  // - Font size relative to main headings
  // - Numbering patterns (1.1, 1.2, etc.)
  // - Context (after main heading)
  // - Outline matching
  
  // Placeholder: simple font size based classification
  const fontSize = element.fontSize || 0;
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  const ratio = baseFontSize > 0 ? fontSize / baseFontSize : 1;
  
  let level = 2; // Default to H2
  if (ratio >= 1.5) level = 1;
  else if (ratio >= 1.3) level = 2;
  else if (ratio >= 1.2) level = 3;
  else if (ratio >= 1.1) level = 4;
  else level = 5;
  
  return {
    type: 'heading',
    level,
    confidence: 0.5, // Low confidence for placeholder
    algorithm: 'placeholder-font-size',
    details: { fontSize, baseFontSize, ratio }
  };
}

