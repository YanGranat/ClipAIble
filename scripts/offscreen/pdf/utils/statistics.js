// @ts-check
// Statistics utilities - common statistical calculations
// Reduces code duplication across analyzers

/**
 * Calculate basic statistics for an array of numbers
 * @param {Array<number>} values - Array of numeric values
 * @returns {Object} Statistics object with min, max, avg, median, p75, p90
 */
export function calculateStatistics(values) {
  if (!values || values.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      percentile75: 0,
      percentile90: 0,
      count: 0
    };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = sum / count;
  const median = sorted[Math.floor(count / 2)];
  const percentile75 = sorted[Math.floor(count * 0.75)];
  const percentile90 = sorted[Math.floor(count * 0.90)];
  
  return {
    min,
    max,
    avg,
    median,
    percentile75,
    percentile90,
    count
  };
}

/**
 * Calculate gap statistics between consecutive values
 * @param {Array<number>} values - Sorted array of numeric values
 * @returns {Object} Gap statistics
 */
export function calculateGapStatistics(values) {
  if (!values || values.length < 2) {
    return {
      gaps: [],
      ...calculateStatistics([])
    };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const gaps = [];
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > 0) {
      gaps.push(gap);
    }
  }
  
  return {
    gaps,
    ...calculateStatistics(gaps)
  };
}

/**
 * Check if a value is a statistical outlier
 * @param {number} value - Value to check
 * @param {{min?: number, max?: number, avg?: number, median?: number, percentile75?: number, percentile90?: number, [key: string]: any}} stats - Statistics object from calculateStatistics
 * @param {{threshold?: number, method?: string, [key: string]: any}} [options={}] - Options for outlier detection
 * @returns {boolean} True if value is an outlier
 */
export function isOutlier(value, stats, options = {}) {
  const {
    avgMultiplier = 3.0,
    medianMultiplier = 4.0,
    percentile90Multiplier = 1.0
  } = options;
  
  if (stats.count === 0) return false;
  
  return (
    value > stats.avg * avgMultiplier ||
    value > stats.median * medianMultiplier ||
    value > stats.percentile90 * percentile90Multiplier
  );
}







