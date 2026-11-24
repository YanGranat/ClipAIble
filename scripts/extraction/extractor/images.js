// @ts-check
// Image processing functions for extraction
// Handles image URL extraction, filtering, and featured image detection

import { toAbsoluteUrl, normalizeImageUrl, safeGetComputedStyle, compareDomOrder } from './dom-utils.js';
import { serializeReadingHtml } from './inline-content.js';

/**
 * Check if URL is a placeholder (base64 1x1 transparent pixel, etc.)
 * @param {string} url - URL to check
 * @param {HTMLImageElement} [image] - Source element, for explicitly labelled fallbacks
 * @returns {boolean} - True if URL is placeholder
 */
export function isPlaceholderUrl(url, image) {
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
    if (/^(?:placeholder|spacer|blank|transparent|1x1|pixel)\.(?:gif|png|svg|webp)$/i.test(basename)) return true;
    const label = (image?.getAttribute('aria-label') || image?.alt || '').trim().replace(/\s+/g, ' ');
    return /^(?:image|photo|picture) (?:is )?(?:unavailable|not available|not found)$/i.test(label) &&
      /(?:^|[-_.])(?:placeholder|fallback)(?:[-_.]|$)/i.test(basename);
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
 * @param {HTMLImageElement} [image] - Source element, for explicitly labelled fallbacks
 * @returns {string|null} - Best URL or null
 */
export function getBestSrcsetUrl(srcset, image) {
  if (!srcset) return null;
  const sources = srcset.split(',').map(s => s.trim());
  let bestUrl = null;
  let bestSize = 0;
  
  for (const source of sources) {
    const parts = source.trim().split(/\s+/);
    if (parts.length < 1) continue;
    const url = parts[0];
    if (isPlaceholderUrl(url, image)) continue;
    
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
    const candidate = attr === 'data-srcset' ? getBestSrcsetUrl(value, imgElement) : value;
    if (candidate && !isPlaceholderUrl(candidate, imgElement)) return candidate;
  }
  
  // Priority 1: currentSrc (browser's selected src from srcset)
  if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc, imgElement)) {
    src = imgElement.currentSrc;
  }
  
  // Priority 2: src attribute
  if (!src) {
    const imgSrc = imgElement.src || imgElement.getAttribute('src');
    if (imgSrc && !isPlaceholderUrl(imgSrc, imgElement)) {
      src = imgSrc;
    }
  }
  
  // Priority 3: srcset
  if (!src) {
    const srcset = imgElement.getAttribute('srcset');
    if (srcset) {
      src = getBestSrcsetUrl(srcset, imgElement);
    }
  }
  
  // Priority 4: picture element sources
  if (!src) {
    const picture = imgElement.closest('picture');
    if (picture) {
      for (const source of Array.from(picture.querySelectorAll('source[srcset]'))) {
        const srcset = source.getAttribute('srcset');
        if (srcset) {
          const candidate = getBestSrcsetUrl(srcset, imgElement);
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
      if (val && !val.includes('data:') && !isPlaceholderUrl(val, imgElement)) {
        if (attr === 'data-srcset') {
          src = getBestSrcsetUrl(val, imgElement);
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
      if (href && !isPlaceholderUrl(href, imgElement) && (href.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || href.includes('image'))) {
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

/** A collapsed decorative layer is not an independent article image. */
export function isCollapsedImageLayer(img) {
  if (!img.isConnected || !img.complete || !img.naturalWidth || !img.naturalHeight) return false;
  if (img.getAttribute('alt')?.trim() !== '' || img.title || img.hasAttribute('aria-label') ||
      img.hasAttribute('aria-labelledby') || img.closest('a[href]') || !img.closest('figure')) return false;
  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return false;
  const win = img.ownerDocument.defaultView;
  const style = safeGetComputedStyle(win, img);
  const collapsed = (rect.width <= 0 && style?.width === '0px') || (rect.height <= 0 && style?.height === '0px');
  if (!collapsed || !['absolute', 'fixed'].includes(style?.position) || !getSelectedImageNaturalSize(img).matchesSource) return false;
  return Array.from(img.parentElement?.children || []).some(sibling => sibling !== img && sibling.tagName === 'IMG' &&
    safeGetComputedStyle(win, sibling)?.position === style.position);
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
 * @param {Array<Element|string>} [excludedElements] - Excluded source subtrees or selectors
 * @param {Element|null} [selectedIllustration] - Explicitly selected single-image group
 * @returns {string} - Portable inline caption HTML or empty string
 */
export function getImageCaption(img, captionOwners = null, excludedElements = [], selectedIllustration = null) {
  const captionText = element => serializeReadingHtml(element, excludedElements);
  const excluded = element => excludedElements.some(rule => {
    try { return typeof rule === 'string' ? !!element.closest(rule) : rule.contains(element); }
    catch (_) { return true; }
  });
  const readable = element => {
    if (excluded(element)) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.matches('[hidden]')) return false;
      const style = safeGetComputedStyle(img.ownerDocument.defaultView, node);
      if (style?.display === 'none') return false;
    }
    const style = safeGetComputedStyle(img.ownerDocument.defaultView, element);
    if (style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    return true;
  };
  // Check for figcaption in figure
  const figure = img.closest('figure');
  if (figure) {
    for (const figcaption of Array.from(figure.querySelectorAll('figcaption'))) {
      if (figcaption.closest('figure') !== figure || !readable(figcaption)) continue;
      const text = captionText(figcaption);
      if (!text) continue;
      captionOwners?.add(figcaption);
      return text;
    }
  }
  
  for (const id of (img.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
    const description = img.ownerDocument.getElementById(id);
    if (!description || description.contains(img) || !readable(description)) continue;
    const text = captionText(description);
    if (text) { captionOwners?.add(description); return text; }
  }
  
  // Check next sibling
  const nextSibling = img.nextElementSibling;
  if (nextSibling && readable(nextSibling) && String(nextSibling.className || '').toLowerCase().includes('caption')) {
    const text = captionText(nextSibling);
    if (text) { captionOwners?.add(nextSibling); return text; }
  }
  
  // Check for caption in parent
  const parent = img.parentElement;
  if (parent && parent.querySelectorAll('img').length === 1) {
    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption');
    if (captionEl && readable(captionEl)) {
      const text = captionText(captionEl);
      if (text && text !== img.alt && captionEl.closest('figure') === figure) {
        captionOwners?.add(captionEl);
        return text;
      }
    }
  }

  if (!figure && selectedIllustration && selectedIllustration !== img) {
    const captions = Array.from(selectedIllustration.children).filter(node =>
      node.matches('figcaption,p,h2,h3,h4,h5,h6') && compareDomOrder(img, node) < 0 && readable(node));
    const parts = captions.map(node => {
      const html = captionText(node);
      if (html) captionOwners?.add(node);
      return html;
    }).filter(Boolean);
    if (parts.length) return parts.join('<br>');
  }
  
  return '';
}

/**
 * Read a publisher metadata image when source reading media is absent.
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @param {string[]} logoPatterns - Logo URL patterns
 * @returns {{src: string, alt: string, caption: string}|null} - Featured image or null
 */
export function extractMetadataImage(doc, baseUrl, logoPatterns) {
  const featuredImageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="article:image"]',
    'meta[name="image"]'
  ];
  
  // Try meta tags first
  for (const selector of featuredImageSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content');
        
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
  
  return null;
}

/** Resolve source media owners without admitting a selector's unrelated surrounding prose. */
export function discoverReadingMedia(bodyRoots, selectedHeroes = []) {
  const mediaSelector = 'figure,img,picture,svg,canvas,video,audio,iframe';
  const mediaRoots = new Set();
  const featuredRoots = new Set();
  const selectedIllustrations = new Map();
  const ownerOf = element => element.closest('figure') || element.closest('picture') || element;
  const insideBody = element => bodyRoots.some(root => root.contains(element));
  const before = (left, right) => left !== right && !left.contains(right) && compareDomOrder(left, right) < 0;
  for (const root of bodyRoots) {
    for (const element of [...(root.matches(mediaSelector) ? [root] : []), ...Array.from(root.querySelectorAll(mediaSelector))]) {
      const media = ownerOf(element);
      if (root.contains(media)) mediaRoots.add(media);
    }
  }
  for (const root of bodyRoots) {
    const body = root.closest('[itemprop~="articleBody"]');
    const article = body?.parentElement?.closest('[itemscope][itemtype]');
    if (!(article?.getAttribute('itemtype') || '').split(/\s+/).some(type =>
      /^https?:\/\/schema\.org\/\w*(?:Article|BlogPosting)$/.test(type))) continue;
    for (const declaration of Array.from(article.querySelectorAll('[itemprop~="image"]'))) {
      if (declaration.parentElement?.closest('[itemscope]') !== article) continue;
      for (const source of declaration.matches('img') ? [declaration] : Array.from(declaration.querySelectorAll('img'))) {
        const media = ownerOf(source);
        if (insideBody(media) || !before(media, body)) continue;
        mediaRoots.add(media);
        featuredRoots.add(media);
      }
    }
  }
  const owners = new Map();
  for (const root of bodyRoots) {
    const owner = root.closest('article,[itemprop~="articleBody"]');
    if (!owner) continue;
    if (!owners.has(owner)) owners.set(owner, []);
    owners.get(owner).push(root);
  }
  const headerOf = (element, owner) => {
    for (let node = element.parentElement; node && node !== owner; node = node.parentElement) {
      if (node.tagName === 'HEADER' || /(?:^|[\s_-])header(?:$|[\s_-])/i.test(node.getAttribute('class') || '')) return node;
    }
    return null;
  };
  for (const [owner, roots] of owners) {
    const ordered = [...roots].sort(compareDomOrder);
    const narrativeStart = roots.flatMap(root => [...(root.matches('p,blockquote,pre,ul,ol,table') ? [root] : []), ...Array.from(root.querySelectorAll('p,blockquote,pre,ul,ol,table'))])
      .filter(element => !element.closest('figure,figcaption') && !headerOf(element, owner)).sort(compareDomOrder)[0];
    for (const element of Array.from(owner.querySelectorAll(mediaSelector))) {
      const media = ownerOf(element);
      if (media.closest('article,[itemprop~="articleBody"]') !== owner) continue;
      const outside = !insideBody(media) && !bodyRoots.some(root => media.contains(root));
      const leading = outside && before(media, ordered[0]);
      const interleaved = outside && ordered.some(root => before(root, media)) && ordered.some(root => before(media, root));
      const header = headerOf(media, owner);
      if (leading || interleaved || (header && insideBody(media))) mediaRoots.add(media);
      if (leading || (header && narrativeStart && before(media, narrativeStart))) featuredRoots.add(media);
    }
  }
  for (const selected of selectedHeroes) {
    // An ancestor selector cannot expand the article into page-wide reading content.
    if (!selected.matches(mediaSelector) && bodyRoots.some(root => root !== selected && selected.contains(root))) continue;
    const elements = [...(selected.matches(mediaSelector) ? [selected] : []), ...Array.from(selected.querySelectorAll(mediaSelector))];
    const images = elements.filter(element => element.tagName === 'IMG');
    const complementary = selected.closest('aside,[role~="complementary"]');
    if (complementary && selected !== complementary &&
        (selected.matches('img,figure,picture') || images.length === 1)) {
      for (const image of images) {
        selectedIllustrations.set(image, selected);
        const owner = ownerOf(image);
        if (owner !== image && complementary.contains(owner)) selectedIllustrations.set(owner, selected);
      }
    }
    for (const element of elements) {
      const media = ownerOf(element);
      mediaRoots.add(media);
      if (!insideBody(media) && !bodyRoots.some(root => media.contains(root))) featuredRoots.add(media);
    }
  }
  return { roots: [...mediaRoots], featuredRoots: [...featuredRoots], selectedIllustrations };
}

/** Failed or excluded source media must not be replaced with an unrelated metadata cover. */
export function hasSourceReadingMedia(roots, logoPatterns = []) {
  const selector = 'img,svg,canvas,video,audio,iframe';
  return roots.some(root => [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll(selector))].some(element =>
    element.tagName !== 'IMG' || (!isTrackingPixel(element.ownerDocument.defaultView, /** @type {HTMLImageElement} */ (element)) &&
      !isDecorativeImage(element.ownerDocument.defaultView, /** @type {HTMLImageElement} */ (element), logoPatterns))));
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
  const description = (element.getAttribute('title') || element.getAttribute('aria-label') || '').trim();
  const label = description || source.hostname;
  let preview = element.tagName === 'VIDEO' ? safeUrl(element.getAttribute('poster'))?.href : null;
  if (element.tagName === 'IFRAME' && source.hostname === 'datawrapper.dwcdn.net') {
    const chart = source.pathname.match(/^\/([A-Za-z0-9]{5})\/(?:\d+\/?)?$/);
    if (chart) preview = `https://datawrapper.dwcdn.net/${chart[1]}/full.png`;
  }
  /** @type {import('./types.js').ContentItem[]} */
  const items = [];
  if (preview) items.push({ type: 'image', src: preview, alt: description, caption: '' });
  items.push({ type: 'paragraph', text: label,
    html: `<a href="${escape(source.href)}">${escape(label)}</a>` });
  return items;
}
