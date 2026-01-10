// @ts-check
// PDF metrics analyzer - analyzes font sizes, spacing, etc.

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
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
  
  // Font size analysis
  const fontSizes = items.map(item => item.fontSize || 0).filter(s => s > 0 && isFinite(s));
  fontSizes.sort((a, b) => a - b);
  
  // Base font size (mode - most frequent)
  const fontSizeCounts = new Map();
  fontSizes.forEach(s => {
    const rounded = Math.round(s * 2) / 2; // Round to 0.5
    fontSizeCounts.set(rounded, (fontSizeCounts.get(rounded) || 0) + 1);
  });
  
  let baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE;
  let maxCount = 0;
  fontSizeCounts.forEach((count, size) => {
    if (count > maxCount) {
      maxCount = count;
      baseFontSize = size;
    }
  });
  
  const medianFontSize = fontSizes.length > 0 
    ? fontSizes[Math.floor(fontSizes.length / 2)] 
    : baseFontSize;
  
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

