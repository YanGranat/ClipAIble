// @ts-check
// PDF metrics analyzer - analyzes font sizes, spacing, etc.

import { log } from '../../../utils/logging.js';
import { DEFAULT_METRICS } from '../constants.js';

/**
 * Analyze PDF metrics from sample items
 * Computes base font size, spacing, etc.
 * 
 * @param {Array} items - Sample text items from first pages
 * @param {number} numPages - Total number of pages
 * @returns {Object} PDF metrics
 */
export function analyzePdfMetrics(items, numPages) {
  // Validate inputs
  if (!items || !Array.isArray(items) || items.length === 0) {
    log('[PDF v3] analyzePdfMetrics: Invalid items input, using defaults');
    return {
      baseFontSize: DEFAULT_METRICS.BASE_FONT_SIZE,
      medianFontSize: DEFAULT_METRICS.MEDIAN_FONT_SIZE,
      modeSpacing: DEFAULT_METRICS.MODE_SPACING,
      paragraphGapThreshold: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD
    };
  }
  
  if (typeof numPages !== 'number' || numPages < 1) {
    log('[PDF v3] analyzePdfMetrics: Invalid numPages, using 1', { numPages });
    numPages = 1;
  }
  
  // Weigh printed characters, not PDF text operations, which may split labels
  // and indices glyph by glyph while emitting whole lines of body text at once.
  const fontSizes = items
    .filter(item => Number.isFinite(item.fontSize) && item.fontSize > 0)
    .map(item => ({
      size: item.fontSize,
      weight: Math.max(1, typeof item.str === 'string' ? item.str.replace(/\s+/gu, '').length : 0)
    }))
    .sort((a, b) => a.size - b.size);
  const fontSizeCounts = new Map();
  let totalWeight = 0;
  for (const { size, weight } of fontSizes) {
    const rounded = Math.round(size * 2) / 2 || size;
    fontSizeCounts.set(rounded, (fontSizeCounts.get(rounded) || 0) + weight);
    totalWeight += weight;
  }
  
  let baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE;
  let maxCount = 0;
  fontSizeCounts.forEach((count, size) => {
    if (count > maxCount) {
      maxCount = count;
      baseFontSize = size;
    }
  });
  
  let medianFontSize = baseFontSize;
  let cumulativeWeight = 0;
  for (const { size, weight } of fontSizes) {
    cumulativeWeight += weight;
    if (cumulativeWeight > totalWeight / 2) {
      medianFontSize = size;
      break;
    }
  }
  
  // Spacing analysis
  const yCoords = items.map(item => item.y || 0).filter(y => y > 0 && isFinite(y));
  yCoords.sort((a, b) => a - b);
  
  const spacings = [];
  for (let i = 1; i < yCoords.length; i++) {
    const spacing = yCoords[i] - yCoords[i - 1];
    if (spacing > 0 && spacing < baseFontSize * 10) {
      spacings.push(spacing);
    }
  }
  
  // Most common spacing (mode)
  const spacingCounts = new Map();
  spacings.forEach(s => {
    const rounded = Math.round(s);
    spacingCounts.set(rounded, (spacingCounts.get(rounded) || 0) + 1);
  });
  
  let modeSpacing = DEFAULT_METRICS.MODE_SPACING;
  let maxSpacingCount = 0;
  spacingCounts.forEach((count, spacing) => {
    if (count > maxSpacingCount) {
      maxSpacingCount = count;
      modeSpacing = spacing;
    }
  });
  
  // Paragraph gap threshold
  const paragraphGapThreshold = Math.max(
    modeSpacing * 1.5,
    baseFontSize * 1.2
  );
  
  const metrics = {
    baseFontSize,
    medianFontSize,
    modeSpacing,
    paragraphGapThreshold
  };
  
  log('[PDF v3] analyzePdfMetrics: Metrics computed', metrics);
  
  return metrics;
}

