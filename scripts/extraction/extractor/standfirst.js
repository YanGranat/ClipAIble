// @ts-check
// Standfirst/subtitle extraction for extraction
// Extracts article standfirst/deck/subtitle text

import { looksLikeArticleStarter } from './text-utils.js';

/**
 * Standfirst selectors to search for
 */
const STANDFIRST_SELECTORS = [
  '.standfirst', '.subtitle', '.deck', '.lede', '.intro', '.article__subhead',
  '[class*="standfirst"]', '[class*="subtitle"]', '[class*="deck"]',
  '[class*="intro"]', '[class*="summary"]', '[class*="subhead"]'
];

/**
 * Extract standfirst/subtitle from main content
 * @param {Element|null} mainContent - Main content element
 * @returns {{text: string|null, element: Element|null}} - Standfirst text and element
 */
export function extractStandfirst(mainContent) {
  if (!mainContent) {
    return { text: null, element: null };
  }
  
  // Try standfirst selectors first
  for (const selector of STANDFIRST_SELECTORS) {
    try {
      const element = mainContent.querySelector(selector);
      if (element) {
        const text = (element.textContent || '').trim();
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
      if (element && mainContent.contains(element)) {
        const text = (element.textContent || '').trim();
        if (text.length >= 50 && text.length <= 500) {
          return { text, element };
        }
      }
    } catch (e) { }
  }
  
  // Fallback: first paragraph that meets criteria
  const paragraphs = mainContent.querySelectorAll('p');
  for (const p of paragraphs) {
    const text = (p.textContent || '').trim();
    
    // Valid standfirst paragraph criteria:
    // - Length between 50-200 characters
    // - No links (standfirst usually doesn't have inline links)
    // - Doesn't look like a typical article starter
    if (text.length >= 50 && text.length <= 200) {
      const hasLinks = p.querySelectorAll('a').length > 0;
      if (!hasLinks && !looksLikeArticleStarter(text)) {
        // Check if it's actually a standfirst by looking at position
        // Standfirst is usually early in the content
        const allParagraphs = Array.from(paragraphs);
        const index = allParagraphs.indexOf(p);
        
        // Must be in first 3 paragraphs
        if (index <= 2) {
          // Check if it looks like a summary (often starts with capital, not common article starters)
          const firstWord = text.split(/\s+/)[0].toLowerCase();
          const commonStarters = ['the', 'a', 'an', 'in', 'on', 'when', 'where', 'why', 'how'];
          
          if (!commonStarters.includes(firstWord)) {
            return { text, element: p };
          }
        }
      }
    }
    
    // Stop checking after first few paragraphs
    const allParagraphs = Array.from(paragraphs);
    if (allParagraphs.indexOf(p) > 3) break;
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
