// @ts-check
// PDF extraction module for offscreen document
// Uses PDF.js to extract content from PDF files
// Based on official PDF.js documentation and examples

import { log, logError, logWarn } from '../../utils/logging.js';

// PDF.js will be loaded as ES module
let pdfjsLib = null;

/**
 * Parse PDF date string to ISO format
 * PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm
 * @param {string} pdfDate - PDF date string
 * @returns {string} ISO date string or empty string
 */
function parsePdfDate(pdfDate) {
  if (!pdfDate || typeof pdfDate !== 'string') return '';
  
  try {
    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm
    // Example: D:20231201120000+02'00
    const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-]\d{2})?'?(\d{2})?'?/);
    if (match) {
      const [, year, month, day] = match;
      // Return ISO format: YYYY-MM-DD
      return `${year}-${month}-${day}`;
    }
    
    // Fallback: try to parse as regular date
    const date = new Date(pdfDate);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
    }
  } catch (error) {
    logWarn('[ClipAIble Offscreen PDF] Failed to parse PDF date', { pdfDate, error });
  }
  
  return '';
}

/**
 * Load PDF.js library
 * PDF.js is loaded as ES module via dynamic import
 * @returns {Promise<void>}
 */
async function loadPdfJs() {
  if (pdfjsLib) {
    return; // Already loaded
  }
  
  try {
    // PDF.js is loaded as ES module - use dynamic import
    const pdfJsUrl = chrome.runtime.getURL('lib/pdfjs/pdf.min.js');
    log('[ClipAIble Offscreen PDF] Importing PDF.js', { url: pdfJsUrl });
    
    // Import PDF.js as ES module
    const module = await import(pdfJsUrl);
    
    // PDF.js exports as default or named exports
    // Check for getDocument function to verify it's loaded correctly
    if (module.default && typeof module.default.getDocument === 'function') {
      pdfjsLib = module.default;
    } else if (typeof module.getDocument === 'function') {
      pdfjsLib = module;
    } else if (module.default) {
      pdfjsLib = module.default;
    } else {
      pdfjsLib = module;
    }
    
    // Verify PDF.js is loaded correctly
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
      // Wait a bit for async initialization (PDF.js uses webpack async loading)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check again
      if (typeof globalThis !== 'undefined' && globalThis.pdfjsLib) {
        pdfjsLib = globalThis.pdfjsLib;
      } else if (typeof window !== 'undefined' && window.pdfjsLib) {
        pdfjsLib = window.pdfjsLib;
      }
      
      if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
        throw new Error('PDF.js not found or getDocument is not a function');
      }
    }
    
    // Configure worker - CRITICAL for PDF.js to work
    const workerUrl = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.js');
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      log('[ClipAIble Offscreen PDF] PDF.js loaded successfully', { 
        workerUrl,
        hasGetDocument: typeof pdfjsLib.getDocument === 'function'
      });
    } else {
      logWarn('[ClipAIble Offscreen PDF] PDF.js GlobalWorkerOptions not found');
    }
  } catch (error) {
    logError('[ClipAIble Offscreen PDF] Failed to load PDF.js', error);
    throw error;
  }
}

/**
 * Extract images from PDF page
 * Uses page operator list to find image XObjects
 * @param {Object} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @returns {Promise<Array>} Array of image objects with dataUrl, width, height
 */
async function extractPageImages(page, pageNum) {
  const images = [];
  
  try {
    // Get operator list to find image XObjects
    const operatorList = await page.getOperatorList();
    
    // Get page resources to access XObjects
    const resources = await page.getResources();
    if (!resources || !resources.get) {
      return images;
    }
    
    // Parse operator list to find 'Do' operators (draw XObject)
    // Operator code for 'Do' is 83 (0x53) or pdfjsLib.OPS.paintXObject
    const DoOpCode = pdfjsLib.OPS?.paintXObject || 83;
    
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];
      
      if (fn === DoOpCode && args && args[0]) {
        const xObjectName = args[0];
        
        try {
          // Get XObject from resources
          const xObject = resources.get(xObjectName);
          
          if (xObject && xObject.subtype === 'Image') {
            // This is an image XObject
            try {
              // Get image data
              const imageData = await xObject.getImageData();
              
              if (imageData) {
                // Convert to base64 data URL
                const dataUrl = await imageDataToDataUrl(imageData, xObject);
                
                if (dataUrl) {
                  images.push({
                    dataUrl: dataUrl,
                    width: xObject.width || imageData.width || 0,
                    height: xObject.height || imageData.height || 0,
                    alt: `Image ${images.length + 1} from page ${pageNum}`
                  });
                  
                  log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Extracted image ${images.length}`, {
                    width: xObject.width,
                    height: xObject.height,
                    dataUrlLength: dataUrl.length
                  });
                }
              }
            } catch (imgError) {
              logWarn(`[ClipAIble Offscreen PDF] Failed to extract image XObject ${xObjectName}`, imgError);
            }
          }
        } catch (xObjectError) {
          logWarn(`[ClipAIble Offscreen PDF] Failed to get XObject ${xObjectName}`, xObjectError);
        }
      }
    }
  } catch (error) {
    logWarn(`[ClipAIble Offscreen PDF] Failed to extract images from page ${pageNum}`, error);
  }
  
  return images;
}

/**
 * Convert PDF.js image data to base64 data URL
 * @param {Object} imageData - Image data from PDF.js XObject
 * @param {Object} xObject - XObject with width/height info
 * @returns {Promise<string>} Base64 data URL or empty string
 */
async function imageDataToDataUrl(imageData, xObject) {
  try {
    // imageData from PDF.js XObject.getImageData() returns:
    // - data: Uint8ClampedArray (RGBA pixel data)
    // - width: number
    // - height: number
    
    if (imageData.data && imageData.width && imageData.height) {
      // Create canvas and draw image data
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      
      // Create ImageData object
      const imgData = ctx.createImageData(imageData.width, imageData.height);
      imgData.data.set(imageData.data);
      ctx.putImageData(imgData, 0, 0);
      
      // Convert to data URL
      return canvas.toDataURL('image/png');
    } else if (imageData instanceof Uint8Array || imageData instanceof ArrayBuffer) {
      // Raw image data - try to create blob
      const blob = new Blob([imageData], { type: 'image/png' });
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      logWarn('[ClipAIble Offscreen PDF] Unknown image data format', { 
        hasData: !!imageData.data,
        hasWidth: !!imageData.width,
        hasHeight: !!imageData.height,
        isUint8Array: imageData instanceof Uint8Array
      });
      return '';
    }
  } catch (error) {
    logError('[ClipAIble Offscreen PDF] Failed to convert image data to data URL', error);
    return '';
  }
}

// Column detection removed - using proven line-based grouping algorithm from jzillmann/pdf-to-markdown
// This approach groups items by Y coordinate (lines) and sorts by X within each line
// It handles multi-column layouts naturally without explicit column detection

/**
 * Group text items into lines using improved adaptive algorithm
 * Combines jzillmann/pdf-to-markdown approach with adaptive thresholds
 * Prevents text loss and handles multi-column layouts better
 * @param {Array} items - Sorted text items (already sorted by Y, then X, with viewport coordinates)
 * @param {number} medianHeight - Median font height for adaptive threshold calculation
 * @returns {Array} Array of line objects
 */
function groupItemsByLines(items, medianHeight) {
  if (items.length === 0) return [];
  
  // Filter valid items: must have text and minimum font size
  const MIN_FONT_SIZE = 6; // Minimum font size to consider (prevents noise)
  const validItems = items.filter(item => {
    const text = item.str?.trim();
    const fontSize = item.fontSize || 0;
    return text && text.length > 0 && fontSize >= MIN_FONT_SIZE;
  });
  
  if (validItems.length === 0) {
    log('[ClipAIble Offscreen PDF] groupItemsByLines: No valid items after filtering');
    return [];
  }
  
      log(`[ClipAIble Offscreen PDF] groupItemsByLines: ${validItems.length}/${items.length} valid items (filtered ${items.length - validItems.length} items)`);
      
      // DIAGNOSTIC: Log font names distribution
      const fontNames = validItems.map(item => item.fontName || 'EMPTY').filter(f => f);
      const fontNameCounts = {};
      fontNames.forEach(fn => {
        fontNameCounts[fn] = (fontNameCounts[fn] || 0) + 1;
      });
      log(`[ClipAIble Offscreen PDF] groupItemsByLines: DIAGNOSTIC - Font names distribution`, {
        totalFontNames: Object.keys(fontNameCounts).length,
        fontNameCounts: fontNameCounts,
        boldDetected: validItems.filter(item => item.isBold).length,
        italicDetected: validItems.filter(item => item.isItalic).length
      });
  
  const lines = [];
  let currentLine = [];
  
  // Adaptive line threshold: use medianHeight / 2 as base, but allow per-item adjustment
  const baseThreshold = medianHeight / 2;
  const MAX_LINE_DRIFT = 0.3; // 30% of font size for line grouping
  
  // Group items by lines with adaptive threshold
  validItems.forEach((item, idx) => {
    if (currentLine.length > 0) {
      const firstItemY = currentLine[0].y;
      const firstItemFontSize = currentLine[0].fontSize || medianHeight;
      const itemFontSize = item.fontSize || medianHeight;
      
      // Adaptive threshold: use the larger font size to determine threshold
      const adaptiveThreshold = Math.max(firstItemFontSize, itemFontSize) * MAX_LINE_DRIFT;
      // Also check base threshold as fallback
      const threshold = Math.max(adaptiveThreshold, baseThreshold);
      
      const yDiff = Math.abs(firstItemY - item.y);
      
      if (yDiff >= threshold) {
        // New line detected - save current line and start new one
        lines.push(currentLine);
        currentLine = [];
      }
    }
    currentLine.push(item);
  });
  
  // Add last line
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  log(`[ClipAIble Offscreen PDF] groupItemsByLines: Grouped into ${lines.length} lines`);
  
  // CRITICAL: Sort items within each line by X coordinate
  // (Items are already sorted, but ensure correct order)
  lines.forEach(lineItems => {
    lineItems.sort((a, b) => {
      const aDir = a.dir || 'ltr';
      const bDir = b.dir || 'ltr';
      if (aDir === 'rtl' && bDir === 'rtl') {
        return b.x - a.x; // RTL: right to left
      }
      return a.x - b.x; // LTR: left to right
    });
  });
  
  // Build line text with smart spacing
  const resultLines = [];
  for (const lineItems of lines) {
    let lineText = '';
    let prevItem = null;
    
    for (const item of lineItems) {
      if (prevItem) {
        // Determine if space is needed between items
        const expectedX = prevItem.x + (prevItem.width || prevItem.fontSize * (prevItem.str?.length || 1));
        const actualX = item.x;
        const gap = Math.abs(actualX - expectedX);
        const avgFontSize = (item.fontSize + prevItem.fontSize) / 2;
        
        // Space needed if gap > 25% of font size (word boundary)
        // OR if previous item has explicit line break flag
        const needsSpace = gap > avgFontSize * 0.25 || 
                          (prevItem.hasEOL !== undefined && prevItem.hasEOL);
        if (needsSpace) {
          lineText += ' ';
        }
      }
      
      lineText += item.str || '';
      prevItem = item;
    }
    
    if (lineText.trim()) {
      // Check if line contains bold text (if any item is bold, mark line as bold)
      const hasBold = lineItems.some(item => item.isBold);
      const hasItalic = lineItems.some(item => item.isItalic);
      
      // DIAGNOSTIC: Log bold detection for ALL lines (not just first 5)
      if (hasBold) {
        log(`[ClipAIble Offscreen PDF] groupItemsByLines: DIAGNOSTIC - Line ${resultLines.length + 1} is bold`, {
          text: lineText.trim().substring(0, 50),
          fontNames: lineItems.map(i => i.fontName || 'EMPTY').filter(f => f),
          boldItems: lineItems.filter(i => i.isBold).map(i => ({ 
            fontName: i.fontName || 'EMPTY', 
            text: i.str?.substring(0, 30),
            isBold: i.isBold,
            fontWeight: i.fontWeight || 'NOT_AVAILABLE'
          })),
          allItems: lineItems.map(i => ({
            fontName: i.fontName || 'EMPTY',
            isBold: i.isBold,
            text: i.str?.substring(0, 20)
          }))
        });
      }
      
      resultLines.push({
        text: lineText.trim(),
        y: lineItems[0].y,
        x: lineItems[0].x,
        fontSize: Math.max(...lineItems.map(i => i.fontSize)),
        fontName: lineItems[0].fontName || '',
        isBold: hasBold,
        isItalic: hasItalic,
        items: lineItems,
        hasEOL: lineItems[lineItems.length - 1].hasEOL !== undefined ? 
                lineItems[lineItems.length - 1].hasEOL : false
      });
    }
  }
  
  return resultLines;
}

/**
 * Group lines into paragraphs with improved adaptive algorithm
 * Handles headings, line spacing, and explicit line breaks
 * Uses adaptive thresholds to better handle different PDF layouts
 * @param {Array} lines - Array of line objects
 * @returns {Array} Array of paragraph/heading objects
 */
/**
 * Analyze line spacing distribution to find most common spacing (mode)
 * Based on LA-PDFText approach: use mode instead of mean for better accuracy
 * @param {Array} lines - Array of line objects
 * @returns {Object} Analysis result with mostUsedSpacing and statistics
 */
function analyzeLineSpacings(lines) {
  if (lines.length < 2) {
    return { mostUsedSpacing: 0, allSpacings: [], spacingCounts: new Map() };
  }
  
  const spacings = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const gap = lines[i + 1].y - lines[i].y;
    if (gap > 0) { // Only positive gaps (lines go top to bottom)
      spacings.push(gap);
    }
  }
  
  if (spacings.length === 0) {
    return { mostUsedSpacing: 0, allSpacings: [], spacingCounts: new Map() };
  }
  
  // Find most frequent spacing (mode) - round to integer for grouping
  const spacingCounts = new Map();
  spacings.forEach(s => {
    const rounded = Math.round(s); // Round to integer for grouping similar values
    spacingCounts.set(rounded, (spacingCounts.get(rounded) || 0) + 1);
  });
  
  let mostUsedSpacing = 0;
  let maxCount = 0;
  spacingCounts.forEach((count, spacing) => {
    if (count > maxCount) {
      maxCount = count;
      mostUsedSpacing = spacing;
    }
  });
  
  return {
    mostUsedSpacing,
    allSpacings: spacings,
    spacingCounts: spacingCounts
  };
}

/**
 * Determine spacing type (tight/normal/loose) based on ratio of spacing to font size
 * @param {Object} analysis - Result from analyzeLineSpacings
 * @param {number} avgFontSize - Average font size
 * @returns {string} 'tight', 'normal', or 'loose'
 */
function determineSpacingType(analysis, avgFontSize) {
  if (analysis.mostUsedSpacing === 0 || avgFontSize === 0) {
    return 'normal'; // Default fallback
  }
  
  const ratio = analysis.mostUsedSpacing / avgFontSize;
  
  if (ratio < 1.2) {
    return 'tight';  // Tight spacing (e.g., academic papers with 1.1x line spacing)
  } else if (ratio < 1.5) {
    return 'normal'; // Normal spacing (e.g., articles with 1.3-1.4x line spacing)
  } else {
    return 'loose';  // Loose spacing (e.g., documents with 1.6x+ line spacing)
  }
}

function groupIntoParagraphs(lines) {
  if (lines.length === 0) return [];
  
  const paragraphs = [];
  let currentPara = null;
  
  // Calculate average line height for dynamic thresholds
  const avgLineHeight = lines.reduce((sum, l) => sum + l.fontSize, 0) / lines.length;
  const HEADING_FONT_THRESHOLD = 1.3; // 30% larger than average = heading
  
  // CRITICAL FIX: Distribution analysis for line spacing (LA-PDFText approach)
  // Use mode (most frequent value) instead of mean for better accuracy
  const spacingAnalysis = analyzeLineSpacings(lines);
  const spacingType = determineSpacingType(spacingAnalysis, avgLineHeight);
  
  // Dynamic multipliers based on spacing type (PDFPlumber approach)
  const multipliers = {
    'tight': 1.5,   // Tight spacing: paragraph threshold = 1.5x normal spacing
    'normal': 1.8,  // Normal spacing: paragraph threshold = 1.8x normal spacing
    'loose': 2.0    // Loose spacing: paragraph threshold = 2.0x normal spacing
  };
  
  const dynamicMultiplier = multipliers[spacingType];
  const adaptiveParaGapBase = spacingAnalysis.mostUsedSpacing || (avgLineHeight * 1.3); // Fallback if no spacing found
  
  log(`[ClipAIble Offscreen PDF] groupIntoParagraphs: Starting with ${lines.length} lines`, {
    avgLineHeight: avgLineHeight.toFixed(2),
    spacingAnalysis: {
      mostUsedSpacing: spacingAnalysis.mostUsedSpacing.toFixed(1),
      totalSpacings: spacingAnalysis.allSpacings.length,
      spacingType: spacingType,
      dynamicMultiplier: dynamicMultiplier
    },
    HEADING_FONT_THRESHOLD
  });
  
  // Adaptive paragraph gap: use most common line spacing * dynamic multiplier
  const calculateParaGap = (line1, line2) => {
    if (!line2) return 0;
    // Use most common spacing from distribution analysis, not fontSize-based calculation
    return adaptiveParaGapBase * dynamicMultiplier;
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;
    
    const nextLine = i < lines.length - 1 ? lines[i + 1] : null;
    
    // Detect heading: larger font size or pattern matching
    const isHeading = line.fontSize > avgLineHeight * HEADING_FONT_THRESHOLD || 
                      /^(Chapter|Section|\d+\.|\d+\))\s/.test(text);
    
    // Calculate vertical gap to next line (adaptive)
    // IMPORTANT: nextLine.y > line.y (lines go top to bottom), so use nextLine.y - line.y (not Math.abs)
    const yGap = nextLine ? (nextLine.y - line.y) : Infinity; // Infinity if no next line (end of page)
    const adaptiveParaGap = nextLine ? calculateParaGap(line, nextLine) : 0;
    
    // Check for font size change (significant change indicates new paragraph/heading)
    const fontChange = currentPara && 
                       Math.abs(line.fontSize - currentPara.fontSize) > avgLineHeight * 0.2;
    
    // Determine if we should start a new paragraph
    // CRITICAL FIX: Removed line.hasEOL - hasEOL indicates visual line break, NOT paragraph break
    // PDF.js sets hasEOL=true for every line in a paragraph because each line is a separate visual element
    // We should use only Y-coordinate gaps to determine paragraph breaks
    const shouldStartNew = !currentPara || 
                          isHeading || 
                          yGap > adaptiveParaGap ||
                          fontChange; // Significant font size change
    
    // DIAGNOSTIC: Log decision for ALL lines to understand why each line becomes a paragraph
    log(`[ClipAIble Offscreen PDF] groupIntoParagraphs: DIAGNOSTIC - Line ${i + 1}/${lines.length}`, {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      fontSize: line.fontSize.toFixed(1),
      y: line.y.toFixed(1),
      nextY: nextLine ? nextLine.y.toFixed(1) : 'N/A',
      yGap: nextLine ? yGap.toFixed(1) : 'Infinity',
      adaptiveParaGap: nextLine ? adaptiveParaGap.toFixed(1) : 'N/A',
      gapRatio: nextLine ? (yGap / adaptiveParaGap).toFixed(2) : 'N/A',
      gapRatioGreaterThanOne: nextLine ? (yGap > adaptiveParaGap) : false,
      isHeading,
      fontChange: fontChange || false,
      fontChangeDetails: currentPara ? {
        lineFontSize: line.fontSize.toFixed(1),
        paraFontSize: currentPara.fontSize.toFixed(1),
        diff: Math.abs(line.fontSize - currentPara.fontSize).toFixed(1),
        threshold: (avgLineHeight * 0.2).toFixed(1),
        exceedsThreshold: Math.abs(line.fontSize - currentPara.fontSize) > avgLineHeight * 0.2
      } : null,
      hasEOL: line.hasEOL || false,
      shouldStartNew,
      shouldStartNewReasons: {
        noCurrentPara: !currentPara,
        isHeading: isHeading,
        yGapTooLarge: nextLine ? (yGap > adaptiveParaGap) : false,
        hasEOL: line.hasEOL || false,
        fontChange: fontChange || false
      },
      currentParaExists: !!currentPara,
      currentParaFontSize: currentPara ? currentPara.fontSize.toFixed(1) : 'N/A',
      currentParaText: currentPara ? currentPara.text.substring(0, 30) + '...' : 'N/A'
    });
    
    if (shouldStartNew) {
      // Finalize previous paragraph
      if (currentPara && currentPara.text.trim()) {
        paragraphs.push(currentPara);
      }
      
      // Start new paragraph or heading
      if (isHeading) {
        const level = determineHeadingLevel(line.fontSize, avgLineHeight);
        paragraphs.push({
          type: 'heading',
          text: text,
          level: level,
          fontSize: line.fontSize,
          y: line.y,
          lastY: line.y,
          isBold: line.isBold || false,
          isItalic: line.isItalic || false,
          items: [line]
        });
        currentPara = null; // Headings are standalone
      } else {
        currentPara = {
          type: 'paragraph',
          text: text,
          fontSize: line.fontSize,
          y: line.y,
          lastY: line.y,
          isBold: line.isBold || false,
          isItalic: line.isItalic || false,
          items: [line]
        };
      }
    } else {
      // Continue current paragraph - merge lines with proper spacing
      if (currentPara) {
        // Always add space between lines when continuing paragraph
        // This ensures proper word separation
        const trimmedPara = currentPara.text.trim();
        const trimmedLine = text.trim();
        
        if (trimmedPara && trimmedLine) {
          // Check if space is needed (avoid double spaces)
          const lastChar = trimmedPara[trimmedPara.length - 1];
          const firstChar = trimmedLine[0];
          
          // Add space if not already present
          if (lastChar !== ' ' && firstChar !== ' ') {
            currentPara.text += ' ' + trimmedLine;
          } else {
            currentPara.text += trimmedLine;
          }
        } else {
          currentPara.text += text;
        }
        
        currentPara.lastY = line.y;
        currentPara.fontSize = Math.max(currentPara.fontSize, line.fontSize);
        // Update bold/italic flags if line has them
        if (line.isBold) currentPara.isBold = true;
        if (line.isItalic) currentPara.isItalic = true;
        currentPara.items.push(line);
      }
    }
  }
  
  // Add last paragraph
  if (currentPara && currentPara.text.trim()) {
    paragraphs.push(currentPara);
  }
  
  log(`[ClipAIble Offscreen PDF] groupIntoParagraphs: Created ${paragraphs.length} paragraphs from ${lines.length} lines`, {
    avgLinesPerPara: lines.length > 0 ? (lines.length / paragraphs.length).toFixed(2) : 0,
    reductionRatio: lines.length > 0 ? ((lines.length - paragraphs.length) / lines.length * 100).toFixed(1) + '%' : '0%',
    // DIAGNOSTIC: Detailed statistics
    diagnostic: {
      totalLines: lines.length,
      totalParagraphs: paragraphs.length,
      linesPerPara: lines.length > 0 ? (lines.length / paragraphs.length).toFixed(2) : '0',
      // Count reasons for new paragraphs
      reasons: {
        headings: paragraphs.filter(p => p.type === 'heading').length,
        paragraphs: paragraphs.filter(p => p.type === 'paragraph').length
      },
      // Check if every line became a paragraph (problem indicator)
      allLinesBecameParagraphs: paragraphs.length === lines.length,
      warning: paragraphs.length === lines.length ? 'EVERY LINE BECAME A PARAGRAPH - THIS IS A PROBLEM!' : null
    }
  });
  
  return paragraphs;
}

/**
 * Determine heading level based on font size ratio
 * @param {number} fontSize - Font size of heading
 * @param {number} avgFontSize - Average font size in document
 * @returns {number} Heading level (1-5)
 */
function determineHeadingLevel(fontSize, avgFontSize) {
  const ratio = fontSize / avgFontSize;
  if (ratio >= 2.0) return 1;
  if (ratio >= 1.7) return 2;
  if (ratio >= 1.4) return 3;
  if (ratio >= 1.2) return 4;
  return 5;
}

/**
 * Extract content from PDF file
 * Based on PDF.js official examples and documentation
 * @param {string} url - PDF file URL
 * @returns {Promise<Object>} Extracted content result
 */
export async function extractPdfContent(url) {
  log('[ClipAIble Offscreen PDF] === PDF EXTRACTION START ===', { url });
  
  try {
    // Load PDF.js if not already loaded
    await loadPdfJs();
    
    // Fetch PDF file with size check
    log('[ClipAIble Offscreen PDF] Fetching PDF file', { url });
    const maxSize = 50 * 1024 * 1024; // 50 MB
    
    // Check Content-Length header first
    const headResponse = await fetch(url, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('Content-Length');
    
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxSize) {
        const sizeMB = (size / 1024 / 1024).toFixed(1);
        const maxMB = (maxSize / 1024 / 1024).toFixed(0);
        throw new Error(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`);
      }
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Final size check
    if (arrayBuffer.byteLength > maxSize) {
      const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
      const maxMB = (maxSize / 1024 / 1024).toFixed(0);
      throw new Error(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`);
    }
    
    log('[ClipAIble Offscreen PDF] PDF file fetched', { size: arrayBuffer.byteLength });
    
    // Parse PDF using PDF.js
    // Based on official PDF.js examples: pdfjsLib.getDocument({ data: arrayBuffer })
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      verbosity: 0 // Suppress PDF.js warnings
    });
    
    // Handle password-protected PDFs
    loadingTask.onPassword = (callback, reason) => {
      logWarn('[ClipAIble Offscreen PDF] PDF is password-protected', { reason });
      throw new Error('This PDF is password-protected. Please unlock it first.');
    };
    
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      // Check for specific PDF.js errors
      if (error.name === 'PasswordException') {
        throw new Error('This PDF is password-protected. Please unlock it first.');
      }
      if (error.name === 'InvalidPDFException') {
        throw new Error('Invalid PDF file format.');
      }
      if (error.name === 'MissingPDFException') {
        throw new Error('PDF file is missing or corrupted.');
      }
      throw error;
    }
    
    log('[ClipAIble Offscreen PDF] PDF parsed', { numPages: pdf.numPages });
    
    // Check if PDF has pages
    if (pdf.numPages === 0) {
      throw new Error('PDF has no pages.');
    }
    
    // Extract metadata from PDF first (title, author, dates)
    let title = '';
    let author = '';
    let publishDate = '';
    
    try {
      const metadata = await pdf.getMetadata();
      if (metadata && metadata.info) {
        // Extract title
        if (metadata.info.Title) {
          title = metadata.info.Title;
        }
        
        // Extract author(s)
        // PDF Author field can contain multiple authors separated by commas or semicolons
        if (metadata.info.Author) {
          author = metadata.info.Author.trim();
          // Keep full author string - may contain multiple authors
          // Format: "Author1, Author2" or "Author1; Author2"
        }
        
        // Extract dates - PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm
        if (metadata.info.CreationDate) {
          publishDate = parsePdfDate(metadata.info.CreationDate);
        } else if (metadata.info.ModDate) {
          publishDate = parsePdfDate(metadata.info.ModDate);
        }
        
        log('[ClipAIble Offscreen PDF] Metadata extracted', {
          hasTitle: !!title,
          hasAuthor: !!author,
          hasDate: !!publishDate
        });
      }
    } catch (error) {
      logWarn('[ClipAIble Offscreen PDF] Failed to extract PDF metadata', error);
    }
    
    // Extract outline (bookmarks/TOC) if available
    let outline = [];
    try {
      outline = await pdf.getOutline();
      if (outline && outline.length > 0) {
        log('[ClipAIble Offscreen PDF] Outline extracted', { items: outline.length });
      }
    } catch (error) {
      // Outline is optional, don't fail if it's not available
      logWarn('[ClipAIble Offscreen PDF] Failed to extract outline', error);
    }
    
    // Extract content from all pages
    // Based on PDF.js getTextContent() API
    const allContent = [];
    let hasTextContent = false;
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      log(`[ClipAIble Offscreen PDF] Extracting page ${pageNum}/${pdf.numPages}`);
      
      const page = await pdf.getPage(pageNum);
      
      // Get viewport for coordinate transformation
      // CRITICAL: Use viewport.convertToViewportPoint() for proper coordinate transformation
      // This applies the full transformation matrix (rotation, scale, translation)
      // PDF coordinate system: origin (0,0) is at bottom-left, Y increases upward
      // getTextContent() returns coordinates in PDF coordinate system
      // viewport.convertToViewportPoint() converts to viewport coordinates (top-left origin)
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Extract text using getTextContent()
      // Returns: { items: [{ str, transform, width, height, fontName, dir }] }
      let textContent;
      let textItems = [];
      
      try {
        textContent = await page.getTextContent();
        textItems = textContent.items || [];
      } catch (error) {
        logWarn(`[ClipAIble Offscreen PDF] Failed to extract text from page ${pageNum}`, error);
      }
      
      if (textItems.length === 0) {
        logWarn(`[ClipAIble Offscreen PDF] Page ${pageNum} has no text content (scanned PDF?)`);
        // Continue processing - might have images or other content
        continue;
      }
      
      hasTextContent = true;
      
      // DIAGNOSTIC: Log ALL properties of first 10 items to understand what PDF.js provides
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: DIAGNOSTIC - All properties of first 10 items`, {
        totalItems: textItems.length,
        sampleItems: textItems.slice(0, 10).map((item, idx) => {
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const pdfX = transform[4] || 0;
          const pdfY = transform[5] || 0;
          const [viewportX, viewportY] = viewport.convertToViewportPoint(pdfX, pdfY);
          
          // Log ALL available properties
          return {
            index: idx,
            text: item.str?.substring(0, 50) || '',
            // All properties from getTextContent()
            str: item.str || null,
            transform: item.transform || null,
            width: item.width || null,
            height: item.height || null,
            fontName: item.fontName || null,
            fontSize: item.fontSize || null,
            dir: item.dir || null,
            hasEOL: item.hasEOL !== undefined ? item.hasEOL : null,
            // Additional properties that might exist
            fontWeight: item.fontWeight || null,
            fontStyle: item.fontStyle || null,
            // Coordinates
            pdf: { x: pdfX.toFixed(1), y: pdfY.toFixed(1) },
            viewport: { x: viewportX.toFixed(1), y: viewportY.toFixed(1) },
            // All other properties (in case there are more)
            allKeys: Object.keys(item)
          };
        })
      });
      
      // Log sample coordinates for debugging
      if (textItems.length > 0) {
        const sampleItems = textItems.slice(0, 5);
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Sample coordinates (first 5 items)`, {
          viewportHeight: viewport.height.toFixed(1),
          viewportWidth: viewport.width.toFixed(1),
          samples: sampleItems.map((item, idx) => {
            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            const pdfX = transform[4] || 0;
            const pdfY = transform[5] || 0;
            const [viewportX, viewportY] = viewport.convertToViewportPoint(pdfX, pdfY);
            return {
              index: idx,
              text: item.str?.substring(0, 30) || '',
              pdf: { x: pdfX.toFixed(1), y: pdfY.toFixed(1) },
              viewport: { x: viewportX.toFixed(1), y: viewportY.toFixed(1) }
            };
          })
        });
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Extracted ${textItems.length} text items`);
      
      // CRITICAL: Sort text items by position (top to bottom, left to right)
      // PDF.js getTextContent() does NOT guarantee reading order
      // Transform matrix: [a, b, c, d, e, f]
      // - transform[4] (e) = X translation in PDF coordinates
      // - transform[5] (f) = Y translation in PDF coordinates (bottom-left origin)
      // 
      // CRITICAL FIX: Use viewport.convertToViewportPoint() for proper coordinate transformation
      // This applies the full transformation matrix including rotation and scale
      // Returns coordinates in viewport space (top-left origin, Y increases downward)
      const transformedItems = textItems
        .filter(item => item.str !== null && item.str !== undefined && item.str.length > 0)
        .map(item => {
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const pdfX = transform[4] || 0;
          const pdfY = transform[5] || 0;
          
          // CRITICAL: Use viewport API for proper coordinate transformation
          // This handles rotation, scale, and coordinate system conversion correctly
          const [viewportX, viewportY] = viewport.convertToViewportPoint(pdfX, pdfY);
          
          // Extract font style information (bold/italic)
          // CRITICAL: fontName in PDF.js is internal ID like "g_d0_f1", NOT human-readable like "Arial-Bold"
          // We need to use heuristics: width/height ratio or build fontToFormats mapping
          const fontName = item.fontName || '';
          
          // Calculate width/height ratio for bold detection heuristic
          const itemWidth = item.width || 0;
          const itemHeight = item.height || Math.abs(transform[3]) || 12;
          const widthHeightRatio = itemHeight > 0 ? itemWidth / itemHeight : 0;
          
          // Try regex first (works if fontName contains style info)
          let isBold = /bold|black|heavy|demi|semi/i.test(fontName);
          let isItalic = /italic|oblique/i.test(fontName);
          
          // Store ratio for later analysis (will be used to build fontToFormats mapping)
          // We'll analyze all items first, then determine bold/italic based on distribution
          
          // DIAGNOSTIC: Log font detection for first 20 items
          if (transformedItems.length < 20) {
            log(`[ClipAIble Offscreen PDF] Page ${pageNum}: DIAGNOSTIC - Font detection for item ${transformedItems.length}`, {
              text: item.str?.substring(0, 30) || '',
              fontName: fontName || 'EMPTY',
              fontWeight: item.fontWeight || 'NOT_AVAILABLE',
              fontStyle: item.fontStyle || 'NOT_AVAILABLE',
              width: itemWidth.toFixed(1),
              height: itemHeight.toFixed(1),
              widthHeightRatio: widthHeightRatio.toFixed(2),
              isBold: isBold,
              isItalic: isItalic,
              boldRegexMatch: /bold|black|heavy|demi|semi/i.test(fontName),
              italicRegexMatch: /italic|oblique/i.test(fontName),
              allItemKeys: Object.keys(item)
            });
          }
          
          return {
            ...item,
            x: viewportX,
            y: viewportY, // Viewport coordinates: top-left origin, Y increases downward
            pdfX: pdfX, // Keep original PDF coordinates for reference
            pdfY: pdfY,
            fontSize: itemHeight,
            fontName: fontName,
            isBold: isBold, // Will be refined later with fontToFormats mapping
            isItalic: isItalic, // Will be refined later with fontToFormats mapping
            widthHeightRatio: widthHeightRatio, // For bold detection heuristic
            // hasEOL may not be available in all PDF.js versions - use safe check
            hasEOL: item.hasEOL !== undefined ? item.hasEOL : false,
            // dir may not be available - default to LTR
            dir: item.dir || 'ltr'
          };
        });
      
      // PROVEN ALGORITHM from jzillmann/pdf-to-markdown
      // Group items by lines (Y coordinate) with automatic threshold
      // Then sort items within each line by X coordinate
      
      // Calculate line threshold from median height (proven approach)
      const heights = transformedItems
        .map(item => item.fontSize)
        .filter(h => h > 0 && isFinite(h));
      
      heights.sort((a, b) => a - b);
      const medianHeight = heights.length > 0 
        ? heights[Math.floor(heights.length / 2)] 
        : 12;
      const lineThreshold = medianHeight / 2; // Half of median height = threshold for new line
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Line detection`, {
        medianHeight: medianHeight.toFixed(2),
        lineThreshold: lineThreshold.toFixed(2),
        totalItems: transformedItems.length
      });
      
      // Sort all items by Y (top to bottom), then by X (left to right)
      // This ensures correct reading order without column detection
      const sortedItems = transformedItems.sort((a, b) => {
        // Primary: Y coordinate (top to bottom)
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > lineThreshold) {
          return yDiff; // Ascending: top to bottom
        }
        
        // Secondary: X coordinate (left to right, consider RTL)
        const aDir = a.dir || 'ltr';
        const bDir = b.dir || 'ltr';
        if (aDir === 'rtl' && bDir === 'rtl') {
          return b.x - a.x; // RTL: right to left
        }
        return a.x - b.x; // LTR: left to right
      });
      
      // Log first and last items for debugging
      if (sortedItems.length > 0) {
        const firstItem = sortedItems[0];
        const lastItem = sortedItems[sortedItems.length - 1];
        
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: First and last items after sorting`, {
          first: {
            text: firstItem.str?.substring(0, 50) || '',
            coordinates: {
              viewport: { x: firstItem.x.toFixed(1), y: firstItem.y.toFixed(1) },
              pdf: { x: firstItem.pdfX.toFixed(1), y: firstItem.pdfY.toFixed(1) }
            },
            dir: firstItem.dir || 'ltr'
          },
          last: {
            text: lastItem.str?.substring(0, 50) || '',
            coordinates: {
              viewport: { x: lastItem.x.toFixed(1), y: lastItem.y.toFixed(1) },
              pdf: { x: lastItem.pdfX.toFixed(1), y: lastItem.pdfY.toFixed(1) }
            },
            dir: lastItem.dir || 'ltr'
          },
          totalItems: sortedItems.length
        });
        
        // Log X coordinate distribution for debugging
        const xCoords = sortedItems.map(i => i.x).filter(x => !isNaN(x)).sort((a, b) => a - b);
        if (xCoords.length > 0) {
          log(`[ClipAIble Offscreen PDF] Page ${pageNum}: X coordinate distribution`, {
            min: xCoords[0].toFixed(1),
            q1: xCoords[Math.floor(xCoords.length * 0.25)].toFixed(1),
            median: xCoords[Math.floor(xCoords.length * 0.5)].toFixed(1),
            q3: xCoords[Math.floor(xCoords.length * 0.75)].toFixed(1),
            max: xCoords[xCoords.length - 1].toFixed(1),
            range: (xCoords[xCoords.length - 1] - xCoords[0]).toFixed(1)
          });
        }
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Sorted ${sortedItems.length} text items by position`);
      
      // Step 3: Build fontToFormats mapping using width/height ratio heuristic
      // This is needed because PDF.js fontName is internal ID (e.g., "g_d0_f1"), not human-readable
      const fontToFormats = buildFontFormatMap(sortedItems);
      
      // Apply font format mapping to items
      sortedItems.forEach(item => {
        if (fontToFormats.has(item.fontName)) {
          const format = fontToFormats.get(item.fontName);
          item.isBold = format === 'bold' || format === 'bold-italic';
          item.isItalic = format === 'italic' || format === 'bold-italic';
        }
      });
      
      // Step 4: Group items into lines using proven algorithm from pdf-to-markdown
      // Groups items by Y coordinate with threshold = medianHeight / 2
      const lines = groupItemsByLines(sortedItems, lineThreshold);
      
      // Step 4: Group lines into paragraphs with improved algorithm
      const paragraphs = groupIntoParagraphs(lines);
      
      // Convert paragraphs to content items
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Processing ${lines.length} lines into ${paragraphs.length} paragraphs`);
      
      for (const para of paragraphs) {
        const text = para.text.trim();
        if (!text) continue;
        
        if (para.type === 'heading') {
          allContent.push({
            type: 'heading',
            text: text,
            level: para.level,
            pageNum: pageNum
          });
          
          log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Added heading (level ${para.level}, fontSize ${para.fontSize.toFixed(1)}): "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        } else {
          allContent.push({
            type: 'paragraph',
            text: text,
            pageNum: pageNum
          });
          
          log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Added paragraph (${text.length} chars, fontSize ${para.fontSize.toFixed(1)}): "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        }
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Total content items so far: ${allContent.length}`);
      
      // Extract images from page
      // PDF.js images are embedded as XObjects in the page content stream
      // We need to render the page and extract images from the canvas
      try {
        const images = await extractPageImages(page, pageNum);
        if (images && images.length > 0) {
          log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Extracted ${images.length} images`);
          // Insert images into content at appropriate positions
          // For now, add them at the end of page content
          for (const image of images) {
            allContent.push({
              type: 'image',
              src: image.dataUrl,
              url: image.dataUrl, // Alias for compatibility
              alt: image.alt || `Image from page ${pageNum}`,
              pageNum: pageNum,
              width: image.width,
              height: image.height
            });
          }
        }
      } catch (error) {
        logWarn(`[ClipAIble Offscreen PDF] Failed to extract images from page ${pageNum}`, error);
      }
      
      // Extract annotations (links) if available
      try {
        const annotations = await page.getAnnotations();
        if (annotations && annotations.length > 0) {
          log(`[ClipAIble Offscreen PDF] Page ${pageNum} has ${annotations.length} annotations`);
          // TODO: Process annotations to add links to content
        }
      } catch (error) {
        logWarn(`[ClipAIble Offscreen PDF] Failed to extract annotations from page ${pageNum}`, error);
      }
      
      // Cleanup page resources
      page.cleanup();
    }
    
    // Check if we extracted any text content
    if (!hasTextContent && allContent.length === 0) {
      throw new Error('This PDF has no text layer (scanned PDF). OCR is not supported.');
    }
    
    // Use first heading as title if no title found in metadata
    if (!title) {
      // Try to find h1 heading first
      const h1Heading = allContent.find(item => item.type === 'heading' && item.level === 1);
      if (h1Heading) {
        title = h1Heading.text;
      } else {
        // Try any heading
        const anyHeading = allContent.find(item => item.type === 'heading');
        if (anyHeading) {
          title = anyHeading.text;
        } else {
          // Extract from URL as last resort
          const urlParts = url.split('/');
          const filename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
          title = filename.replace('.pdf', '').replace(/%20/g, ' ') || 'Untitled PDF';
        }
      }
    }
    
    // Remove duplicate title and author from content
    // Check headings AND paragraphs at the start of document
    if (title && allContent.length > 0) {
      // Normalize title for comparison (remove extra whitespace, case-insensitive)
      const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, ' ');
      
      log('[ClipAIble Offscreen PDF] Checking for duplicate title', {
        title,
        normalizedTitle,
        contentItems: allContent.length,
        firstItems: allContent.slice(0, 5).map((item, idx) => ({
          index: idx,
          type: item.type,
          text: item.text ? item.text.substring(0, 60) + (item.text.length > 60 ? '...' : '') : 'NO TEXT'
        }))
      });
      
      // Find and remove all headings/paragraphs that match the title
      const itemsToRemove = [];
      for (let i = 0; i < Math.min(allContent.length, 5); i++) { // Check first 5 items
        const item = allContent[i];
        if (!item.text) continue;
        
        const normalizedText = item.text.trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Check for exact match
        if (normalizedText === normalizedTitle) {
          log(`[ClipAIble Offscreen PDF] Found exact title match at index ${i}`, {
            itemText: item.text.substring(0, 80)
          });
          itemsToRemove.push(i);
          continue;
        }
        
        // Check if text is part of title (title split across lines)
        // e.g., title = "Longevity Priority: агентно-управляемая система приоритезации задач в науке о продлении жизни"
        // item1 = "Longevity Priority: агентно-управляемая система приоритезации"
        // item2 = "задач в науке о продлении жизни"
        if (normalizedTitle.includes(normalizedText) || normalizedText.includes(normalizedTitle)) {
          // Check if this is likely a split title (at the start of document)
          // Also check if text is a continuation of title (starts with words from title)
          const titleWords = normalizedTitle.split(/\s+/);
          const textWords = normalizedText.split(/\s+/);
          const firstWordsMatch = textWords.length > 0 && titleWords.includes(textWords[0]);
          const isContinuation = firstWordsMatch && i < 5;
          
          // DIAGNOSTIC: Log all title matching attempts
          log(`[ClipAIble Offscreen PDF] DIAGNOSTIC - Title matching check at index ${i}`, {
            itemText: item.text.substring(0, 80),
            normalizedText,
            normalizedTitle,
            lengthRatio: (normalizedText.length / normalizedTitle.length).toFixed(2),
            titleIncludesText: normalizedTitle.includes(normalizedText),
            textIncludesTitle: normalizedText.includes(normalizedTitle),
            isContinuation,
            firstWord: textWords[0] || '',
            titleWords: titleWords.slice(0, 5),
            textWords: textWords.slice(0, 5),
            firstWordsMatch,
            index: i,
            willRemove: i < 5 && (normalizedText.length < normalizedTitle.length * 0.8 || isContinuation)
          });
          
          if (i < 5 && (normalizedText.length < normalizedTitle.length * 0.8 || isContinuation)) {
            log(`[ClipAIble Offscreen PDF] Found partial title match at index ${i}`, {
              itemText: item.text.substring(0, 80),
              normalizedText,
              normalizedTitle,
              lengthRatio: (normalizedText.length / normalizedTitle.length).toFixed(2),
              isContinuation,
              firstWord: textWords[0] || ''
            });
            itemsToRemove.push(i);
          }
        } else {
          // DIAGNOSTIC: Log why title was NOT matched
          if (i < 10) {
            log(`[ClipAIble Offscreen PDF] DIAGNOSTIC - Title NOT matched at index ${i}`, {
              itemText: item.text.substring(0, 80),
              normalizedText,
              normalizedTitle,
              titleIncludesText: normalizedTitle.includes(normalizedText),
              textIncludesTitle: normalizedText.includes(normalizedTitle)
            });
          }
        }
      }
      
      // Remove items in reverse order to maintain indices
      if (itemsToRemove.length > 0) {
        log('[ClipAIble Offscreen PDF] Removing duplicate title from content', { 
          title, 
          removedCount: itemsToRemove.length,
          indices: itemsToRemove,
          removedItems: itemsToRemove.map(idx => ({
            index: idx,
            type: allContent[idx].type,
            text: allContent[idx].text ? allContent[idx].text.substring(0, 80) : 'NO TEXT'
          }))
        });
        for (let i = itemsToRemove.length - 1; i >= 0; i--) {
          allContent.splice(itemsToRemove[i], 1);
        }
      } else {
        log('[ClipAIble Offscreen PDF] No duplicate title found in first 5 items');
      }
    }
    
    // Remove duplicate author from content (check first few paragraphs)
    if (author && allContent.length > 0) {
      const normalizedAuthor = author.trim().toLowerCase().replace(/\s+/g, ' ');
      
      log('[ClipAIble Offscreen PDF] Checking for duplicate author', {
        author,
        normalizedAuthor,
        contentItems: allContent.length
      });
      
      const itemsToRemove = [];
      for (let i = 0; i < Math.min(allContent.length, 3); i++) { // Check first 3 items
        const item = allContent[i];
        if (!item.text) continue;
        
        const normalizedText = item.text.trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Check if paragraph contains author name
        if (normalizedText === normalizedAuthor || normalizedText.includes(normalizedAuthor)) {
          log(`[ClipAIble Offscreen PDF] Found author match at index ${i}`, {
            itemText: item.text.substring(0, 80),
            normalizedText,
            normalizedAuthor
          });
          itemsToRemove.push(i);
        }
      }
      
      if (itemsToRemove.length > 0) {
        log('[ClipAIble Offscreen PDF] Removing duplicate author from content', { 
          author, 
          removedCount: itemsToRemove.length,
          indices: itemsToRemove,
          removedItems: itemsToRemove.map(idx => ({
            index: idx,
            type: allContent[idx].type,
            text: allContent[idx].text ? allContent[idx].text.substring(0, 80) : 'NO TEXT'
          }))
        });
        for (let i = itemsToRemove.length - 1; i >= 0; i--) {
          allContent.splice(itemsToRemove[i], 1);
        }
      } else {
        log('[ClipAIble Offscreen PDF] No duplicate author found in first 3 items');
      }
    }
    
    // Process outline to add heading IDs (if outline exists)
    // TODO: Match outline items to headings in content and add IDs for internal links
    
    // Cleanup PDF resources
    pdf.destroy();
    
    log('[ClipAIble Offscreen PDF] === PDF EXTRACTION END ===', {
      title,
      contentItems: allContent.length,
      pages: pdf.numPages,
      hasAuthor: !!author,
      hasDate: !!publishDate
    });
    
    // Log content breakdown for debugging
    const contentByType = {};
    allContent.forEach(item => {
      contentByType[item.type] = (contentByType[item.type] || 0) + 1;
    });
    log('[ClipAIble Offscreen PDF] Content breakdown by type', contentByType);
    
    // Log first few items for debugging
    if (allContent.length > 0) {
      log('[ClipAIble Offscreen PDF] First 5 content items', {
        items: allContent.slice(0, 5).map(item => ({
          type: item.type,
          text: item.text ? item.text.substring(0, 100) : 'NO TEXT',
          level: item.level || null
        }))
      });
    }
    
    return {
      title: title || 'Untitled PDF',
      content: allContent,
      publishDate: publishDate || '',
      author: author || ''
    };
  } catch (error) {
    logError('[ClipAIble Offscreen PDF] PDF extraction failed', error);
    throw error;
  }
}
