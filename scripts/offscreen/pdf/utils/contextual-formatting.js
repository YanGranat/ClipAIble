// @ts-check
// Contextual formatting detection - SIMPLIFIED: Only uses reliable sources
// Reliable sources: font name (Bold/Italic), direct fontWeight/fontStyle from PDF, fontToFormats map
// No ratio-based heuristics to avoid false positives

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn, criticalLog } from '../../../../utils/logging.js';
import { TEXT_FORMATTING } from '../constants.js';

/**
 * Detect formatting using only reliable sources
 * 
 * Reliable sources:
 * 1. Font name contains "Bold" or "Italic" (from fontNameMap)
 * 2. Direct fontWeight="bold" or fontStyle="italic"/"oblique" from PDF
 * 3. fontToFormats map (only for fonts explicitly marked in name)
 * 
 * @param {Array} lines - Array of line objects with items property
 * @param {Map<string, import('./font-name-extractor.js').FontInfo|string>|null} fontNameMap - Map from internal font name to FontInfo object or string
 * @param {Map<string, string>} fontToFormats - Map from font name to format (only for fonts explicitly marked in name)
 * @param {number|string} pageNum - Page number for logging
 * @returns {void} Modifies items in place, setting isBold, isItalic properties
 */
export function detectContextualFormatting(lines, fontNameMap = null, fontToFormats = null, pageNum = 'unknown') {
  // Input validation
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return;
  }
  
  if (fontNameMap !== null && fontNameMap !== undefined) {
    const isMap = fontNameMap instanceof Map;
    if (!isMap) {
      return;
    }
  }
  
  if (fontToFormats !== null && fontToFormats !== undefined) {
    const isMap = fontToFormats instanceof Map;
    if (!isMap) {
      return;
    }
  }
  
  // STEP 1: Find global base font (>50% usage is always base font)
  const allItems = [];
  lines.forEach(line => {
    if (line.items && line.items.length > 0) {
      allItems.push(...line.items);
    }
  });
  
  if (allItems.length === 0) {
    return;
  }
  
  // Group items by font to find the base font
  const fontGroups = new Map();
  allItems.forEach(item => {
    const fontName = item.originalFontName || item.fontName || '';
    if (!fontName) return;
    if (!fontGroups.has(fontName)) {
      fontGroups.set(fontName, []);
    }
    fontGroups.get(fontName).push(item);
  });
  
  // Find most used font (>50% usage is always base font)
  let globalBaseFont = null;
  let globalBaseFontRatio = null;
  let globalBaseFontSize = null;
  let maxUsagePercentage = 0;
  
  fontGroups.forEach((groupItems, fontName) => {
    const percentage = (groupItems.length / allItems.length) * 100;
    if (percentage > maxUsagePercentage) {
      maxUsagePercentage = percentage;
      if (percentage > TEXT_FORMATTING.BASE_FONT_PERCENTAGE) {
        // This font is used for >50% of items - it's the base font
        const ratios = groupItems.map(item => item.widthHeightRatio || 0).filter(r => r > 0);
        const fontSizes = groupItems.map(item => item.fontSize || 12).filter(s => s > 0);
        if (ratios.length > 0) {
          globalBaseFont = fontName;
          globalBaseFontRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
          if (fontSizes.length > 0) {
            globalBaseFontSize = fontSizes.reduce((sum, s) => sum + s, 0) / fontSizes.length;
          }
        }
      }
    }
  });
  
  // Global base font determined
  
  let totalFormatted = 0;
  
  // Process each line
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line || !line.items || line.items.length === 0) {
      continue;
    }
    
    const items = line.items;
    
    // Process each item in the line
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      if (!item) continue;
      
      const currentItemFontName = item.originalFontName || item.fontName || '';
      let realFontName = currentItemFontName;
      let directFontWeight = null;
      let directFontStyle = null;
      
      // Get font info from fontNameMap
      if (fontNameMap && item.fontName && fontNameMap.has(item.fontName)) {
        const fontInfo = fontNameMap.get(item.fontName);
        if (fontInfo !== null && fontInfo !== undefined) {
          if (typeof fontInfo === 'object' && fontInfo !== null && fontInfo !== undefined) {
            const fontInfoObj = /** @type {Record<string, any>} */ (fontInfo);
            if ('realFontName' in fontInfoObj) {
              realFontName = /** @type {string} */ (fontInfoObj.realFontName) || realFontName;
            }
            if ('fontWeight' in fontInfoObj) {
              directFontWeight = /** @type {string | null} */ (fontInfoObj.fontWeight) || null;
            }
            if ('fontStyle' in fontInfoObj) {
              directFontStyle = /** @type {string | null} */ (fontInfoObj.fontStyle) || null;
            }
          } else if (typeof fontInfo === 'string') {
            realFontName = fontInfo;
          }
        }
      }
      
      // RELIABLE METHOD 1: Check font name for "Bold" or "Italic"
      const isBoldByFontName = TEXT_FORMATTING.BOLD_FONT_PATTERN.test(realFontName);
      const isItalicByFontName = TEXT_FORMATTING.ITALIC_FONT_PATTERN.test(realFontName);
      
      // RELIABLE METHOD 2: Use direct fontWeight/fontStyle from PDF
      const isBoldByDirect = directFontWeight === 'bold' || item.fontWeight === 'bold';
      const isItalicByDirect = directFontStyle === 'italic' || directFontStyle === 'oblique' || 
                               item.fontStyle === 'italic' || item.fontStyle === 'oblique';
      
      // RELIABLE METHOD 3: Use fontToFormats (from font name, direct info, or careful ratio heuristics)
      let isBoldByFontMap = false;
      let isItalicByFontMap = false;
      if (fontToFormats && fontToFormats.has(currentItemFontName)) {
        const format = fontToFormats.get(currentItemFontName);
        isBoldByFontMap = format === TEXT_FORMATTING.FORMAT_BOLD || format === TEXT_FORMATTING.FORMAT_BOLD_ITALIC;
        isItalicByFontMap = format === TEXT_FORMATTING.FORMAT_ITALIC || format === TEXT_FORMATTING.FORMAT_BOLD_ITALIC;
      }
      
      // RELIABLE METHOD 4: Compare with global base font (if available)
      // This is more reliable than line-level comparison for single words
      let isBoldByGlobalBase = false;
      let isItalicByGlobalBase = false;
      
      if (globalBaseFont && currentItemFontName !== globalBaseFont) {
        // Item uses different font than base - check if it's formatting
        const currentRatio = item.widthHeightRatio || 0;
        if (currentRatio > 0 && globalBaseFontRatio && globalBaseFontRatio > 0) {
          const ratioDiff = currentRatio / globalBaseFontRatio;
          const itemFontSize = item.fontSize || 12;
          const baseFontSize = globalBaseFontSize || 12;
          const fontSizeRatio = baseFontSize > 0 ? itemFontSize / baseFontSize : 1;
          
          // CRITICAL: Get font group and usage percentage first (needed for all checks)
          const fontGroup = fontGroups.get(currentItemFontName);
          const fontUsagePercentage = fontGroup ? (fontGroup.length / allItems.length) * 100 : 0;
          
          // PRIORITY 1: If item ratio is MUCH higher (>2.5x) than base, it's likely bold
          // CRITICAL: Stricter threshold (2.5x instead of 2.0x) to reduce false positives
          if (ratioDiff > 2.5 && currentRatio > 25 && globalBaseFontRatio < 40) {
            isBoldByGlobalBase = !isBoldByFontName && !isBoldByDirect && !isBoldByFontMap;
          }
          // PRIORITY 2: If item ratio is MUCH lower (<0.4x) than base, it might be italic
          // CRITICAL: Use ratioDiff as PRIMARY factor, not usage frequency
          // Low ratioDiff = narrow text = ITALIC
          // CRITICAL: Stricter threshold (0.4x instead of 0.5x) to reduce false positives
          // Usage frequency is only used to filter out base font (>50% usage)
          else if (ratioDiff < 0.4 && currentRatio < 7 && globalBaseFontRatio > 20 && 
                   fontSizeRatio >= TEXT_FORMATTING.CONTEXTUAL_FONT_SIZE_RATIO_MIN && 
                   fontSizeRatio <= TEXT_FORMATTING.CONTEXTUAL_FONT_SIZE_RATIO_MAX) {
            if (fontGroup && fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
              // CRITICAL: Very low ratioDiff (<0.15) with reasonable currentRatio (>=4) = might be BOLD short word
              // Short words can have low ratioDiff even when bold, because short words have lower ratios
              // If currentRatio is >= 4, it's not extremely narrow, so it might be bold, not italic
              if (ratioDiff < 0.15 && currentRatio >= 4 && currentRatio < 6 &&
                  fontUsagePercentage >= TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE && 
                  fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
                // This might be a bold short word - mark as BOLD (fallback)
                if (!isBoldByFontName && !isBoldByDirect && !isBoldByFontMap) {
                  isBoldByGlobalBase = true;
                }
              }
              // CRITICAL: Very low ratioDiff (<0.15) with very low currentRatio (<4) but moderate usage (5-30%) = might be BOLD short word
              // Very short words can have very low currentRatio even when bold
              // If usage is moderate (5-30%), it might be bold, not italic
              if (ratioDiff < 0.15 && currentRatio < 4 &&
                  fontUsagePercentage >= TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE && 
                  fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
                // This might be a bold very short word - mark as BOLD (fallback)
                if (!isBoldByFontName && !isBoldByDirect && !isBoldByFontMap) {
                  isBoldByGlobalBase = true;
                }
              }
              // CRITICAL: Low ratioDiff (<0.15) with very low currentRatio (<3) and very rare usage (<3%) = narrow text = ITALIC
              // CRITICAL: Stricter conditions to reduce false positives
              // Only mark as italic if usage is very rare (<3%), to avoid false positives for bold short words
              else if (ratioDiff < 0.15 && currentRatio < 3 && fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE) {
                isItalicByGlobalBase = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap;
              }
              // CRITICAL: Low ratioDiff (0.12-0.15) = likely ITALIC (narrow text)
              // CRITICAL: Stricter range (0.12-0.15 instead of 0.15-0.2) to reduce false positives
              // Even if currentRatio is reasonable (>=3), low ratioDiff indicates narrow text = italic
              // Usage frequency is NOT used here - ratioDiff is the PRIMARY factor
              else if (ratioDiff >= 0.12 && ratioDiff < 0.15) {
                // Low ratioDiff = narrow text = ITALIC (unless currentRatio is very high, which is unlikely)
                if (currentRatio < 5) {
                  isItalicByGlobalBase = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap;
                }
              }
              // CRITICAL: Moderate ratioDiff (0.2-0.5) with low usage = might be bold for short words
              // But this is less reliable - prefer other methods (font name, direct, ratio with neighbors)
              // Only apply if usage is moderate (5-30%) to avoid false positives
              else if (ratioDiff >= 0.2 && 
                       fontUsagePercentage >= TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE && 
                       fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
                // This is less reliable - prefer other methods
                // Only use as fallback if no other method detected bold
                if (!isBoldByFontName && !isBoldByDirect && !isBoldByFontMap) {
                  isBoldByGlobalBase = true;
                }
              }
            }
          }
          // PRIORITY 3: If ratio is significantly different (but not extreme), check font usage and size
          // CRITICAL: Stricter threshold (1.7x instead of 1.5x) to reduce false positives
          else if ((ratioDiff < TEXT_FORMATTING.CONTEXTUAL_RATIO_DIFF_MODERATE || ratioDiff > 1.7) && 
                   fontSizeRatio >= TEXT_FORMATTING.CONTEXTUAL_FONT_SIZE_RATIO_MIN && 
                   fontSizeRatio <= TEXT_FORMATTING.CONTEXTUAL_FONT_SIZE_RATIO_MAX) {
            if (fontGroup && fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
              // Rarely used font that differs from base with similar font size - likely formatting
              // CRITICAL: Stricter conditions - ratio must be very low (<0.1x) AND font must be very rarely used (<5%)
              // AND current ratio must be reasonably low (<6) to avoid false positives
              if (ratioDiff < TEXT_FORMATTING.CONTEXTUAL_RATIO_DIFF_VERY_LOW && 
                  fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE &&
                  currentRatio < 6) {
                isItalicByGlobalBase = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap;
              }
              // If ratio is very low (<0.2) but font is used more often (>5%), check more carefully
              else if (ratioDiff < 0.5) {
                // CRITICAL: Stricter conditions - font must be very rarely used (<5%) AND ratio must be very low (<0.15x)
                // AND current ratio must be reasonably low (<6) to avoid false positives
                if (fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE && 
                    ratioDiff < 0.15 && currentRatio < 6) {
                  isItalicByGlobalBase = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap;
                }
                // For short words with low ratio but font used more often (>10%), it's likely BOLD
                // This addresses cases like short words which use bold fonts
                else if (fontUsagePercentage >= TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE && 
                         fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_MODERATE) {
                  isBoldByGlobalBase = !isBoldByFontName && !isBoldByDirect && !isBoldByFontMap;
                }
              }
              // If ratio is moderately lower (0.5-0.8), check font group average
              else if (ratioDiff < TEXT_FORMATTING.CONTEXTUAL_RATIO_DIFF_MODERATE) {
                const fontGroupRatios = fontGroup.map(i => i.widthHeightRatio || 0).filter(r => r > 0);
                const avgFontGroupRatio = fontGroupRatios.length > 0 ? fontGroupRatios.reduce((sum, r) => sum + r, 0) / fontGroupRatios.length : 0;
                // CRITICAL: Stricter condition - average ratio must be consistently very low (<0.25x base instead of 0.3x)
                // AND font must be very rarely used (<5%) to reduce false positives
                if (avgFontGroupRatio < globalBaseFontRatio * 0.25 && 
                    fontUsagePercentage < TEXT_FORMATTING.CONTEXTUAL_FONT_USAGE_RARE &&
                    currentRatio < 6) {
                  isItalicByGlobalBase = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap;
                } else {
                  isBoldByGlobalBase = !isBoldByFontName && !isBoldByDirect && !isBoldByFontMap;
                }
              }
              // If ratio is higher (>1.5x), it's likely bold
              else if (ratioDiff > 1.5) {
                isBoldByGlobalBase = !isBoldByFontName && !isBoldByDirect && !isBoldByFontMap;
              }
            }
          }
        }
      } else if (globalBaseFont && currentItemFontName === globalBaseFont) {
        // Item uses base font - it's NOT bold/italic (unless explicitly marked)
        // Only use explicit markers (font name, direct info, fontToFormats)
        // Don't use ratio heuristics for base font items
      }
      
      // RELIABLE METHOD 5: Compare widthHeightRatio with neighbors in the same line (careful heuristic)
      // Only use if other methods didn't detect formatting AND not using base font
      let isBoldByRatio = false;
      let isItalicByRatio = false;
      let ratioAnalysis = null;
      
      if ((!isBoldByFontName && !isBoldByDirect && !isBoldByFontMap && !isBoldByGlobalBase) || 
          (!isItalicByFontName && !isItalicByDirect && !isItalicByFontMap && !isItalicByGlobalBase)) {
        // Only compare with neighbors if item is NOT using base font
        if (!globalBaseFont || currentItemFontName !== globalBaseFont) {
          if (items.length > 1) {
            const currentRatio = item.widthHeightRatio || 0;
            if (currentRatio > 0) {
              // Compare with other items in the same line
              const otherRatios = items
                .filter((otherItem, otherIdx) => otherIdx !== itemIdx && otherItem.widthHeightRatio > 0)
                .map(otherItem => otherItem.widthHeightRatio);
              
              if (otherRatios.length > 0) {
                const avgOtherRatio = otherRatios.reduce((sum, r) => sum + r, 0) / otherRatios.length;
                const maxOtherRatio = Math.max(...otherRatios);
                const minOtherRatio = Math.min(...otherRatios);
                
                // Bold if current ratio is significantly HIGHER than average or minimum
                // This helps detect bold words within a line
                // CRITICAL: Use comparison with neighbors, not absolute threshold (to avoid false positives)
                // CRITICAL: Stricter conditions to reduce false positives
                // CRITICAL: Safe division - avoid division by zero
                const denominator = Math.max(avgOtherRatio, minOtherRatio);
                const ratioDiffUp = denominator > 0 ? currentRatio / denominator : 0;
                const isSignificantlyHigher = ratioDiffUp >= TEXT_FORMATTING.CONTEXTUAL_NEIGHBOR_RATIO_MULTIPLIER;
                // Stricter: require higher absolute ratio to reduce false positives
                const isReasonableRatio = currentRatio >= 3; // Increased from 2 to 3 for stricter detection
                isBoldByRatio = !isBoldByFontName && !isBoldByDirect && !isBoldByFontMap && !isBoldByGlobalBase &&
                               isSignificantlyHigher && 
                               isReasonableRatio &&
                               // Stricter: require higher ratio difference (>=1.7x) or higher absolute threshold
                               (currentRatio > TEXT_FORMATTING.ABSOLUTE_BOLD_THRESHOLD || ratioDiffUp >= 1.7);
                
                // Italic if current ratio is significantly LOWER than average or maximum
                // Italic text is often narrower than normal text
                // CRITICAL: Stricter conditions to reduce false positives
                // CRITICAL: Safe division - avoid division by zero
                const italicDenominator = Math.max(avgOtherRatio, maxOtherRatio);
                const ratioDiffDown = italicDenominator > 0 ? currentRatio / italicDenominator : 0;
                // CRITICAL: Stricter threshold - 0.5x instead of 0.6x to reduce false positives
                const isSignificantlyLower = ratioDiffDown <= 0.5;
                // Also check that current ratio is reasonable (not too low, which might be a measurement error)
                const isReasonableRatioForItalic = currentRatio >= 3; // Increased from 2 to 3 for stricter detection
                // CRITICAL: Stricter condition - current ratio must be significantly lower (0.65x instead of 0.75x)
                isItalicByRatio = !isItalicByFontName && !isItalicByDirect && !isItalicByFontMap && !isItalicByGlobalBase &&
                                 isSignificantlyLower && 
                                 isReasonableRatioForItalic &&
                                 // Additional check: current ratio should be lower than average (stricter: 0.65x instead of 0.75x)
                                 currentRatio < avgOtherRatio * 0.65 &&
                                 // CRITICAL: Additional check - ratioDiffDown must be significantly lower (<0.5x)
                                 ratioDiffDown < 0.5;
                
                ratioAnalysis = {
                  currentRatio: currentRatio.toFixed(2),
                  avgOtherRatio: avgOtherRatio.toFixed(2),
                  maxOtherRatio: maxOtherRatio.toFixed(2),
                  minOtherRatio: minOtherRatio.toFixed(2),
                  ratioDiffUp: ratioDiffUp.toFixed(2),
                  ratioDiffDown: ratioDiffDown.toFixed(2),
                  threshold: TEXT_FORMATTING.CONTEXTUAL_NEIGHBOR_RATIO_MULTIPLIER,
                  absoluteThreshold: TEXT_FORMATTING.ABSOLUTE_BOLD_THRESHOLD,
                  isBoldByRatio,
                  isItalicByRatio
                };
              }
            }
          }
        }
      }
      
      // ANTI-FALSE-POSITIVE FILTERS: Apply additional checks before formatting
      // CRITICAL: Text is stored in item.str (from PDF.js), not item.text
      const itemText = item.str || item.text || '';
      const textLength = itemText.length;
      
      // Explicit formatting methods (font name, direct, fontToFormats) are always trusted
      // They don't need additional validation
      const explicitBold = isBoldByFontName || isBoldByDirect || isBoldByFontMap;
      const explicitItalic = isItalicByFontName || isItalicByDirect || isItalicByFontMap;
      
      // Ratio-based formatting methods (global base, ratio) need additional validation
      const ratioBasedBold = isBoldByGlobalBase || isBoldByRatio;
      const ratioBasedItalic = isItalicByGlobalBase || isItalicByRatio;
      
      // Filter 1: Minimum text length check for ratio-based formatting
      // Very short text (< 4 chars) shouldn't use ratio-based formatting (too unreliable)
      // Exception: Explicit formatting is always trusted regardless of length
      const canUseRatioBasedFormatting = textLength >= TEXT_FORMATTING.MIN_TEXT_LENGTH_FOR_RATIO_FORMATTING;
      
      // Filter 2: Check if text is mostly punctuation/digits
      // If >50% of text is punctuation/digits, don't apply ratio-based formatting
      // (punctuation/digits often have different ratios and cause false positives)
      let isMostlyPunctuation = false;
      if (textLength > 0 && canUseRatioBasedFormatting) {
        const punctuationDigitsPattern = /[^\p{L}\s]/gu;
        const punctuationDigitsCount = (itemText.match(punctuationDigitsPattern) || []).length;
        const punctuationRatio = punctuationDigitsCount / textLength;
        isMostlyPunctuation = punctuationRatio > TEXT_FORMATTING.MAX_PUNCTUATION_RATIO;
      }
      
      // Filter 3: For ratio-based formatting, require confirmation from multiple methods
      // This reduces false positives from single unreliable ratio-based method
      // Count how many methods agree on formatting
      let boldMethodCount = 0;
      let italicMethodCount = 0;
      
      if (explicitBold) boldMethodCount++;
      if (explicitItalic) italicMethodCount++;
      
      // Count ratio-based methods (both global base and ratio count as separate methods)
      // They only count if text is long enough and not mostly punctuation
      if (canUseRatioBasedFormatting && !isMostlyPunctuation) {
        if (isBoldByGlobalBase) boldMethodCount++;
        if (isBoldByRatio) boldMethodCount++;
        if (isItalicByGlobalBase) italicMethodCount++;
        if (isItalicByRatio) italicMethodCount++;
      }
      
      // Apply formatting:
      // - Explicit methods are always trusted (regardless of length/punctuation)
      // - Ratio-based methods require: sufficient length + not mostly punctuation + multiple methods agree
      //   (either explicit + ratio-based, or multiple ratio-based methods)
      const isBold = explicitBold || 
                     (ratioBasedBold && canUseRatioBasedFormatting && !isMostlyPunctuation && 
                      boldMethodCount >= TEXT_FORMATTING.REQUIRED_METHODS_FOR_RATIO_FORMATTING);
      const isItalic = explicitItalic || 
                       (ratioBasedItalic && canUseRatioBasedFormatting && !isMostlyPunctuation && 
                        italicMethodCount >= TEXT_FORMATTING.REQUIRED_METHODS_FOR_RATIO_FORMATTING);
      
      if (isBold || isItalic) {
        const wasBoldBefore = item.isBold || false;
        const wasItalicBefore = item.isItalic || false;
        
        if (isBold && !wasBoldBefore) {
          item.isBold = true;
          totalFormatted++;
        }
        if (isItalic && !wasItalicBefore) {
          item.isItalic = true;
          totalFormatted++;
        }
      }
    }
  }
  
  // Formatting applied to items
}
