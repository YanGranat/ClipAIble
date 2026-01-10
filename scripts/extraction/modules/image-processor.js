// @ts-check
// Image processing functions for automatic extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Check if URL is a placeholder (base64 1x1 transparent pixel, etc.)
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is a placeholder
 */
export function isPlaceholderUrlModule(url) {
  if (!url) return true;
  if (url.startsWith('data:image')) {
    // Check if it's a 1x1 transparent pixel
    if (url.includes('1x1') || url.includes('transparent') || url.length < 100) {
      return true;
    }
  }
  // Check for common placeholder patterns
  const placeholderPatterns = ['placeholder', 'spacer', 'blank', '1x1', 'pixel.gif'];
  const urlLower = url.toLowerCase();
  return placeholderPatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Extract best URL from srcset attribute
 * @param {string} srcset - srcset attribute value
 * @param {import('../../types.js').IsPlaceholderUrlFunction} isPlaceholderUrl - Function to check if URL is placeholder
 * @returns {string|null} Best URL or null
 */
export function getBestSrcsetUrlModule(srcset, isPlaceholderUrl) {
  if (!srcset) return null;
  // Parse srcset: "url1 1x, url2 2x" or "url1 100w, url2 200w"
  const sources = srcset.split(',').map(s => s.trim());
  let bestUrl = null;
  let bestSize = 0;
  
  for (const source of sources) {
    const parts = source.trim().split(/\s+/);
    if (parts.length < 1) continue;
    const url = parts[0];
    if (isPlaceholderUrl(url)) continue;
    
    // Try to extract size descriptor
    if (parts.length > 1) {
      const descriptor = parts[1];
      // Handle "2x" or "200w" format
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
      // No descriptor, use as fallback if no better option
      if (!bestUrl) bestUrl = url;
    }
  }
  
  return bestUrl;
}

/**
 * Extract best image URL from element (handles lazy loading, srcset, etc.)
 * @param {HTMLImageElement} imgElement - Image element
 * @param {import('../../types.js').IsPlaceholderUrlFunction} isPlaceholderUrl - Function to check if URL is placeholder
 * @param {import('../../types.js').GetBestSrcsetUrlFunction} getBestSrcsetUrl - Function to extract best URL from srcset
 * @returns {string|null} Best image URL or null
 */
export function extractBestImageUrlModule(imgElement, isPlaceholderUrl, getBestSrcsetUrl) {
  if (!imgElement) return null;
  
  let src = null;
  
  // Priority 1: currentSrc (browser's selected src from srcset)
  // But only if it's not empty (some browsers set currentSrc to empty string for unloaded images)
  if (imgElement.currentSrc && imgElement.currentSrc.length > 0 && !isPlaceholderUrl(imgElement.currentSrc)) {
    src = imgElement.currentSrc;
  }
  
  // Priority 2: src attribute (if not placeholder)
  // This is critical for images that haven't loaded yet (currentSrc may be empty)
  // Also important for Smithsonian and similar sites where currentSrc can be empty but src is valid
  if (!src) {
    const imgSrc = imgElement.src || imgElement.getAttribute('src');
    if (imgSrc && imgSrc.length > 0 && !isPlaceholderUrl(imgSrc)) {
      src = imgSrc;
    }
  }
  
  // Priority 3: srcset (extract best quality)
  if (!src) {
    const srcset = imgElement.getAttribute('srcset');
    if (srcset) {
      src = getBestSrcsetUrl(srcset, isPlaceholderUrl);
    }
  }
  
  // Priority 4: Check picture element sources
  if (!src) {
    const picture = imgElement.closest('picture');
    if (picture) {
      for (const source of Array.from(picture.querySelectorAll('source[srcset]'))) {
        const srcset = source.getAttribute('srcset');
        if (srcset) {
          const candidate = getBestSrcsetUrl(srcset, isPlaceholderUrl);
          if (candidate) {
            src = candidate;
            break;
          }
        }
      }
    }
  }
  
  // Priority 5: Lazy loading data attributes (check all data-* attributes containing src)
  if (!src) {
    const dataAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 
                       'data-full-src', 'data-high-res', 'data-srcset', 'data-original-src'];
    for (const attr of dataAttrs) {
      const val = imgElement.getAttribute(attr);
      if (val && !val.includes('data:') && !isPlaceholderUrl(val)) {
        if (attr === 'data-srcset') {
          src = getBestSrcsetUrl(val, isPlaceholderUrl);
        } else {
          src = val;
        }
        if (src) break;
      }
    }
  }
  
  // Priority 6: Check parent link (some sites wrap images in links)
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
 * @param {HTMLImageElement} img - Image element
 * @returns {boolean} True if image is likely a tracking pixel
 */
export function isTrackingPixelModule(img) {
  // Check if element is hidden (tracking pixels are often hidden)
  try {
    const style = window.getComputedStyle(img);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      // If hidden and very small, likely a tracking pixel
      // Use both natural and CSS dimensions (natural may be 0 for unloaded images)
      const naturalWidth = img.naturalWidth || 0;
      const naturalHeight = img.naturalHeight || 0;
      const cssWidth = parseInt(style.width) || img.width || 0;
      const cssHeight = parseInt(style.height) || img.height || 0;
      
      // Only exclude if BOTH natural and CSS dimensions are very small
      if (naturalWidth > 0 && naturalHeight > 0) {
        if (naturalWidth <= 3 && naturalHeight <= 3) return true;
      } else if (cssWidth > 0 && cssHeight > 0) {
        // If natural dimensions not available, check CSS
        if (cssWidth <= 3 && cssHeight <= 3) return true;
      }
    }
  } catch (e) {
    // Continue if getComputedStyle fails
  }
  
  // Check dimensions - use natural if available, otherwise CSS
  const naturalWidth = img.naturalWidth || 0;
  const naturalHeight = img.naturalHeight || 0;
  const cssWidth = img.width || 0;
  const cssHeight = img.height || 0;
  
  // Only exclude if we have dimensions and they're very small
  if (naturalWidth > 0 && naturalHeight > 0) {
    if (naturalWidth <= 3 && naturalHeight <= 3) return true;
  } else if (cssWidth > 0 && cssHeight > 0) {
    // If natural dimensions not available, check CSS (but be more lenient)
    if (cssWidth <= 1 && cssHeight <= 1) return true;
  }
  
  const src = (img.src || '').toLowerCase();
  const trackingPatterns = ['pixel', 'tracking', 'beacon', 'analytics', 'facebook.com/tr', 'doubleclick', 'googleads'];
  return trackingPatterns.some(pattern => src.includes(pattern));
}

/**
 * Check if image is decorative (logo, icon, brand image, author photo, etc.)
 * This is a large function that checks many conditions
 * @param {HTMLImageElement} img - Image element
 * @param {{LOGO_PATTERNS: Array<string|RegExp>, [key: string]: any}} constants - Constants object with LOGO_PATTERNS
 * @returns {boolean} True if image is decorative
 */
export function isDecorativeImageModule(img, constants) {
  if (!img) return false;
  
  const { LOGO_PATTERNS } = constants;
  
  const src = (img.src || '').toLowerCase();
  const alt = (img.alt || '').toLowerCase();
  const className = String(img.className || '').toLowerCase();
  const id = (img.id || '').toLowerCase();
  
  // CRITICAL: Exclude author headshots/photos
  // Check for headshot class (common pattern for author photos)
  if (className.includes('headshot') || id.includes('headshot') ||
      className.includes('author-photo') || className.includes('author-image') ||
      className.includes('author-avatar') || id.includes('author-photo') ||
      id.includes('author-image') || id.includes('author-avatar') ||
      className.includes('byline-thumbnail') || className.includes('byline-thumb') ||
      className.includes('contributor-thumbnail') || className.includes('contributor-thumb') ||
      className.includes('rich-byline') || className.includes('wp-post-image') ||
      id.includes('byline-thumbnail') || id.includes('contributor-thumbnail')) {
    return true;
  }
  
  // Check if image is in a contributors/authors section
  let checkParent = img.parentElement;
  for (let i = 0; i < 5 && checkParent; i++) {
    const parentClass = String(checkParent.className || '').toLowerCase();
    const parentId = (checkParent.id || '').toLowerCase();
    const parentTag = checkParent.tagName.toLowerCase();
    
    // Check for contributor/author sections
    if (parentClass.includes('contributor') || parentClass.includes('contributors') ||
        parentClass.includes('byline') || parentClass.includes('author-info') ||
        parentClass.includes('author-bio') || parentClass.includes('author-meta') ||
        parentId.includes('contributor') || parentId.includes('contributors') ||
        parentId.includes('byline') || parentId.includes('author-info') ||
        parentTag === 'address' || parentClass.includes('vcard')) {
      // Check if image is small (typical for author thumbnails)
      const naturalWidth = img.naturalWidth || img.width || 0;
      const naturalHeight = img.naturalHeight || img.height || 0;
      if (naturalWidth > 0 && naturalHeight > 0) {
        // Author thumbnails are typically small (50-150px)
        if (naturalWidth <= 150 && naturalHeight <= 150) {
          return true; // It's an author thumbnail
        }
      } else {
        // If dimensions not available, check CSS dimensions
        const cssWidth = parseInt(img.style.width) || img.width || 0;
        const cssHeight = parseInt(img.style.height) || img.height || 0;
        if (cssWidth > 0 && cssHeight > 0 && cssWidth <= 150 && cssHeight <= 150) {
          return true;
        }
      }
      // Even if larger, if it's in contributor section and has empty alt, likely author photo
      if (!alt || alt.length === 0) {
        return true;
      }
    }
    checkParent = checkParent.parentElement;
  }
  
  // Check if alt text is just an author name (not a descriptive caption)
  // Author photos typically have alt text that's just the name OR empty alt
  // Also check for empty alt in contributor sections
  if (!alt || alt.length === 0) {
    // Empty alt in contributor/author section = likely author thumbnail
    let parent = img.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentClass = String(parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();
      if (parentClass.includes('contributor') || parentClass.includes('contributors') ||
          parentClass.includes('byline') || parentClass.includes('author-info') ||
          parentClass.includes('author-bio') || parentClass.includes('author-meta') ||
          parentId.includes('contributor') || parentId.includes('byline')) {
        // Check if image is small (typical for author thumbnails)
        const naturalWidth = img.naturalWidth || img.width || 0;
        const naturalHeight = img.naturalHeight || img.height || 0;
        if (naturalWidth > 0 && naturalHeight > 0) {
          if (naturalWidth <= 150 && naturalHeight <= 150) {
            return true; // Small image with empty alt in contributor section
          }
        } else {
          // Check CSS dimensions
          const cssWidth = parseInt(img.style.width) || img.width || 0;
          const cssHeight = parseInt(img.style.height) || img.height || 0;
          if (cssWidth > 0 && cssHeight > 0 && cssWidth <= 150 && cssHeight <= 150) {
            return true;
          }
        }
      }
      parent = parent.parentElement;
    }
  } else if (alt.length > 0 && alt.length < 100) {
    // Check if it looks like just a name (2-4 words, starts with capital, no descriptive text)
    // Pattern: "FirstName LastName" or "FirstName MiddleName LastName"
    const namePattern = /^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/;
    if (namePattern.test(alt.trim())) {
      // Check if it's inside an author section OR if it has headshot class
      // (headshot class is a strong indicator even without parent check)
      if (className.includes('headshot') || id.includes('headshot') ||
          className.includes('byline-thumbnail') || className.includes('contributor-thumbnail')) {
        return true; // Definitely an author photo
      }
      
      // Check if it's inside an author section
      let parent = img.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const parentClass = String(parent.className || '').toLowerCase();
        const parentId = (parent.id || '').toLowerCase();
        const parentTag = parent.tagName.toLowerCase();
        if (parentClass.includes('author') || parentId.includes('author') ||
            parentClass.includes('byline') || parentId.includes('byline') ||
            parentClass.includes('headshot') || parentId.includes('headshot') ||
            parentClass.includes('contributor') || parentId.includes('contributor') ||
            parentTag === 'address' || parentClass.includes('vcard') ||
            parentClass.includes('author-info') || parentClass.includes('author-bio')) {
          return true; // It's an author photo
        }
        parent = parent.parentElement;
      }
      
      // Also check if image is small and square/portrait (typical author photo size)
      const naturalWidth = img.naturalWidth || img.width || 0;
      const naturalHeight = img.naturalHeight || img.height || 0;
      if (naturalWidth > 0 && naturalHeight > 0) {
        if ((naturalWidth <= 250 && naturalHeight <= 250) && 
            (naturalWidth === naturalHeight || Math.abs(naturalWidth - naturalHeight) < 50)) {
          // Small square/portrait image with name as alt - likely author photo
          return true;
        }
      }
    }
  }
  
  // Check for small author photos (typically 200x200, 160x80, etc.)
  const naturalWidth = img.naturalWidth || img.width || 0;
  const naturalHeight = img.naturalHeight || img.height || 0;
  if (naturalWidth > 0 && naturalHeight > 0) {
    // Author photos are typically square or portrait, small to medium size
    // Check if it's a small square/portrait image (likely author photo)
    if ((naturalWidth <= 250 && naturalHeight <= 250) && 
        (naturalWidth === naturalHeight || Math.abs(naturalWidth - naturalHeight) < 50)) {
      // Check if it's in an author section or has author-related attributes
      let parent = img.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        const parentClass = String(parent.className || '').toLowerCase();
        const parentId = (parent.id || '').toLowerCase();
        if (parentClass.includes('author') || parentId.includes('author') ||
            parentClass.includes('byline') || parentId.includes('byline')) {
          return true; // Likely author photo
        }
        parent = parent.parentElement;
      }
    }
  }
  
  // CRITICAL: Exclude avatar images (facepile, user avatars, etc.)
  // First check if image is in a facepile/likes/restacks section
  let checkParentForFacepile = img.parentElement;
  for (let i = 0; i < 6 && checkParentForFacepile; i++) {
    const parentClass = String(checkParentForFacepile.className || '').toLowerCase();
    const parentId = (checkParentForFacepile.id || '').toLowerCase();
    const parentText = checkParentForFacepile.textContent || '';
    
    // Check for facepile, likes, restacks, engagement indicators
    if (parentClass.includes('facepile') || parentId.includes('facepile') ||
        parentClass.includes('likes') || parentClass.includes('restacks') ||
        parentClass.includes('engagement') || parentClass.includes('reactions') ||
        parentText.includes('Likes') || parentText.includes('Restacks') ||
        parentText.includes('likes') || parentText.includes('restacks')) {
      // If in facepile section, exclude small images (avatars)
      const naturalWidth = img.naturalWidth || img.width || 0;
      const naturalHeight = img.naturalHeight || img.height || 0;
      const cssWidth = parseInt(img.style.width) || img.width || 0;
      const cssHeight = parseInt(img.style.height) || img.height || 0;
      
      if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 100 && naturalHeight <= 100) ||
          (cssWidth > 0 && cssHeight > 0 && cssWidth <= 100 && cssHeight <= 100)) {
        return true; // Avatar in facepile section
      }
    }
    checkParentForFacepile = checkParentForFacepile.parentElement;
  }
  
  // Check alt text for "avatar" pattern (e.g., "Tom's avatar", "user avatar")
  if (alt && (alt.includes("'s avatar") || alt.includes("'s avatar") || 
              alt.includes(' avatar') || alt === 'avatar' || alt.endsWith('avatar'))) {
    // Also check dimensions - avatars are typically small (<= 50px)
    const naturalWidth = img.naturalWidth || img.width || 0;
    const naturalHeight = img.naturalHeight || img.height || 0;
    const cssWidth = parseInt(img.style.width) || img.width || 0;
    const cssHeight = parseInt(img.style.height) || img.height || 0;
    
    // If it's clearly an avatar (alt contains "avatar") and small, exclude it
    if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) ||
        (cssWidth > 0 && cssHeight > 0 && cssWidth <= 50 && cssHeight <= 50)) {
      return true; // Small avatar image
    }
    // Even if larger, if alt explicitly says "avatar", it's likely decorative
    if (alt.toLowerCase().includes("'s avatar") || alt.toLowerCase().endsWith(' avatar')) {
      return true;
    }
  }
  
  // Check for logo/brand patterns in URL (use constants)
  if (LOGO_PATTERNS.some(pattern => {
    if (typeof pattern === 'string') {
      return src.includes(pattern);
    } else if (pattern instanceof RegExp) {
      return pattern.test(src);
    }
    return false;
  })) {
    return true;
  }
  
  // Check for logo patterns in alt text
  if (alt && (alt.includes('logo') || alt.includes('icon') || alt.includes('brand') || 
              alt.includes('social') || alt.includes('share') || alt.includes('button'))) {
    // But allow if it's clearly a content image (e.g., "Photo of company logo on building")
    if (alt.length > 30 && (alt.includes('photo') || alt.includes('image') || alt.includes('picture'))) {
      return false; // Likely content image
    }
    return true;
  }
  
  // Check for logo patterns in class/id
  if (className.includes('logo') || className.includes('icon') || className.includes('brand') ||
      className.includes('social') || className.includes('share') || className.includes('button') ||
      id.includes('logo') || id.includes('icon') || id.includes('brand') ||
      id.includes('social') || id.includes('share') || id.includes('button')) {
    return true;
  }
  
  // Check for very small dimensions (e.g., social media icons, UI elements)
  if (naturalWidth > 0 && naturalHeight > 0 && naturalWidth <= 50 && naturalHeight <= 50) {
    // Be careful not to exclude legitimate small images like author avatars
    // But exclude if it's clearly a social icon or UI element
    // (headshot check already done above, so we can exclude small social icons)
    if (!className.includes('author-avatar') && !className.includes('profile-pic') &&
        !className.includes('author') && !id.includes('author') &&
        !className.includes('headshot') && !id.includes('headshot') &&
        (src.includes('icon') || src.includes('logo') || src.includes('social') || 
         alt.includes('icon') || alt.includes('logo') || alt.includes('social'))) {
      return true;
    }
  }
  
  // Check if it's a background image (often decorative)
  try {
    const style = window.getComputedStyle(img);
    if (style.backgroundImage !== 'none' && style.backgroundImage.includes(src)) {
      return true;
    }
  } catch (e) {
    // Continue if getComputedStyle fails
  }
  
  // Check if it's a very small image with no alt text and no meaningful context
  if ((naturalWidth > 0 && naturalHeight > 0 && naturalWidth < 100 && naturalHeight < 100) &&
      !alt && !img.closest('figure') && !img.closest('a')) {
    // Check if it's inside a social/share container
    let parent = img.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const parentClass = String(parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();
      if (parentClass.includes('social') || parentClass.includes('share') || 
          parentClass.includes('icon') || parentClass.includes('logo') ||
          parentId.includes('social') || parentId.includes('share') ||
          parentId.includes('icon') || parentId.includes('logo')) {
        return true;
      }
      parent = parent.parentElement;
    }
  }
  
  return false;
}

/**
 * Get image caption from nearby elements
 * @param {HTMLImageElement} img - Image element
 * @returns {string} Caption text or empty string
 */
export function getImageCaptionModule(img) {
  // Check for figcaption in figure
  const figure = img.closest('figure');
  if (figure) {
    const figcaption = figure.querySelector('figcaption');
    if (figcaption) return figcaption.textContent.trim();
  }
  
  // Check aria-label or title on image itself
  const ariaLabel = img.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  
  const title = img.getAttribute('title');
  if (title && title.trim() && title !== img.alt) return title.trim();
  
  // Check next sibling
  const nextSibling = img.nextElementSibling;
  if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
    return nextSibling.textContent.trim();
  }
  
  // Check for caption in parent container
  const parent = img.parentElement;
  if (parent) {
    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
    if (captionEl) {
      const captionText = captionEl.textContent.trim();
      if (captionText && captionText !== img.alt) return captionText;
    }
  }
  
  return '';
}

