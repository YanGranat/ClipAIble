// @ts-check
// DOM utility functions for extraction
// URL handling, DOM order comparison, computed style helpers

/** Regions that own interface text independently of the surrounding article. */
export const INTERFACE_REGIONS = 'nav,footer,dialog,[role~="navigation"],[role~="dialog"],[role~="alertdialog"],[aria-modal="true"]';

/** Identify controls that share the current article or follow its publisher. */
export function isPublisherLinkAction(element) {
  const link = element.closest('a[href]');
  if (!link) return false;
  const doc = link.ownerDocument;
  try {
    const target = new URL(link.getAttribute('href'), doc.baseURI);
    if (link.closest('[data-preferred-source]') &&
        ['google.com', 'www.google.com'].includes(target.hostname) && target.pathname === '/preferences/source') return true;
    const marked = link.hasAttribute('data-social-service') ||
      /(?:^|\/)(?:share|sharer|shareArticle|intent)(?:[./]|$)/i.test(target.pathname);
    if (!marked || link.querySelector('figure,p,blockquote')) return false;
    const urls = [doc.URL, doc.querySelector('link[rel="canonical"]')?.getAttribute('href')]
      .filter(Boolean).map(value => new URL(value, doc.baseURI));
    for (const value of target.searchParams.values()) {
      for (const address of value.match(/https?:\/\/[^\s<>"']+/g) || []) {
        const shared = new URL(address);
        if (urls.some(url => url.origin === shared.origin && url.pathname === shared.pathname)) return true;
      }
    }
    return false;
  } catch (_) { return false; }
}

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
 * Preserve query parameters and fragments that can identify different images.
 * @param {string} url - Image URL to normalize
 * @returns {string} - Complete normalized URL
 */
export function normalizeImageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch (e) {
    return url;
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
  if (position & a.DOCUMENT_POSITION_FOLLOWING) {
    // b follows a, so a comes first
    return -1;
  }
  if (position & a.DOCUMENT_POSITION_PRECEDING) {
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

/** Apply source exclusions while retaining the reading alternative of an embedded quotation. */
export function isSourceExcluded(element, exclusions = []) {
  return exclusions.some(rule => {
    try {
      const owner = typeof rule === 'string' ? element.closest(rule) : rule.contains(element) ? rule : null;
      return !!owner && !(owner.matches('blockquote.twitter-tweet') && owner.textContent?.trim());
    } catch (_) { return true; }
  });
}

/** Clone readable source content without changing its DOM or interpreting literal text. */
export function cloneReadingContent(element, exclusions = [], copyMap = null, { disclosed = false } = {}) {
  const clone = element.cloneNode(true);
  copyMap?.set(element, clone);
  const excluded = node => {
    const region = node.closest(INTERFACE_REGIONS);
    return (region && !(disclosed && region === element)) || isPublisherLinkAction(node) || isSourceExcluded(node, exclusions);
  };
  if (excluded(element)) { clone.replaceChildren(); return clone; }
  const originals = Array.from(element.querySelectorAll('*'));
  const copies = Array.from(clone.querySelectorAll('*'));
  const win = element.ownerDocument.defaultView;
  const rootStyle = disclosed && win ? safeGetComputedStyle(win, element) : null;
  const hidden = value => value === 'hidden' || value === 'collapse';
  const disclosureVisibility = hidden(rootStyle?.visibility) ? rootStyle.visibility : null;
  const inheritsDisclosureVisibility = new Set(disclosureVisibility ? [element] : []);
  for (let index = 0; index < originals.length; index++) copyMap?.set(originals[index], copies[index]);
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index], copy = copies[index];
    if (excluded(original)) { copy.remove(); continue; }
    const literal = original.closest('pre,code,math,mjx-container,.MathJax,.katex');
    const style = original.ownerDocument.defaultView ? safeGetComputedStyle(original.ownerDocument.defaultView, original) : null;
    if (!literal && (original.matches('script,style,template,noscript,input,select,textarea') || style?.display === 'none' || (!style && original.hasAttribute('hidden')))) {
      copy.remove();
      continue;
    }
    const ownVisibility = /** @type {HTMLElement} */ (original).style?.visibility;
    if (disclosureVisibility === style?.visibility && !hidden(ownVisibility) &&
        inheritsDisclosureVisibility.has(original.parentElement)) inheritsDisclosureVisibility.add(original);
    const textHidden = !literal && hidden(style?.visibility) && !inheritsDisclosureVisibility.has(original);
    if (textHidden) {
      for (const child of Array.from(copy.childNodes)) if (child.nodeType === 3) child.remove();
    }
    const originalText = original.getAttribute('data-original-text');
    if (!textHidden && originalText?.trim()) copy.textContent = originalText;
    if (!literal && original.matches('.screen-reader-text,.screen-reader-only,.sr-only,.visually-hidden') &&
        original.closest('a') && !original.closest('mjx-assistive-mml') &&
        !original.querySelector('math,mjx-assistive-mml,.MathJax,.katex')) {
      let label = (copy.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (label.startsWith('(') && label.endsWith(')')) label = label.slice(1, -1).trim();
      if (/^opens(?: in)? a new (?:tab|window)$/.test(label)) {
        copy.remove();
        continue;
      }
    }
    if (!original.matches('span,a,button,b,i,em,strong,small,sup,sub') ||
        original.closest('pre,code,math,mjx-container,.MathJax,.katex')) continue;
    const parentStyle = original.parentElement && original.ownerDocument.defaultView?.getComputedStyle(original.parentElement);
    if (['block', 'flex', 'grid', 'table', 'table-row'].includes(style?.display) ||
        ['flex', 'grid'].includes(parentStyle?.display)) {
      copy.before(clone.ownerDocument.createElement('br'), '\n');
      copy.after(clone.ownerDocument.createElement('br'), '\n');
    } else {
      if (parseFloat(style?.marginInlineStart) > 0) copy.before(' ');
      if (parseFloat(style?.marginInlineEnd) > 0) copy.after(' ');
    }
  }
  return clone;
}

/** Resolve an internal fragment against its source document. */
export function getDocumentFragmentTarget(element) {
  const href = element.getAttribute('href');
  if (!href) return null;
  try {
    const document = element.ownerDocument;
    const target = new URL(href, document.baseURI);
    const source = new URL(document.URL);
    if (!target.hash || target.origin !== source.origin || target.pathname !== source.pathname || target.search !== source.search) return null;
    return document.getElementById(decodeURIComponent(target.hash.slice(1)));
  } catch (_) { return null; }
}

/** Distinguish note references from ordinary numeric links and literal notation. */
export function isDocumentNoteReference(reference) {
  if (reference.closest('pre,code,math,mjx-container,.MathJax,.katex')) return false;
  if (reference.matches('[data-footnote-ref],[role="doc-noteref"]') ||
      (reference.getAttribute('epub:type') || '').split(/\s+/).includes('noteref')) return true;
  if (!/^\[?\d+\]?$/.test(reference.textContent?.trim() || '')) return false;
  const target = getDocumentFragmentTarget(reference);
  if (!target) return false;
  if (target.closest('[role="doc-footnote"],[role="doc-endnote"],[role="doc-endnotes"]') ||
      ['footnote', 'endnote'].some(type => (target.getAttribute('epub:type') || '').split(/\s+/).includes(type))) return true;
  const carrier = reference.closest('sup');
  if (!carrier) return false;
  return Array.from(target.querySelectorAll('a[href]')).some(backlink => {
    const destination = getDocumentFragmentTarget(backlink);
    return destination === reference || destination === carrier;
  });
}

/** Remove a hidden note copy only when its canonical target contains the same text. */
export function cloneWithoutRepeatedNoteTooltips(element, referenceRoots = null, excludedSelectors = [], copyMap = null) {
  const clone = cloneReadingContent(element, excludedSelectors, copyMap);
  for (const reference of Array.from(clone.querySelectorAll('a[href]'))) {
    if (!isDocumentNoteReference(reference)) continue;
    const target = getDocumentFragmentTarget(reference);
    if (!target || element.contains(target)) continue;
    if (referenceRoots && !referenceRoots.some(root => root.contains(target))) continue;
    if (isSourceExcluded(target, excludedSelectors)) continue;
    const canonical = target.cloneNode(true);
    for (const backlink of Array.from(canonical.querySelectorAll('a'))) {
      if (backlink.getAttribute('role') === 'doc-backlink' || /^[\s↩︎↩←↑]+$/.test(backlink.textContent || '')) backlink.remove();
    }
    const noteText = node => {
      const copy = node.cloneNode(true);
      const marker = copy.firstElementChild;
      if (marker?.tagName === 'SUP' && /^\d+$/.test(marker.textContent?.trim() || '')) marker.remove();
      return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    };
    const canonicalText = noteText(canonical);
    const owner = reference.closest('sup') || reference.parentElement;
    for (const tooltip of Array.from(owner?.querySelectorAll('[aria-hidden="true"], [hidden], [role="tooltip"]') || [])) {
      if (canonicalText && noteText(tooltip) === canonicalText) tooltip.remove();
    }
  }
  return clone;
}

/** Read metadata without hidden announcements or separately owned reference markers. */
export function readArticleMetadataText(element) {
  if (!element) return '';
  for (let node = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || (!style && node.hasAttribute('hidden'))) return '';
  }
  const clone = cloneWithoutRepeatedNoteTooltips(element);
  for (const control of Array.from(clone.querySelectorAll('.mw-editsection'))) {
    if (!control.closest('pre,code,math,mjx-container,.MathJax,.katex')) control.remove();
  }
  for (const node of Array.from(clone.querySelectorAll('[hidden]'))) {
    if (!node.closest('math, .MathJax, .katex, mjx-container')) node.remove();
  }
  for (const reference of Array.from(clone.querySelectorAll('a[href]'))) {
    if (reference.textContent?.trim() === '#' && getDocumentFragmentTarget(reference) === element &&
        !reference.closest('pre,code,math,mjx-container,.MathJax,.katex')) {
      reference.remove();
      continue;
    }
    if (isDocumentNoteReference(reference)) {
      (reference.closest('sup') || reference).remove();
    }
  }
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
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
