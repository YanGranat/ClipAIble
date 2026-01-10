// @ts-check
// Post-processing - final cleanup and validation
// Only removes empty elements - extracts text as-is without any modifications

/**
 * Post-process extracted elements
 * Removes empty elements only - extracts text exactly as it appears in PDF
 * 
 * @param {Array} elements - Elements to process
 * @returns {Array} Processed elements
 */
export function postProcessElements(elements) {
  // Validate input
  if (!elements || !Array.isArray(elements)) {
    return [];
  }
  
  if (elements.length === 0) {
    return [];
  }
  
  // Only remove empty elements - keep all content exactly as it appears in PDF
  return elements.filter(el => {
    if (!el || typeof el !== 'object') {
      return false;
    }
    
    if (el.type === 'paragraph' || el.type === 'heading') {
      return el.text && typeof el.text === 'string' && el.text.trim().length > 0;
    }
    
    if (el.type === 'list') {
      // List must have items or text
      return (el.items && Array.isArray(el.items) && el.items.length > 0) ||
             (el.text && typeof el.text === 'string' && el.text.trim().length > 0);
    }
    
    return true;
  });
}

