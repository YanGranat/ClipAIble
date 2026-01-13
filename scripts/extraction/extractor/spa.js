// @ts-check
// SPA content loading helpers
// Waits for dynamically loaded content in Single Page Applications

/**
 * Wait for content to load on SPA/dynamic pages
 * Polls for substantial content before proceeding with extraction
 * @param {Document} doc - Document object
 * @returns {Promise<void>} - Resolves when content is found or timeout reached
 */
export async function waitForContentLoad(doc) {
  const MAX_WAIT_TIME = 5000; // 5 seconds max wait
  const CHECK_INTERVAL = 200; // Check every 200ms
  const MIN_CONTENT_LENGTH = 500; // Minimum content length to consider loaded
  const SETTLE_DELAY = 300; // Additional wait after content found
  
  /**
   * Content container selectors for SPA detection
   * Includes common frameworks and CMS patterns
   */
  const contentSelectors = [
    // Semantic HTML
    '[role="main"]',
    // Common content classes
    '.article-content', '.post-content', '.entry-content',
    '#content', '#main-content', '#article-content',
    // SPA framework roots
    '#root', '#app', '#__next', '[data-reactroot]', '[ng-app]', '[data-vue-app]',
    // Notion specific
    '.notion-page-content', '.notion-page',
    // Generic patterns
    '[class*="article"]', '[class*="content"]'
  ];
  
  /**
   * Check if substantial content has loaded
   * @returns {boolean} - True if content appears loaded
   */
  function hasContent() {
    // Check semantic HTML elements
    const article = doc.querySelector('article');
    const main = doc.querySelector('main');
    
    if (article && (article.textContent || '').trim().length >= MIN_CONTENT_LENGTH) {
      return true;
    }
    if (main && (main.textContent || '').trim().length >= MIN_CONTENT_LENGTH) {
      return true;
    }
    
    // Check common content selectors
    for (const selector of contentSelectors) {
      try {
        const el = doc.querySelector(selector);
        if (el && (el.textContent || '').trim().length >= MIN_CONTENT_LENGTH) {
          return true;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Check for substantial paragraphs (indicator of loaded content)
    const paragraphs = doc.querySelectorAll('p');
    let totalTextLength = 0;
    const paragraphArray = Array.from(paragraphs).slice(0, 10);
    
    for (const p of paragraphArray) {
      totalTextLength += (p.textContent || '').trim().length;
    }
    
    if (totalTextLength >= MIN_CONTENT_LENGTH) {
      return true;
    }
    
    return false;
  }
  
  // Content already loaded - no waiting needed
  if (hasContent()) {
    return;
  }
  
  // Poll for content with timeout
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    
    if (hasContent()) {
      // Additional short wait to ensure content is fully rendered
      await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY));
      return;
    }
  }
  
  // Timeout reached - continue anyway (page might have minimal content)
  // Do not throw error, extraction will use whatever is available
}

/**
 * Check if page appears to be a SPA
 * @param {Document} doc - Document object
 * @returns {boolean} - True if page shows SPA indicators
 */
export function isSpaPage(doc) {
  const spaIndicators = [
    '#root',           // React
    '#__next',         // Next.js
    '#app',            // Vue
    '[ng-app]',        // Angular
    '[data-reactroot]',// React
    '[data-vue-app]',  // Vue
    '.notion-app-inner'// Notion
  ];
  
  for (const selector of spaIndicators) {
    try {
      if (doc.querySelector(selector)) {
        return true;
      }
    } catch (e) {
      // Invalid selector
    }
  }
  
  return false;
}

/**
 * Wait for specific element to appear
 * @param {Document} doc - Document object
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in ms (default 5000)
 * @returns {Promise<Element|null>} - Element or null if timeout
 */
export async function waitForElement(doc, selector, timeout = 5000) {
  const CHECK_INTERVAL = 100;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        return element;
      }
    } catch (e) {
      // Invalid selector
      return null;
    }
    
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }
  
  return null;
}
