// @ts-check
// Image processing functions for extraction
// Handles image URL extraction, filtering, and featured image detection

import { toAbsoluteUrl, normalizeImageUrl, safeGetComputedStyle } from './dom-utils.js';

/**
 * Check if URL is a placeholder (base64 1x1 transparent pixel, etc.)
 * @param {string} url - URL to check
 * @returns {boolean} - True if URL is placeholder
 */
export function isPlaceholderUrl(url) {
  if (!url) return true;
  if (url.startsWith('data:image')) {
    if (url.includes('1x1') || url.includes('transparent') || url.length < 100) {
      return true;
    }
  }
  const placeholderPatterns = ['placeholder', 'spacer', 'blank', '1x1', 'pixel.gif'];
  const urlLower = url.toLowerCase();
  return placeholderPatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Extract best URL from srcset attribute
 * @param {string} srcset - srcset attribute value
 * @returns {string|null} - Best URL or null
 */
export function getBestSrcsetUrl(srcset) {
  if (!srcset) return null;
  const sources = srcset.split(',').map(s => s.trim());
  let bestUrl = null;
  let bestSize = 0;
  
  for (const source of sources) {
    const parts = source.trim().split(/\s+/);
    if (parts.length < 1) continue;
    const url = parts[0];
    if (isPlaceholderUrl(url)) continue;
    
    if (parts.length > 1) {
      const descriptor = parts[1];
      if (descriptor.endsWith('x')) {
        const multiplier = parseFloat(descriptor);
        if (multiplier > bestSize) {
          bestSize = multiplier;
          bestUrl = url;
        }
      } else if (descriptor.endsWith('w')) {
        const width = parseInt(descriptor);
        if (width > bestSize) {
          bestSize = width;
          bestUrl = url;
        }
      }
    } else {
      if (!bestUrl) bestUrl = url;
    }
  }
  
  return bestUrl;
}

/**
 * Extract best image URL from element (handles lazy loading, srcset, etc.)
 * @param {HTMLImageElement} imgElement - Image element
 * @returns {string|null} - Best image URL or null
 */
export function extractBestImageUrl(imgElement) {
  if (!imgElement) return null;
  
  let src = null;
  
  // Priority 1: currentSrc (browser's selected src from srcset)
  if (imgElement.currentSrc && imgElement.currentSrc.length > 0 && !isPlaceholderUrl(imgElement.currentSrc)) {
    src = imgElement.currentSrc;
  }
  
  // Priority 2: src attribute
  if (!src) {
    const imgSrc = imgElement.src || imgElement.getAttribute('src');
    if (imgSrc && imgSrc.length > 0 && !isPlaceholderUrl(imgSrc)) {
      src = imgSrc;
    }
  }
  
  // Priority 3: srcset
  if (!src) {
    const srcset = imgElement.getAttribute('srcset');
    if (srcset) {
      src = getBestSrcsetUrl(srcset);
    }
  }
  
  // Priority 4: picture element sources
  if (!src) {
    const picture = imgElement.closest('picture');
    if (picture) {
      for (const source of Array.from(picture.querySelectorAll('source[srcset]'))) {
        const srcset = source.getAttribute('srcset');
        if (srcset) {
          const candidate = getBestSrcsetUrl(srcset);
          if (candidate) {
            src = candidate;
            break;
          }
        }
      }
    }
  }
  
  // Priority 5: Lazy loading data attributes
  if (!src) {
    const dataAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 
                       'data-full-src', 'data-high-res', 'data-srcset', 'data-original-src'];
    for (const attr of dataAttrs) {
      const val = imgElement.getAttribute(attr);
      if (val && !val.includes('data:') && !isPlaceholderUrl(val)) {
        if (attr === 'data-srcset') {
          src = getBestSrcsetUrl(val);
        } else {
          src = val;
        }
        if (src) break;
      }
    }
  }
  
  // Priority 6: Parent link
  if (!src) {
    const parentLink = imgElement.closest('a[href]');
    if (parentLink) {
      const href = parentLink.getAttribute('href');
      if (href && (href.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || href.includes('image'))) {
        src = href;
      }
    }
  }
  
  return src;
}

/**
 * Check if image is tracking pixel
 * @param {Window} win - Window object
 * @param {HTMLImageElement} img - Image element
 * @returns {boolean} - True if image is tracking pixel
 */
export function isTrackingPixel(win, img) {
  // Check if hidden
  try {
    const style = safeGetComputedStyle(win, img);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
      const naturalWidth = img.naturalWidth || 0;
      const naturalHeight = img.naturalHeight || 0;
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
        return true;
      }
    }
  } catch (e) { }
  
  // Check dimensions
  const naturalWidth = img.naturalWidth || 0;
  const naturalHeight = img.naturalHeight || 0;
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
    return true;
  }
  
  // Check src for tracking patterns
  const src = (img.src || '').toLowerCase();
  const trackingPatterns = ['pixel', 'tracking', 'beacon', 'analytics', 'facebook.com/tr', 'doubleclick', 'googleads'];
  return trackingPatterns.some(pattern => src.includes(pattern));
}

/**
 * Check if image is decorative (logo, icon, author photo, etc.)
 * @param {Window} win - Window object
 * @param {HTMLImageElement} img - Image element
 * @param {string[]} logoPatterns - Logo URL patterns
 * @returns {boolean} - True if image is decorative
 */
export function isDecorativeImage(win, img, logoPatterns) {
  if (!img) return false;
  
  const src = (img.src || '').toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = String(img.className || '').toLowerCase();
  const id = (img.id || '').toLowerCase();
  
  // Author headshots/photos
  if (className.includes('headshot') || id.includes('headshot') ||
      className.includes('author-photo') || className.includes('author-image') ||
      className.includes('byline-thumbnail') || className.includes('contributor-thumbnail')) {
    return true;
  }
  
  // Check if in contributor/author section
  let checkParent = img.parentElement;
  for (let i = 0; i < 5 && checkParent; i++) {
    const parentClass = String(checkParent.className || '').toLowerCase();
    const parentId = (checkParent.id || '').toLowerCase();
    
    if (parentClass.includes('contributor') || parentClass.includes('byline') ||
        parentClass.includes('author-info') || parentClass.includes('author-bio')) {
      const naturalWidth = img.naturalWidth || img.width || 0;
      const naturalHeight = img.naturalHeight || img.height || 0;
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 150 && naturalHeight <= 150) {
        return true;
      }
    }
    checkParent = checkParent.parentElement;
  }
  
  // Avatar images
  if (alt && (alt.includes("'s avatar") || alt.includes(' avatar') || alt === 'avatar')) {
    const naturalWidth = img.naturalWidth || img.width || 0;
    const naturalHeight = img.naturalHeight || img.height || 0;
    if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
      return true;
    }
  }
  
  // Logo/brand patterns in URL
  if (logoPatterns.some(pattern => src.includes(pattern.toLowerCase()))) {
    return true;
  }
  
  // Logo patterns in alt/class/id
  if (alt && (alt.includes('logo') || alt.includes('icon') || alt.includes('brand') || alt.includes('social'))) {
    return true;
  }
  if (className.includes('logo') || className.includes('icon') || className.includes('brand') ||
      className.includes('social') || className.includes('share')) {
    return true;
  }
  
  // Very small dimensions (likely icons)
  const naturalWidth = img.naturalWidth || img.width || 0;
  const naturalHeight = img.naturalHeight || img.height || 0;
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
    if (src.includes('icon') || src.includes('logo') || src.includes('social')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get image caption from nearby elements
 * @param {HTMLImageElement} img - Image element
 * @returns {string} - Caption text or empty string
 */
export function getImageCaption(img) {
  // Check for figcaption in figure
  const figure = img.closest('figure');
  if (figure) {
    const figcaption = figure.querySelector('figcaption');
    if (figcaption) return (figcaption.textContent || '').trim();
  }
  
  // Check aria-label or title
  const ariaLabel = img.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  
  const title = img.getAttribute('title');
  if (title && title.trim() && title !== img.alt) return title.trim();
  
  // Check next sibling
  const nextSibling = img.nextElementSibling;
  if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
    return (nextSibling.textContent || '').trim();
  }
  
  // Check for caption in parent
  const parent = img.parentElement;
  if (parent) {
    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption');
    if (captionEl) {
      const captionText = (captionEl.textContent || '').trim();
      if (captionText && captionText !== img.alt) return captionText;
    }
  }
  
  return '';
}

/**
 * Extract featured image from page
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @param {Element|null} mainContent - Main content element
 * @param {string[]} logoPatterns - Logo URL patterns
 * @returns {{src: string, alt: string, caption: string}|null} - Featured image or null
 */
export function extractFeaturedImage(doc, baseUrl, mainContent, logoPatterns) {
  const featuredImageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="article:image"]',
    'meta[name="image"]',
    '[itemprop="image"]'
  ];
  
  // Try meta tags first
  for (const selector of featuredImageSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        const content = element.tagName === 'META' 
          ? element.getAttribute('content') 
          : (element instanceof HTMLImageElement ? element.src : element.getAttribute('src'));
        
        if (content) {
          const absoluteUrl = toAbsoluteUrl(content, baseUrl);
          // Skip if looks like logo/icon
          const urlLower = absoluteUrl.toLowerCase();
          if (!logoPatterns.some(pattern => urlLower.includes(pattern.toLowerCase()))) {
            return { src: absoluteUrl, alt: '', caption: '' };
          }
        }
      }
    } catch (e) { }
  }
  
  // Fallback: first large image before first paragraph in main content
  if (mainContent) {
    const firstParagraph = mainContent.querySelector('p');
    const images = mainContent.querySelectorAll('img');

    for (const img of Array.from(images)) {
      // Stop if we passed the first paragraph
      if (firstParagraph && img.compareDocumentPosition(firstParagraph) & Node.DOCUMENT_POSITION_PRECEDING) {
        break;
      }
      
      const imgElement = /** @type {HTMLImageElement} */ (img);
      const src = extractBestImageUrl(imgElement);
      if (!src) continue;
      
      // Check dimensions
      const naturalWidth = imgElement.naturalWidth || 0;
      const naturalHeight = imgElement.naturalHeight || 0;
      
      // Must be reasonably large
      if (naturalWidth >= 400 || naturalHeight >= 300 || (naturalWidth === 0 && naturalHeight === 0)) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl);
        const urlLower = absoluteUrl.toLowerCase();
        
        // Skip logos
        if (logoPatterns.some(pattern => urlLower.includes(pattern.toLowerCase()))) {
          continue;
        }
        
        return {
          src: absoluteUrl,
          alt: imgElement.alt || '',
          caption: getImageCaption(imgElement)
        };
      }
    }
  }
  
  return null;
}
