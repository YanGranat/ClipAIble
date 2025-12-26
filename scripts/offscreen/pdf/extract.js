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
      // PDF coordinate system: origin (0,0) is at bottom-left, Y increases upward
      // getTextContent() returns coordinates in PDF coordinate system
      // We need to convert to top-left origin for correct reading order
      const viewport = page.getViewport({ scale: 1.0 });
      const viewportHeight = viewport.height;
      
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
        const sampleItem = textItems[0];
        const sampleTransform = sampleItem.transform || [1, 0, 0, 1, 0, 0];
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Sample coordinates`, {
          viewportHeight,
          viewportWidth: viewport.width,
          sampleY: sampleTransform[5],
          sampleX: sampleTransform[4],
          sampleText: sampleItem.str?.substring(0, 50)
        });
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Extracted ${textItems.length} text items`);
      
      // CRITICAL: Sort text items by position (top to bottom, left to right)
      // PDF.js getTextContent() does NOT guarantee reading order
      // PDF coordinate system: origin (0,0) is at bottom-left, Y increases upward
      // Transform matrix: [a, b, c, d, e, f]
      // - transform[4] (e) = X translation
      // - transform[5] (f) = Y translation (in PDF coordinates, bottom-left origin)
      // To convert to top-left origin: yTop = viewportHeight - yBottom
      // Then sort by yTop ascending (smaller = top, larger = bottom)
      // NOTE: Don't filter out items with special characters - they might be formulas
      const sortedItems = textItems
        .filter(item => item.str !== null && item.str !== undefined && item.str.length > 0)
        .map(item => {
          const transform = item.transform || [1, 0, 0, 1, 0, 0];
          const x = transform[4] || 0;
          const yBottom = transform[5] || 0; // Y in PDF coordinates (bottom-left origin)
          
          // CRITICAL: PDF coordinate system has origin at bottom-left, Y increases upward
          // getTextContent() returns coordinates in PDF coordinate system
          // For reading order (top to bottom), we need to invert Y
          // Convert to top-left origin: yTop = viewportHeight - yBottom
          // - yBottom = 0 (bottom of page) -> yTop = viewportHeight (bottom in top-left system)
          // - yBottom = viewportHeight (top of page) -> yTop = 0 (top in top-left system)
          // So: smaller yTop = top of page, larger yTop = bottom of page
          const yTop = viewportHeight - yBottom;
          
          return {
            ...item,
            x: x,
            y: yTop, // Use top-left origin for sorting (smaller = top, larger = bottom)
            yOriginal: yBottom, // Keep original for reference
            fontSize: item.height || Math.abs(transform[3]) || item.width || 12
          };
        })
        .sort((a, b) => {
          // Primary sort: Y coordinate (top to bottom)
          // After conversion to top-left origin: yTop = viewportHeight - yBottom
          // - yBottom=0 (bottom in PDF) -> yTop=viewportHeight (bottom in top-left) ✓
          // - yBottom=viewportHeight (top in PDF) -> yTop=0 (top in top-left) ✓
          // So: smaller yTop = top of page, larger yTop = bottom of page
          // For reading order (top to bottom): sort ascending (smaller yTop first)
          const yDiff = a.y - b.y; // Ascending: smaller Y (top of page) comes first
          if (Math.abs(yDiff) > 0.5) {
            return yDiff;
          }
          // Secondary sort: X coordinate (left to right)
          return a.x - b.x;
        });
      
      // Log first and last items for debugging
      if (sortedItems.length > 0) {
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: First item (should be top)`, {
          text: sortedItems[0].str?.substring(0, 50),
          y: sortedItems[0].y,
          yOriginal: sortedItems[0].yOriginal,
          x: sortedItems[0].x
        });
        log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Last item (should be bottom)`, {
          text: sortedItems[sortedItems.length - 1].str?.substring(0, 50),
          y: sortedItems[sortedItems.length - 1].y,
          yOriginal: sortedItems[sortedItems.length - 1].yOriginal,
          x: sortedItems[sortedItems.length - 1].x
        });
      }
      
      log(`[ClipAIble Offscreen PDF] Page ${pageNum}: Sorted ${sortedItems.length} text items by position`);
      
      // Group sorted text items into lines
      // First, group items by Y coordinate (same line)
      const Y_TOLERANCE = 3; // Pixels tolerance for same line (increased for better grouping)
      const lineGroups = new Map();
      
      for (const item of sortedItems) {
        const y = item.y;
        // Find existing line group with similar Y coordinate
        let foundGroup = null;
        for (const [groupY, group] of lineGroups.entries()) {
          if (Math.abs(y - groupY) <= Y_TOLERANCE) {
            foundGroup = group;
            break;
          }
        }
        
        if (foundGroup) {
          foundGroup.push(item);
        } else {
          lineGroups.set(y, [item]);
        }
      }
      
      // Sort items within each line by X coordinate (left to right)
      // Then build lines from sorted items
      const lines = [];
      for (const [lineY, items] of lineGroups.entries()) {
        // Sort items in line by X coordinate
        items.sort((a, b) => a.x - b.x);
        
        // Build line text from sorted items
        let lineText = '';
        let lastX = null;
        const lineFontSize = Math.max(...items.map(item => item.fontSize));
        
        for (const item of items) {
          const text = item.str || '';
          const x = item.x;
          const itemWidth = item.width || item.fontSize * text.length;
          
          if (lastX !== null) {
            const spacing = x - lastX;
            // Determine if we need a space between items
            // If spacing is larger than a small fraction of font size, it's likely a word break
            // Also check if the last character of previous text and first character of current text
            // suggest a word boundary (letter + letter = likely same word, letter + space = already has space)
            const needsSpace = spacing > lineFontSize * 0.3;
            
            if (needsSpace) {
              lineText += ' ' + text;
            } else {
              lineText += text;
            }
          } else {
            lineText = text;
          }
          
          lastX = x + itemWidth;
        }
        
        if (lineText.trim()) {
          lines.push({
            text: lineText.trim(),
            y: lineY,
            x: items[0].x,
            fontSize: lineFontSize,
            items: items
          });
        }
      }
      
      // Sort lines by Y coordinate (top to bottom)
      lines.sort((a, b) => a.y - b.y);
      
      // Group lines into paragraphs
      // Lines that are close vertically and have similar font sizes should be merged
      const PARAGRAPH_Y_TOLERANCE = 15; // Maximum vertical gap between lines in same paragraph
      const HEADING_FONT_SIZE_THRESHOLD = 14;
      const paragraphs = [];
      let currentParagraph = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const text = line.text.trim();
        if (!text) continue;
        
        // Detect heading: larger font size
        const isHeading = line.fontSize > HEADING_FONT_SIZE_THRESHOLD;
        
        // Check if this line should start a new paragraph
        // New paragraph if:
        // 1. It's a heading
        // 2. Large vertical gap from previous line (new section)
        // 3. Significant font size difference (likely different element type)
        const shouldStartNewParagraph = isHeading || 
          (currentParagraph === null) ||
          (currentParagraph.lastY !== null && Math.abs(line.y - currentParagraph.lastY) > PARAGRAPH_Y_TOLERANCE) ||
          (Math.abs(line.fontSize - currentParagraph.fontSize) > 3 && line.fontSize > HEADING_FONT_SIZE_THRESHOLD);
        
        if (shouldStartNewParagraph) {
          // Finalize previous paragraph if exists
          if (currentParagraph && currentParagraph.text.trim()) {
            paragraphs.push(currentParagraph);
          }
          
          // Start new paragraph or heading
          if (isHeading) {
            // Determine heading level based on font size
            let level = 2; // Default to h2
            if (line.fontSize > 20) level = 1;
            else if (line.fontSize > 16) level = 2;
            else if (line.fontSize > 14) level = 3;
            else level = 4;
            
            paragraphs.push({
              type: 'heading',
              text: text,
              level: level,
              fontSize: line.fontSize,
              y: line.y,
              lastY: line.y
            });
            currentParagraph = null; // Headings are standalone
          } else {
            // Start new paragraph
            currentParagraph = {
              type: 'paragraph',
              text: text,
              fontSize: line.fontSize,
              y: line.y,
              lastY: line.y
            };
          }
        } else {
          // Continue current paragraph - merge this line
          if (currentParagraph) {
            // Add space between lines if needed
            // Check if line ends with punctuation or starts with capital (likely new sentence)
            const prevEndsWithPunct = /[.!?;:]$/.test(currentParagraph.text.trim());
            const lineStartsWithCapital = /^[A-ZА-ЯЁ]/.test(text);
            
            if (prevEndsWithPunct || lineStartsWithCapital) {
              currentParagraph.text += ' ' + text;
            } else {
              // Check if we need a space (if last char is not space and first char is not space)
              const lastChar = currentParagraph.text[currentParagraph.text.length - 1];
              const firstChar = text[0];
              if (lastChar !== ' ' && firstChar !== ' ') {
                currentParagraph.text += ' ' + text;
              } else {
                currentParagraph.text += text;
              }
            }
            currentParagraph.lastY = line.y;
            // Update font size to average (or keep largest)
            currentParagraph.fontSize = Math.max(currentParagraph.fontSize, line.fontSize);
          }
        }
      }
      
      // Add last paragraph if exists
      if (currentParagraph && currentParagraph.text.trim()) {
        paragraphs.push(currentParagraph);
      }
      
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
    // This prevents showing the title twice (once in metadata, once as first heading)
    if (title && allContent.length > 0) {
      const firstItem = allContent[0];
      if (firstItem.type === 'heading' && firstItem.text === title) {
        log('[ClipAIble Offscreen PDF] Removing duplicate title from content', { title });
        allContent.shift(); // Remove first item (duplicate title)
      } else {
        // Also check if any heading matches the title (might not be first)
        const titleHeadingIndex = allContent.findIndex(
          item => item.type === 'heading' && item.text === title
        );
        if (titleHeadingIndex > 0) {
          // Only remove if it's not the first item (already checked above)
          // But if title is from metadata and matches a heading, we might want to keep it
          // For now, only remove if it's the very first item
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
