// @ts-check
// PDF file fetching utility - handles URL conversion and file fetching

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { LIMITS } from '../constants.js';

/**
 * Convert Windows absolute path to file:// URL
 * @param {string} url - Original URL or path
 * @returns {string} Converted URL
 */
export function toFileUrl(url) {
  if (url.match(/^[A-Za-z]:[\\/]/)) {
    // Windows absolute path (C:/... or C:\...)
    // Convert to file:// URL
    const fileUrl = 'file:///' + url.replace(/\\/g, '/');
    log('[PDF v3] Converted Windows path to file:// URL', { original: url, converted: fileUrl });
    return fileUrl;
  }
  return url;
}

/**
 * Fetch PDF file with size validation
 * Supports both URL-based fetching and direct ArrayBuffer data
 * @param {string} url - PDF file URL (or identifier if pdfData is provided)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data as ArrayBuffer (for local files)
 * @returns {Promise<ArrayBuffer>} PDF file as ArrayBuffer
 */
export async function fetchPdfFile(url, pdfData = null) {
  const maxSize = LIMITS.MAX_FILE_SIZE;
  
  // If PDF data is provided directly, use it (for local files passed via message)
  if (pdfData && pdfData instanceof ArrayBuffer) {
    if (pdfData.byteLength > maxSize) {
      const sizeMB = (pdfData.byteLength / 1024 / 1024).toFixed(1);
      const maxMB = (maxSize / 1024 / 1024).toFixed(0);
      throw new Error(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`);
    }
    log('[PDF v3] PDF file data provided directly', { size: pdfData.byteLength });
    return pdfData;
  }
  
  // Handle local file paths (Windows absolute paths)
  let fetchUrl = toFileUrl(url);
  
  try {
    // CRITICAL: Add timeout for fetch operations to prevent hanging
    // Increased for very large PDFs (up to 1000 pages) which can take longer to download
    const FETCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - should be enough for very large PDFs up to 1000 pages
    
    // Helper function to add timeout to fetch
    const fetchWithTimeout = async (url, options = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Fetch timeout after ${FETCH_TIMEOUT_MS / 1000} seconds. The server may be slow or the file may be too large.`);
        }
        throw error;
      }
    };
    
    // Check file size first (if Content-Length header is available)
    let headResponse;
    try {
      headResponse = await fetchWithTimeout(fetchUrl, { method: 'HEAD' });
    } catch (headError) {
      // If HEAD fails, continue with GET (some servers don't support HEAD)
      logWarn('[PDF v3] HEAD request failed, continuing with GET', { error: headError.message });
      headResponse = null;
    }
    
    const contentLength = headResponse?.headers.get('Content-Length');
    
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxSize) {
        const sizeMB = (size / 1024 / 1024).toFixed(1);
        const maxMB = (maxSize / 1024 / 1024).toFixed(0);
        throw new Error(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`);
      }
    }
    
    // Fetch the file with timeout
    const response = await fetchWithTimeout(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    
    // CRITICAL: Add timeout for arrayBuffer() as well (large files can take time)
    const arrayBuffer = await Promise.race([
      response.arrayBuffer(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`PDF download timeout after ${FETCH_TIMEOUT_MS / 1000} seconds. The file may be too large.`)), FETCH_TIMEOUT_MS)
      )
    ]);
    
    // Double-check size after fetching
    if (arrayBuffer.byteLength > maxSize) {
      const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
      const maxMB = (maxSize / 1024 / 1024).toFixed(0);
      throw new Error(`PDF file is too large (${sizeMB} MB). Maximum size: ${maxMB} MB.`);
    }
    
    log('[PDF v3] PDF file fetched', { size: arrayBuffer.byteLength });
    return arrayBuffer;
  } catch (fetchError) {
    // If fetch fails for local files, provide helpful error message
    if (fetchUrl.startsWith('file://')) {
      logWarn('[PDF v3] Fetch failed for local file', { error: fetchError.message });
      throw new Error(`Cannot load local file directly. Please open the PDF file in Chrome first, or use a web URL. Original error: ${fetchError.message}`);
    }
    throw fetchError;
  }
}

