// @ts-check
// DOM utility functions for extraction
// URL handling, DOM order comparison, computed style helpers

/**
 * Convert relative URL to absolute URL
 * Handles data: URLs, http(s) URLs, and relative paths
 * @param {string} url - URL to convert
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string} - Absolute URL or original if already absolute
 */
export function toAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  // Data URLs and absolute URLs are returned as-is
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  try { 
    return new URL(url, baseUrl).href; 
  } catch (e) { 
    // Graceful degradation: return original URL if resolution fails
    return url; 
  }
}

/**
 * Normalize image URL for deduplication
 * Strips query params and hash to compare actual image paths
 * @param {string} url - Image URL to normalize
 * @returns {string} - Normalized URL (origin + pathname only)
 */
export function normalizeImageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (e) {
    // Fallback: split by query and hash manually
    return url.split('?')[0].split('#')[0];
  }
}

/**
 * Compare two elements by DOM order
 * Used for sorting elements to maintain document order
 * @param {Element} a - First element
 * @param {Element} b - Second element
 * @returns {number} - -1 if a before b, 1 if b before a, 0 if same
 */
export function compareDomOrder(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    // b follows a, so a comes first
    return -1;
  }
  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    // b precedes a, so b comes first
    return 1;
  }
  return 0;
}

/**
 * Safely get computed style for an element
 * Wraps getComputedStyle in try/catch to handle cross-origin and detached elements
 * @param {Window} win - Window object
 * @param {Element} element - Element to get style for
 * @returns {CSSStyleDeclaration|null} - Computed style or null on error
 */
export function safeGetComputedStyle(win, element) {
  try {
    return win.getComputedStyle(element);
  } catch (e) {
    return null;
  }
}

/**
 * Check if element is visible (not hidden by CSS)
 * Checks display, visibility, width, and height
 * @param {Window} win - Window object  
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is visible
 */
export function isElementVisible(win, element) {
  const style = safeGetComputedStyle(win, element);
  if (!style) return true; // Assume visible if can't get style
  
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  
  // Check for zero dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  return true;
}

/**
 * Get element's closest parent matching a selector
 * Safe wrapper around Element.closest()
 * @param {Element} element - Starting element
 * @param {string} selector - CSS selector
 * @returns {Element|null} - Matching ancestor or null
 */
export function safeClosest(element, selector) {
  try {
    return element.closest(selector);
  } catch (e) {
    return null;
  }
}

/**
 * Check if element has specified parent type within depth limit
 * Used to check if element is inside specific container types
 * @param {Element} element - Starting element
 * @param {string} tagName - Parent tag name to look for
 * @param {number} maxDepth - Maximum depth to search
 * @returns {boolean} - True if parent found within depth
 */
export function hasParentOfType(element, tagName, maxDepth = 5) {
  let current = element.parentElement;
  let depth = 0;
  const upperTag = tagName.toUpperCase();
  
  while (current && depth < maxDepth) {
    if (current.tagName === upperTag) {
      return true;
    }
    current = current.parentElement;
    depth++;
  }
  
  return false;
}

/**
 * Get text content from element with whitespace normalization
 * @param {Element} element - Element to get text from
 * @returns {string} - Normalized text content
 */
export function getTextContent(element) {
  return (element.textContent || '').trim().replace(/\s+/g, ' ');
}

/**
 * Check if element is in viewport (visible area)
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is at least partially in viewport
 */
export function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}
