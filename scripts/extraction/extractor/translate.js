// @ts-check
// Google Translate detection and handling
// Extracts original text from Google Translate modified elements

/**
 * @typedef {import('./types.js').GoogleTranslateState} GoogleTranslateState
 * @typedef {import('./types.js').FirstParagraphCheck} FirstParagraphCheck
 */

/**
 * Detect Google Translate state on the page
 * Checks for various indicators that page has been translated
 * @param {Document} doc - Document object
 * @returns {GoogleTranslateState} - Google Translate state info
 */
export function detectGoogleTranslateState(doc) {
  try {
    const hasGoogleTranslateWidget = !!doc.querySelector(
      '.goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element'
    );
    const isTranslated = doc.body.classList.contains('translated-ltr') || 
                         doc.body.classList.contains('translated-rtl');
    const originalTextElements = doc.querySelectorAll('[data-original-text]');
    const gtOrigElements = doc.querySelectorAll('[data-gt-orig-display]');
    
    return {
      hasGoogleTranslateWidget,
      isTranslated,
      hasOriginalTextAttrs: originalTextElements.length > 0,
      hasGtOrigAttrs: gtOrigElements.length > 0,
      originalTextAttrsCount: originalTextElements.length,
      gtOrigAttrsCount: gtOrigElements.length,
      bodyClasses: doc.body.className,
      timestamp: Date.now()
    };
  } catch (e) {
    return {
      hasGoogleTranslateWidget: false,
      isTranslated: false,
      hasOriginalTextAttrs: false,
      hasGtOrigAttrs: false,
      originalTextAttrsCount: 0,
      gtOrigAttrsCount: 0,
      bodyClasses: '',
      timestamp: Date.now(),
      error: String(e)
    };
  }
}

/**
 * Check first paragraph for Google Translate attributes
 * Useful for detecting if content extraction should use original text
 * @param {Document} doc - Document object
 * @returns {FirstParagraphCheck|null} - First paragraph check info or null
 */
export function checkFirstParagraph(doc) {
  const firstP = doc.querySelector('main p, article p, [role="main"] p, #content p');
  if (!firstP) return null;
  
  const hasOriginalText = firstP.hasAttribute('data-original-text');
  const hasGtOrig = firstP.hasAttribute('data-gt-orig-display');
  const originalText = firstP.getAttribute('data-original-text');
  const currentText = firstP.textContent;
  
  return {
    hasOriginalTextAttr: hasOriginalText,
    hasGtOrigAttr: hasGtOrig,
    originalTextFull: originalText || null,
    currentTextFull: currentText || null,
    elementHTMLFull: firstP.innerHTML || null,
    textsMatch: originalText === currentText,
    timestamp: Date.now()
  };
}

/**
 * Get original text from Google Translate modified element
 * Google Translate stores original text in data-original-text attribute
 * @param {Element|null} element - Element to check
 * @returns {string|null} - Original text if found and different from current, null otherwise
 */
export function getOriginalTextIfTranslated(element) {
  if (!element) return null;
  
  // Check if element has data-original-text attribute
  const originalText = element.getAttribute('data-original-text');
  if (originalText && originalText.trim()) {
    const currentText = element.textContent || element.innerText || '';
    // If original text differs from current text, element was translated
    if (originalText.trim() !== currentText.trim()) {
      return originalText.trim();
    }
  }
  
  // Check child elements for data-original-text
  const childWithOriginal = element.querySelector('[data-original-text]');
  if (childWithOriginal) {
    const childOriginal = childWithOriginal.getAttribute('data-original-text');
    if (childOriginal && childOriginal.trim()) {
      return childOriginal.trim();
    }
  }
  
  return null;
}

/**
 * Check if page has been translated by Google Translate
 * @param {Document} doc - Document object
 * @returns {boolean} - True if page shows signs of Google Translate
 */
export function isPageTranslated(doc) {
  // Check body classes
  if (doc.body.classList.contains('translated-ltr') || 
      doc.body.classList.contains('translated-rtl')) {
    return true;
  }
  
  // Check for Google Translate widget
  if (doc.querySelector('.goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element')) {
    return true;
  }
  
  // Check for translated attributes
  if (doc.querySelectorAll('[data-original-text]').length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Extract all original text from translated elements within container
 * @param {Element} container - Container element
 * @returns {Map<Element, string>} - Map of elements to their original text
 */
export function extractOriginalTexts(container) {
  /** @type {Map<Element, string>} */
  const originalTexts = new Map();
  
  const translatedElements = container.querySelectorAll('[data-original-text]');
  for (const el of translatedElements) {
    const originalText = el.getAttribute('data-original-text');
    if (originalText && originalText.trim()) {
      originalTexts.set(el, originalText.trim());
    }
  }
  
  return originalTexts;
}

/**
 * Restore original text in element if it was translated
 * Returns the element with potentially restored text for processing
 * @param {Element} element - Element to process
 * @returns {{element: Element, wasTranslated: boolean, originalText: string|null}} - Processing result
 */
export function processTranslatedElement(element) {
  const originalText = getOriginalTextIfTranslated(element);
  return {
    element,
    wasTranslated: !!originalText,
    originalText
  };
}
