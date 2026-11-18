// @ts-check
// PDF file picker - allows user to select PDF file and save to IndexedDB
// Uses File API to read file content when PDF is not in IndexedDB

import { log, logError, logWarn } from '../utils/logging.js';
import { validatePdfData } from './pdf-storage.js';
import { LIMITS } from '../offscreen/pdf/constants.js';
import { createPdfError, localizePdfError } from '../utils/pdf-errors.js';
import { tSync } from '../locales.js';

async function readSelectedPdf(file, expectedPdfUrl) {
  if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
    throw createPdfError('Selected file is not a PDF', 'errorPdfInvalid');
  }
  if (file.size > LIMITS.MAX_FILE_SIZE) throw createPdfError('PDF is too large', 'errorPdfTooLarge', {
    size: (file.size / 1024 / 1024).toFixed(1), max: String(LIMITS.MAX_FILE_SIZE / 1024 / 1024)
  });
  if (typeof expectedPdfUrl === 'string' && expectedPdfUrl.startsWith('file://')) {
    let name;
    try {
      const parsed = new URL(expectedPdfUrl);
      name = decodeURIComponent(parsed.pathname.split('/').pop() || '');
      if (/[\\/]/.test(name)) throw new Error('Invalid PDF file URL');
    } catch { throw createPdfError('Invalid PDF file URL', 'errorPdfDataUnavailable'); }
    if (name && name.normalize('NFC').toLowerCase() !== file.name.normalize('NFC').toLowerCase()) {
      throw createPdfError('Select the requested PDF file', 'errorPdfDataUnavailable');
    }
  }
  const bytes = await file.arrayBuffer();
  try { return validatePdfData(bytes, 'Selected PDF'); }
  catch (error) { throw createPdfError(error.message, 'errorPdfInvalid'); }
}

/**
 * Request user to select PDF file via File API
 * This is used when PDF data is not in IndexedDB and cannot be extracted from tab
 * @param {string} expectedPdfUrl - Expected PDF URL (for validation, optional)
 * @returns {Promise<ArrayBuffer|null>} PDF file data as ArrayBuffer, or null if user cancelled
 */
export async function requestPdfFileSelection(expectedPdfUrl = null) {
  log('[PDF File Picker] Requesting PDF file selection', { expectedPdfUrl });
  
  // Extract and log suggested path for user reference
  let suggestedPath = null;
  if (expectedPdfUrl && expectedPdfUrl.startsWith('file://')) {
    suggestedPath = extractDirectoryFromFileUrl(expectedPdfUrl);
    if (suggestedPath) {
      log('[PDF File Picker] Suggested file location', { 
        suggestedPath,
        note: 'Due to browser security restrictions, file picker may not open in this directory automatically. Please navigate to this folder if needed.'
      });
    }
  }
  
  try {
    // Check if File System Access API is available
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      return await selectPdfFileViaFileSystemAccess(expectedPdfUrl);
    } else {
      // Fallback to input[type="file"]
      return await selectPdfFileViaInput(expectedPdfUrl);
    }
  } catch (error) {
    logError('[PDF File Picker] Failed to select PDF file', error);
    throw await localizePdfError(error, 'errorPdfDataUnavailable');
  }
}

/**
 * Extract directory from file:// URL
 * @param {string} fileUrl - file:// URL
 * @returns {string|null} Directory path or null
 */
function extractDirectoryFromFileUrl(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('file://')) {
    return null;
  }
  
  try {
    // Decode URL-encoded path
    const decodedPath = decodeURIComponent(fileUrl.replace('file:///', '').replace(/\//g, '\\'));
    // Extract directory (remove filename)
    const lastBackslash = decodedPath.lastIndexOf('\\');
    if (lastBackslash > 0) {
      return decodedPath.substring(0, lastBackslash);
    }
    return null;
  } catch (error) {
    logWarn('[PDF File Picker] Failed to extract directory from file URL', { fileUrl, error: error.message });
    return null;
  }
}

/**
 * Check if path is in a standard directory and return startIn value
 * @param {string} path - File path
 * @returns {string|null} startIn value or null
 */
function getStartInForPath(path) {
  if (!path) return null;
  
  const lowerPath = path.toLowerCase();
  
  // Check for standard Windows directories
  if (lowerPath.includes('\\documents\\') || lowerPath.includes('\\documents')) {
    return 'documents';
  }
  if (lowerPath.includes('\\downloads\\') || lowerPath.includes('\\downloads')) {
    return 'downloads';
  }
  if (lowerPath.includes('\\desktop\\') || lowerPath.includes('\\desktop')) {
    return 'desktop';
  }
  if (lowerPath.includes('\\pictures\\') || lowerPath.includes('\\pictures')) {
    return 'pictures';
  }
  if (lowerPath.includes('\\videos\\') || lowerPath.includes('\\videos')) {
    return 'videos';
  }
  if (lowerPath.includes('\\music\\') || lowerPath.includes('\\music')) {
    return 'music';
  }
  
  return null;
}

/**
 * Select PDF file using File System Access API (modern browsers)
 * @param {string} expectedPdfUrl - Expected PDF URL (for validation, optional)
 * @returns {Promise<ArrayBuffer|null>} PDF file data as ArrayBuffer, or null if user cancelled
 */
async function selectPdfFileViaFileSystemAccess(expectedPdfUrl) {
  try {
    log('[PDF File Picker] Using File System Access API', { expectedPdfUrl });
    
    // Try to extract directory and determine startIn
    let startIn = null;
    let suggestedPath = null;
    
    if (expectedPdfUrl) {
      suggestedPath = extractDirectoryFromFileUrl(expectedPdfUrl);
      if (suggestedPath) {
        startIn = getStartInForPath(suggestedPath);
        log('[PDF File Picker] Extracted path from URL', { 
          suggestedPath, 
          startIn,
          note: startIn ? 'Will try to open in standard directory' : 'Path is not in standard directory, cannot set startIn'
        });
      }
    }
    
    // Show helpful message if we have path but cannot set startIn
    if (suggestedPath && !startIn) {
      log('[PDF File Picker] File is in non-standard directory', { 
        suggestedPath,
        note: 'Cannot set startIn for custom directories due to browser security restrictions'
      });
    }
    
    const pickerOptions = {
      types: [{
        description: tSync('pdfFilesFilter', document.documentElement?.lang || 'en'),
        accept: {
          'application/pdf': ['.pdf']
        }
      }],
      multiple: false,
      excludeAcceptAllOption: false
    };
    
    // Add startIn if we have a standard directory
    if (startIn) {
      pickerOptions.startIn = startIn;
      log('[PDF File Picker] Using startIn option', { startIn });
    }
    
    /** @type {any} */
    const win = window;
    const fileHandle = await win.showOpenFilePicker(pickerOptions);
    
    if (!fileHandle || fileHandle.length === 0) {
      log('[PDF File Picker] User cancelled file selection');
      return null;
    }
    
    const file = await fileHandle[0].getFile();
    log('[PDF File Picker] File selected', { 
      name: file.name, 
      size: file.size,
      type: file.type 
    });
    
    // Read file as ArrayBuffer
    const arrayBuffer = await readSelectedPdf(file, expectedPdfUrl);
    
    log('[PDF File Picker] File read successfully', { 
      size: arrayBuffer.byteLength,
      sizeMB: (arrayBuffer.byteLength / 1024 / 1024).toFixed(2)
    });
    
    return arrayBuffer;
  } catch (error) {
    // User cancelled or error occurred
    if (error.name === 'AbortError' || error.message?.includes('cancel')) {
      log('[PDF File Picker] User cancelled file selection');
      return null;
    }
    throw error;
  }
}

/**
 * Select PDF file using input[type="file"] (fallback for older browsers)
 * @param {string} expectedPdfUrl - Expected PDF URL (for validation, optional)
 * @returns {Promise<ArrayBuffer|null>} PDF file data as ArrayBuffer, or null if user cancelled
 */
async function selectPdfFileViaInput(expectedPdfUrl) {
  return new Promise((resolve, reject) => {
    log('[PDF File Picker] Using input[type="file"] fallback');
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.style.display = 'none';
    
    input.addEventListener('change', async (event) => {
      try {
        /** @type {any} */
        const eventTarget = event.target;
        /** @type {HTMLInputElement} */
        const target = eventTarget;
        const file = target.files?.[0];
        
        if (!file) {
          log('[PDF File Picker] No file selected');
          resolve(null);
          return;
        }
        
        resolve(await readSelectedPdf(file, expectedPdfUrl));
      } catch (error) {
        reject(error);
      } finally {
        // Clean up
        document.body.removeChild(input);
      }
    });
    
    input.addEventListener('cancel', () => {
      log('[PDF File Picker] User cancelled file selection');
      document.body.removeChild(input);
      resolve(null);
    });
    
    // Add to DOM and trigger click
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Request PDF file selection from popup context
 * Sends message to popup to show file picker
 * @param {string} expectedPdfUrl - Expected PDF URL (for validation, optional)
 * @returns {Promise<ArrayBuffer|null>} PDF file data as ArrayBuffer, or null if user cancelled
 */
export async function requestPdfFileSelectionFromPopup(expectedPdfUrl = null) {
  log('[PDF File Picker] Requesting PDF file selection from popup', { expectedPdfUrl });
  
  return new Promise((resolve, reject) => {
    // Send message to popup to show file picker
    chrome.runtime.sendMessage({
      action: 'selectPdfFile',
      expectedPdfUrl: expectedPdfUrl
    }, (response) => {
      if (chrome.runtime.lastError) {
        logError('[PDF File Picker] Failed to send message to popup', chrome.runtime.lastError);
        reject(createPdfError(chrome.runtime.lastError.message, 'errorPdfDataUnavailable'));
        return;
      }
      
      if (!response) {
        log('[PDF File Picker] No response from popup - popup may be closed');
        reject(createPdfError('No response from popup. Please keep the extension popup open and try again.', 'errorPdfDataUnavailable'));
        return;
      }
      
      if (response.cancelled) {
        log('[PDF File Picker] User cancelled file selection in popup');
        resolve(null);
        return;
      }
      
      if (response.success) {
        if (response.pdfData) {
          // Convert base64 to ArrayBuffer
          const binaryString = atob(response.pdfData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;
          
          log('[PDF File Picker] PDF file selected and received from popup', {
            size: arrayBuffer.byteLength,
            sizeMB: (arrayBuffer.byteLength / 1024 / 1024).toFixed(2)
          });
          
          resolve(arrayBuffer);
        } else {
          log('[PDF File Picker] No PDF data in response');
          resolve(null);
        }
      } else {
        reject(createPdfError(response.error || 'Failed to select PDF file', response.translationKey || 'errorPdfDataUnavailable', response.translationParams || {}));
      }
    });
  });
}

