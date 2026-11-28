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
  
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('content-type')?.toLowerCase() === 'application/pdf' ||
      parsed.searchParams.get('type')?.toLowerCase() === 'pdf';
  } catch {}
  
  return false;
}

const CHROME_PDF_VIEWER_EXTENSION_ID = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';
const isSupportedPdfSource = url => /^(https?|file):\/\//i.test(url);

/**
 * Check if tab URL is Chrome PDF viewer
 * @param {string} tabUrl - Tab URL
 * @returns {boolean} True if tab is showing Chrome PDF viewer
 */
export function isChromePdfViewer(tabUrl) {
  if (!tabUrl) return false;
  
  return tabUrl.startsWith(`chrome-extension://${CHROME_PDF_VIEWER_EXTENSION_ID}/`);
}

/** Recognize a local file even when Chrome requires the user to pick it again. */
export function isDirectLocalPdf(url) {
  return /^file:\/\/[^?#]*\.pdf(?:[?#]|$)/i.test(url);
}

/**
 * Detect if current page is a PDF page
 * @param {string} url - Page URL
 * @param {string} [tabUrl] - Tab URL (optional, for Chrome PDF viewer detection)
 * @param {string} [sourceContentType] - Browser-reported document MIME type
 * @returns {Object|null} {isPdf: true, originalUrl: string} or null
 */
export function detectPdfPage(url, tabUrl, sourceContentType) {
  if (isSupportedPdfSource(url)) {
    const isPdf = sourceContentType ? sourceContentType === 'application/pdf' : isPdfUrl(url);
    if (isPdf) return { isPdf: true, originalUrl: url };
    if (sourceContentType) return null;
  }
  if (!isChromePdfViewer(tabUrl)) return null;
  const originalUrl = new URL(tabUrl).searchParams.get('file');
  return { isPdf: true, originalUrl: isSupportedPdfSource(originalUrl) ? originalUrl : null };
}

/** Detect a top-level PDF, including URLs without a .pdf extension. */
export async function isPdfTab(tab) {
  if (!tab?.id) return false;
  if (isChromePdfViewer(tab.url) || isDirectLocalPdf(tab.url)) return true;
  if (!isSupportedPdfSource(tab.url)) return false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.contentType
    });
    const contentType = results?.[0]?.result;
    if (typeof contentType === 'string' && contentType) return contentType === 'application/pdf';
  } catch { /* Chrome can isolate the PDF viewer from injected scripts. */ }
  return isPdfTabWithoutContent(tab);
}

/** Fall back to tab metadata when the top-level document cannot be inspected. */
export async function isPdfTabWithoutContent(tab) {
  if (!tab?.id) return false;
  if (isChromePdfViewer(tab.url)) return true;
  if (!isSupportedPdfSource(tab.url)) return false;
  if (isPdfUrl(tab.url)) return true;
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    return Boolean(frames?.some(frame => frame.frameId === 0 && frame.url === tab.url) &&
      frames.some(frame => frame.parentFrameId === 0 && isChromePdfViewer(frame.url)));
  } catch {
    return false;
  }
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
      if (isSupportedPdfSource(frameUrl) && isPdfUrl(frameUrl)) {
        return frameUrl;
      }
    }
    
    // Alternative: try to get from tab history
    // This might not work in all cases, but worth trying
    const tab = await chrome.tabs.get(tabId);
    if (isSupportedPdfSource(tab?.url) && isPdfUrl(tab.url)) {
      return tab.url;
    }
    
    return null;
  } catch (error) {
    // webNavigation API might not be available or tab might be closed
    return null;
  }
}

