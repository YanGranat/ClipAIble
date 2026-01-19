// @ts-check
// Background service worker for ClipAIble extension
// Main entry point - uses ES modules for modular architecture

/**
 * @typedef {import('./types.js').ChromeStorageResult} ChromeStorageResult
 * @typedef {import('./types.js').SubtitleData} SubtitleData
 * @typedef {import('./types.js').InjectionResult} InjectionResult
 * @typedef {import('./types.js').ExtendedCacheEntry} ExtendedCacheEntry
 * @typedef {import('./types.js').ContentItem} ContentItem
 * @typedef {import('./types.js').ExportFormat} ExportFormat
 * @typedef {import('./types.js').ProcessingState} ProcessingState
 * @typedef {import('./types.js').ExtendedProcessingState} ExtendedProcessingState
 * @typedef {import('./types.js').ExtendedGenerationData} ExtendedGenerationData
 * @typedef {import('./types.js').AudioGenerationData} AudioGenerationData
 * @typedef {import('./types.js').RetryOptions} RetryOptions
 */

// Import logging utilities first for use in global error handlers
import { log, logError, logWarn, logDebug } from './utils/logging.js';
import { CONFIG } from './utils/config.js';
import { getUILanguage, tSync } from './locales.js';

// Global error handler for uncaught errors during module loading
// Uses logError with fallback to console.error if logging system is not yet initialized
self.addEventListener('error', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Uncaught error during module loading', event.error);
      if (event.error?.stack) {
        logError('Error stack', new Error(event.error.stack));
      }
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Uncaught error during module loading:', event.error);
      console.error('[ClipAIble] Error stack:', event.error?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Uncaught error during module loading:', event.error);
    console.error('[ClipAIble] Error stack:', event.error?.stack);
    console.error('[ClipAIble] Failed to log error:', loggingError);
  }
});

self.addEventListener('unhandledrejection', (event) => {
  try {
    if (typeof logError === 'function') {
      logError('Unhandled promise rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
      if (event.reason?.stack) {
        logError('Rejection stack', new Error(event.reason.stack));
      }
    } else {
      // Fallback if logError is not yet available (should not happen, but safety first)
      // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
      console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
      console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    }
  } catch (loggingError) {
    // Ultimate fallback if even error logging fails
    // CRITICAL: This is the ONLY acceptable use of console.error - when logging system itself fails
    console.error('[ClipAIble] Unhandled promise rejection:', event.reason);
    console.error('[ClipAIble] Rejection stack:', event.reason?.stack);
    console.error('[ClipAIble] Failed to log rejection:', loggingError);
  }
});

// Import background modules
import { initInitialization } from './background/initialization.js';
import { handleError } from './utils/error-handler.js';
import { clearDecryptedKeyCache } from './utils/encryption.js';
import { restoreStateFromStorage } from './state/processing.js';
import { runInitialization } from './initialization/index.js';
import { initKeepAlive } from './background/keep-alive.js';
import { initContextMenu } from './background/context-menu.js';
import { updateContextMenuWithLang } from './utils/context-menu.js';
import { handleQuickSave } from './background/quicksave.js';
import { initLogging } from './background/logging.js';
import { initPortListener } from './background/port-listener.js';
import { initOrchestration } from './background/orchestration.js';
import { initPopupConnectionListener } from './background/popup-connection.js';
import { 
  setError,
  setResult,
  updateState,
  ERROR_CODES,
  PROCESSING_STAGES
} from './state/processing.js';
import { 
  validateAndInitializeProcessing,
  handlePdfPageProcessing,
  handleVideoPageProcessing,
  handleStandardArticleProcessing
} from './utils/processing-helpers.js';
import { 
  checkCancellation,
  updateProgress,
  getUILanguageCached,
  handleTranslation,
  handleAbstractGeneration,
  detectEffectiveLanguage
} from './utils/pipeline-helpers.js';
import { 
  translateContent, 
  translateImages, 
  detectSourceLanguage, 
  generateAbstract, 
  detectContentLanguage 
} from './translation/index.js';
import { DocumentGeneratorFactory } from './generation/factory.js';
import { detectPdfPage, getOriginalPdfUrl } from './utils/pdf.js';
import { detectVideoPlatform } from './utils/video.js';
import { initNotifications } from './background/notifications.js';
import { 
  getProcessingState, 
  saveStateToStorageImmediate
} from './state/processing.js';

// Import processing functions needed for message routing
import { processWithoutAI, processWithExtractMode, processWithSelectorMode } from './processing/modes.js';
import { routeMessage } from './message-handlers/index.js';

// ============================================
// INITIALIZATION
// ============================================

// Initialize notifications module with DI
const notificationsModule = initNotifications({
  log,
  logError,
  logWarn,
  getUILanguage,
  tSync
});

// Initialize keep-alive module with DI
const keepAliveModule = initKeepAlive({
  log,
  logError,
  logWarn,
  CONFIG,
  getProcessingState,
  saveStateToStorageImmediate
});

// Extract keep-alive functions for use in background.js and other modules
const { startKeepAlive, stopKeepAlive, initKeepAliveListener } = keepAliveModule;

// Initialize extension initialization module with DI
const initializationModule = initInitialization({
  log,
  logWarn,
  CONFIG,
  handleError,
  clearDecryptedKeyCache,
  getProcessingState,
  restoreStateFromStorage,
  runInitialization,
  startKeepAlive
});

// Initialize extension
initializationModule();

// Initialize keep-alive listener
initKeepAliveListener();

// Initialize log collection module with DI
const loggingModule = initLogging({
  log,
  logError,
  CONFIG
});

// Extract logging functions for use in background.js and other modules
const { addLogToCollection, exportAllLogsToFile, initLogCollection } = loggingModule;

// Initialize log collection system
initLogCollection();

// Initialize port listener module with DI
const portListenerModule = initPortListener({
  log,
  logError,
  addLogToCollection
});

// Initialize port listener for offscreen logging
portListenerModule();

// Initialize popup connection listener (tracks whether popup is open)
// Used for completion notifications when popup is closed.
initPopupConnectionListener();

// Initialize orchestration module with DI (must be after keep-alive module)
const orchestrationModule = initOrchestration({
  log,
  logWarn,
  CONFIG,
  getProcessingState,
  setError,
  setResult,
  updateState,
  ERROR_CODES,
  PROCESSING_STAGES,
  validateAndInitializeProcessing,
  handlePdfPageProcessing,
  handleVideoPageProcessing,
  handleStandardArticleProcessing,
  checkCancellation,
  updateProgress,
  getUILanguageCached,
  handleTranslation,
  handleAbstractGeneration,
  detectEffectiveLanguage,
  translateContent,
  translateImages,
  detectSourceLanguage,
  generateAbstract,
  detectContentLanguage,
  DocumentGeneratorFactory,
  detectPdfPage,
  getOriginalPdfUrl,
  detectVideoPlatform,
  tSync,
  startKeepAlive,
  stopKeepAlive
});

// Extract orchestration functions for use in background.js and other modules
const { startArticleProcessing, continueProcessingPipeline } = orchestrationModule;

// Initialize context menu module with DI
const contextMenuModule = initContextMenu({
  log,
  logError,
  logWarn,
  logDebug,
  CONFIG,
  handleError,
  getUILanguage,
  updateContextMenuWithLang,
  handleQuickSave
});

// Initialize context menu listeners (will be done after extractFromPageInlined is defined)
// Use setTimeout to ensure extractFromPageInlined is available
setTimeout(() => {
  // Create wrapper for startArticleProcessing that includes extractFromPageInlined
  const startArticleProcessingWrapper = (data) => startArticleProcessing(data, extractFromPageInlined);
  contextMenuModule.initContextMenuListeners(startArticleProcessingWrapper);
}, 0);

// ============================================
// MESSAGE LISTENER
// ============================================

try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // CRITICAL: Log ALL messages at the very start to catch any issues
    // This includes messages from service worker to offscreen
    const frequentActions = ['getState', 'TTS_PROGRESS'];
    const isFrequentAction = frequentActions.includes(request?.action);
    
    // ALWAYS log messages with target: 'offscreen' to diagnose delivery issues
    if (request?.target === 'offscreen') {
      log('[ClipAIble Background] === OFFScreen MESSAGE IN LISTENER ===', {
        type: request?.type,
        target: request?.target,
        hasData: !!request?.data,
        dataKeys: request?.data ? Object.keys(request?.data) : [],
        hasPdfData: !!(request?.data && request?.data.pdfData),
        hasPdfDataRef: !!(request?.data && request?.data.pdfDataRef),
        pdfDataRef: request?.data?.pdfDataRef,
        senderId: sender?.id,
        senderUrl: sender?.url,
        isOffscreen: sender?.id === chrome.runtime.id && !sender?.tab,
        timestamp: Date.now()
      });
    }
    
    // Only log important messages (processArticle, errors, etc.)
    if (request?.action === 'processArticle') {
      log('=== chrome.runtime.onMessage: processArticle ===', {
        url: request?.data?.url,
        mode: request?.data?.mode,
        outputFormat: request?.data?.outputFormat,
        timestamp: Date.now()
      });
    }
    
    // CRITICAL: Messages with target: 'offscreen' are for offscreen document
    // Service worker must NOT handle them - return false immediately to let them pass through
    if (request.target === 'offscreen') {
      // ALWAYS log offscreen messages (even if frequent) to diagnose delivery issues
      log('[ClipAIble Background] Offscreen message detected, passing through', {
        type: request.type,
        hasData: !!request.data,
        dataKeys: request.data ? Object.keys(request.data) : [],
        hasPdfData: !!(request.data && request.data.pdfData),
        hasPdfDataRef: !!(request.data && request.data.pdfDataRef),
        pdfDataRef: request.data?.pdfDataRef,
        timestamp: Date.now()
      });
      // Return false to allow message to reach offscreen document's listener
      return false;
    }
    
    // Create wrapper for processWithSelectorMode that includes extractFromPageInlined
    const processWithSelectorModeWrapper = (data) => processWithSelectorMode(data, extractFromPageInlined);
    
    // Create wrapper for startArticleProcessing that includes extractFromPageInlined
    const startArticleProcessingWrapperForMessage = (data) => startArticleProcessing(data, extractFromPageInlined);
    
    const result = routeMessage(request, sender, sendResponse, {
      startArticleProcessing: startArticleProcessingWrapperForMessage,
      processWithSelectorMode: processWithSelectorModeWrapper,
      processWithExtractMode,
      processWithoutAI,
      stopKeepAlive,
      addLogToCollection,
      exportAllLogsToFile,
      startKeepAlive
    });
    
    if (!isFrequentAction) {
      log('=== chrome.runtime.onMessage: routeMessage returned ===', {
        action: request?.action,
        resultType: typeof result,
        isPromise: result instanceof Promise,
        isBoolean: typeof result === 'boolean',
        timestamp: Date.now()
      });
    }
    
    return result;
  });
} catch (error) {
  logError('=== background.js: Failed to register runtime.onMessage listener ===', {
    error: error?.message || String(error),
    errorStack: error?.stack,
    timestamp: Date.now()
  });
  logError('Failed to register runtime.onMessage listener', error);
}

// ============================================
// INLINED EXTRACTION FUNCTION
// ============================================
// extractFromPageInlined remains here (must be inline for chrome.scripting.executeScript)

/**
 * Extraction function for chrome.scripting.executeScript (page context)
 * 
 * Runs in MAIN world where ES modules are unavailable.
 * All helpers must be defined inside this function.
 * 
 * @param {{content?: string, title?: string, author?: string, exclude?: string, [key: string]: string|undefined}} selectors - Selectors object from AI
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {import('./types.js').InjectionResult} Extraction result
 */
export function extractFromPageInlined(selectors, baseUrl) {
  
  /** @type {ContentItem[]} */
  const content = [];
  const debugInfo = {
    containerFound: false,
    containerSelector: null,
    elementsProcessed: 0,
    elementsExcluded: 0,
    headingCount: 0
  };
  
  const tocMapping = {};
  let footnotesHeaderAdded = false;
  const addedImageUrls = new Set();
  let firstHeadingIndex = -1; // Track position of first heading for subtitle insertion
  let subtitleToInsert = null; // Store subtitle to insert after first heading
  
  // Debug info for subtitle insertion
  const subtitleDebug = {
    subtitleFound: false,
    subtitleText: null,
    firstHeadingFound: false,
    firstHeadingIndex: -1,
    firstHeadingText: null,
    titleInContent: false,
    titleAdded: false,
    subtitleInserted: false,
    subtitleInsertIndex: -1,
    contentBeforeInsert: [],
    contentAfterInsert: [],
    elementsProcessedBeforeFirstHeading: 0,
    totalContentItemsBeforeInsert: 0
  };
  
  // Helper functions
  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, c => map[c]);
  }
  
  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    try { return new URL(url, baseUrl).href; } catch (e) { 
      // Invalid URL format - fallback to original (graceful degradation)
      // This is expected for malformed URLs from page content
      return url; 
    }
  }
  
  function normalizeText(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  
  function normalizeImageUrl(url) {
    if (!url) return '';
    try { 
      // CRITICAL: window is only available in page context, not in service worker
      // This function runs in page context via executeScript, so window is safe here
      const baseUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
      const urlObj = new URL(url, baseUrl || 'http://localhost');
      // For Vercel image optimization URLs, include the 'url' query parameter in normalization
      // This ensures different images with same pathname but different query params are treated as unique
      const urlParam = urlObj.searchParams.get('url');
      if (urlParam) {
        // Include the 'url' parameter value in normalization for Vercel image URLs
        return (urlObj.pathname + '?url=' + urlParam).toLowerCase();
      }
      // For other URLs, include full pathname and search (query params) to distinguish different images
      return (urlObj.pathname + urlObj.search).toLowerCase(); 
    } catch { 
      return url.toLowerCase(); 
    }
  }
  
  function isInfoboxDiv(element) {
    if (element.tagName.toLowerCase() !== 'div') return false;
    const className = element.className.toLowerCase();
    return ['spoiler', 'interview', 'terminology', 'infobox', 'note-box', 'callout'].some(cls => className.includes(cls));
  }
  
  function shouldExclude(element) {
    const tagName = element.tagName.toLowerCase();
    const elementInfo = {
      tagName: tagName,
      id: element.id || null,
      className: element.className || null,
      matches: [],
      closest: []
    };
    
    if (isInfoboxDiv(element) || tagName === 'aside' || tagName === 'details') {
      return false;
    }
    
    if (!selectors.exclude) {
      return false;
    }
    
    // Check if element itself matches exclude selector
    for (const selector of selectors.exclude) {
      try {
        const matches = element.matches(selector);
        if (matches) {
          elementInfo.matches.push(selector);
          return true;
        }
      } catch (e) {
        // Invalid selector from AI - skip it (graceful degradation)
      }
    }
    
    // CRITICAL: Also check if element is INSIDE an excluded container
    // This allows AI to return exclude selectors for containers (e.g., ".ke.je.u.kg" for promo banner)
    // and we'll exclude all elements inside those containers
    // This is safe because:
    // 1. AI determines exclude selectors, so if it says a container should be excluded, everything inside should be excluded
    // 2. Semantic containers (article, main) are already handled at the start of this function
    // 3. We only check closest() if the element itself doesn't match (already checked above)
    for (const selector of selectors.exclude) {
      try {
        const closestExcluded = element.closest(selector);
        if (closestExcluded && closestExcluded !== element) {
          elementInfo.closest.push(selector);
          return true;
        }
      } catch (e) {
        // Invalid selector - skip it
      }
    }
    
    return false;
  }
  
  function getFormattedHtml(element) {
    const clone = element.cloneNode(true);
    
    // CRITICAL: Remove data-footnote* attributes that contain HTML-encoded text
    // These attributes can leak HTML-encoded content (with attributes) into the final text
    // Example: data-footnote2-content="&lt;a href=&quot;...&quot; target=&quot;_blank&quot;&gt;" can leak "target="_blank"" into text
    clone.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-footnote')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    // CRITICAL: Process ALL anchor tags, not just those with href
    // This ensures all <a> tags are properly handled, even if href is missing or invalid
    clone.querySelectorAll('a').forEach(a => {
      const originalHref = a.getAttribute('href');
      if (originalHref) {
        // Normalize href to absolute URL
        // CRITICAL: Use setAttribute instead of a.href property to ensure HTML attribute is preserved
        // Setting a.href only updates DOM property, not HTML attribute, so it may be lost in innerHTML
        const normalizedHref = toAbsoluteUrl(originalHref);
        if (normalizedHref && normalizedHref.trim()) {
          a.setAttribute('href', normalizedHref);
        } else {
          // If toAbsoluteUrl returns empty/invalid, use original href or fallback to #
          a.setAttribute('href', originalHref || '#');
        }
        // CRITICAL: Remove target and rel attributes to prevent them from leaking into text
        // The target attribute will be added later by sanitizeHtml if needed
        a.removeAttribute('target');
        a.removeAttribute('rel');
      } else {
        // CRITICAL: If anchor tag has no href, add href="#" to prevent unclosed tags
        // This ensures all <a> tags have a valid href attribute
        a.setAttribute('href', '#');
      }
    });
    
    // CRITICAL: Convert inline divs to spans to prevent line breaks in sanitizeHtml
    // sanitizeHtml replaces </div> with <br>, which breaks inline structure
    // For div.public-DraftStyleDefault-block, we need to preserve inline structure
    clone.querySelectorAll('div').forEach(div => {
      try {
        const style = window.getComputedStyle(div);
        if (style.display === 'inline' || style.display === 'inline-block' || style.display === 'inline-flex') {
          // Convert inline div to span to preserve inline structure
          const span = document.createElement('span');
          Array.from(div.attributes).forEach(attr => {
            if (attr.name !== 'style' || !attr.value.includes('display')) {
              span.setAttribute(attr.name, attr.value);
            }
          });
          // Preserve inline styles except display (span is inline by default)
          if (div.style.cssText) {
            const inlineStyles = div.style.cssText.replace(/display\s*:\s*[^;]+;?/gi, '').trim();
            if (inlineStyles) {
              span.setAttribute('style', inlineStyles);
            }
          }
          span.innerHTML = div.innerHTML;
          div.parentNode?.replaceChild(span, div);
        }
      } catch (e) {
        // If style check fails, leave div as-is (graceful degradation)
      }
    });
    
    if (selectors.exclude && Array.isArray(selectors.exclude)) {
      selectors.exclude.forEach(sel => { 
        try { 
          clone.querySelectorAll(sel).forEach(el => el.remove()); 
        } catch (e) {
          // Invalid selector from AI - skip it (graceful degradation)
          // This is expected - AI may provide invalid selectors, we just skip them
        }
      });
    }
    
    // CRITICAL: Convert <font> tags to <span> tags to preserve content (especially footnotes)
    // <font> is deprecated but still used on old websites (like paulgraham.com for footnotes)
    // Example: <font color="#999999">[<a href="#f1n"><font color="#999999">1</font></a>]</font> should become <span>[<a href="#f1n"><span>1</span></a>]</span>
    // CRITICAL: Process recursively to handle nested <font> tags
    function convertFontToSpan(element) {
      const fonts = element.querySelectorAll('font');
      // Process from deepest to shallowest to avoid breaking DOM structure
      const fontsArray = Array.from(fonts).reverse();
      fontsArray.forEach(font => {
        const span = document.createElement('span');
        // Copy all attributes from font to span (especially color for footnotes)
        Array.from(font.attributes).forEach(attr => {
          span.setAttribute(attr.name, attr.value);
        });
        span.innerHTML = font.innerHTML;
        font.parentNode?.replaceChild(span, font);
      });
    }
    // Process all font tags recursively
    convertFontToSpan(clone);
    
    // CRITICAL: Convert inline styles to HTML tags before sanitizeHtml removes style attributes
    // This preserves formatting (bold/italic) that would otherwise be lost
    clone.querySelectorAll('span[style]').forEach(span => {
      const style = span.getAttribute('style') || '';
      const styleLower = style.toLowerCase();
      
      // Check for font-weight: bold
      if (styleLower.includes('font-weight') && (styleLower.includes('bold') || styleLower.includes('700') || styleLower.includes('800') || styleLower.includes('900'))) {
        const strong = document.createElement('strong');
        strong.innerHTML = span.innerHTML;
        // Copy other attributes except style
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'style') {
            strong.setAttribute(attr.name, attr.value);
          }
        });
        span.parentNode?.replaceChild(strong, span);
      }
      // Check for font-style: italic
      else if (styleLower.includes('font-style') && styleLower.includes('italic')) {
        const em = document.createElement('em');
        em.innerHTML = span.innerHTML;
        // Copy other attributes except style
        Array.from(span.attributes).forEach(attr => {
          if (attr.name !== 'style') {
            em.setAttribute(attr.name, attr.value);
          }
        });
        span.parentNode?.replaceChild(em, span);
      }
    });
    
    // CRITICAL: Extract text from HTML comments (Vue.js/Nuxt.js pattern: <!--[-->text<!--]-->)
    // Before returning HTML, extract text from comments and make it visible
    // This ensures text inside comments is preserved when comments are removed
    let htmlResult = clone.innerHTML;
    
    // Replace Vue.js/Nuxt.js comment pattern: <!--[-->text<!--]-->
    // This pattern wraps text in comments, we need to extract the text
    htmlResult = htmlResult.replace(/<!--\[-->/g, '');
    htmlResult = htmlResult.replace(/<!--\]-->/g, '');
    // Also handle other HTML comments that might wrap text
    htmlResult = htmlResult.replace(/<!--([\s\S]*?)-->/g, (match, commentContent) => {
      // If comment contains text (not just whitespace), preserve it
      const trimmed = commentContent.trim();
      return trimmed.length > 0 ? trimmed : '';
    });
    
    // CRITICAL: Ensure all <a> tags are properly closed
    // Count opening and closing tags
    const openTags = (htmlResult.match(/<a\b[^>]*>/gi) || []).length;
    const closeTags = (htmlResult.match(/<\/a>/gi) || []).length;
    // If there are unclosed tags, close them at the end
    if (openTags > closeTags) {
      const missing = openTags - closeTags;
      htmlResult = htmlResult + '</a>'.repeat(missing);
    }
    
    return htmlResult;
  }
  
  // Image helpers
  function isImageUrl(url) {
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
    const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
    const hosts = ['substackcdn', 'imgur', 'cloudinary', 'imgix', 'wp-content/uploads', 'media.', 'images.', 'cdn.'];
    const lowerUrl = url.toLowerCase();
    for (const ext of exts) { if (lowerUrl.includes(ext + '?') || lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '#')) return true; }
    if (hosts.some(host => lowerUrl.includes(host))) return true;
    return false;
  }
  
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:') && url.length < 200) return true;
    return ['placeholder', 'spacer', 'blank.gif', 'pixel.gif', 'loading.'].some(p => lowerUrl.includes(p));
  }
  
  function isSmallOrAvatarImage(imgElement, src) {
    if (!src) return true;
    const resizeMatch = src.match(/resize:(fit|fill):(\d+)(?::(\d+))?/);
    if (resizeMatch) {
      const w = parseInt(resizeMatch[2]), h = resizeMatch[3] ? parseInt(resizeMatch[3]) : w;
      if (w < 100 || h < 100) return true;
    }
    if (imgElement) {
      const nw = imgElement.naturalWidth || 0, nh = imgElement.naturalHeight || 0;
      if (nw > 0 && nh > 0 && (nw < 100 || nh < 100)) return true;
      const cn = (imgElement.className || '').toLowerCase();
      if (cn.includes('avatar') || cn.includes('profile') || cn.includes('author')) return true;
    }
    return false;
  }
  
  function getBestSrcsetUrl(srcset) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(s => s);
    let bestUrl = null, bestScore = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part || part.startsWith('data:')) continue;
      const descMatch = part.match(/\s+(\d+(?:\.\d+)?[wx])$/i);
      let url = descMatch ? part.substring(0, part.length - descMatch[0].length).trim() : part;
      if (!url || url.startsWith('data:')) continue;
      url = url.replace(/^["']|["']$/g, '');
      if (!url.match(/^(https?:\/\/|\/\/|\/)/)) continue;
      let score = 1;
      if (descMatch) {
        const d = descMatch[1].toLowerCase();
        score = d.endsWith('w') ? (parseInt(d) || 1) : ((parseFloat(d) || 1) * 1000);
      }
      if (score >= bestScore) { bestScore = score; bestUrl = url; }
    }
    return bestUrl;
  }
  
  function isTrackingPixelOrSpacer(imgElement, src) {
    const w = imgElement?.naturalWidth || imgElement?.width || parseInt(imgElement?.getAttribute('width')) || 0;
    const h = imgElement?.naturalHeight || imgElement?.height || parseInt(imgElement?.getAttribute('height')) || 0;
    if ((w === 1 && h === 1) || (w === 0 && h === 0)) return true;
    if (src) {
      const ls = src.toLowerCase();
      if (ls.includes('spacer') || ls.includes('pixel') || ls.includes('tracking')) return true;
    }
    return false;
  }
  
  function extractBestImageUrl(imgElement, containerElement = null) {
    if (!imgElement) return null;
    let src = null;
    const container = containerElement || imgElement.parentElement;
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc)) src = imgElement.currentSrc;
    if (!src) {
      const parentLink = container?.closest('a[href]') || container?.querySelector('a[href]');
      if (parentLink) { const href = parentLink.getAttribute('href'); if (href && isImageUrl(href)) src = href; }
    }
    if (!src) { const imgSrc = imgElement.src || imgElement.getAttribute('src'); if (imgSrc && !isPlaceholderUrl(imgSrc)) src = imgSrc; }
    if (!src) src = getBestSrcsetUrl(imgElement.getAttribute('srcset'));
    if (!src) {
      const picture = imgElement.closest('picture') || container?.querySelector('picture');
      if (picture) { for (const source of picture.querySelectorAll('source[srcset]')) { const ss = getBestSrcsetUrl(source.getAttribute('srcset')); if (ss) src = ss; } }
    }
    if (!src) {
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-full-src']) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes('data:')) { src = attr === 'data-srcset' ? getBestSrcsetUrl(val) : val; if (src) break; }
      }
    }
    return src;
  }
  
  function getImageCaption(img) {
    if (!img) return '';
    // Check for figcaption in figure
    const figure = img.closest('figure');
    if (figure) {
      const figcaption = figure.querySelector('figcaption');
      if (figcaption) return (figcaption.textContent || '').trim();
    }
    // Check aria-label
    const ariaLabel = img.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) return ariaLabel.trim();
    // Check title
    const title = img.getAttribute('title');
    if (title && title.trim() && title !== img.alt) return title.trim();
    // Check next sibling if it's a paragraph or has caption class
    const nextSibling = img.nextElementSibling;
    if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
      return (nextSibling.textContent || '').trim();
    }
    // Check parent container's caption
    const parent = img.parentElement;
    if (parent) {
      const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
      if (captionEl) {
        const captionText = (captionEl.textContent || '').trim();
        if (captionText && captionText !== img.alt) return captionText;
      }
    }
    return '';
  }
  
  function extractTocMapping(listElement) {
    const links = listElement.querySelectorAll('a[href^="#"]');
    if (links.length < 2) return false;
    let isToc = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const anchor = href.substring(1), text = normalizeText(link.textContent);
        if (text && anchor) { tocMapping[text] = anchor; isToc = true; }
      }
    });
    return isToc;
  }
  
  // Helper function to check if element is visible
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           rect.width > 0 && 
           rect.height > 0;
  }
  
  // Find containers
  // CRITICAL: Search for articleContainer FIRST, not content selector
  // content selector is for finding content INSIDE containers, not for finding containers themselves
  let containers = [];
  let container = null;
  
  // CRITICAL: Only use articleContainer for finding containers, NOT content selector
  // content selector is for finding content INSIDE containers, not containers themselves
  // If we use content selector to find containers, we'll get wrong results (e.g., 9 .wysiwyg elements instead of 1 main#main-content-area)
  if (selectors.articleContainer) {
    try {
      const allElements = document.querySelectorAll(selectors.articleContainer);
      if (allElements.length > 1) {
        containers = Array.from(allElements);
        debugInfo.containerFound = true;
        debugInfo.containerSelector = selectors.articleContainer;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
      } else if (allElements.length === 1) {
        container = allElements[0];
        debugInfo.containerFound = true;
        debugInfo.containerSelector = selectors.articleContainer;
      }
    } catch (e) {
      // Invalid selector from AI - will try fallback below (graceful degradation)
    }
  }
  
  // FALLBACK: If articleContainer not found but content selector exists, use parent of content element as container
  // This is safer than falling back to body, but only if content selector finds exactly one element
  // Using content selector directly as container is wrong (as shown in aljazeera.com case)
  if (containers.length === 0 && !container && selectors.content) {
    try {
      const contentElements = document.querySelectorAll(selectors.content);
      if (contentElements.length === 1) {
        // Use parent of content element as container (more specific than body)
        const contentElement = contentElements[0];
        const parent = contentElement.parentElement;
        if (parent && parent !== document.body && parent !== document.documentElement) {
          container = parent;
          debugInfo.containerFound = true;
          debugInfo.containerSelector = `parent of ${selectors.content}`;
        }
      }
    } catch (e) {
      // Invalid content selector - will fallback to body (graceful degradation)
    }
  }
  
  // CRITICAL FIX: Filter out hidden containers
  if (containers.length > 0) {
    const visibleContainers = containers.filter(isElementVisible);
    debugInfo.filteredHiddenContainers = containers.length - visibleContainers.length;
    if (debugInfo.filteredHiddenContainers > 0) {
      console.log('[ClipAIble extractFromPageInlined] Filtered out', debugInfo.filteredHiddenContainers, 'hidden container(s)');
    }
    containers = visibleContainers;
  } else if (container) {
    if (!isElementVisible(container)) {
      debugInfo.filteredHiddenContainers = 1;
      console.log('[ClipAIble extractFromPageInlined] Single container is hidden, discarding');
      container = null; // Discard hidden single container
    }
  }
  
  if (container && containers.length === 0) {
    // CRITICAL FIX: Before splitting container into articles, check if it contains the content element
    // If the main container contains the content selector, don't split it into articles
    // This prevents issues where main#main-content-area contains .wysiwyg, but we split it into article elements
    // that don't contain .wysiwyg (e.g., recommended articles, playlist items)
    let shouldSplitIntoArticles = true;
    if (selectors.content) {
      try {
        // Normalize content selector: remove container selector prefix if present
        let normalizedContentSelector = selectors.content;
        if (selectors.articleContainer && normalizedContentSelector.includes(selectors.articleContainer)) {
          // Remove container selector from the beginning of content selector
          normalizedContentSelector = normalizedContentSelector.replace(selectors.articleContainer, '').trim();
          // Remove leading space or > if present
          if (normalizedContentSelector.startsWith(' ')) {
            normalizedContentSelector = normalizedContentSelector.substring(1);
          }
          if (normalizedContentSelector.startsWith('>')) {
            normalizedContentSelector = normalizedContentSelector.substring(1).trim();
          }
        }
        
        // Check if the main container contains elements matching the normalized content selector
        const contentInMainContainer = normalizedContentSelector ? container.querySelector(normalizedContentSelector) : null;
        if (contentInMainContainer && container.contains(contentInMainContainer)) {
          // Main container contains the content - don't split it
          shouldSplitIntoArticles = false;
        }
      } catch (e) {
        // Invalid selector, continue with split logic
      }
    }
    
    if (shouldSplitIntoArticles) {
      const articlesInside = container.querySelectorAll('article');
      if (articlesInside.length > 1) {
        const visibleArticles = Array.from(articlesInside).filter(isElementVisible);
        containers = visibleArticles;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
        debugInfo.filteredHiddenContainers = articlesInside.length - visibleArticles.length;
        container = null;
      }
    }
  }
  
  if (containers.length === 0 && !container) {
    container = document.body;
    debugInfo.containerSelector = 'body';
  }
  
  // Get title
  let articleTitle = '';
  if (selectors.title) {
    try { 
      const titleEl = document.querySelector(selectors.title); 
      if (titleEl) articleTitle = titleEl.textContent.trim(); 
    } catch (e) {
      // Invalid title selector from AI - fallback to default title extraction (graceful degradation)
      // This is expected - AI may provide invalid selectors, we use fallback below
    }
  }
  if (!articleTitle) {
    const allArticles = document.querySelectorAll('main article');
    if (allArticles.length > 1) {
      const h1OutsideMain = Array.from(document.querySelectorAll('h1')).find(h1 => !h1.closest('main'));
      if (h1OutsideMain) articleTitle = h1OutsideMain.textContent.trim();
    }
  }
  if (!articleTitle) { const h1 = document.querySelector('h1'); if (h1) articleTitle = h1.textContent.trim(); }
  
  // Clean title from service data immediately after extraction
  // Note: cleanTitleFromServiceTokens is not available in page context, so we inline the logic here
  // This is the only place where we need to clean title in page context
  if (articleTitle && typeof articleTitle === 'string') {
    let cleaned = articleTitle;
    cleaned = cleaned.replace(/budgettoken[_\s]*budget\d*/gi, '');
    cleaned = cleaned.replace(/budget\d+/gi, '');
    cleaned = cleaned.replace(/token/gi, '');
    cleaned = cleaned.replace(/budget\w+/gi, '');
    cleaned = cleaned.replace(/#+/g, '');
    cleaned = cleaned.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^[_\s-]+|[_\s-]+$/g, '');
    articleTitle = cleaned || articleTitle;
  }
  
  let articleAuthor = selectors.author || '';
  // NOTE: Author cleaning is now handled by AI in prompts
  // AI is instructed to return author name without prefixes (from, by, author:, etc.)
  // If author still contains prefix, it's a prompt issue - improve prompts, don't add code-side fixes
  
  let publishDate = '';
  for (const sel of ['time[datetime]', 'time', '[itemprop="datePublished"]', '.date', '.post-date']) {
    try {
      const dateEl = document.querySelector(sel);
      if (dateEl) {
        if (sel.startsWith('meta')) publishDate = dateEl.getAttribute('content') || '';
        else if (dateEl.hasAttribute('datetime')) publishDate = dateEl.getAttribute('datetime');
        else publishDate = dateEl.textContent.trim();
        if (publishDate) break;
      }
    } catch (e) {
      // Invalid selector - try next one (graceful degradation)
      // This is expected for fallback selectors
    }
  }
  
  function getAnchorId(el) {
    if (el.id) return el.id;
    if (el.getAttribute && el.getAttribute('name')) return el.getAttribute('name');
    const fc = el.firstElementChild;
    if (fc) {
      const ct = fc.tagName?.toLowerCase();
      if (ct === 'a' || ct === 'span') {
        if (fc.id) return fc.id;
        if (fc.getAttribute && fc.getAttribute('name')) return fc.getAttribute('name');
      }
    }
    const nested = el.querySelector('a[id], a[name], span[id], span[name], sup[id], [id^="source"], [id^="ref"], [id^="cite"]');
    if (nested) return nested.id || nested.getAttribute('name') || '';
    return '';
  }
  
  function processElement(element) {
    const tagName = element.tagName.toLowerCase();
    const elementInfo = {
      tagName: tagName,
      id: element.id || null,
      className: element.className || null,
      textContentLength: element.textContent ? element.textContent.trim().length : 0,
      textContentPreview: element.textContent ? element.textContent.trim().substring(0, 100) : null
    };
    
    if (shouldExclude(element)) {
      debugInfo.elementsExcluded++;
      return;
    }
    
    let cssHidden = false;
    let cssDisplay = null;
    let cssVisibility = null;
    try { 
      const style = window.getComputedStyle(element);
      cssDisplay = style.display;
      cssVisibility = style.visibility;
      if (style.display === 'none' || style.visibility === 'hidden') {
        cssHidden = true;
        return;
      }
    } catch (e) {
      // getComputedStyle may fail on some elements (e.g., SVG in some browsers)
      // This is expected - continue processing the element (graceful degradation)
    }
    
    debugInfo.elementsProcessed++;
    const elementId = getAnchorId(element);
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = element.textContent.trim();
      const formattedText = getFormattedHtml(element);
      // Include heading even if it matches articleTitle (it's the main title)
      // Only skip if it's clearly author name or other metadata
      if (text) {
        if (articleAuthor) {
          const tl = text.toLowerCase(), al = articleAuthor.toLowerCase();
          if (tl === al || (text.length < 50 && tl.includes(al))) return;
        }
        let headingId = elementId;
        if (!headingId) {
          const nh = normalizeText(text);
          if (tocMapping[nh]) headingId = tocMapping[nh];
          else headingId = String(debugInfo.headingCount + 1);
        }
        debugInfo.headingCount++;
        const headingItem = { type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId };
        content.push(headingItem);
        
        // Track first heading position and insert subtitle immediately after it
        // This ensures subtitle is right after the title, before any other content
        if (firstHeadingIndex === -1) {
          firstHeadingIndex = content.length - 1;
          subtitleDebug.firstHeadingFound = true;
          subtitleDebug.firstHeadingIndex = firstHeadingIndex;
          subtitleDebug.firstHeadingText = text.substring(0, 100);
          subtitleDebug.titleInContent = articleTitle && (
            text === articleTitle || text.toLowerCase() === articleTitle.toLowerCase()
          );
          // If we have a subtitle to insert, insert it now (right after this heading)
          if (subtitleToInsert) {
            content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
            subtitleDebug.subtitleInserted = true;
            subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
            subtitleToInsert = null; // Clear it so we don't insert it again
          }
        }
      }
    }
    else if (tagName === 'p' || tagName === 'font') {
      // Handle both <p> and <font> elements as paragraphs
      // <font> is a deprecated HTML tag but still used on some old websites (like paulgraham.com)
      
      // CRITICAL: If paragraph contains only an image (common pattern on many websites),
      // extract the image separately instead of treating it as a paragraph
      // This ensures images are properly extracted even when wrapped in paragraphs
      const img = element.querySelector('img');
      if (img) {
        // Check if paragraph contains only image (or image in link) with minimal text
        const textContent = element.textContent?.trim() || '';
        const hasOnlyImage = textContent.length === 0 || textContent.replace(/\s+/g, '').length === 0;
        
        if (hasOnlyImage) {
          // CRITICAL: Process the image directly instead of skipping
          // If we just return, the image might not be processed if it's inside a paragraph
          // that was processed before querySelectorAll('img') runs
          // Process the image element directly to ensure it's added
          if (!img.closest('figure') && !img.closest('picture')) {
            let src = extractBestImageUrl(img);
            src = toAbsoluteUrl(src);
            const ns = normalizeImageUrl(src);
            if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
              const imgId = getAnchorId(img);
              content.push({ type: 'image', src: src, alt: img.alt || '', id: imgId });
              addedImageUrls.add(ns);
            }
          }
          
          // Skip the paragraph itself
          return;
        }
      }
      
      let html = getFormattedHtml(element);
      
      if (html.trim()) {
        const pt = element.textContent?.trim() || '';
        if (articleAuthor && pt === articleAuthor) return;
        const ct = pt.replace(/[\s\u00A0]/g, '');
        if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
        if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
        
        content.push({ type: 'paragraph', text: html, id: elementId });
      }
    }
    else if (tagName === 'img') {
      if (element.closest('figure')) return;
      if (element.closest('picture')) return; // Skip img inside picture - handled separately
      
      let src = extractBestImageUrl(element);
      src = toAbsoluteUrl(src);
      const ns = normalizeImageUrl(src);
      
      if (src && !isTrackingPixelOrSpacer(element, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(element, src)) {
        content.push({ type: 'image', src: src, alt: element.alt || '', id: elementId });
        addedImageUrls.add(ns);
      }
    }
    else if (tagName === 'picture') {
      // Handle picture element - extract img from inside picture
      // CRITICAL: Skip if inside figure (figure handles it with better caption extraction)
      if (element.closest('figure')) return;
      
      let src = null;
      let alt = '';
      let imgElement = null;
      
      // First, try to find img element inside picture
      const img = element.querySelector('img');
      if (img) {
        src = extractBestImageUrl(img, element);
        alt = img.alt || '';
        imgElement = img;
      } else {
        // If no img, extract from source elements
        // Check source[srcset] first (most common)
        const sourcesWithSrcset = element.querySelectorAll('source[srcset]');
        const sourcesWithSrc = element.querySelectorAll('source[src]');
        for (const source of sourcesWithSrcset) {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            const candidate = getBestSrcsetUrl(srcset);
            if (candidate && !isPlaceholderUrl(candidate)) {
              src = candidate;
              break;
            }
          }
        }
        // Fallback to source[src] if no srcset found
        if (!src) {
          for (const source of sourcesWithSrc) {
            const sourceSrc = source.getAttribute('src');
            if (sourceSrc && !isPlaceholderUrl(sourceSrc)) {
              src = sourceSrc;
              break;
            }
          }
        }
      }
      
      if (src) {
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        // Use imgElement for filtering if available, otherwise use element
        const elementForFiltering = imgElement || element;
        const isTracking = isTrackingPixelOrSpacer(elementForFiltering, src);
        const isPlaceholder = isPlaceholderUrl(src);
        const isDuplicate = addedImageUrls.has(ns);
        const isSmall = isSmallOrAvatarImage(elementForFiltering, src);
        if (!isTracking && !isPlaceholder && !isDuplicate && !isSmall) {
          // Extract caption using standard method (if img exists, otherwise try picture element)
          // getImageCaption works with any element, but prefers img for alt attribute
          const caption = imgElement ? getImageCaption(imgElement) : (element.getAttribute('aria-label') || element.getAttribute('title') || '');
          content.push({ 
            type: 'image', 
            src: src, 
            alt: alt, 
            caption: caption,
            id: elementId || (imgElement ? imgElement.id : '') || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'figure') {
      // Handle figure element - can contain img directly or picture>img
      // CRITICAL: Check for picture first, then fallback to direct img
      const picture = element.querySelector('picture');
      const img = picture ? picture.querySelector('img') : element.querySelector('img');
      const figcaption = element.querySelector('figcaption');
      if (img) {
        let src = extractBestImageUrl(img, picture || element);
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
          let captionText = figcaption ? getFormattedHtml(figcaption) : '';
          // CRITICAL: Clean up problematic HTML but preserve links and formatting
          // getFormattedHtml already removes target and rel attributes from links
          // Remove any img tags from caption (images shouldn't be in captions)
          captionText = captionText.replace(/<img[^>]*>/gi, '');
          // Remove any URL fragments or file extensions that might have leaked into text
          // Pattern: "filename.jpg"> or filename.jpg"> (standalone, not in tags)
          // Match only if preceded by space or start of string, and followed by >
          captionText = captionText.replace(/(^|\s)(["']?[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)["']?\s*>)>/gi, '$1');
          // Remove any remaining attribute-like fragments that leaked (target="_blank">, etc.)
          // But only if they're standalone (not inside proper HTML tags)
          // Match pattern like: target="_blank"> or href="..."> at word boundaries
          // CRITICAL: Don't match if it's part of a closing tag like </a>
          captionText = captionText.replace(/(^|\s)([a-zA-Z-]+\s*=\s*["'][^"']*["']\s*>)>/gi, (match, p1, p2, offset, fullString) => {
            // Check if this is part of a closing tag (</a>, </span>, etc.)
            const beforeMatch = fullString.substring(Math.max(0, offset - 10), offset);
            if (beforeMatch.includes('</')) {
              return match; // Don't remove if it's part of a closing tag
            }
            return p1; // Remove the attribute fragment
          });
          // Remove any standalone closing > that might be left at start or end
          // CRITICAL: Don't remove > from closing tags like </a>
          captionText = captionText.replace(/^\s*>\s*(?!<\/)/, '').replace(/(?<!<\/)\s*>\s*$/, '');
          
          // CRITICAL: Ensure all <a> tags are properly closed
          // Count opening and closing tags
          const openTags = (captionText.match(/<a\b[^>]*>/gi) || []).length;
          const closeTags = (captionText.match(/<\/a>/gi) || []).length;
          // If there are unclosed tags, close them at the end
          if (openTags > closeTags) {
            const missing = openTags - closeTags;
            captionText = captionText + '</a>'.repeat(missing);
          }
          content.push({ 
            type: 'image', 
            src: src, 
            alt: img.alt || '', 
            caption: captionText.trim(),
            id: elementId || img.id || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'blockquote') {
      content.push({ type: 'quote', text: getFormattedHtml(element), id: elementId });
    }
    else if (tagName === 'ul' || tagName === 'ol') {
      if (Object.keys(tocMapping).length === 0) extractTocMapping(element);
      const items = Array.from(element.querySelectorAll(':scope > li')).map(li => {
        const liId = getAnchorId(li);
        let html = getFormattedHtml(li);
        if (liId && !html.includes(`id="${liId}"`)) html = `<a id="${liId}" name="${liId}"></a>${html}`;
        return { html, id: liId };
      }).filter(item => item.html);
      if (items.length > 0) content.push({ type: 'list', ordered: tagName === 'ol', items: items, id: elementId });
    }
    else if (tagName === 'pre') {
      const code = element.querySelector('code');
      const text = code ? code.textContent : element.textContent;
      const langClass = code?.className.match(/language-(\w+)/);
      content.push({ type: 'code', language: langClass ? langClass[1] : 'text', text: text, id: elementId });
    }
    else if (tagName === 'table') {
      const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(element.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => getFormattedHtml(td)));
      if (headers.length > 0 || rows.length > 0) content.push({ type: 'table', headers: headers, rows: rows, id: elementId });
    }
    else if (tagName === 'hr') {
      content.push({ type: 'separator', id: elementId });
    }
    else if (tagName === 'aside' || tagName === 'details' || isInfoboxDiv(element)) {
      const summary = element.querySelector(':scope > summary');
      const titleEl = element.querySelector(':scope > .spoiler-title, :scope > .interview-title, :scope > h3, :scope > h4');
      const titleText = summary ? summary.textContent.trim() : (titleEl ? titleEl.textContent.trim() : '');
      content.push({ type: 'infobox_start', title: titleText, id: elementId });
      for (const child of element.children) {
        const ct = child.tagName.toLowerCase();
        const isTitle = ct === 'summary' || child.classList.contains('spoiler-title') || (titleText && child.textContent.trim() === titleText);
        if (!isTitle) processElement(child);
      }
      content.push({ type: 'infobox_end' });
    }
    else if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const cn = element.className?.toLowerCase() || '';
      const elId = element.id?.toLowerCase() || '';
      const isFootnotes = cn.includes('footnotes') || elId.includes('footnotes');
      if (isFootnotes && !footnotesHeaderAdded) {
        content.push({ type: 'separator', id: '' });
        // Use 'Footnotes' as fallback - localization happens later in html-builder.js
        // PDF_LOCALIZATION is not available in page context
        content.push({ type: 'heading', level: 2, text: 'Footnotes', id: 'footnotes-section' });
        footnotesHeaderAdded = true;
      }
      
      // CRITICAL: Check if this div is actually a paragraph (no direct block-level children)
      // If it has direct block-level children, it's a container - process children
      // If it doesn't, it might be a paragraph - check if it should be treated as one
      const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote'];
      const hasDirectBlockChildren = Array.from(element.children).some(child => {
        const childTag = child.tagName.toLowerCase();
        return blockTags.includes(childTag);
      });
      
      if (hasDirectBlockChildren) {
        // It's a container - process children
        for (const child of element.children) processElement(child);
      } else {
        // It might be a paragraph - check if it has significant text and is block-level
        const textContent = element.textContent?.trim() || '';
        const hasSignificantText = textContent.length >= 20;
        
        let isBlockLevel = false;
        try {
          const style = window.getComputedStyle(element);
          const display = style.display;
          isBlockLevel = ['block', 'flex', 'grid', 'table', 'list-item'].includes(display) || 
                        display.startsWith('table-') || 
                        display === 'flow-root';
        } catch (e) {
          const fallbackBlockTags = ['main', 'header', 'footer', 'nav', 'address', 'fieldset', 'legend', 
                                     'center', 'font', 'big', 'small', 'tt', 'marquee'];
          isBlockLevel = fallbackBlockTags.includes(tagName);
        }
        
        if (hasSignificantText && isBlockLevel) {
          let html = getFormattedHtml(element);
          // CRITICAL: If getFormattedHtml returns empty string, use textContent as fallback
          // This ensures div-paragraphs are not lost if getFormattedHtml removes all content
          if (!html.trim()) {
            html = textContent;
          }
          if (html.trim()) {
            const pt = textContent;
            if (articleAuthor && pt === articleAuthor) return;
            const ct = pt.replace(/[\s\u00A0]/g, '');
            if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
            if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
              html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
            }
            content.push({ type: 'paragraph', text: html, id: elementId });
          }
        } else if (hasSignificantText) {
          // If element has text but is not block-level, process its children instead
          for (const child of element.children) {
            processElement(child);
          }
        } else {
          // No significant text - process children anyway
          for (const child of element.children) {
            processElement(child);
          }
        }
      }
    }
    else {
      // FALLBACK: Handle any unprocessed element that contains significant text content
      // This covers:
      // - Deprecated HTML tags: <font>, <center>, <b>, <i>, <u>, <s>, <strike>, <big>, <small>, <tt>
      // - Non-standard tags used by some websites
      // - Block-level elements not explicitly handled: <main>, <header>, <footer>, <nav>, <address>, <fieldset>
      // - Any other element that contains meaningful content
      
      const textContent = element.textContent?.trim() || '';
      const hasSignificantText = textContent.length >= 20; // Minimum meaningful text length
      
      // Check if element is block-level or has block display
      let isBlockLevel = false;
      try {
        const style = window.getComputedStyle(element);
        const display = style.display;
        // Block-level displays
        isBlockLevel = ['block', 'flex', 'grid', 'table', 'list-item'].includes(display) || 
                       display.startsWith('table-') || 
                       display === 'flow-root';
      } catch (e) {
        // If style check fails, check by tag name (common block elements)
        const blockTags = ['main', 'header', 'footer', 'nav', 'address', 'fieldset', 'legend', 
                          'center', 'font', 'big', 'small', 'tt', 'marquee'];
        isBlockLevel = blockTags.includes(tagName);
      }
      
      // If element has significant text and is block-level, treat as paragraph
      if (hasSignificantText && isBlockLevel) {
        let html = getFormattedHtml(element);
        if (html.trim()) {
          const pt = textContent;
          if (articleAuthor && pt === articleAuthor) return;
          const ct = pt.replace(/[\s\u00A0]/g, '');
          if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
          if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) {
            html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
          }
          content.push({ type: 'paragraph', text: html, id: elementId });
        }
      } else if (hasSignificantText) {
        // If element has text but is not block-level, process its children instead
        // This handles inline elements that might contain block content
        for (const child of element.children) {
          processElement(child);
        }
      }
    }
  }
  
  // Helper function to find content elements with fallback strategies
  function findContentElements(container, contentSelector, containerSelector) {
    const debugLog = [];
    
    if (!contentSelector || contentSelector === containerSelector) {
      debugLog.push({ strategy: 'none', reason: 'No content selector or same as container', found: 0 });
      return { elements: null, debug: debugLog };
    }
    
    try {
      // Strategy 1: Try selector as-is (absolute from document)
      let elements = document.querySelectorAll(contentSelector);
      debugLog.push({ strategy: 1, method: 'document.querySelectorAll', selector: contentSelector, found: elements.length });
      if (elements.length > 0) {
        // Filter to only elements that are inside our container AND visible
        const filtered = Array.from(elements).filter(el => container.contains(el) && isElementVisible(el));
        debugLog.push({ strategy: 1, filtered: filtered.length, containerMatches: filtered.length > 0, visibleOnly: true });
        if (filtered.length > 0) {
          return { elements: filtered, debug: debugLog };
        }
      }
      
      // Strategy 2: Try selector relative to container
      elements = container.querySelectorAll(contentSelector);
      debugLog.push({ strategy: 2, method: 'container.querySelectorAll', selector: contentSelector, found: elements.length });
      if (elements.length > 0) {
        // Filter to only visible elements
        const visibleElements = Array.from(elements).filter(isElementVisible);
        debugLog.push({ strategy: 2, visibleFiltered: visibleElements.length, originalCount: elements.length });
        if (visibleElements.length > 0) {
          return { elements: visibleElements, debug: debugLog };
        }
      }
      
      // Strategy 3: If selector contains container selector, try removing it
      let normalizedSelector = contentSelector;
      if (containerSelector && contentSelector.includes(containerSelector)) {
        normalizedSelector = contentSelector.replace(containerSelector, '').trim();
        if (normalizedSelector.startsWith(' ')) {
          normalizedSelector = normalizedSelector.substring(1);
        }
        if (normalizedSelector.startsWith('>')) {
          normalizedSelector = normalizedSelector.substring(1).trim();
        }
        
        if (normalizedSelector && normalizedSelector !== contentSelector) {
          elements = container.querySelectorAll(normalizedSelector);
          debugLog.push({ strategy: 3, method: 'normalized selector', original: contentSelector, normalized: normalizedSelector, found: elements.length });
          if (elements.length > 0) {
            const visibleElements = Array.from(elements).filter(isElementVisible);
            debugLog.push({ strategy: 3, visibleFiltered: visibleElements.length, originalCount: elements.length });
            if (visibleElements.length > 0) {
              return { elements: visibleElements, debug: debugLog };
            }
          }
        }
      }
      
      // Strategy 4: If selector uses direct child (>), try without it to find nested elements
      if (contentSelector.includes(' > ')) {
        const flexibleSelector = contentSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        debugLog.push({ strategy: 4, method: 'flexible selector (removed >)', original: contentSelector, flexible: flexibleSelector, found: elements.length });
        if (elements.length > 0) {
          const visibleElements = Array.from(elements).filter(isElementVisible);
          debugLog.push({ strategy: 4, visibleFiltered: visibleElements.length, originalCount: elements.length });
          if (visibleElements.length > 0) {
            return { elements: visibleElements, debug: debugLog };
          }
        }
      }
      
      // Strategy 5: If selector is an ID selector (#id), try finding it anywhere and check if it's in container
      if (contentSelector.startsWith('#')) {
        const id = contentSelector.substring(1);
        const element = document.getElementById(id);
        debugLog.push({ strategy: 5, method: 'getElementById', id: id, found: !!element, inContainer: element && container.contains(element), isVisible: element && isElementVisible(element) });
        if (element && container.contains(element) && isElementVisible(element)) {
          return { elements: [element], debug: debugLog };
        }
      }
      
      // Strategy 6: Extract tag names and try to find them anywhere in container
      const tagMatch = contentSelector.match(/([a-z]+)(?:\s|$|#|\.)/i);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        elements = container.querySelectorAll(tagName);
        debugLog.push({ strategy: 6, method: 'tag name fallback', tagName: tagName, found: elements.length });
        if (elements.length > 0) {
          const visibleElements = Array.from(elements).filter(isElementVisible);
          debugLog.push({ strategy: 6, visibleFiltered: visibleElements.length, originalCount: elements.length });
          if (visibleElements.length > 0) {
            return { elements: visibleElements, debug: debugLog };
          }
        }
      }
      
      debugLog.push({ strategy: 'final', result: 'No elements found with any strategy' });
      return { elements: null, debug: debugLog };
    } catch (e) {
      debugLog.push({ strategy: 'error', error: e.message || String(e) });
      return { elements: null, debug: debugLog };
    }
  }
  
  // Extract subtitle if selector provided (BEFORE processing content)
  // Subtitle should be added after the title (first heading), before main content
  // We'll store it and insert it immediately after the first heading is found
  if (selectors.subtitle && selectors.subtitle.trim()) {
    try {
      const subtitleEl = document.querySelector(selectors.subtitle);
      if (subtitleEl) {
        subtitleDebug.subtitleFound = true;
        // Check if element is visible (not hidden)
        try {
          const style = window.getComputedStyle(subtitleEl);
          if (style.display === 'none' || style.visibility === 'hidden') {
            // Element is hidden, skip it
          } else {
            const subtitleText = subtitleEl.textContent.trim();
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            // Subtitle should be meaningful (at least 20 characters, typically 50-300)
            if (subtitleText && subtitleText.length >= 20) {
              // Check if subtitle is not excluded
              if (!shouldExclude(subtitleEl)) {
                const subtitleHtml = getFormattedHtml(subtitleEl);
                subtitleToInsert = { 
                  type: 'subtitle', 
                  text: subtitleText, 
                  html: `<p class="standfirst">${subtitleHtml}</p>`,
                  isStandfirst: true 
                };
              }
            }
          }
        } catch (styleError) {
          // If style check fails, try to extract anyway
          const subtitleText = subtitleEl.textContent.trim();
          if (subtitleText && subtitleText.length >= 20 && !shouldExclude(subtitleEl)) {
            subtitleDebug.subtitleText = subtitleText.substring(0, 100);
            const subtitleHtml = getFormattedHtml(subtitleEl);
            subtitleToInsert = { 
              type: 'subtitle', 
              text: subtitleText, 
              html: `<p class="standfirst">${subtitleHtml}</p>`,
              isStandfirst: true 
            };
          }
        }
      }
    } catch (e) {
      // Selector might be invalid, continue without subtitle
    }
  }
  
  // Start processing
  const containerSelector = selectors.articleContainer || 'body';
  const extractionDebug = {
    containerSelector: containerSelector,
    contentSelector: selectors.content,
    containersFound: containers.length,
    containerFound: !!container,
    contentElementsFound: 0,
    strategiesUsed: []
  };
  
  if (containers.length > 0) {
    for (const cont of containers) {
      const result = findContentElements(cont, selectors.content, containerSelector);
      extractionDebug.strategiesUsed.push(...(result.debug || []));
      if (result.elements && result.elements.length > 0) {
        extractionDebug.contentElementsFound += result.elements.length;
        // Process found elements
        let excludedCount = 0;
        let hiddenCount = 0;
        for (let i = 0; i < result.elements.length; i++) {
          const el = result.elements[i];
          
          // Special handling for Twitter/X long-form articles
          const isTwitterContainer = el.getAttribute('data-testid') === 'twitterArticleReadView' || 
                                     (el.closest('article[data-testid="tweet"]') && el.tagName.toLowerCase() === 'div');
          if (isTwitterContainer) {
            // CRITICAL: Process div.public-DraftStyleDefault-block blocks FIRST to avoid duplication
            // These blocks contain the actual content, and processing spans inside them causes duplication
            const draftBlocks = Array.from(el.querySelectorAll('div.public-DraftStyleDefault-block'));
            
            // Use Map to deduplicate blocks by text content
            // CRITICAL: Exclude draft blocks that are inside h2/h3 headings (they're already processed as headings)
            const uniqueBlocks = new Map();
            for (const block of draftBlocks) {
              // Skip draft blocks inside headings - these are already processed as headings
              const parentHeading = block.closest('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three');
              if (parentHeading) {
                continue; // Skip - this block is inside a heading, heading will be processed instead
              }
              
              const text = (block.textContent || '').trim();
              if (!text || text.length < 10) continue;
              
              // Use text as key to dedupe - prefer blocks with more children (more complete)
              if (!uniqueBlocks.has(text) || block.children.length > (uniqueBlocks.get(text)?.children.length || 0)) {
                uniqueBlocks.set(text, block);
              }
            }
            
            // Process headings first
            const headings = Array.from(el.querySelectorAll('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three'));
            
            // CRITICAL: Filter out div.longform-unstyled that contain div.public-DraftStyleDefault-block
            // These are duplicates - we process draft blocks, not their containers
            const allLongformUnstyled = Array.from(el.querySelectorAll('.longform-unstyled, .longform-blockquote'));
            const paragraphs = allLongformUnstyled.filter(div => {
              // Skip if this div contains a draft block (we'll process the draft block instead)
              return div.querySelector('div.public-DraftStyleDefault-block') === null;
            });
            
            // Collect images from the container
            // Note: We filter basic invalid images here, but full deduplication happens in the processing loop
            const images = Array.from(el.querySelectorAll('img')).filter(img => {
              // Skip images inside figure (handled separately if needed)
              if (img.closest('figure')) return false;
              // Basic validation - full checks happen in processing loop
              const src = extractBestImageUrl(img);
              if (!src) return false;
              return true;
            });
            
            // Combine: headings, paragraphs (filtered), unique draft blocks, and images
            const allContentElements = [...headings, ...paragraphs, ...Array.from(uniqueBlocks.values()), ...images];
            allContentElements.sort((a, b) => {
              const pos = a.compareDocumentPosition(b);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              return 0;
            });
            
            // Track processed elements to avoid duplicates
            const processedElements = new Set();
            
            // Process in order
            for (const elem of allContentElements) {
              if (shouldExclude(elem)) continue;
              try {
                const style = window.getComputedStyle(elem);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
              } catch (e) {}
              
              // Skip if already processed (prevent duplicates)
              if (processedElements.has(elem)) continue;
              processedElements.add(elem);
              
              const className = elem.className || '';
              const text = elem.textContent?.trim() || '';
              const tagName = elem.tagName.toLowerCase();
              
              // Process headings
              if (tagName === 'h1' && className.includes('longform-header-one')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 1, text: html, id: elemId });
                }
              } else if (tagName === 'h2' && className.includes('longform-header-two')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 2, text: html, id: elemId });
                }
              } else if (tagName === 'h3' && className.includes('longform-header-three')) {
                if (text && text.length > 3) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'heading', level: 3, text: html, id: elemId });
                }
              }
              // Process paragraphs (only those that don't contain draft blocks)
              else if (className.includes('longform-unstyled') || className.includes('longform-blockquote')) {
                // CRITICAL: Skip if this div contains a draft block (already processed above)
                if (elem.querySelector('div.public-DraftStyleDefault-block')) {
                  continue; // Skip - draft block will be processed separately
                }
                if (text && text.length > 20) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'paragraph', text: html, id: elemId });
                }
              }
              // Process div.public-DraftStyleDefault-block blocks (Draft.js content blocks)
              else if (tagName === 'div' && className.includes('public-DraftStyleDefault-block')) {
                // CRITICAL: Skip draft blocks that are inside h1/h2/h3 headings
                // These headings are already processed above, and draft block inside them is just the content
                // If we process both, we get duplicates
                const parentHeading = elem.closest('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three');
                if (parentHeading) {
                  // This draft block is inside a heading - skip it, heading was already processed
                  continue;
                }
                
                // CRITICAL: If draft block is not inside a real heading, it's always a paragraph
                // Even if it contains bold text, that's just emphasis within a paragraph, not a heading
                // Real headings in Twitter/X use h1.longform-header-one, h2.longform-header-two, h3.longform-header-three
                if (text && text.length > 10) {
                  const html = getFormattedHtml(elem);
                  const elemId = getAnchorId(elem);
                  content.push({ type: 'paragraph', text: html, id: elemId });
                }
              }
              // Process images
              else if (tagName === 'img') {
                let src = extractBestImageUrl(elem);
                src = toAbsoluteUrl(src);
                const ns = normalizeImageUrl(src);
                if (src && !isTrackingPixelOrSpacer(elem, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(elem, src)) {
                  const elemId = getAnchorId(elem);
                  
                  // Extract image caption
                  let caption = '';
                  // Check for figcaption in figure
                  const figure = elem.closest('figure');
                  if (figure) {
                    const figcaption = figure.querySelector('figcaption');
                    if (figcaption) caption = (figcaption.textContent || '').trim();
                  }
                  // Check aria-label or title
                  if (!caption) {
                    const ariaLabel = elem.getAttribute('aria-label');
                    if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) {
                      caption = ariaLabel.trim();
                    }
                  }
                  if (!caption) {
                    const title = elem.getAttribute('title');
                    if (title && title.trim() && title !== elem.alt) {
                      caption = title.trim();
                    }
                  }
                  // Check next sibling for caption
                  if (!caption) {
                    const nextSibling = elem.nextElementSibling;
                    if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
                      caption = (nextSibling.textContent || '').trim();
                    }
                  }
                  // Check for caption in parent container
                  if (!caption) {
                    const parent = elem.parentElement;
                    if (parent) {
                      const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
                      if (captionEl) {
                        const captionText = (captionEl.textContent || '').trim();
                        if (captionText && captionText !== elem.alt) {
                          caption = captionText;
                        }
                      }
                    }
                  }
                  
                  content.push({ type: 'image', src: src, alt: elem.alt || '', caption: caption, id: elemId });
                  addedImageUrls.add(ns);
                }
              }
            }
            continue; // Skip normal processing for Twitter container
          }
          const elementInfo = {
            index: i,
            total: result.elements.length,
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            textContentLength: el.textContent ? el.textContent.trim().length : 0
          };
          
          if (shouldExclude(el)) {
            excludedCount++;
            continue;
          }
          
          // Check if element is hidden
          let isHidden = false;
          try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              isHidden = true;
              hiddenCount++;
              continue;
            }
          } catch (e) {
            // getComputedStyle may fail - continue processing
          }
          
          // CRITICAL: If the found content element is a container (div, section, article),
          // use aggressive recursive extraction instead of just processing children.
          // This ensures we capture all nested content, not just direct children.
          const tagName = el.tagName.toLowerCase();
          const isContainer = tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'main';
          
          if (isContainer) {
            // Use the same aggressive approach as fallback: find ALL relevant elements inside
            // CRITICAL: Also include div elements that contain text, as many sites wrap content in divs
            const candidateElements = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table, div'));
            // Filter divs: only include those that contain significant text content and are not containers themselves
            const filteredCandidates = candidateElements.filter(candidate => {
              if (candidate.tagName.toLowerCase() === 'div') {
                // Skip if it's a container (has DIRECT block-level children)
                // Only check direct children, not nested ones, to allow divs with text
                // that have nested inline elements or styled divs
                const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote'];
                const hasDirectBlockChildren = Array.from(candidate.children).some(child => {
                  const childTag = child.tagName.toLowerCase();
                  return blockTags.includes(childTag);
                });
                if (hasDirectBlockChildren) return false;
                // Only include if it has significant text content
                const text = (candidate.textContent || '').trim();
                return text.length > 20; // Minimum text length
              }
              return true; // Include all non-div elements
            });
            const visibleElements = filteredCandidates.filter(isElementVisible);
            
            // Sort by DOM order
            visibleElements.sort((a, b) => {
              const pos = a.compareDocumentPosition(b);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              return 0;
            });
            
            // Process each element
            let excludedInContainer = 0;
            for (const candidateEl of visibleElements) {
              if (shouldExclude(candidateEl)) {
                excludedInContainer++;
                continue;
              }
              processElement(candidateEl);
            }
            extractionDebug.strategiesUsed.push({
              strategy: 'container_recursive',
              containerTag: tagName,
              candidateElements: candidateElements.length,
              filteredCandidates: filteredCandidates.length,
              visibleElements: visibleElements.length,
              excludedInContainer: excludedInContainer,
              processed: visibleElements.length - excludedInContainer
            });
          } else {
            // Element is not a container, process it directly
            processElement(el);
          }
        }
        if (excludedCount > 0 || hiddenCount > 0) {
          extractionDebug.strategiesUsed.push({
            strategy: 'filtering',
            excludedBySelector: excludedCount,
            excludedByCSS: hiddenCount,
            totalFound: result.elements.length,
            processed: result.elements.length - excludedCount - hiddenCount
          });
        }
      } else {
        // Fallback: process all children recursively
        // CRITICAL: When content selector matches container selector, we need to process ALL elements
        // including nested ones (img, picture, figure) that might be inside paragraphs or other elements
        extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'process all children recursively', reason: 'No content elements found or content selector matches container' });
        
        // Collect all candidate elements from container (not just direct children)
        // Include <font> for old websites that use deprecated HTML tags
        const candidateElements = Array.from(cont.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table'));
        // Filter to only visible elements
        const visibleElements = candidateElements.filter(isElementVisible);
        
        // Sort by DOM order
        visibleElements.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });
        
        // Process each element
        for (const el of visibleElements) {
          if (shouldExclude(el)) continue;
          processElement(el);
        }
      }
    }
    } else if (container) {
      const result = findContentElements(container, selectors.content, containerSelector);
      extractionDebug.strategiesUsed.push(...(result.debug || []));
      if (result.elements && result.elements.length > 0) {
      extractionDebug.contentElementsFound = result.elements.length;
      // Process found elements
      let excludedCount = 0;
      let hiddenCount = 0;
      for (let i = 0; i < result.elements.length; i++) {
        const el = result.elements[i];
        
        // Special handling for Twitter/X long-form articles
        const isTwitterContainer = el.getAttribute('data-testid') === 'twitterArticleReadView' || 
                                   (el.closest('article[data-testid="tweet"]') && el.tagName.toLowerCase() === 'div');
        if (isTwitterContainer) {
          // Single-pass collection: gather all content elements efficiently
          const headings = Array.from(el.querySelectorAll('h1.longform-header-one, h2.longform-header-two, h3.longform-header-three'));
          const allLongformUnstyled = Array.from(el.querySelectorAll('.longform-unstyled, .longform-blockquote'));
          const draftBlocks = Array.from(el.querySelectorAll('div.public-DraftStyleDefault-block'));
          
          // Build Set of draft blocks inside headings (single pass)
          const draftBlocksInsideHeadings = new Set();
          for (const heading of headings) {
            for (const block of heading.querySelectorAll('div.public-DraftStyleDefault-block')) {
              draftBlocksInsideHeadings.add(block);
            }
          }
          
          // Filter paragraphs: exclude those containing draft blocks (we process draft blocks directly)
          const paragraphs = allLongformUnstyled.filter(div => 
            !div.querySelector('div.public-DraftStyleDefault-block')
          );
          
          // Deduplicate draft blocks by text content, excluding those inside headings
          const uniqueBlocks = new Map();
          for (const block of draftBlocks) {
            if (draftBlocksInsideHeadings.has(block)) continue;
            
            const text = (block.textContent || '').trim();
            if (!text || text.length < 10) continue;
            
            // Prefer blocks with more children (more complete)
            const existing = uniqueBlocks.get(text);
            if (!existing || block.children.length > existing.children.length) {
              uniqueBlocks.set(text, block);
            }
          }
          
          // Collect images from the container
          // Note: We filter basic invalid images here, but full deduplication happens in the processing loop
          const images = Array.from(el.querySelectorAll('img')).filter(img => {
            // Skip images inside figure (handled separately if needed)
            if (img.closest('figure')) return false;
            // Basic validation - full checks happen in processing loop
            const src = extractBestImageUrl(img);
            if (!src) return false;
            return true;
          });
          
          // Combine and sort by DOM order
          const allContentElements = [...headings, ...paragraphs, ...Array.from(uniqueBlocks.values()), ...images];
          allContentElements.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 
                   (pos & Node.DOCUMENT_POSITION_PRECEDING) ? 1 : 0;
          });
          
          // Track processed elements to avoid duplicates
          const processedElements = new Set();
          
          // Process in order
          for (const elem of allContentElements) {
            if (shouldExclude(elem)) continue;
            try {
              const style = window.getComputedStyle(elem);
              if (style.display === 'none' || style.visibility === 'hidden') continue;
            } catch (e) {}
            
            // Skip if already processed (prevent duplicates)
            if (processedElements.has(elem)) continue;
            processedElements.add(elem);
            
            const className = elem.className || '';
            const text = elem.textContent?.trim() || '';
            const tagName = elem.tagName.toLowerCase();
            
            // Process headings
            if (tagName === 'h1' && className.includes('longform-header-one')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'heading', level: 1, text: html, id: elemId });
              }
            } else if (tagName === 'h2' && className.includes('longform-header-two')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'heading', level: 2, text: html, id: elemId });
              }
            } else if (tagName === 'h3' && className.includes('longform-header-three')) {
              if (text && text.length > 3) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'heading', level: 3, text: html, id: elemId });
              }
            }
            // Process paragraphs (only those that don't contain draft blocks)
            else if (className.includes('longform-unstyled') || className.includes('longform-blockquote')) {
              // CRITICAL: Skip if this div contains a draft block (already processed above)
              if (elem.querySelector('div.public-DraftStyleDefault-block')) {
                continue; // Skip - draft block will be processed separately
              }
              if (text && text.length > 20) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'paragraph', text: html, id: elemId });
              }
            }
            // Process div.public-DraftStyleDefault-block blocks (Draft.js content blocks)
            else if (tagName === 'div' && className.includes('public-DraftStyleDefault-block')) {
              // Skip draft blocks inside headings (already processed as headings)
              if (draftBlocksInsideHeadings.has(elem)) {
                continue;
              }
              
              // CRITICAL: If draft block is not inside a real heading, it's always a paragraph
              // Even if it contains bold text, that's just emphasis within a paragraph, not a heading
              // Real headings in Twitter/X use h1.longform-header-one, h2.longform-header-two, h3.longform-header-three
              if (text && text.length > 10) {
                const html = getFormattedHtml(elem);
                const elemId = getAnchorId(elem);
                content.push({ type: 'paragraph', text: html, id: elemId });
              }
            }
            // Process images
            else if (tagName === 'img') {
              let src = extractBestImageUrl(elem);
              src = toAbsoluteUrl(src);
              const ns = normalizeImageUrl(src);
              if (src && !isTrackingPixelOrSpacer(elem, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(elem, src)) {
                const elemId = getAnchorId(elem);
                
                // Extract image caption
                let caption = '';
                // Check for figcaption in figure
                const figure = elem.closest('figure');
                if (figure) {
                  const figcaption = figure.querySelector('figcaption');
                  if (figcaption) caption = (figcaption.textContent || '').trim();
                }
                // Check aria-label or title
                if (!caption) {
                  const ariaLabel = elem.getAttribute('aria-label');
                  if (ariaLabel && ariaLabel.trim() && !ariaLabel.toLowerCase().includes('image')) {
                    caption = ariaLabel.trim();
                  }
                }
                if (!caption) {
                  const title = elem.getAttribute('title');
                  if (title && title.trim() && title !== elem.alt) {
                    caption = title.trim();
                  }
                }
                // Check next sibling for caption
                if (!caption) {
                  const nextSibling = elem.nextElementSibling;
                  if (nextSibling && (nextSibling.tagName === 'P' || String(nextSibling.className || '').toLowerCase().includes('caption'))) {
                    caption = (nextSibling.textContent || '').trim();
                  }
                }
                // Check for caption in parent container
                if (!caption) {
                  const parent = elem.parentElement;
                  if (parent) {
                    const captionEl = parent.querySelector('.caption, .image-caption, .photo-caption, [class*="caption"]');
                    if (captionEl) {
                      const captionText = (captionEl.textContent || '').trim();
                      if (captionText && captionText !== elem.alt) {
                        caption = captionText;
                      }
                    }
                  }
                }
                
                content.push({ type: 'image', src: src, alt: elem.alt || '', caption: caption, id: elemId });
                addedImageUrls.add(ns);
              }
            }
          }
          continue; // Skip normal processing for Twitter container
        }
        const elementInfo = {
          index: i,
          total: result.elements.length,
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: el.className || null,
          textContentLength: el.textContent ? el.textContent.trim().length : 0
        };
        
        if (shouldExclude(el)) {
          excludedCount++;
          continue;
        }
        
        // Check if element is hidden
        let isHidden = false;
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            isHidden = true;
            hiddenCount++;
            continue;
          }
        } catch (e) {
          // getComputedStyle may fail - continue processing
        }
        
          // CRITICAL: If the found content element is a container (div, section, article),
          // use aggressive recursive extraction instead of just processing children.
          // This ensures we capture all nested content, not just direct children.
          const tagName = el.tagName.toLowerCase();
          const isContainer = tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'main';
          
          if (isContainer) {
            // Use the same aggressive approach as fallback: find ALL relevant elements inside
            // CRITICAL: Also include div elements that contain text, as many sites wrap content in divs
            const candidateElements = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table, div'));
            // Filter divs: only include those that contain significant text content and are not containers themselves
            const filteredCandidates = candidateElements.filter(candidate => {
              if (candidate.tagName.toLowerCase() === 'div') {
                // Skip if it's a container (has DIRECT block-level children)
                // Only check direct children, not nested ones, to allow divs with text
                // that have nested inline elements or styled divs
                const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote'];
                const hasDirectBlockChildren = Array.from(candidate.children).some(child => {
                  const childTag = child.tagName.toLowerCase();
                  return blockTags.includes(childTag);
                });
                if (hasDirectBlockChildren) return false;
                // Only include if it has significant text content
                const text = (candidate.textContent || '').trim();
                return text.length > 20; // Minimum text length
              }
              return true; // Include all non-div elements
            });
            const visibleElements = filteredCandidates.filter(isElementVisible);
            
            // Sort by DOM order
            visibleElements.sort((a, b) => {
              const pos = a.compareDocumentPosition(b);
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
              if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
              return 0;
            });
            
            // Process each element
            let excludedInContainer = 0;
            for (const candidateEl of visibleElements) {
              if (shouldExclude(candidateEl)) {
                excludedInContainer++;
                continue;
              }
              processElement(candidateEl);
            }
            extractionDebug.strategiesUsed.push({
              strategy: 'container_recursive',
              containerTag: tagName,
              candidateElements: candidateElements.length,
              filteredCandidates: filteredCandidates.length,
              visibleElements: visibleElements.length,
              excludedInContainer: excludedInContainer,
              processed: visibleElements.length - excludedInContainer
            });
          } else {
            // Element is not a container, process it directly
            processElement(el);
          }
      }
      if (excludedCount > 0 || hiddenCount > 0) {
        extractionDebug.strategiesUsed.push({
          strategy: 'filtering',
          excludedBySelector: excludedCount,
          excludedByCSS: hiddenCount,
          totalFound: result.elements.length,
          processed: result.elements.length - excludedCount - hiddenCount
        });
      }
    } else {
      // Fallback: process all children recursively
      // CRITICAL: When content selector matches container selector, we need to process ALL elements
      // including nested ones (img, picture, figure) that might be inside paragraphs or other elements
      extractionDebug.strategiesUsed.push({ strategy: 'fallback', method: 'process all children recursively', reason: 'No content elements found or content selector matches container' });
      
      // Collect all candidate elements from container (not just direct children)
      // Include <font> for old websites that use deprecated HTML tags
      const candidateElements = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, font, img, picture, figure, blockquote, pre, code, ul, ol, table'));
      // Filter to only visible elements
      const visibleElements = candidateElements.filter(isElementVisible);
      
      // Sort by DOM order
      visibleElements.sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      
      // Process each element
      for (const el of visibleElements) {
        if (shouldExclude(el)) continue;
        processElement(el);
      }
    }
  } else {
    extractionDebug.strategiesUsed.push({ strategy: 'error', reason: 'No container found' });
  }
  
  // Add extraction debug to debugInfo
  debugInfo.extractionDebug = extractionDebug;
  
  // If subtitle wasn't inserted yet, ensure title is in content and insert subtitle after it
  // CRITICAL: Title (h1) might be outside article, so it won't be processed
  // We need to add it to content if it's missing, but ONLY if it's not already there
  if (subtitleToInsert) {
    // Store debug info
    subtitleDebug.totalContentItemsBeforeInsert = content.length;
    subtitleDebug.elementsProcessedBeforeFirstHeading = debugInfo.elementsProcessed;
    
    // Store content state before insertion for debugging
    subtitleDebug.contentBeforeInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
    
    // Find the first heading in content
    let firstHeadingIndex = -1;
    let titleInContent = false;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i].type === 'heading') {
        firstHeadingIndex = i;
        subtitleDebug.firstHeadingFound = true;
        subtitleDebug.firstHeadingIndex = i;
        subtitleDebug.firstHeadingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim().substring(0, 100);
        // Check if this heading matches article title
        if (articleTitle) {
          const headingText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
          if (headingText === articleTitle || headingText.toLowerCase() === articleTitle.toLowerCase()) {
            titleInContent = true;
            subtitleDebug.titleInContent = true;
          }
        }
        break;
      }
    }
    
    // If no heading found AND title is not in content, add title at the beginning
    // This handles case when title is outside article and not processed
    if (firstHeadingIndex === -1 && articleTitle && !titleInContent) {
      // Double-check: search entire content for title text to avoid duplicates
      let titleExists = false;
      for (let i = 0; i < content.length; i++) {
        const itemText = (content[i].text || '').replace(/<[^>]+>/g, '').trim();
        if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
          titleExists = true;
          break;
        }
      }
      
      // Only add title if it doesn't exist anywhere in content
      if (!titleExists) {
        const titleItem = { type: 'heading', level: 1, text: articleTitle, id: 'article-title' };
        content.unshift(titleItem);
        firstHeadingIndex = 0;
        subtitleDebug.titleAdded = true;
        subtitleDebug.firstHeadingIndex = 0;
        subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
        subtitleDebug.titleInContent = true;
      } else {
        subtitleDebug.titleInContent = true;
        // Title exists but might not be a heading - find its position
        for (let i = 0; i < content.length; i++) {
          const item = content[i];
          const itemText = ('text' in item && item.text ? String(item.text) : '').replace(/<[^>]+>/g, '').trim();
          if (itemText === articleTitle || itemText.toLowerCase() === articleTitle.toLowerCase()) {
            if (item.type === 'heading') {
              firstHeadingIndex = i;
              subtitleDebug.firstHeadingIndex = i;
              subtitleDebug.firstHeadingText = articleTitle.substring(0, 100);
            }
            break;
          }
        }
      }
    }
    
    // Insert subtitle right after first heading (or at beginning if no heading)
    if (firstHeadingIndex >= 0 && subtitleToInsert) {
      content.splice(firstHeadingIndex + 1, 0, subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = firstHeadingIndex + 1;
    } else if (subtitleToInsert) {
      // No heading found, insert at the beginning
      // unshift accepts ContentItem[] which includes subtitle items (subtitle is a valid ContentItem type)
      content.unshift(subtitleToInsert);
      subtitleDebug.subtitleInserted = true;
      subtitleDebug.subtitleInsertIndex = 0;
    }
    subtitleToInsert = null;
    
    // Store content state after insertion for debugging
    subtitleDebug.contentAfterInsert = content.slice(0, 5).map((item, idx) => ({
      index: idx,
      type: item.type,
      text: (item.text || '').replace(/<[^>]+>/g, '').trim().substring(0, 80)
    }));
  }
  
  // Extract hero image if selector provided
  // CRITICAL: Do this AFTER title/subtitle insertion so heroImage appears after them
  // Hero image should be added at the beginning of content (after title/subtitle if they exist)
  if (selectors.heroImage) {
    try {
      const heroImgEl = document.querySelector(selectors.heroImage);
      if (heroImgEl) {
        // CRITICAL: If element is not an IMG, find IMG inside it
        let imgElement = heroImgEl;
        if (heroImgEl.tagName?.toLowerCase() !== 'img') {
          const innerImg = heroImgEl.querySelector('img');
          if (innerImg) {
            imgElement = innerImg;
          } else {
            // If no img found, try to extract image URL from element itself (e.g., background-image)
            // But for now, skip if no img element found
            imgElement = null;
          }
        }
        
        if (imgElement && imgElement.tagName?.toLowerCase() === 'img') {
          let heroSrc = extractBestImageUrl(imgElement);
          heroSrc = toAbsoluteUrl(heroSrc);
          const ns = normalizeImageUrl(heroSrc);
          if (heroSrc && !isTrackingPixelOrSpacer(imgElement, heroSrc) && !isPlaceholderUrl(heroSrc) && !isSmallOrAvatarImage(imgElement, heroSrc) && !addedImageUrls.has(ns)) {
            // Find position after title/subtitle (they're at the beginning after unshift)
            // If subtitle exists, insert after it; if only title exists, insert after title; otherwise at position 0
            let insertIndex = 0;
            for (let i = 0; i < content.length; i++) {
              if (content[i].type === 'subtitle') {
                insertIndex = i + 1;
                break;
              } else if (content[i].type === 'heading' && content[i].level === 1 && insertIndex === 0) {
                insertIndex = i + 1;
              }
            }
            const imageItem = /** @type {ContentItem} */ ({ type: 'image', url: heroSrc, src: heroSrc, alt: (imgElement instanceof HTMLImageElement ? imgElement.alt : '') || '', id: getAnchorId(imgElement) });
            content.splice(insertIndex, 0, imageItem);
            addedImageUrls.add(ns);
          }
        }
      }
    } catch (e) {
    }
  }
  
  // Add subtitle debug info to debug object
  if (subtitleToInsert || subtitleDebug.subtitleFound) {
    debugInfo.subtitleDebug = subtitleDebug;
  }
  
  // CRITICAL: Always return a result object, even if empty
  // This ensures chrome.scripting.executeScript always gets a valid result
  const result = { 
    title: articleTitle || '', 
    author: articleAuthor || '', 
    content: content || [], 
    publishDate: publishDate || '', 
    debug: debugInfo 
  };
  
  // Validate result before returning
  if (!result.content || !Array.isArray(result.content)) {
    result.content = [];
  }
  
  return result;
}
