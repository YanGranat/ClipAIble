// @ts-check
// Standfirst/subtitle extraction for extraction
// Extracts article standfirst/deck/subtitle text

import { cloneReadingContent, safeGetComputedStyle, INTERFACE_REGIONS } from './dom-utils.js';
import { STANDFIRST_SELECTORS } from '../constants/content-thresholds.js';
import { isOutsideArticleBody } from './discover.js';
import { isEditorialLayoutLabel } from './reading-context.js';

/**
 * Extract standfirst/subtitle from main content
 * @param {Element|null} mainContent - Main content element
 * @returns {{text: string|null, element: Element|null}} - Standfirst text and element
 */
export function extractStandfirst(mainContent) {
  if (!mainContent) {
    return { text: null, element: null };
  }
  const isNewsletterCandidate = element => {
    for (let node = element; node; node = node.parentElement) {
      if (/(?:^|[\s_-])newsletter(?:$|[\s_-])/i.test(`${node.id} ${node.getAttribute('class') || ''}`) &&
          !isEditorialLayoutLabel(node, element, 'newsletter')) return true;
      if (node === mainContent) break;
    }
    return false;
  };
  const isInlineCandidate = element => {
    if (element.closest(INTERFACE_REGIONS)) return false;
    if (!element.matches('p,div,span') || element.querySelector('h1,h2,h3,h4,h5,h6,p,div,ul,ol,menu,dl,dt,dd,table,pre,blockquote,figure,figcaption,img,picture,svg,canvas,iframe,video,audio,object,embed,details,summary,article,aside,section,header,footer,nav,main,form,hr,address,button,input,select,textarea')) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.matches('[hidden],[aria-hidden="true"],[inert]')) return false;
      if (node.tagName === 'DETAILS' && !node.hasAttribute('open')) return false;
      const style = safeGetComputedStyle(element.ownerDocument.defaultView, node);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    }
    return true;
  };
  
  // Try standfirst selectors first
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      const candidates = [...(mainContent.matches(selector) ? [mainContent] : []), ...Array.from(mainContent.querySelectorAll(selector))];
      for (const element of candidates) {
        if (!isInlineCandidate(element) || isNewsletterCandidate(element) || (selector.includes('excerpt') && isOutsideArticleBody(element, mainContent))) continue;
        const text = (cloneReadingContent(element).textContent || '').trim();
        // Valid standfirst: 50-500 characters
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  
  return { text: null, element: null };
}
