// @ts-check
// Gap analyzer - analyzes gaps between lines to determine paragraph boundaries
// Uses adaptive statistical analysis with automatic clustering and multi-factor decision making

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { GAP_ANALYSIS, ELEMENT_DECISION, DEFAULT_METRICS } from '../constants.js';
import {
  SENTENCE_END_PATTERN,
  CAPITAL_START_PATTERN,
  LOWERCASE_START_PATTERN,
  HYPHEN_END_PATTERN,
  PUNCTUATION_END_PATTERN,
  LIST_ITEM_START_PATTERN
} from '../utils/regex-patterns.js';
import { calculateStatistics } from '../utils/statistics.js';
import { calculateAverage, calculatePercentile } from '../utils/array-helpers.js';

// Heading indicators (short text, no sentence end, often followed by large gap)
const SHORT_TEXT_MAX = ELEMENT_DECISION.SHORT_TEXT_MAX;

/**
 * Simple K-means clustering to find natural gap clusters
 * @param {Array<number>} gaps - Array of gap values
 * @param {number} k - Number of clusters (usually 2: small and large gaps)
 * @returns {Object} Cluster centers and assignments
 */
function clusterGaps(gaps, k = 2) {
  if (gaps.length < k) {
    return { centers: gaps, assignments: gaps.map(() => 0) };
  }
  
  // Initialize centers: min, max, and evenly spaced between
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const min = sortedGaps[0];
  const max = sortedGaps[sortedGaps.length - 1];
  let centers = [];
  
  if (k === 2) {
    // Two clusters: small and large gaps
    const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
    centers = [min + (median - min) * 0.5, median + (max - median) * 0.5];
  } else {
    // Multiple clusters: evenly spaced
    for (let i = 0; i < k; i++) {
      centers.push(min + (max - min) * (i / (k - 1)));
    }
  }
  
  // K-means iteration (simplified, max 10 iterations)
  let assignments = [];
  for (let iter = 0; iter < 10; iter++) {
    // Assign each gap to nearest center
    assignments = gaps.map(gap => {
      let minDist = Infinity;
      let nearest = 0;
      centers.forEach((center, idx) => {
        const dist = Math.abs(gap - center);
        if (dist < minDist) {
          minDist = dist;
          nearest = idx;
        }
      });
      return nearest;
    });
    
    // Update centers
    const newCenters = [];
    for (let i = 0; i < k; i++) {
      const clusterGaps = gaps.filter((_, idx) => assignments[idx] === i);
      if (clusterGaps.length > 0) {
        newCenters[i] = clusterGaps.reduce((sum, g) => sum + g, 0) / clusterGaps.length;
      } else {
        newCenters[i] = centers[i];
      }
    }
    
    // Check convergence
    let converged = true;
    for (let i = 0; i < k; i++) {
      if (Math.abs(newCenters[i] - centers[i]) > 0.01) {
        converged = false;
        break;
      }
    }
    
    centers = newCenters;
    if (converged) break;
  }
  
  return { centers: centers.sort((a, b) => a - b), assignments };
}

/**
 * Analyze gap distribution to determine document type and thresholds
 * Supports different degrees of homogeneity
 * @param {Array<number>} gaps - Array of gap values
 * @returns {Object} Document type and thresholds
 */
function analyzeGapDistribution(gaps) {
  if (gaps.length === 0) {
    return {
      documentType: 'unknown',
      homogeneityLevel: 0,
      normalGapMax: 18,
      paragraphGapMin: 24,
      confidence: 0
    };
  }
  
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const gapStats = calculateStatistics(gaps);
  const { avg: mean, median: p50, percentile75: p75, percentile90: p90 } = gapStats;
  
  // Calculate variance and standard deviation
  const variance = gaps.reduce((sum, g) => sum + Math.pow(g - mean, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
  
  // Additional percentiles
  const p25 = calculatePercentile(sortedGaps, 25);
  const p95 = calculatePercentile(sortedGaps, 95);
  const p99 = calculatePercentile(sortedGaps, 99);
  
  // Calculate how many gaps are "close" to mean (within 1 stdDev)
  const closeToMean = gaps.filter(g => Math.abs(g - mean) <= stdDev).length;
  const closeToMeanRatio = closeToMean / gaps.length;
  
  // Calculate IQR (Interquartile Range) for spread measurement
  const iqr = p75 - p25;
  const iqrRatio = mean > 0 ? iqr / mean : 0;
  const p90p75Ratio = p75 > 0 ? (p90 - p75) / p75 : 0;
  
  // Try clustering to find natural groups
  const { centers, assignments } = clusterGaps(gaps, 2);
  const smallCluster = gaps.filter((_, idx) => assignments[idx] === 0);
  const largeCluster = gaps.filter((_, idx) => assignments[idx] === 1);
  
  const smallMean = smallCluster.length > 0 
    ? calculateAverage(smallCluster)
    : centers[0];
  const largeMean = largeCluster.length > 0 
    ? calculateAverage(largeCluster)
    : centers[1];
  
  const clusterSeparation = largeMean - smallMean;
  const clusterSeparationRatio = mean > 0 ? clusterSeparation / mean : 0;
  
  // Calculate homogeneity level (0 = not homogeneous, 1 = fully homogeneous)
  // Based on multiple factors with more lenient thresholds
  let homogeneityLevel = 0;
  
  if (coefficientOfVariation < 0.02 || (stdDev < 0.1 && closeToMeanRatio > 0.9)) {
    homogeneityLevel = 1.0; // Fully homogeneous
  } else if (coefficientOfVariation < 0.05 || (stdDev < 0.2 && closeToMeanRatio > 0.85)) {
    homogeneityLevel = 0.8; // Very homogeneous
  } else if (coefficientOfVariation < 0.10 && (closeToMeanRatio > 0.80 || iqrRatio < 0.15)) {
    homogeneityLevel = 0.6; // Mostly homogeneous
  } else if (coefficientOfVariation < 0.15 && (closeToMeanRatio > 0.70 || iqrRatio < 0.20)) {
    homogeneityLevel = 0.4; // Somewhat homogeneous
  } else if (coefficientOfVariation < 0.25 && (closeToMeanRatio > 0.60 || p90p75Ratio < 0.1)) {
    homogeneityLevel = 0.2; // Slightly homogeneous
  } else if (coefficientOfVariation < 0.35 && closeToMeanRatio > 0.55 && p90p75Ratio < 0.15) {
    // Even more lenient: if most gaps are close to mean and percentiles are close
    homogeneityLevel = 0.3; // Weakly homogeneous - still prefer continuation
  }
  
  log('[PDF v3] analyzeGapDistribution: Homogeneity analysis', {
    coefficientOfVariation: coefficientOfVariation.toFixed(6),
    stdDev: stdDev.toFixed(4),
    closeToMeanRatio: closeToMeanRatio.toFixed(3),
    iqrRatio: iqrRatio.toFixed(3),
    p90p75Ratio: p90p75Ratio.toFixed(3),
    homogeneityLevel: homogeneityLevel.toFixed(2),
    mean: mean.toFixed(2),
    p75: p75.toFixed(2),
    p90: p90.toFixed(2)
  });
  
  // Determine document type with gradation
  let documentType = 'mixed';
  let normalGapMax, paragraphGapMin;
  let confidence = 0.5;
  
  if (homogeneityLevel >= 0.8) {
    // Fully or very homogeneous: all gaps are very similar
    documentType = 'homogeneous';
    normalGapMax = mean * 0.99;
    paragraphGapMin = mean * 3.0; // Very high threshold - only extreme gaps break
    confidence = 0.9;
    log('[PDF v3] analyzeGapDistribution: Fully homogeneous document detected', {
      mean: mean.toFixed(2),
      stdDev: stdDev.toFixed(6),
      coefficientOfVariation: coefficientOfVariation.toFixed(6),
      homogeneityLevel: homogeneityLevel.toFixed(2)
    });
  } else if (homogeneityLevel >= 0.4) {
    // Mostly homogeneous: most gaps similar, but some outliers might be paragraph breaks
    documentType = 'mostly-homogeneous';
    // Use p95 or p99 to catch outliers that might be real paragraph breaks
    normalGapMax = mean * 1.1; // Slightly above mean
    paragraphGapMin = Math.max(p95, mean * 2.0); // Use high percentile or 2x mean
    confidence = 0.75;
    log('[PDF v3] analyzeGapDistribution: Mostly homogeneous document detected', {
      mean: mean.toFixed(2),
      stdDev: stdDev.toFixed(6),
      coefficientOfVariation: coefficientOfVariation.toFixed(6),
      homogeneityLevel: homogeneityLevel.toFixed(2),
      p95: p95.toFixed(2)
    });
  } else if (clusterSeparationRatio > 0.3 && smallCluster.length > gaps.length * 0.5) {
    // Bimodal: clear separation between small and large gaps
    documentType = 'bimodal';
    normalGapMax = Math.max(smallMean * 1.2, p75);
    paragraphGapMin = Math.min(largeMean * 0.8, p90);
    // Ensure separation
    if (paragraphGapMin <= normalGapMax) {
      paragraphGapMin = normalGapMax * 1.5;
    }
    confidence = 0.85;
    log('[PDF v3] analyzeGapDistribution: Bimodal distribution detected', {
      smallMean: smallMean.toFixed(2),
      largeMean: largeMean.toFixed(2),
      separation: clusterSeparation.toFixed(2),
      smallCount: smallCluster.length,
      largeCount: largeCluster.length
    });
  } else {
    // Mixed/gradual: gradual distribution, use percentiles
    documentType = 'gradual';
    normalGapMax = p75;
    paragraphGapMin = p90;
    
    // Ensure minimum separation
    if (paragraphGapMin <= normalGapMax) {
      paragraphGapMin = normalGapMax * 1.5;
    }
    
    // Use stdDev to refine if needed
    if (paragraphGapMin - normalGapMax < stdDev) {
      normalGapMax = mean + stdDev * 0.5;
      paragraphGapMin = mean + stdDev * 1.5;
    }
    
    confidence = 0.7;
    log('[PDF v3] analyzeGapDistribution: Gradual distribution detected', {
      p75: p75.toFixed(2),
      p90: p90.toFixed(2),
      mean: mean.toFixed(2),
      stdDev: stdDev.toFixed(2),
      homogeneityLevel: homogeneityLevel.toFixed(2)
    });
  }
  
  return {
    documentType,
    homogeneityLevel,
    normalGapMax,
    paragraphGapMin,
    mean,
    median: p50,
    stdDev,
    coefficientOfVariation,
    p75,
    p90,
    p95,
    p99,
    confidence,
    clusterSeparation,
    smallClusterSize: smallCluster.length,
    largeClusterSize: largeCluster.length,
    closeToMeanRatio
  };
}

/**
 * Analyze gaps between lines to determine paragraph boundaries
 * Uses adaptive statistical analysis with automatic clustering
 * 
 * @param {Array} lines - Array of line objects with y coordinates
 * @returns {Object} Gap analysis results
 */
export function analyzeGaps(lines) {
  // Validate input
  if (!lines || !Array.isArray(lines)) {
    log('[PDF v3] analyzeGaps: Invalid lines input, using defaults');
    return {
      normalGapMax: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD,
      paragraphGapMin: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD * 1.33, // ~24 (18 * 1.33)
      gapDistribution: {},
      documentType: 'unknown',
      isHomogeneousSpacing: false
    };
  }
  
  if (lines.length < 2) {
    return {
      normalGapMax: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD,
      paragraphGapMin: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD * 1.33, // ~24 (18 * 1.33)
      gapDistribution: {},
      documentType: 'unknown',
      isHomogeneousSpacing: false
    };
  }
  
  // Collect all gaps between consecutive lines on the same page
  // Also collect contextual information for advanced analysis
  const gaps = [];
  const gapContexts = []; // Store context for each gap
  
  // Pre-calculate line properties for context analysis
  const lineProperties = lines.map((line, idx) => {
    const text = (line.text || '').trim();
    const fontSize = line.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
    const textLength = text.length;
    const prevLine = idx > 0 ? lines[idx - 1] : null;
    const nextLine = idx < lines.length - 1 ? lines[idx + 1] : null;
    
    // Calculate relative position on page (if we have page height)
    // For now, use Y coordinate as proxy
    const yPos = line.y || 0;
    
    return {
      idx,
      text,
      textLength,
      fontSize,
      yPos,
      isShort: textLength < ELEMENT_DECISION.SHORT_TEXT,
      isVeryShort: textLength < ELEMENT_DECISION.VERY_SHORT_TEXT,
      hasSentenceEnd: SENTENCE_END_PATTERN.test(text),
      startsWithCapital: CAPITAL_START_PATTERN.test(text),
      startsWithLowercase: LOWERCASE_START_PATTERN.test(text),
      endsWithHyphen: HYPHEN_END_PATTERN.test(text),
      prevLine,
      nextLine
    };
  });
  
  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    
    // Only analyze gaps on the same page
    if (current.pageNum && next.pageNum && current.pageNum === next.pageNum) {
      const gap = next.y - current.y;
      if (gap > 0 && isFinite(gap)) {
        gaps.push(gap);
        
        // Store context for semantic and contextual analysis
        const currentText = (current.text || '').trim();
        const nextText = (next.text || '').trim();
        const currentProps = lineProperties[i];
        const nextProps = lineProperties[i + 1];
        
        // Calculate gap sequence context (look at surrounding gaps)
        const prevGap = i > 0 && lines[i - 1].pageNum === current.pageNum
          ? current.y - lines[i - 1].y
          : null;
        const nextGap = i + 1 < lines.length - 1 && lines[i + 2].pageNum === next.pageNum
          ? lines[i + 2].y - next.y
          : null;
        
        // Check if gap is part of a pattern (e.g., every Nth gap is large)
        const isOutlier = prevGap !== null && nextGap !== null
          ? (gap > prevGap * 1.5 && gap > nextGap * 1.5)
          : false;
        
        gapContexts.push({
          gap,
          currentTextEnd: currentText,
          nextTextStart: nextText,
          currentEndsWithSentenceEnd: SENTENCE_END_PATTERN.test(currentText),
          nextStartsWithCapital: CAPITAL_START_PATTERN.test(nextText),
          nextStartsWithLowercase: LOWERCASE_START_PATTERN.test(nextText),
          currentEndsWithHyphen: HYPHEN_END_PATTERN.test(currentText),
          currentEndsWithPunctuation: PUNCTUATION_END_PATTERN.test(currentText),
          // Additional context
          currentFontSize: current.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE,
          nextFontSize: next.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE,
          fontSizeChange: Math.abs((current.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE) - (next.fontSize || DEFAULT_METRICS.BASE_FONT_SIZE)),
          currentTextLength: currentText.length,
          nextTextLength: nextText.length,
          currentIsShort: currentProps.isShort,
          nextIsShort: nextProps.isShort,
          prevGap,
          nextGap,
          isOutlier,
          gapIndex: i
        });
      }
    }
  }
  
  if (gaps.length === 0) {
    return {
      normalGapMax: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD,
      paragraphGapMin: DEFAULT_METRICS.PARAGRAPH_GAP_THRESHOLD * 1.33, // ~24 (18 * 1.33)
      gapDistribution: {},
      documentType: 'unknown',
      isHomogeneousSpacing: false
    };
  }
  
  // Analyze gap distribution to determine document type and thresholds
  const distribution = analyzeGapDistribution(gaps);
  
  // Analyze semantic patterns for reference
  const continuationGaps = [];
  const breakGaps = [];
  
  for (const ctx of gapContexts) {
    const isStrongContinuation = 
      ctx.currentEndsWithHyphen ||
      (!ctx.currentEndsWithSentenceEnd && ctx.nextStartsWithLowercase);
    
    const isStrongBreak =
      ctx.currentEndsWithSentenceEnd && ctx.nextStartsWithCapital;
    
    if (isStrongContinuation && !isStrongBreak) {
      continuationGaps.push(ctx.gap);
    } else if (isStrongBreak && !isStrongContinuation) {
      breakGaps.push(ctx.gap);
    }
  }
  
  const result = {
    normalGapMax: distribution.normalGapMax,
    paragraphGapMin: distribution.paragraphGapMin,
    mean: distribution.mean,
    median: distribution.median,
    stdDev: distribution.stdDev,
    p75: distribution.p75,
    p90: distribution.p90,
    p95: distribution.p95,
    p99: distribution.p99,
    documentType: distribution.documentType,
    homogeneityLevel: distribution.homogeneityLevel,
    isHomogeneousSpacing: distribution.documentType === 'homogeneous' || 
                          distribution.homogeneityLevel >= 0.8,
    coefficientOfVariation: distribution.coefficientOfVariation,
    confidence: distribution.confidence,
    gapDistribution: {
      total: gaps.length,
      continuation: continuationGaps.length,
      break: breakGaps.length,
      smallCluster: distribution.smallClusterSize,
      largeCluster: distribution.largeClusterSize,
      closeToMean: Math.round(distribution.closeToMeanRatio * gaps.length)
    }
  };
  
  log('[PDF v3] analyzeGaps: Gap analysis complete', {
    documentType: result.documentType,
    homogeneityLevel: result.homogeneityLevel,
    isHomogeneousSpacing: result.isHomogeneousSpacing,
    normalGapMax: result.normalGapMax.toFixed(2),
    paragraphGapMin: result.paragraphGapMin.toFixed(2),
    mean: result.mean.toFixed(2),
    stdDev: result.stdDev.toFixed(4),
    coefficientOfVariation: result.coefficientOfVariation.toFixed(6),
    totalGaps: result.gapDistribution.total
  });
  
  return result;
}

/**
 * Multi-factor decision system for paragraph boundary detection
 * Combines visual, semantic, and contextual factors with adaptive weights
 * Handles edge cases: font size changes, outliers, sequence patterns, etc.
 * 
 * @param {number} gap - Gap size
 * @param {{normalGapMax?: number, paragraphGapMin?: number, mean?: number, [key: string]: any}} gapAnalysis - Results from analyzeGaps
 * @param {{currentTextEnd?: string, nextTextStart?: string, [key: string]: any}} context - Context
 * @param {{combinedText?: string, length?: number, [key: string]: any}} blockContext - Full block context
 * @returns {boolean} True if gap is a paragraph boundary
 */
export function isParagraphBoundary(gap, gapAnalysis, context = {}, blockContext = {}) {
  const { 
    normalGapMax, 
    paragraphGapMin, 
    documentType, 
    homogeneityLevel,
    isHomogeneousSpacing,
    mean,
    median,
    p95,
    p99,
    confidence
  } = gapAnalysis;
  
  const {
    currentTextEnd = '',
    nextTextStart = '',
    currentEndsWithSentenceEnd = false,
    nextStartsWithCapital = false,
    nextStartsWithLowercase = false,
    currentEndsWithHyphen = false,
    // Additional context
          currentFontSize = DEFAULT_METRICS.BASE_FONT_SIZE,
          nextFontSize = DEFAULT_METRICS.BASE_FONT_SIZE,
    fontSizeChange = 0,
    currentTextLength = 0,
    nextTextLength = 0,
    currentIsShort = false,
    nextIsShort = false,
    prevGap = null,
    nextGap = null,
    isOutlier = false
  } = context;
  
  const { combinedText = '', blockLength = 0, lineCount = 0 } = blockContext;
  
  // ===== PRIORITY 0: SPECIAL CASES (headings, lists) =====
  
  const nextStartsWithListMarker = LIST_ITEM_START_PATTERN.test(nextTextStart);
  if (nextStartsWithListMarker) {
    return true; // New list item - always break
  }
  
  const currentBlockStart = combinedText.trim().substring(0, 50);
  const currentStartsWithListMarker = LIST_ITEM_START_PATTERN.test(currentBlockStart);
  if (currentStartsWithListMarker) {
    if (nextStartsWithListMarker) {
      return true; // New list item
    }
    // List item continuation logic
    if (nextStartsWithLowercase && gap <= paragraphGapMin * 0.9) {
      return false; // Continue list item
    }
    if (nextStartsWithCapital && gap >= paragraphGapMin * 0.8) {
      return true; // New element after list
    }
  }
  
  // Heading detection with font size consideration
  const blockIsShort = blockLength > 0 && blockLength < SHORT_TEXT_MAX;
  const currentEndsWithColon = /:\s*$/.test(currentTextEnd);
  const fontSizeIncrease = nextFontSize > currentFontSize * 1.1; // Next is significantly larger
  const fontSizeDecrease = nextFontSize < currentFontSize * 0.9; // Next is significantly smaller
  
  // Heading: short block, large gap, next starts capital
  // Also check if next has larger font (heading -> paragraph) or current has larger font (heading)
  if (blockIsShort && 
      (!currentEndsWithSentenceEnd || currentEndsWithColon) &&
      gap >= paragraphGapMin * 0.9 &&
      nextStartsWithCapital) {
    // Additional check: if next is much shorter and has larger font, it might be a heading too
    if (nextIsShort && fontSizeIncrease) {
      // Both might be headings - break between them
      return true;
    }
    // Current is heading, next is paragraph
    return true;
  }
  
  // Font size change detection: significant font size change often indicates element boundary
  if (fontSizeChange > currentFontSize * 0.2) { // 20% change
    // Large font size change - likely different element types
    if (gap >= paragraphGapMin * 0.7) {
      return true; // Large gap + font change = boundary
    }
    // Even with smaller gap, font change might indicate boundary
    if (gap >= normalGapMax * 1.2 && (currentEndsWithSentenceEnd || nextStartsWithCapital)) {
      return true;
    }
  }
  
  // ===== PRIORITY 1: DOCUMENT TYPE SPECIFIC LOGIC =====
  
  // ===== PRIORITY 1: DOCUMENT TYPE SPECIFIC LOGIC =====
  // Check homogeneity FIRST before any other logic
  
  if (documentType === 'homogeneous' || homogeneityLevel >= 0.8) {
    // Fully homogeneous: all gaps are very similar, no visual paragraph breaks
    // CRITICAL: Never break except on extremely large gaps (3x mean or more)
    const homogeneousBreakThreshold = mean * 3.0;
    if (gap >= homogeneousBreakThreshold) {
      log('[PDF v3] isParagraphBoundary: Homogeneous doc - extremely large gap', {
        gap: gap.toFixed(2),
        mean: mean.toFixed(2),
        threshold: homogeneousBreakThreshold.toFixed(2)
      });
      return true; // Extremely large gap (might be empty line)
    }
    
    // NEW: Check for fontSize change even in homogeneous docs
    // Font size changes indicate different element types (heading vs paragraph)
    if (fontSizeChange > currentFontSize * 0.2) {
      // Font size changed by >20% - likely different element type
      // Also check if current block is short (likely heading)
      const currentBlockLength = blockLength || 0;
      const isShortBlock = currentBlockLength > 0 && currentBlockLength < 150;
      
      if (isShortBlock || gap >= mean * 1.5) {
        log('[PDF v3] isParagraphBoundary: Homogeneous doc - fontSize change detected', {
          gap: gap.toFixed(2),
          fontSizeChange: fontSizeChange.toFixed(2),
          currentFontSize: currentFontSize.toFixed(2),
          nextFontSize: nextFontSize.toFixed(2),
          isShortBlock
        });
        return true; // Font size change indicates element boundary
      }
    }
    
    // NEVER break based on semantic indicators alone in fully homogeneous docs
    // All gaps are similar = one continuous text
    return false;
  } else if (documentType === 'mostly-homogeneous' || homogeneityLevel >= 0.4) {
    // Mostly homogeneous: most gaps similar, but some outliers might be paragraph breaks
    // Use higher threshold but allow semantic analysis ONLY for clear outliers
    const outlierThreshold = Math.max(p95 || mean * 2.0, mean * 2.0);
    
    if (gap >= outlierThreshold) {
      // This is a clear outlier - might be a real paragraph break
      // Use semantic analysis to confirm
      if (currentEndsWithSentenceEnd && nextStartsWithCapital && !currentEndsWithHyphen) {
        log('[PDF v3] isParagraphBoundary: Mostly-homogeneous - outlier + semantic break', {
          gap: gap.toFixed(2),
          mean: mean.toFixed(2),
          threshold: outlierThreshold.toFixed(2)
        });
        return true; // Outlier + semantic break = likely paragraph boundary
      }
      // Very large gap even without strong semantic break
      if (gap >= mean * 2.5) {
        log('[PDF v3] isParagraphBoundary: Mostly-homogeneous - extremely large gap', {
          gap: gap.toFixed(2),
          mean: mean.toFixed(2)
        });
        return true; // Extremely large gap
      }
    }
    
    // For gaps below outlier threshold, STRICTLY prefer continuation
    // Don't break on semantic indicators alone if gap is not a clear outlier
    // This is critical: in mostly-homogeneous docs, most gaps are similar
    // Only break on clear visual outliers, not on semantic hints
    return false;
  }
  
  // ===== PRIORITY 2: VISUAL THRESHOLDS (primary for non-homogeneous) =====
  
  // Very large gap = definitely paragraph break
  if (gap >= paragraphGapMin) {
    return true;
  }
  
  // Very small gap = definitely continuation
  if (gap <= normalGapMax) {
    return false;
  }
  
  // ===== PRIORITY 3: MULTI-FACTOR DECISION (ambiguous zone) =====
  
  // Calculate visual score (0-1, where 1 = definitely break)
  const thresholdRange = paragraphGapMin - normalGapMax;
  let visualScore = 0.5; // Default
  
  if (thresholdRange > 0.1) {
    visualScore = (gap - normalGapMax) / thresholdRange;
    visualScore = Math.max(0, Math.min(1, visualScore)); // Clamp to [0, 1]
  }
  
  // Outlier detection: if gap is significantly larger than surrounding gaps
  if (isOutlier && prevGap !== null && nextGap !== null) {
    // This gap stands out from its neighbors - boost visual score
    const outlierBoost = Math.min(0.3, (gap - Math.max(prevGap, nextGap)) / mean);
    visualScore = Math.min(1.0, visualScore + outlierBoost);
  }
  
  // Calculate semantic score (0-1, where 1 = definitely break)
  let semanticScore = 0.5; // Neutral
  
  // Strong continuation indicators
  if (currentEndsWithHyphen) {
    semanticScore = 0.0; // Very strong continuation
  } else if (!currentEndsWithSentenceEnd && nextStartsWithLowercase) {
    semanticScore = 0.2; // Strong continuation
  } else if (currentEndsWithSentenceEnd && nextStartsWithCapital) {
    semanticScore = 0.8; // Strong break indicator
  }
  
  // Contextual adjustments based on block properties
  if (blockLength > 500 && visualScore < 0.6) {
    semanticScore *= 0.8; // Long blocks prefer continuation
  }
  
  // Short block after long block with large gap = likely heading
  // CRITICAL: If current block is long and next is short (heading), and gap is larger than average, it's a boundary
  if (blockLength > 300 && nextIsShort && nextStartsWithCapital && gap >= mean * 1.5) {
    // This is a strong indicator: long paragraph -> gap -> short heading
    // Example: "organic molecules." (long) -> gap=28.57 -> "Experimental Results" (short heading)
    log('[PDF v3] isParagraphBoundary: Long block followed by short heading - forcing boundary', {
      blockLength,
      nextTextLength,
      gap: gap.toFixed(2),
      mean: mean.toFixed(2),
      threshold: (mean * 1.5).toFixed(2)
    });
    return true; // Force boundary for long paragraph -> short heading
  }
  
  // Short block after long block with large gap = likely heading (weaker check)
  if (blockLength > 300 && nextIsShort && gap >= paragraphGapMin * 0.8) {
    semanticScore = Math.max(semanticScore, 0.7); // Boost break score
  }
  
  // Very short next line (might be heading or list marker)
  if (nextTextLength < 30 && gap >= normalGapMax * 1.5) {
    semanticScore = Math.max(semanticScore, 0.6); // Boost break score
  }
  
  // Sequence pattern: if previous and next gaps are small, but current is large
  // This is more likely a boundary than if all gaps are large
  if (prevGap !== null && nextGap !== null) {
    const avgSurroundingGap = (prevGap + nextGap) / 2;
    if (gap > avgSurroundingGap * 2.0 && avgSurroundingGap <= normalGapMax) {
      // Current gap is much larger than neighbors - likely boundary
      visualScore = Math.min(1.0, visualScore + 0.2);
    } else if (gap < avgSurroundingGap * 0.7 && avgSurroundingGap >= paragraphGapMin) {
      // Current gap is much smaller than neighbors - likely continuation
      visualScore = Math.max(0.0, visualScore - 0.2);
    }
  }
  
  // Additional contextual factors
  
  // Factor 1: Block length ratio
  // If current block is very long and next is short, might be heading
  let lengthRatioScore = 0.5;
  if (blockLength > 200 && nextTextLength < 100 && gap >= paragraphGapMin * 0.7) {
    lengthRatioScore = 0.7; // Long block -> short block with gap = likely boundary
  } else if (blockLength < 100 && nextTextLength > 300) {
    lengthRatioScore = 0.6; // Short block -> long block = likely heading -> paragraph
  } else if (blockLength > 500 && nextTextLength > 500) {
    lengthRatioScore = 0.3; // Both long = prefer continuation
  }
  
  // Factor 2: Font size change impact
  let fontSizeScore = 0.5;
  if (fontSizeChange > currentFontSize * 0.3) {
    // Very large font change (30%+) = likely different element types
    fontSizeScore = 0.8;
  } else if (fontSizeChange > currentFontSize * 0.15) {
    // Moderate font change (15-30%) = possible boundary
    fontSizeScore = 0.6;
  } else if (fontSizeChange < currentFontSize * 0.05) {
    // Very similar font sizes = likely same element type
    fontSizeScore = 0.3;
  }
  
  // Factor 3: Sequence pattern (gap relative to neighbors)
  let sequenceScore = 0.5;
  if (prevGap !== null && nextGap !== null) {
    const avgNeighbor = (prevGap + nextGap) / 2;
    if (gap > avgNeighbor * 1.8) {
      // Current gap is much larger than neighbors - strong boundary signal
      sequenceScore = 0.8;
    } else if (gap < avgNeighbor * 0.6) {
      // Current gap is much smaller - continuation signal
      sequenceScore = 0.2;
    } else if (Math.abs(gap - avgNeighbor) < avgNeighbor * 0.2) {
      // Similar to neighbors - neutral
      sequenceScore = 0.5;
    }
  }
  
  // Combine all factors with weights
  let visualWeight, semanticWeight, contextualWeight;
  
  if (documentType === 'bimodal') {
    // Bimodal: clear visual separation, trust visual more
    visualWeight = 0.6;
    semanticWeight = 0.25;
    contextualWeight = 0.15;
  } else if (documentType === 'gradual') {
    // Gradual: balance all factors
    visualWeight = 0.4;
    semanticWeight = 0.35;
    contextualWeight = 0.25;
  } else if (documentType === 'mostly-homogeneous') {
    // Mostly homogeneous: trust semantic and context more for outliers
    visualWeight = 0.3;
    semanticWeight = 0.4;
    contextualWeight = 0.3;
  } else {
    // Default: balanced, but adjust based on homogeneity level
    const baseVisual = 0.5;
    const baseSemantic = 0.3;
    const baseContextual = 0.2;
    // More homogeneous = less visual weight, more semantic/contextual
    visualWeight = baseVisual - (homogeneityLevel * 0.2);
    semanticWeight = baseSemantic + (homogeneityLevel * 0.15);
    contextualWeight = baseContextual + (homogeneityLevel * 0.05);
  }
  
  // Calculate contextual score from multiple factors
  const contextualScore = (lengthRatioScore * 0.4 + fontSizeScore * 0.4 + sequenceScore * 0.2);
  
  // Final combined score
  const combinedScore = visualScore * visualWeight + 
                       semanticScore * semanticWeight + 
                       contextualScore * contextualWeight;
  
  // Decision threshold: > 0.6 = break, < 0.4 = continue, 0.4-0.6 = use tie-breakers
  if (combinedScore > 0.65) {
    return true; // Strong break signal
  }
  if (combinedScore < 0.35) {
    return false; // Strong continuation signal
  }
  
  // Tie-breaker zone (0.35-0.65): use multiple factors
  // Prefer continuation to avoid over-splitting, but break on strong signals
  if (visualScore > 0.7 && semanticScore > 0.6) {
    return true; // Both visual and semantic agree on break
  }
  if (visualScore < 0.3 && semanticScore < 0.4) {
    return false; // Both agree on continuation
  }
  
  // If font size changes significantly, prefer break
  if (fontSizeChange > currentFontSize * 0.2 && gap >= normalGapMax * 1.3) {
    return true;
  }
  
  // Default: prefer continuation in ambiguous cases to avoid over-splitting
  return combinedScore > 0.5 && visualScore > 0.6;
}
