// @ts-check
// Metadata extraction functions for automatic extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Check if h1 looks like a valid article title (not site name)
 * @param {Element} h1Element - H1 element to check
 * @returns {boolean} True if h1 looks like a valid article title
 */
export function isValidArticleTitleModule(h1Element) {
  if (!h1Element || !h1Element.textContent) return false;
  const text = h1Element.textContent.trim();
  // Too short - likely not an article title
  if (text.length < 5) return false;
  // Common site/publication name patterns (very short, common words)
  const siteNamePatterns = ['home', 'about', 'contact', 'blog', 'news', 'archive'];
  const lowerText = text.toLowerCase();
  if (siteNamePatterns.some(pattern => lowerText === pattern)) return false;
  return true;
}

/**
 * Extract author name from profile URL
 * @param {string} url - Profile URL
 * @returns {string|null} Extracted author name or null
 */
export function extractAuthorFromUrlModule(url) {
  if (!url) return null;
  try {
    // Match patterns like /profile/susannarustin or /author/john-smith
    const profileMatch = url.match(/\/(?:profile|author)\/([^\/\?]+)/i);
    if (profileMatch) {
      const slug = profileMatch[1];
      
      // First, try splitting by common separators (hyphen, underscore)
      const parts = slug.split(/[-_]/);
      
      // If we have multiple parts, capitalize each
      if (parts.length > 1) {
        const name = parts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
        if (name.length > 2 && name.length < 100) {
          return name;
        }
      }
      
      // If single part, try to split by camelCase or find word boundaries
      const singlePart = parts[0];
      
      // Try camelCase: "johnSmith" -> ["john", "Smith"]
      const camelCaseMatch = singlePart.match(/^([a-z]+)([A-Z][a-z]*)$/);
      if (camelCaseMatch) {
        const name = [
          camelCaseMatch[1].charAt(0).toUpperCase() + camelCaseMatch[1].slice(1).toLowerCase(),
          camelCaseMatch[2].charAt(0).toUpperCase() + camelCaseMatch[2].slice(1).toLowerCase()
        ].join(' ');
        if (name.length > 2 && name.length < 100) {
          return name;
        }
      }
      
      // Try to split long lowercase strings by common name patterns
      // For example: "susannarustin" -> try to find where "susanna" ends
      if (singlePart.length > 6 && /^[a-z]+$/.test(singlePart)) {
        // Common first name endings that might indicate where to split
        const commonEndings = ['a', 'ia', 'na', 'ra', 'la', 'sa'];
        for (const ending of commonEndings) {
          if (singlePart.endsWith(ending) && singlePart.length > ending.length + 3) {
            const firstPart = singlePart.slice(0, -ending.length);
            const secondPart = singlePart.slice(-ending.length);
            // Check if both parts are reasonable lengths (3-15 chars each)
            if (firstPart.length >= 3 && firstPart.length <= 15 && 
                secondPart.length >= 3 && secondPart.length <= 15) {
              const name = [
                firstPart.charAt(0).toUpperCase() + firstPart.slice(1),
                secondPart.charAt(0).toUpperCase() + secondPart.slice(1)
              ].join(' ');
              if (name.length > 2 && name.length < 100) {
                return name;
              }
            }
          }
        }
        
        // Fallback: try splitting in the middle if it's very long
        if (singlePart.length > 10) {
          const mid = Math.floor(singlePart.length / 2);
          const firstPart = singlePart.slice(0, mid);
          const secondPart = singlePart.slice(mid);
          if (firstPart.length >= 3 && secondPart.length >= 3) {
            const name = [
              firstPart.charAt(0).toUpperCase() + firstPart.slice(1),
              secondPart.charAt(0).toUpperCase() + secondPart.slice(1)
            ].join(' ');
            if (name.length > 2 && name.length < 100) {
              return name;
            }
          }
        }
      }
      
      // Last resort: capitalize the whole thing as a single name
      const name = singlePart.charAt(0).toUpperCase() + singlePart.slice(1).toLowerCase();
      if (name.length > 2 && name.length < 100) {
        return name;
      }
    }
  } catch (e) {
    // Continue
  }
  return null;
}

/**
 * Get month number from month name (English)
 * @param {string} monthName - Month name
 * @returns {string|null} Month number as "MM" or null
 */
export function getMonthNumberModule(monthName) {
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
 * @param {string} dateStr - Date string in various formats
 * @param {import('../../types.js').GetMonthNumberFunction} getMonthNumber - Function to get month number from name
 * @returns {string|null} ISO date (YYYY-MM-DD, YYYY-MM, or YYYY) or null
 */
export function parseDateToISOModule(dateStr, getMonthNumber) {
  if (!dateStr) return null;
  
  // Already ISO format
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0]; // YYYY-MM-DD
  }
  
  // Try to parse with Date object
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Continue with regex parsing
  }
  
  // Try regex patterns for common formats
  // "31st Jul 2007" -> "2007-07-31"
  const ordinalMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
  if (ordinalMatch) {
    const day = ordinalMatch[1].padStart(2, '0');
    const monthName = ordinalMatch[2];
    const year = ordinalMatch[3];
    const month = getMonthNumber(monthName);
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }
  
  // "December 2025" -> "2025-12"
  const monthYearMatch = dateStr.match(/(\w+)\s+(\d{4})/i);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1];
    const year = monthYearMatch[2];
    const month = getMonthNumber(monthName);
    if (month) {
      return `${year}-${month}`;
    }
  }
  
  // "2025" -> "2025"
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch) {
    return yearMatch[1];
  }
  
  return null;
}


