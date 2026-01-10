// @ts-check
// Element filtering functions for automatic extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Check if paragraph is navigation/non-content
 * IMPORTANT: Only match if paragraph is SHORT and clearly navigation
 * Long paragraphs (>200 chars) are likely article content, not navigation
 * @param {string} text - Paragraph text to check
 * @param {Array} NAV_PATTERNS_STARTS_WITH - Navigation patterns (starts with)
 * @param {Array} PAYWALL_PATTERNS - Paywall patterns
 * @returns {boolean} True if paragraph is navigation
 */
export function isNavigationParagraphModule(text, NAV_PATTERNS_STARTS_WITH, PAYWALL_PATTERNS) {
  const textTrimmed = text.trim();
  const textLength = textTrimmed.length;
  
  // If paragraph is long (>200 chars), it's likely article content, not navigation
  // Navigation messages are typically short
  if (textLength > 200) {
    return false;
  }
  
  // Check if paragraph is mostly links (navigation indicator)
  const linkCount = (textTrimmed.match(/<a\s+/gi) || []).length;
  const textWithoutLinks = textTrimmed.replace(/<[^>]+>/g, '').trim();
  const linkDensity = textWithoutLinks.length > 0 ? linkCount / (textWithoutLinks.length / 50) : linkCount;
  
  // If more than 2 links in short paragraph, likely navigation
  if (linkCount >= 2 && textLength < 100) {
    return true;
  }
  
  // Check if it's a navigation pattern (only if starts with pattern)
  if (NAV_PATTERNS_STARTS_WITH.some(pattern => pattern.test(textTrimmed))) {
    return true;
  }
  
  // Check if it's a paywall message (all 11 languages)
  const textLower = text.toLowerCase();
  if (PAYWALL_PATTERNS.some(pattern => textLower.includes(pattern))) {
    return true;
  }
  
  // If none of the navigation conditions matched, it's not navigation
  return false;
}

/**
 * Check if element should be excluded
 * This is a large function (~500 lines) that checks many exclusion conditions
 * @param {Element} element - Element to check
 * @param {{EXCLUDED_CLASSES: Array<string>, PAYWALL_CLASSES: Array<string>, NAV_PATTERNS_CONTAINS: Array<RegExp>, COURSE_AD_PATTERNS: Array<string>, [key: string]: any}} constants - Constants object with patterns and thresholds
 * @param {{isFootnoteLink: function(Element): boolean, isIcon: function(Element): boolean, [key: string]: any}} helpers - Helper functions
 * @returns {boolean} True if element should be excluded
 */
export function isExcludedModule(element, constants, helpers) {
  const {
    EXCLUDED_CLASSES,
    PAYWALL_CLASSES,
    NAV_PATTERNS_CONTAINS,
    COURSE_AD_PATTERNS
  } = constants;
  
  const {
    isFootnoteLink,
    isIcon
  } = helpers;
  
  const tagName = element.tagName.toLowerCase();
  
  // For semantic content containers (article, main), be more lenient
  // They should only be excluded if they're clearly not content containers
  const isSemanticContainer = tagName === 'article' || tagName === 'main';
  
  // Declare className and id early - they are used throughout the function
  const className = String(element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  // Check if element is hidden
  // BUT: For figure/img elements, be more lenient (lazy loading, fade-in effects, etc.)
  const isImageOrFigure = tagName === 'img' || tagName === 'figure';
  
  // Safely get computed style with error handling
  let style = null;
  try {
    style = window.getComputedStyle(element);
  } catch (e) {
    // Element might be in iframe or detached from DOM
    // If we can't get style, assume element is visible (don't exclude)
    return false;
  }
  
  if (style) {
    // For images/figures, only exclude if completely hidden (display: none or visibility: hidden)
    // Don't exclude based on opacity alone - images may be hidden for fade-in effects
    if (isImageOrFigure) {
      // For images, only exclude if display is none or visibility is hidden
      // Opacity can be 0 for fade-in effects, but image still has valid src
      if (style.display === 'none' || style.visibility === 'hidden') {
        // Check if it's lazy-loaded - if so, don't exclude
        const hasLazySrc = element.hasAttribute('data-src') || 
                          element.hasAttribute('data-lazy-src') ||
                          element.hasAttribute('data-original') ||
                          element.hasAttribute('data-srcset');
        if (hasLazySrc) {
          return false; // Don't exclude lazy-loaded images
        }
        // For figure, check if img inside has lazy src
        if (tagName === 'figure') {
          const img = element.querySelector('img');
          if (img) {
            const imgHasLazySrc = img.hasAttribute('data-src') || 
                                 img.hasAttribute('data-lazy-src') ||
                                 img.hasAttribute('data-original') ||
                                 img.hasAttribute('data-srcset');
            if (imgHasLazySrc) {
              return false; // Don't exclude figure with lazy-loaded img
            }
          }
        }
        // If image is hidden and not lazy-loaded, exclude it
        return true;
      }
      // For images, don't exclude based on opacity alone
    } else {
      // For non-image elements, exclude if hidden in any way
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return true;
      }
    }
  }
  
  // Exclude iframe elements (except those that might be embedded content)
  if (tagName === 'iframe') {
    // Check if iframe is likely an ad or tracking
    const iframeElement = /** @type {HTMLIFrameElement} */ (element);
    const src = (iframeElement.src || '').toLowerCase();
    const adPatterns = ['ad', 'ads', 'advertisement', 'doubleclick', 'googleads', 'pubmatic', 'openx', 'adsystem'];
    if (adPatterns.some(pattern => src.includes(pattern))) {
      return true;
    }
    // Check parent for ad indicators
    const parent = element.parentElement;
    if (parent) {
      const parentClass = String(parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();
      if (parentClass.includes('ad') || parentId.includes('ad') || 
          parentClass.includes('advertisement') || parentId.includes('advertisement')) {
        return true;
      }
    }
    // For now, exclude all iframes to avoid ads/videos - can be refined later
    return true;
  }
  
  // Exclude footnotes
  if (isFootnoteLink(element)) return true;
  
  // Exclude icons
  if (isIcon(element)) return true;
  
  // Exclude sidebar elements (aside, complementary)
  if (tagName === 'aside' || element.getAttribute('role') === 'complementary') {
    return true;
  }
  
  // Exclude elements containing email input fields (newsletter signup)
  // But be careful - contact forms in articles should not be excluded
  // Only exclude if it's clearly a newsletter/subscription form
  // Check for navigation text patterns
  const text = element.textContent || '';
  const textLower = text.toLowerCase();
  const textTrimmed = text.trim();
  
  if (element.querySelector && element.querySelector('input[type="email"]')) {
    // Check if it's a newsletter signup (not a contact form in article)
    const hasNewsletterText = textLower.includes('newsletter') || 
                             textLower.includes('subscribe') ||
                             textLower.includes('signup') || textLower.includes('sign-up') ||
                             textLower.includes('get the latest') || textLower.includes('inbox') ||
                             textLower.includes('marketing cloud');
    // Only exclude if it's clearly a newsletter, not a contact form
    if (hasNewsletterText) {
      return true;
    }
    // Also exclude if element is in navigation/sidebar area (not in main content)
    const isInNavArea = element.closest('nav, aside, .sidebar, .navigation, footer, header') !== null;
    if (isInNavArea) {
      return true;
    }
    // For elements in main content, be lenient - don't exclude (might be contact form)
  }
  
  // Exclude elements with specific ad-related classes
  const adClasses = ['book-cta', 'course-cta', 'product-cta', 'course-ad', 'product-ad'];
  if (adClasses.some(adClass => className.includes(adClass) || id.includes(adClass))) {
    return true;
  }
  
  // Exclude paywall/subscription-related classes
  if (PAYWALL_CLASSES.some(paywallClass => className.includes(paywallClass) || id.includes(paywallClass))) {
    return true;
  }
  
  // For paragraphs and headings, be more lenient with text-based exclusions
  // Only exclude if it's clearly not content (metadata, navigation, ads)
  const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
  
  // Common navigation tab words (multilingual) - defined early for use throughout function
  const navigationTabWords = [
    'читать', 'read', 'править', 'edit', 'обсуждение', 'discussion', 'редакции', 'revisions',
    'view', 'просмотр', 'history', 'история', 'source', 'исходник', 'talk', 'обсуждение',
    'watch', 'смотреть', 'contribute', 'вклад', 'watchlist', 'список', 'preferences', 'настройки',
    'watchlist', 'список', 'user', 'пользователь', 'log', 'вход', 'create', 'создать',
    'account', 'аккаунт', 'sign', 'войти', 'register', 'регистрация', 'login', 'вход'
  ];
  
  // For paragraphs/headings, only exclude if text is very short and clearly metadata
  if (isParagraphOrHeading) {
    // Exclude word count metadata (e.g., "4,500 words", "Original article • 3,617 words")
    // But only if it's the ONLY content (very short)
    if (textTrimmed.length < 100 && 
        (/^\d+[,\s]\d+\s+words?$/i.test(textTrimmed) || /^\d+\s+words?$/i.test(textTrimmed))) {
      return true;
    }

    // Exclude metadata lines with "Original article" and word count
    // But only if it's short (clearly just metadata)
    if (textTrimmed.length < 150 && 
        (/^original\s+article\s*[•·]\s*\d+[,\s]?\d*\s*words?$/i.test(textTrimmed) ||
         (/^original\s+article\s*[•·]/i.test(textTrimmed) && /\d+\s*words?/i.test(textTrimmed)))) {
      return true;
    }
    
    // Exclude "Edited by" metadata - but only if very short
    if (textTrimmed.toLowerCase().startsWith('edited by') && textTrimmed.length < 100) {
      return true;
    }
  } else {
    // For non-paragraph/heading elements, use original strict logic
    if (/^\d+[,\s]\d+\s+words?$/i.test(textTrimmed) || /^\d+\s+words?$/i.test(textTrimmed)) {
      return true;
    }
    
    if (/^original\s+article\s*[•·]\s*\d+[,\s]?\d*\s*words?$/i.test(textTrimmed) ||
        /^original\s+article\s*[•·]/i.test(textTrimmed) && /\d+\s*words?/i.test(textTrimmed)) {
      return true;
    }
    
    if (textTrimmed.toLowerCase().startsWith('edited by') && textTrimmed.length < 200) {
      return true;
    }
  }
  
  // Exclude "SYNDICATE THIS ESSAY" links
  if (tagName === 'a' && textLower.includes('syndicate this essay')) {
    return true;
  }
  
  // Exclude donation blocks
  if ((textLower.includes('donate') || textLower.includes('donation')) && 
      (textLower.includes('support') || textLower.includes('mission') || 
       textLower.includes('select amount') || textLower.includes('per month'))) {
    return true;
  }
  
  // Check for course/product advertisements with prices
  const pricePattern = /\$\s*\d{3,4}(\.\d{2})?/;
  const hasPrice = pricePattern.test(text);
  
  // Check for course/training advertisement patterns
  const isCourseAd = COURSE_AD_PATTERNS.some(pattern => textLower.includes(pattern));
  
  // If element contains price and course ad patterns, exclude it
  if (hasPrice && isCourseAd) {
    return true;
  }
  
  // Exclude summary sections that contain course advertisements
  if ((className.includes('summary') || id.includes('summary') || 
       className.includes('quick-summary') || id.includes('quick-summary')) &&
      (textLower.includes('measure ux & design impact') || 
       textLower.includes('use the code') || textLower.includes('save 20%') ||
       textLower.includes('save') && textLower.includes('off'))) {
    return true;
  }
  
  // Exclude headings that are clearly advertisements
  if (tagName.match(/^h[1-6]$/)) {
    const headingText = textLower;
    // "Meet" headings that are typically ads
    if (headingText.startsWith('meet ') && 
        (headingText.includes('course') || headingText.includes('book') || 
         headingText.includes('training') || headingText.includes('product') ||
         headingText.includes('measure ux'))) {
      // Check if parent or next sibling contains price
      let parent = element.parentElement;
      let nextSibling = element.nextElementSibling;
      for (let i = 0; i < 3 && (parent || nextSibling); i++) {
        const checkText = ((parent ? parent.textContent : '') + 
                         (nextSibling ? nextSibling.textContent : '')).toLowerCase();
        if (checkText.includes('$') || checkText.includes('price') || 
            checkText.includes('money-back') || checkText.includes('guarantee') ||
            checkText.includes('495') || checkText.includes('799') ||
            checkText.includes('250') || checkText.includes('395')) {
          return true;
        }
        if (parent) parent = parent.parentElement;
        if (nextSibling) nextSibling = nextSibling.nextElementSibling;
      }
    }
    // Video training headings with prices
    if (headingText.includes('video') && 
        (headingText.includes('training') || headingText.includes('course'))) {
      // Check if parent or next sibling contains price
      let parent = element.parentElement;
      let nextSibling = element.nextElementSibling;
      for (let i = 0; i < 3 && (parent || nextSibling); i++) {
        const checkText = ((parent ? parent.textContent : '') + 
                         (nextSibling ? nextSibling.textContent : '')).toLowerCase();
        if (checkText.includes('$') || checkText.includes('price') || 
            checkText.includes('money-back') || checkText.includes('guarantee')) {
          return true;
        }
        if (parent) parent = parent.parentElement;
        if (nextSibling) nextSibling = nextSibling.nextElementSibling;
      }
    }
    // "Useful Resources" and "Further Reading" - typically just link lists
    if (headingText.includes('useful resources') || headingText.includes('further reading')) {
      // Check if it's followed by mostly links
      let nextSibling = element.nextElementSibling;
      let linkCount = 0;
      let textLength = 0;
      for (let i = 0; i < 5 && nextSibling; i++) {
        const links = nextSibling.querySelectorAll('a');
        linkCount += links.length;
        const siblingText = nextSibling.textContent.replace(/<[^>]+>/g, '').trim();
        textLength += siblingText.length;
        nextSibling = nextSibling.nextElementSibling;
      }
      // If mostly links with little text, exclude
      if (linkCount >= 3 && textLength < 500) {
        return true;
      }
    }
    // "Tags" - metadata section, typically just links
    if (headingText.trim() === 'tags') {
      return true;
    }
    // "More from" - related articles section
    if (headingText.includes('more from')) {
      return true;
    }
    // "Related" - related articles section
    if (headingText.trim().toLowerCase() === 'related') {
      return true;
    }
    // "From the Archive" - subscription/archive section
    if (headingText.includes('from the archive')) {
      return true;
    }
  }
  
  // Exclude separator elements (hr, separators)
  if (tagName === 'hr' || tagName === 'separator' || 
      element.getAttribute('role') === 'separator' ||
      className.includes('separator') || id.includes('separator')) {
    return true;
  }
  
  // Smart detection of navigation tabs and UI controls
  // Check for tab navigation elements (role="tab", tablist, etc.)
  const role = element.getAttribute('role') || '';
  const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  
  // Exclude elements with tab role or in tablist
  if (role === 'tab' || role === 'tabpanel' || 
      element.closest('[role="tablist"]') !== null ||
      element.closest('[role="tabpanel"]') !== null) {
    return true;
  }
  
  // Exclude navigation tabs by structural analysis
  // Tabs are typically: short text (1-3 words), in lists/groups, with navigation words
  const textWords = textTrimmed.split(/\s+/).filter(w => w.length > 0);
  const isShortText = textTrimmed.length < 50 && textWords.length <= 4;
  
  const hasNavigationWord = navigationTabWords.some(word => 
    textLower.includes(word) || ariaLabel.includes(word)
  );
  
  // Check if element is in a navigation structure
  const isInNav = element.closest('nav') !== null || 
                   element.closest('[role="navigation"]') !== null ||
                   element.closest('.nav, .navigation, .menu, .tabs, .tab-list') !== null;
  
  // Check if element is in a list with other short navigation-like items
  const parent = element.parentElement;
  let isInNavigationGroup = false;
  if (parent && (parent.tagName === 'UL' || parent.tagName === 'OL' || 
                 parent.tagName === 'DIV' || parent.tagName === 'NAV')) {
    const siblings = Array.from(parent.children);
    const shortNavigationSiblings = siblings.filter(sibling => {
      const siblingText = (sibling.textContent || '').trim();
      const siblingWords = siblingText.split(/\s+/).filter(w => w.length > 0);
      return siblingText.length < 50 && siblingWords.length <= 4 &&
             navigationTabWords.some(word => siblingText.toLowerCase().includes(word));
    });
    // If 2+ siblings are short navigation items, this is likely a tab group
    if (shortNavigationSiblings.length >= 2) {
      isInNavigationGroup = true;
    }
  }
  
  // Exclude if: short text + navigation word + in nav structure or navigation group
  if (isShortText && hasNavigationWord && (isInNav || isInNavigationGroup || role === 'tab')) {
    return true;
  }
  
  // Exclude metadata links (short text with URL pattern)
  // Pattern: "Short link here: lesswrong.ru/16" or similar
  if (tagName === 'a' || tagName === 'p' || tagName === 'span') {
    // Check for metadata patterns: short text + URL or domain
    const urlPattern = /(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;
    const hasUrl = urlPattern.test(textTrimmed);
    const isVeryShort = textTrimmed.length < 100;
    
    // Metadata indicators
    const metadataKeywords = [
      'ссылка', 'link', 'url', 'адрес', 'address', 'короткая', 'short',
      'сюда', 'here', 'permalink', 'постоянная', 'permanent'
    ];
    const hasMetadataKeyword = metadataKeywords.some(keyword => 
      textLower.includes(keyword)
    );
    
    // Exclude if: very short + has URL + has metadata keyword
    if (isVeryShort && hasUrl && hasMetadataKeyword) {
      return true;
    }
    
    // Exclude standalone short URLs at end of content (metadata)
    if (isVeryShort && hasUrl && textWords.length <= 3 && 
        (textTrimmed.match(urlPattern) || []).length === 1) {
      // Check if it's likely metadata (not part of article text)
      const isLikelyMetadata = !textTrimmed.match(/[.!?]$/) && // No sentence ending
                               !textLower.includes('http') || // Just domain
                               textTrimmed.split(/[:\/]/).length >= 2; // Has path structure
      if (isLikelyMetadata) {
        return true;
      }
    }
  }
  
  // Exclude control elements (Adjust, Share buttons, Email, Save, Post)
  if (className.includes('share-buttons') || className.includes('component-share-buttons') ||
      className.includes('aria-font-adjusts') || className.includes('font-adjust') ||
      id.includes('share-buttons') || id.includes('font-adjust')) {
    return true;
  }
  
  // Exclude control buttons by text content
  if (tagName === 'button') {
    const buttonText = text.trim().toLowerCase();
    // Extended list of control button texts (multilingual)
    const controlButtonTexts = [
      'email', 'save', 'post', 'share', 'syndicate',
      'читать', 'read', 'править', 'edit', 'обсуждение', 'discussion',
      'редакции', 'revisions', 'view', 'просмотр', 'history', 'история'
    ];
    if (controlButtonTexts.some(ctrlText => 
        buttonText === ctrlText || buttonText.includes(ctrlText))) {
      return true;
    }
  }
  
  // Exclude links that are navigation tabs (short text, navigation words, in nav structure)
  if (tagName === 'a') {
    const linkText = text.trim();
    const linkTextLower = linkText.toLowerCase();
    const linkWords = linkText.split(/\s+/).filter(w => w.length > 0);
    const isShortLink = linkText.length < 50 && linkWords.length <= 4;
    
    // Check if link is in navigation structure
    const linkInNav = element.closest('nav') !== null ||
                      element.closest('[role="navigation"]') !== null ||
                      element.closest('.nav, .navigation, .menu, .tabs, .tab-list, [role="tablist"]') !== null;
    
    // Check if link text matches navigation tab patterns
    const isNavigationTabText = navigationTabWords.some(word => 
      linkTextLower === word || linkTextLower.startsWith(word + ' ') || 
      linkTextLower.endsWith(' ' + word) || linkTextLower.includes(' ' + word + ' ')
    );
    
    // Exclude if: short link + navigation word + in nav structure
    if (isShortLink && isNavigationTabText && linkInNav) {
      return true;
    }
    
    // Also exclude if link is in a group with other navigation links
    if (isShortLink && isNavigationTabText && isInNavigationGroup) {
      return true;
    }
  }
  
  // Exclude related articles (links with "essay/" and images)
  if (tagName === 'a') {
    const href = (element.getAttribute('href') || '').toLowerCase();
    const hasImage = element.querySelector('img');
    const linkText = text.trim();
    // If link contains "essay/" and has an image, it's likely a related article
    if (href.includes('/essay/') && hasImage && linkText.length > 30) {
      // Check if parent contains multiple such links (related articles section)
      const parent = element.parentElement;
      if (parent) {
        const siblingLinks = parent.querySelectorAll('a[href*="/essay/"]');
        if (siblingLinks.length >= 2) {
          return true;
        }
      }
    }
  }
  
  // Exclude links that are section markers (e.g., "[Easy Chair]")
  if (tagName === 'a') {
    const linkText = text.trim();
    if (linkText.startsWith('[') && linkText.endsWith(']') && linkText.length < 50) {
      return true;
    }
  }
  
  // CRITICAL: Exclude newsletter blocks inside content
  if (textLower.includes('sign up to our newsletter') || 
      textLower.includes('join more than') && textLower.includes('newsletter subscribers') ||
      (textLower.includes('newsletter') && textLower.includes('subscribe') && 
       element.querySelector('input[type="email"]'))) {
    return true;
  }
  
  // Exclude "Get the latest [category] stories in your inbox" pattern
  if (/get\s+the\s+latest\s+.+\s+stories?\s+in\s+your\s+inbox/i.test(text)) {
    return true;
  }
  
  // Exclude Salesforce Marketing Cloud and similar email service providers
  if (textLower.includes('email powered by') ||
      textLower.includes('powered by salesforce') ||
      textLower.includes('salesforce marketing cloud') ||
      textLower.includes('marketing cloud') ||
      (textLower.includes('privacy notice') && textLower.includes('terms')) ||
      (textLower.includes('privacy') && textLower.includes('terms') && textLower.includes('conditions'))) {
    return true;
  }
  
  // Check if element contains email signup form
  if (element.querySelector('input[type="email"]') || 
      element.querySelector('input[name*="email"]') ||
      element.querySelector('input[id*="email"]')) {
    // Check if it's a signup form (not a contact form in article)
    if (textLower.includes('newsletter') || textLower.includes('subscribe') ||
        textLower.includes('signup') || textLower.includes('sign-up') ||
        textLower.includes('get the latest') || textLower.includes('inbox') ||
        textLower.includes('marketing cloud')) {
      return true;
    }
  }
  
  // Use inlined navigation patterns (defined at function start)
  const navTextPatterns = NAV_PATTERNS_CONTAINS;
  
  // For semantic containers (article, main), skip navigation pattern check on element itself
  // They are top-level content containers and should not be excluded based on text patterns
  // For images/figures, skip text-based checks (they don't have text content)
  // For paragraphs and headings, be more lenient - only exclude if text is short and clearly navigation
  if (!isSemanticContainer && !isImageOrFigure) {
    const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
    if (isParagraphOrHeading) {
      // For paragraphs/headings, only exclude if text is short (< 200 chars) and matches navigation pattern
      // Long paragraphs with navigation patterns are likely part of article content
      if (textTrimmed.length < 200 && navTextPatterns.some(pattern => pattern.test(text))) {
        return true;
      }
    } else {
      // For other elements, use original strict logic
      if (navTextPatterns.some(pattern => pattern.test(text))) {
        return true;
      }
    }
  }
  
  // Check for email newsletter sections (textLower already declared above)
  // Skip for images - they don't have text content
  if (!isImageOrFigure) {
    if (textLower.includes('email newsletter') || 
        (textLower.includes('newsletter') && textLower.includes('email')) ||
        textLower.includes('weekly tips') ||
        (textLower.includes('trusted by') && textLower.includes('folks'))) {
      // Check if this element or parent contains email input
      let checkEl = element;
      for (let i = 0; i < 3 && checkEl; i++) {
        if (checkEl.querySelector && checkEl.querySelector('input[type="email"]')) {
          return true;
        }
        checkEl = checkEl.parentElement;
      }
    }
  }
  
  // Check for advertisement sections with prices
  if (text.includes('$') || text.includes('€') || text.includes('£')) {
    // Check if it's likely an ad (contains price + ad keywords)
    const adKeywords = ['video', 'training', 'course', 'get', 'buy', 'purchase', 
                        'money-back', 'guarantee', 'enroll', 'sign up'];
    const hasAdKeywords = adKeywords.some(keyword => textLower.includes(keyword));
    if (hasAdKeywords && (text.includes('$') || text.match(/\$\s*\d+/))) {
      return true;
    }
  }
  
  // Check for "Meet" sections that are advertisements
  if (textLower.startsWith('meet ') && 
      (textLower.includes('course') || textLower.includes('book') || 
       textLower.includes('training') || textLower.includes('product'))) {
    return true;
  }
  
  // For images/figures, be more lenient with excludedClasses - use word boundaries
  // to avoid false positives (e.g., "article-image" contains "article" but isn't excluded)
  if (isImageOrFigure) {
    // Only exclude if class/id is clearly an excluded class (whole word match)
    let hasExcludedClass = false;
    for (const excluded of EXCLUDED_CLASSES) {
      // Check for exact match or word boundaries
      const pattern = new RegExp(`\\b${excluded}\\b`);
      if (pattern.test(className) || pattern.test(id) ||
          className === excluded || className.startsWith(excluded + '-') || className.endsWith('-' + excluded) ||
          id === excluded || id.startsWith(excluded + '-') || id.endsWith('-' + excluded)) {
        hasExcludedClass = true;
        break;
      }
    }
    if (hasExcludedClass) {
      return true;
    }
  } else {
    // For non-image elements, use word boundaries to avoid false positives
    // Example: 'related' should not match 'related-concepts' in article content
    // But should match 'related-articles' in navigation
    for (const excluded of EXCLUDED_CLASSES) {
      // Use word boundaries for more precise matching (same as for images)
      const pattern = new RegExp(`\\b${excluded}\\b`);
      if (pattern.test(className) || pattern.test(id) ||
          className === excluded || className.startsWith(excluded + '-') || className.endsWith('-' + excluded) ||
          id === excluded || id.startsWith(excluded + '-') || id.endsWith('-' + excluded)) {
        return true;
      }
    }
  }
  
  // Check parent elements
  // For semantic containers, skip parent checks (they are top-level content containers)
  // For images/figures, be more lenient - only exclude if parent is clearly an ad
  if (!isSemanticContainer) {
    let parent = element.parentElement;
    if (isImageOrFigure) {
      // For images, only exclude if parent has clear ad indicators
      let iterations = 0;
      const maxIterations = 50; // Safety limit to prevent infinite loops
      while (parent && parent !== document.body && iterations < maxIterations) {
        iterations++;
        const parentClass = String(parent.className || '').toLowerCase();
        const parentId = (parent.id || '').toLowerCase();
        const parentTag = parent.tagName.toLowerCase();
        
        // Only exclude if parent is clearly an ad (not just any excluded class)
        const clearAdIndicators = [
          /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/,
          'ad-container', 'ad-wrapper', 'ad-box', 'advertisement-container'
        ];
        const isClearAd = clearAdIndicators.some(indicator => {
          if (typeof indicator === 'string') {
            return parentClass.includes(indicator) || parentId.includes(indicator);
          }
          return indicator.test(parentClass) || indicator.test(parentId);
        });
        
        // Also exclude if parent is iframe or aside (clear non-content)
        if (isClearAd || parentTag === 'iframe' || parentTag === 'aside') {
          return true;
        }
        
        parent = parent.parentElement;
      }
    } else {
      // For non-image elements (paragraphs, headings), be VERY lenient
      // Since we're checking elements inside mainContent, they're likely legitimate content
      // Only exclude if parent is clearly not content (aside, nav, footer, header, or clear ad)
      // Don't exclude just because parent has some excluded class
      
      const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
      
      let iterations = 0;
      const maxIterations = 50; // Safety limit to prevent infinite loops
      while (parent && parent !== document.body && iterations < maxIterations) {
        iterations++;
        const parentClass = String(parent.className || '').toLowerCase();
        const parentId = (parent.id || '').toLowerCase();
        const parentText = parent.textContent || '';
        const parentTag = parent.tagName.toLowerCase();
        
        // For paragraphs/headings, only exclude if parent is clearly outside main content
        if (isParagraphOrHeading) {
          // Only exclude if parent is clearly not content (aside, nav, footer, header)
          if (parentTag === 'aside' || parentTag === 'nav' || parentTag === 'footer' || parentTag === 'header') {
            return true;
          }
          
          // Exclude if parent is clearly an ad container
          const clearAdIndicators = [
            /\bad\b/, /\badvertisement\b/, /\bads\b/, /\bsponsor\b/, /\bsponsored\b/,
            'ad-container', 'ad-wrapper', 'ad-box', 'advertisement-container'
          ];
          const isClearAd = clearAdIndicators.some(indicator => {
            if (typeof indicator === 'string') {
              return parentClass.includes(indicator) || parentId.includes(indicator);
            }
            return indicator.test(parentClass) || indicator.test(parentId);
          });
          
          if (isClearAd) {
            return true;
          }
          
          // Exclude if parent is a section with "related-articles" class AND has multiple article links
          if (parentTag === 'section' && 
              (parentClass.includes('related-articles') || parentId.includes('related-articles'))) {
            const articleLinks = parent.querySelectorAll('a[href*="/article/"], a[href*="/post/"], a[href*="/essay/"]');
            // Only exclude if it has multiple article links (clear related articles section)
            if (articleLinks.length >= 2) {
              return true;
            }
          }
        } else {
          // For other non-image elements, use original logic
          // Exclude if parent is a section with "related-articles" class (even inside article)
          if (parentTag === 'section' && 
              (parentClass.includes('related-articles') || parentId.includes('related-articles'))) {
            return true;
          }
          
          // Check parent for navigation patterns
          if (navTextPatterns.some(pattern => pattern.test(parentText))) {
            return true;
          }
          
          // Check if parent is an ad container
          if (parentTag === 'aside' && (parentClass.includes('ad') || parentId.includes('ad'))) {
            return true;
          }
          
          for (const excluded of EXCLUDED_CLASSES) {
            if (parentClass.includes(excluded) || parentId.includes(excluded)) {
              return true;
            }
          }
          parent = parent.parentElement;
        }
      }
    }
  }
  
  // Final check: for semantic containers, only exclude if clearly not content
  return false;
}


