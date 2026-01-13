// @ts-check
// Metadata extraction functions for extraction
// Extracts title, author, and publication date from page

import { cleanHeadingText } from './text-utils.js';

/**
 * Check if h1 looks like a valid article title (not site name)
 * @param {Element} h1Element - H1 element to check
 * @returns {boolean} - True if h1 is valid article title
 */
export function isValidArticleTitle(h1Element) {
  if (!h1Element || !h1Element.textContent) return false;
  const text = (h1Element.textContent || '').trim();
  if (text.length < 5) return false;
  
  const siteNamePatterns = ['home', 'about', 'contact', 'blog', 'news', 'archive'];
  const lowerText = text.toLowerCase();
  if (siteNamePatterns.some(pattern => lowerText === pattern)) return false;
  
  return true;
}

/**
 * Extract author name from profile URL
 * @param {string} url - Profile URL
 * @returns {string|null} - Extracted author name or null
 */
export function extractAuthorFromUrl(url) {
  if (!url) return null;
  try {
    const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
    if (profileMatch) {
      const slug = profileMatch[1];
      const parts = slug.split(/[-_]/);
      
      if (parts.length > 1) {
        const name = parts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
        if (name.length > 2 && name.length < 100) return name;
      }
      
      // Try camelCase
      const camelCaseMatch = slug.match(/^([a-z]+)([A-Z][a-z]*)$/);
      if (camelCaseMatch) {
        const name = [
          camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
          camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
        ].join(' ');
        if (name.length > 2 && name.length < 100) return name;
      }
      
      // Capitalize as single name
      const name = slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase();
      if (name.length > 2 && name.length < 100) return name;
    }
  } catch (e) { }
  return null;
}

/**
 * Get month number from month name
 * @param {string} monthName - Month name (English)
 * @returns {string|null} - Month number as "MM" or null
 */
export function getMonthNumber(monthName) {
  const months = {
    'january': '01', 'jan': '01',
    'february': '02', 'feb': '02',
    'march': '03', 'mar': '03',
    'april': '04', 'apr': '04',
    'may': '05',
    'june': '06', 'jun': '06',
    'july': '07', 'jul': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
  };
  return months[monthName.toLowerCase()] || null;
}

/**
 * Parse various date formats to ISO format
 * @param {string} dateStr - Date string
 * @returns {string|null} - ISO date (YYYY-MM-DD, YYYY-MM, or YYYY) or null
 */
export function parseDateToISO(dateStr) {
  if (!dateStr) return null;
  
  // Already ISO format
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  
  // Try Date object
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) { }
  
  // Ordinal format: "31st Jul 2007"
  const ordinalMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
  if (ordinalMatch) {
    const day = ordinalMatch[1].padStart(2, '0');
    const month = getMonthNumber(ordinalMatch[2]);
    const year = ordinalMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }
  
  // Month year: "December 2025"
  const monthYearMatch = dateStr.match(/(\w+)\s+(\d{4})/i);
  if (monthYearMatch) {
    const month = getMonthNumber(monthYearMatch[1]);
    const year = monthYearMatch[2];
    if (month) return `${year}-${month}`;
  }
  
  // Year only: "2025"
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch) return yearMatch[1];
  
  return null;
}

/**
 * Extract metadata (title, author, date) from document
 * @param {Document} doc - Document object
 * @param {string} baseUrl - Base URL
 * @returns {{title: string, author: string, publishDate: string}} - Metadata object
 */
export function extractMetadata(doc, baseUrl) {
  const metadata = {
    title: '',
    author: '',
    publishDate: ''
  };
  
  // Title extraction - prioritized order
  // 1. h1 inside article
  const h1InArticle = doc.querySelector('article h1');
  if (h1InArticle && isValidArticleTitle(h1InArticle)) {
    metadata.title = cleanHeadingText(h1InArticle.textContent || '');
  }
  
  // 2. h1 inside main
  if (!metadata.title) {
    const h1InMain = doc.querySelector('main h1');
    if (h1InMain && isValidArticleTitle(h1InMain)) {
      metadata.title = cleanHeadingText(h1InMain.textContent || '');
    }
  }
  
  // 3. First h1
  if (!metadata.title) {
    const firstH1 = doc.querySelector('h1');
    if (firstH1 && isValidArticleTitle(firstH1)) {
      metadata.title = cleanHeadingText(firstH1.textContent || '');
    }
  }
  
  // 4. Fallback to document.title
  if (!metadata.title) {
    metadata.title = doc.title || '';
  }
  
  // Author extraction
  const authorSelectors = [
    'meta[name="author"]',
    'meta[name="citation_author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    '.author', '.byline', '.meta-author',
    '[itemprop="author"]',
    'a[rel="author"]',
    'a[href*="/author/"]',
    'a[href*="/profile/"]'
  ];
  
  for (const selector of authorSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        let authorText = '';
        
        if (element.tagName === 'META') {
          authorText = element.getAttribute('content') || '';
        } else {
          authorText = (element.textContent || '').trim();
        }
        
        // Clean "By " prefix
        authorText = authorText.replace(/^by\s+/i, '').trim();
        
        // Skip if looks like URL
        if (authorText && !authorText.startsWith('http') && authorText.length < 100) {
          metadata.author = authorText;
          break;
        }
        
        // Try to extract from href
        if (element.tagName === 'A') {
          const href = element.getAttribute('href') || '';
          const extracted = extractAuthorFromUrl(href);
          if (extracted) {
            metadata.author = extracted;
            break;
          }
        }
      }
    } catch (e) { }
  }
  
  // Date extraction
  const dateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[name="date"]',
    'meta[name="citation_date"]',
    'time[datetime]',
    'time[pubdate]',
    '[itemprop="datePublished"]',
    '.published', '.date', '.meta-date'
  ];
  
  for (const selector of dateSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        let dateValue = '';
        
        if (element.tagName === 'META') {
          dateValue = element.getAttribute('content') || '';
        } else if (element.tagName === 'TIME') {
          dateValue = element.getAttribute('datetime') || element.textContent || '';
        } else {
          dateValue = (element.textContent || '').trim();
        }
        
        const parsed = parseDateToISO(dateValue);
        if (parsed) {
          metadata.publishDate = parsed;
          break;
        }
      }
    } catch (e) { }
  }
  
  return metadata;
}
