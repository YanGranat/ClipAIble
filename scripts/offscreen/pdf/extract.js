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

/**
 * Detect columns in PDF page using gap analysis in X-coordinates
 * Improved algorithm: finds significant gaps between text items to identify column boundaries
 * @param {Array} items - Text items with x coordinates
 * @param {number} pageWidth - Page width in viewport coordinates
 * @returns {Array} Array of column definitions { start, end, index, center }
 */
function detectColumns(items, pageWidth) {
  if (items.length === 0) {
    log('[ClipAIble Offscreen PDF] detectColumns: No items, returning single column');
    return [{ start: 0, end: pageWidth, index: 0, center: pageWidth / 2 }];
  }
  
  // Collect all X coordinates and filter out invalid values
  const xCoords = items
    .map(item => item.x)
    .filter(x => !isNaN(x) && isFinite(x) && x >= 0 && x <= pageWidth)
    .sort((a, b) => a - b);
  
  if (xCoords.length < 10) {
    log('[ClipAIble Offscreen PDF] detectColumns: Too few items, returning single column', {
      itemCount: xCoords.length
    });
    return [{ start: 0, end: pageWidth, index: 0, center: pageWidth / 2 }];
  }
  
  // Find gaps between adjacent X coordinates
  const gaps = [];
  for (let i = 1; i < xCoords.length; i++) {
    const gap = xCoords[i] - xCoords[i - 1];
    if (gap > 1) { // Ignore micro-gaps (same line items)
      gaps.push({ 
        position: xCoords[i - 1], 
        width: gap,
        endPosition: xCoords[i]
      });
    }
  }
  
  // Determine minimum gap threshold for column separation
  // Adaptive threshold based on page width (15% of page width, minimum 50px)
  const minColumnGap = Math.max(50, pageWidth * 0.15);
  
  log('[ClipAIble Offscreen PDF] detectColumns: Analysis', {
    pageWidth: pageWidth.toFixed(1),
    minColumnGap: minColumnGap.toFixed(1),
    totalItems: items.length,
    validXCoords: xCoords.length,
    xRange: {
      min: xCoords[0].toFixed(1),
      max: xCoords[xCoords.length - 1].toFixed(1),
      median: xCoords[Math.floor(xCoords.length / 2)].toFixed(1)
    },
    totalGaps: gaps.length
  });
  
  // Filter significant gaps (potential column boundaries)
  const significantGaps = gaps
    .filter(g => g.width > minColumnGap)
    .sort((a, b) => b.width - a.width) // Sort by width (largest first)
    .slice(0, 3); // Maximum 3 gaps = maximum 4 columns
  
  log('[ClipAIble Offscreen PDF] detectColumns: Significant gaps', {
    count: significantGaps.length,
    gaps: significantGaps.map(g => ({
      position: g.position.toFixed(1),
      width: g.width.toFixed(1),
      endPosition: g.endPosition.toFixed(1)
    }))
  });
  
  // If no significant gaps found, treat as single column
  if (significantGaps.length === 0) {
    log('[ClipAIble Offscreen PDF] detectColumns: Single column layout detected');
    return [{ start: 0, end: pageWidth, index: 0, center: pageWidth / 2 }];
  }
  
  // Create column boundaries
  // Start with page left edge
  const columnBoundaries = [0];
  
  // Add boundaries at the middle of each significant gap
  for (const gap of significantGaps) {
    const boundary = gap.position + gap.width / 2;
    columnBoundaries.push(boundary);
  }
  
  // End with page right edge
  columnBoundaries.push(pageWidth);
  
  // Sort boundaries to ensure correct order
  columnBoundaries.sort((a, b) => a - b);
  
  // Create column objects
  const columns = [];
  for (let i = 0; i < columnBoundaries.length - 1; i++) {
    const start = columnBoundaries[i];
    const end = columnBoundaries[i + 1];
    columns.push({
      index: i,
      start: start,
      end: end,
      center: (start + end) / 2,
      width: end - start
    });
  }
  
  log('[ClipAIble Offscreen PDF] detectColumns: Detected columns', {
    count: columns.length,
    columns: columns.map(c => ({
      index: c.index,
      range: `[${c.start.toFixed(1)} - ${c.end.toFixed(1)}]`,
      width: c.width.toFixed(1),
      center: c.center.toFixed(1)
    }))
  });
  
  return columns;
}

/**
 * Get column index for X coordinate
 * @param {number} x - X coordinate
 * @param {Array} columns - Column definitions
 * @returns {number} Column index (0-based)
 */
function getColumnIndex(x, columns) {
  if (!columns || columns.length === 0) {
    return 0;
  }
  
  // Check each column (in order)
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    // Include left boundary, exclude right boundary (except for last column)
    if (x >= col.start && (i === columns.length - 1 ? x <= col.end : x < col.end)) {
      return i;
    }
  }
  
  // Fallback: find closest column by center distance
  let closestIndex = 0;
  let minDistance = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const distance = Math.abs(x - columns[i].center);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  
  return closestIndex;
}

/**
 * Group text items into lines with improved algorithm
 * Handles RTL/LTR text direction and explicit line breaks
 * @param {Array} items - Sorted text items
 * @returns {Array} Array of line objects
 */
function groupIntoLines(items) {
  if (items.length === 0) return [];
  
  const lines = [];
  const LINE_Y_TOLERANCE = 2; // pixels
  
  // Group by Y-coordinate using rounding for tolerance
  const lineMap = new Map();
  
  for (const item of items) {
    // Round Y to nearest tolerance value for grouping
    const roundedY = Math.round(item.y / LINE_Y_TOLERANCE) * LINE_Y_TOLERANCE;
    
    if (!lineMap.has(roundedY)) {
      lineMap.set(roundedY, []);
    }
    lineMap.get(roundedY).push(item);
  }
  
  // Sort lines by Y (already sorted, but ensure order)
  const sortedLines = Array.from(lineMap.entries())
    .sort((a, b) => a[0] - b[0]);
  
  // Process each line
  for (const [lineY, lineItems] of sortedLines) {
    // Items are already sorted by X (with RTL/LTR consideration) from previous step
    // But verify and re-sort if needed
    // Sort items within line by X coordinate
    // Consider text direction if available (RTL languages)
    lineItems.sort((a, b) => {
      // Check if both items have RTL direction
      const aDir = a.dir || 'ltr';
      const bDir = b.dir || 'ltr';
      if (aDir === 'rtl' && bDir === 'rtl') {
        return b.x - a.x; // RTL: right to left (larger X first)
      }
      return a.x - b.x; // LTR: left to right (smaller X first)
    });
    
    // Build line text with smart spacing
    let lineText = '';
    let prevItem = null;
    
    for (const item of lineItems) {
      if (prevItem) {
        // Determine if space is needed
        const expectedX = prevItem.x + (prevItem.width || prevItem.fontSize * (prevItem.str?.length || 1));
        const actualX = item.x;
        const gap = Math.abs(actualX - expectedX);
        const avgFontSize = (item.fontSize + prevItem.fontSize) / 2;
        
        // Space needed if:
        // 1. Gap > 25% of font size (word boundary)
        // 2. OR previous item has explicit line break flag (if available)
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
      lines.push({
        text: lineText.trim(),
        y: lineY,
        x: lineItems[0].x,
        fontSize: Math.max(...lineItems.map(i => i.fontSize)),
        fontName: lineItems[0].fontName || '',
        items: lineItems,
        // hasEOL may not be available - use safe check
        hasEOL: lineItems[lineItems.length - 1].hasEOL !== undefined ? 
                lineItems[lineItems.length - 1].hasEOL : false
      });
    }
  }
  
  return lines;
}

/**
 * Group lines into paragraphs with improved algorithm
 * Handles headings, line spacing, and explicit line breaks
 * @param {Array} lines - Array of line objects
 * @returns {Array} Array of paragraph/heading objects
 */
function groupIntoParagraphs(lines) {
  if (lines.length === 0) return [];
  
  const paragraphs = [];
  let currentPara = null;
  
  // Calculate average line height for dynamic thresholds
  const avgLineHeight = lines.reduce((sum, l) => sum + l.fontSize, 0) / lines.length;
  const PARA_Y_GAP = avgLineHeight * 1.5; // 1.5x line spacing for paragraph break
  const HEADING_FONT_THRESHOLD = avgLineHeight * 1.2; // 20% larger than average = heading
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text) continue;
    
    const nextLine = i < lines.length - 1 ? lines[i + 1] : null;
    
    // Detect heading: larger font size or pattern matching
    const isHeading = line.fontSize > HEADING_FONT_THRESHOLD || 
                      /^(Chapter|Section|\d+\.|\d+\))\s/.test(text);
    
    // Calculate vertical gap to next line
    const yGap = nextLine ? (nextLine.y - line.y) : 0;
    
    // Determine if we should start a new paragraph
    const shouldStartNew = !currentPara || 
                          isHeading || 
                          yGap > PARA_Y_GAP ||
                          line.hasEOL; // Explicit line break from PDF
    
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
          items: [line]
        };
      }
    } else {
      // Continue current paragraph
      if (currentPara) {
        // Add space between lines
        const prevEndsWithPunct = /[.!?;:]$/.test(currentPara.text.trim());
        const lineStartsWithCapital = /^[A-ZА-ЯЁ]/.test(text);
        
        if (prevEndsWithPunct || lineStartsWithCapital) {
          currentPara.text += ' ' + text;
        } else {
          // Check if space needed
          const lastChar = currentPara.text[currentPara.text.length - 1];
          const firstChar = text[0];
          if (lastChar !== ' ' && firstChar !== ' ') {
            currentPara.text += ' ' + text;
          } else {
            currentPara.text += text;
          }
        }
        
        currentPara.lastY = line.y;
        currentPara.fontSize = Math.max(currentPara.fontSize, line.fontSize);
        currentPara.items.push(line);
      }
    }
  }
  
  // Add last paragraph
  if (currentPara && currentPara.text.trim()) {
    paragraphs.push(currentPara);
  }
  
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
          
          return {
            ...item,
            x: viewportX,
            y: viewportY, // Viewport coordinates: top-left origin, Y increases downward
            pdfX: pdfX, // Keep original PDF coordinates for reference
            pdfY: pdfY,
            fontSize: item.height || Math.abs(transform[3]) || item.width || 12,
            // hasEOL may not be available in all PDF.js versions - use safe check
            hasEOL: item.hasEOL !== undefined ? item.hasEOL : false,
            // dir may not be available - default to LTR
            dir: item.dir || 'ltr'
          };
        });
      
      // Step 1: Column Detection for multi-column layouts
      const columns = detectColumns(transformedItems, viewport.width);
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Detected ${columns.length} column(s)`);
      
      // Step 2: Sort items by column, then Y, then X (with RTL/LTR support)
      const sortedItems = transformedItems.sort((a, b) => {
        // 1. Sort by column (left to right)
        const colA = getColumnIndex(a.x, columns);
        const colB = getColumnIndex(b.x, columns);
        if (colA !== colB) {
          return colA - colB;
        }
        
        // 2. Within column: sort by Y (top to bottom)
        // Viewport coordinates: smaller Y = top of page, larger Y = bottom of page
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 1.0) {
          return yDiff; // Ascending: top to bottom
        }
        
        // 3. On same line: sort by X (consider text direction)
        // RTL languages (Arabic, Hebrew): right to left
        // LTR languages (English, etc.): left to right
        const aDir = a.dir || 'ltr';
        const bDir = b.dir || 'ltr';
        if (aDir === 'rtl' && bDir === 'rtl') {
          return b.x - a.x; // RTL: larger X first (right to left)
        }
        return a.x - b.x; // LTR: smaller X first (left to right)
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
            column: getColumnIndex(firstItem.x, columns),
            dir: firstItem.dir || 'ltr'
          },
          last: {
            text: lastItem.str?.substring(0, 50) || '',
            coordinates: {
              viewport: { x: lastItem.x.toFixed(1), y: lastItem.y.toFixed(1) },
              pdf: { x: lastItem.pdfX.toFixed(1), y: lastItem.pdfY.toFixed(1) }
            },
            column: getColumnIndex(lastItem.x, columns),
            dir: lastItem.dir || 'ltr'
          },
          totalItems: sortedItems.length
        });
        
        // Log column distribution
        const columnDistribution = new Map();
        for (const item of sortedItems) {
          const colIdx = getColumnIndex(item.x, columns);
          columnDistribution.set(colIdx, (columnDistribution.get(colIdx) || 0) + 1);
        }
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Items per column`, {
          distribution: Array.from(columnDistribution.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([colIdx, count]) => ({
              column: colIdx,
              items: count,
              percentage: ((count / sortedItems.length) * 100).toFixed(1) + '%'
            }))
        });
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Sorted ${sortedItems.length} text items by position`);
      
      // Step 3: Group items into lines with improved algorithm
      const lines = groupIntoLines(sortedItems);
      
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
    
    // Remove duplicate title from content if it matches metadata title
    // IMPROVED: Check all headings, not just first one
    // Also handle case where title is split across multiple headings
    if (title && allContent.length > 0) {
      // Normalize title for comparison (remove extra whitespace, case-insensitive)
      const normalizedTitle = title.trim().toLowerCase();
      
      // Find and remove all headings that match the title
      const headingsToRemove = [];
      for (let i = 0; i < allContent.length; i++) {
        const item = allContent[i];
        if (item.type === 'heading') {
          const normalizedHeading = item.text.trim().toLowerCase();
          
          // Check for exact match
          if (normalizedHeading === normalizedTitle) {
            headingsToRemove.push(i);
            continue;
          }
          
          // Check if heading is part of title (title split across lines)
          // e.g., title = "Neural network computation with DNA strand displacement cascades"
          // heading1 = "Neural network computation with DNA strand"
          // heading2 = "displacement cascades"
          if (normalizedTitle.includes(normalizedHeading) || normalizedHeading.includes(normalizedTitle)) {
            // Check if this is likely a split title (short heading at the start)
            if (i < 3 && normalizedHeading.length < normalizedTitle.length * 0.7) {
              headingsToRemove.push(i);
            }
          }
        }
      }
      
      // Remove headings in reverse order to maintain indices
      if (headingsToRemove.length > 0) {
        log('[ClipAIble Offscreen PDF] Removing duplicate title headings from content', { 
          title, 
          removedCount: headingsToRemove.length,
          indices: headingsToRemove
        });
        for (let i = headingsToRemove.length - 1; i >= 0; i--) {
          allContent.splice(headingsToRemove[i], 1);
        }
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
