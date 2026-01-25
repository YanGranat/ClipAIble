// @ts-check
// Element filtering functions for extraction
// Determines which elements should be excluded from extraction

import { safeGetComputedStyle, safeClosest } from './dom-utils.js';

// Optimized navigation pattern matching
export function matchesNavigationPattern(text, patterns) {
  // Use for...of instead of some() for better performance with large arrays
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if element is a footnote link (number or arrow that links to #)
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is a footnote link
 */
export function isFootnoteLink(element) {
  if (element.tagName.toLowerCase() !== 'a') return false;
  const href = element.getAttribute('href') || '';
  // Link to anchor or contains #note
  if (href === '#' || (href.startsWith('#') && href.length > 1) || href.includes('#note')) {
    const text = (element.textContent || '').trim();
    // Just a number or arrow symbol
    if (/^[\d\s]+$/.test(text) || /^[←→↑↓↗↘↩]+$/.test(text) || text.toLowerCase().includes('open these')) {
      return true;
    }
    // Contains only an emoji arrow image
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
 * @returns {boolean} - True if element is an icon
 */
export function isIcon(element) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'svg') return true;
  
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // Icon classes
  if (className.includes('icon-') || className.includes('icon') || id.includes('icon')) {
    return true;
  }
  
  // Span/i/em/sup with arrow symbols or very short text
  if (tagName === 'span' || tagName === 'i' || tagName === 'em' || tagName === 'sup') {
    const text = (element.textContent || '').trim();
    if (text.length <= 3 && /[←→↑↓↗↘◀▶▲▼↩]/.test(text)) {
      return true;
    }
    if (tagName === 'sup' && text.toLowerCase().includes('open these')) {
      return true;
    }
  }
  
  // Emoji arrow images
  if (tagName === 'img') {
    const imgElement = /** @type {HTMLImageElement} */ (element);
    const alt = (imgElement.alt || '').trim();
    const src = (imgElement.src || '').toLowerCase();
    if (alt === '↩' || /[←→↑↓↗↘↩]/.test(alt) || (src.includes('emoji') && alt.includes('arrow'))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if element is a widget (fixed/absolute positioned small element)
 * @param {Window} win - Window object
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is a widget
 */
export function isWidget(win, element) {
  const style = safeGetComputedStyle(win, element);
  if (!style) return false;
  
  const position = style.position;
  if (position !== 'fixed' && position !== 'absolute') return false;
  
  // Check if small (typical for widgets)
  const rect = element.getBoundingClientRect();
  if (rect.width > 400 || rect.height > 400) return false;
  
  // Check for few paragraphs (widgets typically have minimal content)
  const paragraphs = element.querySelectorAll('p');
  if (paragraphs.length > 2) return false;
  
  return true;
}

/**
 * Check if paragraph is navigation/non-content
 * Only matches if paragraph is short and clearly navigation
 * @param {string} text - Paragraph text
 * @param {RegExp[]} navPatternsStartsWith - Navigation patterns (starts with)
 * @param {string[]} paywallPatterns - Paywall patterns
 * @returns {boolean} - True if paragraph is navigation
 */
export function isNavigationParagraph(text, navPatternsStartsWith, paywallPatterns) {
  const textTrimmed = text.trim();
  const textLength = textTrimmed.length;
  
  // Long paragraphs (>200 chars) are likely article content
  if (textLength > 200) {
    return false;
  }
  
  // Check if mostly links (navigation indicator)
  const linkCount = (textTrimmed.match(/<a\s+/gi) || []).length;
  const textWithoutLinks = textTrimmed.replace(/<[^>]+>/g, '').trim();
  const linkDensity = textWithoutLinks.length > 0 ? linkCount / (textWithoutLinks.length / 50) : linkCount;
  
  // More than 2 links in short paragraph = navigation
  if (linkCount >= 2 && textLength < 100) {
    return true;
  }
  
  // Navigation pattern (starts with)
  if (navPatternsStartsWith.some(pattern => pattern.test(textTrimmed))) {
    return true;
  }
  
  // Paywall message
  const textLower = text.toLowerCase();
  if (paywallPatterns.some(pattern => textLower.includes(pattern.toLowerCase()))) {
    return true;
  }
  
  return false;
}

/**
 * Check if element should be excluded from extraction
 * This is the main filtering function with many exclusion conditions
 * @param {Window} win - Window object
 * @param {Element} element - Element to check
 * @param {Object} constants - Constants with patterns
 * @param {string[]} constants.EXCLUDED_CLASSES - Excluded class names
 * @param {string[]} constants.PAYWALL_CLASSES - Paywall class names
 * @param {RegExp[]} constants.NAV_PATTERNS_CONTAINS - Navigation patterns
 * @param {string[]} constants.COURSE_AD_PATTERNS - Course ad patterns
 * @returns {boolean} - True if element should be excluded
 */
export function isExcluded(win, element, constants) {
  const {
    EXCLUDED_CLASSES,
    PAYWALL_CLASSES,
    NAV_PATTERNS_CONTAINS,
    COURSE_AD_PATTERNS
  } = constants;
  
  const tagName = element.tagName.toLowerCase();
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // Semantic containers (article, main) should be more lenient
  const isSemanticContainer = tagName === 'article' || tagName === 'main';
  const isImageOrFigure = tagName === 'img' || tagName === 'figure';
  
  // Get computed style safely
  const style = safeGetComputedStyle(win, element);
  if (!style) {
    // Can't get style - assume visible
    return false;
  }
  
  // Visibility checks
  if (isImageOrFigure) {
    // For images, only exclude if completely hidden (not for opacity/fade)
    if (style.display === 'none' || style.visibility === 'hidden') {
      // Check for lazy loading attributes
      const hasLazySrc = element.hasAttribute('data-src') || 
                        element.hasAttribute('data-lazy-src') ||
                        element.hasAttribute('data-original') ||
                        element.hasAttribute('data-srcset');
      if (hasLazySrc) return false;
      
      // For figure, check img inside
      if (tagName === 'figure') {
        const img = element.querySelector('img');
        if (img && (img.hasAttribute('data-src') || img.hasAttribute('data-lazy-src'))) {
          return false;
        }
      }
      return true;
    }
  } else {
    // For non-images, exclude if hidden in any way
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
  }
  
  // Exclude iframes (mostly ads)
  if (tagName === 'iframe') {
    const iframeElement = /** @type {HTMLIFrameElement} */ (element);
    const src = (iframeElement.src || '').toLowerCase();
    const adPatterns = ['ad', 'ads', 'advertisement', 'doubleclick', 'googleads', 'pubmatic'];
    if (adPatterns.some(pattern => src.includes(pattern))) {
      return true;
    }
    return true; // Exclude all iframes for now
  }
  
  // Exclude footnotes and icons
  if (isFootnoteLink(element)) return true;
  if (isIcon(element)) return true;
  
  // Exclude aside and complementary
  if (tagName === 'aside' || element.getAttribute('role') === 'complementary') {
    return true;
  }
  
  const text = element.textContent || '';
  const textLower = text.toLowerCase();
  const textTrimmed = text.trim();
  
  // Email input = likely newsletter (skip for semantic containers like article/main)
  if (!isSemanticContainer && element.querySelector && element.querySelector('input[type="email"]')) {
    const hasNewsletterText = textLower.includes('newsletter') || 
                             textLower.includes('subscribe') ||
                             textLower.includes('signup');
    if (hasNewsletterText) return true;
    
    const isInNavArea = safeClosest(element, 'nav, aside, .sidebar, footer, header') !== null;
    if (isInNavArea) return true;
  }
  
  // Ad-related classes
  const adClasses = ['book-cta', 'course-cta', 'product-cta', 'course-ad', 'product-ad'];
  if (adClasses.some(adClass => className.includes(adClass) || id.includes(adClass))) {
    return true;
  }
  
  // Paywall classes
  if (PAYWALL_CLASSES.some(paywallClass => className.includes(paywallClass) || id.includes(paywallClass))) {
    return true;
  }
  
  // Course/product ads with prices
  const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
  const hasPrice = pricePattern.test(text);
  const isCourseAd = COURSE_AD_PATTERNS.some(pattern => textLower.includes(pattern));
  if (hasPrice && isCourseAd) {
    return true;
  }
  
  // Tab navigation elements
  const role = element.getAttribute('role') || '';
  if (role === 'tab' || role === 'tabpanel' || 
      safeClosest(element, '[role="tablist"]') !== null) {
    return true;
  }
  
  // Navigation pattern check (skip for semantic containers and images)
  if (!isSemanticContainer && !isImageOrFigure) {
    const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
    if (isParagraphOrHeading) {
      // Only exclude if short and matches navigation
      if (textTrimmed.length < 200 && matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
        return true;
      }
    } else {
      if (matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
        return true;
      }
    }
  }
  
  // Newsletter blocks (skip for semantic containers)
  if (!isSemanticContainer && (textLower.includes('sign up to our newsletter') || 
      (textLower.includes('newsletter') && textLower.includes('subscribe')))) {
    return true;
  }
  
  // Email service providers
  if (textLower.includes('powered by salesforce') || textLower.includes('marketing cloud')) {
    return true;
  }
  
  // Check excluded classes with word boundaries
  for (const excluded of EXCLUDED_CLASSES) {
    const pattern = new RegExp(`\\b${excluded}\\b`);
    if (pattern.test(className) || pattern.test(id) ||
        className === excluded || className.startsWith(excluded + '-') || 
        className.endsWith('-' + excluded)) {
      return true;
    }
  }
  
  // Check parent elements (skip for semantic containers)
  if (!isSemanticContainer) {
    let parent = element.parentElement;
    let iterations = 0;
    const maxIterations = 50;
    
    while (parent && parent !== document.body && iterations < maxIterations) {
      iterations++;
      const parentClass = String(parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();
      const parentTag = parent.tagName.toLowerCase();
      
      // Clear ad indicators
      const clearAdIndicators = [/\bad\b/, /\badvertisement\b/, /\bsponsor\b/];
      const isClearAd = clearAdIndicators.some(indicator => 
        indicator.test(parentClass) || indicator.test(parentId)
      );
      
      if (isClearAd || parentTag === 'aside') {
        return true;
      }
      
      parent = parent.parentElement;
    }
  }
  
  return false;
}

/**
 * Check if element should be strongly excluded (always skip)
 * Used for ad/sponsor patterns with word boundaries
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element should be strongly excluded
 */
export function shouldSkipStronglyExcluded(element) {
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // Strong exclusion patterns (word boundaries to avoid "lead-article-image")
  const strongPatterns = [/\bad\b/, /\bads\b/, /\bsponsor\b/];
  
  for (const pattern of strongPatterns) {
    if (pattern.test(className) || pattern.test(id)) {
      return true;
    }
  }
  
  return false;
}
