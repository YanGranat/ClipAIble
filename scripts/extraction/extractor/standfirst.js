// @ts-check
// Standfirst/subtitle extraction for extraction
// Extracts article standfirst/deck/subtitle text

import { cloneWithoutLinkAnnouncements } from './dom-utils.js';
import { STANDFIRST_SELECTORS } from '../constants/content-thresholds.js';
import { isOutsideArticleBody } from './discover.js';

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
      if (/(?:^|[\s_-])newsletter(?:$|[\s_-])/i.test(`${node.id} ${node.getAttribute('class') || ''}`)) return true;
      if (node === mainContent) break;
    }
    return false;
  };
  
  // Try standfirst selectors first
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      for (const element of Array.from(mainContent.querySelectorAll(selector))) {
        if (isNewsletterCandidate(element) || (selector.includes('excerpt') && isOutsideArticleBody(element, mainContent))) continue;
        const text = (cloneWithoutLinkAnnouncements(element).textContent || '').trim();
        // Valid standfirst: 50-500 characters
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  
  // Also check document-level
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      const element = document.querySelector(selector);
      if (element && mainContent.contains(element) && !isNewsletterCandidate(element) &&
          (!selector.includes('excerpt') || !isOutsideArticleBody(element, mainContent))) {
        const text = (cloneWithoutLinkAnnouncements(element).textContent || '').trim();
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) { }
  }
  
  return { text: null, element: null };
}

/**
 * Check if text matches standfirst text
 * Used to skip elements that duplicate standfirst
 * @param {string} text - Text to check
 * @param {string|null} standfirstText - Standfirst text to compare
 * @returns {boolean} - True if text matches standfirst
 */
export function isStandfirstText(text, standfirstText) {
  if (!standfirstText) return false;
  
  const normalizedText = text.trim().toLowerCase();
  const normalizedStandfirst = standfirstText.trim().toLowerCase();
  
  // Exact match
  if (normalizedText === normalizedStandfirst) return true;
  
  // One contains the other (allows for minor differences)
  if (normalizedText.includes(normalizedStandfirst) || normalizedStandfirst.includes(normalizedText)) {
    // But only if they're reasonably similar in length (within 20%)
    const lengthRatio = Math.min(normalizedText.length, normalizedStandfirst.length) / 
                        Math.max(normalizedText.length, normalizedStandfirst.length);
    if (lengthRatio > 0.8) return true;
  }
  
  return false;
}
