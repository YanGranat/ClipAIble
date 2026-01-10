// @ts-check
// PDF date parsing utility

// @ts-ignore - Module resolution issue, but file exists at runtime
import { logWarn } from '../../../../utils/logging.js';

/**
 * Parse PDF date string to ISO format
 * @param {string} pdfDate - PDF date string
 * @returns {string} ISO date string or empty string
 */
export function parsePdfDate(pdfDate) {
  if (!pdfDate || typeof pdfDate !== 'string') {
    return '';
  }
  
  try {
    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm
    const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-]\d{2})?'?(\d{2})?'?/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month}-${day}`;
    }
    
    // Fallback: try standard Date parsing
    const date = new Date(pdfDate);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (error) {
    logWarn('[PDF v3] Failed to parse PDF date', { pdfDate, error });
  }
  
  return '';
}

