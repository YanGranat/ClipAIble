// @ts-check
// DOM utility functions for extraction
// URL handling, DOM order comparison, computed style helpers

/** Regions that own interface text independently of the surrounding article. */
export const INTERFACE_REGIONS = 'nav,footer,dialog,[role~="navigation"],[role~="dialog"],[role~="alertdialog"],[aria-modal="true"]';
export const MATHJAX_COMMON_HTML = '.mjx-chtml';

/** An emoji image represents text in the sentence that owns it. */
export function readInlineEmoji(element) {
  if (!element.matches('img.emoji[alt]')) return '';
  const alt = element.getAttribute('alt').trim();
  return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d]+$/u.test(alt) &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(alt) ? alt : '';
}

/** An inline navigation bar exposes abbreviated controls alongside the reading text. */
function isInlineNavigationBar(element) {
  if (!element.matches('.navbar,[role~="toolbar"]') || !element.parentElement ||
      element.closest('pre,code,math,figure') || !element.nextElementSibling?.textContent?.trim()) return false;
  const links = Array.from(element.querySelectorAll('li > a[href]'));
  if (links.length < 2 || element.querySelectorAll('a[href]').length !== links.length) return false;
  return links.every(link => link.querySelector('abbr[title]') &&
    Array.from(link.textContent?.trim() || '').length === 1) &&
    links.map(link => link.textContent?.trim()).join('') === element.textContent?.replace(/\s+/g, '');
}

/** Identify an inline graphic explicitly attached to a neighboring link. */
export function isExternalLinkAdornment(element) {
  const svg = element.closest('svg[data-extlink-placement]');
  if (!svg) return false;
  const placement = svg.getAttribute('data-extlink-placement');
  const link = placement === 'after' ? svg.previousElementSibling : placement === 'before' ? svg.nextElementSibling : null;
  return link?.matches('a[href][data-extlink]') === true;
}

/** Identify reading-adjacent controls, not authored links. */
export function isPublisherLinkAction(element) {
  const sectionEdit = element.closest('.mw-editsection');
  if (sectionEdit?.querySelector('a[href]') && !sectionEdit.closest('pre,code,math')) return true;
  const link = element.closest('a[href]');
  if (!link) return false;
  const readingContext = 'p,blockquote,pre,code,math,figure,figcaption,li,dd,dt,table';
  // Standalone icon-only identity links are profile controls, not illustrations.
  if (link.matches('[rel~="me"]') && link.querySelector('svg,img,picture') &&
      !link.closest(readingContext)) {
    const label = link.cloneNode(true);
    for (const graphic of /** @type {Element} */ (label).querySelectorAll('svg,img,picture')) graphic.remove();
    if (!label.textContent?.trim()) return true;
  }
  // A dedicated action inside the caption downloads its owning figure, not a cited resource.
  const caption = link.closest('figcaption');
  const actionLabel = node => Array.from(node.classList).some(name => /^(?:image|media)[-_]download(?:[-_](?:link|button))?$/i.test(name));
  if (caption?.closest('figure')?.querySelector('img,picture') &&
      (actionLabel(link) || (link.parentElement !== caption && actionLabel(link.parentElement)))) return true;
  const doc = link.ownerDocument;
  try {
    const target = new URL(link.getAttribute('href'), doc.baseURI);
    // A standalone jump to the document start is a page control.
    if (link.matches('.button,.btn,[role~="button"]') && !link.closest(`${readingContext},h1,h2,h3,h4,h5,h6,[role~="heading"]`) &&
        target.href.includes('#') && target.href.split('#')[0] === doc.URL.split('#')[0]) {
      const rawFragment = target.hash.slice(1);
      if (!rawFragment) return true;
      const fragment = decodeURIComponent(rawFragment);
      const findDestination = id => doc.getElementById(id) ||
        Array.from(doc.getElementsByName(id)).find(node => node.matches('a'));
      const destination = findDestination(rawFragment) || (fragment !== rawFragment ? findDestination(fragment) : null);
      if (destination === doc.body || destination === doc.documentElement || (!destination && /^top$/i.test(fragment))) return true;
    }
    if (link.closest('[data-preferred-source]') &&
        ['google.com', 'www.google.com'].includes(target.hostname) && target.pathname === '/preferences/source') return true;
    const standalone = !link.closest(readingContext);
    const emailShare = standalone && target.protocol === 'mailto:' && !target.pathname &&
      target.searchParams.has('subject') && target.searchParams.has('body');
    const reuseAction = standalone && !link.matches('[rel~="license"]') &&
      /(?:^|[-_\s])syndication(?:$|[-_\s])/i.test(link.getAttribute('data-link-name') || '');
    const marked = emailShare || reuseAction || link.hasAttribute('data-social-service') ||
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

/** A deferred renderer owns only the single hidden MathML source directly before it. */
function readLazyMathPair(source, excluded) {
  const math = source.firstElementChild;
  if (!source.matches('span') || source.children.length !== 1 || math.localName !== 'math' ||
      math.namespaceURI !== 'http://www.w3.org/1998/Math/MathML' || !math.textContent?.trim() ||
      Array.from(source.childNodes).some(node => node !== math && (node.nodeType !== 3 || node.textContent?.trim()))) return null;
  const renderer = source.nextElementSibling;
  const placeholder = renderer?.firstElementChild;
  if (!renderer?.matches('mjx-container') || renderer.children.length !== 1 ||
      !placeholder?.matches('mjx-lazy[data-mjx-lazy]') || placeholder.children.length !== 0 ||
      renderer.textContent?.trim() || renderer.closest('pre,code,[hidden]') ||
      excluded(renderer) || [math, ...math.querySelectorAll('*')].some(excluded)) return null;
  const win = renderer.ownerDocument.defaultView;
  const style = win && safeGetComputedStyle(win, renderer);
  if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return null;
  for (let node = source.nextSibling; node !== renderer; node = node.nextSibling) {
    if (node.nodeType !== 3 || node.textContent?.trim()) return null;
  }
  return { renderer };
}

function isHiddenMathSource(source, style) {
  if (!source.matches('span') || source.firstElementChild?.localName !== 'math') return false;
  if (style?.display === 'none' || /** @type {HTMLElement} */ (source).style.display === 'none' ||
      source.hasAttribute('hidden')) return true;
  // A one-pixel accessibility copy can override its own display style.
  if (style?.position !== 'absolute' && style?.position !== 'fixed') return false;
  const clipped = /^rect\(0px,0px,0px,0px\)$/u.test((style.clip || '').replace(/\s/gu, '')) ||
    style.clipPath === 'inset(50%)' || [style.overflowX, style.overflowY].every(value => /^(?:hidden|clip)$/u.test(value));
  if (!clipped) return false;
  const { width, height } = source.getBoundingClientRect();
  return width > 0 && width <= 1 && height > 0 && height <= 1;
}

/** Clone readable source content without changing its DOM or interpreting literal text. */
export function cloneReadingContent(element, exclusions = [], copyMap = null, { disclosed = false } = {}) {
  const clone = element.cloneNode(true);
  copyMap?.set(element, clone);
  const win = element.ownerDocument.defaultView;
  const excluded = node => {
    const region = node.closest(INTERFACE_REGIONS);
    return (region && !(disclosed && region === element)) || isInlineNavigationBar(node) || isExternalLinkAdornment(node) ||
      isPublisherLinkAction(node) || isSourceExcluded(node, exclusions) || (win && isHiddenSlotAssignment(win, node));
  };
  if (excluded(element)) { clone.replaceChildren(); return clone; }
  const originals = Array.from(element.querySelectorAll('*'));
  const copies = Array.from(clone.querySelectorAll('*'));
  const rootStyle = disclosed && win ? safeGetComputedStyle(win, element) : null;
  const hidden = value => value === 'hidden' || value === 'collapse';
  const disclosureVisibility = hidden(rootStyle?.visibility) ? rootStyle.visibility : null;
  const inheritsDisclosureVisibility = new Set(disclosureVisibility ? [element] : []);
  for (let index = 0; index < originals.length; index++) copyMap?.set(originals[index], copies[index]);
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index], copy = copies[index];
    if (excluded(original)) { copy.remove(); continue; }
    const literal = original.closest('pre,code,math,mjx-container,.MathJax,.katex,' + MATHJAX_COMMON_HTML);
    const style = original.ownerDocument.defaultView ? safeGetComputedStyle(original.ownerDocument.defaultView, original) : null;
    if (!literal && isHiddenMathSource(original, style)) {
      const pair = readLazyMathPair(original, excluded);
      const rendererCopy = pair && copies[originals.indexOf(pair.renderer, index + 1)];
      if (rendererCopy) {
        rendererCopy.replaceChildren(copy.firstElementChild);
        copy.remove();
        continue;
      }
    }
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
    const emoji = !literal && !textHidden && readInlineEmoji(original);
    if (emoji) {
      const text = clone.ownerDocument.createElement('span');
      text.textContent = emoji;
      if (original.id) text.id = original.id;
      copyMap?.set(original, text);
      copy.replaceWith(text);
      continue;
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
        literal) continue;
    const adjacentText = original.nextSibling?.textContent || '';
    if (/^(?:left|right|inline-start|inline-end)$/.test(style?.float || '') &&
        /^\p{L}\p{M}*$/u.test(original.textContent || '') && /^[\p{L}\p{N}]/u.test(adjacentText)) continue;
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

/** The light parent's CSS cannot expose text assigned inside a hidden shadow wrapper. */
function isHiddenSlotAssignment(win, element) {
  for (let slot = element.assignedSlot; slot; slot = slot.assignedSlot) {
    for (let parent = slot; parent; parent = parent.parentElement) {
      if (safeGetComputedStyle(win, parent)?.display === 'none') return true;
    }
  }
  return false;
}

/** Read source destinations owned by a rendered title or heading. */
export function readSourceFragmentIds(element, exclusions = []) {
  if (!element || isSourceExcluded(element, exclusions)) return [];
  const copies = new Map();
  const root = cloneReadingContent(element, exclusions, copies);
  const document = element.ownerDocument;
  const ids = new Set();
  for (const [source, copy] of copies) {
    if (!root.contains(copy)) continue;
    if (source.id && document.getElementById(source.id) === source) ids.add(source.id);
    const name = source.matches('a[name]') ? source.getAttribute('name') : '';
    if (name && !document.getElementById(name) && [...document.getElementsByName(name)].find(node => node.matches('a')) === source) ids.add(name);
  }
  return [...ids];
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
export function readArticleMetadataText(element, exclusions = []) {
  if (!element) return '';
  for (let node = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || (!style && node.hasAttribute('hidden'))) return '';
  }
  const clone = cloneWithoutRepeatedNoteTooltips(element, null, exclusions);
  for (const control of Array.from(clone.querySelectorAll('.mw-editsection'))) {
    if (!control.closest('pre,code,math,mjx-container,.MathJax,.katex')) control.remove();
  }
  for (const node of Array.from(clone.querySelectorAll('[hidden]'))) {
    if (!node.closest('math, .MathJax, .katex, mjx-container')) node.remove();
  }
  for (const reference of Array.from(clone.querySelectorAll('a[href]'))) {
    const marker = reference.textContent?.trim();
    const target = /^[#\u00b6\u00a7]$/u.test(marker || '') ? getDocumentFragmentTarget(reference) : null;
    if (target && (target === element || (target.contains(element) &&
        target.querySelector('h1,h2,h3,h4,h5,h6') === element)) &&
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
