// Utility functions for content extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Convert relative URL to absolute
 * @param {string} url - URL to convert
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string} Absolute URL
 */
export function toAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  try { 
    return new URL(url, baseUrl).href; 
  } catch (e) { 
    return url; 
  }
}

/**
 * Check if element is a footnote link (number or arrow that links to #)
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is a footnote link
 */
export function isFootnoteLink(element) {
  if (element.tagName.toLowerCase() !== 'a') return false;
  const href = element.getAttribute('href') || '';
  // Check if it's a link to an anchor (#) or contains #note
  if (href === '#' || (href.startsWith('#') && href.length > 1) || href.includes('#note')) {
    const text = element.textContent.trim();
    // Check if it's just a number or arrow symbol
    if (/^[\d\s]+$/.test(text) || /^[←→↑↓↗↘↩]+$/.test(text) || text.toLowerCase().includes('open these')) {
      return true;
    }
    // Check if it contains only an emoji arrow image
    const img = element.querySelector('img');
    if (img && (img.alt === '↩' || img.src.includes('emoji') || String(img.className || '').includes('emoji'))) {
      return true;
    }
  }
  return false;
}

/**
 * Check if element is an icon (SVG or icon font)
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is an icon
 */
export function isIcon(element) {
  const tagName = element.tagName.toLowerCase();
  // SVG elements are icons
  if (tagName === 'svg') return true;
  
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // Check for icon classes
  if (className.includes('icon-') || className.includes('icon') || id.includes('icon')) {
    return true;
  }
  
  // Check if it's a span/div/i/em/sup with only arrow symbols or very short text
  if (tagName === 'span' || tagName === 'i' || tagName === 'em' || tagName === 'sup') {
    const text = element.textContent.trim();
    // If it's very short (1-3 chars) and contains arrow symbols, it's likely an icon
    if (text.length <= 3 && /[←→↑↓↗↘◀▶▲▼↩]/.test(text)) {
      return true;
    }
    // Check for "open these" text in sup elements
    if (tagName === 'sup' && text.toLowerCase().includes('open these')) {
      return true;
    }
  }
  
  // Check for emoji arrow images
  if (tagName === 'img') {
    const alt = (element.alt || '').trim();
    const src = (element.src || '').toLowerCase();
    if (alt === '↩' || /[←→↑↓↗↘↩]/.test(alt) || (src.includes('emoji') && alt.includes('arrow'))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalize image URL for comparison (remove query params, fragments)
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeImageUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    // Return base URL without query params and fragments
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    // If URL parsing fails, try simple string manipulation
    return url.split('?')[0].split('#')[0];
  }
}


