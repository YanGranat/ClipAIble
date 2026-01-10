// @ts-check
// Font name extractor - extracts real font names and formatting from PDF textContent
// Maps internal font names (like g_d0_f1) to real names (like Helvetica-Bold)
// Also extracts fontWeight and fontStyle if available

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, criticalLog } from '../../../../utils/logging.js';

/**
 * Font information extracted from textContent.styles
 * @typedef {Object} FontInfo
 * @property {string} realFontName - Real font name (e.g., "Helvetica-Bold")
 * @property {string} [fontWeight] - Font weight if available ("normal", "bold", etc.)
 * @property {string} [fontStyle] - Font style if available ("normal", "italic", etc.)
 */

/**
 * Extract font name mapping and formatting info from PDF textContent.styles
 * Maps internal font names (g_d0_f1) to real names and formatting (Helvetica-Bold)
 * 
 * @param {{styles?: Record<string, {fontFamily?: string, fontWeight?: string, fontStyle?: string, [key: string]: any}>}} textContent - PDF.js textContent object with styles property
 * @param {number} pageNum - Page number (for logging)
 * @returns {Map<string, FontInfo>} Map from internal font name to FontInfo object
 */
export function extractFontNameMapping(textContent, pageNum) {
  const fontNameMap = new Map();
  
  try {
    if (textContent && textContent.styles) {
      log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - textContent.styles available, keys=${Object.keys(textContent.styles).length}`);
      
      // Log ALL properties of first font object to understand structure
      const firstStyleKey = Object.keys(textContent.styles)[0];
      if (firstStyleKey) {
        const firstStyle = textContent.styles[firstStyleKey];
        // Log the ENTIRE object structure recursively
        const logObject = (obj, depth = 0, maxDepth = 3) => {
          if (depth > maxDepth) return '[Max depth reached]';
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return `[Array(${obj.length})]`;
          
          const result = {};
          for (const key in obj) {
            try {
              const value = obj[key];
              if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = logObject(value, depth + 1, maxDepth);
              } else {
                result[key] = value;
              }
            } catch (e) {
              result[key] = '[Error accessing]';
            }
          }
          return result;
        };
        
        log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - COMPLETE font object structure for "${firstStyleKey}":`, logObject(firstStyle));
      }
      
      // textContent.styles is a map from internal font name to font object
      for (const [internalFontName, fontObj] of Object.entries(textContent.styles)) {
        if (fontObj) {
          // Try multiple properties that might contain the real font name
          const realFontName = fontObj.fontFamily || 
                              fontObj.name || 
                              fontObj.loadedName ||
                              (fontObj.font ? fontObj.font.name : null);
          
          // Extract fontWeight if available
          let fontWeight = fontObj.fontWeight || 
                          fontObj.weight ||
                          (fontObj.font ? fontObj.font.fontWeight : null);
          
          // Extract fontStyle if available
          let fontStyle = fontObj.fontStyle || 
                         fontObj.style ||
                         (fontObj.font ? fontObj.font.fontStyle : null);
          
          // Try to get font name from PDF font object if available
          // PDF.js may store the actual font name in different places
          let actualFontName = realFontName;
          if (fontObj.font && typeof fontObj.font === 'object') {
            // Try to get name from font object
            actualFontName = fontObj.font.name || 
                           fontObj.font.fallbackName || 
                           fontObj.font.loadedName ||
                           actualFontName;
            
            // Also check if font object has direct formatting info
            if (!fontWeight && fontObj.font.fontWeight) {
              fontWeight = fontObj.font.fontWeight;
            }
            if (!fontStyle && fontObj.font.fontStyle) {
              fontStyle = fontObj.font.fontStyle;
            }
          }
          
          // CRITICAL: Try to get more font information from PDF.js font object
          // PDF.js may store font information in different places
          let fontDescriptor = null;
          let fontType = null;
          let fontSubtype = null;
          let fontBaseName = null;
          
          if (fontObj.font && typeof fontObj.font === 'object') {
            // Try to get font descriptor (contains font metrics and properties)
            fontDescriptor = fontObj.font.descriptor || fontObj.font.fontDescriptor || null;
            fontType = fontObj.font.type || null;
            fontSubtype = fontObj.font.subtype || null;
            fontBaseName = fontObj.font.baseFontName || fontObj.font.baseName || null;
            
            // Try to get font name from baseFontName or other properties
            if (!actualFontName && fontBaseName) {
              actualFontName = fontBaseName;
            }
            
            // Try to get fontWeight from descriptor
            if (!fontWeight && fontDescriptor) {
              fontWeight = fontDescriptor.fontWeight || 
                          fontDescriptor.weight ||
                          (typeof fontDescriptor === 'object' && 'FontWeight' in fontDescriptor ? fontDescriptor.FontWeight : null);
            }
            
            // Try to get fontStyle from descriptor
            if (!fontStyle && fontDescriptor) {
              fontStyle = fontDescriptor.fontStyle || 
                         fontDescriptor.style ||
                         (typeof fontDescriptor === 'object' && 'FontStyle' in fontDescriptor ? fontDescriptor.FontStyle : null);
            }
          }
          
          log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Processing "${internalFontName}":`, {
            realFontName,
            actualFontName,
            fontWeight_raw: fontWeight,
            fontStyle_raw: fontStyle,
            fontObj_keys: Object.keys(fontObj),
            hasFont: !!fontObj.font,
            font_keys: fontObj.font ? Object.keys(fontObj.font) : null,
            font_name: fontObj.font?.name,
            font_fallbackName: fontObj.font?.fallbackName,
            font_loadedName: fontObj.font?.loadedName,
            fontBaseName,
            fontType,
            fontSubtype,
            hasDescriptor: !!fontDescriptor,
            descriptor_keys: fontDescriptor && typeof fontDescriptor === 'object' ? Object.keys(fontDescriptor) : null
          });
          
          // Normalize fontWeight values
          if (fontWeight) {
            if (typeof fontWeight === 'number') {
              fontWeight = fontWeight >= 600 ? 'bold' : 'normal';
            } else if (typeof fontWeight === 'string') {
              fontWeight = fontWeight.toLowerCase();
              if (fontWeight === '700' || fontWeight === '800' || fontWeight === '900') {
                fontWeight = 'bold';
              } else if (fontWeight !== 'bold' && fontWeight !== 'normal') {
                fontWeight = 'normal';
              }
            }
          }
          
          // Normalize fontStyle values
          if (fontStyle) {
            if (typeof fontStyle === 'string') {
              fontStyle = fontStyle.toLowerCase();
              if (fontStyle !== 'italic' && fontStyle !== 'oblique') {
                fontStyle = 'normal';
              }
            }
          }
          
          // Use actualFontName if we found it, otherwise use realFontName
          const finalFontName = actualFontName || realFontName;
          
          if (finalFontName && typeof finalFontName === 'string') {
            // Extract formatting from font name if not already found
            // Many PDFs encode formatting in font name (e.g., "Helvetica-Bold", "Arial-Italic")
            if (!fontWeight && /bold|black|heavy|demi|semi/i.test(finalFontName)) {
              fontWeight = 'bold';
              log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Detected BOLD from font name: "${finalFontName}"`);
            }
            if (!fontStyle && /italic|oblique/i.test(finalFontName)) {
              fontStyle = 'italic';
              log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Detected ITALIC from font name: "${finalFontName}"`);
            }
            
            // Also check internal font name (sometimes it contains formatting info)
            if (!fontWeight && /bold|black|heavy|demi|semi/i.test(internalFontName)) {
              fontWeight = 'bold';
              log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Detected BOLD from internal font name: "${internalFontName}"`);
            }
            if (!fontStyle && /italic|oblique/i.test(internalFontName)) {
              fontStyle = 'italic';
              log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Detected ITALIC from internal font name: "${internalFontName}"`);
            }
            
            const fontInfo = {
              realFontName: finalFontName,
              fontWeight: fontWeight || null,
              fontStyle: fontStyle || null
            };
            
            fontNameMap.set(internalFontName, fontInfo);
            
            const formatInfo = [];
            if (fontInfo.fontWeight) formatInfo.push(`weight=${fontInfo.fontWeight}`);
            if (fontInfo.fontStyle) formatInfo.push(`style=${fontInfo.fontStyle}`);
            const formatStr = formatInfo.length > 0 ? ` (${formatInfo.join(', ')})` : '';
            
            log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Mapped "${internalFontName}" -> "${finalFontName}"${formatStr}`);
            
            // CRITICAL: Log for g_d0_f3, g_d0_f1, g_d0_f2 to debug bold detection issues
            if (internalFontName === 'g_d0_f3' || internalFontName === 'g_d0_f1' || internalFontName === 'g_d0_f2' || 
                finalFontName === 'g_d0_f3' || finalFontName === 'g_d0_f1' || finalFontName === 'g_d0_f2') {
              log(`[PDF v3] extractFontNameMapping: Analysis for ${internalFontName}`, {
                internalFontName,
                finalFontName,
                realFontName,
                actualFontName,
                fontWeight,
                fontStyle,
                fontObj_keys: Object.keys(fontObj),
                hasFont: !!fontObj.font,
                font_keys: fontObj.font ? Object.keys(fontObj.font) : null,
                font_name: fontObj.font?.name,
                font_fallbackName: fontObj.font?.fallbackName,
                font_loadedName: fontObj.font?.loadedName
              });
              
              // Font analysis completed
            }
          }
        }
      }
      
      if (fontNameMap.size > 0) {
        const withFormatting = Array.from(fontNameMap.values()).filter(f => f.fontWeight || f.fontStyle).length;
        log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - Extracted ${fontNameMap.size} font mappings (${withFormatting} with formatting info)`);
        
        // Font mappings extracted
      }
    } else {
      log(`[PDF v3] extractFontNameMapping: Page ${pageNum} - textContent.styles not available`);
    }
  } catch (error) {
    log(`[PDF v3] extractFontNameMapping: Failed to extract font names from page ${pageNum}`, error);
  }
  
  return fontNameMap;
}

