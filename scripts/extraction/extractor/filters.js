// @ts-check
// Element filtering functions for extraction
// Determines which elements should be excluded from extraction

import { compareDomOrder, getDocumentFragmentTarget, safeGetComputedStyle, safeClosest, INTERFACE_REGIONS, isPublisherLinkAction } from './dom-utils.js';
import { isArticleContentFigure } from './discover.js';
import { DOCUMENT_CONTENTS, isDocumentHeadline, isEditorialLayoutLabel, isReadingOwned, isReferencedReadingAside } from './reading-context.js';
import { getGraphicReadingOwner } from './graphics.js';
import { getAnnotationTarget } from './annotations.js';

const LABELLED_CONTROLS = ':is(input,select,button,[role="radiogroup"],[role="listbox"],[role="tablist"],[role="menu"])[aria-labelledby]';

/** Utility arguments are CSS values, not names for interface regions. */
export function semanticClassNames(element) {
  return Array.from(element.classList).filter(name => !name.includes('[') && !/^(?:group|peer)\//.test(name)).join(' ').toLowerCase();
}

/** Publisher access labels may remain on prose already visible in the reader. */
function isVisibleArticleProse(win, element, readingRoots, batch) {
  if (!element.matches('p.paywall') || !readingRoots.some(root => root.contains(element)) ||
      !element.closest('article,[itemprop~="articleBody"],[role~="article"]') ||
      element.closest('aside,form,dialog,[hidden],[inert],[aria-hidden="true"]') ||
      element.querySelector('button,input,[role~="button"]')) return false;
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 1 || bounds.height <= 1) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = safeGetComputedStyle(win, parent);
    if (style?.opacity === '0' || style?.contentVisibility === 'hidden') return false;
    if (/^(?:hidden|clip)$/.test(style?.overflowY || '')) {
      const outer = parent.getBoundingClientRect();
      if (bounds.top < outer.top || bounds.bottom > outer.bottom + 1) return false;
    }
  }
  const hasBarrier = () => Array.from(win.document.querySelectorAll(
    '[aria-modal="true"],[class*="paywall-modal" i],[data-testid*="paywall" i],[class*="payment-wall" i]'
  )).some(node => {
    const rect = node.getBoundingClientRect();
    const style = safeGetComputedStyle(win, node);
    return rect.height > 1 && rect.width > 1 && style?.visibility !== 'hidden' && style?.display !== 'none' &&
      (node.getAttribute('aria-modal') === 'true' || !!node.querySelector('a[href],button,form'));
  });
  if (batch && batch.hasReadingBarrier === undefined) batch.hasReadingBarrier = hasBarrier();
  return !(batch ? batch.hasReadingBarrier : hasBarrier());
}

/** Index the ARIA labels of controls once for a batch of reading candidates. */
export function readControlLabelIds(document) {
  const ids = new Set();
  for (const control of document.querySelectorAll(LABELLED_CONTROLS)) {
    for (const id of control.getAttribute('aria-labelledby').trim().split(/\s+/)) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** Labels owned by interactive controls are not independent reading blocks. */
export function isInteractiveControlLabel(element, controlLabelIds = null) {
  const label = element.closest('label,[id]');
  if (!label) return false;
  if (label.tagName === 'LABEL' && label.getAttribute('for')) return true;
  if (!label.id || !label.contains(element)) return false;
  return (controlLabelIds ?? readControlLabelIds(element.ownerDocument)).has(label.id);
}

/** Compile the class rules shared by the candidates in one document scan. */
export function compileClassExclusions(names) {
  return names.map(name => ({
    name,
    word: new RegExp(`\\b${name}\\b`),
    role: new RegExp(`(?:^|[\\s_-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s_-])`)
  }));
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
const SUBSCRIBE_PREFACE = /^(?:do you want more (?:stories|articles|posts) like this\?\s*(?:then\s*)?)$/i;
const NEWSLETTER_INVITATION = /^(?:(?:subscribe|sign[\s-]*up)\s+(?:to|for)|join)\s+(?:(?:our|the)\s+)?(?:\S+\s+){0,2}(?:newsletter|mailing list)\b/i;
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

/** Locate independently owned publisher controls before projecting article content. */
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
    const text = paragraph.textContent.trim().replace(/\s+/g, ' ');
    const firstIndex = text.indexOf(firstAction);
    const isPublicationNote = actions.length === 1 && paragraph.closest('aside') &&
      /\b(?:this (?:story|article)|in your inbox)\b/i.test(text) && /\bnewsletter\b/i.test(text);
    if (!SUBSCRIBE_PROMPT.test(firstAction) || (firstIndex !== 0 &&
        !SUBSCRIBE_PREFACE.test(text.slice(0, firstIndex).trim()) && !isPublicationNote)) continue;
    if (!actions.every(action => {
      try {
        const pathname = new URL(action.getAttribute('href'), action.baseURI).pathname;
        return /(?:^|[/_-])(?:newsletters?|subscribers?|subscribe|subscriptions?|signup|sign-up)(?:$|[/_.-])/i.test(pathname);
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
  for (const region of findPublisherWidgets(root, linkedTargets)) regions.add(region);
  return [...regions];
}

function findPublisherWidgets(root, linkedTargets) {
  const regions = [];
  const ownsFragment = element => linkedTargets.has(element) ||
    [...linkedTargets].some(target => target && element.contains(target));
  const normalize = text => (text || '').trim().replace(/\s+/g, ' ');

  for (const panel of root.querySelectorAll('[class~="cta-content"],[class~="cta-panel"],[data-component="newsletter-cta"]')) {
    if (panel.querySelector(PROTECTED_READING) || ownsFragment(panel)) continue;
    const labels = Array.from(panel.querySelectorAll('a[href],button,[role="button"]'));
    if (labels.some(action => SUBSCRIBE_PROMPT.test(normalize(action.textContent || action.getAttribute('aria-label')))) &&
        /\b(?:newsletter|mailing list)\b/i.test(normalize(panel.textContent))) regions.push(panel);
  }

  // Standalone newsletter links can open a signup form on a separate origin.
  for (const link of root.querySelectorAll('a[href]')) {
    if (!NEWSLETTER_INVITATION.test(normalize(link.textContent)) ||
        link.closest('p,blockquote,pre,figure,figcaption,form')) continue;
    for (let panel = link.parentElement; panel && panel !== root; panel = panel.parentElement) {
      if (panel.matches(PROTECTED_READING) || panel.querySelector(PROTECTED_READING) || ownsFragment(panel)) break;
      if (panel.querySelectorAll('a[href]').length !== 1) break;
      const headings = Array.from(panel.querySelectorAll(PANEL_HEADING));
      const descriptions = Array.from(panel.querySelectorAll('p'));
      if (headings.length > 1 || descriptions.length > 1) break;
      if (headings.length !== 1 || descriptions.length !== 1 ||
          !NEWSLETTER_INVITATION.test(normalize(descriptions[0].textContent)) ||
          panel.querySelector('img,picture,video,canvas,ul,ol,dl,form,input,textarea')) continue;
      const labels = [headings[0], descriptions[0], link];
      const walker = panel.ownerDocument.createTreeWalker(panel, panel.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
      let hasOtherText = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (normalize(node.textContent) && !labels.some(label => label.contains(node))) {
          hasOtherText = true;
          break;
        }
      }
      if (!hasOtherText) regions.push(panel);
      break;
    }
  }

  // Drop the counter, retaining neighboring author and publication-date fields.
  for (const counter of root.querySelectorAll('[data-view-count],[data-view-counter]')) {
    if (counter.closest('p,blockquote,pre,figure,figcaption') || counter.querySelector(PROTECTED_READING) || ownsFragment(counter)) continue;
    const count = normalize(counter.textContent);
    if (/^\p{N}[\p{N}.,\s]*(?:(?:page\s+)?views?)?$/iu.test(count) &&
        (counter.closest('[data-view-counter-url]') || /\bviews?\b/i.test(count + ' ' + counter.getAttribute('aria-label')))) {
      regions.push(counter);
    }
  }

  regions.push(...findSearchPreviewLists(root, ownsFragment));

  const headline = Array.from(root.querySelectorAll('h1')).find(isDocumentHeadline);
  if (!headline) return regions;

  // A leading list item made entirely of explicit category links is metadata.
  // Detect the list item itself so separators do not become prose.
  const categoryLinks = [...root.querySelectorAll('a[href][rel~="category"]')];
  if (categoryLinks.length) {
    const bodyStart = [...root.querySelectorAll('p,blockquote,pre')].find(block =>
      compareDomOrder(headline, block) < 0 && normalize(block.textContent));
    if (bodyStart) {
      const groups = new Set(categoryLinks.map(link => link.closest('li')).filter(Boolean));
      for (const group of groups) {
        if (!root.contains(group) || compareDomOrder(group, bodyStart) >= 0 || ownsFragment(group) ||
          group.matches(PROTECTED_READING) || group.querySelector(PROTECTED_READING + ',img,video,picture,input,button,time')) continue;
        const links = [...group.querySelectorAll('a[href]')];
        if (!links.every(link => link.matches('[rel~="category"]') && !getDocumentFragmentTarget(link))) continue;
        const walker = group.ownerDocument.createTreeWalker(group, group.ownerDocument.defaultView.NodeFilter.SHOW_TEXT);
        let hasProse = false;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (/[\p{L}\p{N}]/u.test(node.textContent || '') && !node.parentElement?.closest('a[href]')) {
            hasProse = true;
            break;
          }
        }
        if (!hasProse) regions.push(group);
      }
    }
  }

  // Taxonomy links preceding the headline are category navigation, not body references.
  for (const link of root.querySelectorAll('a[href]')) {
    if (compareDomOrder(link, headline) >= 0 || link.closest('p,blockquote,pre,figure,figcaption') || ownsFragment(link)) continue;
    if (link.matches('[rel~="tag"]')) { regions.push(link); continue; }
    if (!/^\[\s*[^\[\]]+\s*\]$/.test(normalize(link.textContent))) continue;
    try {
      const href = new URL(link.getAttribute('href'), link.baseURI);
      if (href.origin === new URL(root.ownerDocument.URL).origin && /(?:^|\/)search\/?$/i.test(href.pathname) && href.search) regions.push(link);
    } catch { /* Ignore a malformed category link. */ }
  }
  return regions;
}

/** A search widget's result rows navigate previews. Preserve adjacent document content. */
function findSearchPreviewLists(root, ownsFragment) {
  const boundary = 'section,[role~="region"]';
  const searchField = 'input[type="search"],[role~="searchbox"]';
  const controls = 'button[aria-pressed],[role~="tab"][aria-selected]';
  const protectedList = 'blockquote,pre,figcaption,[role~="doc-bibliography"],[role~="doc-endnotes"]';
  const regions = new Set(Array.from(root.querySelectorAll(searchField), input =>
    input.closest(boundary)).filter(region => region && root.contains(region)));
  const containingRegion = root.closest(boundary);
  if (containingRegion && Array.from(containingRegion.querySelectorAll(searchField))
      .some(input => input.closest(boundary) === containingRegion)) regions.add(containingRegion);
  const lists = [];
  for (const region of regions) {
    for (const list of region.querySelectorAll('ul,ol')) {
      if (list.closest(boundary) !== region || list.closest(protectedList) || ownsFragment(list)) continue;
      const rows = Array.from(list.children).filter(child => child.matches('li'));
      const previewRows = rows.filter(row => row.querySelector(controls));
      if (previewRows.length < 3) continue;
      const links = previewRows.map(row => Array.from(row.querySelectorAll('a[href]')).find(link =>
        link.closest('li') === row && link.textContent?.trim() && !getDocumentFragmentTarget(link)));
      if (links.some(link => !link) || new Set(links.map(link => link.href)).size < 3) continue;
      if (rows.some(row => (row.firstElementChild || row.textContent?.trim()) && !previewRows.includes(row) &&
          (!row.querySelector('button,[role~="button"]') || row.querySelector('a[href],p,figure')))) continue;
      if (previewRows.some((row, index) => Array.from(row.querySelectorAll('p,blockquote,pre,table,figcaption'))
        .some(block => !links[index].contains(block) && block.textContent?.trim()))) continue;
      lists.push(list);
    }
  }
  return lists;
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
export function isExcluded(win, element, constants, readingRoots = [], tocRoots = [], selectedIllustration = false, batch = null) {
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
  const articleOwner = element.closest('article,[role~="article"]');
  const layoutRoles = ['nav', 'navigation', 'menu', 'sidebar', 'related', 'social', 'share', 'header', 'newsletter',
    'subscribe', 'comment', 'comments'];
  const panelLabel = /(?:^|[\s_-])(?:widget|banner|rail|box|cta|panel|prompt|promotion|signup)(?:$|[\s_-])/;
  const strongAdRole = node => {
    if (!batch) return shouldSkipStronglyExcluded(node, readingRoots);
    if (!batch.adRoles.has(node)) batch.adRoles.set(node, shouldSkipStronglyExcluded(node, readingRoots));
    return batch.adRoles.get(node);
  };
  const hasAuthoredAnchor = node => isReadingOwned(node, readingRoots) &&
    (node.matches('h1,h2,h3,h4,h5,h6') || node.matches('section') &&
      node.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6'));
  const hasExactRole = (node, role) => node.id.toLowerCase() === role ||
    Array.from(node.classList).some(name => name.toLowerCase() === role);
  if (element.closest(INTERFACE_REGIONS) || isPublisherLinkAction(element)) return true;
  const control = element.closest('button,[role="button"],input,select,textarea');
  if (control && !getAnnotationTarget(control)) {
    const figure = element.closest('figure');
    const authoredImage = tagName === 'img' && readingOwned && control.matches('button,[role="button"]') &&
      element.getAttribute('alt')?.trim() &&
      figure?.contains(control) && !element.closest('figcaption') &&
      Array.from(figure.querySelectorAll('figcaption')).some(caption => caption.closest('figure') === figure && caption.textContent?.trim());
    if (!authoredImage) return true;
  }
  const selectedMedia = readingRoots.some(root => root.matches('figure,img,picture,svg,canvas') &&
    (root === element || root.contains(element)));
  const illustrationAside = selectedIllustration ? element.closest('aside,[role~="complementary"]') : null;
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
  if (isInteractiveControlLabel(element, batch?.controlLabelIds)) return true;

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
  const hasPaywallLabel = PAYWALL_CLASSES.some(paywallClass => className.includes(paywallClass) || id.includes(paywallClass));
  const publicProse = hasPaywallLabel && isVisibleArticleProse(win, element, readingRoots, batch);
  if (hasPaywallLabel && !publicProse) {
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
  const exclusionRules = batch?.exclusionRules ?? compileClassExclusions(EXCLUDED_CLASSES);
  for (const { name: excluded, word: pattern } of exclusionRules) {
    if (publicProse && excluded === 'paywall') continue;
    if ((authoredHeading || selectedMedia || selectedInline) && ['header', 'article-section-title'].includes(excluded)) continue;
    if (selectedMedia && excluded === 'overlay') continue;
    if (excluded === 'ad' && !strongAdRole(element)) continue;
    const exactPanelId = id === excluded && !(authoredHeading && Array.from(element.ownerDocument.querySelectorAll(DOCUMENT_CONTENTS)).some(contents =>
      Array.from(contents.querySelectorAll('a[href*="#"]')).some(link => getDocumentFragmentTarget(link) === element)));
    if ((pattern.test(className) || exactPanelId || (pattern.test(id) && !hasAuthoredAnchor(element)) ||
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
      if (exclusionRules.some(({ name: excluded, role }) => {
        if ((authoredHeading || selectedMedia || selectedInline) && ['header', 'article-section-title'].includes(excluded)) return false;
        if (selectedMedia && excluded === 'overlay') return false;
        if (excluded === 'sidebar' && illustrationAside && parent.contains(illustrationAside)) return false;
        if (excluded === 'ad' && !strongAdRole(parent)) return false;
        if (excluded === 'next' || excluded === 'prev' || excluded === 'previous') {
          return parentClass.split(/\s+/).includes(excluded) || parentId === excluded;
        }
        const matchingRole = role.test(parentClass) || parentId === excluded ||
          (role.test(parentId) && !hasAuthoredAnchor(parent));
        if (!matchingRole || isEditorialLayoutLabel(parent, element, excluded) ||
            (excluded === 'sidebar' && isReferencedReadingAside(parent, readingRoots, tocRoots))) return false;
        if (excluded === 'overlay' && !parent.matches('aside,dialog,[role~="dialog"],[aria-modal="true"],[inert]') &&
            selectedFlows.some(root => parent.contains(root)) &&
            Array.from(parent.querySelectorAll('h1,[itemprop~="headline"]')).some(isDocumentHeadline)) return false;
        // A component's body wrapper can own the entire editorial flow.
        if (excluded === 'widget' && articleOwner && !parent.matches('aside,[role~="complementary"],form,[inert]') &&
            selectedFlows.some(root => articleOwner.contains(root))) {
          const bodyWrapper = articleOwner.contains(parent) &&
            /(?:^|\s)widget[-_]+(?:body|content)(?:$|\s)/.test(parentClass) &&
            !panelLabel.test(parentClass.replace(/(?:^|\s)widget[-_]+(?:body|content)(?=$|\s)/g, ' ')) &&
            selectedFlows.some(root => root !== parent && parent.contains(root));
          const articleWrapper = parent.childElementCount === 1 && parent.firstElementChild === articleOwner &&
            (articleOwner.querySelector('h1') || selectedFlows.some(root =>
              root.querySelectorAll('p').length >= 4 && root.textContent.trim().length >= 450));
          if (bodyWrapper || articleWrapper) return false;
        }
        const wrapsSelectedFlow = layoutRoles.includes(excluded) && !hasExactRole(parent, excluded) &&
          !panelLabel.test(parentClass + ' ' + parentId) &&
          !parent.matches('aside,header,form,[role~="complementary"],[role~="banner"],[inert]') &&
          selectedFlows.some(root => root !== parent && parent.contains(root));
        return !wrapsSelectedFlow;
      })) return true;
      
      const isClearAd = strongAdRole(parent);
      
      if (isClearAd || (parentTag === 'aside' && parent !== illustrationAside && !isReadingOwned(parent, readingRoots) && !isArticleContentFigure(win, element))) {
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
 * @param {Element[]} readingRoots - Roots selected for the current publication
 * @returns {boolean} - True if element should be strongly excluded
 */
export function shouldSkipStronglyExcluded(element, readingRoots = []) {
  const className = semanticClassNames(element);
  const id = (element.id || '').toLowerCase();
  const labels = [id, ...className.split(/\s+/)];
  const adLabel = /(?:^|[-_])(?:ads|advertisement|sponsor|sponsored|(?:paid|partner|promo)[-_]ad)(?:$|[-_])|^ad(?:$|[-_])/;
  if (labels.some(label => adLabel.test(label))) return true;
  if (!labels.some(label => /\bad\b/.test(label))) return false;
  const boundary = 'aside,form,button,nav,[role~="complementary"],[role~="navigation"],[hidden],[inert]';
  if (element.closest(boundary)) return true;
  // A compound label on an identified prose wrapper can name the page layout.
  const paragraphs = node => Array.from(node.querySelectorAll('p')).filter(paragraph =>
    !paragraph.closest(boundary) && (paragraph.textContent || '').trim().length >= 60);
  const prose = paragraphs(element);
  return prose.length < 2 || !readingRoots.some(root => root === element ||
    root.contains(element) && paragraphs(root).filter(paragraph => !element.contains(paragraph)).length <= 1);
}
