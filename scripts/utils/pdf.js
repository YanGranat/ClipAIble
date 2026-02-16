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
 * Chrome PDF viewer extension ID.
 * Used for both URL-based and HTML-based detection.
 */
const CHROME_PDF_VIEWER_EXTENSION_ID = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';

/**
 * Detect PDF from HTML content by checking for Chrome PDF viewer markers.
 * When Chrome renders a PDF inline (without redirecting to the viewer extension URL),
 * it injects pdf_embedder.css from the built-in PDF viewer extension.
 * @param {string} html - Page HTML content
 * @returns {boolean} True if HTML contains Chrome PDF viewer markers
 */
export function isPdfHtml(html) {
  if (!html) return false;
  return html.includes(`chrome-extension://${CHROME_PDF_VIEWER_EXTENSION_ID}/`);
}

/**
 * Check if tab URL is Chrome PDF viewer
 * @param {string} tabUrl - Tab URL
 * @returns {boolean} True if tab is showing Chrome PDF viewer
 */
export function isChromePdfViewer(tabUrl) {
  if (!tabUrl) return false;
  
  return tabUrl.startsWith(`chrome-extension://${CHROME_PDF_VIEWER_EXTENSION_ID}/`);
}

/**
 * Detect if current page is a PDF page
 * @param {string} url - Page URL
 * @param {string} [tabUrl] - Tab URL (optional, for Chrome PDF viewer detection)
 * @param {string} [html] - Page HTML content (optional, for inline PDF detection)
 * @returns {Object|null} {isPdf: true, originalUrl: string} or null
 */
export function detectPdfPage(url, tabUrl, html) {
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
  
  // Check if HTML contains Chrome PDF viewer markers (inline PDF rendering).
  // Chrome sometimes renders PDFs within the original page URL without redirecting
  // to the viewer extension URL. In this case the tab URL stays as the original
  // server URL but the HTML references pdf_embedder.css from the PDF viewer extension.
  if (html && isPdfHtml(html)) {
    return { isPdf: true, originalUrl: url };
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

