// @ts-check
// Image processing functions for extraction
// Handles image URL extraction, filtering, and featured image detection

import { toAbsoluteUrl, normalizeImageUrl, safeGetComputedStyle, cloneWithoutLinkAnnouncements } from './dom-utils.js';

/**
 * Check if URL is a placeholder (base64 1x1 transparent pixel, etc.)
 * @param {string} url - URL to check
 * @returns {boolean} - True if URL is placeholder
 */
export function isPlaceholderUrl(url) {
  if (!url) return true;
  if (/^data:image\/(?:png|gif);base64,/i.test(url)) {
    try {
      const bytes = atob(url.slice(url.indexOf(',') + 1));
      if (bytes.startsWith('GIF8') && bytes.length >= 10) {
        const width = bytes.charCodeAt(6) | (bytes.charCodeAt(7) << 8);
        const height = bytes.charCodeAt(8) | (bytes.charCodeAt(9) << 8);
        return width > 0 && height > 0 && width <= 3 && height <= 3;
      }
      if (bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.length >= 24) {
        const read32 = offset => ((bytes.charCodeAt(offset) * 0x1000000) +
          (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3));
        const width = read32(16), height = read32(20);
        return width > 0 && height > 0 && width <= 3 && height <= 3;
      }
    } catch (_) { }
    return false;
  }
  try {
    const basename = decodeURIComponent(new URL(url, 'https://example.invalid/').pathname.split('/').pop() || '');
    return /^(?:placeholder|spacer|blank|transparent|1x1|pixel)\.(?:gif|png|svg|webp)$/i.test(basename);
  } catch (_) { return false; }
}

export function isDecorativeImageUrl(url, patterns) {
  try {
    const basename = decodeURIComponent(new URL(url, 'https://example.invalid/').pathname.split('/').pop() || '').toLowerCase();
    const roles = new Set(['logo', 'favicon', 'icon', 'avatar', 'sprite', 'spacer', 'social-icon', 'share-icon', 'share-button']);
    return (patterns || []).some(pattern => roles.has(pattern.toLowerCase()) &&
      new RegExp(`(?:^|[_.-])${pattern}(?:$|[_.-])`, 'i').test(basename));
  } catch (_) { return false; }
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

  for (const attr of ['data-full-src', 'data-high-res', 'data-original-src', 'data-srcset', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy']) {
    const value = imgElement.getAttribute(attr);
    const candidate = attr === 'data-srcset' ? getBestSrcsetUrl(value) : value;
    if (candidate && !isPlaceholderUrl(candidate)) return candidate;
  }
  
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
 * Read decoded dimensions only when they describe the resource selected for export.
 * @param {HTMLImageElement} img
 * @returns {{width: number, height: number, matchesSource: boolean}}
 */
export function getSelectedImageNaturalSize(img) {
  const selectedSource = extractBestImageUrl(img);
  const loadedSource = img.currentSrc || img.src || '';
  const matches = !selectedSource || normalizeImageUrl(toAbsoluteUrl(selectedSource, img.ownerDocument.baseURI)) ===
    normalizeImageUrl(toAbsoluteUrl(loadedSource, img.ownerDocument.baseURI));
  return {
    width: matches ? (img.naturalWidth || 0) : 0,
    height: matches ? (img.naturalHeight || 0) : 0,
    matchesSource: matches
  };
}

/**
 * Check if image is tracking pixel
 * @param {Window} win - Window object
 * @param {HTMLImageElement} img - Image element
 * @returns {boolean} - True if image is tracking pixel
 */
export function isTrackingPixel(win, img) {
  const selectedSource = extractBestImageUrl(img);
  const { width: naturalWidth, height: naturalHeight } = getSelectedImageNaturalSize(img);

  // Check if hidden
  try {
    const style = safeGetComputedStyle(win, img);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
        return true;
      }
    }
  } catch (e) { }
  
  // Check dimensions
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 3 && naturalHeight <= 3) {
    return true;
  }
  
  // Check src for tracking patterns
  try {
    const url = new URL(selectedSource || img.src || '', img.ownerDocument.baseURI);
    return /(?:^|\.)doubleclick\.net$/i.test(url.hostname) ||
      /(?:^|\.)googleadservices\.com$/i.test(url.hostname) ||
      (/(?:^|\.)facebook\.com$/i.test(url.hostname) && /^\/tr\/?$/i.test(url.pathname));
  } catch (_) { return false; }
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
  
  const src = (extractBestImageUrl(img) || img.src || '').toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = String(img.className || '').toLowerCase();
  const id = (img.id || '').toLowerCase();
  const naturalSize = getSelectedImageNaturalSize(img);
  const naturalWidth = naturalSize.width || (naturalSize.matchesSource ? img.width : Number(img.getAttribute('width'))) || 0;
  const naturalHeight = naturalSize.height || (naturalSize.matchesSource ? img.height : Number(img.getAttribute('height'))) || 0;

  if (img.getAttribute('role') === 'separator') return true;
  if (naturalWidth > 0 && naturalHeight > 0 &&
      ((naturalWidth > 3 && naturalHeight <= 3) || (naturalHeight > 3 && naturalWidth <= 3))) {
    return true;
  }
  
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
      if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 150 && naturalHeight <= 150) {
        return true;
      }
    }
    checkParent = checkParent.parentElement;
  }
  
  // Avatar images
  if (alt && (alt.includes("'s avatar") || alt.includes(' avatar') || alt === 'avatar')) {
    if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
      return true;
    }
  }
  
  // Logo/brand patterns in URL
  if (isDecorativeImageUrl(src, logoPatterns)) {
    return true;
  }
  
  // Logo patterns in alt/class/id
  if (/^(?:(?:site|company|brand|social)\s+)?(?:logo|icon)$/i.test(alt)) {
    return true;
  }
  if (/(?:^|[\s_-])(?:logo|icon|avatar|social-icon|share-icon|share-button)(?:$|[\s_-])/.test(className)) {
    return true;
  }
  
  // Very small dimensions (likely icons)
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
 * @param {WeakSet<Element>|null} [captionOwners] - Captions consumed by this image choice
 * @returns {string} - Caption text or empty string
 */
export function getImageCaption(img, captionOwners = null) {
  const captionText = element => (cloneWithoutLinkAnnouncements(element).textContent || '').trim();
  // Check for figcaption in figure
  const figure = img.closest('figure');
  if (figure) {
    const figcaption = figure.querySelector('figcaption');
    if (figcaption) {
      captionOwners?.add(figcaption);
      return captionText(figcaption);
    }
  }
  
  // Check aria-label or title
  const ariaLabel = img.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  
  const title = img.getAttribute('title');
  if (title && title.trim() && title !== img.alt) return title.trim();
  
  // Check next sibling
  const nextSibling = img.nextElementSibling;
  if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
    return captionText(nextSibling);
  }
  
  // Check for caption in parent
  const parent = img.parentElement;
  if (parent) {
    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption');
    if (captionEl) {
      const text = captionText(captionEl);
      if (text && text !== img.alt) return text;
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
 * @param {WeakSet<Element>|null} [captionOwners] - Captions consumed by the chosen image
 * @returns {{src: string, alt: string, caption: string}|null} - Featured image or null
 */
export function extractFeaturedImage(doc, baseUrl, mainContent, logoPatterns, captionOwners = null) {
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
          if (!isDecorativeImageUrl(absoluteUrl, logoPatterns)) {
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
      const { width: naturalWidth, height: naturalHeight } = getSelectedImageNaturalSize(imgElement);
      
      // Must be reasonably large
      if (naturalWidth >= 400 || naturalHeight >= 300 || (naturalWidth === 0 && naturalHeight === 0)) {
        const absoluteUrl = toAbsoluteUrl(src, baseUrl);
        // Apply the same decorative-image rules as the body parser.
        if (isDecorativeImage(doc.defaultView, imgElement, logoPatterns)) {
          continue;
        }
        
        return {
          src: absoluteUrl,
          alt: imgElement.alt || '',
          caption: getImageCaption(imgElement, captionOwners)
        };
      }
    }
  }
  
  return null;
}

/**
 * Preserve readable references and static previews for article media embeds.
 * @param {Element} element
 * @returns {import('./types.js').ContentItem[]}
 */
export function getEmbeddedMediaItems(element) {
  if (!element || !['IFRAME', 'VIDEO', 'AUDIO'].includes(element.tagName)) return [];
  const base = element.ownerDocument.baseURI;
  const safeUrl = value => {
    if (!value || !value.trim()) return null;
    try {
      const url = new URL(value, base);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch (_) { return null; }
  };
  const source = safeUrl(element.getAttribute('src') || element.querySelector('source[src]')?.getAttribute('src'));
  if (!source) return [];
  const escape = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const label = (element.getAttribute('title') || element.getAttribute('aria-label') || '').trim() || source.href;
  let preview = element.tagName === 'VIDEO' ? safeUrl(element.getAttribute('poster'))?.href : null;
  if (element.tagName === 'IFRAME' && source.hostname === 'datawrapper.dwcdn.net') {
    const chart = source.pathname.match(/^\/([A-Za-z0-9]{5})\/(?:\d+\/?)?$/);
    if (chart) preview = `https://datawrapper.dwcdn.net/${chart[1]}/full.png`;
  }
  /** @type {import('./types.js').ContentItem[]} */
  const items = [];
  if (preview) items.push({ type: 'image', src: preview, alt: label, caption: '' });
  items.push({ type: 'paragraph', text: label,
    html: `<a href="${escape(source.href)}">${escape(label)}</a>` });
  return items;
}
