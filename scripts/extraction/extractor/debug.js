// @ts-check
// Debug information collection for extraction
// Creates and manages debug info object for troubleshooting

/**
 * @typedef {import('./types.js').DebugInfo} DebugInfo
 * @typedef {import('./types.js').PageInfo} PageInfo
 * @typedef {import('./types.js').DocumentStructure} DocumentStructure
 * @typedef {import('./types.js').MainContentPreview} MainContentPreview
 */

/**
 * Collect page information for debug
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @returns {PageInfo} - Page info object
 */
export function collectPageInfo(win, doc, baseUrl) {
  return {
    url: win.location.href,
    title: doc.title,
    baseUrl: baseUrl,
    documentLang: doc.documentElement.lang,
    documentXmlLang: doc.documentElement.getAttribute('xml:lang'),
    bodyClasses: doc.body.className,
    bodyLang: doc.body.lang,
    hasGoogleTranslate: !!doc.querySelector('.goog-te-banner-frame, .goog-te-menu-frame, #google_translate_element'),
    isTranslated: doc.body.classList.contains('translated-ltr') || doc.body.classList.contains('translated-rtl'),
    timestamp: Date.now()
  };
}

/**
 * Collect meta tags from document
 * @param {Document} doc - Document object
 * @returns {Object<string, string>} - Meta tags object (name -> content)
 */
export function collectMetaTags(doc) {
  /** @type {Object<string, string>} */
  const metaTags = {};
  doc.querySelectorAll('meta').forEach(meta => {
    const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
    if (name) {
      metaTags[name] = meta.getAttribute('content') || '';
    }
  });
  return metaTags;
}

/**
 * Collect document structure information
 * @param {Document} doc - Document object
 * @returns {DocumentStructure} - Document structure info
 */
export function collectDocumentStructure(doc) {
  return {
    hasArticle: !!doc.querySelector('article'),
    hasMain: !!doc.querySelector('main'),
    hasHeader: !!doc.querySelector('header'),
    hasFooter: !!doc.querySelector('footer'),
    hasNav: !!doc.querySelector('nav'),
    hasAside: !!doc.querySelector('aside'),
    allParagraphsCount: doc.querySelectorAll('p').length,
    allHeadingsCount: doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
    allImagesCount: doc.querySelectorAll('img').length
  };
}

/**
 * Collect main content preview
 * @param {Document} doc - Document object
 * @returns {MainContentPreview} - Main content preview
 */
export function collectMainContentPreview(doc) {
  const mainContent = doc.querySelector('main, article, [role="main"], #content, #main-content');
  return {
    hasMain: !!mainContent,
    mainTagName: mainContent?.tagName,
    mainClassName: mainContent?.className,
    mainId: mainContent?.id,
    mainTextLength: mainContent?.textContent?.length || 0,
    mainTextFull: mainContent?.textContent || null,
    mainHTMLFull: mainContent?.innerHTML || null,
    childCount: mainContent?.children?.length || 0
  };
}

/**
 * Create debug info object
 * @param {Window} win - Window object
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @returns {DebugInfo} - Initialized debug info object
 */
export function createDebugInfo(win, doc, baseUrl) {
  return {
    foundElements: 0,
    filteredElements: 0,
    imageCount: 0,
    excludedImageCount: 0,
    processedCount: 0,
    skippedCount: 0,
    contentTypes: {},
    extractionLogs: [],
    pageInfo: collectPageInfo(win, doc, baseUrl),
    metaTags: collectMetaTags(doc),
    documentStructure: collectDocumentStructure(doc),
    mainContentPreview: collectMainContentPreview(doc),
    documentHTMLFull: doc.documentElement.outerHTML || null,
    bodyHTMLFull: doc.body?.innerHTML || null,
    googleTranslateState: null,
    firstParagraphCheck: null
  };
}

/**
 * Push a log entry to debug info
 * No-op if debugInfo is null (performance optimization)
 * @param {DebugInfo|null} debugInfo - Debug info object
 * @param {string} type - Log type
 * @param {any} [data] - Optional data to log
 */
export function pushDebugLog(debugInfo, type, data) {
  if (!debugInfo) return;
  debugInfo.extractionLogs.push({ type, data });
}

/**
 * Push a log entry with message to debug info
 * @param {DebugInfo|null} debugInfo - Debug info object
 * @param {string} type - Log type
 * @param {string} message - Log message
 * @param {any} [data] - Optional data
 */
export function pushDebugMessage(debugInfo, type, message, data) {
  if (!debugInfo) return;
  debugInfo.extractionLogs.push({ type, message, data });
}

/**
 * Increment content type counter in debug info
 * @param {DebugInfo|null} debugInfo - Debug info object
 * @param {string} contentType - Content type to increment
 */
export function incrementContentType(debugInfo, contentType) {
  if (!debugInfo) return;
  debugInfo.contentTypes[contentType] = (debugInfo.contentTypes[contentType] || 0) + 1;
}

/**
 * Safely log to console (catches errors in restricted contexts)
 * @param  {...any} args - Arguments to log
 */
export function logToConsoleSafe(...args) {
  try {
    console.log(...args);
  } catch (e) {
    // Console might not be available in some contexts
  }
}

/**
 * Safely log error to console
 * @param  {...any} args - Arguments to log
 */
export function errorToConsoleSafe(...args) {
  try {
    console.error(...args);
  } catch (e) {
    // Console might not be available in some contexts
  }
}

/**
 * Log extraction start with page information
 * @param {string} baseUrl - Base URL
 * @param {boolean} enableDebugInfo - Whether debug is enabled
 */
export function logExtractionStart(baseUrl, enableDebugInfo) {
  logToConsoleSafe('[ClipAIble] extractAutomaticallyInlined: START', { 
    baseUrl, 
    enableDebugInfo, 
    timestamp: Date.now() 
  });
}

/**
 * Log HTML state for debugging
 * @param {Document} doc - Document object
 */
export function logHtmlState(doc) {
  const actualMainContent = doc.querySelector('main, article, [role="main"], #content, #main-content');
  const actualFirstParagraph = doc.querySelector('main p, article p, [role="main"] p, #content p');
  
  logToConsoleSafe('[ClipAIble] === ACTUAL HTML ON PAGE ===', {
    documentHTMLLength: doc.documentElement.outerHTML.length,
    hasMainContent: !!actualMainContent,
    mainContentHTMLLength: actualMainContent?.innerHTML?.length || 0,
    hasFirstParagraph: !!actualFirstParagraph,
    firstParagraphText: actualFirstParagraph?.textContent?.substring(0, 200) || null,
    firstParagraphHasDataOriginalText: actualFirstParagraph?.hasAttribute('data-original-text') || false,
    timestamp: Date.now()
  });
}
