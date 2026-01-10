// @ts-check
// Heading hierarchy analyzer - determines heading levels using clustering, outline, and numbering
// FIXES v2 problems: adaptive thresholds, validation, relative position checking

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { FONT_SIZE_THRESHOLDS, HEADING_THRESHOLDS, ELEMENT_DECISION } from '../constants.js';
import { calculateAverage } from '../utils/array-helpers.js';

/**
 * Validate font size values
 * FIXES v2 problem: no validation
 * 
 * @param {number|undefined|null} fontSize - Font size to validate
 * @returns {number|null} Validated font size or null if invalid
 */
function validateFontSize(fontSize) {
  if (typeof fontSize !== 'number' || !isFinite(fontSize) || fontSize <= 0) {
    return null;
  }
  return Math.max(0.1, Math.min(1000, fontSize));
}

/**
 * Calculate standard deviation for array of numbers
 * 
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Standard deviation
 */
function calculateStdDev(values) {
  if (values.length === 0) return 0;
  
  const mean = calculateAverage(values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Analyze font size hierarchy using adaptive clustering
 * FIXES v2 problem: fixed 12% threshold, no validation
 * 
 * @param {Array<{fontSize?: number, [key: string]: any}>} headings - Array of heading elements
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {{baseFontSize: number, hierarchy: Record<number, number>, groups: Array<any>, uniqueSizes: Array<number>}} Hierarchy mapping
 */
export function analyzeFontSizeHierarchy(headings, metrics) {
  if (!headings || headings.length === 0) {
    log('[PDF v3] analyzeFontSizeHierarchy: No headings provided');
    /** @type {Record<number, number>} */
    const emptyHierarchy = {};
    return {
      baseFontSize: metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
      hierarchy: emptyHierarchy,
      groups: [],
      uniqueSizes: []
    };
  }
  
  // VALIDATION: Filter out invalid font sizes (fixes v2 problem)
  const validHeadings = headings
    .map(h => ({
      ...h,
      fontSize: validateFontSize(h.fontSize)
    }))
    .filter(h => h.fontSize !== null);
  
  if (validHeadings.length === 0) {
    log('[PDF v3] analyzeFontSizeHierarchy: No valid headings after validation');
    return {
      baseFontSize: metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE,
      hierarchy: {},
      groups: [],
      uniqueSizes: []
    };
  }
  
  const baseFontSize = metrics.baseFontSize || FONT_SIZE_THRESHOLDS.DEFAULT_FONT_SIZE;
  
  // Collect all font sizes
  const fontSizes = validHeadings.map(h => h.fontSize);
  const fontSizeStdDev = calculateStdDev(fontSizes);
  const avgFontSize = fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length;
  
  // ADAPTIVE threshold based on variability (fixes v2 problem: fixed 12%)
  // High variability = clear hierarchy → stricter threshold (15%)
  // Low variability = homogeneous → looser threshold (10%)
  const TOLERANCE_PERCENT = fontSizeStdDev > avgFontSize * 0.2 ? 0.08 : 0.07;
  const ABSOLUTE_DIFF_THRESHOLD = fontSizeStdDev > avgFontSize * 0.2 ? 0.15 : 0.12;
  
  // Sort headings by font size (descending)
  const sortedHeadings = [...validHeadings].sort((a, b) => b.fontSize - a.fontSize);
  
  // Cluster headings by similar font sizes
  const headingGroups = [];
  let currentGroup = [sortedHeadings[0]];
  
  for (let i = 1; i < sortedHeadings.length; i++) {
    const currentHeading = sortedHeadings[i];
    const prevHeading = sortedHeadings[i - 1];
    
    const groupAvgSize = calculateAverage(currentGroup.map(h => h.fontSize));
    const absoluteDiff = Math.abs(currentHeading.fontSize - prevHeading.fontSize);
    const absoluteDiffThreshold = groupAvgSize * ABSOLUTE_DIFF_THRESHOLD;
    const percentDiff = absoluteDiff / groupAvgSize;
    
    // If difference is small, add to current group
    if (absoluteDiff <= absoluteDiffThreshold && percentDiff <= TOLERANCE_PERCENT) {
      currentGroup.push(currentHeading);
    } else {
      // Start new group
      headingGroups.push(currentGroup);
      currentGroup = [currentHeading];
    }
  }
  
  // Add last group
  if (currentGroup.length > 0) {
    headingGroups.push(currentGroup);
  }
  
  // Merge single-element groups with nearest group (from v2, works well)
  const mergedGroups = [];
  const singleElementGroups = [];
  
  for (const group of headingGroups) {
    if (group.length === 1) {
      singleElementGroups.push(group[0]);
    } else {
      mergedGroups.push(group);
    }
  }
  
  // Merge single elements with nearest group
  for (const singleHeading of singleElementGroups) {
    let bestGroup = null;
    let minDiff = Infinity;
    
    for (const group of mergedGroups) {
      const groupAvgSize = calculateAverage(group.map(h => h.fontSize));
      const diff = Math.abs(singleHeading.fontSize - groupAvgSize);
      const absoluteDiffThreshold = groupAvgSize * ABSOLUTE_DIFF_THRESHOLD;
      
      if (diff <= absoluteDiffThreshold && diff < minDiff) {
        minDiff = diff;
        bestGroup = group;
      }
    }
    
    if (bestGroup) {
      bestGroup.push(singleHeading);
    } else {
      // Create new group for isolated heading
      mergedGroups.push([singleHeading]);
    }
  }
  
  // Sort groups by average font size (descending)
  mergedGroups.sort((a, b) => {
    const avgA = calculateAverage(a.map(h => h.fontSize));
    const avgB = calculateAverage(b.map(h => h.fontSize));
    return avgB - avgA;
  });
  
  // Assign levels: largest group = H1, next = H2, etc.
  /** @type {Record<number, number>} */
  const hierarchy = {};
  const uniqueSizes = [];
  
  for (let i = 0; i < mergedGroups.length; i++) {
    const level = Math.min(i + 1, 6); // H1-H6
    const group = mergedGroups[i];
    
    for (const heading of group) {
      hierarchy[heading.fontSize] = level;
      if (!uniqueSizes.includes(heading.fontSize)) {
        uniqueSizes.push(heading.fontSize);
      }
    }
  }
  
  // Sort unique sizes descending
  uniqueSizes.sort((a, b) => b - a);
  
  log('[PDF v3] analyzeFontSizeHierarchy: Analysis complete', {
    totalHeadings: validHeadings.length,
    groups: mergedGroups.length,
    hierarchy: Object.entries(hierarchy).map(([size, level]) => ({ 
      fontSize: parseFloat(size).toFixed(1), 
      level 
    })),
    adaptiveThreshold: ABSOLUTE_DIFF_THRESHOLD.toFixed(2),
    fontSizeVariability: fontSizeStdDev.toFixed(2)
  });
  
  return {
    baseFontSize,
    hierarchy,
    groups: mergedGroups,
    uniqueSizes
  };
}

/**
 * Match heading to outline with validation
 * FIXES v2 problem: blindly trusts outline
 * 
 * @param {string} headingText - Heading text
 * @param {{title?: string, items?: Array<any>, [key: string]: any}} outline - PDF outline
 * @param {number} clusteredLevel - Level from clustering
 * @returns {number|null} Outline level or null if not found/suspicious
 */
export function matchHeadingToOutline(headingText, outline, clusteredLevel) {
  if (!outline || !Array.isArray(outline) || outline.length === 0) {
    return null;
  }
  
  if (!headingText || typeof headingText !== 'string') {
    return null;
  }
  
  // Build outline map (normalized titles)
  const outlineMap = new Map();
  const buildOutlineMap = (items, depth = 1) => {
    for (const item of items) {
      if (item.title) {
        const normalizedTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        outlineMap.set(normalizedTitle, { level: depth, title: item.title });
      }
      if (item.items && item.items.length > 0) {
        buildOutlineMap(item.items, depth + 1);
      }
    }
  };
  
  buildOutlineMap(outline);
  
  // Exact match
  const normalizedHeading = headingText.trim().toLowerCase().replace(/\s+/g, ' ');
  let outlineItem = outlineMap.get(normalizedHeading);
  
  // Partial match (70% similarity)
  if (!outlineItem) {
    for (const [outlineTitle, item] of outlineMap.entries()) {
      if (normalizedHeading.includes(outlineTitle) || outlineTitle.includes(normalizedHeading)) {
        const similarity = Math.min(normalizedHeading.length, outlineTitle.length) / 
                          Math.max(normalizedHeading.length, outlineTitle.length);
        if (similarity > 0.7) {
          outlineItem = item;
          break;
        }
      }
    }
  }
  
  if (outlineItem) {
    const outlineLevel = Math.min(outlineItem.level, 6);
    
    // VALIDATION: Check if outline level matches visual hierarchy (fixes v2 problem)
    // If difference > 2 levels, outline may be wrong
    if (clusteredLevel !== null && clusteredLevel !== undefined) {
      const levelDiff = Math.abs(outlineLevel - clusteredLevel);
      if (levelDiff > 2) {
        log('[PDF v3] matchHeadingToOutline: Outline level suspicious, using clustering', {
          headingText: headingText.substring(0, 40),
          outlineLevel,
          clusteredLevel,
          levelDiff
        });
        return null; // Use clustering instead
      }
    }
    
    return outlineLevel;
  }
  
  return null;
}

/**
 * Extract level from numbering pattern
 * Works well from v2, can use almost as-is
 * CRITICAL: "1." = H2 (depth=1), "2.1." = H3 (depth=2), "2.1.1." = H4 (depth=3)
 * 
 * @param {string} text - Heading text
 * @returns {Object|null} { level, depth } or null if no match
 */
export function extractNumberingLevel(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }
  
  const trimmed = text.trim();
  const numberingMatch = trimmed.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?[\.\)]\s*/);
  
  if (!numberingMatch) {
    return null;
  }
  
  // Calculate depth: "1." = 1, "2.1." = 2, "2.1.1." = 3
  const depth = (numberingMatch[1] ? 1 : 0) + 
                (numberingMatch[2] ? 1 : 0) + 
                (numberingMatch[3] ? 1 : 0);
  
  // CRITICAL: "1." is NEVER H1, always H2
  // depth=1 → H2, depth=2 → H3, depth=3 → H4, etc.
  const level = Math.min(depth + 1, 6);
  
  return { level, depth };
}

/**
 * Validate heading hierarchy - ensure H1 > H2 > H3 order
 * FIXES v2 problem: no validation of relative positions
 * 
 * @param {Array<Object>} headings - Headings with assigned levels
 * @returns {Array<Object>} Headings with corrected levels
 */
export function validateHeadingHierarchy(headings) {
  if (!headings || headings.length === 0) {
    return headings;
  }
  
  let maxLevelSeen = 0;
  const correctedHeadings = [];
  
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    let currentLevel = heading.level || 2;
    
    // Check if current level is too deep compared to max level seen
    // If H3 appears before H1, it's likely wrong
    // But allow going deeper (H2 → H3 → H4) or same level (H2 → H2)
    if (currentLevel > maxLevelSeen + 1) {
      // Skip too many levels (e.g., H3 after nothing or H1)
      // Correct to maxLevelSeen + 1
      const correctedLevel = maxLevelSeen + 1;
      log('[PDF v3] validateHeadingHierarchy: Corrected skipped level', {
        text: heading.text?.substring(0, 40),
        oldLevel: currentLevel,
        newLevel: correctedLevel,
        maxLevelSeen
      });
      currentLevel = correctedLevel;
    }
    
    maxLevelSeen = Math.max(maxLevelSeen, currentLevel);
    
    correctedHeadings.push({
      ...heading,
      level: currentLevel
    });
  }
  
  return correctedHeadings;
}

/**
 * Determine relative level based on previous headings
 * UNIVERSAL: Level is determined by position relative to other headings, not by type
 * 
 * @param {{fontSize?: number, text?: string, [key: string]: any}} heading - Heading element
 * @param {Array} allHeadings - All headings in document (with levels already assigned)
 * @param {number|null} clusteredLevel - Level from font size clustering
 * @returns {number|null} Suggested level based on relative position, or null
 */
function determineRelativeLevel(heading, allHeadings, clusteredLevel) {
  const text = heading.text || '';
  const headingIndex = allHeadings.findIndex(h => h.text === text);
  
  if (headingIndex < 0) {
    return null; // Heading not found in list
  }
  
  // Find previous heading with assigned level
  for (let i = headingIndex - 1; i >= 0; i--) {
    const prevHeading = allHeadings[i];
    if (prevHeading && prevHeading.level !== undefined && prevHeading.level !== null) {
      // UNIVERSAL: Heading level is typically one level deeper than previous, but not always
      // Use clustering as primary source, relative position as hint
      const relativeLevel = Math.min(prevHeading.level + 1, 6);
      
      // If clustering exists, validate relative level against it
      if (clusteredLevel !== undefined && clusteredLevel !== null) {
        const levelDiff = Math.abs(relativeLevel - clusteredLevel);
        if (levelDiff <= 1) {
          // Close enough - relative position matches visual hierarchy
          log(`[PDF v3] determineRelativeLevel: Relative level matches clustering - text="${text.substring(0, 50)}", prevLevel=${prevHeading.level}, relativeLevel=${relativeLevel}, clusteredLevel=${clusteredLevel}`);
          return relativeLevel;
        } else {
          // Too different - prefer clustering (visual hierarchy is more reliable)
          log(`[PDF v3] determineRelativeLevel: Relative level conflicts with clustering - text="${text.substring(0, 50)}", prevLevel=${prevHeading.level}, relativeLevel=${relativeLevel}, clusteredLevel=${clusteredLevel}, using clustering`);
          return null; // Let clustering decide
        }
      } else {
        // No clustering - use relative position as hint
        log(`[PDF v3] determineRelativeLevel: Using relative level (no clustering) - text="${text.substring(0, 50)}", prevLevel=${prevHeading.level}, relativeLevel=${relativeLevel}`);
        return relativeLevel;
      }
    }
  }
  
  // No previous heading found - cannot determine relative level
  return null;
}

/**
 * Determine heading level using all available methods
 * UNIVERSAL PRINCIPLE: Level is determined by how heading relates to other headings, not by type
 * 
 * Priority:
 * 1. Outline matching (if available and validated)
 * 2. Numbering pattern (if present)
 * 3. Font size clustering (primary visual hierarchy method)
 * 4. Relative position to previous headings (contextual hint, only if previous headings have levels)
 * 5. Font size ratio fallback
 * 
 * @param {{fontSize?: number, text?: string, [key: string]: any}} heading - Heading element (already classified as heading)
 * @param {{baseFontSize?: number, hierarchy?: Record<number, number>, [key: string]: any}} hierarchy - Font size hierarchy from clustering
 * @param {{title?: string, items?: Array<any>, [key: string]: any}} outline - PDF outline (optional)
 * @param {Array} previousHeadings - Previous headings with already determined levels (for relative positioning)
 * @returns {number} Heading level (1-6)
 */
export function determineHeadingLevel(heading, hierarchy, outline = null, previousHeadings = []) {
  try {
    const text = heading.text || '';
    const fontSize = validateFontSize(heading.fontSize);
  
  if (fontSize === null) {
    return 2; // Default fallback
  }
  
  // Get clustered level
  const clusteredLevel = hierarchy.hierarchy[fontSize];
  
  // Priority 1: Outline matching (with validation)
  if (outline) {
    const outlineLevel = matchHeadingToOutline(text, outline, clusteredLevel);
    if (outlineLevel !== null) {
      return outlineLevel;
    }
  }
  
  // Priority 2: Numbering pattern (works well from v2)
  const numberingResult = extractNumberingLevel(text);
  if (numberingResult) {
    // Balance between numbering and clustering
    // If numbering says deeper level, use it
    // If numbering says shallower level, prefer clustering
    if (numberingResult.level > (clusteredLevel || 2)) {
      return numberingResult.level;
    } else if (clusteredLevel) {
      // Use clustering if it suggests deeper level
      return clusteredLevel;
    } else {
      return numberingResult.level;
    }
  }
  
  // Priority 3: Font size hierarchy from clustering
  // UNIVERSAL: Visual hierarchy is the most reliable indicator of heading level
  if (clusteredLevel !== undefined && clusteredLevel !== null) {
    // Check if we can use relative positioning as additional validation
    // Only if we have previous headings with determined levels
    if (previousHeadings.length > 0) {
      const relativeLevel = determineRelativeLevel(heading, previousHeadings, clusteredLevel);
      if (relativeLevel !== null && Math.abs(relativeLevel - clusteredLevel) <= 1) {
        // Relative position confirms clustering - use relative level (more contextual)
        // Using relative level (confirmed by clustering) - no log needed (too verbose)
        return relativeLevel;
      }
    }
    // Use clustering (visual hierarchy is primary) - no log needed (too verbose)
    return clusteredLevel;
  }
  
  // Priority 4: Relative position to previous headings
  // Use this when clustering is not available, but we have previous headings
  if (previousHeadings.length > 0) {
    const relativeLevel = determineRelativeLevel(heading, previousHeadings, null);
    if (relativeLevel !== null) {
      // Using relative level (no clustering) - no log needed (too verbose)
      return relativeLevel;
    }
  }
  
  // Priority 5: Fallback based on font size ratio
  const ratio = fontSize / hierarchy.baseFontSize;
  // Use constants from HEADING_THRESHOLDS for consistency
  if (ratio >= HEADING_THRESHOLDS.VERY_LARGE_FONT_RATIO) return 1; // >= 2.0
  else if (ratio >= HEADING_THRESHOLDS.H1_FONT_RATIO) return 1; // >= 1.5
  else if (ratio >= HEADING_THRESHOLDS.H2_FONT_RATIO) return 2; // >= 1.3
  else if (ratio >= HEADING_THRESHOLDS.H3_FONT_RATIO) return 3; // >= 1.2
  else if (ratio >= HEADING_THRESHOLDS.H4_FONT_RATIO) return 4; // >= 1.1
  else if (ratio >= HEADING_THRESHOLDS.H5_FONT_RATIO) return 5; // >= 1.05
  else return 6; // < 1.05
  } catch (error) {
    logWarn('[PDF v3] determineHeadingLevel: Error determining heading level', { error: error?.message, heading: heading?.text?.substring(0, 50) });
    return 2; // Safe fallback
  }
}

