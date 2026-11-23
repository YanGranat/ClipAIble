// @ts-check
// Element filtering functions for extraction
// Determines which elements should be excluded from extraction

import { compareDomOrder, getDocumentFragmentTarget, safeGetComputedStyle, safeClosest, INTERFACE_REGIONS, isPublisherLinkAction } from './dom-utils.js';
import { isArticleContentFigure } from './discover.js';
import { isEditorialLayoutLabel, isReadingOwned, isReferencedReadingAside } from './reading-context.js';
import { getGraphicReadingOwner } from './graphics.js';
import { getAnnotationTarget } from './annotations.js';

/** Utility arguments are CSS values, not names for interface regions. */
export function semanticClassNames(element) {
  return Array.from(element.classList).filter(name => !name.includes('[')).join(' ').toLowerCase();
}

/** Labels owned by interactive controls are not independent reading blocks. */
export function isInteractiveControlLabel(element) {
  const label = element.closest('label,[id]');
  if (!label) return false;
  if (label.tagName === 'LABEL' && label.getAttribute('for')) return true;
  if (!label.id || !label.contains(element)) return false;
  return Array.from(element.ownerDocument.querySelectorAll('[aria-labelledby]')).some(control =>
    (control.getAttribute('aria-labelledby') || '').split(/\s+/).includes(label.id) &&
    control.matches('input,select,button,[role="radiogroup"],[role="listbox"],[role="tablist"],[role="menu"]'));
}

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
 * Check if element is an icon (SVG or icon font)
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is an icon
 */
export function isIcon(element) {
  if (element.closest('pre,code,math,mjx-container,.MathJax,.katex')) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'svg') return true;
  
  const className = semanticClassNames(element);
  const id = (element.id || '').toLowerCase();
  
  // Icon classes
  if (/(?:^|[\s_-])(?:icon|fa|fas|far|fab)(?:$|[\s_-])/.test(className) ||
      /(?:^|[\s_-])icon(?:$|[\s_-])/.test(id)) {
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

/** Identify subscription controls by their form ownership and explicit action. */
export function isSubscriptionFormContent(element) {
  const form = element.closest('form');
  if (!form) return false;
  const emailFields = Array.from(form.querySelectorAll('input')).filter(input =>
    (input.getAttribute('type') || '').toLowerCase() === 'email' ||
    (input.getAttribute('name') || '').toLowerCase() === 'email' ||
    /^e-?mail(?: address)?$/i.test((input.getAttribute('aria-label') || '').trim()) ||
    (input.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).includes('email'));
  if (!emailFields.length) return false;
  const labels = [form.getAttribute('aria-label') || ''];
  for (const id of (form.getAttribute('aria-labelledby') || '').split(/\s+/)) {
    if (id) labels.push(form.ownerDocument.getElementById(id)?.textContent || '');
  }
  const subscription = label => /\b(?:sign[\s-]*up|subscribe|subscription)\b/i.test(label);
  const actions = Array.from(form.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]'));
  const subscriptionActions = actions.filter(action =>
    [action.textContent || '', action.getAttribute('aria-label') || '', action.getAttribute('value') || '',
      ...Array.from(action.querySelectorAll('*')).map(part => part.textContent || '')].some(subscription));
  if (!subscriptionActions.length && !labels.some(subscription)) return false;
  for (const email of emailFields) {
    for (const action of subscriptionActions.length ? subscriptionActions : actions) {
      let component = email.parentElement;
      while (component && component !== form && !component.contains(action)) component = component.parentElement;
      if (!component || !component.contains(element)) continue;
      // An enclosing application form can own separate article and subscription regions.
      if (component === form && form.querySelector('article,main,[itemprop~="articleBody"]')) continue;
      return true;
    }
  }
  return false;
}

const PANEL_HEADING = 'h2,h3,h4,h5,h6';
const FORM_CONTROL = 'button,input[type="submit"],[role="button"]';
const SUBSCRIBE_PROMPT = /^(?:subscribe|sign[\s-]*up)\b/i;
const PANEL_PROMPT = /^(?:subscribe|sign[\s-]*up) (?:to|for) [^.!?:]{1,100}$/i;
const SUBSCRIPTION_PANEL = /^(?:newsletter|subscription)(?: (?:promotion|sign[\s-]*up|form))?$/i;
const PROTECTED_READING = 'article,main,[role~="article"],[role~="main"],[itemprop~="articleBody"],.instapaper_body,h1,table,pre,blockquote,math';

function isSingleChildBlock(element) {
  return element?.matches('div,section') && element.childElementCount === 1 &&
    element.textContent.trim() === element.firstElementChild.textContent.trim();
}

function findSignupBanner(sibling, linkedTargets) {
  let figure = sibling;
  while (isSingleChildBlock(figure)) {
    if (linkedTargets.has(figure)) return null;
    figure = figure.firstElementChild;
  }
  if (!figure?.matches('figure') || linkedTargets.has(figure) || figure.querySelector('figcaption') ||
      figure.textContent.trim()) return null;
  return Array.from(figure.querySelectorAll('img[alt]')).some(image =>
    /\b(?:promotional banner|newsletter (?:banner|sign[\s-]*up))\b/i.test(image.getAttribute('alt') || '')) ? figure : null;
}

/** Locate independently owned subscription and comment controls before projecting article content. */
export function findPublisherFormRegions(root) {
  const regions = new Set();
  const linkedTargets = new Set(Array.from(root.querySelectorAll('a[href*="#"]'), getDocumentFragmentTarget));
  for (const link of Array.from(root.querySelectorAll('a[href="#"]'))) {
    if (link.closest('p,blockquote,pre,figcaption') || linkedTargets.has(link)) continue;
    const action = (link.getAttribute('class') || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/);
    if (action.some(word => /^(?:show|open|toggle)$/i.test(word)) &&
        action.some(word => /^comments?$/i.test(word))) regions.add(link);
  }
  for (const form of Array.from(root.querySelectorAll('form'))) {
    const subscription = isSubscriptionFormContent(form);
    const comment = form.querySelector('textarea[name="comment" i]') && form.querySelector(FORM_CONTROL) &&
      form.querySelector('input[name="email" i],input[name="author" i]');
    if ((!subscription && !comment) || form.querySelector(PROTECTED_READING) || form.closest('blockquote,pre')) continue;
    regions.add(form);
    for (let panel = form.parentElement; panel && panel !== root; panel = panel.parentElement) {
      if (panel.matches(PROTECTED_READING) || panel.querySelector(PROTECTED_READING) || panel.querySelectorAll('form').length !== 1) break;
      const heading = Array.from(panel.querySelectorAll(PANEL_HEADING));
      const label = (panel.getAttribute('aria-label') || '').trim();
      const caption = panel.firstElementChild;
      const isCommentPanel = comment && caption?.matches('p,' + PANEL_HEADING) &&
        /^(?:leave a (?:comment|reply)|post a comment)$/i.test(caption.textContent.trim()) &&
        !Array.from(panel.childNodes).some(node => node !== form && node !== caption && node.textContent?.trim());
      const isSubscriptionPanel = subscription && (SUBSCRIPTION_PANEL.test(label) ||
        (heading.length === 1 && PANEL_PROMPT.test(heading[0].textContent.trim()) &&
          compareDomOrder(heading[0], form) < 0 && !form.contains(heading[0]) &&
          Array.from(panel.querySelectorAll('a[href]')).some(link =>
            /^(?:privacy policy|terms of (?:use|service))$/i.test(link.textContent.trim()))));
      if (!isCommentPanel && !isSubscriptionPanel) continue;
      if (linkedTargets.has(panel) || heading.some(node => linkedTargets.has(node))) break;
      regions.add(panel);
      if (label && isSubscriptionPanel) addPanelSkipControls(panel, label, regions);
      break;
    }
  }
  const paragraphs = root.matches('p') ? [root] : Array.from(root.querySelectorAll('p'));
  for (const paragraph of paragraphs) {
    if (paragraph.closest('blockquote,pre,figcaption,form') || linkedTargets.has(paragraph)) continue;
    const actions = Array.from(paragraph.querySelectorAll('a[href]'));
    const firstAction = actions[0]?.textContent.trim() || '';
    if (!SUBSCRIBE_PROMPT.test(firstAction) || !paragraph.textContent.trim().startsWith(firstAction)) continue;
    if (!actions.every(action => {
      try {
        const pathname = new URL(action.getAttribute('href'), action.baseURI).pathname;
        return /(?:^|[/_-])(?:newsletters?|subscribe|subscriptions?|signup|sign-up)(?:$|[/_.-])/i.test(pathname);
      } catch { return false; }
    })) continue;
    regions.add(paragraph);
    // A sign-up action and its banner may be arranged in neighboring blocks.
    for (let block = paragraph; block !== root; block = block.parentElement) {
      for (const sibling of [block.previousElementSibling, block.nextElementSibling]) {
        const banner = findSignupBanner(sibling, linkedTargets);
        if (banner) regions.add(banner);
      }
      if (!isSingleChildBlock(block.parentElement) || linkedTargets.has(block.parentElement)) break;
    }
  }
  return [...regions];
}

/** Drop a skip link and its marker when they explicitly surround a removed panel. */
function addPanelSkipControls(panel, label, regions) {
  const wrapper = panel.closest('figure,section');
  if (!wrapper) return;
  const normalize = text => text.trim().replace(/\s+/g, ' ').toLowerCase();
  const after = 'after ' + normalize(label);
  for (const link of Array.from(wrapper.querySelectorAll('a[href*="#"]'))) {
    if (!/^skip\b/i.test(link.textContent.trim()) || compareDomOrder(link, panel) >= 0) continue;
    const target = getDocumentFragmentTarget(link);
    if (wrapper.contains(target) && compareDomOrder(panel, target) < 0 && target.matches('[role~="note"]') &&
        normalize(target.getAttribute('aria-label') || target.textContent || '') === after) {
      regions.add(link);
      regions.add(target);
    }
  }
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
export function isExcluded(win, element, constants, readingRoots = [], tocRoots = []) {
  const {
    EXCLUDED_CLASSES,
    PAYWALL_CLASSES,
    NAV_PATTERNS_CONTAINS,
    COURSE_AD_PATTERNS
  } = constants;
  
  const tagName = element.tagName.toLowerCase();
  const className = semanticClassNames(element);
  const id = (element.id || '').toLowerCase();
  
  // Semantic containers (article, main) should be more lenient
  const isSemanticContainer = tagName === 'article' || tagName === 'main';
  const isImageOrFigure = tagName === 'img' || tagName === 'figure';
  const readingOwned = isReadingOwned(element, readingRoots);
  const authoredHeading = readingOwned && /^h[1-6]$/.test(tagName);
  const selectedFlows = readingRoots.filter(root => root.contains(element) && root.querySelector('p,pre,table,blockquote'));
  const layoutRoles = ['nav', 'navigation', 'menu', 'sidebar', 'related', 'social', 'share'];
  const hasAuthoredAnchor = node => isReadingOwned(node, readingRoots) &&
    (node.matches('h1,h2,h3,h4,h5,h6') || node.matches('section') &&
      node.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6'));
  const hasExactRole = (node, role) => node.id.toLowerCase() === role ||
    Array.from(node.classList).some(name => name.toLowerCase() === role);
  if (element.closest(INTERFACE_REGIONS) || isPublisherLinkAction(element)) return true;
  const control = element.closest('button,[role="button"],input,select,textarea');
  if (control && !getAnnotationTarget(control)) return true;
  const selectedMedia = readingRoots.some(root => root.matches('figure,img,picture,svg,canvas') &&
    (root === element || root.contains(element)));
  const selectedInline = readingRoots.some(root => root.matches('p,span,div') &&
    !root.querySelector('article,section,p,table,ul,ol,figure,form') && (root === element || root.contains(element)));
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = safeGetComputedStyle(win, ancestor);
    if (ancestorStyle?.display === 'none') return true;
    if (['data-module', 'data-component', 'data-type'].some(attribute =>
      ['ad', 'advertisement'].includes((ancestor.getAttribute(attribute) || '').toLowerCase()))) return true;
  }
  
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
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }
  }
  
  // Exclude form-owned subscription controls.
  if (isSubscriptionFormContent(element)) return true;
  if (isInteractiveControlLabel(element)) return true;

  // Exclude advertising frames
  if (tagName === 'iframe') {
    const iframeElement = /** @type {HTMLIFrameElement} */ (element);
    try {
      const hostname = new URL(iframeElement.src, element.ownerDocument.baseURI).hostname.toLowerCase();
      const adHosts = ['doubleclick.net', 'googleadservices.com', 'pubmatic.com', 'imasdk.googleapis.com'];
      if (adHosts.some(host => hostname === host || hostname.endsWith('.' + host))) return true;
    } catch (_) { }
  }
  
  // Exclude footnotes and icons
  if (isIcon(element) && !getGraphicReadingOwner(element, readingRoots)) return true;
  
  // Exclude aside and complementary
  if (!readingOwned && (tagName === 'aside' || element.getAttribute('role') === 'complementary')) {
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

  // Data-attribute ad/tracking detection — inspired by node-unfluff's attribute-based exclusion.
  // Catches ad widgets that use data attributes instead of class/id naming conventions.
  const dataModule = (element.getAttribute('data-module') || '').toLowerCase();
  const dataComponent = (element.getAttribute('data-component') || '').toLowerCase();
  const dataType = (element.getAttribute('data-type') || '').toLowerCase();
  if (dataModule === 'ad' || dataModule === 'advertisement' ||
      dataComponent === 'ad' || dataComponent === 'advertisement' ||
      dataType === 'ad' || dataType === 'advertisement') {
    return true;
  }
  // Google / Facebook / Twitter tracking widgets embedded via data attributes
  const dataOuter = (
    (element.getAttribute('data-widget') || '') +
    (element.getAttribute('data-embed') || '')
  ).toLowerCase();
  if (dataOuter.includes('google') || dataOuter.includes('facebook') || dataOuter.includes('twitter')) {
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
  if (!readingOwned && hasPrice && isCourseAd) {
    return true;
  }
  
  // Tab navigation elements
  const role = element.getAttribute('role') || '';
  if (role === 'tab' ||
      safeClosest(element, '[role="tablist"]') !== null) {
    return true;
  }
  
  // Navigation pattern check (skip for semantic containers and images)
  if (!readingOwned && !isSemanticContainer && !isImageOrFigure) {
    const isParagraphOrHeading = tagName === 'p' || tagName.match(/^h[1-6]$/);
    if (isParagraphOrHeading) {
      // Only exclude if short and matches navigation
      if (textTrimmed.length < 200 && matchesNavigationPattern(text, NAV_PATTERNS_CONTAINS)) {
        return true;
      }
    }
  }
  
  // Newsletter blocks (skip for semantic containers)
  if (!readingOwned && !isSemanticContainer && (textLower.includes('sign up to our newsletter') ||
      (textLower.includes('newsletter') && textLower.includes('subscribe')))) {
    return true;
  }
  
  // Email service providers
  if (!readingOwned && (textLower.includes('powered by salesforce') || textLower.includes('marketing cloud'))) {
    return true;
  }
  
  // Check excluded classes with word boundaries
  for (const excluded of EXCLUDED_CLASSES) {
    if ((authoredHeading || selectedMedia || selectedInline) && ['header', 'article-section-title'].includes(excluded)) continue;
    if (selectedMedia && excluded === 'overlay') continue;
    const pattern = new RegExp(`\\b${excluded}\\b`);
    if ((pattern.test(className) || (id === excluded || pattern.test(id) && !hasAuthoredAnchor(element)) ||
        className === excluded || className.startsWith(excluded + '-') || 
        className.endsWith('-' + excluded)) &&
        !isEditorialLayoutLabel(element, element, excluded) &&
        !(excluded === 'sidebar' && isReferencedReadingAside(element, readingRoots, tocRoots))) {
      return true;
    }
  }
  
  // Check parent elements (skip for semantic containers)
  if (!isSemanticContainer) {
    let parent = element.parentElement;
    let iterations = 0;
    const maxIterations = 50;
    
    while (parent && parent !== element.ownerDocument.body && iterations < maxIterations) {
      iterations++;
      const parentClass = semanticClassNames(parent);
      const parentId = (parent.id || '').toLowerCase();
      const parentTag = parent.tagName.toLowerCase();

      if (parentTag === 'nav' || parentTag === 'footer' ||
          parent.getAttribute('role') === 'navigation') return true;
      if (EXCLUDED_CLASSES.some(excluded => {
        if ((authoredHeading || selectedMedia || selectedInline) && ['header', 'article-section-title'].includes(excluded)) return false;
        if (selectedMedia && excluded === 'overlay') return false;
        if (excluded === 'next' || excluded === 'prev' || excluded === 'previous') {
          return parentClass.split(/\s+/).includes(excluded) || parentId === excluded;
        }
        const escaped = excluded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const role = new RegExp(`(?:^|[\\s_-])${escaped}(?:$|[\\s_-])`);
        const matchingRole = role.test(parentClass) || parentId === excluded ||
          (role.test(parentId) && !hasAuthoredAnchor(parent));
        if (!matchingRole || isEditorialLayoutLabel(parent, element, excluded) ||
            (excluded === 'sidebar' && isReferencedReadingAside(parent, readingRoots, tocRoots))) return false;
        const wrapsSelectedFlow = layoutRoles.includes(excluded) && !hasExactRole(parent, excluded) &&
          !parent.matches('aside,[role~="complementary"],header,[role~="banner"]') &&
          selectedFlows.some(root => root !== parent && parent.contains(root));
        return !wrapsSelectedFlow;
      })) return true;
      
      // Clear ad indicators
      const clearAdIndicators = [/\bad\b/, /\badvertisement\b/, /\bsponsor\b/];
      const isClearAd = clearAdIndicators.some(indicator => 
        indicator.test(parentClass) || indicator.test(parentId)
      );
      
      if (isClearAd || (parentTag === 'aside' && !isReadingOwned(parent, readingRoots) && !isArticleContentFigure(win, element))) {
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
  const className = semanticClassNames(element);
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
