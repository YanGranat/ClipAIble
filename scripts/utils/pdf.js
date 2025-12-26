// @ts-check
// PDF page detection utilities

/**
 * Check if URL is a PDF file
 * @param {string} url - Page URL
 * @returns {boolean} True if URL points to a PDF file
 */
export function isPdfUrl(url) {
  if (!url) return false;
  
  // Check if URL ends with .pdf
  if (url.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  
  // Check if URL contains .pdf in path (before query params)
  const urlPath = url.split('?')[0].split('#')[0];
  if (urlPath.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  
  // Check if URL has PDF mime type in query params
  if (url.includes('content-type=application/pdf') || url.includes('type=pdf')) {
    return true;
  }
  
  return false;
}

/**
 * Check if tab URL is Chrome PDF viewer
 * @param {string} tabUrl - Tab URL
 * @returns {boolean} True if tab is showing Chrome PDF viewer
 */
export function isChromePdfViewer(tabUrl) {
  if (!tabUrl) return false;
  
  // Chrome PDF viewer extension ID
  return tabUrl.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/');
}

/**
 * Detect if current page is a PDF page
 * @param {string} url - Page URL
 * @param {string} [tabUrl] - Tab URL (optional, for Chrome PDF viewer detection)
 * @returns {Object|null} {isPdf: true, originalUrl: string} or null
 */
export function detectPdfPage(url, tabUrl) {
  // Check if URL is directly a PDF
  if (isPdfUrl(url)) {
    return { isPdf: true, originalUrl: url };
  }
  
  // Check if tab is Chrome PDF viewer
  if (tabUrl && isChromePdfViewer(tabUrl)) {
    // Try to extract original URL from viewer URL
    // Chrome PDF viewer URL format: chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=...
    const fileMatch = tabUrl.match(/[?&]file=([^&]+)/);
    if (fileMatch) {
      try {
        const originalUrl = decodeURIComponent(fileMatch[1]);
        if (isPdfUrl(originalUrl)) {
          return { isPdf: true, originalUrl };
        }
      } catch (e) {
        // Invalid URL encoding, continue
      }
    }
    
    // If we're in PDF viewer but can't extract URL, still return PDF detection
    // The actual URL extraction will be handled by webNavigation API
    return { isPdf: true, originalUrl: null };
  }
  
  return null;
}

/**
 * Get original PDF URL from Chrome PDF viewer tab
 * Uses webNavigation API to find the original URL
 * @param {number} tabId - Tab ID
 * @returns {Promise<string|null>} Original PDF URL or null
 */
export async function getOriginalPdfUrl(tabId) {
  try {
    // Get navigation history for this tab
    const history = await chrome.webNavigation.getAllFrames({ tabId });
    
    // Find the frame that loaded the PDF (not the viewer extension)
    for (const frame of history) {
      const frameUrl = frame.url;
      // Skip Chrome extension URLs
      if (frameUrl.startsWith('chrome-extension://') || 
          frameUrl.startsWith('chrome://') ||
          frameUrl.startsWith('edge://')) {
        continue;
      }
      
      // Check if this is a PDF URL
      if (isPdfUrl(frameUrl)) {
        return frameUrl;
      }
    }
    
    // Alternative: try to get from tab history
    // This might not work in all cases, but worth trying
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url && isPdfUrl(tab.url)) {
      return tab.url;
    }
    
    return null;
  } catch (error) {
    // webNavigation API might not be available or tab might be closed
    return null;
  }
}

